import bcrypt from 'bcryptjs';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const fail = (message, status = 400) => json({ error: message }, status);
const readBody = async request => { try { return await request.json(); } catch { return {}; } };
const clean = value => typeof value === 'string' ? value.trim() : '';
const validRole = value => ['guest', 'user', 'admin'].includes(value);

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
async function requireMember(request, env) { const user = await requireUser(request, env); if (user.role === 'guest') throw Object.assign(new Error('Guest accounts only have access to mock data.'), { status: 403 }); return user; }
async function requireAdmin(request, env) { const user = await requireUser(request, env); if (user.role !== 'admin') throw Object.assign(new Error('Administrator access required.'), { status: 403 }); return user; }
const changed = result => result.meta?.changes > 0;

function assetsStatement(db) {
  return db.prepare(`SELECT a.id, a.name, a.symbol, a.type, a.price, a.coin,
    d.dividend_yield, GROUP_CONCAT(DISTINCT dpm.month_paid) AS payment_months
    FROM assets a LEFT JOIN dividends d ON d.asset_id = a.id
    LEFT JOIN dividend_payment_months dpm ON dpm.asset_id = a.id
    GROUP BY a.id ORDER BY COALESCE(a.symbol, a.name)`);
}
function normalizeAssets(items) { return items.map(item => ({ ...item, payment_months: item.payment_months ? item.payment_months.split(',').map(Number).sort((a, b) => a - b) : [] })); }

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.myd1db) return fail('D1 binding "DB" is not configured.', 500);
  const path = new URL(request.url).pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = request.method;
  try {
    if (method === 'POST' && path === 'auth/login') {
      const { username, password } = await readBody(request);
      const user = await env.myd1db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').bind(clean(username)).first();
      if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) return fail('Invalid username or password.', 401);
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

    if (method === 'GET' && path === 'assets') { await requireMember(request, env); return json({ items: normalizeAssets((await assetsStatement(env.myd1db).all()).results) }); }
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
      if (!name || !['stock', 'bond', 'etf', 'cfd', 'commodity'].includes(type)) return fail('Provide a valid asset name and type (stock, bond, etf, cfd, commodity).');

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
      if (!name || !['stock', 'bond', 'etf', 'cfd', 'commodity'].includes(type)) return fail('Provide a valid asset name and type (stock, bond, etf, cfd, commodity).');

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
    if (method === 'POST' && /^assets\/\d+\/price$/.test(path)) {
      await requireAdmin(request, env);
      const id = Number(path.split('/')[1]);
      const asset = await env.myd1db.prepare('SELECT id, symbol, coin FROM assets WHERE id = ?').bind(id).first();
      if (!asset) return fail('Asset not found.', 404);
      if (!asset.symbol) return fail('This asset has no symbol to look up.', 400);
      const apiKey = env.STOCK_API_KEY;
      if (!apiKey) return fail('STOCK_API_KEY not configured in environment variables.', 500);

      const url = `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(asset.symbol)}?apiKey=${encodeURIComponent(apiKey)}`;
      let response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      } catch (error) {
        return fail('Massive API request timed out.', 504);
      }
      if (!response.ok) return fail(`Massive API returned ${response.status}.`, 502);
      const data = await response.json();
      const results = data?.results;
      const price = results?.day?.c ?? results?.lastTrade?.p ?? null;
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
      if (!Number.isInteger(providerId) || !name || name.length > 100 || !['loan', 'interest_account', 'bank_account', 'asset_account'].includes(type) || (balance !== null && !Number.isFinite(balance)) || (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100))) return fail('Provide valid account details.');
      const owner = await env.myd1db.prepare('SELECT id FROM providers WHERE id = ? AND user_id = ?').bind(providerId, user.id).first(); if (!owner) return fail('Provider not found.', 404);

      if (accountId && Number.isInteger(accountId)) {
        // Update existing account
        const existing = await env.myd1db.prepare('SELECT a.id FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE a.id = ? AND p.user_id = ?').bind(accountId, user.id).first();
        if (!existing) return fail('Account not found.', 404);
        const updateRes = await env.myd1db.prepare('UPDATE accounts SET provider_id = ?, name = ?, type = ?, balance = ?, interest_rate = ?, coin = ? WHERE id = ?').bind(providerId, name, type, type === 'asset_account' ? null : balance, rate, coin, accountId).run();
        if (!changed(updateRes)) return fail('Failed to update account.', 500);
        return json({ id: accountId, ok: true });
      } else {
        // Create new account
        const result = await env.myd1db.prepare('INSERT INTO accounts (provider_id, name, type, balance, interest_rate, coin) VALUES (?, ?, ?, ?, ?, ?)').bind(providerId, name, type, type === 'asset_account' ? null : balance, rate, coin).run();
        return json({ id: result.meta.last_row_id }, 201);
      }
    }
    if ((method === 'PUT' || method === 'PATCH') && /^accounts\/\d+$/.test(path)) {
      const user = await requireMember(request, env), id = Number(path.split('/')[1]), body = await readBody(request);
      const providerId = Number(body.provider_id), name = clean(body.name), type = clean(body.type);
      const balance = body.balance === null ? null : Number(body.balance), rate = body.interest_rate === null ? null : Number(body.interest_rate);
      const coin = clean(body.coin) || 'USD';
      if (!Number.isInteger(providerId) || !name || name.length > 100 || !['loan', 'interest_account', 'bank_account', 'asset_account'].includes(type) || (balance !== null && !Number.isFinite(balance)) || (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100))) return fail('Provide valid account details.');
      const owner = await env.myd1db.prepare('SELECT id FROM providers WHERE id = ? AND user_id = ?').bind(providerId, user.id).first(); if (!owner) return fail('Provider not found.', 404);
      const existing = await env.myd1db.prepare('SELECT a.id FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE a.id = ? AND p.user_id = ?').bind(id, user.id).first();
      if (!existing) return fail('Account not found.', 404);
      const updateRes = await env.myd1db.prepare('UPDATE accounts SET provider_id = ?, name = ?, type = ?, balance = ?, interest_rate = ?, coin = ? WHERE id = ?').bind(providerId, name, type, type === 'asset_account' ? null : balance, rate, coin, id).run();
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
      const { results } = await env.myd1db.prepare(`SELECT h.id, h.account_id, h.asset_id, h.quantity, h.purchase_price, a.name AS account_name, s.name AS asset_name, s.symbol, s.price, s.coin
        FROM account_holdings h JOIN accounts a ON a.id = h.account_id JOIN providers p ON p.id = a.provider_id JOIN assets s ON s.id = h.asset_id WHERE p.user_id = ? ORDER BY a.name, s.name`).bind(user.id).all();
      return json({ items: results });
    }
    if (method === 'POST' && path === 'holdings') {
      const user = await requireMember(request, env), body = await readBody(request), accountId = Number(body.account_id), assetId = Number(body.asset_id), quantity = Number(body.quantity), purchasePrice = body.purchase_price === null ? null : Number(body.purchase_price);
      if (!Number.isInteger(accountId) || !Number.isInteger(assetId) || !Number.isFinite(quantity) || quantity <= 0 || (purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0))) return fail('Provide valid holding details.');
      const account = await env.myd1db.prepare(`SELECT a.id FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE a.id = ? AND a.type = 'asset_account' AND p.user_id = ?`).bind(accountId, user.id).first();
      const asset = await env.myd1db.prepare('SELECT id FROM assets WHERE id = ?').bind(assetId).first(); if (!account || !asset) return fail('Asset account or asset not found.', 404);
      await env.myd1db.prepare(`INSERT INTO account_holdings (account_id, asset_id, quantity, purchase_price) VALUES (?, ?, ?, ?)
        ON CONFLICT(account_id, asset_id) DO UPDATE SET quantity = excluded.quantity, purchase_price = excluded.purchase_price`).bind(accountId, assetId, quantity, purchasePrice).run();
      return json({ ok: true }, 201);
    }
    if (method === 'DELETE' && /^holdings\/\d+$/.test(path)) {
      const user = await requireMember(request, env), id = Number(path.split('/')[1]);
      const result = await env.myd1db.prepare('DELETE FROM account_holdings WHERE id = ? AND EXISTS (SELECT 1 FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE a.id = account_holdings.account_id AND p.user_id = ?)').bind(id, user.id).run();
      if (!changed(result)) return fail('Holding not found.', 404); return json({ ok: true });
    }

    if (method === 'GET' && path === 'goals') {
      const user = await requireMember(request, env);
      const { results } = await env.myd1db.prepare('SELECT id, goal_name, value, coin FROM goals WHERE user_id = ? ORDER BY id').bind(user.id).all();
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
      let accountIds = Array.isArray(body.account_ids) ? body.account_ids.map(Number).filter(Number.isInteger) : [];
      if (accountIds.length) {
        const placeholders = accountIds.map(() => '?').join(',');
        const { results } = await env.myd1db.prepare(`SELECT a.id FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE p.user_id = ? AND a.id IN (${placeholders})`).bind(user.id, ...accountIds).all();
        accountIds = results.map(r => r.id);
      }
      if (goalId && Number.isInteger(goalId)) {
        const existing = await env.myd1db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').bind(goalId, user.id).first();
        if (!existing) return fail('Goal not found.', 404);
        await env.myd1db.prepare('UPDATE goals SET goal_name = ?, value = ?, coin = ? WHERE id = ?').bind(goalName, value, coin, goalId).run();
        await env.myd1db.prepare('DELETE FROM goal_link WHERE goal_id = ?').bind(goalId).run();
        for (const aid of accountIds) {
          await env.myd1db.prepare('INSERT INTO goal_link (goal_id, account_id) VALUES (?, ?)').bind(goalId, aid).run();
        }
        return json({ id: goalId, ok: true });
      }
      const result = await env.myd1db.prepare('INSERT INTO goals (user_id, goal_name, value, coin) VALUES (?, ?, ?, ?)').bind(user.id, goalName, value, coin).run();
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
      return json({ ok: true });
    }

    if (method === 'GET' && path === 'admin/users') {
      await requireAdmin(request, env); const { results } = await env.myd1db.prepare('SELECT id, username, role, created_at, last_login FROM users ORDER BY username').all(); return json({ items: results });
    }
    if (method === 'POST' && path === 'admin/users') {
      await requireAdmin(request, env); const body = await readBody(request), username = clean(body.username), password = String(body.password || ''), role = clean(body.role || 'user');
      if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username) || password.length < 8 || !validRole(role)) return fail('Use a 3–50 character username, a password of at least 8 characters, and a valid role.');
      const result = await env.myd1db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').bind(username, await bcrypt.hash(password, 12), role).run(); return json({ id: result.meta.last_row_id }, 201);
    }
    if (method === 'POST' && /^admin\/users\/\d+\/password$/.test(path)) {
      await requireAdmin(request, env); const id = Number(path.split('/')[2]), body = await readBody(request), password = String(body.password || '');
      if (password.length < 8) return fail('Password must be at least 8 characters.');
      const hash = await bcrypt.hash(password, 12);
      if (!changed(await env.myd1db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, id).run())) return fail('User not found.', 404);
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

        return json({ count, ok: true, message: `Updated ${count} currency exchange rates.` });
      } catch (error) {
        console.error('Currency update error:', error);
        return fail('Failed to update currency rates: ' + error.message, 500);
      }
    }
    return fail('Route not found.', 404);
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    return fail(error.message || 'Internal server error.', status);
  }
}
