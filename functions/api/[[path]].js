import bcrypt from 'bcryptjs';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const fail = (message, status = 400) => json({ error: message }, status);
const readBody = async request => { try { return await request.json(); } catch { return {}; } };
const clean = value => typeof value === 'string' ? value.trim() : '';
const validRole = value => ['user', 'admin'].includes(value);

function sessionToken(request) {
  return request.headers.get('Cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith('portfolio_session='))?.slice('portfolio_session='.length);
}
async function currentUser(request, env) {
  const token = sessionToken(request);
  if (!token) return null;
  const row = await env.myd1db.prepare(`SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`).bind(token).first();
  if (!row) return null;
  return row;
}
async function requireUser(request, env) { const user = await currentUser(request, env); if (!user) throw Object.assign(new Error('Authentication required.'), { status: 401 }); return user; }
async function requireMember(request, env) { const user = await requireUser(request, env); if (!validRole(user.role)) throw Object.assign(new Error('Guest mode is available from the login menu only.'), { status: 403 }); return user; }
async function requireAdmin(request, env) { const user = await requireUser(request, env); if (user.role !== 'admin') throw Object.assign(new Error('Administrator access required.'), { status: 403 }); return user; }
const changed = result => result.meta?.changes > 0;

// Current UTC timestamp in YYYYMMDDHH24MISS format (e.g. 20260815103045)
function nowStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}
// Date part (YYYYMMDD) of a YYYYMMDDHH24MISS stamp
function stampDay(stamp) { return stamp ? String(stamp).slice(0, 8) : ''; }

function assetsStatement(db) {
  return db.prepare(`SELECT a.id, a.name, a.symbol, a.type, a.price, a.coin,
    d.dividend_yield, GROUP_CONCAT(DISTINCT dpm.month_paid) AS payment_months
    FROM assets a LEFT JOIN dividends d ON d.asset_id = a.id
    LEFT JOIN dividend_payment_months dpm ON dpm.asset_id = a.id
    GROUP BY a.id ORDER BY COALESCE(a.symbol, a.name)`);
}
function normalizeAssets(items) { return items.map(item => ({ ...item, payment_months: item.payment_months ? item.payment_months.split(',').map(Number).sort((a, b) => a - b) : [] })); }

