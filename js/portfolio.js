const API = '/api';
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
const moneyEUR = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' });
const monthLabels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const CHART_COLORS = ['#4f8cff', '#3fd0a3', '#ffb454', '#ff5c72', '#a878ff', '#ff9fd6', '#5ce1e6', '#f2c14e', '#7ee081', '#ff8a5c', '#6c8cff', '#d4a5ff'];

const guestData = {
  assets: [
    { id: 1, symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', price: 179.62, coin: 'USD', dividend_yield: 0.52, payment_months: [2] },
    { id: 2, symbol: 'VYM', name: 'Vanguard Dividend ETF', type: 'etf', price: 114.00, coin: 'USD', dividend_yield: 3.10, payment_months: [3, 6, 9, 12] },
    { id: 3, symbol: 'TLT', name: 'US Treasury Bond 10Y', type: 'bond', price: 99.25, coin: 'USD', dividend_yield: 4.20, payment_months: [5, 11] },
    { id: 4, symbol: 'MSFT', name: 'Microsoft Corp.', type: 'stock', price: 452.30, coin: 'USD', dividend_yield: 0.78, payment_months: [3, 6, 9, 12] },
    { id: 5, symbol: 'XAUUSD', name: 'Gold CFD', type: 'cfd', price: 2350.00, coin: 'USD', dividend_yield: 0.00, payment_months: [] }
  ],
  providers: [
    { id: 1, name: 'Revolut', type: 'bank' },
    { id: 2, name: 'Trading 212', type: 'broker' }
  ],
  accounts: [
    { id: 1, provider_id: 1, provider_name: 'Revolut', name: 'Main Checking', type: 'bank_account', balance: 5000.00, coin: 'USD', interest_rate: null },
    { id: 2, provider_id: 1, provider_name: 'Revolut', name: 'Savings Account', type: 'interest_account', balance: 10000.00, coin: 'USD', interest_rate: 2.80 },
    { id: 3, provider_id: 2, provider_name: 'Trading 212', name: 'Investment ISA', type: 'asset_account', balance: null, coin: 'USD', interest_rate: null }
  ],
  holdings: [
    { id: 1, account_id: 3, asset_id: 1, quantity: 10, purchase_price: 170.00, price: 179.62, coin: 'USD', symbol: 'AAPL', asset_name: 'Apple Inc.', account_name: 'Investment ISA' },
    { id: 2, account_id: 3, asset_id: 2, quantity: 25, purchase_price: 110.00, price: 114.00, coin: 'USD', symbol: 'VYM', asset_name: 'Vanguard Dividend ETF', account_name: 'Investment ISA' }
  ],
  currencies: [
    { coin: 'USD', value: 1 },
    { coin: 'EUR', value: 0.92 },
    { coin: 'GBP', value: 0.79 },
    { coin: 'JPY', value: 149.50 }
  ],
  goals: [
    { id: 1, goal_name: 'Emergency Fund', value: 20000, coin: 'USD', sub1: 10000, sub2: 15000, sub3: null, account_ids: [1, 2] },
    { id: 2, goal_name: 'Investment Growth', value: 50000, coin: 'USD', sub1: null, sub2: null, sub3: null, account_ids: [3] }
  ],
  users: [
    { id: 1, username: 'admin_user', role: 'admin', created_at: '2026-01-12', last_login: '2026-08-09' },
    { id: 2, username: 'john_doe', role: 'user', created_at: '2026-02-03', last_login: '2026-08-08' },
    { id: 3, username: 'demo_guest', role: 'guest', created_at: '2026-01-12', last_login: '2026-08-09' }
  ]
};

const state = { user: null, guest: false, assets: [], providers: [], accounts: [], holdings: [], users: [], currencies: [], goals: [] };
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const numeric = value => value === null || value === undefined || value === '' ? null : Number(value);

// Currency conversion helpers
function getExchangeRate(fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return 1;
  
  const fromRate = state.currencies.find(c => c.coin === fromCurrency);
  const toRate = state.currencies.find(c => c.coin === toCurrency);
  
  if (!fromRate || !toRate) return null;
  
  // Exchange rates are relative to USD
  // To convert from X to Y: (1 / X_rate) * Y_rate
  return (1 / fromRate.value) * toRate.value;
}

function convertToEUR(amount, fromCurrency) {
  if (!amount || !fromCurrency) return 0;
  if (fromCurrency === 'EUR') return amount;
  
  // If from USD, use direct EUR rate
  if (fromCurrency === 'USD') {
    const eurRate = state.currencies.find(c => c.coin === 'EUR');
    return eurRate ? amount * eurRate.value : amount;
  }
  
  // For other currencies: convert to USD first, then to EUR
  const usdRate = getExchangeRate(fromCurrency, 'USD');
  const eurRate = state.currencies.find(c => c.coin === 'EUR');
  
  if (!usdRate || !eurRate) return amount;
  
  const amountInUSD = amount * usdRate;
  return amountInUSD * eurRate.value;
}

function formatCurrency(amount, currency = 'USD') {
  if (currency === 'EUR') {
    return moneyEUR.format(amount);
  }
  // For other currencies, use the currency code
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('show'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); }
function closeAllModals() { document.querySelectorAll('.modal-overlay.show').forEach(el => el.classList.remove('show')); }

function confirmDialog(message, okLabel = 'Delete') {
  return new Promise(resolve => {
    const overlay = $('#confirmModalOverlay');
    if (!overlay) { resolve(true); return; }
    $('#confirmModalMessage').textContent = message;
    $('#confirmModalOk').textContent = okLabel;
    const okBtn = $('#confirmModalOk');
    const cancelBtn = $('#confirmModalCancel');
    const cleanup = () => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
      closeModal('confirmModalOverlay');
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onOverlay = e => { if (e.target === overlay) onCancel(); };
    const onKey = e => { if (e.key === 'Escape') onCancel(); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);
    openModal('confirmModalOverlay');
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

function isWriteAllowed() { return !state.guest; }
function isAdminUser() { return !state.guest && state.user?.role === 'admin'; }
function typeLabel(value) { return String(value || '').replaceAll('_', ' '); }
function latestValue(holding) { return Number(holding.quantity) * Number(holding.price || 0); }
function gainLoss(h) {
  if (h.purchase_price == null || Number(h.purchase_price) <= 0 || h.price == null) return '—';
  const diffPct = ((Number(h.price) - Number(h.purchase_price)) / Number(h.purchase_price)) * 100;
  const formatted = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%`;
  const className = diffPct >= 0 ? 'pos' : 'neg';
  return `<span class="${className}" style="font-weight:600;">${formatted}</span>`;
}

function gainLossValue(h) {
  if (h.purchase_price == null || Number(h.purchase_price) <= 0 || h.price == null) return '—';
  const diff = (Number(h.price) - Number(h.purchase_price)) * Number(h.quantity || 0);
  const formatted = `${diff >= 0 ? '+' : '−'}${moneyEUR.format(Math.abs(diff))}`;
  const className = diff >= 0 ? 'pos' : 'neg';
  return `<span class="${className}" style="font-weight:600;">${formatted}</span>`;
}

async function loadData() {
  if (state.guest) {
    Object.assign(state, structuredClone(guestData));
    render();
    return;
  }
  try {
    const [assets, providers, accounts, holdings, currencies, goals] = await Promise.all([
      request('/assets').catch(() => ({ items: [] })),
      request('/providers').catch(() => ({ items: [] })),
      request('/accounts').catch(() => ({ items: [] })),
      request('/holdings').catch(() => ({ items: [] })),
      request('/currency').catch(() => ({ items: [] })),
      request('/goals').catch(() => ({ items: [] }))
    ]);
    Object.assign(state, {
      assets: assets?.items || [],
      providers: providers?.items || [],
      accounts: accounts?.items || [],
      holdings: holdings?.items || [],
      currencies: currencies?.items || [],
      goals: goals?.items || []
    });
    if (state.user && state.user.role === 'admin') {
      try {
        state.users = (await request('/admin/users')).items || [];
      } catch {
        state.users = [];
      }
    }
  } catch (err) {
    console.error('Failed to load portfolio data:', err);
  }
  render();
}

let allocationChartInstance = null;
let accountTypeChartInstance = null;
let portfolioAssetChartInstance = null;
let portfolioTypeChartInstance = null;
let goalDetailsChartInstance = null;
let goalDetailsGoalId = null;
let dashboardFilter = null; // { source: 'assetType'|'provider', value: string } | null
let portfolioFilter = null; // { source: 'asset'|'type', value: string } | null
let dashboardAllocOthers = [];
let dashboardProviderOthers = [];
let portfolioAssetOthers = [];
let portfolioTypeOthers = [];
let collapsedProviders = new Set();

function renderDashboardAccounts() {
  const container = $('#dashboardAccounts');
  if (!container) return;

  let accounts = state.accounts;
  let filterLabel = null;

  if (dashboardFilter) {
    if (dashboardFilter.source === 'assetType') {
      const val = dashboardFilter.value;
      if (val === 'Loans') {
        accounts = state.accounts.filter(a => a.type === 'loan');
      } else if (val === 'Cash') {
        accounts = state.accounts.filter(a => a.type === 'bank_account');
      } else if (val === 'Deposits') {
        accounts = state.accounts.filter(a => a.type === 'interest_account');
      } else if (val === 'Others') {
        const relevantAccountIds = new Set(
          state.holdings
            .filter(h => {
              const asset = state.assets.find(a => a.id === h.asset_id);
              return asset && dashboardAllocOthers.includes(asset.type || 'Other');
            })
            .map(h => h.account_id)
        );
        accounts = state.accounts.filter(a => relevantAccountIds.has(a.id));
      } else {
        const relevantAccountIds = new Set(
          state.holdings
            .filter(h => {
              const asset = state.assets.find(a => a.id === h.asset_id);
              return asset && asset.type === val;
            })
            .map(h => h.account_id)
        );
        accounts = state.accounts.filter(a => relevantAccountIds.has(a.id));
      }
      filterLabel = `Asset Type: ${val}`;
    } else if (dashboardFilter.source === 'provider') {
      const val = dashboardFilter.value;
      if (val === 'Others') {
        const providerIds = new Set(
          state.providers.filter(p => dashboardProviderOthers.includes(p.name)).map(p => p.id)
        );
        accounts = state.accounts.filter(a => providerIds.has(a.provider_id));
      } else {
        const provider = state.providers.find(p => p.name === val);
        if (provider) {
          accounts = state.accounts.filter(a => a.provider_id === provider.id);
        }
      }
      filterLabel = `Provider: ${val}`;
    }
  }

  const filterBar = filterLabel
    ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--card);border-radius:8px;border:1px solid var(--border);">
        <span style="font-size:13px;color:var(--muted);">Filtered by</span>
        <span style="font-size:13px;font-weight:600;color:var(--accent);">${esc(filterLabel)}</span>
        <span style="font-size:12px;color:var(--muted);">&mdash; click the same slice again to clear</span>
      </div>`
    : '';

  container.innerHTML = filterBar + (accounts.length ? `
    <div class="dashboard-accounts-grid">
      ${accounts.map(a => {
        const valInEur = accountValue(a, true);
        return `
          <div class="account-card">
            <div class="account-card-head" style="margin-bottom:4px;">
              <span class="aname">${esc(a.name)} <span class="tag ${a.type}">${esc(typeLabel(a.type))}</span></span>
              <strong class="${valInEur < 0 ? 'neg' : 'pos'}">${moneyEUR.format(valInEur)}</strong>
            </div>
            <div class="dlabel">${esc(a.provider_name || providerName(a.provider_id))}</div>
          </div>
        `;
      }).join('')}
    </div>
  ` : '<div class="page-desc">No accounts match this filter.</div>');
}

function topNWithOthers(map, n) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (entries.length <= n) {
    return { labels: entries.map(e => e[0]), data: entries.map(e => e[1]), others: [] };
  }
  const top = entries.slice(0, n);
  const others = entries.slice(n).map(e => e[0]);
  const othersSum = entries.slice(n).reduce((sum, e) => sum + e[1], 0);
  return {
    labels: [...top.map(e => e[0]), 'Others'],
    data: [...top.map(e => e[1]), othersSum],
    others
  };
}

function renderCharts() {
  if (typeof Chart === 'undefined') return;
  
  const allocCtx = document.getElementById('allocationChart')?.getContext('2d');
  const typeCtx = document.getElementById('accountTypeChart')?.getContext('2d');
  if (!allocCtx || !typeCtx) return;

  if (allocationChartInstance) allocationChartInstance.destroy();
  if (accountTypeChartInstance) accountTypeChartInstance.destroy();

  const allocMap = {};
  state.holdings.forEach(h => {
    const asset = state.assets.find(a => a.id === h.asset_id);
    if (asset) {
      const val = Number(asset.price || 0) * Number(h.quantity || 0);
      const valInEur = convertToEUR(val, asset.coin || 'USD');
      const type = asset.type || 'Other';
      allocMap[type] = (allocMap[type] || 0) + valInEur;
    }
  });
  
  // Separate loans, cash (bank accounts) and deposits (interest accounts) - convert to EUR
  const loansTotal = state.accounts.filter(a => a.type === 'loan').reduce((sum, a) => {
    const balance = Number(a.balance || 0);
    return sum + convertToEUR(balance, a.coin || 'USD');
  }, 0);
  const cashTotal = state.accounts.filter(a => a.type === 'bank_account').reduce((sum, a) => {
    const balance = Number(a.balance || 0);
    return sum + convertToEUR(balance, a.coin || 'USD');
  }, 0);
  const depositsTotal = state.accounts.filter(a => a.type === 'interest_account').reduce((sum, a) => {
    const balance = Number(a.balance || 0);
    return sum + convertToEUR(balance, a.coin || 'USD');
  }, 0);
  
  if (loansTotal !== 0) allocMap['Loans'] = loansTotal;
  if (cashTotal !== 0) allocMap['Cash'] = cashTotal;
  if (depositsTotal !== 0) allocMap['Deposits'] = depositsTotal;

  const allocTop = topNWithOthers(allocMap, 9);
  const allocLabels = allocTop.labels;
  const allocData = allocTop.data;
  const allocDataAbs = allocData.map(v => Math.abs(v));
  const allocColors = CHART_COLORS;
  dashboardAllocOthers = allocTop.others;

  allocationChartInstance = new Chart(allocCtx, {
    type: 'doughnut',
    data: {
      labels: allocLabels.length ? allocLabels : ['No Data'],
      datasets: [{
        data: allocDataAbs.length ? allocDataAbs : [1],
        backgroundColor: allocDataAbs.length ? allocColors : ['#2a3550'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      onClick(event, elements) {
        if (!elements.length || !allocLabels.length) return;
        const clickedLabel = allocLabels[elements[0].index];
        if (dashboardFilter && dashboardFilter.source === 'assetType' && dashboardFilter.value === clickedLabel) {
          dashboardFilter = null;
        } else {
          dashboardFilter = { source: 'assetType', value: clickedLabel };
        }
        renderDashboardAccounts();
      },
      onHover(event, elements) {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    }
  });

  // Render allocation legend
  renderLegend('allocationLegend', allocLabels, allocData, allocColors, true);

  // By Provider chart (pie/doughnut)
  const providerMap = {};
  state.providers.forEach(provider => {
    const val = providerValue(provider);
    if (val !== 0) {
      providerMap[provider.name] = val;
    }
  });

  const providerTop = topNWithOthers(providerMap, 9);
  const providerLabels = providerTop.labels;
  const providerData = providerTop.data;
  const providerDataAbs = providerData.map(v => Math.abs(v));
  const providerColors = CHART_COLORS;
  dashboardProviderOthers = providerTop.others;

  accountTypeChartInstance = new Chart(typeCtx, {
    type: 'doughnut',
    data: {
      labels: providerLabels.length ? providerLabels : ['No Data'],
      datasets: [{
        data: providerDataAbs.length ? providerDataAbs : [1],
        backgroundColor: providerDataAbs.length ? providerColors : ['#2a3550'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      onClick(event, elements) {
        if (!elements.length || !providerLabels.length) return;
        const clickedLabel = providerLabels[elements[0].index];
        if (dashboardFilter && dashboardFilter.source === 'provider' && dashboardFilter.value === clickedLabel) {
          dashboardFilter = null;
        } else {
          dashboardFilter = { source: 'provider', value: clickedLabel };
        }
        renderDashboardAccounts();
      },
      onHover(event, elements) {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    }
  });

  // Render provider legend
  renderLegend('providerLegend', providerLabels, providerData, providerColors, true);
}

function renderLegend(elementId, labels, data, colors, onClick = null) {
  const legendEl = document.getElementById(elementId);
  if (!legendEl) return;
  
  const totalAbs = data.reduce((sum, val) => sum + Math.abs(val), 0);
  
  if (labels.length === 0 || totalAbs === 0) {
    legendEl.innerHTML = '<div class="legend-row"><span class="lname" style="color:var(--muted);">No data yet</span></div>';
    return;
  }
  
  legendEl.innerHTML = labels.map((label, i) => {
    const value = data[i];
    const absValue = Math.abs(value);
    const isNegative = value < 0;
    const pct = totalAbs ? ((absValue / totalAbs) * 100).toFixed(1) : '0.0';
    const color = colors[i % colors.length];
    const labelText = isNegative ? `${esc(label)} (negative)` : esc(label);
    const clickable = onClick ? ` data-legend-label="${esc(label)}" style="cursor:pointer;"` : '';
    return `<div class="legend-row"${clickable}>
      <span class="legend-swatch" style="background:${color}"></span>
      <span class="lname">${labelText}</span>
      <span class="lval">${moneyEUR.format(absValue)} · ${pct}%</span>
    </div>`;
  }).join('');
}

function renderPortfolioCards() {
  let totalGainEur = 0;
  let totalCostEur = 0;
  let totalMarketEur = 0;
  let totalAnnualDividendBeforeTaxEur = 0;
  let totalAnnualDividendEur = 0;

  state.holdings.forEach(h => {
    const asset = state.assets.find(a => a.id === h.asset_id);
    if (!asset) return;
    const qty = Number(h.quantity || 0);
    const marketVal = Number(asset.price || 0) * qty;
    const marketEur = convertToEUR(marketVal, asset.coin || 'USD');
    totalMarketEur += marketEur;

    // Gain/loss: only holdings with a purchase price count
    if (h.purchase_price != null && Number(h.purchase_price) > 0) {
      const cost = Number(h.purchase_price) * qty;
      const costEur = convertToEUR(cost, asset.coin || 'USD');
      totalCostEur += costEur;
      totalGainEur += marketEur - costEur;
    }

    // Dividend yield (annual), tax-adjusted
    const yieldPct = Number(asset.dividend_yield || 0);
    if (yieldPct > 0) {
      const annualDiv = marketVal * (yieldPct / 100);
      const annualDivEur = convertToEUR(annualDiv, asset.coin || 'USD');
      totalAnnualDividendBeforeTaxEur += annualDivEur;
      const isEur = (asset.coin || 'USD') === 'EUR';
      const keep = isEur ? (1 - 0.28) : (1 - 0.15) * (1 - 0.28);
      totalAnnualDividendEur += annualDivEur * keep;
    }
  });

  // Portfolio value (sum of current asset values in EUR)
  const portfolioValueEl = $('#portfolioAssetValue');
  if (portfolioValueEl) {
    portfolioValueEl.textContent = moneyEUR.format(totalMarketEur);
  }

  // Total gain/loss % (main value) and € (delta)
  const gainLossPctEl = $('#portfolioGainLossPct');
  const gainLossEurDelta = $('#portfolioGainLossEurDelta');
  if (gainLossPctEl || gainLossEurDelta) {
    const pct = totalCostEur > 0 ? (totalGainEur / totalCostEur) * 100 : 0;
    if (gainLossPctEl) {
      gainLossPctEl.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
      gainLossPctEl.className = 'value ' + (pct < 0 ? 'neg' : 'pos');
    }
    if (gainLossEurDelta) {
      gainLossEurDelta.textContent = `${totalGainEur >= 0 ? '+' : '−'}${moneyEUR.format(Math.abs(totalGainEur))}`;
      gainLossEurDelta.className = 'delta ' + (totalGainEur < 0 ? 'down' : 'up');
    }
  }

  // Global dividend yield (weighted avg) - before and after tax
  const globalYieldEl = $('#portfolioGlobalYield');
  const globalYieldDelta = $('#portfolioGlobalYieldDelta');
  if (globalYieldEl || globalYieldDelta) {
    const avgYieldBefore = totalMarketEur > 0 ? (totalAnnualDividendBeforeTaxEur / totalMarketEur) * 100 : 0;
    const avgYieldAfter = totalMarketEur > 0 ? (totalAnnualDividendEur / totalMarketEur) * 100 : 0;
    if (globalYieldEl) globalYieldEl.textContent = `${avgYieldBefore.toFixed(2)}%`;
    if (globalYieldDelta) globalYieldDelta.textContent = `after tax ${avgYieldAfter.toFixed(2)}%`;
  }

  // Yield € after tax (year / month)
  const yieldEurEl = $('#portfolioYieldEur');
  if (yieldEurEl) {
    yieldEurEl.textContent = moneyEUR.format(totalAnnualDividendEur);
  }
  const yieldEurDelta = $('#portfolioYieldEurDelta');
  if (yieldEurDelta) {
    yieldEurDelta.textContent = `year / ${moneyEUR.format(totalAnnualDividendEur / 12)} month`;
  }
}

function renderPortfolioCharts() {
  if (typeof Chart === 'undefined') return;

  const assetCtx = document.getElementById('portfolioAssetChart')?.getContext('2d');
  const typeCtx = document.getElementById('portfolioTypeChart')?.getContext('2d');
  if (!assetCtx || !typeCtx) return;

  if (portfolioAssetChartInstance) portfolioAssetChartInstance.destroy();
  if (portfolioTypeChartInstance) portfolioTypeChartInstance.destroy();

  const colors = CHART_COLORS;

  // By Asset: market value per individual asset
  const assetMap = {};
  state.holdings.forEach(h => {
    const asset = state.assets.find(a => a.id === h.asset_id);
    if (asset) {
      const val = Number(asset.price || 0) * Number(h.quantity || 0);
      const valInEur = convertToEUR(val, asset.coin || 'USD');
      const label = h.symbol || asset.symbol || asset.name || 'Unknown';
      assetMap[label] = (assetMap[label] || 0) + valInEur;
    }
  });

  const assetTop = topNWithOthers(assetMap, 9);
  const assetLabels = assetTop.labels;
  const assetData = assetTop.data;
  const assetDataAbs = assetData.map(v => Math.abs(v));
  portfolioAssetOthers = assetTop.others;

  portfolioAssetChartInstance = new Chart(assetCtx, {
    type: 'doughnut',
    data: {
      labels: assetLabels.length ? assetLabels : ['No Data'],
      datasets: [{
        data: assetDataAbs.length ? assetDataAbs : [1],
        backgroundColor: assetDataAbs.length ? colors : ['#2a3550'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      onClick(event, elements) {
        if (!elements.length || !assetLabels.length) return;
        const clickedLabel = assetLabels[elements[0].index];
        if (portfolioFilter && portfolioFilter.source === 'asset' && portfolioFilter.value === clickedLabel) {
          portfolioFilter = null;
        } else {
          portfolioFilter = { source: 'asset', value: clickedLabel };
        }
        renderHoldings();
      },
      onHover(event, elements) {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    }
  });

  renderLegend('portfolioAssetLegend', assetLabels, assetData, colors, true);

  // By Asset Type: allocation by asset type
  const typeMap = {};
  state.holdings.forEach(h => {
    const asset = state.assets.find(a => a.id === h.asset_id);
    if (asset) {
      const val = Number(asset.price || 0) * Number(h.quantity || 0);
      const valInEur = convertToEUR(val, asset.coin || 'USD');
      const type = asset.type || 'Other';
      typeMap[type] = (typeMap[type] || 0) + valInEur;
    }
  });

  const typeTop = topNWithOthers(typeMap, 9);
  const typeLabels = typeTop.labels;
  const typeData = typeTop.data;
  const typeDataAbs = typeData.map(v => Math.abs(v));
  portfolioTypeOthers = typeTop.others;

  portfolioTypeChartInstance = new Chart(typeCtx, {
    type: 'doughnut',
    data: {
      labels: typeLabels.length ? typeLabels : ['No Data'],
      datasets: [{
        data: typeDataAbs.length ? typeDataAbs : [1],
        backgroundColor: typeDataAbs.length ? colors : ['#2a3550'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      onClick(event, elements) {
        if (!elements.length || !typeLabels.length) return;
        const clickedLabel = typeLabels[elements[0].index];
        if (portfolioFilter && portfolioFilter.source === 'type' && portfolioFilter.value === clickedLabel) {
          portfolioFilter = null;
        } else {
          portfolioFilter = { source: 'type', value: clickedLabel };
        }
        renderHoldings();
      },
      onHover(event, elements) {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    }
  });

  renderLegend('portfolioTypeLegend', typeLabels, typeData, colors, true);
}

function accountValue(acc, convertToEur = false) {
  let value = 0;
  let currency = acc.coin || 'USD';
  
  if (acc.type === 'asset_account') {
    // For asset accounts, sum up holdings - all in same currency per account
    value = state.holdings
      .filter(h => h.account_id === acc.id)
      .reduce((sum, h) => {
        const asset = state.assets.find(a => a.id === h.asset_id);
        if (asset) {
          // Use asset's currency
          currency = asset.coin || currency;
          return sum + (Number(asset.price || 0) * Number(h.quantity || 0));
        }
        return sum;
      }, 0);
  } else {
    value = Number(acc.balance || 0);
  }
  
  return convertToEur ? convertToEUR(value, currency) : value;
}

function totalPortfolioValue() {
  return state.accounts.reduce((sum, acc) => sum + accountValue(acc, true), 0);
}

function providerValue(provider) {
  const providerAccounts = state.accounts.filter(a => a.provider_id === provider.id);
  return providerAccounts.reduce((sum, acc) => sum + accountValue(acc, true), 0);
}

function updateNavVisibility() {
  const hasAssetAccounts = state.accounts.some(a => a.type === 'asset_account');
  const hasAnyAccounts = state.accounts.length > 0;
  const hasProviders = state.providers.length > 0;
  const set = (id, show) => { const el = $(id); if (el) el.style.display = show ? 'flex' : 'none'; };
  set('#navPortfolio', hasAssetAccounts);
  set('#navAssets', hasAssetAccounts);
  set('#navDividends', hasAssetAccounts);
  set('#navGoals', hasAnyAccounts);
  const newAccountBtn = $('#newAccountBtn');
  if (newAccountBtn) {
    newAccountBtn.disabled = !hasProviders;
    newAccountBtn.title = hasProviders ? '' : 'Create a provider first.';
  }
}

function render() {
  const totalVal = totalPortfolioValue();
  
  if ($('#providerCount')) $('#providerCount').textContent = state.providers.length;
  if ($('#accountCount')) $('#accountCount').textContent = state.accounts.length;

  // Global Value - color by sign (red negative, green positive, white zero)
  const portfolioValueEl = $('#portfolioValue');
  if (portfolioValueEl) {
    portfolioValueEl.textContent = moneyEUR.format(totalVal);
    portfolioValueEl.className = 'value ' + (totalVal < 0 ? 'neg' : (totalVal > 0 ? 'pos' : ''));
  }

  // Debit (sum of positive accounts) / Credit (sum of negative accounts)
  let debit = 0;
  let credit = 0;
  state.accounts.forEach(acc => {
    const val = accountValue(acc, true);
    if (val > 0) debit += val;
    else credit += val;
  });
  const debitCreditValue = $('#debitCreditValue');
  if (debitCreditValue) {
    debitCreditValue.innerHTML = `<span class="pos">${moneyEUR.format(debit)}</span><br><span class="neg">${moneyEUR.format(credit)}</span>`;
  }

  dashboardFilter = null;
  portfolioFilter = null;
  renderDashboardAccounts();

  renderAssets();
  fillDividendPeriodValue();
  renderDividends();
  renderAccounts();
  updateToggleAllLabel();
  renderHoldings();
  renderGoals();
  renderUsers();
  fillSelects();
  renderCharts();
  renderPortfolioCards();
  renderPortfolioCharts();

  const write = isWriteAllowed();
  const admin = isAdminUser();
  document.querySelectorAll('.write-action').forEach(el => el.style.display = write ? '' : 'none');
  document.querySelectorAll('.admin-action').forEach(el => el.style.display = admin ? '' : 'none');
  if ($('#adminSectionLabel')) $('#adminSectionLabel').style.display = admin ? 'block' : 'none';
  if ($('#navImport')) $('#navImport').style.display = admin ? 'flex' : 'none';
  if ($('#navExport')) $('#navExport').style.display = admin ? 'flex' : 'none';
  if ($('#navUsers')) $('#navUsers').style.display = admin ? 'flex' : 'none';
  updateNavVisibility();
}

function renderAssets() {
  const searchInput = $('#assetSearch')?.value.toLowerCase() || '';
  const typeFilter = $('#assetTypeFilter')?.value || '';
  const items = state.assets.filter(a => (!typeFilter || a.type === typeFilter) && `${a.symbol || ''} ${a.name}`.toLowerCase().includes(searchInput));
  const admin = isAdminUser();

  if ($('#assetsTable')) {
    $('#assetsTable').innerHTML = items.length ? items.map(a => `
      <tr>
        <td><strong>${esc(a.symbol || '—')}</strong></td>
        <td>${esc(a.name)}</td>
        <td><span class="tag ${a.type}">${esc(a.type)}</span></td>
        <td>${a.price == null ? '—' : formatCurrency(a.price, a.coin || 'USD')}</td>
        <td>${a.dividend_yield == null ? '—' : `${a.dividend_yield}%`}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${admin ? `<button class="btn-sm" data-update-asset="${a.id}">Update</button>` : ''}
            ${admin ? `<button class="btn-sm" data-edit-asset="${a.id}">Edit</button>` : ''}
            ${admin ? `<button class="btn-sm danger" data-delete-asset="${a.id}">Delete</button>` : ''}
            <button class="btn-sm" data-add-asset-to-account="${a.id}">+ Add to Account</button>
          </div>
        </td>
      </tr>
    `).join('') : emptyRow(6, 'No assets found.');
  }
}

function fillDividendPeriodValue() {
  const type = $('#dividendPeriodType')?.value || '';
  const valueSelect = $('#dividendPeriodValue');
  if (!valueSelect) return;
  let options = '';
  if (type === 'month') {
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    options = names.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  } else if (type === 'trimester') {
    options = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)']
      .map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  } else if (type === 'semester') {
    options = ['H1 (Jan–Jun)', 'H2 (Jul–Dec)']
      .map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  }
  valueSelect.innerHTML = options;
  valueSelect.style.display = type ? '' : 'none';
}

function renderDividends() {
  if (!$('#dividendsTable')) return;
  // Only assets with dividend data (a yield set)
  const items = state.assets.filter(a => a.dividend_yield != null);

  const periodType = $('#dividendPeriodType')?.value || '';
  const periodValue = Number($('#dividendPeriodValue')?.value);

  const filtered = items.filter(a => {
    if (!periodType) return true;
    const months = a.payment_months || [];
    if (periodType === 'month') return months.includes(periodValue);
    if (periodType === 'trimester') {
      const start = (periodValue - 1) * 3 + 1;
      return months.some(m => m >= start && m <= start + 2);
    }
    if (periodType === 'semester') {
      const start = (periodValue - 1) * 6 + 1;
      return months.some(m => m >= start && m <= start + 5);
    }
    return true;
  });

  const monthMatchesFilter = (m) => {
    if (!periodType) return false;
    if (periodType === 'month') return m === periodValue;
    if (periodType === 'trimester') {
      const start = (periodValue - 1) * 3 + 1;
      return m >= start && m <= start + 2;
    }
    if (periodType === 'semester') {
      const start = (periodValue - 1) * 6 + 1;
      return m >= start && m <= start + 5;
    }
    return false;
  };

  $('#dividendsTable').innerHTML = filtered.length ? filtered.map(a => {
    const months = a.payment_months || [];
    const dots = monthLabels.map((label, i) => {
      const m = i + 1;
      const paid = months.includes(m);
      const match = paid && monthMatchesFilter(m);
      const cls = match ? 'match' : (paid ? 'paid' : '');
      return `<span class="month-dot ${cls}">${label}</span>`;
    }).join('');
    return `<tr>
      <td><strong>${esc(a.symbol || '—')}</strong></td>
      <td>${esc(a.name)}</td>
      <td>${a.dividend_yield == null ? '—' : `${a.dividend_yield}%`}</td>
      <td><div class="month-dots">${dots}</div></td>
    </tr>`;
  }).join('') : emptyRow(4, 'No dividend data.');
}

function updateToggleAllLabel() {
  const btn = $('#toggleAllProvidersBtn');
  if (!btn) return;
  const allCollapsed = state.providers.length > 0 && state.providers.every(p => collapsedProviders.has(p.id));
  btn.textContent = allCollapsed ? 'Expand All' : 'Collapse All';
}

function renderAccounts() {
  if (!$('#accountsList')) return;
  const grouped = {};
  state.providers.forEach(p => {
    grouped[p.id] = {
      provider: p,
      accounts: state.accounts.filter(a => a.provider_id === p.id)
    };
  });

  const html = Object.values(grouped).map(g => {
    const accountsHTML = g.accounts.map(acc => {
      const val = accountValue(acc, false);
      const currency = acc.coin || 'USD';
      const label = typeLabel(acc.type);
      let details = '';
      if (acc.type === 'asset_account') {
        const holdingCount = state.holdings.filter(h => h.account_id === acc.id).length;
        details = `<div class="account-detail-grid">
          <div><div class="dlabel">Holdings</div><div class="dvalue">${holdingCount} assets</div></div>
          <div><div class="dlabel">Value</div><div class="dvalue ${val < 0 ? 'neg' : 'pos'}">${formatCurrency(val, currency)}</div></div>
        </div>`;
      } else if (acc.type === 'loan' || acc.type === 'interest_account') {
        details = `<div class="account-detail-grid">
          <div><div class="dlabel">Balance</div><div class="dvalue ${val < 0 ? 'neg' : 'pos'}">${formatCurrency(val, currency)}</div></div>
          <div><div class="dlabel">Interest Rate</div><div class="dvalue">${acc.interest_rate != null ? Number(acc.interest_rate).toFixed(2) : '0.00'}%</div></div>
        </div>`;
      } else {
        details = `<div class="account-detail-grid">
          <div><div class="dlabel">Balance</div><div class="dvalue ${val < 0 ? 'neg' : 'pos'}">${formatCurrency(val, currency)}</div></div>
        </div>`;
      }

      return `<div class="account-card">
        <div class="account-card-head">
          <span class="aname">${esc(acc.name)} <span class="tag ${acc.type}">${esc(label)}</span></span>
          <div style="display:flex;gap:6px;">
            <button class="btn-sm" data-edit-account="${acc.id}">Edit</button>
            <button class="btn-sm danger" data-delete-account="${acc.id}">Delete</button>
          </div>
        </div>
        ${details}
      </div>`;
    }).join('') || '<div class="page-desc" style="margin:10px 0;">No accounts under this provider yet.</div>';

    const accCount = g.accounts.length;
    const collapsed = collapsedProviders.has(g.provider.id);
    return `<div class="provider-card${collapsed ? ' collapsed' : ''}">
      <div class="provider-card-head">
        <div class="provider-card-title">
          <button class="provider-toggle" data-toggle-provider="${g.provider.id}" title="${collapsed ? 'Expand' : 'Collapse'}">${collapsed ? '▸' : '▾'}</button>
          <span class="provider-icon">🏢</span>
          <span class="provider-name">${esc(g.provider.name)}</span>
          <span class="tag ${g.provider.type}">${esc(g.provider.type)}</span>
          <span class="provider-count">${accCount} account${accCount === 1 ? '' : 's'}</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn-sm" data-add-account-provider="${g.provider.id}">+ Add Account</button>
          <button class="btn-sm" data-edit-provider="${g.provider.id}">Edit</button>
          <button class="btn-sm danger" data-delete-provider="${g.provider.id}">Delete</button>
        </div>
      </div>
      <div class="provider-card-body">
        ${accountsHTML}
      </div>
    </div>`;
  }).join('') || '<div class="page-desc">No providers created yet. Create a provider first.</div>';

  $('#accountsList').innerHTML = html;
}

function renderHoldings() {
  if (!$('#holdingsTable')) return;

  let holdings = state.holdings;
  let filterLabel = null;

  if (portfolioFilter) {
    if (portfolioFilter.source === 'asset') {
      const val = portfolioFilter.value;
      holdings = state.holdings.filter(h => {
        const asset = state.assets.find(a => a.id === h.asset_id);
        const symbol = h.symbol || asset?.symbol || asset?.name || 'Unknown';
        if (val === 'Others') return portfolioAssetOthers.includes(symbol);
        return symbol === val;
      });
      filterLabel = `Asset: ${val}`;
    } else if (portfolioFilter.source === 'type') {
      const val = portfolioFilter.value;
      holdings = state.holdings.filter(h => {
        const asset = state.assets.find(a => a.id === h.asset_id);
        if (!asset) return false;
        const type = asset.type || 'Other';
        if (val === 'Others') return portfolioTypeOthers.includes(type);
        return type === val;
      });
      filterLabel = `Type: ${val}`;
    }
  }

  const filterBar = $('#portfolioFilterBar');
  if (filterBar) {
    filterBar.innerHTML = filterLabel
      ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--card);border-radius:8px;border:1px solid var(--border);">
          <span style="font-size:13px;color:var(--muted);">Filtered by</span>
          <span style="font-size:13px;font-weight:600;color:var(--accent);">${esc(filterLabel)}</span>
          <span style="font-size:12px;color:var(--muted);">&mdash; click the same slice again to clear</span>
        </div>`
      : '';
  }

  $('#holdingsTable').innerHTML = holdings.length ? holdings.map(h => {
    const asset = state.assets.find(a => a.id === h.asset_id);
    const account = state.accounts.find(a => a.id === h.account_id);
    const provider = account ? state.providers.find(p => p.id === account.provider_id) : null;
    const price = asset ? Number(asset.price || 0) : Number(h.price || 0);
    const value = price * Number(h.quantity || 0);
    const currency = h.coin || asset?.coin || 'USD';
    const symbol = h.symbol || asset?.symbol || '—';
    const name = h.asset_name || asset?.name || '—';
    const accName = h.account_name || account?.name || '—';

    return `<tr>
      <td><strong>${esc(symbol)}</strong> — ${esc(name)}</td>
      <td>${esc(accName)} <span style="color:var(--muted);font-size:11px;">(${esc(provider ? provider.name : '')})</span></td>
      <td>${h.quantity}</td>
      <td>${h.purchase_price == null ? '—' : formatCurrency(h.purchase_price, currency)}</td>
      <td>${formatCurrency(value, currency)}</td>
      <td>${gainLoss({ price, purchase_price: h.purchase_price })}</td>
      <td>${gainLossValue({ price, purchase_price: h.purchase_price, quantity: h.quantity })}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn-sm" data-edit-holding="${h.id}">Edit</button>
          <button class="btn-sm danger" data-delete-holding="${h.id}">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('') : emptyRow(8, 'No holdings yet. Add assets to your asset accounts.');
}

function goalCurrentValue(goal) {
  const linked = state.accounts.filter(a => (goal.account_ids || []).includes(a.id));
  let total = 0;
  linked.forEach(acc => {
    const val = accountValue(acc, false);
    const rate = getExchangeRate(acc.coin || 'USD', goal.coin || 'USD');
    total += rate ? val * rate : val;
  });
  return total;
}

// Build the progress bar HTML for a goal. Handles three cases:
// 1. No sub-goals -> single bar (unchanged behavior).
// 2. Normal goal (value > 0) with sub-goals -> segmented bar + global % label.
// 3. Debt goal (value = 0) with sub-goals -> single bar with sub-goal tick marks + tooltips.
function goalProgressHTML(g, current, target, currency) {
  const subs = [g.sub1, g.sub2, g.sub3].filter(v => v !== null && v !== undefined && v !== '');
  const hasSubs = subs.length > 0;

  // Debt clearing goal (target === 0)
  if (target === 0) {
    const linked = state.accounts.filter(a => (g.account_ids || []).includes(a.id));
    let posSum = 0, negSum = 0;
    linked.forEach(acc => {
      const val = accountValue(acc, false);
      const rate = getExchangeRate(acc.coin || 'USD', currency);
      const converted = rate ? val * rate : val;
      if (converted > 0) posSum += converted; else negSum += converted;
    });
    const absNeg = Math.abs(negSum);
    if (absNeg <= 0) return '';
    const pct = Math.min(100, Math.max(0, (posSum / absNeg) * 100));
    const barColor = `hsl(${pct * 1.2}, 80%, 50%)`;
    const label = `${pct.toFixed(1)}% of debt cleared`;

    if (!hasSubs) {
      return `
        <div class="goal-progress">
          <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${pct}%;background:${barColor};"></div></div>
          <span class="goal-progress-label">${label}</span>
        </div>`;
    }

    // Debt goal with sub-goals: single bar + tick marks at each sub-goal position.
    // Marks count down from 100% (the goal/zero): a sub-goal of -5000 against 100000 debt sits at 95%.
    const marks = subs.map(v => {
      const pos = Math.min(100, Math.max(0, ((absNeg - Math.abs(v)) / absNeg) * 100));
      return `<span class="goal-mark" style="left:${pos}%;" data-tip="${esc(formatCurrency(v, currency))}"></span>`;
    }).join('');
    return `
      <div class="goal-progress">
        <div class="goal-progress-bar goal-progress-bar-marks">
          <div class="goal-progress-fill" style="width:${pct}%;background:${barColor};"></div>
          ${marks}
        </div>
        <span class="goal-progress-label">${label}</span>
      </div>`;
  }

  // Normal goal (target > 0)
  const pct = Math.min(100, Math.max(0, (current / target) * 100));
  const label = `${pct.toFixed(1)}% of target`;

  if (!hasSubs) {
    const barColor = `hsl(${pct * 1.2}, 80%, 50%)`;
    return `
      <div class="goal-progress">
        <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${pct}%;background:${barColor};"></div></div>
        <span class="goal-progress-label">${label}</span>
      </div>`;
  }

  // Normal goal with sub-goals: segmented bar. Segments run 0->sub1->sub2->sub3->target.
  const milestones = subs.concat(target);
  let prev = 0;
  const segments = milestones.map(end => {
    const width = ((end - prev) / target) * 100;
    const segPct = Math.min(100, Math.max(0, ((current - prev) / (end - prev)) * 100));
    const segColor = `hsl(${segPct * 1.2}, 80%, 50%)`;
    const seg = `<div class="goal-seg" style="width:${width}%;"><div class="goal-seg-fill" style="width:${segPct}%;background:${segColor};"></div></div>`;
    prev = end;
    return seg;
  }).join('');

  // Active sub-goal: the next milestone not yet reached. Show its progress %.
  let activeIdx = -1;
  let activePct = 0;
  prev = 0;
  for (let i = 0; i < milestones.length; i++) {
    const end = milestones[i];
    if (current < end) {
      activeIdx = i;
      activePct = Math.min(100, Math.max(0, ((current - prev) / (end - prev)) * 100));
      break;
    }
    prev = end;
  }
  if (activeIdx === -1) {
    activeIdx = milestones.length - 1;
    activePct = 100;
  }
  const activeName = activeIdx < subs.length ? `Sub-goal ${activeIdx + 1}` : 'Sub-target';
  const activeLabel = activePct >= 100 ? '' : `${activeName}: ${activePct.toFixed(1)}%`;

  return `
    <div class="goal-progress">
      <div class="goal-progress-bar goal-progress-bar-seg">${segments}</div>
      <span class="goal-progress-label">${label}</span>
    </div>
    ${activeLabel ? `<div class="goal-sub-label">${esc(activeLabel)}</div>` : ''}`;
}

function renderGoals() {
  if (!$('#goalsList')) return;
  $('#goalsList').innerHTML = state.goals.length ? state.goals.map(g => {
    const current = goalCurrentValue(g);
    const target = Number(g.value || 0);
    const diff = current - target;
    const linked = state.accounts.filter(a => (g.account_ids || []).includes(a.id));
    const linkedNames = linked.map(a => `${esc(a.name)} (${esc(a.provider_name || providerName(a.provider_id))})`).join(', ') || 'No linked accounts';
    const progressHTML = goalProgressHTML(g, current, target, g.coin || 'USD');
    return `
      <div class="goal-card">
        <div class="goal-card-head">
          <span class="goal-name">🎯 ${esc(g.goal_name)} <span class="tag goal">${esc(g.coin || 'USD')}</span></span>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            <button class="btn-sm" data-goal-details="${g.id}">Details</button>
            <button class="btn-sm" data-simulate-goal="${g.id}">Simulate</button>
            <button class="btn-sm" data-duplicate-goal="${g.id}">Duplicate</button>
            <button class="btn-sm" data-edit-goal="${g.id}">Edit</button>
            <button class="btn-sm danger" data-delete-goal="${g.id}">Delete</button>
          </div>
        </div>
        <div class="goal-detail-grid">
          <div><div class="dlabel">Target</div><div class="dvalue">${formatCurrency(target, g.coin || 'USD')}</div></div>
          <div><div class="dlabel">Current</div><div class="dvalue ${current < 0 ? 'neg' : 'pos'}">${formatCurrency(current, g.coin || 'USD')}</div></div>
          <div><div class="dlabel">Difference</div><div class="dvalue ${diff < 0 ? 'neg' : 'pos'}">${diff < 0 ? '−' : '+'}${formatCurrency(Math.abs(diff), g.coin || 'USD')}</div></div>
        </div>
        ${progressHTML}
        <div class="goal-linked">Linked: ${linkedNames}</div>
      </div>`;
  }).join('') : '<div class="page-desc">No goals yet. Create one to start tracking your targets.</div>';
}

function renderUsers() {
  if (!$('#usersTable')) return;
  const currentUserId = state.user?.id;
  $('#usersTable').innerHTML = state.users.length ? state.users.map(u => `
    <tr>
      <td>${esc(u.username)}</td>
      <td>
        <select class="role-select-inline" data-role-user="${u.id}" ${u.id === currentUserId ? 'disabled' : ''}>
          <option value="guest" ${u.role === 'guest' ? 'selected' : ''}>guest</option>
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </td>
      <td>${formatDate(u.created_at || u.created)}</td>
      <td>${formatDate(u.last_login)}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn-sm" data-reset-password-user="${u.id}" data-username="${esc(u.username)}">Reset Password</button>
          ${u.id !== currentUserId ? `<button class="btn-sm danger" data-delete-user="${u.id}">Delete</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('') : emptyRow(5, 'No users found.');
}

function emptyRow(columns, message) { return `<tr><td colspan="${columns}" style="text-align:center;color:var(--muted);">${message}</td></tr>`; }
function providerName(id) { return state.providers.find(p => p.id === Number(id))?.name || '—'; }
function formatDate(value) { return value ? new Date(value.endsWith && value.endsWith('Z') ? value : `${value}`).toLocaleDateString() : '—'; }

function fillHoldingAssetSelect(keepAssetId = null) {
  const select = $('#holdingAsset');
  if (!select) return;
  const typeFilter = $('#holdingAssetTypeFilter')?.value || '';
  const accountId = Number($('#holdingAccount')?.value);
  const existingAssetIds = new Set(
    state.holdings.filter(h => h.account_id === accountId).map(h => h.asset_id)
  );
  if (keepAssetId != null) existingAssetIds.delete(Number(keepAssetId));
  let assets = typeFilter ? state.assets.filter(a => a.type === typeFilter) : state.assets;
  assets = assets.filter(a => !existingAssetIds.has(a.id));
  select.innerHTML = assets.length ? assets.map(a => `<option value="${a.id}">${esc(a.symbol || a.name)} — ${esc(a.name)}</option>`).join('') : '<option value="">No assets available</option>';
}

function fillSelects() {
  if ($('#accountProvider')) {
    $('#accountProvider').innerHTML = state.providers.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.type)})</option>`).join('');
  }
  fillHoldingAssetSelect();
  if ($('#holdingAccount')) {
    const assetAccounts = state.accounts.filter(a => a.type === 'asset_account');
    $('#holdingAccount').innerHTML = assetAccounts.length ? assetAccounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('') : '<option value="">No asset accounts available</option>';
  }
  
  // Fill currency selects with EUR and USD at top
  const currencyOptions = fillCurrencyOptions();
  if ($('#assetCoin')) {
    $('#assetCoin').innerHTML = '<option value="">Select currency...</option>' + currencyOptions;
  }
  if ($('#accountCoin')) {
    $('#accountCoin').innerHTML = '<option value="">Select currency...</option>' + currencyOptions;
  }
  if ($('#goalCoin')) {
    $('#goalCoin').innerHTML = '<option value="">Select currency...</option>' + currencyOptions;
  }
}

function fillCurrencyOptions() {
  const topCurrencies = ['EUR', 'USD'];
  const otherCurrencies = state.currencies.filter(c => !topCurrencies.includes(c.coin)).sort((a, b) => a.coin.localeCompare(b.coin));
  
  const topOptions = topCurrencies.map(code => `<option value="${code}">${code}</option>`).join('');
  const otherOptions = otherCurrencies.map(c => `<option value="${esc(c.coin)}">${esc(c.coin)}</option>`).join('');
  
  return topOptions + (otherOptions ? '<option disabled>───────</option>' + otherOptions : '');
}

function showPage(page) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
}

function showApp() {
  $('#loginScreen').style.display = 'none';
  $('#app').style.display = 'block';
  const role = state.guest ? 'guest' : (state.user?.role || 'user');
  const pill = $('#rolePill');
  if (pill) {
    pill.textContent = role;
    pill.className = `role-pill ${role}`;
  }
  if ($('#usernameLabel')) $('#usernameLabel').textContent = state.guest ? 'Guest' : (state.user?.username || '');
  if ($('#guestBanner')) $('#guestBanner').style.display = state.guest ? 'block' : 'none';
}

function toggleAccountFields() {
  const type = $('#accountTypeSelect')?.value;
  const balField = $('#balanceField');
  const rateField = $('#rateField');
  if (!balField || !rateField) return;
  if (type === 'asset_account') {
    balField.style.display = 'none';
    rateField.style.display = 'none';
  } else if (type === 'loan' || type === 'interest_account') {
    balField.style.display = 'block';
    rateField.style.display = 'block';
  } else {
    balField.style.display = 'block';
    rateField.style.display = 'none';
  }
}

async function signIn(event) {
  event.preventDefault();
  $('#loginError').textContent = '';
  const form = new FormData(event.currentTarget);
  try {
    state.user = (await request('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) })).user;
    state.guest = state.user.role === 'guest';
    showApp();
    await loadData();
    toast(`Signed in as ${state.user.username}`);
    
    // Update currency rates if admin
    if (state.user.role === 'admin') {
      try {
        const result = await request('/admin/update-currency', { method: 'POST' });
        console.log('Currency rates updated:', result.message);
      } catch (error) {
        console.error('Failed to update currency rates:', error.message);
      }
    }
  } catch (error) {
    $('#loginError').textContent = error.message;
  }
}

async function logout() {
  if (state.user) await request('/auth/logout', { method: 'POST' }).catch(() => { });
  location.reload();
}

/* ================= MODAL OPEN / EDIT HELPERS ================= */

function openAssetModal(assetId = null) {
  const form = $('#assetForm');
  if (!form) return;
  form.reset();
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  if (assetId) {
    const a = state.assets.find(item => item.id === assetId);
    if (!a) return;
    $('#assetModalTitle').textContent = 'Edit Asset';
    $('#assetEditId').value = a.id;
    $('#assetName').value = a.name;
    $('#assetSymbol').value = a.symbol || '';
    $('#assetType').value = a.type;
    $('#assetCoin').value = a.coin || 'USD';
    $('#assetPrice').value = a.price ?? '';
    $('#assetYield').value = a.dividend_yield ?? '';
    $('#assetMonths').value = (a.payment_months || []).join(',');
  } else {
    $('#assetModalTitle').textContent = 'New Asset';
    $('#assetEditId').value = '';
    $('#assetCoin').value = 'USD';
  }
  openModal('assetModalOverlay');
}

function openUpdateAssetModal(assetId) {
  const a = state.assets.find(item => item.id === assetId);
  if (!a) return;
  const form = $('#updateAssetForm');
  const progressWrap = $('#updateAssetProgressWrap');
  const err = $('#updateAssetError');
  if (form) form.reset();
  if (err) err.textContent = '';
  $('#updateAssetId').value = a.id;
  $('#updateAssetName').textContent = `${a.symbol || a.name} — ${a.name}`;
  if (form) form.style.display = 'none';
  if (progressWrap) progressWrap.style.display = '';
  setUpdateProgress(0);
  openModal('updateAssetModalOverlay');
  fetchUpdateAssetPrice(a);
}

function setUpdateProgress(percent) {
  const bar = $('#updateAssetProgressBar');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

async function fetchUpdateAssetPrice(a) {
  const err = $('#updateAssetError');
  if (err) err.textContent = '';
  setUpdateLog(null);
  try {
    setUpdateProgress(40);
    const data = await request(`/assets/${a.id}/price`, { method: 'POST' });
    setUpdateProgress(100);
    setUpdateLog(data.raw);
    const price = data.price;
    if (price == null) {
      if (err) err.textContent = data.error || 'No price returned for this asset.';
      return;
    }
    $('#updateAssetPrice').value = price;
    const form = $('#updateAssetForm');
    const progressWrap = $('#updateAssetProgressWrap');
    if (form) form.style.display = '';
    if (progressWrap) progressWrap.style.display = 'none';
  } catch (error) {
    if (err) err.textContent = error.message;
    setUpdateLog({ error: error.message });
  }
}

function setUpdateLog(value) {
  const wrap = $('#updateAssetLogWrap');
  const pre = $('#updateAssetLog');
  if (!wrap || !pre) return;
  if (value == null) {
    wrap.style.display = 'none';
    pre.textContent = '';
    return;
  }
  wrap.style.display = '';
  pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// --- Bulk "Update All Prices" (admin) ---
// Massive free tier allows 5 calls/minute; we cap at 4 to be safe.
const BULK_UPDATE_RATE_LIMIT_MS = 15000; // 60s / 4 calls

function bulkUpdateEligibleAssets() {
  return state.assets.filter(a => a.type === 'stock' && (a.coin || 'USD') === 'USD');
}

function setBulkUpdateProgress(updated, total) {
  const bar = $('#updateAllPricesProgressBar');
  const label = $('#updateAllPricesLabel');
  if (bar) bar.style.width = `${total ? Math.round((updated / total) * 100) : 0}%`;
  if (label) label.textContent = `Updating ${updated} of ${total}...`;
}

function appendBulkUpdateLog(line) {
  const wrap = $('#updateAllPricesLogWrap');
  const pre = $('#updateAllPricesLog');
  if (!wrap || !pre) return;
  wrap.style.display = '';
  pre.textContent += (pre.textContent ? '\n' : '') + line;
  pre.scrollTop = pre.scrollHeight;
}

function openBulkUpdateModal() {
  const eligible = bulkUpdateEligibleAssets();
  const err = $('#updateAllPricesError');
  const logWrap = $('#updateAllPricesLogWrap');
  const pre = $('#updateAllPricesLog');
  if (err) err.textContent = '';
  if (logWrap) logWrap.style.display = 'none';
  if (pre) pre.textContent = '';
  setBulkUpdateProgress(0, eligible.length);
  openModal('updateAllPricesModalOverlay');
  runBulkUpdate(eligible);
}

async function runBulkUpdate(eligible) {
  const err = $('#updateAllPricesError');
  const total = eligible.length;
  let updated = 0;
  let failed = 0;

  if (total === 0) {
    if (err) err.textContent = 'No USD stocks to update.';
    appendBulkUpdateLog('No USD stocks found to update.');
    setBulkUpdateProgress(0, 0);
    return;
  }

  appendBulkUpdateLog(`Starting bulk update of ${total} USD stock(s).`);
  appendBulkUpdateLog(`Rate limit: 4 Massive calls/minute (${BULK_UPDATE_RATE_LIMIT_MS / 1000}s between calls).`);

  for (let i = 0; i < total; i++) {
    const a = eligible[i];
    try {
      // Fetch latest price from Massive (respects the 4/min cap).
      const data = await request(`/assets/${a.id}/price`, { method: 'POST' });
      const price = data.price;
      if (price == null) {
        failed++;
        appendBulkUpdateLog(`[ERROR] ${a.symbol || a.name}: no price returned.`);
      } else {
        // Commit the fetched price.
        await request(`/assets/${a.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: a.name,
            symbol: a.symbol || '',
            type: a.type,
            coin: a.coin || 'USD',
            price: Number(price),
            payment_months: a.payment_months || []
          })
        });
        updated++;
        appendBulkUpdateLog(`[OK] ${a.symbol || a.name}: ${price}`);
      }
    } catch (error) {
      failed++;
      appendBulkUpdateLog(`[ERROR] ${a.symbol || a.name}: ${error.message}`);
    }
    setBulkUpdateProgress(updated + failed, total);
    // Wait between calls to respect the rate limit (skip after the last one).
    if (i < total - 1) {
      await new Promise(resolve => setTimeout(resolve, BULK_UPDATE_RATE_LIMIT_MS));
    }
  }

  appendBulkUpdateLog(`Done. Updated ${updated}, failed ${failed}.`);
  if (err) err.textContent = failed ? `${failed} asset(s) failed. See console log.` : '';
  await loadData();
  toast(`Bulk update finished: ${updated} updated, ${failed} failed.`);
}

function openProviderModal(providerId = null) {
  const form = $('#providerForm');
  if (!form) return;
  form.reset();
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  if (providerId) {
    const p = state.providers.find(item => item.id === providerId);
    if (!p) return;
    $('#providerModalTitle').textContent = 'Edit Provider';
    $('#providerEditId').value = p.id;
    $('#providerName').value = p.name;
    $('#providerType').value = p.type;
  } else {
    $('#providerModalTitle').textContent = 'New Provider';
    $('#providerEditId').value = '';
  }
  openModal('providerModalOverlay');
}

function openAccountModal(accountId = null, providerId = null) {
  if (!state.providers.length) return toast('Create a provider first.');
  fillSelects();
  const form = $('#accountForm');
  if (!form) return;
  form.reset();
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  const providerField = $('#accountProvider')?.closest('.field');
  if (accountId) {
    const acc = state.accounts.find(a => a.id === accountId);
    if (!acc) return;
    $('#accountModalTitle').textContent = 'Edit Account';
    $('#accountEditId').value = acc.id;
    $('#accountProvider').value = acc.provider_id;
    $('#accountName').value = acc.name;
    $('#accountTypeSelect').value = acc.type;
    $('#accountCoin').value = acc.coin || 'USD';
    $('#accountBalanceInput').value = acc.balance ?? '';
    $('#accountRateInput').value = acc.interest_rate ?? '';
    if (providerField) providerField.style.display = '';
  } else {
    $('#accountModalTitle').textContent = 'New Account';
    $('#accountEditId').value = '';
    $('#accountCoin').value = 'USD';
    if (providerId) {
      $('#accountProvider').value = providerId;
      if (providerField) providerField.style.display = 'none';
    } else {
      if (providerField) providerField.style.display = '';
    }
  }
  toggleAccountFields();
  openModal('accountModalOverlay');
}

function openHoldingModal(assetId = null, holdingId = null) {
  if (!state.assets.length) return toast('Create an asset first.');
  const assetAccounts = state.accounts.filter(a => a.type === 'asset_account');
  if (!assetAccounts.length) return toast('Create an asset account first.');
  const form = $('#holdingForm');
  if (!form) return;
  form.reset();
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  if (holdingId) {
    const h = state.holdings.find(item => item.id === holdingId);
    if (!h) return;
    const asset = state.assets.find(a => a.id === h.asset_id);
    if ($('#holdingAssetTypeFilter')) $('#holdingAssetTypeFilter').value = asset?.type || '';
    fillSelects();
    $('#holdingAccount').value = h.account_id;
    fillHoldingAssetSelect(h.asset_id);
    $('#holdingModalTitle').textContent = 'Edit Holding';
    $('#holdingEditId').value = h.id;
    $('#holdingAsset').value = h.asset_id;
    $('#holdingQty').value = h.quantity;
    $('#holdingPurchasePrice').value = h.purchase_price ?? '';
  } else {
    if ($('#holdingAssetTypeFilter')) $('#holdingAssetTypeFilter').value = '';
    fillSelects();
    $('#holdingModalTitle').textContent = 'Add Holding';
    $('#holdingEditId').value = '';
    if (assetId) $('#holdingAsset').value = assetId;
  }
  openModal('holdingModalOverlay');
}

/* ================= GOAL MODAL HELPERS ================= */

let goalSelectedAccounts = [];

function goalAccountLabel(acc) {
  return `${acc.name} (${acc.provider_name || providerName(acc.provider_id)})`;
}

function renderGoalAccountsList() {
  const list = $('#goalAccountsList');
  if (!list) return;
  const selected = state.accounts.filter(a => goalSelectedAccounts.includes(a.id));
  list.innerHTML = selected.length ? selected.map(a => `
    <div class="goal-account-chip">
      <span>${esc(goalAccountLabel(a))}</span>
      <button type="button" class="goal-chip-remove" data-remove-goal-account="${a.id}">×</button>
    </div>
  `).join('') : '<div class="page-desc" style="margin:0;">No accounts linked yet.</div>';
}

function fillGoalAccountSelects() {
  const providerSelect = $('#goalProviderSelect');
  const accountSelect = $('#goalAccountSelect');
  if (!providerSelect || !accountSelect) return;
  if (!providerSelect.options.length) {
    providerSelect.innerHTML = state.providers.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.type)})</option>`).join('');
  }
  const providerId = Number(providerSelect.value);
  const available = state.accounts.filter(a => a.provider_id === providerId && !goalSelectedAccounts.includes(a.id));
  accountSelect.innerHTML = available.length ? available.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('') : '<option value="">No accounts available</option>';
}

function openGoalModal(goalId = null) {
  fillSelects();
  const form = $('#goalForm');
  if (!form) return;
  form.reset();
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  goalSelectedAccounts = [];
  if (goalId) {
    const g = state.goals.find(item => item.id === goalId);
    if (!g) return;
    $('#goalModalTitle').textContent = 'Edit Goal';
    $('#goalEditId').value = g.id;
    $('#goalName').value = g.goal_name;
    $('#goalValue').value = g.value;
    $('#goalSub1').value = g.sub1 ?? '';
    $('#goalSub2').value = g.sub2 ?? '';
    $('#goalSub3').value = g.sub3 ?? '';
    $('#goalCoin').value = g.coin || 'USD';
    goalSelectedAccounts = (g.account_ids || []).slice();
  } else {
    $('#goalModalTitle').textContent = 'New Goal';
    $('#goalEditId').value = '';
    $('#goalCoin').value = 'USD';
  }
  updateGoalSubGating();
  renderGoalAccountsList();
  fillGoalAccountSelects();
  openModal('goalModalOverlay');
}

// Filter sub-goal input to only allow digits and a leading minus sign.
function filterSubInput(input) {
  if (!input) return;
  let v = input.value;
  v = v.replace(/[^0-9.-]/g, '');
  v = v.replace(/(?!^)-/g, '');
  v = v.replace(/(\..*)\./g, '$1');
  if (v !== input.value) input.value = v;
}

function updateGoalSubGating() {
  // No live restrictions while typing; only filter characters.
  filterSubInput($('#goalSub1'));
  filterSubInput($('#goalSub2'));
  filterSubInput($('#goalSub3'));
}

// Validate sub-goals before saving. Returns an error message or null.
function validateGoalSubs(value, sub1, sub2, sub3) {
  const subs = [sub1, sub2, sub3];
  const has = subs.map(s => s !== null && s !== undefined && s !== '');
  if (!has[0] && !has[1] && !has[2]) return null;

  // Dependency chain: sub2 requires sub1, sub3 requires sub2.
  if (has[1] && !has[0]) return 'Sub-goal 2 requires Sub-goal 1 to be set.';
  if (has[2] && !has[1]) return 'Sub-goal 3 requires Sub-goal 2 to be set.';

  const nums = subs.map(s => (s === null || s === undefined || s === '' ? null : Number(s)));
  for (const n of nums) {
    if (n !== null && !Number.isFinite(n)) return 'Sub-goals must be valid numbers.';
  }

  if (value === 0) {
    // Debt goal: sub-goals must be negative.
    if (nums.some(n => n !== null && n >= 0)) return 'For a debt-clearing goal, sub-goals must be negative.';
  } else {
    // Positive goal: sub-goals must be positive, < target, and ascending (goal > sub3 > sub2 > sub1).
    let prev = 0;
    for (const n of nums) {
      if (n === null) continue;
      if (n <= 0 || n >= value || n <= prev) return 'Sub-goals must be positive, less than the target, and in ascending order (target > sub3 > sub2 > sub1).';
      prev = n;
    }
  }
  return null;
}

/* ================= GOAL DETAILS ================= */

function openGoalDetailsModal(goalId) {
  const g = state.goals.find(item => item.id === goalId);
  if (!g) return;
  goalDetailsGoalId = goalId;
  const currency = g.coin || 'USD';
  $('#goalDetailsTitle').textContent = `Details: ${g.goal_name}`;

  const linked = state.accounts.filter(a => (g.account_ids || []).includes(a.id));
  const current = goalCurrentValue(g);
  const target = Number(g.value || 0);
  const diff = current - target;

  // Summary
  const summary = $('#goalDetailsSummary');
  if (summary) {
    summary.innerHTML = `
      <div><div class="dlabel">Target</div><div class="dvalue">${formatCurrency(target, currency)}</div></div>
      <div><div class="dlabel">Current</div><div class="dvalue ${current < 0 ? 'neg' : 'pos'}">${formatCurrency(current, currency)}</div></div>
      <div><div class="dlabel">Difference</div><div class="dvalue ${diff < 0 ? 'neg' : 'pos'}">${diff < 0 ? '−' : '+'}${formatCurrency(Math.abs(diff), currency)}</div></div>
      <div><div class="dlabel">Accounts</div><div class="dvalue">${linked.length}</div></div>
    `;
  }

  // Progress bar (same logic as the goal card, including sub-goal display)
  const progressEl = $('#goalDetailsProgress');
  if (progressEl) {
    progressEl.innerHTML = goalProgressHTML(g, current, target, currency);
  }

  // Per-account values, converted to goal currency, sorted descending
  const accountMap = {};
  linked.forEach(acc => {
    const val = accountValue(acc, false);
    const rate = getExchangeRate(acc.coin || 'USD', currency);
    const converted = rate ? val * rate : val;
    const label = `${acc.name} (${acc.provider_name || providerName(acc.provider_id)})`;
    accountMap[label] = (accountMap[label] || 0) + converted;
  });
  const entries = Object.entries(accountMap).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(e => e[0]);
  const data = entries.map(e => e[1]);
  const dataAbs = data.map(v => Math.abs(v));
  const colors = CHART_COLORS;

  // Largest contributor / largest debt callout
  const calloutEl = $('#goalDetailsCallout');
  if (calloutEl && entries.length) {
    const top = entries[0];
    const topLabel = top[0];
    const topVal = top[1];
    const isDebt = topVal < 0;
    calloutEl.innerHTML = `
      <span class="goal-details-callout-icon">${isDebt ? '💳' : '📈'}</span>
      <span><strong>${isDebt ? 'Largest debt' : 'Largest contributor'}:</strong> ${esc(topLabel)} — ${formatCurrency(Math.abs(topVal), currency)}</span>
    `;
  } else if (calloutEl) {
    calloutEl.innerHTML = '';
  }

  // Donut chart
  if (typeof Chart !== 'undefined') {
    if (goalDetailsChartInstance) goalDetailsChartInstance.destroy();
    const ctx = document.getElementById('goalDetailsChart')?.getContext('2d');
    if (ctx) {
      goalDetailsChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels.length ? labels : ['No Data'],
          datasets: [{
            data: dataAbs.length ? dataAbs : [1],
            backgroundColor: dataAbs.length ? colors : ['#2a3550'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });
    }
  }

  // Legend (reuse dashboard renderLegend which handles negatives + absolute values)
  renderLegend('goalDetailsLegend', labels, data, colors);

  openModal('goalDetailsModalOverlay');
}

/* ================= GOAL SIMULATOR ================= */

let goalSimChartInstance = null;

function openGoalSimModal(goalId) {
  const g = state.goals.find(item => item.id === goalId);
  if (!g) return;
  const form = $('#goalSimForm');
  if (!form) return;
  form.reset();
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  $('#goalSimId').value = g.id;
  $('#goalSimTitle').textContent = `Simulate: ${g.goal_name}`;
  $('#goalSimResult').innerHTML = '';
  openModal('goalSimModalOverlay');
}

function goalSimData(g) {
  const target = Number(g.value || 0);
  const linked = state.accounts.filter(a => (g.account_ids || []).includes(a.id));
  const currency = g.coin || 'USD';

  if (target === 0) {
    // Debt clearing: debt = |current net value|
    const current = goalCurrentValue(g);
    return { type: 'debt', start: Math.abs(current), target: 0, currency };
  }

  // Savings goal: go from current net value to target
  const current = goalCurrentValue(g);
  return { type: 'savings', start: current, target, currency };
}

function runGoalSimulation() {
  const form = $('#goalSimForm');
  if (!form) return;
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  const goalId = Number($('#goalSimId').value);
  const monthly = Number($('#goalSimMonthly').value);
  const g = state.goals.find(item => item.id === goalId);
  if (!g) return;
  if (!monthly || monthly <= 0) {
    if (err) err.textContent = 'Enter a monthly contribution greater than 0.';
    return;
  }

  const { type, start, target, currency } = goalSimData(g);
  const result = $('#goalSimResult');
  if (!result) return;

  // Build month-by-month projection
  const labels = [];
  const values = [];
  const now = new Date();
  let value = start;
  let months = 0;
  const maxMonths = 1200; // safety cap (100 years)

  if (type === 'debt') {
    // value is the remaining debt; monthly reduces it
    if (value <= 0) {
      labels.push('Now');
      values.push(0);
    } else {
      while (value > 0 && months < maxMonths) {
        value = Math.max(0, value - monthly);
        months++;
        const d = new Date(now.getFullYear(), now.getMonth() + months, 1);
        labels.push(d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }));
        values.push(value);
      }
    }
  } else {
    // savings: value grows toward target
    if (value >= target) {
      labels.push('Now');
      values.push(value);
    } else {
      while (value < target && months < maxMonths) {
        value += monthly;
        months++;
        const d = new Date(now.getFullYear(), now.getMonth() + months, 1);
        labels.push(d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }));
        values.push(value);
      }
    }
  }

  const reached = (type === 'debt' && value <= 0) || (type === 'savings' && value >= target);
  const reachedDate = reached && months > 0
    ? new Date(now.getFullYear(), now.getMonth() + months, 1)
    : null;

  const reachedLabel = reachedDate
    ? reachedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : (months >= maxMonths ? 'More than 100 years' : 'Already reached');

  const totalContrib = monthly * months;

  result.innerHTML = `
    <div class="goal-sim-summary">
      <div><div class="dlabel">Projected Reach</div><div class="dvalue">${esc(reachedLabel)}</div></div>
      <div><div class="dlabel">Months</div><div class="dvalue">${months}</div></div>
      <div><div class="dlabel">Total Contributed</div><div class="dvalue">${formatCurrency(totalContrib, currency)}</div></div>
    </div>
    <div style="position:relative;height:220px;margin-top:16px;"><canvas id="goalSimChart"></canvas></div>
  `;

  // Render chart
  if (typeof Chart !== 'undefined') {
    if (goalSimChartInstance) goalSimChartInstance.destroy();
    const ctx = document.getElementById('goalSimChart')?.getContext('2d');
    if (ctx) {
      goalSimChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: type === 'debt' ? 'Remaining debt' : 'Projected value',
            data: values,
            borderColor: '#4f8cff',
            backgroundColor: 'rgba(79,140,255,.15)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#4f8cff',
            pointBorderColor: '#e6ebf5',
            pointBorderWidth: 1.5,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { maxTicksLimit: 8, color: '#e6ebf5' }, grid: { color: 'rgba(255,255,255,.05)' } },
            y: { ticks: { color: '#e6ebf5' }, grid: { color: 'rgba(255,255,255,.05)' } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }
}

/* ================= EVENT LISTENERS ================= */

document.addEventListener('DOMContentLoaded', async () => {
  $('#loginForm')?.addEventListener('submit', signIn);
  $('#guestButton')?.addEventListener('click', async () => { state.guest = true; state.user = null; showApp(); await loadData(); toast('Signed in as Guest'); });
  $('#logoutButton')?.addEventListener('click', logout);

  // Pressing Escape closes any open modal without saving.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAllModals();
  });

  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
  $('#assetSearch')?.addEventListener('input', renderAssets);
  $('#assetTypeFilter')?.addEventListener('change', renderAssets);
  $('#dividendPeriodType')?.addEventListener('change', () => { fillDividendPeriodValue(); renderDividends(); });
  $('#dividendPeriodValue')?.addEventListener('change', renderDividends);
  $('#accountTypeSelect')?.addEventListener('change', toggleAccountFields);
  $('#goalProviderSelect')?.addEventListener('change', fillGoalAccountSelects);
  $('#goalSub1')?.addEventListener('input', updateGoalSubGating);
  $('#goalSub2')?.addEventListener('input', updateGoalSubGating);
  $('#goalSub3')?.addEventListener('input', updateGoalSubGating);
  $('#addGoalAccountBtn')?.addEventListener('click', () => {
    const accountSelect = $('#goalAccountSelect');
    const accountId = Number(accountSelect?.value);
    if (!accountId) return toast('Select an account to add.');
    if (!goalSelectedAccounts.includes(accountId)) goalSelectedAccounts.push(accountId);
    renderGoalAccountsList();
    fillGoalAccountSelects();
  });

  // Modal open triggers
  $('#newAssetBtn')?.addEventListener('click', () => openAssetModal());
  $('#updateAllPricesBtn')?.addEventListener('click', () => openBulkUpdateModal());
  $('#newProviderBtn')?.addEventListener('click', () => openProviderModal());
  $('#newAccountBtn')?.addEventListener('click', () => openAccountModal());
  $('#toggleAllProvidersBtn')?.addEventListener('click', () => {
    const allCollapsed = state.providers.length > 0 && state.providers.every(p => collapsedProviders.has(p.id));
    if (allCollapsed) {
      collapsedProviders.clear();
    } else {
      state.providers.forEach(p => collapsedProviders.add(p.id));
    }
    renderAccounts();
    updateToggleAllLabel();
  });
  $('#newHoldingBtn')?.addEventListener('click', () => openHoldingModal());
  $('#holdingAssetTypeFilter')?.addEventListener('change', () => fillHoldingAssetSelect());
  $('#holdingAccount')?.addEventListener('change', () => fillHoldingAssetSelect());
  $('#newGoalBtn')?.addEventListener('click', () => openGoalModal());
  $('#newUserBtn')?.addEventListener('click', () => openModal('userModalOverlay'));

  // Modal close buttons
  $('#closeAssetModalBtn')?.addEventListener('click', () => closeModal('assetModalOverlay'));
  $('#closeUpdateAssetModalBtn')?.addEventListener('click', () => closeModal('updateAssetModalOverlay'));
  $('#closeUpdateAllPricesBtn')?.addEventListener('click', () => closeModal('updateAllPricesModalOverlay'));
  $('#closeProviderModalBtn')?.addEventListener('click', () => closeModal('providerModalOverlay'));
  $('#closeAccountModalBtn')?.addEventListener('click', () => closeModal('accountModalOverlay'));
  $('#closeHoldingModalBtn')?.addEventListener('click', () => closeModal('holdingModalOverlay'));
  $('#closeGoalModalBtn')?.addEventListener('click', () => closeModal('goalModalOverlay'));
  $('#closeGoalSimBtn')?.addEventListener('click', () => closeModal('goalSimModalOverlay'));
  $('#goalSimForm')?.addEventListener('submit', event => { event.preventDefault(); runGoalSimulation(); });
  $('#closeGoalDetailsBtn')?.addEventListener('click', () => closeModal('goalDetailsModalOverlay'));
  $('#goalDetailsSimulateBtn')?.addEventListener('click', () => {
    if (goalDetailsGoalId == null) return;
    closeModal('goalDetailsModalOverlay');
    openGoalSimModal(goalDetailsGoalId);
  });
  $('#closeUserModalBtn')?.addEventListener('click', () => closeModal('userModalOverlay'));
  $('#closeResetPasswordModalBtn')?.addEventListener('click', () => closeModal('resetPasswordModalOverlay'));

  // Save Asset (New / Edit)
  $('#assetForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const err = $('#assetForm .form-error'); if (err) err.textContent = '';
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    const assetId = values.asset_id ? Number(values.asset_id) : null;
    const months = values.payment_months ? values.payment_months.split(/[,|]/).map(m => Number(m.trim())).filter(m => m >= 1 && m <= 12) : [];

    if (state.guest) {
      if (assetId) {
        const a = guestData.assets.find(item => item.id === assetId);
        if (a) {
          a.name = values.name;
          a.symbol = (values.symbol || '').toUpperCase();
          a.type = values.type;
          a.coin = values.coin || 'USD';
          a.price = numeric(values.price);
          a.dividend_yield = numeric(values.dividend_yield);
          a.payment_months = months;
        }
      } else {
        const newId = Math.max(...guestData.assets.map(a => a.id), 0) + 1;
        guestData.assets.push({
          id: newId,
          name: values.name,
          symbol: (values.symbol || '').toUpperCase(),
          type: values.type,
          coin: values.coin || 'USD',
          price: numeric(values.price),
          dividend_yield: numeric(values.dividend_yield),
          payment_months: months
        });
      }
      closeModal('assetModalOverlay');
      if ($('#assetSearch')) $('#assetSearch').value = '';
      if ($('#assetTypeFilter')) $('#assetTypeFilter').value = '';
      await loadData();
      toast(assetId ? 'Asset updated.' : 'New asset added.');
      return;
    }

    try {
      if (assetId) {
        await request(`/assets/${assetId}`, { method: 'PUT', body: JSON.stringify(values) });
      } else {
        await request('/assets', { method: 'POST', body: JSON.stringify(values) });
      }
      closeModal('assetModalOverlay');
      if ($('#assetSearch')) $('#assetSearch').value = '';
      if ($('#assetTypeFilter')) $('#assetTypeFilter').value = '';
      await loadData();
      toast(assetId ? 'Asset updated.' : 'New asset saved.');
    } catch (error) {
      if (err) err.textContent = error.message;
    }
  });

  // Update Asset Value (Commit)
  $('#updateAssetForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const err = $('#updateAssetError'); if (err) err.textContent = '';
    const assetId = Number($('#updateAssetId')?.value);
    const a = state.assets.find(item => item.id === assetId);
    if (!a) return;
    const price = $('#updateAssetPrice')?.value;

    if (state.guest) {
      a.price = numeric(price);
      closeModal('updateAssetModalOverlay');
      await loadData();
      toast('Asset value updated.');
      return;
    }

    try {
      await request(`/assets/${assetId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: a.name,
          symbol: a.symbol || '',
          type: a.type,
          coin: a.coin || 'USD',
          price: price === '' ? null : Number(price),
          payment_months: a.payment_months || []
        })
      });
      closeModal('updateAssetModalOverlay');
      await loadData();
      toast('Asset value updated.');
    } catch (error) {
      if (err) err.textContent = error.message;
    }
  });

  // Save Provider (New / Edit)
  $('#providerForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const err = $('#providerForm .form-error'); if (err) err.textContent = '';
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    const providerId = values.provider_id ? Number(values.provider_id) : null;

    if (state.guest) {
      if (providerId) {
        const p = guestData.providers.find(item => item.id === providerId);
        if (p) { p.name = values.name; p.type = values.type; }
      } else {
        const newId = Math.max(...guestData.providers.map(p => p.id), 0) + 1;
        guestData.providers.push({ id: newId, name: values.name, type: values.type });
      }
      closeModal('providerModalOverlay');
      await loadData();
      toast(providerId ? 'Provider updated.' : 'Provider created.');
      return;
    }

    try {
      if (providerId) {
        // provider update logic if API supports it, or simple POST insert
        await request('/providers', { method: 'POST', body: JSON.stringify(values) });
      } else {
        await request('/providers', { method: 'POST', body: JSON.stringify(values) });
      }
      closeModal('providerModalOverlay');
      await loadData();
      toast('Provider saved.');
    } catch (error) {
      if (err) err.textContent = error.message;
    }
  });

  // Save Account (New / Edit)
  $('#accountForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const err = $('#accountForm .form-error'); if (err) err.textContent = '';
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    values.provider_id = numeric(values.provider_id);
    values.balance = values.type === 'asset_account' ? null : numeric(values.balance);
    values.interest_rate = (values.type === 'loan' || values.type === 'interest_account') ? numeric(values.interest_rate) : null;
    const accountId = values.account_id ? Number(values.account_id) : null;

    if (state.guest) {
      if (accountId) {
        const acc = guestData.accounts.find(a => a.id === accountId);
        if (acc) {
          acc.provider_id = values.provider_id;
          acc.name = values.name;
          acc.type = values.type;
          acc.balance = values.balance;
          acc.interest_rate = values.interest_rate;
        }
      } else {
        const newId = Math.max(...guestData.accounts.map(a => a.id), 0) + 1;
        guestData.accounts.push({ id: newId, provider_id: values.provider_id, name: values.name, type: values.type, balance: values.balance, interest_rate: values.interest_rate });
      }
      closeModal('accountModalOverlay');
      await loadData();
      toast(accountId ? 'Account updated.' : 'Account created.');
      return;
    }

    try {
      await request('/accounts', { method: 'POST', body: JSON.stringify(values) });
      closeModal('accountModalOverlay');
      await loadData();
      toast('Account saved.');
    } catch (error) {
      if (err) err.textContent = error.message;
    }
  });

  // Save Holding (New / Edit)
  $('#holdingForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const err = $('#holdingForm .form-error'); if (err) err.textContent = '';
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    values.asset_id = numeric(values.asset_id);
    values.account_id = numeric(values.account_id);
    values.quantity = numeric(values.quantity);
    values.purchase_price = numeric(values.purchase_price);
    const holdingId = values.holding_id ? Number(values.holding_id) : null;

    if (state.guest) {
      if (holdingId) {
        const h = guestData.holdings.find(item => item.id === holdingId);
        if (h) {
          h.asset_id = values.asset_id;
          h.account_id = values.account_id;
          h.quantity = values.quantity;
          h.purchase_price = values.purchase_price;
        }
      } else {
        const newId = Math.max(...guestData.holdings.map(h => h.id), 0) + 1;
        guestData.holdings.push({ id: newId, account_id: values.account_id, asset_id: values.asset_id, quantity: values.quantity, purchase_price: values.purchase_price });
      }
      closeModal('holdingModalOverlay');
      await loadData();
      toast('Holding saved.');
      return;
    }

    try {
      await request('/holdings', { method: 'POST', body: JSON.stringify(values) });
      closeModal('holdingModalOverlay');
      await loadData();
      toast('Holding saved.');
    } catch (error) {
      if (err) err.textContent = error.message;
    }
  });

  // Save Goal (New / Edit)
  $('#goalForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const err = $('#goalForm .form-error'); if (err) err.textContent = '';
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    values.value = numeric(values.value);
    values.sub1 = numeric(values.sub1);
    values.sub2 = numeric(values.sub2);
    values.sub3 = numeric(values.sub3);
    values.account_ids = goalSelectedAccounts.slice();
    const goalId = values.goal_id ? Number(values.goal_id) : null;

    const subError = validateGoalSubs(values.value, values.sub1, values.sub2, values.sub3);
    if (subError) {
      if (err) err.textContent = subError;
      return;
    }

    if (state.guest) {
      if (goalId) {
        const g = guestData.goals.find(item => item.id === goalId);
        if (g) {
          g.goal_name = values.goal_name;
          g.value = values.value;
          g.coin = values.coin || 'USD';
          g.sub1 = values.sub1;
          g.sub2 = values.sub2;
          g.sub3 = values.sub3;
          g.account_ids = values.account_ids;
        }
      } else {
        const newId = Math.max(...guestData.goals.map(g => g.id), 0) + 1;
        guestData.goals.push({ id: newId, goal_name: values.goal_name, value: values.value, coin: values.coin || 'USD', sub1: values.sub1, sub2: values.sub2, sub3: values.sub3, account_ids: values.account_ids });
      }
      closeModal('goalModalOverlay');
      await loadData();
      toast(goalId ? 'Goal updated.' : 'Goal created.');
      return;
    }

    try {
      await request('/goals', { method: 'POST', body: JSON.stringify(values) });
      closeModal('goalModalOverlay');
      await loadData();
      toast('Goal saved.');
    } catch (error) {
      if (err) err.textContent = error.message;
    }
  });

  // Save User
  $('#userForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const err = $('#userForm .form-error'); if (err) err.textContent = '';
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirm_password) {
      if (err) err.textContent = 'Passwords do not match.';
      return;
    }
    if (state.guest) {
      const newId = Math.max(...guestData.users.map(u => u.id), 0) + 1;
      guestData.users.push({ id: newId, username: values.username, role: values.role, created_at: new Date().toISOString().slice(0, 10), last_login: null });
      closeModal('userModalOverlay');
      await loadData();
      toast(`User "${values.username}" created (Guest mode).`);
      return;
    }
    try {
      await request('/admin/users', { method: 'POST', body: JSON.stringify(values) });
      closeModal('userModalOverlay');
      await loadData();
      toast(`User "${values.username}" created.`);
    } catch (error) {
      if (err) err.textContent = error.message;
    }
  });

  // Reset Password
  $('#resetPasswordForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const err = $('#resetPasswordForm .form-error'); if (err) err.textContent = '';
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirm_password) {
      if (err) err.textContent = 'Passwords do not match.';
      return;
    }
    if (state.guest) {
      closeModal('resetPasswordModalOverlay');
      toast('Password reset simulated.');
      return;
    }
    try {
      await request(`/admin/users/${values.user_id}/password`, { method: 'POST', body: JSON.stringify({ password: values.password }) });
      closeModal('resetPasswordModalOverlay');
      toast('Password reset successfully.');
    } catch (error) {
      if (err) err.textContent = error.message;
    }
  });

  // CSV File Select
  $('#csvFile')?.addEventListener('change', e => {
    const filename = e.target.files.length ? e.target.files[0].name : 'No file selected';
    if ($('#csvFileName')) $('#csvFileName').textContent = filename;
  });

  // CSV Import
  $('#importForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const fileInput = $('#csvFile');
    const log = $('#importLog');
    if (!fileInput.files.length) return toast('Select a CSV file first.');
    const file = fileInput.files[0];
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const now = new Date().toLocaleTimeString();

    const rows = [];
    lines.forEach((line, index) => {
      const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
      // Skip header row
      if (index === 0 && parts[0]?.toLowerCase() === 'symbol') return;
      if (!parts[0]) return;
      
      // Format: symbol,name,type,coin,price,yield,payment_months
      rows.push({ 
        symbol: parts[0],
        name: parts[1] || '',
        type: parts[2] || 'stock',
        coin: parts[3] || 'USD',
        price: parts[4] ? numeric(parts[4]) : null,
        yield: parts[5] ? numeric(parts[5]) : null,
        payment_months: parts[6] || ''
      });
    });

    if (state.guest) {
      if (log) {
        log.innerHTML = `[${now}] Starting import (Guest demo) — file: ${file.name}<br>` +
          rows.map(r => `<span class="ok">[OK]</span> Parsed: ${r.symbol} - ${r.name}`).join('<br>') +
          `<br><span class="ok">[DONE]</span> Import complete — ${rows.length} assets processed (demo only).`;
      }
      toast('Import simulated successfully.');
      return;
    }

    try {
      if (log) log.innerHTML = `[${now}] Starting import — file: ${file.name} (${rows.length} rows)...<br>`;
      const result = await request('/admin/import', { method: 'POST', body: JSON.stringify({ rows }) });
      if (log) log.innerHTML += `<span class="ok">[DONE]</span> ${result.count} assets imported/updated.`;
      await loadData();
      toast('Import completed.');
    } catch (error) {
      if (log) log.innerHTML += `<br><span class="warn">[ERROR]</span> ${error.message}`;
    }
  });

  // CSV Export Helper
  function downloadCSV(data, filename) {
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function arrayToCSV(headers, rows) {
    const escapeCSV = val => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');
    return csvContent;
  }

  // Export Assets
  $('#exportAssetsBtn')?.addEventListener('click', () => {
    const log = $('#exportLog');
    const now = new Date().toLocaleTimeString();
    
    try {
      const headers = ['symbol', 'name', 'type', 'coin', 'price', 'yield', 'payment_months'];
      const rows = state.assets.map(asset => [
        asset.symbol || '',
        asset.name || '',
        asset.type || '',
        asset.coin || 'USD',
        asset.price !== null && asset.price !== undefined ? asset.price : '',
        asset.dividend_yield !== null && asset.dividend_yield !== undefined ? asset.dividend_yield : '',
        Array.isArray(asset.payment_months) && asset.payment_months.length > 0 ? asset.payment_months.join('|') : ''
      ]);
      
      const csv = arrayToCSV(headers, rows);
      downloadCSV(csv, 'assets_export.csv');
      
      if (log) {
        log.innerHTML = `[${now}] <span class="ok">[SUCCESS]</span> Exported ${rows.length} assets to assets_export.csv`;
      }
      toast(`Exported ${rows.length} assets successfully.`);
    } catch (error) {
      if (log) {
        log.innerHTML = `[${now}] <span class="warn">[ERROR]</span> ${error.message}`;
      }
      toast('Export failed: ' + error.message);
    }
  });

  // Table Delegation (Edit/Delete Actions & Add to Account)
  document.addEventListener('click', async event => {
    // Clickable chart legend row
    const legendRow = event.target.closest('[data-legend-label]');
    if (legendRow) {
      const label = legendRow.dataset.legendLabel;
      const legendId = legendRow.closest('.chart-legend')?.id;
      if (legendId === 'allocationLegend') {
        if (dashboardFilter && dashboardFilter.source === 'assetType' && dashboardFilter.value === label) {
          dashboardFilter = null;
        } else {
          dashboardFilter = { source: 'assetType', value: label };
        }
        renderDashboardAccounts();
      } else if (legendId === 'providerLegend') {
        if (dashboardFilter && dashboardFilter.source === 'provider' && dashboardFilter.value === label) {
          dashboardFilter = null;
        } else {
          dashboardFilter = { source: 'provider', value: label };
        }
        renderDashboardAccounts();
      } else if (legendId === 'portfolioAssetLegend') {
        if (portfolioFilter && portfolioFilter.source === 'asset' && portfolioFilter.value === label) {
          portfolioFilter = null;
        } else {
          portfolioFilter = { source: 'asset', value: label };
        }
        renderHoldings();
      } else if (legendId === 'portfolioTypeLegend') {
        if (portfolioFilter && portfolioFilter.source === 'type' && portfolioFilter.value === label) {
          portfolioFilter = null;
        } else {
          portfolioFilter = { source: 'type', value: label };
        }
        renderHoldings();
      }
      return;
    }

    // Add asset to account
    const addAssetBtn = event.target.closest('[data-add-asset-to-account]');
    if (addAssetBtn) {
      const assetId = Number(addAssetBtn.dataset.addAssetToAccount);
      openHoldingModal(assetId);
      return;
    }

    // Update Asset Value / Yield
    const updateAssetBtn = event.target.closest('[data-update-asset]');
    if (updateAssetBtn) {
      openUpdateAssetModal(Number(updateAssetBtn.dataset.updateAsset));
      return;
    }

    // Edit Asset
    const editAssetBtn = event.target.closest('[data-edit-asset]');
    if (editAssetBtn) {
      openAssetModal(Number(editAssetBtn.dataset.editAsset));
      return;
    }

    // Delete Asset
    const deleteAssetBtn = event.target.closest('[data-delete-asset]');
    if (deleteAssetBtn) {
      const assetId = Number(deleteAssetBtn.dataset.deleteAsset);
      if (!await confirmDialog('Delete this asset? This will also remove any holdings using it.')) return;
      if (state.guest) {
        guestData.assets = guestData.assets.filter(a => a.id !== assetId);
        await loadData();
        toast('Asset deleted.');
        return;
      }
      try {
        await request(`/assets/${assetId}`, { method: 'DELETE' });
        await loadData();
        toast('Asset deleted.');
      } catch (err) {
        toast(err.message);
      }
      return;
    }

    // Toggle Provider collapse
    const toggleProviderBtn = event.target.closest('[data-toggle-provider]');
    if (toggleProviderBtn) {
      const id = Number(toggleProviderBtn.dataset.toggleProvider);
      if (collapsedProviders.has(id)) collapsedProviders.delete(id);
      else collapsedProviders.add(id);
      renderAccounts();
      updateToggleAllLabel();
      return;
    }

    // Add Account for a specific provider
    const addAccountProviderBtn = event.target.closest('[data-add-account-provider]');
    if (addAccountProviderBtn) {
      openAccountModal(null, Number(addAccountProviderBtn.dataset.addAccountProvider));
      return;
    }

    // Edit Provider
    const editProviderBtn = event.target.closest('[data-edit-provider]');
    if (editProviderBtn) {
      openProviderModal(Number(editProviderBtn.dataset.editProvider));
      return;
    }

    // Delete Provider
    const deleteProviderBtn = event.target.closest('[data-delete-provider]');
    if (deleteProviderBtn) {
      const id = Number(deleteProviderBtn.dataset.deleteProvider);
      if (!await confirmDialog('Delete this provider? All its accounts will also be deleted.')) return;
      collapsedProviders.delete(id);
      if (state.guest) {
        const accountsToDelete = guestData.accounts.filter(a => a.provider_id === id).map(a => a.id);
        guestData.holdings = guestData.holdings.filter(h => !accountsToDelete.includes(h.account_id));
        guestData.accounts = guestData.accounts.filter(a => a.provider_id !== id);
        guestData.providers = guestData.providers.filter(p => p.id !== id);
        await loadData();
        toast('Provider deleted.');
        return;
      }
      try {
        await request(`/providers/${id}`, { method: 'DELETE' });
        await loadData();
        toast('Provider deleted.');
      } catch (err) {
        toast(err.message);
      }
      return;
    }

    // Edit Account
    const editAccountBtn = event.target.closest('[data-edit-account]');
    if (editAccountBtn) {
      openAccountModal(Number(editAccountBtn.dataset.editAccount));
      return;
    }

    // Delete Account
    const deleteAccountBtn = event.target.closest('[data-delete-account]');
    if (deleteAccountBtn) {
      const id = Number(deleteAccountBtn.dataset.deleteAccount);
      if (!await confirmDialog('Delete this account? Associated holdings will also be deleted.')) return;
      if (state.guest) {
        guestData.holdings = guestData.holdings.filter(h => h.account_id !== id);
        guestData.accounts = guestData.accounts.filter(a => a.id !== id);
        await loadData();
        toast('Account deleted.');
        return;
      }
      try {
        await request(`/accounts/${id}`, { method: 'DELETE' });
        await loadData();
        toast('Account deleted.');
      } catch (err) {
        toast(err.message);
      }
      return;
    }

    // Edit Holding
    const editHoldingBtn = event.target.closest('[data-edit-holding]');
    if (editHoldingBtn) {
      openHoldingModal(null, Number(editHoldingBtn.dataset.editHolding));
      return;
    }

    // Delete Holding
    const deleteHoldingBtn = event.target.closest('[data-delete-holding]');
    if (deleteHoldingBtn) {
      const id = Number(deleteHoldingBtn.dataset.deleteHolding);
      if (!await confirmDialog('Delete this holding?')) return;
      if (state.guest) {
        guestData.holdings = guestData.holdings.filter(h => h.id !== id);
        await loadData();
        toast('Holding deleted.');
        return;
      }
      try {
        await request(`/holdings/${id}`, { method: 'DELETE' });
        await loadData();
        toast('Holding deleted.');
      } catch (err) {
        toast(err.message);
      }
      return;
    }

    // Remove goal account chip
    const removeGoalAccountBtn = event.target.closest('[data-remove-goal-account]');
    if (removeGoalAccountBtn) {
      goalSelectedAccounts = goalSelectedAccounts.filter(id => id !== Number(removeGoalAccountBtn.dataset.removeGoalAccount));
      renderGoalAccountsList();
      fillGoalAccountSelects();
      return;
    }

    // Goal Details
    const goalDetailsBtn = event.target.closest('[data-goal-details]');
    if (goalDetailsBtn) {
      openGoalDetailsModal(Number(goalDetailsBtn.dataset.goalDetails));
      return;
    }

    // Simulate Goal
    const simulateGoalBtn = event.target.closest('[data-simulate-goal]');
    if (simulateGoalBtn) {
      openGoalSimModal(Number(simulateGoalBtn.dataset.simulateGoal));
      return;
    }

    // Duplicate Goal
    const duplicateGoalBtn = event.target.closest('[data-duplicate-goal]');
    if (duplicateGoalBtn) {
      const id = Number(duplicateGoalBtn.dataset.duplicateGoal);
      const g = state.goals.find(item => item.id === id);
      if (!g) return;
      if (state.guest) {
        const newId = Math.max(...guestData.goals.map(x => x.id), 0) + 1;
        guestData.goals.push({ id: newId, goal_name: g.goal_name, value: g.value, coin: g.coin || 'USD', sub1: g.sub1 ?? null, sub2: g.sub2 ?? null, sub3: g.sub3 ?? null, account_ids: (g.account_ids || []).slice() });
        await loadData();
        toast('Goal duplicated.');
        return;
      }
      try {
        await request('/goals', { method: 'POST', body: JSON.stringify({ goal_name: g.goal_name, value: g.value, coin: g.coin || 'USD', sub1: g.sub1 ?? null, sub2: g.sub2 ?? null, sub3: g.sub3 ?? null, account_ids: (g.account_ids || []).slice() }) });
        await loadData();
        toast('Goal duplicated.');
      } catch (err) {
        toast(err.message);
      }
      return;
    }

    // Edit Goal
    const editGoalBtn = event.target.closest('[data-edit-goal]');
    if (editGoalBtn) {
      openGoalModal(Number(editGoalBtn.dataset.editGoal));
      return;
    }

    // Delete Goal
    const deleteGoalBtn = event.target.closest('[data-delete-goal]');
    if (deleteGoalBtn) {
      const id = Number(deleteGoalBtn.dataset.deleteGoal);
      if (!await confirmDialog('Delete this goal?')) return;
      if (state.guest) {
        guestData.goals = guestData.goals.filter(g => g.id !== id);
        await loadData();
        toast('Goal deleted.');
        return;
      }
      try {
        await request(`/goals/${id}`, { method: 'DELETE' });
        await loadData();
        toast('Goal deleted.');
      } catch (err) {
        toast(err.message);
      }
      return;
    }

    // Reset Password User Trigger
    const resetPassBtn = event.target.closest('[data-reset-password-user]');
    if (resetPassBtn) {
      if ($('#resetPasswordUsername')) $('#resetPasswordUsername').textContent = resetPassBtn.dataset.username;
      if ($('#resetPasswordUserId')) $('#resetPasswordUserId').value = resetPassBtn.dataset.resetPasswordUser;
      openModal('resetPasswordModalOverlay');
      return;
    }

    // Delete User
    const deleteUserBtn = event.target.closest('[data-delete-user]');
    if (deleteUserBtn) {
      const id = Number(deleteUserBtn.dataset.deleteUser);
      if (!await confirmDialog('Delete this user?')) return;
      if (state.guest) {
        guestData.users = guestData.users.filter(u => u.id !== id);
        await loadData();
        toast('User deleted.');
        return;
      }
      toast('User deletion simulated.');
    }
  });

  // User Role Dropdown Change
  document.addEventListener('change', async event => {
    const select = event.target.closest('[data-role-user]');
    if (!select) return;
    const userId = Number(select.dataset.roleUser);
    const newRole = select.value;
    if (state.guest) {
      const u = guestData.users.find(item => item.id === userId);
      if (u) u.role = newRole;
      toast('Role updated (Guest mode).');
      return;
    }
    try {
      await request(`/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
      toast('Role updated.');
    } catch (error) {
      toast(error.message);
      await loadData();
    }
  });

  // Auto Session Check
  try {
    const me = await request('/auth/me');
    if (me?.user) {
      state.user = me.user;
      state.guest = state.user.role === 'guest';
      showApp();
      await loadData();
      
      // Update currency rates if admin
      if (state.user.role === 'admin') {
        try {
          const result = await request('/admin/update-currency', { method: 'POST' });
          console.log('Currency rates updated:', result.message);
        } catch (error) {
          console.error('Failed to update currency rates:', error.message);
        }
      }
    }
  } catch {
    /* No active session */
  }

  // Refresh button on the top bar.
  const refreshBtn = $('#refreshButton');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      if (refreshBtn.classList.contains('spinning')) return;
      refreshBtn.classList.add('spinning');
      try {
        await loadData();
      } finally {
        refreshBtn.classList.remove('spinning');
      }
    });
  }

  // Register service worker for PWA support (progressive enhancement).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW registration is optional; ignore failures */
      });
    });
  }
});

