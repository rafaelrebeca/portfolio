# Portfolio Manager — Project Documentation

Private portfolio management dashboard. Tracks assets, dividends, providers, accounts, holdings, goals, and currency exchange rates. Built as a Cloudflare Pages application with a D1 SQLite database and a single-file API worker.

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Hosting | Cloudflare Pages |
| Backend | Cloudflare Pages Functions (Workers) — single catch-all route |
| Database | Cloudflare D1 (SQLite) — binding name `myd1db` |
| Frontend | Vanilla HTML + CSS + JS (ES modules), no framework |
| Charts | Chart.js (loaded from CDN) |
| Auth | Session cookie (`portfolio_session`), bcrypt password hashing |
| External APIs | Massive.com (stock prices), ExchangeRate-API (currency) |

---

## 2. Project Structure

```
portfolio/
├── index.html              # Single-page app shell (all pages + modals)
├── sw.js                   # Service worker (PWA)
├── manifest.webmanifest    # PWA manifest
├── _routes.json            # Cloudflare Pages routing (only /api/* hits the worker)
├── package.json            # Scripts + deps (wrangler, bcryptjs)
├── .gitattributes          # LF normalization
├── .gitignore              # node_modules, .DS_Store, PROJECT.md, wrangler.toml, schema.sql, etc.
├── css/
│   └── portfolio.css       # All styling (CSS variables, layout, modals, charts)
├── js/
│   └── portfolio.js        # All frontend logic (ES module)
├── functions/
│   └── api/
│       └── [[path]].js     # Catch-all API worker (all backend routes)
└── icons/                  # PWA icons (favicon, 192, 512, maskable)
```

---

## 3. Commands

```bash
npm run dev      # Local dev via Wrangler (wrangler pages dev .)
npm run deploy   # Deploy to Cloudflare Pages (project: portfolio-manager)
```

---

## 4. Environment / Secrets

Stored as Cloudflare Pages **secrets** (not in the repo):

| Secret | Purpose |
|--------|---------|
| `API_KEY` | ExchangeRate-API key — used by `POST /api/admin/update-currency` |
| `STOCK_API_KEY` | Massive.com API key — used by `POST /api/assets/{id}/price` and the bulk "Update All Prices" feature |

- `API_KEY` is configured.
- `STOCK_API_KEY` is configured. The "Update" asset price feature is fully operational.

For **local dev**, both keys are read from `env` in `functions/api/[[path]].js` and set in the `[vars]` section of `wrangler.toml` (git-ignored). If a key is missing, the corresponding endpoint returns e.g. `STOCK_API_KEY not configured in environment variables.`

---

## 5. Database (D1 — `myd1db`)

Tables referenced by the worker (schema is managed in the Cloudflare D1 console, not in this repo; a local copy lives in `schema.sql`):

- **users** — `id`, `username`, `password_hash`, `role` (`guest`/`user`/`admin`), `created_at`, `last_login`
- **sessions** — `token`, `user_id`, `expires_at` (7-day expiry)
- **assets** — `id`, `name`, `symbol`, `type` (`stock`/`bond`/`etf`/`cfd`/`commodity`), `price`, `coin`
- **dividends** — `asset_id` (PK), `dividend_yield` (percent, e.g. `0.52` = 0.52%)
- **dividend_payment_months** — `asset_id`, `month_paid` (1–12)
- **providers** — `id`, `user_id`, `name`, `type` (`bank`/`broker`/`other`), `created_at`
- **accounts** — `id`, `provider_id`, `name`, `type` (`loan`/`interest_account`/`bank_account`/`asset_account`), `balance`, `interest_rate`, `coin`
- **account_holdings** — `id`, `account_id`, `asset_id`, `quantity`, `purchase_price` (unique on `account_id`+`asset_id`)
- **goals** — `id`, `user_id`, `goal_name`, `value`, `coin`, `sub1`, `sub2`, `sub3` (REAL, optional sub-goal milestones)
- **goal_link** — `goal_id`, `account_id`
- **currency** — `coin`, `value` (rate relative to USD)
- **update_story** — `what` (PK), `when` — records the last time a data source was refreshed. `what` is a label (e.g. `CURRENCY`); `when` is a UTC timestamp in `YYYYMMDDHH24MISS` format (e.g. `20260815103045`). Used to avoid re-calling external APIs that only expose previous-day end-of-day data more than once per day.