// Personal assets are scoped to a user and flagged so the frontend can render
// their display name in [] and apply the right permissions. They use their real
// positive id; the is_personal flag distinguishes them from platform assets.
function personalAssetsStatement(db, userId) {
  return db.prepare(`SELECT id, name, symbol, type, price, coin, user_id,
    NULL AS dividend_yield, NULL AS payment_months, 1 AS is_personal
    FROM personal_assets WHERE user_id = ? ORDER BY COALESCE(symbol, name)`).bind(userId);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.myd1db) return fail('D1 binding "myd1db" is not configured.', 500);
  const path = new URL(request.url).pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = request.method;
  try {
    if (method === 'POST' && path === 'auth/login') {
      const { username, password } = await readBody(request);
      const user = await env.myd1db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').bind(clean(username)).first();
      if (!user || !validRole(user.role) || !(await bcrypt.compare(String(password || ''), user.password_hash))) return fail('Invalid username or password.', 401);
      const token = crypto.randomUUID();
      await env.myd1db.batch([
        env.myd1db.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
        env.myd1db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))").bind(token, user.id),
        env.myd1db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id)
      ]);
      return json({ user: { id: user.id, username: user.username, role: user.role } }, 200, { 'set-cookie': `portfolio_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800` });
    }
    if (method === 'POST' && path === 'auth/logout') {
      const token = sessionToken(request); if (token) await env.myd1db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      return json({ ok: true }, 200, { 'set-cookie': 'portfolio_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (method === 'GET' && path === 'auth/me') { const user = await requireUser(request, env); return json({ user }); }

    if (method === 'GET' && path === 'assets') {
      const user = await requireMember(request, env);
      const platform = normalizeAssets((await assetsStatement(env.myd1db).all()).results);
      const personal = normalizeAssets((await personalAssetsStatement(env.myd1db, user.id).all()).results);
      const items = [...platform, ...personal].sort((a, b) => (a.symbol || a.name).localeCompare(b.symbol || b.name));
      return json({ items });
    }
    if (method === 'POST' && path === 'assets') {
      await requireAdmin(request, env);
      const body = await readBody(request);
      const name = clean(body.name), symbol = clean(body.symbol).toUpperCase() || null, type = clean(body.type);
      const price = body.price === null || body.price === undefined || body.price === '' ? null : Number(body.price);
      const coin = clean(body.coin) || 'USD';
      const dividendYield = body.dividend_yield === null || body.dividend_yield === undefined || body.dividend_yield === '' ? null : Number(body.dividend_yield);
      let months = [];
      if (Array.isArray(body.payment_months)) {
        months = body.payment_months.map(Number).filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
      } else if (typeof body.payment_months === 'string' && body.payment_months.trim()) {
        months = body.payment_months.split(/[,|]/).map(m => Number(m.trim())).filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
      }
      if (!name || name.length > 50 || !['stock', 'bond', 'etf', 'cfd', 'commodity'].includes(type)) return fail('Provide a valid asset name (up to 50 characters) and type (stock, bond, etf, cfd, commodity).');

      const result = await env.myd1db.prepare('INSERT INTO assets (name, symbol, type, price, coin) VALUES (?, ?, ?, ?, ?)').bind(name, symbol, type, price, coin).run();
      const assetId = result.meta.last_row_id;

      const statements = [];
      if (dividendYield !== null && Number.isFinite(dividendYield)) {
        statements.push(env.myd1db.prepare("INSERT INTO dividends (asset_id, dividend_yield) VALUES (?, ?) ON CONFLICT(asset_id) DO UPDATE SET dividend_yield = excluded.dividend_yield").bind(assetId, dividendYield));
      }
      if (months.length > 0) {
        months.forEach(m => {
          statements.push(env.myd1db.prepare("INSERT OR IGNORE INTO dividend_payment_months (asset_id, month_paid) VALUES (?, ?)").bind(assetId, m));
        });
      }
      if (statements.length > 0) {
        await env.myd1db.batch(statements);
      }
      return json({ id: assetId, ok: true }, 201);
    }
    if ((method === 'PUT' || method === 'PATCH') && /^assets\/\d+$/.test(path)) {
      await requireAdmin(request, env);
      const id = Number(path.split('/')[1]);
      const body = await readBody(request);
      const name = clean(body.name), symbol = clean(body.symbol).toUpperCase() || null, type = clean(body.type);
      const price = body.price === null || body.price === undefined || body.price === '' ? null : Number(body.price);
      const coin = clean(body.coin) || 'USD';
      const dividendYield = body.dividend_yield === null || body.dividend_yield === undefined || body.dividend_yield === '' ? null : Number(body.dividend_yield);
      let months = [];
      if (Array.isArray(body.payment_months)) {
        months = body.payment_months.map(Number).filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
      } else if (typeof body.payment_months === 'string' && body.payment_months.trim()) {
        months = body.payment_months.split(/[,|]/).map(m => Number(m.trim())).filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
      }
      if (!name || name.length > 50 || !['stock', 'bond', 'etf', 'cfd', 'commodity'].includes(type)) return fail('Provide a valid asset name (up to 50 characters) and type (stock, bond, etf, cfd, commodity).');

      const updateRes = await env.myd1db.prepare('UPDATE assets SET name = ?, symbol = ?, type = ?, price = ?, coin = ? WHERE id = ?').bind(name, symbol, type, price, coin, id).run();
      if (!changed(updateRes)) return fail('Asset not found.', 404);

      const statements = [];
      if (dividendYield !== null && Number.isFinite(dividendYield)) {
        statements.push(env.myd1db.prepare("INSERT INTO dividends (asset_id, dividend_yield) VALUES (?, ?) ON CONFLICT(asset_id) DO UPDATE SET dividend_yield = excluded.dividend_yield").bind(id, dividendYield));
      }
      if (months.length >= 0) {
        statements.push(env.myd1db.prepare("DELETE FROM dividend_payment_months WHERE asset_id = ?").bind(id));
        months.forEach(m => {
          statements.push(env.myd1db.prepare("INSERT OR IGNORE INTO dividend_payment_months (asset_id, month_paid) VALUES (?, ?)").bind(id, m));
        });
      }
      if (statements.length > 0) {
        await env.myd1db.batch(statements);
      }
      return json({ ok: true });
    }
    if (method === 'DELETE' && /^assets\/\d+$/.test(path)) {
      await requireAdmin(request, env);
      const id = Number(path.split('/')[1]);
      await env.myd1db.batch([
        env.myd1db.prepare('DELETE FROM account_holdings WHERE asset_id = ?').bind(id),
        env.myd1db.prepare('DELETE FROM dividends WHERE asset_id = ?').bind(id),
        env.myd1db.prepare('DELETE FROM dividend_payment_months WHERE asset_id = ?').bind(id),
        env.myd1db.prepare('DELETE FROM assets WHERE id = ?').bind(id)
      ]);
      return json({ ok: true });
    }
    // --- Personal assets (per-user, both admin and user can create) ---
    if (method === 'POST' && path === 'personal-assets') {
      const user = await requireMember(request, env);
      const body = await readBody(request);
      const name = clean(body.name), symbol = clean(body.symbol).toUpperCase() || null, type = clean(body.type);
      const price = body.price === null || body.price === undefined || body.price === '' ? null : Number(body.price);
      const coin = clean(body.coin) || 'USD';
      if (!name || name.length > 50 || !['stock', 'bond', 'etf', 'cfd', 'commodity'].includes(type)) return fail('Provide a valid asset name (up to 50 characters) and type (stock, bond, etf, cfd, commodity).');
      const result = await env.myd1db.prepare('INSERT INTO personal_assets (user_id, name, symbol, type, price, coin) VALUES (?, ?, ?, ?, ?, ?)').bind(user.id, name, symbol, type, price, coin).run();
      return json({ id: result.meta.last_row_id, ok: true }, 201);
    }
    if ((method === 'PUT' || method === 'PATCH') && /^personal-assets\/\d+$/.test(path)) {
      const user = await requireMember(request, env);
      const id = Number(path.split('/')[1]);
      const body = await readBody(request);
      const name = clean(body.name), symbol = clean(body.symbol).toUpperCase() || null, type = clean(body.type);
      const price = body.price === null || body.price === undefined || body.price === '' ? null : Number(body.price);
      const coin = clean(body.coin) || 'USD';
      if (!name || name.length > 50 || !['stock', 'bond', 'etf', 'cfd', 'commodity'].includes(type)) return fail('Provide a valid asset name (up to 50 characters) and type (stock, bond, etf, cfd, commodity).');
      const owner = await env.myd1db.prepare('SELECT id FROM personal_assets WHERE id = ? AND (user_id = ? OR ? = ?)').bind(id, user.id, user.role, 'admin').first();
      if (!owner) return fail('Personal asset not found.', 404);
      const updateRes = await env.myd1db.prepare('UPDATE personal_assets SET name = ?, symbol = ?, type = ?, price = ?, coin = ? WHERE id = ?').bind(name, symbol, type, price, coin, id).run();
      if (!changed(updateRes)) return fail('Failed to update personal asset.', 500);
      return json({ ok: true });
    }
    if (method === 'DELETE' && /^personal-assets\/\d+$/.test(path)) {
      const user = await requireMember(request, env);
      const id = Number(path.split('/')[1]);
      const result = await env.myd1db.prepare('DELETE FROM personal_assets WHERE id = ? AND (user_id = ? OR ? = ?)').bind(id, user.id, user.role, 'admin').run();
      if (!changed(result)) return fail('Personal asset not found.', 404);
      return json({ ok: true });
    }
    if (method === 'POST' && /^assets\/\d+\/price$/.test(path)) {
      await requireAdmin(request, env);
      const id = Number(path.split('/')[1]);
      const asset = await env.myd1db.prepare('SELECT id, symbol, coin FROM assets WHERE id = ?').bind(id).first();
      if (!asset) return fail('Asset not found.', 404);
      if (!asset.symbol) return fail('This asset has no symbol to look up.', 400);
      const apiKey = env.STOCK_API_KEY;
      if (!apiKey) return fail('STOCK_API_KEY not configured in environment variables.', 500);

      const url = `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(asset.symbol)}/prev?apiKey=${encodeURIComponent(apiKey)}`;
      let response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      } catch (error) {
        return fail('Massive API request timed out.', 504);
      }
      if (!response.ok) return fail(`Massive API returned ${response.status}.`, 502);
      const data = await response.json();
      const results = Array.isArray(data?.results) ? data.results[0] : data?.results;
      const price = results?.c ?? null;
      if (price == null) return fail('No price returned for this asset.', 404);
      return json({ price, coin: asset.coin || 'USD', raw: data });
    }
    if (method === 'GET' && path === 'dividends') { await requireMember(request, env); return json({ items: normalizeAssets((await assetsStatement(env.myd1db).all()).results).filter(item => item.dividend_yield !== null || item.payment_months.length) }); }

    if (method === 'GET' && path === 'providers') {
      const user = await requireMember(request, env);
      const { results } = await env.myd1db.prepare(`SELECT p.id, p.name, p.type, p.created_at, COUNT(a.id) AS account_count FROM providers p LEFT JOIN accounts a ON a.provider_id = p.id WHERE p.user_id = ? GROUP BY p.id ORDER BY p.name`).bind(user.id).all();
      return json({ items: results });
    }
    if (method === 'POST' && path === 'providers') {
      const user = await requireMember(request, env), body = await readBody(request), name = clean(body.name), type = clean(body.type);
      if (!name || name.length > 100 || !['bank', 'broker', 'other'].includes(type)) return fail('Provide a valid provider name and type.');
      const result = await env.myd1db.prepare('INSERT INTO providers (user_id, name, type) VALUES (?, ?, ?)').bind(user.id, name, type).run();
      return json({ id: result.meta.last_row_id }, 201);
    }
    if (method === 'DELETE' && /^providers\/\d+$/.test(path)) {
      const user = await requireMember(request, env), id = Number(path.split('/')[1]);
      if (!changed(await env.myd1db.prepare('DELETE FROM providers WHERE id = ? AND user_id = ?').bind(id, user.id).run())) return fail('Provider not found.', 404);
      return json({ ok: true });
    }

    if (method === 'GET' && path === 'accounts') {
      const user = await requireMember(request, env);
      const { results } = await env.myd1db.prepare(`SELECT a.*, p.name AS provider_name FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE p.user_id = ? ORDER BY p.name, a.name`).bind(user.id).all();
      return json({ items: results });
    }
    if (method === 'POST' && path === 'accounts') {
      const user = await requireMember(request, env), body = await readBody(request);
      const accountId = body.account_id ? Number(body.account_id) : null;
      const providerId = Number(body.provider_id), name = clean(body.name), type = clean(body.type);
      const balance = body.balance === null ? null : Number(body.balance), rate = body.interest_rate === null ? null : Number(body.interest_rate);
      const coin = clean(body.coin) || 'USD';
      const finishDate = type === 'loan' ? clean(body.finish_date) : null;
      if (!Number.isInteger(providerId) || !name || name.length > 100 || !['loan', 'interest_account', 'bank_account', 'asset_account'].includes(type) || (balance !== null && !Number.isFinite(balance)) || (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) || (finishDate !== null && !/^\d{8}$/.test(finishDate))) return fail('Provide valid account details.');
      const owner = await env.myd1db.prepare('SELECT id FROM providers WHERE id = ? AND user_id = ?').bind(providerId, user.id).first(); if (!owner) return fail('Provider not found.', 404);

      if (accountId && Number.isInteger(accountId)) {
        // Update existing account
        const existing = await env.myd1db.prepare('SELECT a.id FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE a.id = ? AND p.user_id = ?').bind(accountId, user.id).first();
        if (!existing) return fail('Account not found.', 404);
        const updateRes = await env.myd1db.prepare('UPDATE accounts SET provider_id = ?, name = ?, type = ?, balance = ?, interest_rate = ?, coin = ?, finish_date = ? WHERE id = ?').bind(providerId, name, type, type === 'asset_account' ? null : balance, rate, coin, finishDate, accountId).run();
        if (!changed(updateRes)) return fail('Failed to update account.', 500);
        return json({ id: accountId, ok: true });
      } else {
        // Create new account
        const result = await env.myd1db.prepare('INSERT INTO accounts (provider_id, name, type, balance, interest_rate, coin, finish_date) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(providerId, name, type, type === 'asset_account' ? null : balance, rate, coin, finishDate).run();
        return json({ id: result.meta.last_row_id }, 201);
      }
    }
    if ((method === 'PUT' || method === 'PATCH') && /^accounts\/\d+$/.test(path)) {
      const user = await requireMember(request, env), id = Number(path.split('/')[1]), body = await readBody(request);
      const providerId = Number(body.provider_id), name = clean(body.name), type = clean(body.type);
      const balance = body.balance === null ? null : Number(body.balance), rate = body.interest_rate === null ? null : Number(body.interest_rate);
      const coin = clean(body.coin) || 'USD';
      const finishDate = type === 'loan' ? clean(body.finish_date) : null;
      if (!Number.isInteger(providerId) || !name || name.length > 100 || !['loan', 'interest_account', 'bank_account', 'asset_account'].includes(type) || (balance !== null && !Number.isFinite(balance)) || (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) || (finishDate !== null && !/^\d{8}$/.test(finishDate))) return fail('Provide valid account details.');
      const owner = await env.myd1db.prepare('SELECT id FROM providers WHERE id = ? AND user_id = ?').bind(providerId, user.id).first(); if (!owner) return fail('Provider not found.', 404);
      const existing = await env.myd1db.prepare('SELECT a.id FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE a.id = ? AND p.user_id = ?').bind(id, user.id).first();
      if (!existing) return fail('Account not found.', 404);
      const updateRes = await env.myd1db.prepare('UPDATE accounts SET provider_id = ?, name = ?, type = ?, balance = ?, interest_rate = ?, coin = ?, finish_date = ? WHERE id = ?').bind(providerId, name, type, type === 'asset_account' ? null : balance, rate, coin, finishDate, id).run();
      if (!changed(updateRes)) return fail('Failed to update account.', 500);
      return json({ ok: true });
    }
    if (method === 'DELETE' && /^accounts\/\d+$/.test(path)) {
      const user = await requireMember(request, env), id = Number(path.split('/')[1]);
      const result = await env.myd1db.prepare('DELETE FROM accounts WHERE id = ? AND EXISTS (SELECT 1 FROM providers p WHERE p.id = accounts.provider_id AND p.user_id = ?)').bind(id, user.id).run();
      if (!changed(result)) return fail('Account not found.', 404); return json({ ok: true });
    }

    if (method === 'GET' && path === 'holdings') {
      const user = await requireMember(request, env);
      const { results } = await env.myd1db.prepare(`SELECT h.id, h.account_id, h.asset_id, h.personal_asset_id, h.quantity, h.purchase_price, a.name AS account_name,
        COALESCE(s.name, ps.name) AS asset_name, COALESCE(s.symbol, ps.symbol) AS symbol, COALESCE(s.price, ps.price) AS price, COALESCE(s.coin, ps.coin) AS coin
        FROM account_holdings h JOIN accounts a ON a.id = h.account_id JOIN providers p ON p.id = a.provider_id
        LEFT JOIN assets s ON s.id = h.asset_id
        LEFT JOIN personal_assets ps ON ps.id = h.personal_asset_id
        WHERE p.user_id = ? ORDER BY a.name, asset_name`).bind(user.id).all();
      // asset_id is set to the id the frontend should look up in state.assets
      // (the personal_asset_id for personal holdings, the asset_id otherwise),
      // and is_personal flags which kind it is so the frontend can render it.
      const items = results.map(h => ({
        ...h,
        asset_id: h.personal_asset_id != null ? h.personal_asset_id : h.asset_id,
        is_personal: h.personal_asset_id != null ? 1 : 0
      }));
      return json({ items });
    }
    if (method === 'POST' && path === 'holdings') {
      const user = await requireMember(request, env), body = await readBody(request), accountId = Number(body.account_id), quantity = Number(body.quantity), purchasePrice = body.purchase_price === null ? null : Number(body.purchase_price);
      // A holding references either a platform asset (asset_id) or a personal
      // asset (personal_asset_id). The frontend sends the real positive asset_id
      // plus an is_personal flag to say which kind it is.
      const rawAssetId = Number(body.asset_id);
      const isPersonal = body.is_personal === 1 || body.is_personal === true;
      const assetId = isPersonal ? null : rawAssetId;
      const personalAssetId = isPersonal ? rawAssetId : null;
      if (!Number.isInteger(accountId) || !Number.isFinite(quantity) || quantity <= 0 || (purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0))) return fail('Provide valid holding details.');
      const account = await env.myd1db.prepare(`SELECT a.id FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE a.id = ? AND a.type = 'asset_account' AND p.user_id = ?`).bind(accountId, user.id).first();
      if (!account) return fail('Asset account not found.', 404);
      // Editing an existing holding: update the specific row (ownership-checked)
      // instead of upserting, so changing quantity/price never duplicates it.
      const holdingId = body.holding_id ? Number(body.holding_id) : null;
      if (holdingId) {
        const existing = await env.myd1db.prepare(`SELECT h.id FROM account_holdings h JOIN accounts a ON a.id = h.account_id JOIN providers p ON p.id = a.provider_id WHERE h.id = ? AND p.user_id = ?`).bind(holdingId, user.id).first();
        if (!existing) return fail('Holding not found.', 404);
        await env.myd1db.prepare(`UPDATE account_holdings SET account_id = ?, asset_id = ?, personal_asset_id = ?, quantity = ?, purchase_price = ? WHERE id = ?`).bind(accountId, assetId, personalAssetId, quantity, purchasePrice, holdingId).run();
        return json({ ok: true }, 200);
      }
      if (isPersonal) {
        const personal = await env.myd1db.prepare('SELECT id FROM personal_assets WHERE id = ? AND user_id = ?').bind(personalAssetId, user.id).first();
        if (!personal) return fail('Personal asset not found.', 404);
        await env.myd1db.prepare(`INSERT INTO account_holdings (account_id, personal_asset_id, quantity, purchase_price) VALUES (?, ?, ?, ?)
          ON CONFLICT(account_id, asset_id, personal_asset_id) DO UPDATE SET quantity = excluded.quantity, purchase_price = excluded.purchase_price`).bind(accountId, personalAssetId, quantity, purchasePrice).run();
      } else {
        const asset = await env.myd1db.prepare('SELECT id FROM assets WHERE id = ?').bind(assetId).first();
        if (!asset) return fail('Asset not found.', 404);
        await env.myd1db.prepare(`INSERT INTO account_holdings (account_id, asset_id, quantity, purchase_price) VALUES (?, ?, ?, ?)
          ON CONFLICT(account_id, asset_id, personal_asset_id) DO UPDATE SET quantity = excluded.quantity, purchase_price = excluded.purchase_price`).bind(accountId, assetId, quantity, purchasePrice).run();
      }
      return json({ ok: true }, 201);
    }
    if (method === 'DELETE' && /^holdings\/\d+$/.test(path)) {
      const user = await requireMember(request, env), id = Number(path.split('/')[1]);
      const result = await env.myd1db.prepare('DELETE FROM account_holdings WHERE id = ? AND EXISTS (SELECT 1 FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE a.id = account_holdings.account_id AND p.user_id = ?)').bind(id, user.id).run();
      if (!changed(result)) return fail('Holding not found.', 404); return json({ ok: true });
    }

    if (method === 'GET' && path === 'goals') {
      const user = await requireMember(request, env);
      const { results } = await env.myd1db.prepare('SELECT id, goal_name, value, coin, sub1, sub2, sub3, order_by FROM goals WHERE user_id = ? ORDER BY order_by ASC, id ASC').bind(user.id).all();
      const items = [];
      for (const g of results) {
        const links = await env.myd1db.prepare('SELECT account_id FROM goal_link WHERE goal_id = ?').bind(g.id).all();
        items.push({ ...g, account_ids: links.results.map(l => l.account_id) });
      }
      return json({ items });
    }
    if (method === 'POST' && path === 'goals') {
      const user = await requireMember(request, env), body = await readBody(request);
      const goalId = body.goal_id ? Number(body.goal_id) : null;
      const goalName = clean(body.goal_name), value = Number(body.value), coin = clean(body.coin) || 'USD';
      if (!goalName || goalName.length > 200 || !Number.isFinite(value) || value < 0) return fail('Provide a valid goal name and value.');
      const sub1 = body.sub1 === null || body.sub1 === undefined || body.sub1 === '' ? null : Number(body.sub1);
      const sub2 = body.sub2 === null || body.sub2 === undefined || body.sub2 === '' ? null : Number(body.sub2);
      const sub3 = body.sub3 === null || body.sub3 === undefined || body.sub3 === '' ? null : Number(body.sub3);
      const subs = [sub1, sub2, sub3];
      for (const s of subs) {
        if (s !== null && !Number.isFinite(s)) return fail('Sub-goals must be valid numbers.');
      }
      if (value === 0) {
        // Debt goal: sub-goals must be negative.
        if (subs.some(s => s !== null && s >= 0)) return fail('For a debt-clearing goal, sub-goals must be negative.');
      } else {
        // Positive goal: sub-goals must be positive, < target, and ascending.
        let prev = 0;
        for (const s of subs) {
          if (s === null) continue;
          if (s <= 0 || s >= value || s <= prev) return fail('Sub-goals must be positive, less than the target, and in ascending order.');
          prev = s;
        }
      }
      if (sub2 !== null && sub1 === null) return fail('Sub-goal 2 requires Sub-goal 1 to be set.');
      if (sub3 !== null && sub2 === null) return fail('Sub-goal 3 requires Sub-goal 2 to be set.');
      let accountIds = Array.isArray(body.account_ids) ? body.account_ids.map(Number).filter(Number.isInteger) : [];
      if (accountIds.length) {
        const placeholders = accountIds.map(() => '?').join(',');
        const { results } = await env.myd1db.prepare(`SELECT a.id FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE p.user_id = ? AND a.id IN (${placeholders})`).bind(user.id, ...accountIds).all();
        accountIds = results.map(r => r.id);
      }
      if (goalId && Number.isInteger(goalId)) {
        const existing = await env.myd1db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').bind(goalId, user.id).first();
        if (!existing) return fail('Goal not found.', 404);
        await env.myd1db.prepare('UPDATE goals SET goal_name = ?, value = ?, coin = ?, sub1 = ?, sub2 = ?, sub3 = ? WHERE id = ?').bind(goalName, value, coin, sub1, sub2, sub3, goalId).run();
        await env.myd1db.prepare('DELETE FROM goal_link WHERE goal_id = ?').bind(goalId).run();
        for (const aid of accountIds) {
          await env.myd1db.prepare('INSERT INTO goal_link (goal_id, account_id) VALUES (?, ?)').bind(goalId, aid).run();
        }
        return json({ id: goalId, ok: true });
      }
      const maxOrder = await env.myd1db.prepare('SELECT COALESCE(MAX(order_by), 0) AS m FROM goals WHERE user_id = ?').bind(user.id).first();
      const orderBy = body.order_by ?? (Number(maxOrder?.m || 0) + 1);
      const result = await env.myd1db.prepare('INSERT INTO goals (user_id, goal_name, value, coin, sub1, sub2, sub3, order_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(user.id, goalName, value, coin, sub1, sub2, sub3, orderBy).run();
      const newId = result.meta.last_row_id;
      for (const aid of accountIds) {
        await env.myd1db.prepare('INSERT INTO goal_link (goal_id, account_id) VALUES (?, ?)').bind(newId, aid).run();
      }
      return json({ id: newId }, 201);
    }
    if (method === 'DELETE' && /^goals\/\d+$/.test(path)) {
      const user = await requireMember(request, env), id = Number(path.split('/')[1]);
      const result = await env.myd1db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').bind(id, user.id).run();
      if (!changed(result)) return fail('Goal not found.', 404);
      await env.myd1db.prepare('DELETE FROM goal_link WHERE goal_id = ?').bind(id).run();
      // Renumber the remaining goals so order_by stays contiguous (no gaps).
      const { results } = await env.myd1db.prepare('SELECT id FROM goals WHERE user_id = ? ORDER BY order_by ASC, id ASC').bind(user.id).all();
      if (results.length) {
        const statements = results.map((g, i) => env.myd1db.prepare('UPDATE goals SET order_by = ? WHERE id = ? AND user_id = ?').bind(i + 1, g.id, user.id));
        await env.myd1db.batch(statements);
      }
      return json({ ok: true });
    }
    if (method === 'POST' && path === 'goals/reorder') {
      const user = await requireMember(request, env), body = await readBody(request);
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
      if (!ids.length) return fail('Provide a list of goal ids.');
      const { results } = await env.myd1db.prepare('SELECT id FROM goals WHERE user_id = ?').bind(user.id).all();
      const owned = new Set(results.map(r => r.id));
      if (ids.some(id => !owned.has(id))) return fail('Invalid goal id.');
      const statements = ids.map((id, i) => env.myd1db.prepare('UPDATE goals SET order_by = ? WHERE id = ? AND user_id = ?').bind(i + 1, id, user.id));
      await env.myd1db.batch(statements);
      return json({ ok: true });
    }

    if (method === 'GET' && path === 'admin/users') {
      await requireAdmin(request, env); const { results } = await env.myd1db.prepare("SELECT id, username, role, created_at, last_login FROM users WHERE role IN ('user', 'admin') ORDER BY username").all(); return json({ items: results });
    }
    if (method === 'POST' && path === 'admin/users') {
      await requireAdmin(request, env); const body = await readBody(request), username = clean(body.username), password = String(body.password || ''), role = clean(body.role || 'user');
      if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username) || password.length < 8 || password.length > 50 || !validRole(role)) return fail('Use a 3–50 character username, a password of 8–50 characters, and a valid role.');
      const result = await env.myd1db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').bind(username, await bcrypt.hash(password, 12), role).run(); return json({ id: result.meta.last_row_id }, 201);
    }
    if (method === 'POST' && /^admin\/users\/\d+\/password$/.test(path)) {
      await requireAdmin(request, env); const id = Number(path.split('/')[2]), body = await readBody(request), password = String(body.password || '');
      if (password.length < 8 || password.length > 50) return fail('Password must be 8–50 characters.');
      const hash = await bcrypt.hash(password, 12);
      if (!changed(await env.myd1db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, id).run())) return fail('User not found.', 404);
      return json({ ok: true });
    }
    // Self-service password reset for the logged-in user (Profile page).
    if (method === 'POST' && path === 'me/password') {
      const user = await requireMember(request, env);
      const { password } = await readBody(request);
      const passStr = String(password || '');
      if (passStr.length < 8 || passStr.length > 50) return fail('Password must be 8–50 characters.');
      const hash = await bcrypt.hash(String(password), 12);
      await env.myd1db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, user.id).run();
      return json({ ok: true });
    }
    if (method === 'PATCH' && /^admin\/users\/\d+\/role$/.test(path)) {
      const admin = await requireAdmin(request, env), id = Number(path.split('/')[2]), { role } = await readBody(request);
      if (id === admin.id) return fail('You cannot change your own role.'); if (!validRole(role)) return fail('Invalid role.');
      if (!changed(await env.myd1db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run())) return fail('User not found.', 404); return json({ ok: true });
    }
    if (method === 'POST' && path === 'admin/import') {
      await requireAdmin(request, env);
      const { rows } = await readBody(request);
      if (!Array.isArray(rows)) return fail('Invalid import payload.');
      let count = 0;
      for (const row of rows) {
        if (!row.symbol || !row.name || !row.type) continue;
        
        const symbol = clean(row.symbol).toUpperCase();
        const name = clean(row.name);
        const type = clean(row.type);
        const coin = clean(row.coin) || 'USD';
        const price = row.price === null || row.price === undefined || row.price === '' ? null : Number(row.price);
        const dividendYield = row.yield === null || row.yield === undefined || row.yield === '' ? null : Number(row.yield);
        
        let months = [];
        if (typeof row.payment_months === 'string' && row.payment_months.trim()) {
          months = row.payment_months.split('|').map(m => Number(m.trim())).filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
        }
        
        if (!['stock', 'bond', 'etf', 'cfd', 'commodity'].includes(type)) continue;
        
        // Check if asset exists
        const existing = await env.myd1db.prepare('SELECT id FROM assets WHERE UPPER(symbol) = UPPER(?)').bind(symbol).first();
        
        let assetId;
        if (existing) {
          // Update existing asset
          await env.myd1db.prepare('UPDATE assets SET name = ?, type = ?, price = ?, coin = ? WHERE id = ?').bind(name, type, price, coin, existing.id).run();
          assetId = existing.id;
        } else {
          // Create new asset
          const result = await env.myd1db.prepare('INSERT INTO assets (name, symbol, type, price, coin) VALUES (?, ?, ?, ?, ?)').bind(name, symbol, type, price, coin).run();
          assetId = result.meta.last_row_id;
        }
        
        // Update dividend yield
        if (dividendYield !== null && Number.isFinite(dividendYield)) {
          await env.myd1db.prepare('INSERT INTO dividends (asset_id, dividend_yield) VALUES (?, ?) ON CONFLICT(asset_id) DO UPDATE SET dividend_yield = excluded.dividend_yield').bind(assetId, dividendYield).run();
        }
        
        // Update payment months
        if (months.length > 0) {
          await env.myd1db.prepare('DELETE FROM dividend_payment_months WHERE asset_id = ?').bind(assetId).run();
          for (const m of months) {
            await env.myd1db.prepare('INSERT OR IGNORE INTO dividend_payment_months (asset_id, month_paid) VALUES (?, ?)').bind(assetId, m).run();
          }
        }
        
        count++;
      }
      return json({ count, ok: true });
    }
    if (method === 'GET' && path === 'currency') {
      await requireMember(request, env);
      const { results } = await env.myd1db.prepare('SELECT coin, value FROM currency ORDER BY coin').all();
      return json({ items: results });
    }
    if (method === 'POST' && path === 'admin/update-currency') {
      await requireAdmin(request, env);
      const apiKey = env.API_KEY;
      if (!apiKey) return fail('API_KEY not configured in environment variables.', 500);

      // Skip the external API call if currency was already updated today (the API only
      // exposes previous-day end-of-day values, so there is no new data within the same day).
      const story = await env.myd1db.prepare('SELECT "when" FROM update_story WHERE what = ?').bind('CURRENCY').first();
      const today = stampDay(nowStamp());
      if (story && stampDay(story.when) === today) {
        return json({ count: 0, ok: true, skipped: true, message: 'Currency rates already updated today; skipping external API call.' });
      }

      try {
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`);
        if (!response.ok) return fail('Failed to fetch exchange rates from external API.', 500);

        const data = await response.json();
        if (data.result !== 'success') return fail('Exchange rate API returned an error.', 500);

        const rates = data.conversion_rates;
        let count = 0;

        for (const [coin, value] of Object.entries(rates)) {
          await env.myd1db.prepare(
            'INSERT INTO currency (coin, value) VALUES (?, ?) ON CONFLICT(coin) DO UPDATE SET value = excluded.value'
          ).bind(coin, value).run();
          count++;
        }

        // Record that currency was updated now (what = 'CURRENCY', when = YYYYMMDDHH24MISS).
        await env.myd1db.prepare(
          'INSERT INTO update_story (what, "when") VALUES (?, ?) ON CONFLICT(what) DO UPDATE SET "when" = excluded."when"'
        ).bind('CURRENCY', nowStamp()).run();

        return json({ count, ok: true, message: `Updated ${count} currency exchange rates.` });
      } catch (error) {
        console.error('Currency update error:', error);
        return fail('Failed to update currency rates: ' + error.message, 500);
      }
    }
    // --- Time Travel: dashboard snapshots (one per user per day) ---
    if (method === 'POST' && path === 'snapshots') {
      const user = await requireUser(request, env);
      const body = await readBody(request);
      if (!body.data || typeof body.data !== 'object') return fail('Snapshot data is required.');
      const day = stampDay(nowStamp());
      const created = nowStamp();
      const data = JSON.stringify(body.data);
      await env.myd1db.prepare(
        'INSERT INTO dashboard_snapshots (user_id, day, data, created_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(user_id, day) DO UPDATE SET data = excluded.data, created_at = excluded.created_at'
      ).bind(user.id, day, data, created).run();
      return json({ ok: true, snapshot: { user_id: user.id, day, data: body.data, created_at: created } }, 201);
    }
    if (method === 'GET' && path === 'snapshots') {
      const user = await requireUser(request, env);
      const { results } = await env.myd1db.prepare(
        'SELECT day, data, created_at FROM dashboard_snapshots WHERE user_id = ? ORDER BY day DESC'
      ).bind(user.id).all();
      const snapshots = results.map(r => ({ day: r.day, created_at: r.created_at, data: JSON.parse(r.data) }));
      return json({ snapshots });
    }
    if (method === 'GET' && /^snapshots\/\d{8}$/.test(path)) {
      const user = await requireUser(request, env);
      const day = path.split('/')[1];
      const row = await env.myd1db.prepare(
        'SELECT day, data, created_at FROM dashboard_snapshots WHERE user_id = ? AND day = ?'
      ).bind(user.id, day).first();
      if (!row) return fail('Snapshot not found.', 404);
      return json({ snapshot: { day: row.day, created_at: row.created_at, data: JSON.parse(row.data) } });
    }
    if (method === 'DELETE' && /^snapshots\/\d{8}$/.test(path)) {
      const user = await requireUser(request, env);
      const day = path.split('/')[1];
      const result = await env.myd1db.prepare(
        'DELETE FROM dashboard_snapshots WHERE user_id = ? AND day = ?'
      ).bind(user.id, day).run();
      if (!changed(result)) return fail('Snapshot not found.', 404);
      return json({ ok: true });
    }
    // Clean snapshots: keep only the most recent snapshot per month (excluding the current month).
    if (method === 'POST' && path === 'snapshots/clean-months') {
      const user = await requireUser(request, env);
      const now = new Date();
      const curYear = now.getUTCFullYear();
      const curMonth = now.getUTCMonth() + 1; // 1-12
      const curMonthPrefix = `${curYear}${String(curMonth).padStart(2, '0')}`;
      const { results } = await env.myd1db.prepare(
        'SELECT day FROM dashboard_snapshots WHERE user_id = ? AND substr(day, 1, 6) != ? ORDER BY day DESC'
      ).bind(user.id, curMonthPrefix).all();
      // Keep the first (most recent) day per YYYYMM prefix; delete the rest.
      const keep = new Set();
      for (const r of results) {
        const prefix = r.day.slice(0, 6);
        if (!keep.has(prefix)) { keep.add(prefix); keep.add(r.day); }
      }
      const toDelete = results.filter(r => !keep.has(r.day)).map(r => r.day);
      let deleted = 0;
      for (const day of toDelete) {
        const res = await env.myd1db.prepare(
          'DELETE FROM dashboard_snapshots WHERE user_id = ? AND day = ?'
        ).bind(user.id, day).run();
        if (changed(res)) deleted++;
      }
      return json({ ok: true, deleted });
    }
    // Clean snapshots: keep only the most recent snapshot per year (excluding the current year).
    if (method === 'POST' && path === 'snapshots/clean-years') {
      const user = await requireUser(request, env);
      const curYear = new Date().getUTCFullYear();
      const { results } = await env.myd1db.prepare(
        'SELECT day FROM dashboard_snapshots WHERE user_id = ? AND substr(day, 1, 4) != ? ORDER BY day DESC'
      ).bind(user.id, String(curYear)).all();
      // Keep the first (most recent) day per YYYY prefix; delete the rest.
      const keep = new Set();
      for (const r of results) {
        const prefix = r.day.slice(0, 4);
        if (!keep.has(prefix)) { keep.add(prefix); keep.add(r.day); }
      }
      const toDelete = results.filter(r => !keep.has(r.day)).map(r => r.day);
      let deleted = 0;
      for (const day of toDelete) {
        const res = await env.myd1db.prepare(
          'DELETE FROM dashboard_snapshots WHERE user_id = ? AND day = ?'
        ).bind(user.id, day).run();
        if (changed(res)) deleted++;
      }
      return json({ ok: true, deleted });
    }
    return fail('Route not found.', 404);
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) {
      console.error(error);
      return fail('Internal server error.', 500); // Do not leak internal exception details
    }
    return fail(error.message || 'Request failed.', status);
  }
}
