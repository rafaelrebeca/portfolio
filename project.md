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
| Auth | Session cookie (`portfolio_session`), bcrypt password hashing. Cookie is `HttpOnly; Secure; SameSite=Strict` (see §6 Auth) |
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
- **dashboard_snapshots** — `user_id`, `day` (PK with `user_id`), `data` (JSON), `created_at` — the **Time Travel** feature. One snapshot per user per day of the Dashboard page values. `day` is a UTC date in `YYYYMMDD` format; `data` is a JSON payload of the dashboard values (see §7d); `created_at` is a `YYYYMMDDHH24MISS` UTC timestamp. Writing a new snapshot for a day that already has one **replaces** it (upsert on `(user_id, day)`).

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

**Session cookie security:** the `portfolio_session` cookie is set with `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`. `HttpOnly` prevents JavaScript from reading the token (mitigates XSS token theft), `Secure` restricts it to HTTPS, and `SameSite=Strict` stops the browser from sending the cookie on cross-site requests — this is the CSRF defense, so a request from another origin arrives unauthenticated and fails `requireUser`. Note: `Secure` means the cookie is not set over plain `http://localhost` during local `npm run dev` (dev-only quirk, not a production issue).

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

### Time Travel (dashboard snapshots)
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/snapshots` | user | Create/replace today's snapshot (upsert on `(user_id, day)`). Body: `{ data: {...} }`. Returns the saved snapshot. |
| GET | `/api/snapshots` | user | List the current user's snapshots (`day`, `created_at`, `data`), newest first. |
| GET | `/api/snapshots/{day}` | user | Fetch one snapshot for a specific `YYYYMMDD` day (404 if none). |
| DELETE | `/api/snapshots/{day}` | user | Delete a specific day's snapshot (404 if none). |

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

## 7d. Time Travel (dashboard snapshots)

A feature that lets any logged-in user save a snapshot of the **Dashboard** page values and later view how the dashboard looked on a past day. One snapshot per user per day; saving a new snapshot for a day that already has one **replaces** it.

**Table:** `dashboard_snapshots` (see §5) — `PRIMARY KEY (user_id, day)`. The upsert uses `ON CONFLICT(user_id, day) DO UPDATE`, so a new snapshot for the same day overwrites the existing row.

**Snapshot payload (`data`, JSON):** all monetary values in EUR, matching how the dashboard displays them.

```json
{
  "providerCount": 3,
  "accountCount": 5,
  "globalValue": 123456.78,
  "debit": 150000.00,
  "credit": -26543.22,
  "byType": { "Stock": 80000.00, "Cash": 20000.00, "Loans": -26543.22 },
  "byProvider": { "Revolut": 50000.00, "Trading 212": 73456.78 },
  "accounts": [ { "id": 12, "name": "Main Broker", "type": "asset_account", "provider": "Trading 212", "valueEur": 73456.78 } ]
}
```

- `providerCount` / `accountCount` — from `state.providers.length` / `state.accounts.length`.
- `globalValue` — `totalPortfolioValue()` (the `#portfolioValue` card).
- `debit` / `credit` — sum of positive / negative `accountValue(acc, true)` (the `#debitCreditValue` card).
- `byType` — asset-type allocation in EUR (incl. Loans/Cash/Deposits), same as the **By Type** chart.
- `byProvider` — per-provider value in EUR, same as the **By Provider** chart.
- `accounts` — per-account EUR value + name/type/provider, same as the **Account Overview** grid.

**Backend:** routes in `functions/api/[[path]].js` (see §6). All require a logged-in user (`requireUser`). `POST /api/snapshots` computes `day` from the current UTC date and upserts; `GET /api/snapshots` lists the user's snapshots newest-first; `GET/DELETE /api/snapshots/{day}` fetch/delete a specific day.