---

## 6. Backend API (`functions/api/[[path]].js`)

Single catch-all worker. All routes are under `/api/...`. Auth helpers:

- `requireUser` — any logged-in user (401 if not)
- `requireMember` — logged-in, non-guest (403 for guest)
- `requireAdmin` — logged-in admin (403 otherwise)

### Auth
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/auth/login` | public | Login, sets `portfolio_session` cookie |
| POST | `/api/auth/logout` | user | Clears session |
| GET | `/api/auth/me` | user | Current user info |

### Assets
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/assets` | member | List all assets (with dividend yield + payment months) |
| POST | `/api/assets` | admin | Create asset |
| PUT/PATCH | `/api/assets/{id}` | admin | Update asset (name, symbol, type, price, coin, yield, months) |
| DELETE | `/api/assets/{id}` | admin | Delete asset + related holdings/dividends |
| POST | `/api/assets/{id}/price` | admin | **Fetch latest price from Massive.com** (see §7) |

### Dividends
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/dividends` | member | Assets that have a yield or payment months |

### Providers / Accounts / Holdings
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET/POST | `/api/providers` | member | List / create providers |
| DELETE | `/api/providers/{id}` | member | Delete own provider |
| GET/POST | `/api/accounts` | member | List / create-or-update accounts |
| PUT/PATCH | `/api/accounts/{id}` | member | Update account |
| DELETE | `/api/accounts/{id}` | member | Delete own account |
| GET/POST | `/api/holdings` | member | List / upsert holdings |
| DELETE | `/api/holdings/{id}` | member | Delete own holding |

### Goals
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET/POST | `/api/goals` | member | List / create-or-update goals (supports `sub1`/`sub2`/`sub3`) |
| DELETE | `/api/goals/{id}` | member | Delete own goal |

**Sub-goal validation (POST /api/goals):** `sub1`/`sub2`/`sub3` are optional numbers. Dependency chain is enforced server-side (`sub2` requires `sub1`; `sub3` requires `sub2`). Value-dependent rules also apply: for a debt goal (`value = 0`) sub-goals must be negative; for a positive goal they must be positive, `< target`, and ascending. Violations return a 400 error.

### Admin
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/admin/users` | admin | List users |
| POST | `/api/admin/users` | admin | Create user |
| POST | `/api/admin/users/{id}/password` | admin | Reset user password |
| PATCH | `/api/admin/users/{id}/role` | admin | Change user role (cannot change own) |
| POST | `/api/admin/import` | admin | Bulk import assets (upsert by symbol) |
| POST | `/api/admin/update-currency` | admin | Fetch + store exchange rates from ExchangeRate-API (skipped if already updated today — see §7c) |

### Currency
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/currency` | member | List stored exchange rates |

---

## 7. Massive.com Price Fetch (the "Update" feature)

**Endpoint:** `POST /api/assets/{id}/price` (admin only)

**Flow:**
1. Admin clicks the **Update** button on an asset row (Assets page).
2. A modal opens showing a progress bar while the frontend calls the backend.
3. The backend looks up the asset's `symbol`, then calls Massive.com:
   ```
   GET https://api.massive.com/v2/aggs/ticker/{SYMBOL}/prev?apiKey={STOCK_API_KEY}
   ```
4. The close price is read from `results.c` (handles both array and object shapes).
5. The backend returns `{ price, coin, raw }` where `raw` is the full Massive response.
6. The modal shows the fetched price (editable) plus a collapsible **"API reply"** log with the raw JSON.
7. Admin clicks **Commit** (saves price via `PUT /api/assets/{id}`) or **Close** (discards).

**Important — free tier limitation:** The Massive **snapshot** endpoint (`/v2/snapshot/...`) returns **403 on the free "Stocks Basic" tier**. The **Previous Day Bar** endpoint (`/v2/aggs/ticker/{ticker}/prev`) **is** available on the free tier and is what we use. The price returned is the **previous trading day's close** (end-of-day data), not a live tick.

**Massive is US-stocks only.** Assets without a symbol, or non-US tickers, will error in the modal.

### 7a. Bulk "Update All Prices" (admin)

A separate admin feature that updates **all eligible assets at once** (Assets page → **↻ Update All Prices** button, `#updateAllPricesBtn`, styled `btn-sm admin-action` — shown only to admins).

