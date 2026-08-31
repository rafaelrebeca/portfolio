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
    { id: 1, goal_name: 'Emergency Fund', value: 20000, coin: 'USD', sub1: 10000, sub2: 15000, sub3: null, account_ids: [1, 2], order_by: 1 },
    { id: 2, goal_name: 'Investment Growth', value: 50000, coin: 'USD', sub1: null, sub2: null, sub3: null, account_ids: [3], order_by: 2 }
  ],
  users: [
    { id: 1, username: 'admin_user', role: 'admin', created_at: '2026-01-12', last_login: '2026-08-09' },
    { id: 2, username: 'john_doe', role: 'user', created_at: '2026-02-03', last_login: '2026-08-08' },
    { id: 3, username: 'demo_guest', role: 'guest', created_at: '2026-01-12', last_login: '2026-08-09' }
  ]
};

const state = { user: null, guest: false, assets: [], providers: [], accounts: [], holdings: [], users: [], currencies: [], goals: [] };
let blurMode = false;
let currentPage = 'dashboard';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const numeric = value => value === null || value === undefined || value === '' ? null : Number(value);
// Find an asset by id AND personal flag. Personal and platform assets can share
// the same numeric id, so matching on id alone is ambiguous.
function findAsset(id, isPersonal) {
  return state.assets.find(a => a.id === Number(id) && (a.is_personal === 1) === (isPersonal === 1 || isPersonal === true));
}

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

// Generic currency conversion between any two coins. Currency data is stored as
// "1 USD = X coin" (state.currencies[].value). This is the future replacement
// for convertToEUR; convertToEUR is kept as-is for now.
function convertToCurrency(amount, fromCoin, toCoin) {
  if (!amount || !fromCoin || !toCoin) return 0;
  if (fromCoin === toCoin) return amount;

  // fromCoin is USD: 1 USD = toRate.value toCoin
  if (fromCoin === 'USD') {
    const toRate = state.currencies.find(c => c.coin === toCoin);
    return toRate ? amount * toRate.value : amount;
  }

  // toCoin is USD: 1 fromCoin = 1 / fromRate.value USD
  if (toCoin === 'USD') {
    const fromRate = state.currencies.find(c => c.coin === fromCoin);
    return fromRate ? amount / fromRate.value : amount;
  }

  // Neither is USD: convert fromCoin -> USD, then USD -> toCoin
  const fromRate = state.currencies.find(c => c.coin === fromCoin);
  const toRate = state.currencies.find(c => c.coin === toCoin);
  if (!fromRate || !toRate) return amount;
  const amountInUSD = amount / fromRate.value;
  return amountInUSD * toRate.value;
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

function syncBodyScrollLock() {
  const anyOpen = document.querySelectorAll('.modal-overlay.show').length > 0;
  document.body.classList.toggle('modal-open', anyOpen);
}
function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('show'); syncBodyScrollLock(); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); syncBodyScrollLock(); }
function closeAllModals() { document.querySelectorAll('.modal-overlay.show').forEach(el => el.classList.remove('show')); syncBodyScrollLock(); }

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

const SNAPSHOT_CACHE_VERSION = 1;

function snapshotCacheKey() {
  const userKey = state.user?.id ?? state.user?.username;
  return userKey == null ? null : `portfolio_snapshots_v${SNAPSHOT_CACHE_VERSION}_${userKey}`;
}

function readSnapshotCache() {
  const key = snapshotCacheKey();
  if (!key) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    return cached?.version === SNAPSHOT_CACHE_VERSION && Array.isArray(cached.snapshots)
      ? cached.snapshots
      : null;
  } catch {
    return null;
  }
}

function writeSnapshotCache(snapshots = timeTravelList) {
  const key = snapshotCacheKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ version: SNAPSHOT_CACHE_VERSION, snapshots }));
  } catch (error) {
    console.warn('Could not persist snapshot cache:', error);
  }
}

function setSnapshotList(snapshots) {
  const list = (Array.isArray(snapshots) ? snapshots : [])
    .filter(snapshot => snapshot && snapshot.day)
    .sort((a, b) => String(b.day).localeCompare(String(a.day)));
  timeTravelList = list;
  writeSnapshotCache(list);
  if (historyData) historyData = list;
  if (accountHistoryData) accountHistoryData = list;
  if (goalHistoryData) goalHistoryData = list;
}

function hydrateSnapshotCache() {
  const cached = readSnapshotCache();
  if (!cached) return false;
  setSnapshotList(cached);
  return true;
}

function upsertSnapshot(snapshot) {
  if (!snapshot?.day) return;
  setSnapshotList([
    snapshot,
    ...timeTravelList.filter(item => item.day !== snapshot.day)
  ]);
}

function removeSnapshot(day) {
  setSnapshotList(timeTravelList.filter(snapshot => snapshot.day !== day));
}