**Frontend (`js/portfolio.js`):**
- **Time Travel controls** on the Dashboard header (right of the page title): a **←** previous button (`#timeTravelPrevBtn`), the **🕰 Time Travel** button (`#timeTravelBtn`), and a **→** next button (`#timeTravelNextBtn`). Shown to logged-in users, hidden in guest mode. The **←**/**→** arrows let the user quickly move between snapshots. **←** goes to the previous (older) snapshot; when not viewing a snapshot it **enters Time Travel** at the most recent snapshot (active whenever the user has at least one snapshot). **→** goes to the next (newer) snapshot; when on the most recent snapshot it stays **active** and clicking it **exits Time Travel** back to the live dashboard. Each arrow is **disabled** only when there is no snapshot in that direction (the **→** is disabled only when the current snapshot is not found in the list). The cached snapshot list (`timeTravelList`, newest-first) drives the arrow states via `updateTimeTravelArrows()`; `goToPrevSnapshot()` / `goToNextSnapshot()` perform the navigation. The list is loaded on app load via `loadTimeTravelList()` (called from `loadData()`) so the arrows are correct before the modal is ever opened.
- **Time Travel modal:** a **💾 Save today's snapshot** button (`#saveSnapshotBtn`) calls `POST /api/snapshots` with `collectDashboardSnapshot()` and refreshes the list; a note explains *"One snapshot per day — saving again today replaces today's snapshot."* The snapshot list (`#snapshotList`) shows each day with **View** and **Delete** buttons. **Delete** uses the existing `confirmDialog` and calls `DELETE /api/snapshots/{day}`; it is disabled for the snapshot currently being viewed. The modal has a header **✕** close button (`#closeTimeTravelBtn`).
- **Viewing a past snapshot:** `viewSnapshot(day)` sets the module-level `timeTravelSnapshot` and re-renders. `render()` checks `timeTravelActive()`: when true, the dashboard is rendered from the snapshot via `renderDashboardFromSnapshot(data)` (cards, charts + legends, account overview) instead of live state, and a banner (`#timeTravelBanner`) shows *"Viewing snapshot from <day> — [Exit Time Travel]"*. **Exit Time Travel** (`exitTimeTravel()`) clears the snapshot and re-renders live. Other pages (Assets, Dividends, My Accounts, My Portfolio, Goals) still render live while a snapshot is being viewed.
- **Snapshot collection:** `collectDashboardSnapshot()` mirrors the live dashboard computation (`render()`, `renderCharts()`, `renderDashboardAccounts()`) into the payload.
- **Guest mode:** no snapshots for guests (no `user_id`); the Time Travel controls are hidden.

**Styling (`css/portfolio.css`):** `.time-travel-controls` (flex row for the arrows + button), `#timeTravelBanner` (accent-tinted banner with the exit button), `.snapshot-row` (list rows with day, meta, and View/Delete actions).

---

## 8. Frontend (`js/portfolio.js`)

- **State:** `state` object holds `user`, `guest`, `assets`, `providers`, `accounts`, `holdings`, `users`, `currencies`, `goals`. Module-level `timeTravelSnapshot` holds the active snapshot being viewed (null = live dashboard); see §7d.
- **Guest mode:** `guestData` provides mock data; `state.guest` is true. Guest changes are local-only and not persisted.
- **Helpers:** `$` (querySelector), `esc` (HTML escape), `numeric`, `request` (fetch wrapper that throws on non-OK), `toast`, `openModal`/`closeModal`/`closeAllModals`, `confirmDialog` (Promise-based custom confirm modal), `isWriteAllowed`, `isAdminUser`.
- **Currency:** `getExchangeRate`, `convertToEUR`, `formatCurrency` — rates are relative to USD. `accountValue(acc, convertToEur)` returns an account's value: with `convertToEur=true` it converts to EUR; otherwise it converts to the **account's display currency** (`acc.coin`). For asset accounts the holdings value (in the asset's currency) is converted to `acc.coin`, so changing an account's currency correctly re-values it rather than just relabeling the symbol.
- **Data loading:** `loadData()` fetches all collections in parallel via `Promise.all`, then calls `render()`.
- **Rendering:** `render()` dispatches to per-page renderers: `renderDashboardAccounts`, `renderCharts`, `renderPortfolioCards`, `renderPortfolioCharts`, `renderAssets`, `renderDividends`, `renderAccounts`, `renderHoldings`, `renderGoals`, `renderUsers`, plus `fillDividendPeriodValue()`, `updateToggleAllLabel()`, and `fillSelects()`.
- **Charts:** Chart.js instances are cached in module-level variables (`allocationChartInstance`, `goalSimChartInstance`, etc.) and destroyed/recreated on re-render.
- **Modals:** `openAssetModal`, `openUpdateAssetModal`, `openBulkUpdateModal`, `openProviderModal`, `openAccountModal`, `openHoldingModal`, `openGoalModal`, `openGoalDetailsModal`, `openGoalSimModal`, `openAccountDetailsModal`, `openProviderDetailsModal`, plus the first-run **welcome modal** (`#welcomeModalOverlay`, see the "First-run welcome / usage guide modal" subsection below). Modals are capped at `calc(100vh - 48px)` with `overflow-y: auto` so tall content (e.g. many linked accounts) scrolls instead of overflowing the screen. Pressing **Escape** closes any open modal without saving (`closeAllModals`). While any modal is open, background scrolling is locked: `openModal`/`closeModal`/`closeAllModals` call `syncBodyScrollLock()`, which toggles a `modal-open` class on `<body>` (`body.modal-open { overflow: hidden }`). The modal's own content still scrolls independently. Every modal has a header **✕** close button (`.modal-head` + `.modal-close`, e.g. `#closeAssetModalX`, `#closeWelcomeBtn`, `#closeTimeTravelBtn`). Modals that previously had a redundant footer **Close** button (update asset, update all prices, goal sim, goal details, account details, provider details) now close only via the header **✕**; footer buttons remain only where they are real form actions (e.g. **Cancel** on form modals, **Simulate** on the goal simulator/details).
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

### First-run welcome / usage guide modal (new-user UX)

On **login**, a welcome modal (`#welcomeModalOverlay`) is shown automatically to guide the user through the app. It is triggered by `maybeShowWelcomeModal()` in `js/portfolio.js`, called from `signIn()` right after `loadData()` (and from the guest login handler). The modal has **two content variants**, toggled by `showWelcomeModal(isGuest)`:

- **Guests** (`state.guest === true`) are **always** greeted with a **demo guide** (`#welcomeGuestBody`) on every guest login — cached or not — explaining what the sample data contains and how it's connected. The guest guide covers: sample **Assets** (AAPL, VYM, TLT, MSFT…), sample **Providers** & **Accounts** (Revolut, Trading 212), how **Holdings** live inside an **asset account** and reference **Assets**, how **Goals** link to **Accounts**, and that everything is **editable** but **local only / not saved**.
- **Regular users** are shown the **first-run guide** (`#welcomeBody`) only when they have **no providers** yet; it is skipped once they have at least one provider.

The modal is split into **two pages** via a tab bar (`.welcome-tabs`), switched by `setWelcomePage(page)`:

- **Page 1 — Getting Started:** the numbered 4-step usage guide:
  1. **Add a Provider** — go to the **My Accounts** menu and create a provider (bank / broker / other).
  2. **Add an Account** — inside that provider, create an account (e.g. an **asset account** to hold investments).
  3. **Unlock Goals** — **Goals** are unlocked once at least **1 account** is created.
  4. **Unlock My Portfolio, Assets & Dividends** — once an **asset account** is created, the **My Portfolio**, **Assets** and **Dividends** menus unlock, allowing the user to add **Holdings / Assets** to their portfolio on any existing asset account.
- **Page 2 — Privacy & Time Travel:** describes that the user's data is **private** to their account (no other user can see it; guests only see demo data), that pressing **H** hides the values on screen from people nearby (the blur/privacy feature, see below), and the **Time Travel** snapshot feature (save a snapshot of today's dashboard, view past days, one snapshot per day, delete any snapshot).

The footer has **← Back** (`#welcomeModalPrev`), **Next →** (`#welcomeModalNext`), and **Got it, let's start** (`#welcomeModalOk`) buttons; Back/Next switch pages and the OK button (shown on the last page) calls `closeModal('welcomeModalOverlay')`. The modal also has a header **✕** close button (`#closeWelcomeBtn`). `showWelcomeModal()` resets to page 1 on open.

**Styling** (`.welcome-modal` in `css/portfolio.css`): the modal uses a step layout with numbered circular badges (`.welcome-num`), a title (`.welcome-title`) and body text (`.welcome-text`). Key terms are emphasized with color + bold + underline via the `.kw` classes (`.kw-provider`, `.kw-account`, `.kw-asset`, `.kw-goal`, `.kw-portfolio`, `.kw-assets`, `.kw-dividends`, `.kw-holding`, `.kw-guest`), and menu names use the `.menu` class (accent-colored, bold, underlined). The tab bar uses `.welcome-tabs` / `.welcome-tab` (active tab accent-highlighted).

**Help button:** a **❓ Help** button (`#helpButton`) sits in the topbar, left of the **Log out** button. Clicking it reopens the welcome/usage-guide modal at any time via `showWelcomeModal(state.guest)`, so users can revisit the guide after dismissing it — showing the correct variant (guest demo guide vs. regular first-run guide). It uses the same `.logout-btn` styling as the Log out button.

**Clickable menu & keyword references:** the menu names and page-referencing keywords inside the welcome modal (e.g. **My Accounts**, **My Portfolio**, **Assets**, **Dividends**, **Dashboard**, **Goals**, **Holdings**, **Providers**, **Accounts**, **asset account**) carry a `data-page` attribute. Clicking one closes the modal and navigates to that page via `showPage(el.dataset.page)`. The handler is wired in the `DOMContentLoaded` init (a listener over `#welcomeModalOverlay [data-page]`). Clickable references show a pointer cursor and a hover color change (`.welcome-text [data-page]`).

### Blur (privacy) feature

A privacy toggle that blurs **monetary values only**, so a user can show their portfolio and its distributions (percentages, quantities, dates stay readable) without revealing any actual monetary value.

- **Toggle:** a **🛡 privacy** button (`#blurButton`) sits in the topbar, **left of the refresh button**, grouped with it in a `.topbar-actions` flex container so the two always stay together. Clicking it toggles blur on/off. The **`H`** keyboard shortcut does the same (ignored while typing in an input/textarea/contentEditable, so it never interferes with data entry).
- **State:** module-level `blurMode` (bool) + `currentPage` (string, updated in `showPage`). `blurActive()` returns `blurMode && currentPage !== 'assets'`.
- **Assets page excluded:** blur never applies on the **Assets** page (it lists prices, not portfolio value). The privacy button still reflects the global toggle state, but no numbers are blurred there; navigating to any other page re-applies the blur.
- **Mechanism:** `applyBlur()` toggles a `blur-mode` class on `<body>` and the `.active` class on the privacy button, then calls `blurNumbers()`/`unblurNumbers()`. `blurNumbers()` walks text nodes and wraps the numeric part of each currency amount in a `<span class="blur-num">` (CSS `filter: blur(5px)`), leaving the currency symbol readable. `unblurNumbers()` replaces each span with a text node and then calls `root.normalize()` to merge adjacent text nodes back into a single node — this is essential so the currency symbol and amount are adjacent again and re-blurring works (without it, the amount becomes a bare number with no symbol and won't be re-blurred). A `MutationObserver` (`initBlurObserver`) re-applies the blur automatically after any re-render (e.g. `loadData()`/refresh), so it stays correct across page changes and data updates.
- **Currency-only detection:** the regex `BLUR_CURRENCY_RE = /([€$£¥₹₽₩₺₴₦฿₫₪₱₲₡₵₸₼₾₿¤])\s*(\d[\d.,]*)/g` matches a currency symbol followed by a number, and only the number is blurred. So `€23,733.29 · 24.4%` blurs only `23,733.29` (the `€` and `24.4%` stay readable), `$1,234.56` blurs `1,234.56`, while quantities (`10`), percentages (`+5.66%`), and other bare numbers are left untouched. Unblurring restores the exact original text (no `%` merge).
- **Styling:** `.topbar-actions` (flex container holding the two buttons), `.blur-btn` (mirrors `.refresh-btn`), `.blur-btn.active` (accent-filled when on), and `.blur-num` (`filter: blur(5px)`, `user-select: none`) in `css/portfolio.css`.

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