- **Eligibility** (`bulkUpdateEligibleAssets`): only assets with `type === 'stock'` **and** `coin === 'USD'` are included. Bonds, ETFs, CFDs, commodities, and non-USD assets are skipped entirely (they are not part of the update list).
- **Rate limiting:** Massive free tier allows **5 calls/minute**, but to be safe the frontend caps at **4 calls/minute** by spacing calls `BULK_UPDATE_RATE_LIMIT_MS` (~15s) apart.
- **Flow:** `openBulkUpdateModal()` → `runBulkUpdate(eligible)` iterates each eligible asset, calling `POST /api/assets/{id}/price` then committing via `PUT /api/assets/{id}`. A progress bar (`#updateAllPricesProgressBar`) and label (`#updateAllPricesLabel`) show `Updating X of Y...`, and a collapsible console log (`#updateAllPricesLog`) records each asset as `[OK] SYMBOL: price (+/-X.XX%)` (the % is the change vs. the asset's previous price) or `[ERROR] SYMBOL: message`.
- **Portfolio impact:** after the `Done. Updated X, failed Y.` line, the log reports how the update affected the portfolio — `Portfolio impact: +$X.XX (+X.XX%)` — computed in **USD** from the holdings of the updated (USD stock) assets only, both as an absolute USD change and a percentage change vs. the pre-update value of those holdings.
- **Completion:** on finish a toast reports `Bulk update finished: X updated, Y failed.` and `loadData()` refreshes the table.
- **UI elements:** `#updateAllPricesModalOverlay`, `#updateAllPricesBtn`, `#updateAllPricesLabel`, `#updateAllPricesProgressBar`, `#updateAllPricesError`, `#updateAllPricesLogWrap`, `#updateAllPricesLog`, `#closeUpdateAllPricesBtn`.

---

## 7b. Goal Sub-goals

Goals can have up to **3 sub-goals** (`sub1`, `sub2`, `sub3`), stored as REAL columns on the `goals` table. They represent milestone values in the goal's currency.

**Dependency rule (enforced in both the UI and the backend):**
- `sub2` can only be set if `sub1` is set.
- `sub3` can only be set if `sub2` is set.
- In the goal modal, sub-goal inputs are **not restricted while typing** — they only filter characters to digits and a leading minus sign (`filterSubInput`). Validation happens **on save** (`validateGoalSubs`), which shows a warning if the sub-goals are inconsistent (e.g. `sub2` set without `sub1`, or not following `target > sub3 > sub2 > sub1`).

**Value-dependent rules (enforced in both the UI and the backend):**
- **Debt goal (value = 0):** sub-goals must be **negative** (debt amounts to clear). Any non-negative sub-goal is rejected on save.
- **Positive goal (value > 0):** sub-goals must be **positive, less than the target, and in ascending order** (`0 < sub1 < sub2 < sub3 < target`). Invalid sub-goals are rejected on save.

**Display logic (`goalProgressHTML` in `js/portfolio.js`):**

- **No sub-goals** → single progress bar (unchanged behavior), for both normal and debt goals.
- **Normal goal (value > 0) with sub-goals** → the bar is split into segments running `0 → sub1 → sub2 → sub3 → target`. Each segment's **width** is proportional to the value range it represents, and each segment's **fill** = `(current − segment_start) / (segment_end − segment_start)`, clamped 0–100% (progress within the segment's own range). The global completion % label is still shown at the right, and a **`.goal-sub-label`** below the bar shows the **active sub-goal** (the next milestone not yet reached) and its progress %.
  - Example: target=40000, sub1=20000, sub2=30000, sub3=38000, current=36188 → seg1 = 100%, seg2 = 100%, seg3 = 77%, seg4 = 0%.
- **Debt goal (value = 0) with sub-goals** → the bar stays a single "debt cleared" bar, and each sub-goal amount is shown as a **diamond tick mark** along the bar. Marks count down from 100% (the goal/zero): position = `(total debt − |sub-goal|) / total debt × 100`. E.g. a sub-goal of `-5000` against `100000` debt sits at 95%; `-95000` sits at 5%. Each mark shows a custom tooltip (via `data-tip`) with its value on hover.

The same `goalProgressHTML` helper is used by both the goal cards (`renderGoals`) and the goal details modal (`openGoalDetailsModal`).

---

## 7c. Currency Update Caching (`update_story`)

**Endpoint:** `POST /api/admin/update-currency` (admin only)

The frontend calls this endpoint automatically on **admin login** and on the **auto session check** (see `signIn` and the session-check block in `js/portfolio.js`). Because ExchangeRate-API only exposes **previous-day end-of-day** values, there is no new data within the same day — so the endpoint is guarded to avoid hammering the API.

**Flow:**
1. The handler reads the `update_story` row where `what = 'CURRENCY'`.
2. If that row exists and its `when` value (a `YYYYMMDDHH24MISS` UTC timestamp) has the **same date part (`YYYYMMDD`) as today**, the external API call is **skipped** and the endpoint returns `{ count: 0, ok: true, skipped: true, message: 'Currency rates already updated today; skipping external API call.' }`.
3. Otherwise it calls ExchangeRate-API, upserts all rates into the `currency` table, then upserts the `update_story` row with `what = 'CURRENCY'` and `when = <current UTC timestamp in YYYYMMDDHH24MISS>`.

**Result:** the external currency API is called at most **once per day**, regardless of how many times the endpoint is invoked.

---

## 8. Frontend (`js/portfolio.js`)

- **State:** `state` object holds `user`, `guest`, `assets`, `providers`, `accounts`, `holdings`, `users`, `currencies`, `goals`.
- **Guest mode:** `guestData` provides mock data; `state.guest` is true. Guest changes are local-only and not persisted.
- **Helpers:** `$` (querySelector), `esc` (HTML escape), `numeric`, `request` (fetch wrapper that throws on non-OK), `toast`, `openModal`/`closeModal`/`closeAllModals`, `confirmDialog` (Promise-based custom confirm modal), `isWriteAllowed`, `isAdminUser`.
- **Currency:** `getExchangeRate`, `convertToEUR`, `formatCurrency` — rates are relative to USD. `accountValue(acc, convertToEur)` returns an account's value: with `convertToEur=true` it converts to EUR; otherwise it converts to the **account's display currency** (`acc.coin`). For asset accounts the holdings value (in the asset's currency) is converted to `acc.coin`, so changing an account's currency correctly re-values it rather than just relabeling the symbol.
- **Data loading:** `loadData()` fetches all collections in parallel via `Promise.all`, then calls `render()`.
- **Rendering:** `render()` dispatches to per-page renderers: `renderDashboardAccounts`, `renderCharts`, `renderPortfolioCards`, `renderPortfolioCharts`, `renderAssets`, `renderDividends`, `renderAccounts`, `renderHoldings`, `renderGoals`, `renderUsers`, plus `fillDividendPeriodValue()`, `updateToggleAllLabel()`, and `fillSelects()`.
- **Charts:** Chart.js instances are cached in module-level variables (`allocationChartInstance`, `goalSimChartInstance`, etc.) and destroyed/recreated on re-render.
- **Modals:** `openAssetModal`, `openUpdateAssetModal`, `openBulkUpdateModal`, `openProviderModal`, `openAccountModal`, `openHoldingModal`, `openGoalModal`, `openGoalDetailsModal`, `openGoalSimModal`, `openAccountDetailsModal`, `openProviderDetailsModal`. Modals are capped at `calc(100vh - 48px)` with `overflow-y: auto` so tall content (e.g. many linked accounts) scrolls instead of overflowing the screen. Pressing **Escape** closes any open modal without saving (`closeAllModals`). While any modal is open, background scrolling is locked: `openModal`/`closeModal`/`closeAllModals` call `syncBodyScrollLock()`, which toggles a `modal-open` class on `<body>` (`body.modal-open { overflow: hidden }`). The modal's own content still scrolls independently.
- **Goal sub-goals:** `goalProgressHTML` (segmented/marked progress bar), `updateGoalSubGating` + `filterSubInput` (character filtering while typing), `validateGoalSubs` (save-time validation).
- **Goal simulator:** `openGoalSimModal`, `goalSimData`, `runGoalSimulation` — a modal (`#goalSimModalOverlay`) that projects goal progress over time given a monthly contribution, rendered as a Chart.js line chart (`#goalSimChart`).
- **Bulk price update:** `bulkUpdateEligibleAssets`, `openBulkUpdateModal`, `runBulkUpdate`, `setBulkUpdateProgress`, `appendBulkUpdateLog` (see §7a).
- **Event handling:** A single delegated click handler on `document` routes clicks via `data-*` attributes. Full set of handled attributes: `data-account-details`, `data-add-account-provider`, `data-add-asset-to-account`, `data-delete-account`, `data-delete-asset`, `data-delete-goal`, `data-delete-holding`, `data-delete-provider`, `data-delete-user`, `data-duplicate-goal`, `data-edit-account`, `data-edit-asset`, `data-edit-goal`, `data-edit-holding`, `data-edit-provider`, `data-goal-details`, `data-legend-label`, `data-provider-details`, `data-remove-goal-account`, `data-reset-password-user`, `data-role-user`, `data-simulate-goal`, `data-tip`, `data-toggle-provider`, `data-update-asset`, `data-username`.

### Pages (sidebar navigation)
Dashboard, Goals, My Portfolio, Assets, Dividends, My Accounts, plus admin-only: Import Data, Export Data, Users.

**My Accounts** is a merged page combining providers and their accounts. It lists providers as **provider cards** (`.provider-card`), each with a styled header (`.provider-card-head`) showing a collapse toggle, provider icon, name, type tag, account count, the provider's **total value in EUR** (`.provider-total`, via `providerValue`), and **+ Add Account** / **Edit** / **Delete** buttons, and a body (`.provider-card-body`) containing the accounts nested inside so they visually belong to the provider.

- **Account value display:** every account card shows its value on the **left** of the detail grid (asset accounts show **Value** then **Holdings**; loan/interest accounts show **Balance** then **Interest Rate**; bank accounts show **Balance**). When an account's currency is not EUR, the converted **EUR value is shown in parentheses** after the value (e.g. `$1,234.56 (€1,050.00)`).

- **Collapse/expand:** each provider can be minimized/expanded via the toggle button (`data-toggle-provider`), hiding/showing its accounts. Collapsed state is tracked in the module-level `collapsedProviders` Set and persisted across re-renders (cleared when a provider is deleted).
- **Collapse/Expand All:** the toolbar's **Collapse All** / **Expand All** button (`#toggleAllProvidersBtn`) collapses or expands every provider at once. Its label is kept in sync by `updateToggleAllLabel()`.
- **+ Add Account (per provider):** opens the account modal with that provider preselected and the provider dropdown hidden (`openAccountModal(null, providerId)`), so no provider selection is needed.
- **Account Details (asset breakdown):** any **asset account** that has holdings shows a **Details** button (`data-account-details`). Clicking it opens `openAccountDetailsModal(accountId)` — a modal (`#accountDetailsModalOverlay`) with a summary (holdings count + value) and a **doughnut chart** (`#accountDetailsChart`) of the account's assets, showing the **top 9 + Others** ordered descending (via `topNWithOthers`), with a legend (`#accountDetailsLegend`) listing each asset's value and % share. Below the chart, an **"Others" table** (`#accountDetailsOthersTable`) lists each asset grouped into the Others slice with its **Ticker, Value and %** (hidden when there are no others). All values are converted to **EUR** via `convertToEUR` (consistent with the dashboard/portfolio charts), regardless of the account's or asset's currency.
- **Provider Details (account breakdown):** every provider card shows a **Details** button (`data-provider-details`). Clicking it opens `openProviderDetailsModal(providerId)` — a modal (`#providerDetailsModalOverlay`) with a summary (account count + total value) and a **doughnut chart** (`#providerDetailsChart`) of the provider's accounts, showing the **top 9 + Others** ordered descending (via `topNWithOthers`), with a legend (`#providerDetailsLegend`) listing each account's value and % share. Below the chart, an **"Others" table** (`#providerDetailsOthersTable`) lists each account grouped into the Others slice with its **Account, Value and %** (hidden when there are no others). All values are converted to **EUR** via `accountValue(acc, true)`.
- The toolbar groups **+ New Provider** and **+ New Account** together on the right. The **+ New Account** button is **disabled** (but visible) when the user has no providers, with a tooltip "Create a provider first."
- **Dividends** page (`renderDividends`) lists only assets with a **real dividend yield** — i.e. `dividend_yield` is set **and** `> 0`. Assets with a `0` yield (or no yield) are excluded. The page can be filtered by payment period (month / trimester / semester) via `#dividendPeriodType` + `#dividendPeriodValue`.

**Delete confirmations** use a custom modal instead of the browser `confirm()`. `confirmDialog(message, okLabel)` (js/portfolio.js) returns a Promise resolving to `true`/`false`; it is used for deleting assets, providers, accounts, holdings, goals, and users. The modal (`#confirmModalOverlay`) supports Cancel, the OK button, clicking the overlay, and the Escape key.

**Conditional sidebar visibility** (driven by `updateNavVisibility()` in `js/portfolio.js`, called from `render()`):
- **My Portfolio**, **Assets**, **Dividends** — shown only if the current user has at least one `asset_account`.
- **Goals** — shown only if the current user has any accounts (any type).
- **My Accounts** and **Dashboard** are always shown.

### Admin-only UI
Admin-only elements are gated by `isAdminUser()` and/or the `admin-action` CSS class. The admin nav section (`#adminSectionLabel`, `#navImport`, `#navExport`, `#navUsers`) is shown only for admins.

**Button color variants** (`.btn-sm`): `primary` (blue/accent), `danger` (red, used for the confirm modal's Delete button via `#confirmModalOk`). The **Update All Prices** button uses the plain `btn-sm admin-action` style (shown only to admins).

---

## 9. Key Frontend Functions for the "Update" Feature

- `openUpdateAssetModal(assetId)` — opens the modal, shows progress, kicks off the fetch.
- `setUpdateProgress(percent)` — drives the progress bar width.
- `fetchUpdateAssetPrice(a)` — calls `POST /api/assets/{id}/price`, populates the price field and the "API reply" log.
- `setUpdateLog(value)` — shows/hides the collapsible raw-response log.
- Submit handler on `#updateAssetForm` — **Commit** saves the price via `PUT /api/assets/{id}` (only `price` changes; yield untouched).

For the bulk variant, see §7a (`openBulkUpdateModal`, `runBulkUpdate`, etc.).

---

## 10. Styling (`css/portfolio.css`)

- Uses CSS custom properties (`--panel2`, `--accent2`, `--muted`, `--danger`, `--border`, `--text`, etc.) for theming.
- Layout: `.topbar`, `.layout` (sidebar + main), `.page`, `.grid-cards`, `.card`, `.charts-row`, `.chart-card`.
- Modals: `.modal-overlay` + `.modal` (toggled with `.show`), `.modal-actions`, `.field`, `.form-error`, `.modal-copy`.
- Progress bar: `.progress` / `.progress-bar`.
- Update log: `.update-log` (collapsible `<details>` with a `<pre>` block).
- Goal sub-goal bar: `.goal-progress-bar-seg` / `.goal-seg` / `.goal-seg-fill` (segmented bar), `.goal-progress-bar-marks` / `.goal-mark` (debt tick marks rendered inside the bar, with `::after` custom tooltip above on hover), `.goal-sub-label` (active sub-goal % label).

---

## 11. PWA

- `sw.js` — service worker for offline/caching. Caches the app shell (`/index.html`, `/css/portfolio.css`, `/js/portfolio.js`, Chart.js CDN). API GET requests are network-first with cache fallback (offline shows last data); non-GET API calls pass through.
- `manifest.webmanifest` — app name "Portfolio Manager", standalone display, icons in `/icons/`.
- `manifest.webmanifest` sets `start_url: "/index.html"` (the actual entry file).

---

## 12. Deployment Notes

- `_routes.json` routes only `/api/*` to the worker; static assets are served directly by Pages.
- The D1 binding is `myd1db` and must be configured in the Cloudflare Pages project settings.
- `npm run deploy` deploys to the `portfolio-manager` project.

## 13. Local Testing

### Start a local dev server

Run the app locally against the local D1 database:

```bash
npm run dev
```

This runs `wrangler pages dev .`, which starts a server on `http://localhost:8788` and wires the `myd1db` D1 binding to the **local** database (stored under `.wrangler/state/v3/d1/`). The API routes in `functions/api/[[path]].js` read/write this local DB, so you can log in with real credentials and see real data.

Notes:
- If port `8788` is already in use, stop the existing dev server first (e.g. `lsof -i :8788` to find the PID, then `kill <pid>`), or pass a different port: `npx wrangler pages dev . --port 8788`.
- The D1 binding is defined in `wrangler.toml` (git-ignored). It must be present for the local DB to be wired up; without it, API routes return `D1 binding "myd1db" is not configured.`

### API keys for local dev

Two external API keys are read from `env` in `functions/api/[[path]].js`:
- `STOCK_API_KEY` — Massive.com stock prices (used by `POST /api/assets/{id}/price` and the bulk update).
- `API_KEY` — ExchangeRate-API currency rates (used by `POST /api/admin/update-currency`).

> Note: `POST /api/admin/update-currency` is cached via the `update_story` table — it only calls the external API once per day (see §7c). To force a fresh fetch during local testing, delete the `update_story` row where `what = 'CURRENCY'` (or change its `when` to a previous day) before calling the endpoint.

For local dev, set them in the `[vars]` section of `wrangler.toml` (git-ignored):

```toml
[vars]
STOCK_API_KEY = "<YOUR_MASSIVE_API_KEY>"
API_KEY = "<YOUR_EXCHANGERATE_API_KEY>"
```

Replace the placeholders with your real keys, then restart `npm run dev`. If a key is missing, the corresponding endpoint returns e.g. `STOCK_API_KEY not configured in environment variables.`

### Refresh the local DB from the remote one

To overwrite the local D1 database with the current remote data:

```bash
./refresh-local-db.sh
```

The script:
1. Exports the remote `myd1db` to `remote-dump.sql` (`wrangler d1 export --remote`).
2. Reorders the dump so the `assets` table is created before the tables that reference it (a known D1 export quirk where table creation order isn't dependency-sorted — without this, import fails with `no such table: main.assets`).
3. Clears the local D1 state (`.wrangler/state/v3/d1/`).
4. Imports the reordered dump into the local database.

After refreshing, **restart the dev server** so it picks up the new local DB state.

### Guest mode (no database)

The app also has a guest mode (`state.guest`) backed by `guestData` in `js/portfolio.js`, which provides mock assets, providers, accounts, holdings, goals, and currencies. Guest changes are local-only and not persisted. This is useful for testing the UI (goal marks/tooltips, segmented bars, modals, etc.) without logging in.