function pruneSnapshotsLocally(mode) {
  const now = new Date();
  const currentPrefix = mode === 'months'
    ? `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    : String(now.getUTCFullYear());
  const seen = new Set();
  setSnapshotList(timeTravelList.filter(snapshot => {
    const day = String(snapshot.day);
    const prefix = mode === 'months' ? day.slice(0, 6) : day.slice(0, 4);
    if (prefix === currentPrefix || seen.has(prefix)) return prefix === currentPrefix;
    seen.add(prefix);
    return true;
  }));
}

async function refreshSnapshotList() {
  try {
    const { snapshots } = await request('/snapshots');
    setSnapshotList(snapshots);
    return true;
  } catch (error) {
    // Existing memory and local cache are deliberately retained on failure.
    console.warn('Could not refresh snapshots:', error.message);
    return false;
  }
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

async function loadData({ refreshSnapshots = false } = {}) {
  if (state.guest) {
    Object.assign(state, structuredClone(guestData));
    timeTravelList = [];
    render();
    return true;
  }
  hydrateSnapshotCache();
  try {
    const [assets, providers, accounts, holdings, currencies, goals] = await Promise.all([
      request('/assets'), request('/providers'), request('/accounts'),
      request('/holdings'), request('/currency'), request('/goals')
    ]);
    Object.assign(state, {
      assets: assets?.items || [],
      providers: providers?.items || [],
      accounts: accounts?.items || [],
      holdings: holdings?.items || [],
      currencies: currencies?.items || [],
      goals: goals?.items || []
    });
  } catch (err) {
    console.error('Failed to load portfolio data:', err);
    render();
    return false;
  }
  let snapshotsFresh = true;
  if (state.user && state.user.role === 'admin') {
    try {
      state.users = (await request('/admin/users')).items || [];
    } catch (err) {
      console.error('Failed to load admin users:', err);
      render();
      return false;
    }
  }
  render();
  if (!refreshSnapshots) return true;
  snapshotsFresh = await loadTimeTravelList();
  return snapshotsFresh;
}

// Fetch the user's snapshot list (for the Time Travel arrows) without opening the modal.
async function loadTimeTravelList() {
  if (state.guest || !state.user) {
    timeTravelList = [];
    snapshotsLoading = false;
    updateTimeTravelArrows();
    return true;
  }
  snapshotsLoading = true;
  updateTimeTravelArrows();
  let refreshed = false;
  try {
    refreshed = await refreshSnapshotList();
  } finally {
    snapshotsLoading = false;
  }
  updateTimeTravelArrows();
  if ($('#page-dashboard')?.classList.contains('active')) {
    renderDashboardSummaryCards();
    renderDashboardAccounts();
    renderGrowthCard();
  }
  if ($('#page-simulation')?.classList.contains('active')) renderSimulation();
  return refreshed;
}

function renderDashboardSummaryCards() {
  if (timeTravelActive() && timeTravelSnapshot) {
    return;
  }
  const totalVal = totalPortfolioValue();
  const prev = getPreviousSnapshotData();

  const portfolioValueEl = $('#portfolioValue');
  if (portfolioValueEl) {
    const delta = prev ? formatDelta(totalVal - Number(prev.globalValue || 0)) : '';
    portfolioValueEl.innerHTML = `${moneyEUR.format(totalVal)}${delta}`;
    portfolioValueEl.className = 'value ' + (totalVal < 0 ? 'neg' : (totalVal > 0 ? 'pos' : ''));
  }

  let debit = 0;
  let credit = 0;
  state.accounts.forEach(acc => {
    const val = accountValue(acc, true);
    if (val > 0) debit += val;
    else credit += val;
  });
  const debitCreditValue = $('#debitCreditValue');
  if (debitCreditValue) {
    const debitDelta = prev ? formatDelta(debit - Number(prev.debit || 0)) : '';
    const creditDelta = prev ? formatDelta(credit - Number(prev.credit || 0)) : '';
    debitCreditValue.innerHTML = `<span class="pos">${moneyEUR.format(debit)}${debitDelta}</span><br><span class="neg">${moneyEUR.format(credit)}${creditDelta}</span>`;
  }
}

let allocationChartInstance = null;
let accountTypeChartInstance = null;
let portfolioAssetChartInstance = null;
let portfolioTypeChartInstance = null;
let goalDetailsChartInstance = null;
let goalDetailsGoalId = null;
let accountDetailsChartInstance = null;
let providerDetailsChartInstance = null;
let simulationTrendChartInstance = null;
let simulationGrowthChartInstance = null;
let simulationGrowthMode = localStorage.getItem('portfolio_simulation_growth_mode') || 'all';

function cycleSimulationGrowthMode() {
  const modes = ['all', 'ytd', 'month'];
  const currentIndex = modes.indexOf(simulationGrowthMode);
  simulationGrowthMode = modes[(currentIndex + 1) % modes.length];
  localStorage.setItem('portfolio_simulation_growth_mode', simulationGrowthMode);
  renderSimulation();
}
let dashboardFilter = null; // { source: 'assetType'|'provider', value: string } | null
let portfolioFilter = null; // { source: 'asset'|'type', value: string } | null
let holdingsSort = null; // { field: 'asset'|'account'|'quantity'|'purchase_price'|'market_value'|'gain_pct'|'gain_value', dir: 1|-1 } | null
let activeAssetTab = 'system'; // 'system' or 'personal' — which Assets page tab is shown
let dashboardAllocOthers = [];
let dashboardProviderOthers = [];
let dashboardAccountOthers = [];
let dashboardBreakdownMode = localStorage.getItem('portfolio_dashboard_breakdown_mode') || 'provider';
let dashboardAccountsCollapsed = false;
let portfolioAssetOthers = [];
let portfolioTypeOthers = [];
let collapsedProviders = new Set();
let timeTravelSnapshot = null; // active snapshot being viewed (null = live dashboard)
let timeTravelList = []; // cached list of the user's snapshots (newest first), for prev/next navigation
let growthCardMode = localStorage.getItem('portfolio_growth_card_mode') || 'all';

function cycleGrowthCardMode() {
  const modes = ['all', 'ytd', 'month'];
  const curIdx = modes.indexOf(growthCardMode);
  growthCardMode = modes[(curIdx + 1) % modes.length];
  localStorage.setItem('portfolio_growth_card_mode', growthCardMode);
  const currentNetWorth = timeTravelActive() && timeTravelSnapshot
    ? Number(timeTravelSnapshot.data?.globalValue || 0)
    : totalPortfolioValue();
  renderAllTimeGrowthDashboardCard(currentNetWorth);
}

function cycleDashboardBreakdownMode() {
  dashboardBreakdownMode = dashboardBreakdownMode === 'provider' ? 'account' : 'provider';
  localStorage.setItem('portfolio_dashboard_breakdown_mode', dashboardBreakdownMode);
  dashboardFilter = null;
  if (timeTravelActive()) {
    renderDashboardFromSnapshot(timeTravelSnapshot.data);
  } else {
    renderCharts();
    renderDashboardAccounts();
  }
}

function renderGrowthCard() {
  renderAllTimeGrowthDashboardCard(totalPortfolioValue());
}

function simulationSnapshotDate(snapshot) {
  if (snapshot?.day && /^\d{8}$/.test(snapshot.day)) {
    return new Date(Date.UTC(Number(snapshot.day.slice(0, 4)), Number(snapshot.day.slice(4, 6)) - 1, Number(snapshot.day.slice(6, 8))));
  }
  return snapshot?.created_at ? new Date(snapshot.created_at) : null;
}

// Keep Simulation aligned with the dashboard's All-Time Growth pace. This is
// deliberately based on elapsed days, so an incomplete calendar month is not
// treated as zero months.
function dashboardAllTimeMonthlyGrowth(currentValue = totalPortfolioValue()) {
  if (!timeTravelList || !timeTravelList.length) return null;
  const snapshots = timeTravelList
    .filter(snapshot => Number.isFinite(Number(snapshot?.data?.globalValue)) && simulationSnapshotDate(snapshot))
    .slice()
    .sort((a, b) => simulationSnapshotDate(a) - simulationSnapshotDate(b));
  const baseline = snapshots[0];
  if (!baseline) return null;
  const baselineDate = simulationSnapshotDate(baseline);
  const daysDiff = Math.max(1, (new Date().getTime() - baselineDate.getTime()) / (1000 * 60 * 60 * 24));
  const monthsDiff = Math.max(1, daysDiff / 30.4375);
  return (Number(currentValue || 0) - Number(baseline.data.globalValue || 0)) / monthsDiff;
}

function simulationProjection() {
  const current = totalPortfolioValue();
  const snapshots = (timeTravelList || [])
    .filter(snapshot => Number.isFinite(Number(snapshot?.data?.globalValue)) && simulationSnapshotDate(snapshot))
    .slice()
    .sort((a, b) => simulationSnapshotDate(a) - simulationSnapshotDate(b));
  const oldest = snapshots[0];
  const oldestDate = oldest ? simulationSnapshotDate(oldest) : null;
  const monthlyChange = dashboardAllTimeMonthlyGrowth(current);
  const milestones = [0, 12, 60, 120, 240].map(month => ({
    month,
    value: monthlyChange === null ? null : current + monthlyChange * month
  }));
  let zeroMonths = null;
  if (current < 0 && monthlyChange > 0) zeroMonths = Math.ceil(Math.abs(current) / monthlyChange);
  return { current, snapshots, monthlyChange, milestones, zeroMonths, oldestDate };
}

function formatSimulationDate(date) {
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function renderSimulation() {
  const currentEl = $('#simulationCurrentValue');
  if (!currentEl) return;
  const projection = simulationProjection();
  const growthTitle = $('#simulationGrowthTitle');
  const growthSubtitle = $('#simulationGrowthSubtitle');
  const growthPeriodLabel = simulationGrowthMode === 'ytd' ? 'YTD' : simulationGrowthMode === 'month' ? 'Month' : '';
  if (growthTitle) growthTitle.textContent = `Growth Contribution by Account${growthPeriodLabel ? ` ${growthPeriodLabel}` : ''}`;
  if (growthSubtitle) growthSubtitle.textContent = simulationGrowthMode === 'ytd'
    ? "Monthly change during each account's known lifetime on current year"
    : simulationGrowthMode === 'month'
      ? "Monthly change during each account's known lifetime on the current month"
      : "Monthly change during each account's known lifetime";
  const monthlyEl = $('#simulationMonthlyChange');
  const zeroEl = $('#simulationZeroValue');
  const zeroSubEl = $('#simulationZeroSubtext');
  currentEl.textContent = moneyEUR.format(projection.current);
  currentEl.className = 'value ' + (projection.current < 0 ? 'neg' : projection.current > 0 ? 'pos' : '');
  if (monthlyEl) {
    monthlyEl.textContent = projection.monthlyChange === null ? '—' : `${projection.monthlyChange >= 0 ? '+' : '−'}${moneyEUR.format(Math.abs(projection.monthlyChange))}`;
    monthlyEl.className = 'value ' + (projection.monthlyChange < 0 ? 'neg' : projection.monthlyChange > 0 ? 'pos' : '');
  }
  const monthlySub = $('#simulationMonthlySubtext');
  if (monthlySub) monthlySub.textContent = projection.oldestDate
    ? `oldest snapshot: ${formatSimulationDate(projection.oldestDate)}`
    : 'need two dated snapshots';
  if (zeroEl && zeroSubEl) {
    if (projection.current >= 0) {
      zeroEl.textContent = 'Already above €0';
      zeroSubEl.textContent = 'current global value is not negative';
    } else if (projection.zeroMonths !== null) {
      const date = new Date();
      date.setUTCMonth(date.getUTCMonth() + projection.zeroMonths);
      zeroEl.textContent = formatSimulationDate(date);
      zeroSubEl.textContent = `about ${projection.zeroMonths} month${projection.zeroMonths === 1 ? '' : 's'} at this pace`;
    } else {
      zeroEl.textContent = 'Not reached';
      zeroSubEl.textContent = projection.monthlyChange === null ? 'not enough history' : 'current pace is not improving';
    }
  }

  const note = $('#simulationDataNote');
  if (note) note.textContent = projection.monthlyChange === null
    ? 'Add at least two snapshots on different dates to unlock the projection.'
    : `Uses the dashboard All-Time Growth pace from ${formatSimulationDate(projection.oldestDate)} (${projection.snapshots.length} snapshot${projection.snapshots.length === 1 ? '' : 's'} available). Values are linear estimates, not forecasts.`;
  if (typeof Chart === 'undefined') return;
  const trendCtx = document.getElementById('simulationTrendChart')?.getContext('2d');
  const growthCtx = document.getElementById('simulationGrowthChart')?.getContext('2d');
  if (!trendCtx || !growthCtx) return;
  if (simulationTrendChartInstance) simulationTrendChartInstance.destroy();
  if (simulationGrowthChartInstance) simulationGrowthChartInstance.destroy();
  // Keep the full snapshot set for calculating the growth rate, but show only
  // the first snapshot and the latest available snapshot for each year so the
  // historical part remains readable as snapshot history grows.
  const latestSnapshotIndexByYear = new Map();
  projection.snapshots.forEach((snapshot, index) => {
    latestSnapshotIndexByYear.set(simulationSnapshotDate(snapshot).getUTCFullYear(), index);
  });
  const chartSnapshots = projection.snapshots.filter((snapshot, index) => {
    const year = simulationSnapshotDate(snapshot).getUTCFullYear();
    return index === 0 || latestSnapshotIndexByYear.get(year) === index;
  });
  const historical = chartSnapshots.map(snapshot => ({ label: formatSimulationDate(simulationSnapshotDate(snapshot)), value: Number(snapshot.data.globalValue || 0) }));
  const labels = [...historical.map(point => point.label), 'Today', '1 year', '5 years', '10 years', '20 years'];
  const historicalData = [...historical.map(point => point.value), ...Array(5).fill(null)];
  const projectedData = [...Array(historical.length).fill(null), projection.current, ...projection.milestones.slice(1).map(point => point.value)];
  simulationTrendChartInstance = new Chart(trendCtx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Historical Global Value', data: historicalData, borderColor: CHART_COLORS[0], backgroundColor: CHART_COLORS[0], tension: 0.25, pointRadius: 3 },
      { label: 'Projected Global Value', data: projectedData, borderColor: CHART_COLORS[1], backgroundColor: CHART_COLORS[1], borderDash: [6, 5], tension: 0.15, pointRadius: 3 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#e6ebf5' } }, tooltip: { callbacks: { label: context => `${context.dataset.label}: ${moneyEUR.format(Number(context.raw || 0))}` } } },
      scales: { x: { ticks: { color: '#e6ebf5', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,.05)' } }, y: { ticks: { color: '#e6ebf5', callback: value => moneyEUR.format(Number(value || 0)) }, grid: { color: 'rgba(255,255,255,.05)' } } } }
  });
  // Build each account's own lifetime from all snapshots. An account that was
  // created later starts at its first known snapshot; a deleted account ends
  // at its last known snapshot instead of being incorrectly forced to zero.
  const accountHistory = new Map();
  projection.snapshots.forEach(snapshot => {
    const snapshotDate = simulationSnapshotDate(snapshot);
    (snapshot.data?.accounts || []).forEach(account => {
      const id = String(account.id);
      if (!accountHistory.has(id)) accountHistory.set(id, { name: account.name || `Account ${id}`, observations: [] });
      const history = accountHistory.get(id);
      history.name = account.name || history.name;
      history.observations.push({ date: snapshotDate, value: Number(account.valueEur || 0) });
    });
  });
  const liveDate = new Date();
  state.accounts.forEach(account => {
    const id = String(account.id);
    if (!accountHistory.has(id)) accountHistory.set(id, { name: account.name || `Account ${id}`, observations: [] });
    const history = accountHistory.get(id);
    history.name = account.name || history.name;
    history.observations.push({ date: liveDate, value: accountValue(account, true) });
  });
  const periodStart = new Date(Date.UTC(liveDate.getUTCFullYear(), simulationGrowthMode === 'month' ? liveDate.getUTCMonth() : 0, 1));
  const accountGrowth = [...accountHistory.values()].map(history => {
    const observations = history.observations;
    let first = observations[0];
    if (simulationGrowthMode !== 'all') {
      const beforePeriod = observations.filter(observation => observation.date <= periodStart);
      const duringPeriod = observations.filter(observation => observation.date >= periodStart && observation.date <= liveDate);
      first = beforePeriod[beforePeriod.length - 1] || duringPeriod[0];
      if (!first || observations[observations.length - 1].date < periodStart) return null;
    }
    const latest = observations[observations.length - 1];
    if (!first || !latest) return null;
    const calculationStart = simulationGrowthMode === 'all'
      ? first.date
      : (first.date < periodStart ? periodStart : first.date);
    const daysExisted = Math.max(1, (latest.date.getTime() - calculationStart.getTime()) / (1000 * 60 * 60 * 24));
    const monthsExisted = Math.max(1, daysExisted / 30.4375);
    return { name: history.name, delta: (latest.value - first.value) / monthsExisted };
  }).filter(Boolean);
  const growthMap = {};
  accountGrowth.forEach(account => { growthMap[account.name] = (growthMap[account.name] || 0) + account.delta; });
  const growthTop = topNWithOthers(Object.fromEntries(Object.entries(growthMap).map(([name, value]) => [name, Math.abs(value)])), 9);
  const growthLabels = growthTop.labels;
  const displayedGrowthMap = {};
  growthLabels.forEach(label => {
    displayedGrowthMap[label] = label === 'Others'
      ? growthTop.others.reduce((sum, name) => sum + Number(growthMap[name] || 0), 0)
      : Number(growthMap[label] || 0);
  });
  const positiveGrowth = growthLabels.map(label => Math.max(0, displayedGrowthMap[label] || 0));
  const negativeGrowth = growthLabels.map(label => Math.max(0, -(displayedGrowthMap[label] || 0)));
  const growthColors = growthLabels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]);
  simulationGrowthChartInstance = new Chart(growthCtx, {
    type: 'doughnut',
    data: { labels: growthLabels.length ? growthLabels : ['No growth data'], datasets: [
      { label: 'Positive growth', data: positiveGrowth.length ? positiveGrowth : [1], backgroundColor: positiveGrowth.length ? growthColors : '#2a3550', borderWidth: 0 },
      { label: 'Negative growth', data: negativeGrowth.length ? negativeGrowth : [0], backgroundColor: negativeGrowth.length ? growthColors : 'transparent', borderWidth: 0 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '42%', plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: context => {
        const label = growthLabels[context.dataIndex];
        const total = Number(displayedGrowthMap[label] || 0);
        const base = `${context.dataset.label}: ${moneyEUR.format(Math.abs(Number(context.raw || 0)))}`;
        if (label !== 'Others' || !growthTop.others.length) return base;
        const detail = growthTop.others.map(name => {
          const value = Number(growthMap[name] || 0);
          return `  ${name}: ${value >= 0 ? '+' : '−'}${moneyEUR.format(Math.abs(value))}`;
        });
        return [`Others total: ${total >= 0 ? '+' : '−'}${moneyEUR.format(Math.abs(total))}`, 'Included accounts:', ...detail];
      } } }
    } }
  });
  // Use the same account legend format as the other doughnut charts. Negative
  // rows are marked as negative by the shared renderer and remain signed in
  // the data passed to it, while the chart datasets use absolute slice sizes.
  renderLegend('simulationGrowthLegend', growthLabels, growthLabels.map(label => displayedGrowthMap[label] || 0), growthColors);
}
let snapshotsLoading = false; // whether snapshots are currently loading from DB into memory
let timeTravelPlayTimer = null; // timeout id for the "play through snapshots" playback
let timeTravelPlayIndex = -1; // current index in timeTravelList during playback
const SNAPSHOTS_PER_PAGE = 5; // snapshots shown per page in the Time Travel modal
let snapshotPage = 0; // current page index (0-based) of the snapshot list
const CURRENCIES_PER_PAGE = 20; // currencies shown per page in the Currency table
let currencyPage = 0; // current page index (0-based) of the currency list
let calendarMonth = null; // { year, month } currently shown in the snapshot calendar (month is 0-based)
let calendarPicker = false; // whether the calendar is showing the year/month picker instead of the day grid
let historyChartInstance = null; // Chart.js instance for the snapshot history line chart
let historyData = null; // full snapshot data loaded for the history chart
let historyMaximized = false; // whether the history modal is maximized (fullscreen)
let accountHistoryChartInstance = null; // Chart.js instance for the account history line chart
let accountHistoryData = null; // full snapshot data loaded for the account history chart
let accountHistoryMaximized = false; // whether the account history modal is maximized (fullscreen)
let accountHistoryAccountId = null; // the account id whose history is being shown
let goalHistoryChartInstance = null; // Chart.js instance for the goal history line chart
let goalHistoryData = null; // full snapshot data loaded for the goal history chart
let goalHistoryMaximized = false; // whether the goal history modal is maximized (fullscreen)
let goalHistoryGoalId = null; // the goal id whose history is being shown

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
              const asset = findAsset(h.asset_id, h.is_personal);
              return asset && dashboardAllocOthers.includes(asset.type || 'Other');
            })
            .map(h => h.account_id)
        );
        accounts = state.accounts.filter(a => relevantAccountIds.has(a.id));
      } else {
        const relevantAccountIds = new Set(
          state.holdings
            .filter(h => {
              const asset = findAsset(h.asset_id, h.is_personal);
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
    } else if (dashboardFilter.source === 'account') {
      const val = dashboardFilter.value;
      if (val === 'Others') {
        const accountIds = new Set(dashboardAccountOthers.map(Number));
        accounts = state.accounts.filter(a => accountIds.has(Number(a.id)));
      } else {
        accounts = state.accounts.filter(a => a.name === val);
      }
      filterLabel = `Account: ${val}`;
    }
  }

  const filterBar = filterLabel
    ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--card);border-radius:8px;border:1px solid var(--border);">
        <span style="font-size:13px;color:var(--muted);">Filtered by</span>
        <span style="font-size:13px;font-weight:600;color:var(--accent);">${esc(filterLabel)}</span>
        <span style="font-size:12px;color:var(--muted);">&mdash; click the same slice again to clear</span>
      </div>`
    : '';

  const hasSnapshots = timeTravelList.length > 0;
  const prevData = getPreviousSnapshotData();
  renderDashboardAccountsSummary(accounts, prevData);
  container.innerHTML = filterBar + (accounts.length ? `
    <div class="dashboard-accounts-grid">
      ${accounts.map(a => {
    const valInEur = accountValue(a, true);
    const prevVal = previousAccountValue(prevData, a.id);
    const changeClass = accountChangeClass(valInEur, prevVal);
    return `
          <div class="account-card${hasSnapshots ? ' clickable' : ''} ${changeClass}"${hasSnapshots ? ` data-account-history="${a.id}" title="View account history"` : ''}>
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
  syncDashboardAccountsCollapsed();
}

function renderDashboardAccountsSummary(accounts, prevData) {
  const summary = $('#dashboardAccountsSummary');
  if (!summary) return;
  let up = 0;
  let down = 0;
  let unchanged = 0;
  const movers = [];
  accounts.forEach(account => {
    const current = account.valueEur !== undefined
      ? Number(account.valueEur || 0)
      : accountValue(account, true);
    const previous = previousAccountValue(prevData, account.id);
    if (previous !== null && current > previous) up += 1;
    else if (previous !== null && current < previous) down += 1;
    else unchanged += 1;
    if (previous !== null && current !== previous) {
      movers.push({ name: account.name || '—', delta: current - previous });
    }
  });
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const moverText = movers.slice(0, 3).map(mover => {
    const sign = mover.delta >= 0 ? '+' : '−';
    return `${mover.name} ${sign}${moneyEUR.format(Math.abs(mover.delta))}`;
  }).join(' / ');
  const base = `${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${up} up · ${down} down · ${unchanged} unchanged`;
  summary.textContent = moverText ? `${base} · Top movers: ${moverText}` : base;
}

function syncDashboardAccountsCollapsed() {
  const container = $('#dashboardAccounts');
  const button = $('#toggleDashboardAccountsBtn');
  if (container) container.style.display = dashboardAccountsCollapsed ? 'none' : '';
  if (button) {
    button.textContent = dashboardAccountsCollapsed ? '+' : '−';
    button.title = dashboardAccountsCollapsed ? 'Expand Account Overview' : 'Collapse Account Overview';
    button.setAttribute('aria-label', button.title);
  }
}

function toggleDashboardAccounts() {
  dashboardAccountsCollapsed = !dashboardAccountsCollapsed;
  syncDashboardAccountsCollapsed();
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

function renderDashboardBreakdownHeading() {
  const title = $('#dashboardBreakdownTitle');
  const subtitle = $('#dashboardBreakdownSubtitle');
  const byAccount = dashboardBreakdownMode === 'account';
  if (title) title.textContent = byAccount ? 'By Account' : 'By Provider';
  if (subtitle) subtitle.textContent = byAccount ? 'Account value by account' : 'Account value by provider';
}

function renderCharts() {
  if (typeof Chart === 'undefined') return;

  const allocCtx = document.getElementById('allocationChart')?.getContext('2d');
  const typeCtx = document.getElementById('accountTypeChart')?.getContext('2d');
  if (!allocCtx || !typeCtx) return;

  renderDashboardBreakdownHeading();

  if (allocationChartInstance) allocationChartInstance.destroy();
  if (accountTypeChartInstance) accountTypeChartInstance.destroy();

  const allocMap = {};
  state.holdings.forEach(h => {
    const asset = findAsset(h.asset_id, h.is_personal);
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
      animation: false,
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

  // By Provider / By Account chart (pie/doughnut)
  const breakdownMap = {};
  if (dashboardBreakdownMode === 'account') {
    state.accounts.forEach(account => {
      const val = accountValue(account, true);
      if (val !== 0) breakdownMap[account.name] = (breakdownMap[account.name] || 0) + val;
    });
  } else {
    state.providers.forEach(provider => {
      const val = providerValue(provider);
      if (val !== 0) breakdownMap[provider.name] = val;
    });
  }

  const breakdownTop = topNWithOthers(breakdownMap, 9);
  const breakdownLabels = breakdownTop.labels;
  const breakdownData = breakdownTop.data;
  const breakdownDataAbs = breakdownData.map(v => Math.abs(v));
  const breakdownColors = CHART_COLORS;
  dashboardProviderOthers = dashboardBreakdownMode === 'provider' ? breakdownTop.others : [];
  dashboardAccountOthers = dashboardBreakdownMode === 'account'
    ? state.accounts.filter(account => breakdownTop.others.includes(account.name)).map(account => account.id)
    : [];

  accountTypeChartInstance = new Chart(typeCtx, {
    type: 'doughnut',
    data: {
      labels: breakdownLabels.length ? breakdownLabels : ['No Data'],
      datasets: [{
        data: breakdownDataAbs.length ? breakdownDataAbs : [1],
        backgroundColor: breakdownDataAbs.length ? breakdownColors : ['#2a3550'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      onClick(event, elements) {
        if (!elements.length || !breakdownLabels.length) return;
        const clickedLabel = breakdownLabels[elements[0].index];
        const source = dashboardBreakdownMode === 'account' ? 'account' : 'provider';
        if (dashboardFilter && dashboardFilter.source === source && dashboardFilter.value === clickedLabel) {
          dashboardFilter = null;
        } else {
          dashboardFilter = { source, value: clickedLabel };
        }
        renderDashboardAccounts();
      },
      onHover(event, elements) {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    }
  });

  // Render provider legend
  renderLegend('providerLegend', breakdownLabels, breakdownData, breakdownColors, true);
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
    const asset = findAsset(h.asset_id, h.is_personal);
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
    const asset = findAsset(h.asset_id, h.is_personal);
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
    const asset = findAsset(h.asset_id, h.is_personal);
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
  const target = convertToEur ? 'EUR' : (acc.coin || 'USD');

  if (acc.type === 'asset_account') {
    // Sum each holding's value converted to the target currency individually,
    // because holdings in one account can be in different coins.
    return state.holdings
      .filter(h => h.account_id === acc.id)
      .reduce((sum, h) => {
        const asset = findAsset(h.asset_id, h.is_personal);
        if (!asset) return sum;
        const raw = Number(asset.price || 0) * Number(h.quantity || 0);
        const coin = asset.coin || 'USD';
        if (coin === target) return sum + raw;
        const rate = getExchangeRate(coin, target);
        return sum + (rate ? raw * rate : raw);
      }, 0);
  }

  const value = Number(acc.balance || 0);
  const coin = acc.coin || 'USD';
  if (coin === target) return value;
  const rate = getExchangeRate(coin, target);
  return rate ? value * rate : value;
}

function totalPortfolioValue() {
  return state.accounts.reduce((sum, acc) => sum + accountValue(acc, true), 0);
}

function providerValue(provider) {
  const providerAccounts = state.accounts.filter(a => a.provider_id === provider.id);
  return providerAccounts.reduce((sum, acc) => sum + accountValue(acc, true), 0);
}

function maybeShowWelcomeModal() {
  // Guests are always greeted with the demo guide (cached or not).
  if (state.guest) {
    showWelcomeModal(true);
    return;
  }
  // Regular users: first-run guide only when they have no provider yet.
  if (state.providers.length > 0) return;
  showWelcomeModal(false);
}

function showWelcomeModal(isGuest) {
  const guestBody = document.getElementById('welcomeGuestBody');
  const userBody = document.getElementById('welcomeBody');
  if (guestBody) guestBody.style.display = isGuest ? 'block' : 'none';
  if (userBody) userBody.style.display = isGuest ? 'none' : 'block';
  setWelcomePage(1);
  openModal('welcomeModalOverlay');
}

// Switch the welcome/help modal between its pages (1 = getting started, 2 = privacy & time travel).
function setWelcomePage(page) {
  document.querySelectorAll('.welcome-page').forEach(el => {
    el.style.display = Number(el.dataset.welcomePage) === page ? 'block' : 'none';
  });
  document.querySelectorAll('.welcome-tab').forEach(tab => {
    tab.classList.toggle('active', Number(tab.dataset.welcomePage) === page);
  });
  const prev = $('#welcomeModalPrev');
  const next = $('#welcomeModalNext');
  const ok = $('#welcomeModalOk');
  if (prev) prev.style.display = page === 1 ? 'none' : '';
  if (next) next.style.display = page === 2 ? 'none' : '';
  if (ok) ok.style.display = page === 2 ? '' : 'none';
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
  renderTimeTravelBanner();

  if (timeTravelActive()) {
    // In "past" mode the dashboard is rendered from the snapshot; other pages render live.
    renderDashboardFromSnapshot(timeTravelSnapshot.data);
    renderAssets();
    fillDividendPeriodValue();
    renderDividends();
    renderAccounts();
    updateToggleAllLabel();
    renderHoldings();
    renderGoals();
    renderUsers();
    renderProfile();
    renderCurrency();
    renderCurrencyTest();
    fillSelects();
    renderPortfolioCards();
    renderPortfolioCharts();
    const write = isWriteAllowed();
    const admin = isAdminUser();
    document.querySelectorAll('.write-action').forEach(el => el.style.display = write ? '' : 'none');
    document.querySelectorAll('.admin-action').forEach(el => el.style.display = admin ? '' : 'none');
    if ($('#adminSectionLabel')) $('#adminSectionLabel').style.display = admin ? 'block' : 'none';
    if ($('#navTools')) $('#navTools').style.display = admin ? 'flex' : 'none';
    if ($('#navUsers')) $('#navUsers').style.display = admin ? 'flex' : 'none';
    updateNavVisibility();
    return;
  }

  const totalVal = totalPortfolioValue();

  renderTopGoalDashboardCard();
  renderAllTimeGrowthDashboardCard(totalVal);
  renderDashboardSummaryCards();

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
  renderProfile();
  renderCurrency();
  renderCurrencyTest();
  fillSelects();
  renderCharts();
  renderPortfolioCards();
  renderPortfolioCharts();
  renderSimulation();

  const write = isWriteAllowed();
  const admin = isAdminUser();
  document.querySelectorAll('.write-action').forEach(el => el.style.display = write ? '' : 'none');
  document.querySelectorAll('.admin-action').forEach(el => el.style.display = admin ? '' : 'none');
  if ($('#adminSectionLabel')) $('#adminSectionLabel').style.display = admin ? 'block' : 'none';
  if ($('#navTools')) $('#navTools').style.display = admin ? 'flex' : 'none';
  if ($('#navUsers')) $('#navUsers').style.display = admin ? 'flex' : 'none';
  updateNavVisibility();
}

/* ================= TIME TRAVEL (dashboard snapshots) ================= */

function timeTravelActive() { return !!timeTravelSnapshot; }

// Format a YYYYMMDD day into a readable date, e.g. "16 Aug 2026".
function formatSnapshotDay(day) {
  if (!day || !/^\d{8}$/.test(day)) return day || '—';
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(4, 6)) - 1;
  const d = Number(day.slice(6, 8));
  const date = new Date(Date.UTC(y, m, d));
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Collect the current dashboard values into a snapshot payload (see timetravel.md §2).
function collectDashboardSnapshot() {
  const byType = {};
  state.holdings.forEach(h => {
    const asset = findAsset(h.asset_id, h.is_personal);
    if (asset) {
      const val = Number(asset.price || 0) * Number(h.quantity || 0);
      const valInEur = convertToEUR(val, asset.coin || 'USD');
      const type = asset.type || 'Other';
      byType[type] = (byType[type] || 0) + valInEur;
    }
  });
  const loansTotal = state.accounts.filter(a => a.type === 'loan').reduce((s, a) => s + convertToEUR(Number(a.balance || 0), a.coin || 'USD'), 0);
  const cashTotal = state.accounts.filter(a => a.type === 'bank_account').reduce((s, a) => s + convertToEUR(Number(a.balance || 0), a.coin || 'USD'), 0);
  const depositsTotal = state.accounts.filter(a => a.type === 'interest_account').reduce((s, a) => s + convertToEUR(Number(a.balance || 0), a.coin || 'USD'), 0);
  if (loansTotal !== 0) byType['Loans'] = loansTotal;
  if (cashTotal !== 0) byType['Cash'] = cashTotal;
  if (depositsTotal !== 0) byType['Deposits'] = depositsTotal;

  const byProvider = {};
  state.providers.forEach(p => {
    const val = providerValue(p);
    if (val !== 0) byProvider[p.name] = val;
  });

  let debit = 0;
  let credit = 0;
  state.accounts.forEach(acc => {
    const val = accountValue(acc, true);
    if (val > 0) debit += val;
    else credit += val;
  });

  const accounts = state.accounts.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    provider: a.provider_name || providerName(a.provider_id),
    valueEur: accountValue(a, true)
  }));

  return {
    providerCount: state.providers.length,
    accountCount: state.accounts.length,
    globalValue: totalPortfolioValue(),
    debit,
    credit,
    byType,
    byProvider,
    accounts
  };
}

// Current UTC date as a YYYYMMDD string (matches the snapshot `day` format).
function todayDayString() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

// Return the data of the snapshot immediately before the current view, or null when there is none.
// - In Time Travel: the next older snapshot in the newest-first list (null when viewing the oldest).
// - On the live dashboard: the most recent snapshot that is NOT from today (a same-day snapshot is
//   ignored because it reflects the same live state), falling back to the next older one; null when
//   there is no such snapshot.
function getPreviousSnapshotData() {
  if (timeTravelActive()) {
    const idx = timeTravelList.findIndex(s => s.day === timeTravelSnapshot.day);
    if (idx < 0 || idx >= timeTravelList.length - 1) return null;
    return timeTravelList[idx + 1].data;
  }
  if (timeTravelList.length === 0) return null;
  const today = todayDayString();
  const prev = timeTravelList.find(s => s.day !== today);
  return prev ? prev.data : null;
}

// Return the previous snapshot's value (EUR) for an account, or null if the account wasn't in it.
function previousAccountValue(prevData, accountId) {
  if (!prevData || !prevData.accounts) return null;
  const prev = prevData.accounts.find(a => Number(a.id) === Number(accountId));
  return prev ? Number(prev.valueEur || 0) : null;
}

// Border class for an account card based on its value change vs the previous snapshot:
// 'account-up' (green) when increased, 'account-down' (red) when decreased, '' when equal or no previous value.
function accountChangeClass(current, prev) {
  if (prev === null || current === prev) return '';
  return current > prev ? 'account-up' : 'account-down';
}

// Format a value change for appending to a dashboard value, e.g. "(+€20.00)" / "(-€20.00)" / "(±€0.00)".
function formatDelta(delta) {
  const cls = delta > 0 ? 'pos' : (delta < 0 ? 'neg' : 'zero');
  const sign = delta > 0 ? '(+' : (delta < 0 ? '(-' : '(±');
  const num = moneyEUR.format(Math.abs(delta));
  return `<span class="value-delta ${cls}"><span class="delta-sign">${sign}</span><span class="delta-num">${num}</span>)</span>`;
}

function renderTopGoalDashboardCard(snapshotAccounts) {
  const topGoalValEl = $('#topGoalValue');
  const topGoalSubEl = $('#topGoalSubtext');
  if (!topGoalValEl || !topGoalSubEl) return;

  const goals = state.goals || [];
  if (!goals.length) {
    topGoalValEl.textContent = '—';
    topGoalSubEl.textContent = 'no active goals';
    topGoalValEl.className = 'value';
    return;
  }

  const sorted = goals.slice().sort((a, b) => (a.order_by ?? 0) - (b.order_by ?? 0) || a.id - b.id);
  const topGoal = sorted[0];

  let pct = 0;
  if (snapshotAccounts && Array.isArray(snapshotAccounts)) {
    const prog = goalProgressFromSnapshot(topGoal, snapshotAccounts);
    pct = prog !== null ? prog : 0;
  } else {
    const current = goalCurrentValue(topGoal);
    const target = Number(topGoal.value || 0);

    if (target === 0) {
      const currency = topGoal.coin || 'USD';
      const linked = state.accounts.filter(a => (topGoal.account_ids || []).includes(a.id));
      let posSum = 0, negSum = 0;
      linked.forEach(acc => {
        const val = accountValue(acc, false);
        const rate = getExchangeRate(acc.coin || 'USD', currency);
        const converted = rate ? val * rate : val;
        if (converted > 0) posSum += converted; else negSum += converted;
      });
      const absNeg = Math.abs(negSum);
      pct = absNeg > 0 ? Math.min(100, Math.max(0, (posSum / absNeg) * 100)) : 100;
    } else {
      pct = Math.min(100, Math.max(0, (current / target) * 100));
    }
  }

  topGoalValEl.textContent = `${pct.toFixed(1)}%`;
  topGoalValEl.className = 'value ' + (pct >= 100 ? 'pos' : '');
  topGoalSubEl.textContent = topGoal.goal_name ? `🎯 ${topGoal.goal_name}` : 'Top Goal';
}

function renderAllTimeGrowthDashboardCard(currentNetWorth) {
  const growthValEl = $('#allTimeGrowthValue');
  const growthSubEl = $('#allTimeGrowthSubtext');
  const growthLabelEl = $('#growthCardLabel') || $('#growthCard')?.querySelector('.label');
  if (!growthValEl || !growthSubEl) return;

  let labelText = 'All-Time Growth';
  if (growthCardMode === 'ytd') labelText = 'YTD Growth';
  else if (growthCardMode === 'month') labelText = 'Month Growth';
  if (growthLabelEl) growthLabelEl.textContent = labelText;

  if (!timeTravelList || !timeTravelList.length) {
    growthValEl.textContent = '—';
    growthSubEl.textContent = 'no snapshot history';
    growthValEl.className = 'value';
    return;
  }

  function parseSnapshotDateObj(day, createdAt) {
    if (day && /^\d{8}$/.test(day)) {
      const y = Number(day.slice(0, 4));
      const m = Number(day.slice(4, 6)) - 1;
      const d = Number(day.slice(6, 8));
      return new Date(Date.UTC(y, m, d));
    }
    return createdAt ? new Date(createdAt) : new Date();
  }

  const currentDate = timeTravelActive() && timeTravelSnapshot
    ? parseSnapshotDateObj(timeTravelSnapshot.day, timeTravelSnapshot.created_at)
    : new Date();

  function getSnapshotYearMonth(s) {
    if (s.day && /^\d{8}$/.test(s.day)) {
      return {
        year: Number(s.day.slice(0, 4)),
        month: Number(s.day.slice(4, 6)) - 1
      };
    }
    const dt = parseSnapshotDateObj(s.day, s.created_at);
    return {
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth()
    };
  }

  const targetYear = timeTravelActive() && timeTravelSnapshot && timeTravelSnapshot.day && /^\d{8}$/.test(timeTravelSnapshot.day)
    ? Number(timeTravelSnapshot.day.slice(0, 4))
    : currentDate.getUTCFullYear();

  const targetMonth = timeTravelActive() && timeTravelSnapshot && timeTravelSnapshot.day && /^\d{8}$/.test(timeTravelSnapshot.day)
    ? Number(timeTravelSnapshot.day.slice(4, 6)) - 1
    : currentDate.getUTCMonth();

  const validSnapshots = timeTravelList.filter(s => parseSnapshotDateObj(s.day, s.created_at) <= currentDate);
  const pool = validSnapshots.length ? validSnapshots : timeTravelList;

  let baselineSnapshot = pool[pool.length - 1]; // default oldest snapshot

  if (growthCardMode === 'ytd') {
    const yearSnapshots = pool.filter(s => getSnapshotYearMonth(s).year === targetYear);
    if (yearSnapshots.length) {
      baselineSnapshot = yearSnapshots[yearSnapshots.length - 1];
    }
  } else if (growthCardMode === 'month') {
    const monthSnapshots = pool.filter(s => {
      const ym = getSnapshotYearMonth(s);
      return ym.year === targetYear && ym.month === targetMonth;
    });
    if (monthSnapshots.length) {
      baselineSnapshot = monthSnapshots[monthSnapshots.length - 1];
    } else {
      const yearSnapshots = pool.filter(s => getSnapshotYearMonth(s).year === targetYear);
      if (yearSnapshots.length) {
        baselineSnapshot = yearSnapshots[yearSnapshots.length - 1];
      }
    }
  }

  const initialValue = Number(baselineSnapshot.data?.globalValue || 0);
  const curValue = currentNetWorth !== undefined ? currentNetWorth : totalPortfolioValue();
  const diff = curValue - initialValue;

  const pct = initialValue !== 0 ? ((diff / Math.abs(initialValue)) * 100) : 0;
  const formattedDiff = (diff > 0 ? '+' : (diff < 0 ? '−' : '')) + moneyEUR.format(Math.abs(diff));
  const formattedPct = (pct > 0 ? '+' : (pct < 0 ? '−' : '')) + Math.abs(pct).toFixed(1) + '%';
  const snapshotDate = baselineSnapshot.day ? formatSnapshotDay(baselineSnapshot.day) : formatDate(baselineSnapshot.created_at);

  const baselineDate = parseSnapshotDateObj(baselineSnapshot.day, baselineSnapshot.created_at);
  const daysDiff = Math.max(1, (currentDate.getTime() - baselineDate.getTime()) / (1000 * 60 * 60 * 24));

  let paceHtml = '';
  if (growthCardMode === 'month') {
    // Current day of the month (1-indexed, e.g. 1st = 1, 15th = 15)
    const currentDayOfMonth = Math.max(1, currentDate.getUTCDate());
    const perDayVal = diff / currentDayOfMonth;
    const formattedPerDay = (perDayVal > 0 ? '+' : (perDayVal < 0 ? '−' : '')) + moneyEUR.format(Math.abs(perDayVal));
    paceHtml = `${formattedPerDay} / day`;
  } else if (growthCardMode === 'ytd') {
    // Number of elapsed months in the year up to current month (1-indexed, e.g. Jan = 1, Feb = 2)
    const elapsedMonthsYTD = Math.max(1, currentDate.getUTCMonth() + 1);
    const perMonthVal = diff / elapsedMonthsYTD;
    const formattedPerMonth = (perMonthVal > 0 ? '+' : (perMonthVal < 0 ? '−' : '')) + moneyEUR.format(Math.abs(perMonthVal));
    paceHtml = `${formattedPerMonth} / month`;
  } else {
    const monthsDiff = Math.max(1, daysDiff / 30.4375);
    const perMonthVal = diff / monthsDiff;
    const formattedPerMonth = (perMonthVal > 0 ? '+' : (perMonthVal < 0 ? '−' : '')) + moneyEUR.format(Math.abs(perMonthVal));
    paceHtml = `${formattedPerMonth} / month`;
  }

  growthValEl.textContent = formattedDiff;
  growthValEl.className = 'value ' + (diff > 0 ? 'pos' : (diff < 0 ? 'neg' : ''));
  growthSubEl.innerHTML = `${formattedPct} vs baseline (${snapshotDate})<br><span style="font-size:11px;opacity:0.85;">${paceHtml}</span>`;
}

// Render the dashboard cards, charts and account overview from a snapshot payload.
function renderDashboardFromSnapshot(data) {
  const d = data || {};
  const v = Number(d.globalValue || 0);
  renderTopGoalDashboardCard(d.accounts);
  renderAllTimeGrowthDashboardCard(v);
  const prev = getPreviousSnapshotData();
  const portfolioValueEl = $('#portfolioValue');
  if (portfolioValueEl) {
    const v = Number(d.globalValue || 0);
    const delta = prev ? formatDelta(v - Number(prev.globalValue || 0)) : '';
    portfolioValueEl.innerHTML = `${moneyEUR.format(v)}${delta}`;
    portfolioValueEl.className = 'value ' + (v < 0 ? 'neg' : (v > 0 ? 'pos' : ''));
  }
  const debitCreditValue = $('#debitCreditValue');
  if (debitCreditValue) {
    const debit = Number(d.debit || 0);
    const credit = Number(d.credit || 0);
    const debitDelta = prev ? formatDelta(debit - Number(prev.debit || 0)) : '';
    const creditDelta = prev ? formatDelta(credit - Number(prev.credit || 0)) : '';
    debitCreditValue.innerHTML = `<span class="pos">${moneyEUR.format(debit)}${debitDelta}</span><br><span class="neg">${moneyEUR.format(credit)}${creditDelta}</span>`;
  }

  // Charts (By Type / By Provider) + legends
  if (typeof Chart !== 'undefined') {
    const allocCtx = document.getElementById('allocationChart')?.getContext('2d');
    const typeCtx = document.getElementById('accountTypeChart')?.getContext('2d');
    if (allocationChartInstance) allocationChartInstance.destroy();
    if (accountTypeChartInstance) accountTypeChartInstance.destroy();
    allocationChartInstance = null;
    accountTypeChartInstance = null;
    renderDashboardBreakdownHeading();

    const byType = d.byType || {};
    const byProvider = d.byProvider || {};
    const byAccount = {};
    (d.accounts || []).forEach(account => {
      const name = account.name || '—';
      byAccount[name] = (byAccount[name] || 0) + Number(account.valueEur || 0);
    });
    const allocTop = topNWithOthers(byType, 9);
    const breakdownTop = topNWithOthers(dashboardBreakdownMode === 'account' ? byAccount : byProvider, 9);
    const allocDataAbs = allocTop.data.map(v => Math.abs(v));
    const breakdownDataAbs = breakdownTop.data.map(v => Math.abs(v));

    if (allocCtx) {
      allocationChartInstance = new Chart(allocCtx, {
        type: 'doughnut',
        data: {
          labels: allocTop.labels.length ? allocTop.labels : ['No Data'],
          datasets: [{ data: allocDataAbs.length ? allocDataAbs : [1], backgroundColor: allocDataAbs.length ? CHART_COLORS : ['#2a3550'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } }
      });
    }
    if (typeCtx) {
      accountTypeChartInstance = new Chart(typeCtx, {
        type: 'doughnut',
        data: {
          labels: breakdownTop.labels.length ? breakdownTop.labels : ['No Data'],
          datasets: [{ data: breakdownDataAbs.length ? breakdownDataAbs : [1], backgroundColor: breakdownDataAbs.length ? CHART_COLORS : ['#2a3550'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } }
      });
    }
    renderLegend('allocationLegend', allocTop.labels, allocTop.data, CHART_COLORS, false);
    renderLegend('providerLegend', breakdownTop.labels, breakdownTop.data, CHART_COLORS, false);
  }

  // Account overview
  const container = $('#dashboardAccounts');
  if (container) {
    const accounts = d.accounts || [];
    renderDashboardAccountsSummary(accounts, prev);
    container.innerHTML = accounts.length ? `
      <div class="dashboard-accounts-grid">
        ${accounts.map(a => {
      const val = Number(a.valueEur || 0);
      const prevVal = previousAccountValue(prev, a.id);
      const changeClass = accountChangeClass(val, prevVal);
      return `
          <div class="account-card ${changeClass}">
            <div class="account-card-head" style="margin-bottom:4px;">
              <span class="aname">${esc(a.name)} <span class="tag ${a.type}">${esc(typeLabel(a.type))}</span></span>
              <strong class="${val < 0 ? 'neg' : 'pos'}">${moneyEUR.format(val)}</strong>
            </div>
            <div class="dlabel">${esc(a.provider || '—')}</div>
          </div>
        `;
    }).join('')}
      </div>
    ` : '<div class="page-desc">No accounts in this snapshot.</div>';
    syncDashboardAccountsCollapsed();
  }
}

// Show/hide the "viewing snapshot" banner and the Time Travel controls (button + prev/next arrows).
function renderTimeTravelBanner() {
  const banner = $('#timeTravelBanner');
  const controls = document.querySelector('.time-travel-controls');
  const loggedIn = !state.guest && state.user;
  if (controls) controls.style.display = loggedIn ? '' : 'none';
  if (banner) {
    if (timeTravelActive()) {
      banner.style.display = '';
      banner.innerHTML = `<strong>${esc(formatSnapshotDay(timeTravelSnapshot.day))}</strong> <button class="btn-sm icon-btn" type="button" id="exitTimeTravelBtn" title="Exit Time Travel">✕</button>`;
      const exitBtn = $('#exitTimeTravelBtn');
      if (exitBtn) exitBtn.addEventListener('click', exitTimeTravel);
    } else {
      banner.style.display = 'none';
      banner.innerHTML = '';
    }
  }
  updateTimeTravelArrows();
}

// Enable/disable the prev/next arrows based on the current snapshot's position in the list.
// timeTravelList is newest-first, so "previous" (older) is a higher index, "next" (newer) is a lower index.
function updateTimeTravelArrows() {
  const controls = document.querySelector('.time-travel-controls');
  const prevBtn = $('#timeTravelPrevBtn');
  const mainBtn = $('#timeTravelBtn');
  const saveBtn = $('#timeTravelSaveBtn');
  const historyBtn = $('#timeTravelHistoryBtn');
  const calendarBtn = $('#timeTravelCalendarBtn');
  const playBtn = $('#timeTravelPlayBtn');
  const nextBtn = $('#timeTravelNextBtn');
  if (!prevBtn || !nextBtn || !controls) return;

  if (snapshotsLoading) {
    controls.classList.add('is-loading');
    controls.setAttribute('title', 'Loading snapshots from database...');
    if (prevBtn) prevBtn.disabled = true;
    if (mainBtn) mainBtn.disabled = true;
    if (saveBtn) saveBtn.disabled = true;
    if (historyBtn) historyBtn.disabled = true;
    if (calendarBtn) calendarBtn.disabled = true;
    if (playBtn) playBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  controls.classList.remove('is-loading');
  controls.removeAttribute('title');
  if (mainBtn) mainBtn.disabled = false;
  if (saveBtn) saveBtn.disabled = false;
  if (historyBtn) historyBtn.disabled = false;
  if (calendarBtn) calendarBtn.disabled = false;

  if (playBtn) playBtn.disabled = timeTravelList.length === 0;
  if (!timeTravelActive()) {
    // Not viewing a snapshot: back is active if any snapshot exists (enters Time Travel), forward is disabled.
    prevBtn.disabled = timeTravelList.length === 0;
    nextBtn.disabled = true;
    return;
  }
  const idx = timeTravelList.findIndex(s => s.day === timeTravelSnapshot.day);
  // Back (older) is active when there is an older snapshot.
  prevBtn.disabled = idx < 0 || idx >= timeTravelList.length - 1;
  // Forward (newer) is active when there is a newer snapshot; on the most recent snapshot it stays active to exit Time Travel.
  nextBtn.disabled = idx < 0;
}

async function openTimeTravelModal() {
  stopTimeTravelPlay();
  snapshotPage = 0;
  openModal('timeTravelModalOverlay');
  await loadSnapshotList();
}

async function loadSnapshotList() {
  const list = $('#snapshotList');
  if (!list) return;
  hydrateSnapshotCache();
  snapshotsLoading = false;
  if (timeTravelList.length) renderSnapshotPage();
  else list.innerHTML = '<div class="page-desc">No snapshots stored locally.</div>';
  updateTimeTravelArrows();
}

// Render the current page of snapshots (SNAPSHOTS_PER_PAGE per page, newest first) plus pagination controls.
function renderSnapshotPage() {
  const list = $('#snapshotList');
  if (!list) return;
  const totalPages = Math.max(1, Math.ceil(timeTravelList.length / SNAPSHOTS_PER_PAGE));
  if (snapshotPage >= totalPages) snapshotPage = totalPages - 1;
  if (snapshotPage < 0) snapshotPage = 0;
  const start = snapshotPage * SNAPSHOTS_PER_PAGE;
  const pageSnapshots = timeTravelList.slice(start, start + SNAPSHOTS_PER_PAGE);
  list.innerHTML = pageSnapshots.map(s => `
    <div class="snapshot-row">
      <span class="snapshot-day">${esc(formatSnapshotDay(s.day))}</span>
      <span class="snapshot-meta">${esc(s.day)}</span>
      <div class="snapshot-actions">
        <button class="btn-sm" type="button" data-view-snapshot="${esc(s.day)}">View</button>
        <button class="btn-sm danger" type="button" data-delete-snapshot="${esc(s.day)}" ${timeTravelActive() && timeTravelSnapshot.day === s.day ? 'disabled' : ''}>Delete</button>
      </div>
    </div>
  `).join('');
  renderSnapshotPagination(totalPages);
}

// Render the pagination controls (prev / page indicator / next) for the snapshot list.
function renderSnapshotPagination(totalPages) {
  const pagination = $('#snapshotPagination');
  if (!pagination) return;
  if (totalPages <= 1) {
    pagination.style.display = 'none';
    pagination.innerHTML = '';
    return;
  }
  pagination.style.display = 'flex';
  pagination.innerHTML = `
    <button class="btn-sm" type="button" id="snapshotPagePrev" ${snapshotPage === 0 ? 'disabled' : ''}>←</button>
    <span class="snapshot-page-indicator">Page ${snapshotPage + 1} of ${totalPages}</span>
    <button class="btn-sm" type="button" id="snapshotPageNext" ${snapshotPage >= totalPages - 1 ? 'disabled' : ''}>→</button>
  `;
  $('#snapshotPagePrev')?.addEventListener('click', () => { snapshotPage--; renderSnapshotPage(); });
  $('#snapshotPageNext')?.addEventListener('click', () => { snapshotPage++; renderSnapshotPage(); });
}

// Open the standalone calendar modal (calendar only, no snapshot list or other buttons).
async function openCalendarModal() {
  stopTimeTravelPlay();
  const now = new Date();
  calendarMonth = { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  calendarPicker = false;
  openModal('calendarModalOverlay');
  const body = $('#calendarModalBody');
  if (body) renderSnapshotCalendar(body);
}

// Render the calendar for the currently selected month. Days with a snapshot are highlighted in blue.
// Clicking the month/year label toggles a year/month picker (calendarPicker).
// Renders into the given container (the standalone calendar modal body).
function renderSnapshotCalendar(container) {
  const calendar = container;
  if (!calendar || !calendarMonth) return;
  const { year, month } = calendarMonth;
  const snapshotDays = new Set(timeTravelList.map(s => s.day));
  const firstDay = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startWeekday = firstDay.getUTCDay(); // 0 = Sunday
  const monthLabel = firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekdayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  if (calendarPicker) {
    // Year/month picker: a year stepper plus a grid of the 12 months.
    calendar.innerHTML = `
      <div class="cal-head">
        <button class="btn-sm" type="button" id="calPickerYearPrev" title="Previous years">←</button>
        <span class="cal-month-label">${esc(String(year))}</span>
        <button class="btn-sm" type="button" id="calPickerYearNext" title="Next years">→</button>
      </div>
      <div class="cal-picker-grid">
        ${monthNames.map((name, i) => `
          <button class="cal-picker-month ${i === month ? 'cal-picker-current' : ''}" type="button" data-pick-month="${i}">${name}</button>
        `).join('')}
      </div>
    `;
    $('#calPickerYearPrev')?.addEventListener('click', () => {
      calendarMonth = { year: year - 1, month };
      renderSnapshotCalendar(container);
    });
    $('#calPickerYearNext')?.addEventListener('click', () => {
      calendarMonth = { year: year + 1, month };
      renderSnapshotCalendar(container);
    });
    calendar.querySelectorAll('[data-pick-month]').forEach(btn => {
      btn.addEventListener('click', () => {
        calendarMonth = { year, month: Number(btn.dataset.pickMonth) };
        calendarPicker = false;
        renderSnapshotCalendar(container);
      });
    });
    return;
  }

  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += '<div class="cal-cell cal-empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${year}${String(month + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`;
    const hasSnapshot = snapshotDays.has(dayStr);
    cells += `<button class="cal-cell cal-day ${hasSnapshot ? 'cal-has-snapshot' : ''}" type="button" data-cal-day="${dayStr}" ${hasSnapshot ? '' : 'disabled'}>${d}</button>`;
  }
  calendar.innerHTML = `
    <div class="cal-head">
      <button class="btn-sm" type="button" id="calPrevMonth" title="Previous month">←</button>
      <button class="cal-month-label cal-month-btn" type="button" id="calMonthLabel" title="Select year and month">${esc(monthLabel)}</button>
      <button class="btn-sm" type="button" id="calNextMonth" title="Next month">→</button>
    </div>
    <div class="cal-grid">
      ${weekdayNames.map(w => `<div class="cal-cell cal-weekday">${w}</div>`).join('')}
      ${cells}
    </div>
  `;
  $('#calPrevMonth')?.addEventListener('click', () => {
    calendarMonth = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
    renderSnapshotCalendar(container);
  });
  $('#calNextMonth')?.addEventListener('click', () => {
    calendarMonth = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
    renderSnapshotCalendar(container);
  });
  $('#calMonthLabel')?.addEventListener('click', () => {
    calendarPicker = true;
    renderSnapshotCalendar(container);
  });
  calendar.querySelectorAll('[data-cal-day]').forEach(btn => {
    btn.addEventListener('click', () => viewSnapshot(btn.dataset.calDay));
  });
}

async function saveSnapshot() {
  const btn = $('#timeTravelSaveBtn');
  if (btn) btn.disabled = true;
  try {
    const data = collectDashboardSnapshot();
    const result = await request('/snapshots', { method: 'POST', body: JSON.stringify({ data }) });
    if (result.snapshot) upsertSnapshot(result.snapshot);
    toast('Today\'s snapshot saved.');
    renderSnapshotPage();
  } catch (error) {
    toast(error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function viewSnapshot(day) {
  hydrateSnapshotCache();
  const snapshot = timeTravelList.find(item => item.day === day);
  if (!snapshot) {
    toast('Snapshot data is not available locally. Use Refresh while online first.');
    return;
  }
  try {
    timeTravelSnapshot = snapshot;
    closeModal('timeTravelModalOverlay');
    render();
    toast(`Viewing snapshot from ${formatSnapshotDay(day)}.`);
  } catch (error) {
    toast(error.message);
  }
}

// Navigate to the previous (older) snapshot in the list.
// When not viewing a snapshot, enters Time Travel at the most recent snapshot.
async function goToPrevSnapshot() {
  stopTimeTravelPlay();
  if (!timeTravelActive()) {
    if (timeTravelList.length === 0) return;
    await viewSnapshot(timeTravelList[0].day);
    return;
  }
  const idx = timeTravelList.findIndex(s => s.day === timeTravelSnapshot.day);
  if (idx < 0 || idx >= timeTravelList.length - 1) return;
  await viewSnapshot(timeTravelList[idx + 1].day);
}

// Navigate to the next (newer) snapshot in the list.
// When on the most recent snapshot, exits Time Travel back to the live dashboard.
async function goToNextSnapshot() {
  stopTimeTravelPlay();
  if (!timeTravelActive()) return;
  const idx = timeTravelList.findIndex(s => s.day === timeTravelSnapshot.day);
  if (idx <= 0) {
    exitTimeTravel();
    return;
  }
  await viewSnapshot(timeTravelList[idx - 1].day);
}

// Stop any in-progress "play through snapshots" playback.
function stopTimeTravelPlay() {
  if (timeTravelPlayTimer) {
    clearTimeout(timeTravelPlayTimer);
    timeTravelPlayTimer = null;
  }
  timeTravelPlayIndex = -1;
}

// Play through all snapshots from oldest to newest, one every 2 seconds.
// Starts at the oldest snapshot, advances to the next (newer) one every 2s,
// and after showing the most recent for 2s exits Time Travel back to the live dashboard.
function timeTravelPlay() {
  if (timeTravelList.length === 0) return;
  stopTimeTravelPlay();
  timeTravelPlayIndex = timeTravelList.length - 1; // oldest (last in newest-first list)
  viewSnapshot(timeTravelList[timeTravelPlayIndex].day);
  scheduleTimeTravelPlay();
}

function scheduleTimeTravelPlay() {
  timeTravelPlayTimer = setTimeout(async () => {
    timeTravelPlayIndex--;
    if (timeTravelPlayIndex < 0) {
      // Reached the most recent snapshot; after 2s exit Time Travel.
      timeTravelPlayTimer = null;
      exitTimeTravel();
      return;
    }
    await viewSnapshot(timeTravelList[timeTravelPlayIndex].day);
    scheduleTimeTravelPlay();
  }, 2000);
}

async function deleteSnapshot(day) {
  if (!await confirmDialog(`Delete the snapshot from ${formatSnapshotDay(day)}?`)) return;
  try {
    await request(`/snapshots/${day}`, { method: 'DELETE' });
    removeSnapshot(day);
    if (timeTravelActive() && timeTravelSnapshot.day === day) {
      timeTravelSnapshot = null;
    }
    toast('Snapshot deleted.');
    renderSnapshotPage();
    render();
  } catch (error) {
    toast(error.message);
  }
}

function exitTimeTravel() {
  stopTimeTravelPlay();
  timeTravelSnapshot = null;
  render();
  toast('Exited Time Travel.');
}

// Clean snapshots: keep only the most recent snapshot per month (mode 'months') or per year (mode 'years').
// The current month / current year is never touched.
async function cleanSnapshots(mode) {
  const isMonths = mode === 'months';
  const label = isMonths ? 'month' : 'year';
  const ok = await confirmDialog(
    `Keep only the most recent snapshot per ${label}? Snapshots from the current ${label} will be left untouched.`,
    'Clean'
  );
  if (!ok) return;
  const btn = $(isMonths ? '#cleanMonthsBtn' : '#cleanYearsBtn');
  if (btn) btn.disabled = true;
  try {
    const { deleted } = await request(`/snapshots/clean-${isMonths ? 'months' : 'years'}`, { method: 'POST' });
    pruneSnapshotsLocally(mode);
    if (timeTravelActive()) timeTravelSnapshot = null;
    toast(deleted > 0 ? `Cleaned ${deleted} snapshot${deleted === 1 ? '' : 's'}.` : 'Nothing to clean.');
    renderSnapshotPage();
    render();
  } catch (error) {
    toast(error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ================= TIME TRAVEL HISTORY (line chart) ================= */

// Open the history modal, show the loading spinner, and load all snapshot data.
async function openHistoryModal() {
  stopTimeTravelPlay();
  openModal('historyModalOverlay');
  const loading = $('#historyLoading');
  const chartWrap = $('#historyChartWrap');
  const empty = $('#historyEmpty');
  if (loading) loading.style.display = 'flex';
  if (chartWrap) chartWrap.style.display = 'none';
  if (empty) empty.style.display = 'none';
  try {
    await loadHistoryData();
    renderHistoryChart();
  } catch (error) {
    if (empty) { empty.style.display = 'block'; empty.textContent = error.message; }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// Load the full data of every snapshot (newest first) into historyData.
async function loadHistoryData() {
  hydrateSnapshotCache();
  historyData = timeTravelList;
  if (!historyData.length) throw new Error('No snapshots to display.');
}

// Close the history modal and clear the chart, retaining loaded snapshot data.
function closeHistoryModal() {
  if (historyChartInstance) { historyChartInstance.destroy(); historyChartInstance = null; }
  historyMaximized = false;
  const overlay = $('#historyModalOverlay');
  if (overlay) overlay.classList.remove('maximized');
  closeModal('historyModalOverlay');
}

// Toggle the history modal between normal and maximized (fullscreen) size.
function toggleHistoryMaximize() {
  const overlay = $('#historyModalOverlay');
  if (!overlay) return;
  historyMaximized = !historyMaximized;
  overlay.classList.toggle('maximized', historyMaximized);
  const btn = $('#maximizeHistoryBtn');
  if (btn) {
    btn.textContent = historyMaximized ? '🗗' : '⛶';
    btn.title = historyMaximized ? 'Restore' : 'Maximize';
    btn.setAttribute('aria-label', historyMaximized ? 'Restore' : 'Maximize');
  }
  // Re-render the chart so it resizes to the new container size.
  if (historyChartInstance) historyChartInstance.resize();
}

// Apply the zoom filter: keep the most recent snapshot per month or per year.
function applyHistoryZoom(snapshots, zoom) {
  if (zoom === 'all' || !snapshots.length) return snapshots;
  const seen = new Set();
  const result = [];
  // snapshots are newest-first; keep the first (most recent) per month/year.
  for (const s of snapshots) {
    const key = zoom === 'monthly' ? s.day.slice(0, 6) : s.day.slice(0, 4);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(s);
    }
  }
  return result;
}

// Calculate snapshot-to-snapshot Global Value changes, aggregating all changes in each zoom period.
function buildHistoryGrowthValues(points, zoom) {
  if (zoom === 'all') {
    return points.map((point, index) => {
      if (index === 0) return null;
      return Number(point.data?.globalValue || 0) - Number(points[index - 1].data?.globalValue || 0);
    });
  }

  const sourcePoints = historyData.slice().reverse(); // oldest -> newest
  const totalsByPeriod = {};
  for (let index = 1; index < sourcePoints.length; index++) {
    const point = sourcePoints[index];
    const period = zoom === 'monthly' ? point.day.slice(0, 6) : point.day.slice(0, 4);
    const delta = Number(point.data?.globalValue || 0) - Number(sourcePoints[index - 1].data?.globalValue || 0);
    totalsByPeriod[period] = (totalsByPeriod[period] || 0) + delta;
  }
  return points.map(point => {
    const period = zoom === 'monthly' ? point.day.slice(0, 6) : point.day.slice(0, 4);
    return totalsByPeriod[period] ?? null;
  });
}

// Draw the history chart from historyData based on the selected chart type and zoom.
function renderHistoryChart() {
  const chartType = $('#historyChartType')?.value || 'global';
  const zoom = $('#historyZoom')?.value || 'all';
  const empty = $('#historyEmpty');
  const chartWrap = $('#historyChartWrap');
  if (!historyData || !historyData.length) {
    if (empty) { empty.style.display = 'block'; empty.textContent = 'No snapshots to display.'; }
    if (chartWrap) chartWrap.style.display = 'none';
    return;
  }
  const points = applyHistoryZoom(historyData, zoom).slice().reverse(); // oldest -> newest for the x-axis
  const labels = points.map(p => formatSnapshotDay(p.day));
  const growthValues = chartType === 'byGrowth' ? buildHistoryGrowthValues(points, zoom) : null;
  const datasets = buildHistoryDatasets(points, chartType, growthValues);
  if (chartWrap) chartWrap.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const ctx = document.getElementById('historyChart')?.getContext('2d');
  if (!ctx) return;
  if (historyChartInstance) historyChartInstance.destroy();
  historyChartInstance = new Chart(ctx, {
    type: chartType === 'byGrowth' ? 'bar' : 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: '#e6ebf5' } },
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: ${moneyEUR.format(Number(context.raw || 0))}`
          }
        }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 10, color: '#e6ebf5' }, grid: { color: 'rgba(255,255,255,.05)' } },
        y: {
          ticks: { color: '#e6ebf5', callback: value => moneyEUR.format(Number(value || 0)) },
          grid: { color: 'rgba(255,255,255,.05)' }
        }
      }
    }
  });
}

// Build the datasets for the selected chart type.
function buildHistoryDatasets(points, chartType, growthValues = null) {
  const colors = CHART_COLORS;
  if (chartType === 'byGrowth') {
    const growth = growthValues || buildHistoryGrowthValues(points, 'all');
    return [{
      label: 'Growth',
      data: growth,
      borderColor: growth.map(value => value > 0 ? '#3fd0a3' : value < 0 ? '#ff5c72' : '#8b95a8'),
      backgroundColor: growth.map(value => value > 0 ? '#3fd0a3' : value < 0 ? '#ff5c72' : '#8b95a8'),
      borderWidth: 1,
      borderRadius: 8,
      borderSkipped: false,
      maxBarThickness: 48
    }];
  }
  if (chartType === 'global') {
    return [
      { label: 'Global Value', data: points.map(p => p.data.globalValue ?? 0), borderColor: colors[0], backgroundColor: colors[0], tension: 0.3, fill: false },
      { label: 'Debit', data: points.map(p => p.data.debit ?? 0), borderColor: colors[1], backgroundColor: colors[1], tension: 0.3, fill: false },
      { label: 'Credit', data: points.map(p => p.data.credit ?? 0), borderColor: colors[2], backgroundColor: colors[2], tension: 0.3, fill: false }
    ];
  }
  const categoryMaps = points.map(p => {
    if (chartType === 'byAccount') {
      return (p.data.accounts || []).reduce((map, account) => {
        const name = account.name || '—';
        map[name] = (map[name] || 0) + Number(account.valueEur || 0);
        return map;
      }, {});
    }
    const key = chartType === 'byType' ? 'byType' : 'byProvider';
    return p.data[key] || {};
  });
  const totals = {};
  categoryMaps.forEach(map => Object.entries(map).forEach(([category, value]) => {
    totals[category] = (totals[category] || 0) + Number(value || 0);
  }));
  const top = topNWithOthers(totals, 9);
  const categories = top.labels;
  return categories.map((cat, i) => ({
    label: cat,
    data: categoryMaps.map(map => cat === 'Others'
      ? top.others.reduce((sum, other) => sum + Number(map[other] || 0), 0)
      : Number(map[cat] || 0)),
    borderColor: colors[i % colors.length],
    backgroundColor: colors[i % colors.length],
    tension: 0.3,
    fill: false
  }));
}

// Open the account history modal for a given account id.
async function openAccountHistoryModal(accountId) {
  const account = state.accounts.find(a => a.id === accountId);
  if (!account) return;
  accountHistoryAccountId = accountId;
  const title = $('#accountHistoryTitle');
  if (title) title.textContent = `📈 ${account.name} — History`;
  openModal('accountHistoryModalOverlay');
  const loading = $('#accountHistoryLoading');
  const chartWrap = $('#accountHistoryChartWrap');
  const empty = $('#accountHistoryEmpty');
  if (loading) loading.style.display = 'flex';
  if (chartWrap) chartWrap.style.display = 'none';
  if (empty) empty.style.display = 'none';
  try {
    hydrateSnapshotCache();
    accountHistoryData = timeTravelList;
    renderAccountHistoryChart();
  } catch (error) {
    if (empty) { empty.style.display = 'block'; empty.textContent = error.message; }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// Close the account history modal and clear the chart, retaining loaded snapshot data.
function closeAccountHistoryModal() {
  if (accountHistoryChartInstance) { accountHistoryChartInstance.destroy(); accountHistoryChartInstance = null; }
  accountHistoryMaximized = false;
  accountHistoryAccountId = null;
  const overlay = $('#accountHistoryModalOverlay');
  if (overlay) overlay.classList.remove('maximized');
  closeModal('accountHistoryModalOverlay');
}

// Toggle the account history modal between normal and maximized (fullscreen) size.
function toggleAccountHistoryMaximize() {
  const overlay = $('#accountHistoryModalOverlay');
  if (!overlay) return;
  accountHistoryMaximized = !accountHistoryMaximized;
  overlay.classList.toggle('maximized', accountHistoryMaximized);
  const btn = $('#maximizeAccountHistoryBtn');
  if (btn) {
    btn.textContent = accountHistoryMaximized ? '🗗' : '⛶';
    btn.title = accountHistoryMaximized ? 'Restore' : 'Maximize';
    btn.setAttribute('aria-label', accountHistoryMaximized ? 'Restore' : 'Maximize');
  }
  if (accountHistoryChartInstance) accountHistoryChartInstance.resize();
}

// Draw the line chart for the selected account's value evolution across snapshots.
function renderAccountHistoryChart() {
  const zoom = $('#accountHistoryZoom')?.value || 'all';
  const empty = $('#accountHistoryEmpty');
  const chartWrap = $('#accountHistoryChartWrap');
  if (!accountHistoryData || !accountHistoryData.length || !accountHistoryAccountId) {
    if (empty) { empty.style.display = 'block'; empty.textContent = 'No snapshots to display.'; }
    if (chartWrap) chartWrap.style.display = 'none';
    return;
  }
  const points = applyHistoryZoom(accountHistoryData, zoom).slice().reverse(); // oldest -> newest
  const labels = points.map(p => formatSnapshotDay(p.day));
  const values = points.map(p => {
    const acc = (p.data && p.data.accounts || []).find(a => a.id === accountHistoryAccountId);
    return acc ? (acc.valueEur ?? 0) : null;
  });
  const hasData = values.some(v => v !== null);
  if (!hasData) {
    if (empty) { empty.style.display = 'block'; empty.textContent = 'No data for this account in the available snapshots.'; }
    if (chartWrap) chartWrap.style.display = 'none';
    return;
  }
  if (chartWrap) chartWrap.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const ctx = document.getElementById('accountHistoryChart')?.getContext('2d');
  if (!ctx) return;
  if (accountHistoryChartInstance) accountHistoryChartInstance.destroy();
  accountHistoryChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Value (EUR)',
        data: values,
        borderColor: CHART_COLORS[0],
        backgroundColor: CHART_COLORS[0],
        tension: 0.3,
        fill: false,
        spanGaps: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 10, color: '#e6ebf5' }, grid: { color: 'rgba(255,255,255,.05)' } },
        y: { ticks: { color: '#e6ebf5' }, grid: { color: 'rgba(255,255,255,.05)' } }
      }
    }
  });
}

// Open the goal history modal and load all snapshot data for the goal's value over time.
async function openGoalHistoryModal(goalId) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return;
  goalHistoryGoalId = goalId;
  const title = $('#goalHistoryTitle');
  if (title) title.textContent = `📈 ${goal.goal_name} — History`;
  openModal('goalHistoryModalOverlay');
  const loading = $('#goalHistoryLoading');
  const chartWrap = $('#goalHistoryChartWrap');
  const empty = $('#goalHistoryEmpty');
  if (loading) loading.style.display = 'flex';
  if (chartWrap) chartWrap.style.display = 'none';
  if (empty) empty.style.display = 'none';
  try {
    hydrateSnapshotCache();
    goalHistoryData = timeTravelList;
    renderGoalHistoryChart();
  } catch (error) {
    if (empty) { empty.style.display = 'block'; empty.textContent = error.message; }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// Close the goal history modal and clear the chart, retaining loaded snapshot data.
function closeGoalHistoryModal() {
  if (goalHistoryChartInstance) { goalHistoryChartInstance.destroy(); goalHistoryChartInstance = null; }
  goalHistoryMaximized = false;
  goalHistoryGoalId = null;
  const overlay = $('#goalHistoryModalOverlay');
  if (overlay) overlay.classList.remove('maximized');
  closeModal('goalHistoryModalOverlay');
}

// Toggle the goal history modal between normal and maximized (fullscreen) size.
function toggleGoalHistoryMaximize() {
  const overlay = $('#goalHistoryModalOverlay');
  if (!overlay) return;
  goalHistoryMaximized = !goalHistoryMaximized;
  overlay.classList.toggle('maximized', goalHistoryMaximized);
  const btn = $('#maximizeGoalHistoryBtn');
  if (btn) {
    btn.textContent = goalHistoryMaximized ? '🗗' : '⛶';
    btn.title = goalHistoryMaximized ? 'Restore' : 'Maximize';
    btn.setAttribute('aria-label', goalHistoryMaximized ? 'Restore' : 'Maximize');
  }
  if (goalHistoryChartInstance) goalHistoryChartInstance.resize();
}

// Compute a goal's progress percentage (0-100) from a snapshot's account data.
// Mirrors goalProgressHTML: normal goals use current/target; debt goals use
// positive-sum / absolute-negative-sum. Account values are stored in EUR.
function goalProgressFromSnapshot(goal, snapshotAccounts) {
  const linked = (snapshotAccounts || []).filter(a => (goal.account_ids || []).includes(a.id));
  const target = Number(goal.value || 0);

  // Debt clearing goal (target === 0)
  if (target === 0) {
    let posSum = 0, negSum = 0;
    linked.forEach(acc => {
      const val = Number(acc.valueEur || 0);
      if (val > 0) posSum += val; else negSum += val;
    });
    const absNeg = Math.abs(negSum);
    if (absNeg <= 0) return null;
    return Math.min(100, Math.max(0, (posSum / absNeg) * 100));
  }

  // Normal goal (target > 0)
  const current = linked.reduce((s, acc) => s + Number(acc.valueEur || 0), 0);
  return Math.min(100, Math.max(0, (current / target) * 100));
}

// Draw the line chart for the selected goal's progress percentage (0-100) across snapshots.
function renderGoalHistoryChart() {
  const zoom = $('#goalHistoryZoom')?.value || 'all';
  const empty = $('#goalHistoryEmpty');
  const chartWrap = $('#goalHistoryChartWrap');
  if (!goalHistoryData || !goalHistoryData.length || !goalHistoryGoalId) {
    if (empty) { empty.style.display = 'block'; empty.textContent = 'No snapshots to display.'; }
    if (chartWrap) chartWrap.style.display = 'none';
    return;
  }
  const goal = state.goals.find(g => g.id === goalHistoryGoalId);
  if (!goal) {
    if (empty) { empty.style.display = 'block'; empty.textContent = 'Goal not found.'; }
    if (chartWrap) chartWrap.style.display = 'none';
    return;
  }
  const points = applyHistoryZoom(goalHistoryData, zoom).slice().reverse(); // oldest -> newest
  const labels = points.map(p => formatSnapshotDay(p.day));
  const values = points.map(p => {
    const accounts = (p.data && p.data.accounts) || [];
    return goalProgressFromSnapshot(goal, accounts);
  });
  const hasData = values.some(v => v !== null);
  if (!hasData) {
    if (empty) { empty.style.display = 'block'; empty.textContent = 'No data for this goal in the available snapshots.'; }
    if (chartWrap) chartWrap.style.display = 'none';
    return;
  }
  if (chartWrap) chartWrap.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const ctx = document.getElementById('goalHistoryChart')?.getContext('2d');
  if (!ctx) return;
  if (goalHistoryChartInstance) goalHistoryChartInstance.destroy();
  goalHistoryChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Progress (%)',
        data: values,
        borderColor: CHART_COLORS[0],
        backgroundColor: CHART_COLORS[0],
        tension: 0.3,
        fill: false,
        spanGaps: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 10, color: '#e6ebf5' }, grid: { color: 'rgba(255,255,255,.05)' } },
        y: {
          min: 0,
          max: 100,
          ticks: { color: '#e6ebf5', callback: v => `${v}%` },
          grid: { color: 'rgba(255,255,255,.05)' }
        }
      }
    }
  });
}

// Render the System Assets tab (platform assets, admin-managed).
function renderSystemAssets() {
  const searchInput = $('#systemAssetSearch')?.value.toLowerCase() || '';
  const typeFilter = $('#systemAssetTypeFilter')?.value || '';
  const admin = isAdminUser();
  const items = state.assets
    .filter(a => a.is_personal !== 1)
    .filter(a => (!typeFilter || a.type === typeFilter) && `${a.symbol || ''} ${a.name}`.toLowerCase().includes(searchInput));

  if ($('#systemAssetsTable')) {
    $('#systemAssetsTable').innerHTML = items.length ? items.map(a => `
      <tr>
        <td><strong>${esc(a.symbol || '—')}</strong></td>
        <td>${esc(a.name)}</td>
        <td><span class="tag ${a.type}">${esc(a.type)}</span></td>
        <td>${a.price == null ? '—' : formatCurrency(a.price, a.coin || 'USD')}</td>
        <td>${a.dividend_yield == null ? '—' : `${a.dividend_yield}%`}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${admin ? `<button class="btn-sm action-icon-btn" data-update-asset="${a.id}" title="Update">🔄</button>` : ''}
            ${admin ? `<button class="btn-sm action-icon-btn" data-edit-asset="${a.id}" data-edit-asset-personal="0" title="Edit">✏️</button>` : ''}
            ${admin ? `<button class="btn-sm action-icon-btn danger" data-delete-asset="${a.id}" data-delete-asset-personal="0" title="Delete">🗑️</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('') : emptyRow(6, 'No system assets found.');
  }
}

// Render the Personal Assets tab (user-scoped assets).
function renderPersonalAssets() {
  const searchInput = $('#personalAssetSearch')?.value.toLowerCase() || '';
  const typeFilter = $('#personalAssetTypeFilter')?.value || '';
  const items = state.assets
    .filter(a => a.is_personal === 1)
    .filter(a => (!typeFilter || a.type === typeFilter) && `${a.symbol || ''} ${a.name}`.toLowerCase().includes(searchInput));
  const admin = isAdminUser();

  if ($('#personalAssetsTable')) {
    $('#personalAssetsTable').innerHTML = items.length ? items.map(a => {
      const canManage = admin || a.user_id === state.user?.id;
      return `
      <tr>
        <td><strong>${esc(a.symbol || '—')}</strong></td>
        <td>${esc(a.name)}</td>
        <td><span class="tag ${a.type}">${esc(a.type)}</span></td>
        <td>${a.price == null ? '—' : formatCurrency(a.price, a.coin || 'USD')}</td>
        <td>${a.dividend_yield == null ? '—' : `${a.dividend_yield}%`}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${canManage ? `<button class="btn-sm action-icon-btn" data-edit-asset="${a.id}" data-edit-asset-personal="1" title="Edit">✏️</button>` : ''}
            ${canManage ? `<button class="btn-sm action-icon-btn danger" data-delete-asset="${a.id}" data-delete-asset-personal="1" title="Delete">🗑️</button>` : ''}
          </div>
        </td>
      </tr>
    `;
    }).join('') : emptyRow(6, 'No personal assets found.');
  }
}

// Render the active Assets page tab.
function renderAssets() {
  if (activeAssetTab === 'personal') {
    renderPersonalAssets();
  } else {
    renderSystemAssets();
  }
}

// Switch between the System Assets and Personal Assets tabs.
function switchAssetTab(tab) {
  activeAssetTab = tab;
  document.querySelectorAll('.asset-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.assetTab === tab);
  });
  document.querySelectorAll('.asset-panel').forEach(panel => {
    panel.style.display = panel.id === `asset-panel-${tab}` ? '' : 'none';
  });
  renderAssets();
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
  // Only assets with a real dividend yield (> 0)
  const items = state.assets.filter(a => a.dividend_yield != null && Number(a.dividend_yield) > 0);

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
      // EUR conversion shown in () when the account's currency is not EUR
      const eurVal = accountValue(acc, true);
      const eurSuffix = currency === 'EUR' ? '' : ` <span style="color:var(--muted);font-weight:400;font-size:12px;">(${formatCurrency(eurVal, 'EUR')})</span>`;
      const valueHTML = `<span class="dvalue ${val < 0 ? 'neg' : 'pos'}">${formatCurrency(val, currency)}${eurSuffix}</span>`;
      let details = '';
      let headActions = '';
      if (acc.type === 'asset_account') {
        const holdingCount = state.holdings.filter(h => h.account_id === acc.id).length;
        details = `<div class="account-detail-grid">
          <div><div class="dlabel">Value</div>${valueHTML}</div>
          <div><div class="dlabel">Holdings</div><div class="dvalue">${holdingCount} assets</div></div>
        </div>`;
        if (holdingCount > 0) {
          headActions = `<button class="btn-sm action-icon-btn" data-account-details="${acc.id}" title="Details">ℹ️</button>`;
        }
      } else if (acc.type === 'loan' || acc.type === 'interest_account') {
        const finishDate = acc.type === 'loan' && acc.finish_date ? finishDateToInput(acc.finish_date) : '';
        details = `<div class="account-detail-grid">
          <div><div class="dlabel">Balance</div>${valueHTML}</div>
          <div><div class="dlabel">Interest Rate</div><div class="dvalue">${acc.interest_rate != null ? Number(acc.interest_rate).toFixed(2) : '0.00'}%</div></div>
          ${acc.type === 'loan' ? `<div><div class="dlabel">Finish Date</div><div class="dvalue">${finishDate || '—'}</div></div>` : ''}
        </div>`;
        if (acc.type === 'loan') {
          const simReady = acc.balance != null && acc.coin && acc.interest_rate != null && acc.finish_date;
          headActions = `<button class="btn-sm action-icon-btn" data-loan-sim="${acc.id}" title="Loan simulator"${simReady ? '' : ' disabled'}>⚡</button>`;
        }
      } else {
        details = `<div class="account-detail-grid">
          <div><div class="dlabel">Balance</div>${valueHTML}</div>
        </div>`;
      }

      return `<div class="account-card">
        <div class="account-card-head">
          <span class="aname">${esc(acc.name)} <span class="tag ${acc.type}">${esc(label)}</span></span>
          <div style="display:flex;gap:6px;">
            ${headActions}
            <button class="btn-sm action-icon-btn" data-edit-account="${acc.id}" title="Edit">✏️</button>
            <button class="btn-sm action-icon-btn danger" data-delete-account="${acc.id}" title="Delete">🗑️</button>
          </div>
        </div>
        ${details}
      </div>`;
    }).join('') || '<div class="page-desc" style="margin:10px 0;">No accounts under this provider yet.</div>';

    const accCount = g.accounts.length;
    const collapsed = collapsedProviders.has(g.provider.id);
    const providerTotalEur = providerValue(g.provider);
    const providerTotalClass = providerTotalEur > 0 ? 'pos' : (providerTotalEur < 0 ? 'neg' : '');
    return `<div class="provider-card${collapsed ? ' collapsed' : ''}">
      <div class="provider-card-head">
        <div class="provider-card-title">
          <button class="provider-toggle" data-toggle-provider="${g.provider.id}" title="${collapsed ? 'Expand' : 'Collapse'}">${collapsed ? '▸' : '▾'}</button>
          <span class="provider-icon">🏢</span>
          <span class="provider-name">${esc(g.provider.name)}</span>
          <span class="tag ${g.provider.type}">${esc(g.provider.type)}</span>
          <span class="provider-count">${accCount} account${accCount === 1 ? '' : 's'}</span>
          <span class="provider-total ${providerTotalClass}">${formatCurrency(providerTotalEur, 'EUR')}</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn-sm action-icon-btn add" data-add-account-provider="${g.provider.id}" title="Add Account">➕</button>
          <button class="btn-sm action-icon-btn" data-provider-details="${g.provider.id}" title="Details">ℹ️</button>
          <button class="btn-sm action-icon-btn" data-edit-provider="${g.provider.id}" title="Edit">✏️</button>
          <button class="btn-sm action-icon-btn danger" data-delete-provider="${g.provider.id}" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="provider-card-body">
        ${accountsHTML}
      </div>
    </div>`;
  }).join('') || '<div class="page-desc">No providers created yet. Create a provider first.</div>';

  $('#accountsList').innerHTML = html;
}

// Build a sortable "row" object for a holding, resolving the same display values
// used by the table so sorting matches what the user sees.
function holdingSortRow(h) {
  const asset = findAsset(h.asset_id, h.is_personal);
  const account = state.accounts.find(a => a.id === h.account_id);
  const provider = account ? state.providers.find(p => p.id === account.provider_id) : null;
  const price = asset ? Number(asset.price || 0) : Number(h.price || 0);
  const quantity = Number(h.quantity || 0);
  const isPersonalHolding = asset?.is_personal === 1 || h.is_personal === 1;
  const name = (h.asset_name || asset?.name || '—');
  const symbol = h.symbol || asset?.symbol || '—';
  const displayName = isPersonalHolding ? `[${name}]` : name;
  const accName = h.account_name || account?.name || '—';
  const purchasePrice = h.purchase_price == null ? null : Number(h.purchase_price);
  const gainPct = (purchasePrice != null && purchasePrice > 0 && price != null)
    ? ((price - purchasePrice) / purchasePrice) * 100
    : null;
  const gainValue = (purchasePrice != null && purchasePrice > 0 && price != null)
    ? (price - purchasePrice) * quantity
    : null;
  return {
    asset: symbol.toLowerCase(),
    assetName: displayName.toLowerCase(),
    account: accName.toLowerCase(),
    provider: (provider ? provider.name : '').toLowerCase(),
    quantity,
    purchase_price: purchasePrice,
    market_value: price * quantity,
    gain_pct: gainPct,
    gain_value: gainValue
  };
}

// Sort holdings per the current holdingsSort state. When sorting by account, the
// secondary key is always asset ascending (regardless of the account direction).
function sortHoldings(holdings) {
  if (!holdingsSort) return holdings;
  const { field, dir } = holdingsSort;
  const rows = holdings.map(h => ({ h, r: holdingSortRow(h) }));
  rows.sort((a, b) => {
    if (field === 'account') {
      const byAccount = a.r.account.localeCompare(b.r.account) || a.r.provider.localeCompare(b.r.provider);
      if (byAccount !== 0) return byAccount * dir;
      return a.r.asset.localeCompare(b.r.asset) || a.r.assetName.localeCompare(b.r.assetName);
    }
    if (field === 'asset') {
      return (a.r.asset.localeCompare(b.r.asset) || a.r.assetName.localeCompare(b.r.assetName)) * dir;
    }
    const av = a.r[field];
    const bv = b.r[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * dir;
  });
  return rows.map(x => x.h);
}

// Toggle the sort for a column header and re-render the holdings table.
function setHoldingsSort(field) {
  if (holdingsSort && holdingsSort.field === field) {
    holdingsSort = { field, dir: holdingsSort.dir === 1 ? -1 : 1 };
  } else {
    holdingsSort = { field, dir: 1 };
  }
  renderHoldings();
}

// Update the sort indicator (▲/▼) on the active column header.
function renderHoldingsSortIndicators() {
  const table = $('#holdingsTable')?.closest('table');
  if (!table) return;
  table.querySelectorAll('thead th.sortable').forEach(th => {
    const field = th.dataset.sort;
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.remove();
    if (holdingsSort && holdingsSort.field === field) {
      const span = document.createElement('span');
      span.className = 'sort-arrow';
      span.textContent = holdingsSort.dir === 1 ? ' ▲' : ' ▼';
      th.appendChild(span);
    }
  });
}

function renderHoldings() {
  if (!$('#holdingsTable')) return;

  let holdings = state.holdings;
  let filterLabel = null;

  if (portfolioFilter) {
    if (portfolioFilter.source === 'asset') {
      const val = portfolioFilter.value;
      holdings = state.holdings.filter(h => {
        const asset = findAsset(h.asset_id, h.is_personal);
        const symbol = h.symbol || asset?.symbol || asset?.name || 'Unknown';
        if (val === 'Others') return portfolioAssetOthers.includes(symbol);
        return symbol === val;
      });
      filterLabel = `Asset: ${val}`;
    } else if (portfolioFilter.source === 'type') {
      const val = portfolioFilter.value;
      holdings = state.holdings.filter(h => {
        const asset = findAsset(h.asset_id, h.is_personal);
        if (!asset) return false;
        const type = asset.type || 'Other';
        if (val === 'Others') return portfolioTypeOthers.includes(type);
        return type === val;
      });
      filterLabel = `Type: ${val}`;
    }
  }

  holdings = sortHoldings(holdings);
  renderHoldingsSortIndicators();

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
    const asset = findAsset(h.asset_id, h.is_personal);
    const account = state.accounts.find(a => a.id === h.account_id);
    const provider = account ? state.providers.find(p => p.id === account.provider_id) : null;
    const price = asset ? Number(asset.price || 0) : Number(h.price || 0);
    const value = price * Number(h.quantity || 0);
    const currency = h.coin || asset?.coin || 'USD';
    const symbol = h.symbol || asset?.symbol || '—';
    const isPersonalHolding = asset?.is_personal === 1 || h.is_personal === 1;
    const name = (h.asset_name || asset?.name || '—');
    const displayName = isPersonalHolding ? `[${name}]` : name;
    const accName = h.account_name || account?.name || '—';

    return `<tr>
      <td><strong>${esc(symbol)}</strong> — ${esc(displayName)}</td>
      <td>${esc(accName)} <span style="color:var(--muted);font-size:11px;">(${esc(provider ? provider.name : '')})</span></td>
      <td>${h.quantity}</td>
      <td>${h.purchase_price == null ? '—' : formatCurrency(h.purchase_price, currency)}</td>
      <td>${formatCurrency(value, currency)}</td>
      <td>${gainLoss({ price, purchase_price: h.purchase_price })}</td>
      <td>${gainLossValue({ price, purchase_price: h.purchase_price, quantity: h.quantity })}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn-sm action-icon-btn" data-edit-holding="${h.id}" title="Edit">✏️</button>
          <button class="btn-sm action-icon-btn danger" data-delete-holding="${h.id}" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('') : emptyRow(8, 'No holdings yet. Add assets to your asset accounts.');
}

function openAccountDetailsModal(accountId) {
  const acc = state.accounts.find(a => a.id === accountId);
  if (!acc) return;
  const currency = 'EUR';
  $('#accountDetailsTitle').textContent = `Details: ${acc.name}`;

  // Summary
  const summary = $('#accountDetailsSummary');
  if (summary) {
    const val = accountValue(acc, true);
    const holdingCount = state.holdings.filter(h => h.account_id === acc.id).length;
    summary.innerHTML = `
      <div><div class="dlabel">Holdings</div><div class="dvalue">${holdingCount} assets</div></div>
      <div><div class="dlabel">Value</div><div class="dvalue ${val < 0 ? 'neg' : 'pos'}">${formatCurrency(val, currency)}</div></div>
    `;
  }

  // Per-asset market value, converted to EUR, sorted descending
  const assetMap = {};
  state.holdings.filter(h => h.account_id === acc.id).forEach(h => {
    const asset = findAsset(h.asset_id, h.is_personal);
    if (!asset) return;
    const val = Number(asset.price || 0) * Number(h.quantity || 0);
    const converted = convertToEUR(val, asset.coin || 'USD');
    const isPersonalHolding = asset.is_personal === 1 || h.is_personal === 1;
    const label = (h.symbol || asset.symbol || asset.name || 'Unknown');
    const displayLabel = isPersonalHolding ? `[${label}]` : label;
    assetMap[displayLabel] = (assetMap[displayLabel] || 0) + converted;
  });

  const assetTop = topNWithOthers(assetMap, 9);
  const labels = assetTop.labels;
  const data = assetTop.data;
  const dataAbs = data.map(v => Math.abs(v));
  const colors = CHART_COLORS;

  // Donut chart (top 9 + Others, ordered descending)
  if (typeof Chart !== 'undefined') {
    if (accountDetailsChartInstance) accountDetailsChartInstance.destroy();
    const ctx = document.getElementById('accountDetailsChart')?.getContext('2d');
    if (ctx) {
      accountDetailsChartInstance = new Chart(ctx, {
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

  // Legend (reuse renderLegend which handles negatives + absolute values)
  renderLegend('accountDetailsLegend', labels, data, colors);

  // "Others" table: individual ticker, value and % for assets grouped into Others
  const othersWrap = $('#accountDetailsOthersWrap');
  const othersTable = $('#accountDetailsOthersTable');
  if (othersWrap && othersTable) {
    const totalAbs = Object.values(assetMap).reduce((sum, v) => sum + Math.abs(v), 0);
    const others = assetTop.others || [];
    if (others.length) {
      othersTable.innerHTML = others.map(label => {
        const value = assetMap[label] || 0;
        const pct = totalAbs ? ((Math.abs(value) / totalAbs) * 100).toFixed(1) : '0.0';
        return `<tr>
          <td><strong>${esc(label)}</strong></td>
          <td>${formatCurrency(value, currency)}</td>
          <td>${pct}%</td>
        </tr>`;
      }).join('');
      othersWrap.style.display = '';
    } else {
      othersTable.innerHTML = '';
      othersWrap.style.display = 'none';
    }
  }

  openModal('accountDetailsModalOverlay');
}

function openProviderDetailsModal(providerId) {
  const provider = state.providers.find(p => p.id === providerId);
  if (!provider) return;
  const currency = 'EUR';
  const accounts = state.accounts.filter(a => a.provider_id === providerId);
  $('#providerDetailsTitle').textContent = `Details: ${provider.name}`;

  // Summary
  const summary = $('#providerDetailsSummary');
  if (summary) {
    const total = providerValue(provider);
    summary.innerHTML = `
      <div><div class="dlabel">Accounts</div><div class="dvalue">${accounts.length}</div></div>
      <div><div class="dlabel">Value</div><div class="dvalue ${total < 0 ? 'neg' : 'pos'}">${formatCurrency(total, currency)}</div></div>
    `;
  }

  // Per-account value, converted to EUR, sorted descending
  const accountMap = {};
  accounts.forEach(acc => {
    const val = accountValue(acc, true);
    const label = `${acc.name} (${acc.provider_name || providerName(acc.provider_id)})`;
    accountMap[label] = (accountMap[label] || 0) + val;
  });

  const accountTop = topNWithOthers(accountMap, 9);
  const labels = accountTop.labels;
  const data = accountTop.data;
  const dataAbs = data.map(v => Math.abs(v));
  const colors = CHART_COLORS;

  // Donut chart (top 9 + Others, ordered descending)
  if (typeof Chart !== 'undefined') {
    if (providerDetailsChartInstance) providerDetailsChartInstance.destroy();
    const ctx = document.getElementById('providerDetailsChart')?.getContext('2d');
    if (ctx) {
      providerDetailsChartInstance = new Chart(ctx, {
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

  // Legend (reuse renderLegend which handles negatives + absolute values)
  renderLegend('providerDetailsLegend', labels, data, colors);

  // "Others" table: individual account, value and % for accounts grouped into Others
  const othersWrap = $('#providerDetailsOthersWrap');
  const othersTable = $('#providerDetailsOthersTable');
  if (othersWrap && othersTable) {
    const totalAbs = Object.values(accountMap).reduce((sum, v) => sum + Math.abs(v), 0);
    const others = accountTop.others || [];
    if (others.length) {
      othersTable.innerHTML = others.map(label => {
        const value = accountMap[label] || 0;
        const pct = totalAbs ? ((Math.abs(value) / totalAbs) * 100).toFixed(1) : '0.0';
        return `<tr>
          <td><strong>${esc(label)}</strong></td>
          <td>${formatCurrency(value, currency)}</td>
          <td>${pct}%</td>
        </tr>`;
      }).join('');
      othersWrap.style.display = '';
    } else {
      othersTable.innerHTML = '';
      othersWrap.style.display = 'none';
    }
  }

  openModal('providerDetailsModalOverlay');
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
  const activeValue = activeIdx < subs.length ? formatCurrency(subs[activeIdx], currency) : null;
  const activeLabel = activePct >= 100 ? '' : `${activeName}: ${activePct.toFixed(1)}%${activeValue ? ` (${activeValue})` : ''}`;

  return `
    <div class="goal-progress">
      <div class="goal-progress-bar goal-progress-bar-seg">${segments}</div>
      <span class="goal-progress-label">${label}</span>
    </div>
    ${activeLabel ? `<div class="goal-sub-label">${esc(activeLabel)}</div>` : ''}`;
}

function renderGoals() {
  if (!$('#goalsList')) return;
  const sorted = state.goals.slice().sort((a, b) => (a.order_by ?? 0) - (b.order_by ?? 0) || a.id - b.id);
  $('#goalsList').innerHTML = sorted.length ? sorted.map((g, idx) => {
    const current = goalCurrentValue(g);
    const target = Number(g.value || 0);
    const diff = current - target;
    const linked = state.accounts.filter(a => (g.account_ids || []).includes(a.id));
    const linkedNames = linked.map(a => `${esc(a.name)} (${esc(a.provider_name || providerName(a.provider_id))})`).join(', ') || 'No linked accounts';
    const progressHTML = goalProgressHTML(g, current, target, g.coin || 'USD');
    const isFirst = idx === 0;
    const isLast = idx === sorted.length - 1;
    return `
      <div class="goal-card">
        <div class="goal-card-head">
          <span class="goal-name">🎯 ${esc(g.goal_name)} <span class="tag goal">${esc(g.coin || 'USD')}</span></span>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span class="goal-order-btns">
              <button class="btn-sm goal-order-btn" data-goal-up="${g.id}" title="Move up" ${isFirst ? 'disabled' : ''}>↑</button>
              <button class="btn-sm goal-order-btn" data-goal-down="${g.id}" title="Move down" ${isLast ? 'disabled' : ''}>↓</button>
            </span>
            <button class="btn-sm action-icon-btn" data-goal-details="${g.id}" title="Details">ℹ️</button>
            ${timeTravelList.length > 0 ? `<button class="btn-sm action-icon-btn" data-goal-history="${g.id}" title="History">📈</button>` : ''}
            <button class="btn-sm action-icon-btn" data-simulate-goal="${g.id}" title="Simulate">⚡</button>
            <button class="btn-sm action-icon-btn" data-duplicate-goal="${g.id}" title="Duplicate">📄</button>
            <button class="btn-sm action-icon-btn" data-edit-goal="${g.id}" title="Edit">✏️</button>
            <button class="btn-sm action-icon-btn danger" data-delete-goal="${g.id}" title="Delete">🗑️</button>
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
  const existingAssetKeys = new Set(
    state.holdings.filter(h => h.account_id === accountId).map(h => `${h.asset_id}|${h.is_personal === 1 ? 1 : 0}`)
  );
  if (keepAssetId != null) existingAssetKeys.delete(String(keepAssetId));
  let assets = typeFilter ? state.assets.filter(a => a.type === typeFilter) : state.assets;
  assets = assets.filter(a => !existingAssetKeys.has(`${a.id}|${a.is_personal === 1 ? 1 : 0}`));
  select.innerHTML = assets.length ? assets.map(a => `<option value="${a.id}|${a.is_personal === 1 ? 1 : 0}">${esc(a.symbol || a.name)} — ${a.is_personal === 1 ? `[${esc(a.name)}]` : esc(a.name)}</option>`).join('') : '<option value="">No assets available</option>';
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
  for (let i = 1; i <= 5; i++) {
    const fromSel = $('#currencyTestFrom' + i);
    if (fromSel) fromSel.innerHTML = '<option value="">Select currency...</option>' + currencyOptions;
  }
  if ($('#currencyTestTo')) {
    $('#currencyTestTo').innerHTML = '<option value="">Select currency...</option>' + currencyOptions;
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
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  // Re-render the currency pagination once the page is visible, so it adapts to the
  // real available width (it can't be measured correctly while the page is hidden).
  if (page === 'currency') renderCurrency();
  if (page === 'simulation') renderSimulation();
  applyBlur();
}

// Toggle the mobile nav dropdown (hamburger menu).
function toggleNavDropdown() {
  const sidebar = document.querySelector('.sidebar');
  const toggle = $('#navToggle');
  if (!sidebar) return;
  const open = sidebar.classList.toggle('open');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// Close the mobile nav dropdown (e.g. after selecting a page).
function closeNavDropdown() {
  const sidebar = document.querySelector('.sidebar');
  const toggle = $('#navToggle');
  if (!sidebar) return;
  sidebar.classList.remove('open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

// ---- Blur (privacy) feature ----
// When enabled, any number that is not a percentage is blurred to hide monetary
// values. The Assets page is excluded (it shows prices, not portfolio value).

// Matches a currency amount: a currency symbol followed by a number (e.g. "€23,733.29", "$1,234.56").
const BLUR_CURRENCY_RE = /([€$£¥₹₽₩₺₴₦฿₫₪₱₲₡₵₸₼₾₿¤])\s*(\d[\d.,]*)/g;

function blurActive() {
  return blurMode && currentPage !== 'assets';
}

function applyBlur() {
  const active = blurActive();
  document.body.classList.toggle('blur-mode', active);
  const btn = $('#blurButton');
  if (btn) btn.classList.toggle('active', blurMode);
  if (active) {
    blurNumbers(document.body);
  } else {
    unblurNumbers(document.body);
  }
}

function toggleBlur() {
  blurMode = !blurMode;
  applyBlur();
}

function blurNumbers(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && node.parentElement.closest('.blur-num')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const text = node.nodeValue;
    if (!BLUR_CURRENCY_RE.test(text)) return;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    BLUR_CURRENCY_RE.lastIndex = 0;
    while ((match = BLUR_CURRENCY_RE.exec(text)) !== null) {
      if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      // Keep the currency symbol (and any whitespace) readable, blur only the amount.
      const symbolPart = match[0].slice(0, match[0].length - match[2].length);
      frag.appendChild(document.createTextNode(symbolPart));
      const span = document.createElement('span');
      span.className = 'blur-num';
      span.dataset.orig = match[2];
      span.textContent = '888';
      frag.appendChild(span);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    node.parentNode.replaceChild(frag, node);
  });
}

function unblurNumbers(root) {
  root.querySelectorAll('.blur-num').forEach(span => {
    const orig = span.dataset.orig || span.textContent;
    const text = document.createTextNode(orig);
    span.parentNode.replaceChild(text, span);
  });
  // Merge adjacent text nodes so the currency symbol and amount are back in a
  // single node (otherwise re-blurring can't see the symbol next to the number).
  root.normalize();
}

let blurObserver = null;
function initBlurObserver() {
  if (blurObserver) return;
  blurObserver = new MutationObserver(() => {
    if (blurActive()) blurNumbers(document.body);
  });
  blurObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function showApp() {
  $('#loginScreen').style.display = 'none';
  $('#app').style.display = 'flex';
  if ($('#guestBanner')) $('#guestBanner').style.display = state.guest ? 'block' : 'none';
  renderProfile();
}

// Populate the Profile page with the current user's details.
function renderProfile() {
  const username = $('#profileUsername');
  const role = $('#profileRole');
  if (username) username.textContent = state.guest ? 'Guest' : (state.user?.username || '—');
  if (role) role.textContent = state.guest ? 'guest' : (state.user?.role || 'user');
}

// Reset the logged-in user's password from the Profile page.
async function resetProfilePassword() {
  const newPass = $('#profileNewPassword')?.value || '';
  const confirmPass = $('#profileConfirmPassword')?.value || '';
  if (newPass.length < 8 || newPass.length > 50) { toast('Password must be 8–50 characters.'); return; }
  if (newPass !== confirmPass) { toast('Passwords do not match.'); return; }
  const btn = $('#profileResetPasswordBtn');
  if (btn) btn.disabled = true;
  try {
    if (state.guest) {
      toast('Password reset simulated.');
    } else {
      await request('/me/password', { method: 'POST', body: JSON.stringify({ password: newPass }) });
      toast('Password reset successfully.');
    }
    if ($('#profileNewPassword')) $('#profileNewPassword').value = '';
    if ($('#profileConfirmPassword')) $('#profileConfirmPassword').value = '';
  } catch (error) {
    toast(error.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Render the Currency page: USD→EUR ratio card + searchable list of all currencies.
// USD (rate 1.0) and EUR are filtered out of the list.
function renderCurrency() {
  const usdEurEl = $('#currencyUsdEur');
  const eurUsdEl = $('#currencyEurUsd');
  const usd = state.currencies.find(c => c.coin === 'USD');
  const eur = state.currencies.find(c => c.coin === 'EUR');
  if (usd && eur) {
    const ratio = eur.value / usd.value;
    if (usdEurEl) usdEurEl.textContent = `1 USD = ${ratio.toFixed(4)} EUR`;
    if (eurUsdEl) eurUsdEl.textContent = `1 EUR = ${(1 / ratio).toFixed(4)} USD`;
  } else {
    if (usdEurEl) usdEurEl.textContent = '—';
    if (eurUsdEl) eurUsdEl.textContent = '—';
  }
  const search = ($('#currencySearch')?.value || '').trim().toUpperCase();
  const table = $('#currencyTable');
  if (!table) return;
  const eurRate = eur ? eur.value : 1;
  // Filter the full dataset (search applies to all currencies, not just the current page).
  const filtered = state.currencies
    .filter(c => c.coin !== 'USD' && c.coin !== 'EUR')
    .filter(c => !search || c.coin.includes(search));
  const totalPages = Math.max(1, Math.ceil(filtered.length / CURRENCIES_PER_PAGE));
  if (currencyPage >= totalPages) currencyPage = totalPages - 1;
  if (currencyPage < 0) currencyPage = 0;
  const start = currencyPage * CURRENCIES_PER_PAGE;
  const pageCurrencies = filtered.slice(start, start + CURRENCIES_PER_PAGE);
  const rows = pageCurrencies.map(c => `
      <tr>
        <td>${esc(c.coin)}</td>
        <td>${Number(c.value).toFixed(4)}</td>
        <td>${Number(c.value / eurRate).toFixed(4)}</td>
      </tr>
    `).join('');
  table.innerHTML = rows || '<tr><td colspan="3" style="text-align:center;color:var(--muted);">No currencies found.</td></tr>';
  renderCurrencyPagination(totalPages, filtered.length);
}

// Build the list of page numbers to show in the windowed pagination, collapsing
// far-away pages into an ellipsis (null). Always keeps the first and last page
// visible. Returns an array of 0-based page indices, with null marking a gap.
function paginationPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set([0, total - 1, current - 1, current, current + 1]);
  const sorted = [...pages].filter(p => p >= 0 && p < total).sort((a, b) => a - b);
  const result = [];
  let prev = null;
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) result.push(null);
    result.push(p);
    prev = p;
  }
  return result;
}

// Build the pagination HTML for a given mode: 'all' (every page number),
// 'windowed' (current page + neighbors + ellipsis), or 'arrows' (just ← / →).
function buildPaginationHTML(mode, totalPages) {
  let items;
  if (mode === 'arrows') {
    items = [];
  } else if (mode === 'all') {
    items = Array.from({ length: totalPages }, (_, i) => i);
  } else {
    items = paginationPages(currencyPage, totalPages);
  }
  const pageButtons = items.map(p =>
    p === null
      ? '<span class="currency-page-ellipsis">…</span>'
      : `<button class="btn-sm currency-page-btn${p === currencyPage ? ' active' : ''}" type="button" data-currency-page="${p}">${p + 1}</button>`
  ).join('');
  return `
    <button class="btn-sm" type="button" id="currencyPagePrev" ${currencyPage === 0 ? 'disabled' : ''}>←</button>
    ${pageButtons}
    <button class="btn-sm" type="button" id="currencyPageNext" ${currencyPage >= totalPages - 1 ? 'disabled' : ''}>→</button>
  `;
}

// Wire up the prev/next and page-number click handlers for the currency pagination.
function wireCurrencyPaginationEvents() {
  $('#currencyPagePrev')?.addEventListener('click', () => { currencyPage--; renderCurrency(); });
  $('#currencyPageNext')?.addEventListener('click', () => { currencyPage++; renderCurrency(); });
  document.querySelectorAll('#currencyPagination .currency-page-btn').forEach(btn => {
    btn.addEventListener('click', () => { currencyPage = Number(btn.dataset.currencyPage); renderCurrency(); });
  });
}

// Measure the total rendered width of the pagination's children (buttons + ellipsis)
// including the flex gap. This is more reliable than scrollWidth for a centered flex row.
function paginationContentWidth(pagination) {
  const children = [...pagination.children];
  if (!children.length) return 0;
  let width = 0;
  for (let i = 0; i < children.length; i++) {
    width += children[i].offsetWidth;
    if (i < children.length - 1) width += 12; // .snapshot-pagination gap
  }
  return width;
}

// Render the pagination controls (prev / page number buttons / next) for the currency table.
// Adapts to the available width: renders the largest mode that fits on one line — all page
// numbers when they fit, a windowed view with an ellipsis when they don't, and arrows-only
// on very narrow screens. The actual rendered width is measured so it matches what the user sees.
function renderCurrencyPagination(totalPages, totalCount) {
  const pagination = $('#currencyPagination');
  if (!pagination) return;
  if (totalPages <= 1) {
    pagination.style.display = 'none';
    pagination.innerHTML = '';
    return;
  }
  pagination.style.display = 'flex';
  const modes = ['all', 'windowed', 'arrows'];
  for (const mode of modes) {
    pagination.innerHTML = buildPaginationHTML(mode, totalPages);
    if (paginationContentWidth(pagination) <= pagination.clientWidth) {
      wireCurrencyPaginationEvents();
      return;
    }
  }
  // arrows always fits (just two buttons); wire events for the last rendered mode.
  wireCurrencyPaginationEvents();
}

// Switch the active tab on the admin Tools page (import / export / currency-test).
function switchToolsTab(tab) {
  document.querySelectorAll('.tools-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.toolsTab === tab);
  });
  document.querySelectorAll('.tools-panel').forEach(panel => {
    panel.style.display = panel.id === `tools-panel-${tab}` ? '' : 'none';
  });
}

// Render the Currency Test page (admin). The coin selects are populated by
// fillSelects(); this just resets the results table.
function renderCurrencyTest() {
  const body = $('#currencyTestResultsBody');
  if (body) body.innerHTML = '';
  const total = $('#currencyTestTotal');
  if (total) total.textContent = '—';
}

// Run up to 5 conversions using the Currency Test page inputs, showing each
// individual result and the sum of all converted values.
function runCurrencyTest() {
  const toCoin = $('#currencyTestTo')?.value;
  const body = $('#currencyTestResultsBody');
  const totalEl = $('#currencyTestTotal');
  if (!body || !totalEl) return;
  if (!toCoin) {
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--danger);">Pick a "To coin" first.</td></tr>';
    totalEl.textContent = '—';
    return;
  }

  const rows = [];
  let sum = 0;
  for (let i = 1; i <= 5; i++) {
    const amount = Number($('#currencyTestAmount' + i)?.value);
    const fromCoin = $('#currencyTestFrom' + i)?.value;
    if (!amount || !fromCoin) {
      rows.push(`<tr><td>${i}</td><td colspan="3" style="color:var(--muted);">—</td></tr>`);
      continue;
    }
    const converted = convertToCurrency(amount, fromCoin, toCoin);
    sum += converted;
    rows.push(`<tr>
      <td>${i}</td>
      <td>${formatCurrency(amount, fromCoin)}</td>
      <td>${esc(fromCoin)}</td>
      <td>${formatCurrency(converted, toCoin)}</td>
    </tr>`);
  }
  body.innerHTML = rows.join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted);">Enter at least one amount and from coin.</td></tr>';
  totalEl.textContent = formatCurrency(sum, toCoin);
}

function toggleAccountFields() {
  const type = $('#accountTypeSelect')?.value;
  const balField = $('#balanceField');
  const rateField = $('#rateField');
  const finishDateField = $('#finishDateField');
  if (!balField || !rateField || !finishDateField) return;
  if (type === 'asset_account') {
    balField.style.display = 'none';
    rateField.style.display = 'none';
    finishDateField.style.display = 'none';
  } else if (type === 'loan' || type === 'interest_account') {
    balField.style.display = 'block';
    rateField.style.display = 'block';
    finishDateField.style.display = type === 'loan' ? 'block' : 'none';
  } else {
    balField.style.display = 'block';
    rateField.style.display = 'none';
    finishDateField.style.display = 'none';
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
    await loadData({ refreshSnapshots: true });
    toast(`Signed in as ${state.user.username}`);
    maybeShowWelcomeModal();

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

function openAssetModal(assetId = null, isPersonal = null) {
  const form = $('#assetForm');
  if (!form) return;
  form.reset();
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  if (assetId) {
    const a = findAsset(assetId, isPersonal);
    if (!a) return;
    isPersonal = a.is_personal === 1;
    $('#assetModalTitle').textContent = isPersonal ? 'Edit Personal Asset' : 'Edit Asset';
    $('#assetEditId').value = a.id;
    $('#assetName').value = a.name;
    $('#assetSymbol').value = a.symbol || '';
    $('#assetType').value = a.type;
    $('#assetCoin').value = a.coin || 'USD';
    $('#assetPrice').value = a.price ?? '';
    $('#assetYield').value = a.dividend_yield ?? '';
    $('#assetMonths').value = (a.payment_months || []).join(',');
  } else {
    // When creating a new asset, default to the active tab's type.
    if (isPersonal === null) isPersonal = activeAssetTab === 'personal';
    $('#assetModalTitle').textContent = isPersonal ? 'New Personal Asset' : 'New Asset';
    $('#assetEditId').value = '';
    $('#assetCoin').value = 'USD';
  }
  form.dataset.isPersonal = isPersonal ? '1' : '0';
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
  // Track portfolio impact (USD) of the updated assets' holdings.
  let portfolioBefore = 0;
  let portfolioAfter = 0;

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
        const oldPrice = a.price;
        const changePct = (oldPrice != null && oldPrice > 0) ? ((price - oldPrice) / oldPrice) * 100 : null;
        const changeStr = changePct == null ? 'n/a' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;
        appendBulkUpdateLog(`[OK] ${a.symbol || a.name}: ${price} (${changeStr})`);
        // Accumulate portfolio impact from this asset's holdings (USD).
        const qty = state.holdings.filter(h => h.asset_id === a.id).reduce((sum, h) => sum + Number(h.quantity || 0), 0);
        portfolioBefore += qty * (oldPrice != null ? oldPrice : 0);
        portfolioAfter += qty * Number(price);
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

  const impactUsd = portfolioAfter - portfolioBefore;
  const impactPct = portfolioBefore > 0 ? (impactUsd / portfolioBefore) * 100 : null;
  const impactStr = impactPct == null ? 'n/a' : `${impactPct >= 0 ? '+' : ''}${impactPct.toFixed(2)}%`;
  appendBulkUpdateLog(`Done. Updated ${updated}, failed ${failed}.`);
  appendBulkUpdateLog(`Portfolio impact: ${impactUsd >= 0 ? '+' : ''}${formatCurrency(impactUsd, 'USD')} (${impactStr})`);
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
    $('#accountFinishDateInput').value = acc.finish_date ? finishDateToInput(acc.finish_date) : '';
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

function openHoldingModal(holdingId = null) {
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
    const asset = findAsset(h.asset_id, h.is_personal);
    if ($('#holdingAssetTypeFilter')) $('#holdingAssetTypeFilter').value = asset?.type || '';
    fillSelects();
    $('#holdingAccount').value = h.account_id;
    fillHoldingAssetSelect(`${h.asset_id}|${h.is_personal === 1 ? 1 : 0}`);
    $('#holdingModalTitle').textContent = 'Edit Holding';
    $('#holdingEditId').value = h.id;
    $('#holdingAsset').value = `${h.asset_id}|${h.is_personal === 1 ? 1 : 0}`;
    $('#holdingQty').value = h.quantity;
    $('#holdingPurchasePrice').value = h.purchase_price ?? '';
  } else {
    if ($('#holdingAssetTypeFilter')) $('#holdingAssetTypeFilter').value = '';
    fillSelects();
    $('#holdingModalTitle').textContent = 'Add Holding';
    $('#holdingEditId').value = '';
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

/* ================= LOAN SIMULATOR ================= */

let loanSimChartInstance = null;

// Convert a stored finish_date (YYYYMMDD) to a date-input value (YYYY-MM-DD).
function finishDateToInput(dbDate) {
  const s = String(dbDate || '').replace(/\D/g, '');
  if (s.length !== 8) return '';
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// Convert a date-input value (YYYY-MM-DD) to the stored format (YYYYMMDD).
function finishDateToDb(inputDate) {
  const s = String(inputDate || '').replace(/\D/g, '');
  return s.length === 8 ? s : '';
}

function openLoanSimModal(accountId) {
  const acc = state.accounts.find(a => a.id === accountId);
  if (!acc) return;
  if (acc.balance == null || !acc.coin || acc.interest_rate == null || !acc.finish_date) return;
  const form = $('#loanSimForm');
  if (!form) return;
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  $('#loanSimId').value = acc.id;
  $('#loanSimTitle').textContent = `Loan Simulator: ${acc.name}`;
  $('#loanSimCapital').value = Math.abs(Number(acc.balance || 0)).toFixed(2);
  $('#loanSimRate').value = Number(acc.interest_rate || 0).toFixed(2);
  $('#loanSimEndDate').value = finishDateToInput(acc.finish_date);
  $('#loanSimAmount').value = '';
  $('#loanSimMonthlyAmount').value = '';
  $('#loanSimResult').innerHTML = '';
  openModal('loanSimModalOverlay');
  runLoanSimulation();
}

// Monthly payment for a loan: { interest, principal, total }.
function loanPayment(capital, annualRate, months) {
  const rate = annualRate / 100 / 12;
  const total = rate === 0 ? capital / months : capital * rate / (1 - Math.pow(1 + rate, -months));
  return { interest: capital * rate, principal: total - capital * rate, total };
}

// Number of months needed to pay off `capital` with a fixed monthly payment.
function loanRemainingTerm(capital, monthlyPayment, annualRate) {
  const rate = annualRate / 100 / 12;
  return rate === 0 ? capital / monthlyPayment : -Math.log(1 - (rate * capital / monthlyPayment)) / Math.log(1 + rate);
}

// Whole months between today and the given end date (YYYY-MM-DD).
function loanMonthsUntilDate(dateText) {
  const today = new Date();
  const end = new Date(dateText + 'T12:00:00');
  let months = (end.getFullYear() - today.getFullYear()) * 12 + end.getMonth() - today.getMonth();
  if (end.getDate() < today.getDate()) months -= 1;
  return months;
}

// Month-by-month evolution calculator for "keep term" scenario with extra monthly payments.
function gerarEvolucaoComAmortizacaoMensal(capitalInicial, taxaAnual, amortizacaoInicial, amortizacaoMensal, mesesTotais) {
  const taxaMensal = taxaAnual / 100 / 12;
  const linhas = [];
  let saldo = Math.max(0, capitalInicial - amortizacaoInicial);

  const dataRef = new Date();
  let anoRef = dataRef.getFullYear();
  let mesRef = dataRef.getMonth();

  const limiteMeses = 1200;
  let contador = 0;

  while (saldo > 0.005 && contador < limiteMeses && contador < mesesTotais) {
    contador += 1;
    mesRef += 1;
    if (mesRef > 11) { mesRef = 0; anoRef += 1; }

    const mesesRestantes = mesesTotais - contador + 1;
    const saldoAnterior = saldo;
    const juros = saldoAnterior * taxaMensal;
    let prestacaoMesBase = loanPayment(saldoAnterior, taxaAnual, mesesRestantes).total;
    let amortizacaoPrestacao = prestacaoMesBase - juros;
    let amortizacaoExtra = amortizacaoMensal > 0 ? amortizacaoMensal : 0;

    if (amortizacaoPrestacao + amortizacaoExtra >= saldoAnterior) {
      amortizacaoPrestacao = Math.min(amortizacaoPrestacao, saldoAnterior);
      amortizacaoExtra = Math.max(0, saldoAnterior - amortizacaoPrestacao);
      prestacaoMesBase = juros + amortizacaoPrestacao;
      saldo = 0;
    } else {
      saldo = saldoAnterior - amortizacaoPrestacao - amortizacaoExtra;
    }

    linhas.push({
      ano: anoRef,
      mes: mesRef + 1,
      saldo: saldo,
      prestacaoTotal: prestacaoMesBase + amortizacaoExtra,
      prestacaoBase: prestacaoMesBase,
      juros: juros,
      amortizacao: amortizacaoPrestacao + amortizacaoExtra
    });
  }

  return linhas;
}

function runLoanSimulation() {
  const form = $('#loanSimForm');
  if (!form) return;
  const err = form.querySelector('.form-error'); if (err) err.textContent = '';
  const result = $('#loanSimResult');
  const accountId = Number($('#loanSimId').value);
  const acc = state.accounts.find(a => a.id === accountId);
  const coin = acc ? (acc.coin || 'EUR') : 'EUR';

  const capital = Number($('#loanSimCapital').value);
  const rate = Number($('#loanSimRate').value);
  const endDate = $('#loanSimEndDate').value;
  const amortization = Number($('#loanSimAmount').value || 0);
  const monthlyAmortization = Number($('#loanSimMonthlyAmount').value || 0);
  const months = loanMonthsUntilDate(endDate);

  if (!(capital > 0) || rate < 0 || !endDate || !(months > 0) || amortization < 0 || amortization > capital || monthlyAmortization < 0) {
    if (err) err.textContent = 'Check the values and choose a future date for the last payment.';
    result.innerHTML = '';
    return;
  }

  const current = loanPayment(capital, rate, months);
  const newCapital = capital - amortization;
  const keepTerm = loanPayment(newCapital, rate, months);
  const newTerm = loanRemainingTerm(newCapital, current.total, rate);
  const monthlyRate = rate / 100 / 12;
  const interestKeepPayment = newCapital * monthlyRate;
  const principalKeepPayment = current.total - interestKeepPayment;
  const interestCurrent = current.total * months - capital;
  const interestKeepTerm = keepTerm.total * months - newCapital;
  const interestTotalKeepPayment = current.total * newTerm - newCapital;
  const totalCurrent = current.total * months;
  const totalKeepTerm = amortization + keepTerm.total * months;
  const totalKeepPayment = amortization + current.total * newTerm;

  const currentInterestPct = current.total > 0 ? Math.round((current.interest / current.total) * 100) : 0;
  const currentPrincipalPct = current.total > 0 ? Math.round((current.principal / current.total) * 100) : 0;

  const keepTermInterestPct = keepTerm.total > 0 ? Math.round((keepTerm.interest / keepTerm.total) * 100) : 0;
  const keepTermPrincipalPct = keepTerm.total > 0 ? Math.round((keepTerm.principal / keepTerm.total) * 100) : 0;

  const keepPaymentInterestPct = current.total > 0 ? Math.round((interestKeepPayment / current.total) * 100) : 0;
  const keepPaymentPrincipalPct = current.total > 0 ? Math.round((principalKeepPayment / current.total) * 100) : 0;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const evolutionLines = gerarEvolucaoComAmortizacaoMensal(capital, rate, amortization, monthlyAmortization, months);

  const lastEvolutionLine = evolutionLines[evolutionLines.length - 1];
  const evolutionPayoffDateStr = lastEvolutionLine ? `${monthNames[lastEvolutionLine.mes - 1]} ${lastEvolutionLine.ano}` : '';
  const evolutionMonthsCount = evolutionLines.length;
  const evolutionMonthsSaved = months - evolutionMonthsCount;
  const evolutionTotalInterest = evolutionLines.reduce((sum, line) => sum + line.juros, 0);
  const evolutionInterestSaved = interestCurrent - evolutionTotalInterest;

  const newEndDateObj = new Date();
  newEndDateObj.setMonth(newEndDateObj.getMonth() + Math.round(newTerm));
  const newEndDateStr = `${monthNames[newEndDateObj.getMonth()]} ${newEndDateObj.getFullYear()}`;
  const monthsSavedStr = (months - newTerm).toFixed(1).replace(/\.0$/, '');

  let tableRowsHtml = '';
  evolutionLines.forEach(line => {
    const isPaid = line.saldo <= 0.005;
    tableRowsHtml += `
      <tr>
        <td>${line.ano}</td>
        <td>${monthNames[line.mes - 1]}</td>
        <td>${isPaid ? 'Paid' : formatCurrency(line.saldo, coin)}</td>
        <td>${formatCurrency(line.prestacaoTotal, coin)}</td>
        <td class="coluna-secundaria">${formatCurrency(line.prestacaoBase, coin)}</td>
        <td>${formatCurrency(line.juros, coin)}</td>
        <td>${formatCurrency(line.amortizacao, coin)}</td>
      </tr>`;
  });

  result.innerHTML = `
    <div class="loan-sim-grid">
      <section class="loan-sim-section">
        <h4>Current scenario</h4>
        <dl>
          <dt>Payments remaining (calculated)</dt><dd>${months} months</dd>
          <dt>Interest in next payment</dt><dd>${formatCurrency(current.interest, coin)} (${currentInterestPct}%)</dd>
          <dt>Principal amortized</dt><dd>${formatCurrency(current.principal, coin)} (${currentPrincipalPct}%)</dd>
          <dt>Monthly payment</dt><dd>${formatCurrency(current.total, coin)}</dd>
          <dt>Total payments to end</dt><dd>${formatCurrency(totalCurrent, coin)}</dd>
        </dl>
      </section>
      <section class="loan-sim-section">
        <h4>Amortize &amp; keep the term</h4>
        <dl>
          <dt>Monthly reduction</dt><dd>${formatCurrency(current.total - keepTerm.total, coin)}</dd>
          <dt>New monthly payment</dt>
          <dd>
            ${formatCurrency(keepTerm.total, coin)}
            <span class="detalhe-prestacao">${formatCurrency(keepTerm.interest, coin)} (${keepTermInterestPct}%) interest + ${formatCurrency(keepTerm.principal, coin)} (${keepTermPrincipalPct}%) amortization</span>
          </dd>
          <dt>Total interest saved</dt><dd>${formatCurrency(interestCurrent - interestKeepTerm, coin)}</dd>
          <dt>Total payments to end</dt><dd>${formatCurrency(keepTerm.total * months, coin)}</dd>
          <dt>Total incl. amortization</dt><dd>${formatCurrency(totalKeepTerm, coin)}</dd>
        </dl>
      </section>
      <section class="loan-sim-section loan-sim-highlight">
        <h4>Amortize &amp; keep the payment</h4>
        <dl>
          <dt>New estimated term</dt><dd>${newEndDateStr} (-${monthsSavedStr} months)</dd>
          <dt>New breakdown</dt><dd>${formatCurrency(interestKeepPayment, coin)} (${keepPaymentInterestPct}%) interest + ${formatCurrency(principalKeepPayment, coin)} (${keepPaymentPrincipalPct}%) amortization</dd>
          <dt>Total interest saved</dt><dd>${formatCurrency(interestCurrent - interestTotalKeepPayment, coin)}</dd>
          <dt>Total payments to end</dt><dd>${formatCurrency(current.total * newTerm, coin)}</dd>
          <dt>Total incl. amortization</dt><dd>${formatCurrency(totalKeepPayment, coin)}</dd>
        </dl>
      </section>
    </div>

    <section class="loan-sim-table-section">
      <h4>Month-by-month evolution with monthly amortization</h4>
      <p>Simulates the "keep the term" scenario: in each month, the base payment is recalculated based on that month's balance and remaining months to original end date. Thus it decreases month by month whenever there is extra monthly amortization.</p>
      
      <div class="loan-sim-summary-chips" style="display:flex; flex-wrap:wrap; gap:12px; margin:12px 0 16px 0;">
        <div style="background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:10px 14px; flex:1; min-width:140px;">
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Estimated Payoff</div>
          <div style="font-size:15px; font-weight:600; color:var(--text); margin-top:2px;">${evolutionPayoffDateStr} ${evolutionMonthsSaved > 0 ? `<span style="font-size:12px; color:var(--accent); font-weight:normal;">(-${evolutionMonthsSaved} months)</span>` : ''}</div>
        </div>
        <div style="background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:10px 14px; flex:1; min-width:140px;">
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Total Interest Paid</div>
          <div style="font-size:15px; font-weight:600; color:var(--text); margin-top:2px;">${formatCurrency(evolutionTotalInterest, coin)}</div>
        </div>
        <div style="background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:10px 14px; flex:1; min-width:140px;">
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">Total Interest Saved</div>
          <div style="font-size:15px; font-weight:600; color:var(--accent); margin-top:2px;">${formatCurrency(evolutionInterestSaved > 0 ? evolutionInterestSaved : 0, coin)}</div>
        </div>
      </div>
      <div class="loan-sim-table-scroll">
        <table class="loan-sim-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Month</th>
              <th>Remaining balance</th>
              <th>Total payment</th>
              <th>Base payment</th>
              <th>Interest</th>
              <th>Amortization</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml || '<tr><td colspan="7" style="text-align:center;">Loan fully paid off</td></tr>'}
          </tbody>
        </table>
      </div>
      <p class="loan-sim-note">The simulation is an approximate representation and does not include insurance, fees, or future rate changes.</p>
    </section>
  `;
}

/* ================= EVENT LISTENERS ================= */

document.addEventListener('DOMContentLoaded', async () => {
  $('#loginForm')?.addEventListener('submit', signIn);
  $('#guestButton')?.addEventListener('click', async () => { state.guest = true; state.user = null; showApp(); await loadData(); toast('Signed in as Guest'); maybeShowWelcomeModal(); });
  $('#logoutButton')?.addEventListener('click', logout);
  document.addEventListener('click', (e) => {
    if (e.target.closest('#growthCard')) {
      cycleGrowthCardMode();
    } else if (e.target.closest('#simulationGrowthCard') && !e.target.closest('canvas') && !e.target.closest('.chart-legend')) {
      cycleSimulationGrowthMode();
    } else if (e.target.closest('#dashboardBreakdownCard') && !e.target.closest('canvas') && !e.target.closest('.chart-legend')) {
      cycleDashboardBreakdownMode();
    }
  });
  $('#helpButton')?.addEventListener('click', () => showWelcomeModal(state.guest));
  $('#profileResetPasswordBtn')?.addEventListener('click', resetProfilePassword);
  $('#currencySearch')?.addEventListener('input', () => { currencyPage = 0; renderCurrency(); });

  // Re-adapt the currency pagination when the window is resized (only while the
  // Currency page is active, so it keeps fitting the current window size).
  window.addEventListener('resize', () => {
    if (currentPage === 'currency') renderCurrency();
  });

  // Pressing Escape closes any open modal without saving.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAllModals();
  });

  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
    showPage(button.dataset.page);
    closeNavDropdown();
  }));
  document.querySelectorAll('.tools-tab').forEach(btn => btn.addEventListener('click', () => {
    switchToolsTab(btn.dataset.toolsTab);
  }));
  $('#navToggle')?.addEventListener('click', toggleNavDropdown);
  document.querySelectorAll('.asset-tab').forEach(btn => btn.addEventListener('click', () => switchAssetTab(btn.dataset.assetTab)));
  $('#systemAssetSearch')?.addEventListener('input', renderSystemAssets);
  $('#systemAssetTypeFilter')?.addEventListener('change', renderSystemAssets);
  $('#personalAssetSearch')?.addEventListener('input', renderPersonalAssets);
  $('#personalAssetTypeFilter')?.addEventListener('change', renderPersonalAssets);
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
  $('#newPersonalAssetBtn')?.addEventListener('click', () => openAssetModal(null, true));
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
  $('#holdingsTable')?.closest('table')?.querySelectorAll('thead th.sortable').forEach(th => {
    th.addEventListener('click', () => setHoldingsSort(th.dataset.sort));
  });
  $('#holdingAssetTypeFilter')?.addEventListener('change', () => fillHoldingAssetSelect());
  $('#holdingAccount')?.addEventListener('change', () => fillHoldingAssetSelect());
  $('#newGoalBtn')?.addEventListener('click', () => openGoalModal());
  $('#newUserBtn')?.addEventListener('click', () => openModal('userModalOverlay'));
  $('#currencyTestConvertBtn')?.addEventListener('click', runCurrencyTest);
  $('#welcomeModalOk')?.addEventListener('click', () => closeModal('welcomeModalOverlay'));
  $('#closeWelcomeBtn')?.addEventListener('click', () => closeModal('welcomeModalOverlay'));
  $('#welcomeModalNext')?.addEventListener('click', () => setWelcomePage(2));
  $('#welcomeModalPrev')?.addEventListener('click', () => setWelcomePage(1));
  document.querySelectorAll('.welcome-tab').forEach(tab => {
    tab.addEventListener('click', () => setWelcomePage(Number(tab.dataset.welcomePage)));
  });
  // Time Travel
  $('#timeTravelBtn')?.addEventListener('click', openTimeTravelModal);
  $('#timeTravelPrevBtn')?.addEventListener('click', goToPrevSnapshot);
  $('#timeTravelNextBtn')?.addEventListener('click', goToNextSnapshot);
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    const isTyping = target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    );
    if (isTyping) return;

    if (event.key === 'ArrowLeft') {
      const prevBtn = $('#timeTravelPrevBtn');
      if (prevBtn && !prevBtn.disabled) {
        event.preventDefault();
        goToPrevSnapshot();
      }
    } else if (event.key === 'ArrowRight') {
      const nextBtn = $('#timeTravelNextBtn');
      if (nextBtn && !nextBtn.disabled) {
        event.preventDefault();
        goToNextSnapshot();
      }
    }
  });
  $('#timeTravelPlayBtn')?.addEventListener('click', timeTravelPlay);
  $('#timeTravelSaveBtn')?.addEventListener('click', saveSnapshot);
  $('#timeTravelHistoryBtn')?.addEventListener('click', openHistoryModal);
  $('#timeTravelCalendarBtn')?.addEventListener('click', openCalendarModal);
  $('#closeTimeTravelBtn')?.addEventListener('click', () => closeModal('timeTravelModalOverlay'));
  $('#cleanMonthsBtn')?.addEventListener('click', () => cleanSnapshots('months'));
  $('#cleanYearsBtn')?.addEventListener('click', () => cleanSnapshots('years'));
  $('#closeCalendarBtn')?.addEventListener('click', () => closeModal('calendarModalOverlay'));
  $('#maximizeHistoryBtn')?.addEventListener('click', toggleHistoryMaximize);
  $('#closeHistoryBtn')?.addEventListener('click', closeHistoryModal);
  $('#historyChartType')?.addEventListener('change', renderHistoryChart);
  $('#historyZoom')?.addEventListener('change', renderHistoryChart);
  $('#maximizeAccountHistoryBtn')?.addEventListener('click', toggleAccountHistoryMaximize);
  $('#closeAccountHistoryBtn')?.addEventListener('click', closeAccountHistoryModal);
  $('#accountHistoryZoom')?.addEventListener('change', renderAccountHistoryChart);
  $('#maximizeGoalHistoryBtn')?.addEventListener('click', toggleGoalHistoryMaximize);
  $('#closeGoalHistoryBtn')?.addEventListener('click', closeGoalHistoryModal);
  $('#goalHistoryZoom')?.addEventListener('change', renderGoalHistoryChart);
  $('#snapshotList')?.addEventListener('click', async event => {
    const viewBtn = event.target.closest('[data-view-snapshot]');
    if (viewBtn) { await viewSnapshot(viewBtn.dataset.viewSnapshot); return; }
    const delBtn = event.target.closest('[data-delete-snapshot]');
    if (delBtn) { await deleteSnapshot(delBtn.dataset.deleteSnapshot); return; }
  });
  // Clickable menu/keyword references inside the welcome modal: close it and navigate to the page.
  document.querySelectorAll('#welcomeModalOverlay [data-page]').forEach(el => {
    el.addEventListener('click', () => {
      closeModal('welcomeModalOverlay');
      showPage(el.dataset.page);
    });
  });

  // Modal close buttons
  $('#closeAssetModalBtn')?.addEventListener('click', () => closeModal('assetModalOverlay'));
  $('#closeProviderModalBtn')?.addEventListener('click', () => closeModal('providerModalOverlay'));
  $('#closeAccountModalBtn')?.addEventListener('click', () => closeModal('accountModalOverlay'));
  $('#closeHoldingModalBtn')?.addEventListener('click', () => closeModal('holdingModalOverlay'));
  $('#closeGoalModalBtn')?.addEventListener('click', () => closeModal('goalModalOverlay'));
  $('#goalSimForm')?.addEventListener('submit', event => { event.preventDefault(); runGoalSimulation(); });
  $('#loanSimForm')?.addEventListener('submit', event => { event.preventDefault(); runLoanSimulation(); });
  $('#loanSimForm')?.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', runLoanSimulation);
    input.addEventListener('change', runLoanSimulation);
  });
  $('#goalDetailsSimulateBtn')?.addEventListener('click', () => {
    if (goalDetailsGoalId == null) return;
    closeModal('goalDetailsModalOverlay');
    openGoalSimModal(goalDetailsGoalId);
  });
  $('#closeUserModalBtn')?.addEventListener('click', () => closeModal('userModalOverlay'));
  $('#closeResetPasswordModalBtn')?.addEventListener('click', () => closeModal('resetPasswordModalOverlay'));
  // Modal header X close buttons
  $('#closeAssetModalX')?.addEventListener('click', () => closeModal('assetModalOverlay'));
  $('#closeUpdateAssetModalX')?.addEventListener('click', () => closeModal('updateAssetModalOverlay'));
  $('#closeUpdateAllPricesX')?.addEventListener('click', () => closeModal('updateAllPricesModalOverlay'));
  $('#closeProviderModalX')?.addEventListener('click', () => closeModal('providerModalOverlay'));
  $('#closeAccountModalX')?.addEventListener('click', () => closeModal('accountModalOverlay'));
  $('#closeHoldingModalX')?.addEventListener('click', () => closeModal('holdingModalOverlay'));
  $('#closeGoalModalX')?.addEventListener('click', () => closeModal('goalModalOverlay'));
  $('#closeGoalSimX')?.addEventListener('click', () => closeModal('goalSimModalOverlay'));
  $('#closeLoanSimX')?.addEventListener('click', () => closeModal('loanSimModalOverlay'));
  $('#closeGoalDetailsX')?.addEventListener('click', () => closeModal('goalDetailsModalOverlay'));
  $('#closeAccountDetailsX')?.addEventListener('click', () => closeModal('accountDetailsModalOverlay'));
  $('#closeProviderDetailsX')?.addEventListener('click', () => closeModal('providerDetailsModalOverlay'));
  $('#closeUserModalX')?.addEventListener('click', () => closeModal('userModalOverlay'));
  $('#closeResetPasswordX')?.addEventListener('click', () => closeModal('resetPasswordModalOverlay'));

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
      if ($('#systemAssetSearch')) $('#systemAssetSearch').value = '';
      if ($('#systemAssetTypeFilter')) $('#systemAssetTypeFilter').value = '';
      if ($('#personalAssetSearch')) $('#personalAssetSearch').value = '';
      if ($('#personalAssetTypeFilter')) $('#personalAssetTypeFilter').value = '';
      await loadData();
      toast(assetId ? 'Asset updated.' : 'New asset added.');
      return;
    }

    const isPersonal = event.currentTarget.dataset.isPersonal === '1';
    try {
      if (assetId) {
        await request(`${isPersonal ? '/personal-assets' : '/assets'}/${assetId}`, { method: 'PUT', body: JSON.stringify(values) });
      } else {
        await request(isPersonal ? '/personal-assets' : '/assets', { method: 'POST', body: JSON.stringify(values) });
      }
      closeModal('assetModalOverlay');
      if ($('#systemAssetSearch')) $('#systemAssetSearch').value = '';
      if ($('#systemAssetTypeFilter')) $('#systemAssetTypeFilter').value = '';
      if ($('#personalAssetSearch')) $('#personalAssetSearch').value = '';
      if ($('#personalAssetTypeFilter')) $('#personalAssetTypeFilter').value = '';
      await loadData();
      toast(assetId ? (isPersonal ? 'Personal asset updated.' : 'Asset updated.') : (isPersonal ? 'New personal asset saved.' : 'New asset saved.'));
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
    values.finish_date = values.type === 'loan' ? finishDateToDb(values.finish_date) : null;
    const accountId = values.account_id ? Number(values.account_id) : null;

    if (state.guest) {
      if (accountId) {
        const acc = guestData.accounts.find(a => a.id === accountId);
        if (acc) {
          acc.provider_id = values.provider_id;
          acc.name = values.name;
          acc.type = values.type;
          acc.coin = values.coin || 'USD';
          acc.balance = values.balance;
          acc.interest_rate = values.interest_rate;
          acc.finish_date = values.finish_date;
        }
      } else {
        const newId = Math.max(...guestData.accounts.map(a => a.id), 0) + 1;
        guestData.accounts.push({ id: newId, provider_id: values.provider_id, name: values.name, type: values.type, coin: values.coin || 'USD', balance: values.balance, interest_rate: values.interest_rate, finish_date: values.finish_date });
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
    const [assetIdStr, isPersonalStr] = String(values.asset_id || '').split('|');
    values.asset_id = numeric(assetIdStr);
    values.is_personal = Number(isPersonalStr) === 1 ? 1 : 0;
    values.account_id = numeric(values.account_id);
    values.quantity = numeric(values.quantity);
    values.purchase_price = numeric(values.purchase_price);
    const holdingId = values.holding_id ? Number(values.holding_id) : null;

    if (state.guest) {
      if (holdingId) {
        const h = guestData.holdings.find(item => item.id === holdingId);
        if (h) {
          h.asset_id = values.asset_id;
          h.is_personal = values.is_personal;
          h.account_id = values.account_id;
          h.quantity = values.quantity;
          h.purchase_price = values.purchase_price;
        }
      } else {
        const newId = Math.max(...guestData.holdings.map(h => h.id), 0) + 1;
        guestData.holdings.push({ id: newId, account_id: values.account_id, asset_id: values.asset_id, is_personal: values.is_personal, quantity: values.quantity, purchase_price: values.purchase_price });
      }
      closeModal('holdingModalOverlay');
      await loadData();
      toast('Holding saved.');
      return;
    }

    try {
      const body = { ...values };
      await request('/holdings', { method: 'POST', body: JSON.stringify(body) });
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
        const maxOrder = Math.max(...guestData.goals.map(g => g.order_by ?? 0), 0);
        guestData.goals.push({ id: newId, goal_name: values.goal_name, value: values.value, coin: values.coin || 'USD', sub1: values.sub1, sub2: values.sub2, sub3: values.sub3, account_ids: values.account_ids, order_by: maxOrder + 1 });
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
    const toggleDashboardAccountsBtn = event.target.closest('[data-toggle-dashboard-accounts]');
    if (toggleDashboardAccountsBtn) {
      toggleDashboardAccounts();
      return;
    }
    // Account history (click an account card on the dashboard when snapshots exist)
    const accountHistoryCard = event.target.closest('[data-account-history]');
    if (accountHistoryCard) {
      openAccountHistoryModal(Number(accountHistoryCard.dataset.accountHistory));
      return;
    }
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
        const source = dashboardBreakdownMode === 'account' ? 'account' : 'provider';
        if (dashboardFilter && dashboardFilter.source === source && dashboardFilter.value === label) {
          dashboardFilter = null;
        } else {
          dashboardFilter = { source, value: label };
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

    // Update Asset Value / Yield
    const updateAssetBtn = event.target.closest('[data-update-asset]');
    if (updateAssetBtn) {
      openUpdateAssetModal(Number(updateAssetBtn.dataset.updateAsset));
      return;
    }

    // Edit Asset
    const editAssetBtn = event.target.closest('[data-edit-asset]');
    if (editAssetBtn) {
      openAssetModal(Number(editAssetBtn.dataset.editAsset), Number(editAssetBtn.dataset.editAssetPersonal));
      return;
    }

    // Delete Asset
    const deleteAssetBtn = event.target.closest('[data-delete-asset]');
    if (deleteAssetBtn) {
      const assetId = Number(deleteAssetBtn.dataset.deleteAsset);
      const isPersonal = Number(deleteAssetBtn.dataset.deleteAssetPersonal) === 1;
      const asset = findAsset(assetId, isPersonal);
      if (!await confirmDialog(isPersonal ? 'Delete this personal asset?' : 'Delete this asset? This will also remove any holdings using it.')) return;
      if (state.guest) {
        guestData.assets = guestData.assets.filter(a => a.id !== assetId);
        await loadData();
        toast('Asset deleted.');
        return;
      }
      try {
        await request(`${isPersonal ? '/personal-assets' : '/assets'}/${assetId}`, { method: 'DELETE' });
        await loadData();
        toast(isPersonal ? 'Personal asset deleted.' : 'Asset deleted.');
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

    // Provider Details (account breakdown)
    const providerDetailsBtn = event.target.closest('[data-provider-details]');
    if (providerDetailsBtn) {
      openProviderDetailsModal(Number(providerDetailsBtn.dataset.providerDetails));
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

    // Account Details (asset breakdown)
    const accountDetailsBtn = event.target.closest('[data-account-details]');
    if (accountDetailsBtn) {
      openAccountDetailsModal(Number(accountDetailsBtn.dataset.accountDetails));
      return;
    }

    // Loan Simulator
    const loanSimBtn = event.target.closest('[data-loan-sim]');
    if (loanSimBtn) {
      openLoanSimModal(Number(loanSimBtn.dataset.loanSim));
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
      openHoldingModal(Number(editHoldingBtn.dataset.editHolding));
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

    // Reorder Goal (up/down arrows)
    const goalUpBtn = event.target.closest('[data-goal-up]');
    const goalDownBtn = event.target.closest('[data-goal-down]');
    if (goalUpBtn || goalDownBtn) {
      const id = Number((goalUpBtn || goalDownBtn).dataset[goalUpBtn ? 'goalUp' : 'goalDown']);
      const dir = goalUpBtn ? -1 : 1;
      const sorted = state.goals.slice().sort((a, b) => (a.order_by ?? 0) - (b.order_by ?? 0) || a.id - b.id);
      const idx = sorted.findIndex(g => g.id === id);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
      // Swap the two goals in the sorted array, then reassign sequential order_by.
      [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
      sorted.forEach((g, i) => { g.order_by = i + 1; });
      if (state.guest) {
        guestData.goals = sorted.map(g => ({ ...g }));
        await loadData();
        toast('Goal reordered.');
        return;
      }
      try {
        await request('/goals/reorder', { method: 'POST', body: JSON.stringify({ ids: sorted.map(g => g.id) }) });
        await loadData();
        toast('Goal reordered.');
      } catch (err) {
        toast(err.message);
        await loadData();
      }
      return;
    }

    // Goal Details
    const goalDetailsBtn = event.target.closest('[data-goal-details]');
    if (goalDetailsBtn) {
      openGoalDetailsModal(Number(goalDetailsBtn.dataset.goalDetails));
      return;
    }

    // Goal History
    const goalHistoryBtn = event.target.closest('[data-goal-history]');
    if (goalHistoryBtn) {
      openGoalHistoryModal(Number(goalHistoryBtn.dataset.goalHistory));
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
        const maxOrder = Math.max(...guestData.goals.map(x => x.order_by ?? 0), 0);
        guestData.goals.push({ id: newId, goal_name: g.goal_name, value: g.value, coin: g.coin || 'USD', sub1: g.sub1 ?? null, sub2: g.sub2 ?? null, sub3: g.sub3 ?? null, account_ids: (g.account_ids || []).slice(), order_by: maxOrder + 1 });
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
      await loadData({ refreshSnapshots: true });

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
        const refreshed = await loadData({ refreshSnapshots: true });
        toast(refreshed ? 'All data refreshed.' : 'Could not fully refresh. Existing data was kept.');
      } finally {
        refreshBtn.classList.remove('spinning');
      }
    });
  }

  // Blur (privacy) feature: eye button + "H" keyboard shortcut.
  const blurBtn = $('#blurButton');
  if (blurBtn) blurBtn.addEventListener('click', toggleBlur);
  document.addEventListener('keydown', event => {
    if (typeof event.key === 'string' && event.key.toLowerCase() === 'h' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const target = event.target;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (!typing) toggleBlur();
    }
  });
  initBlurObserver();
  applyBlur();

  // Register service worker for PWA support (progressive enhancement).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW registration is optional; ignore failures */
      });
    });
  }
});
