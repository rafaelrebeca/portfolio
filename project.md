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
- **personal_assets** — `id`, `user_id`, `name`, `symbol`, `type` (same enum as `assets`), `price`, `coin`, `created_at`, `updated_at`. Per-user private assets (created by any member on the Assets page). A `trg_p_assets_updated` trigger bumps `updated_at` on changes.
- **dividends** — `asset_id` (PK), `dividend_yield` (percent, e.g. `0.52` = 0.52%)
- **dividend_payment_months** — `asset_id`, `month_paid` (1–12)
- **providers** — `id`, `user_id`, `name`, `type` (`bank`/`broker`/`other`), `created_at`
- **accounts** — `id`, `provider_id`, `name`, `type` (`loan`/`interest_account`/`bank_account`/`asset_account`), `balance`, `interest_rate`, `coin`
- **account_holdings** — `id`, `account_id`, `quantity`, `purchase_price`, `asset_id` (nullable, references `assets`), `personal_asset_id` (nullable, references `personal_assets`). A holding references **either** a platform asset (`asset_id`) **or** a personal asset (`personal_asset_id`), not both. Unique on `(account_id, asset_id, personal_asset_id)`.
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
| GET | `/api/assets` | member | List all platform assets **plus** the current user's personal assets (with dividend yield + payment months). Personal assets are flagged `is_personal: 1` and use their **real positive id** (the `is_personal` flag distinguishes them from platform assets). |
| POST | `/api/assets` | admin | Create platform asset |
| PUT/PATCH | `/api/assets/{id}` | admin | Update platform asset (name, symbol, type, price, coin, yield, months) |
| DELETE | `/api/assets/{id}` | admin | Delete platform asset + related holdings/dividends |
| POST | `/api/assets/{id}/price` | admin | **Fetch latest price from Massive.com** (see §7) |

### Personal Assets
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/personal-assets` | member | Create a personal asset (any logged-in user, incl. admin) |
| PUT/PATCH | `/api/personal-assets/{id}` | owner or admin | Update a personal asset (name, symbol, type, price, coin) |
| DELETE | `/api/personal-assets/{id}` | owner or admin | Delete a personal asset |

Personal assets are **scoped to the user** who created them (each user sees only their own). They are displayed on the Assets page in a dedicated **Personal Assets** tab (separate from the **System Assets** tab), with their name wrapped in `[]` when shown in holdings. They have no dividend yield/payment months, so they never appear on the Dividends page.

**Assets list action buttons** are icon-only (`.action-icon-btn`): **➕ Add to Account** (green `.add`, leftmost), **🔄 Update** (admin only), **✏️ Edit**, **🗑️ Delete** (Edit/Delete only when the user can manage the asset).

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
| GET/POST | `/api/holdings` | member | List / upsert holdings (platform **or** personal assets). `POST` with a `holding_id` **updates** that specific holding (ownership-checked) instead of upserting — this prevents duplication when editing a platform holding's quantity/price (the `ON CONFLICT(account_id, asset_id, personal_asset_id)` upsert does not match when `personal_asset_id` is NULL, since SQLite treats NULLs as distinct in unique constraints) |
| DELETE | `/api/holdings/{id}` | member | Delete own holding |

**Holdings with personal assets:** `POST /api/holdings` accepts the real positive `asset_id` plus an `is_personal` flag (`1`/`true`); the backend validates the personal asset belongs to the current user and stores it in `personal_asset_id`. `GET /api/holdings` returns personal holdings with `asset_id` set to the real `personal_asset_id` and an `is_personal: 1` flag, so the frontend resolves them with the same lookup as platform holdings and renders the `[name]` display.

### Goals
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET/POST | `/api/goals` | member | List / create-or-update goals (supports `sub1`/`sub2`/`sub3` and `order_by`) |
| POST | `/api/goals/reorder` | member | Reorder goals (body: `{ ids: [goalId, ...] }` in the new order; reassigns `order_by` 1..N) |
| DELETE | `/api/goals/{id}` | member | Delete own goal |

**Sub-goal validation (POST /api/goals):** `sub1`/`sub2`/`sub3` are optional numbers. Dependency chain is enforced server-side (`sub2` requires `sub1`; `sub3` requires `sub2`). Value-dependent rules also apply: for a debt goal (`value = 0`) sub-goals must be negative; for a positive goal they must be positive, `< target`, and ascending. Violations return a 400 error.

**Goal ordering (`order_by`):** goals have an `order_by` integer column (in `schema.sql` and the remote DB). The GET endpoint returns goals ordered by `order_by ASC, id ASC`. **Creating** a goal assigns `MAX(order_by) + 1` so it appears at the end. **Editing** a goal's content does **not** touch `order_by` — the UPDATE statement omits it, so the goal keeps its existing position. **Deleting** a goal renumbers the remaining goals (in `order_by ASC, id ASC` order) to 1..N so no gaps are left. `order_by` otherwise only changes via the **↑ / ↓ arrow buttons** (`.goal-order-btn`, disabled at the first/last position) on each goal card: clicking an arrow swaps the goal with its neighbor and reassigns sequential `order_by` values (1..N), then persists via `POST /api/goals/reorder` (or updates `guestData.goals` in guest mode).

### Admin
| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/admin/users` | admin | List users |
| POST | `/api/admin/users` | admin | Create user |
| POST | `/api/admin/users/{id}/password` | admin | Reset user password |
| PATCH | `/api/admin/users/{id}/role` | admin | Change user role (cannot change own) |
| POST | `/api/me/password` | member | Self-service password reset (Profile page) |
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
1. Admin clicks the **🔄 Update** icon button on an asset row (Assets page).
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
- **Normal goal (value > 0) with sub-goals** → the bar is split into segments running `0 → sub1 → sub2 → sub3 → target`. Each segment's **width** is proportional to the value range it represents, and each segment's **fill** = `(current − segment_start) / (segment_end − segment_start)`, clamped 0–100% (progress within the segment's own range). The global completion % label is still shown at the right, and a **`.goal-sub-label`** below the bar shows the **active sub-goal** (the next milestone not yet reached) and its progress %. When the active milestone is a **sub-goal**, the label also shows the sub-goal's value in parentheses (e.g. `Sub-goal 1: 80.0% (€1,500.00)`); when it's the **Sub-target**, no value is shown (e.g. `Sub-target: 20.0%`).
  - Example: target=40000, sub1=20000, sub2=30000, sub3=38000, current=36188 → seg1 = 100%, seg2 = 100%, seg3 = 77%, seg4 = 0%.
- **Debt goal (value = 0) with sub-goals** → the bar stays a single "debt cleared" bar, and each sub-goal amount is shown as a **diamond tick mark** along the bar. Marks count down from 100% (the goal/zero): position = `(total debt − |sub-goal|) / total debt × 100`. E.g. a sub-goal of `-5000` against `100000` debt sits at 95%; `-95000` sits at 5%. Each mark shows a custom tooltip (via `data-tip`) with its value on hover.

The same `goalProgressHTML` helper is used by both the goal cards (`renderGoals`) and the goal details modal (`openGoalDetailsModal`).

**Goal card action buttons** are icon-only (`.action-icon-btn`, with `title` tooltips): `ℹ️` Details, `📈` History, `⚡` Simulate, `📄` Duplicate, `✏️` Edit, `🗑️` Delete. The **History** button (`data-goal-history`) is only rendered when the user has snapshots (`timeTravelList.length > 0`). The Simulate button uses a **lightning bolt** (`⚡`) so the **▶** play icon is reserved for the Time Travel "play through snapshots" button.

**Goal History modal** (`#goalHistoryModalOverlay`): opened by `openGoalHistoryModal(goalId)`, closed by `closeGoalHistoryModal()`, maximized by `toggleGoalHistoryMaximize()`. It shows a Chart.js **line chart** (`#goalHistoryChart`) of the goal's **progress percentage (0–100%)** over time, computed from the **accounts stored in each snapshot** (snapshots are unchanged — no goal data is added to them). `goalProgressFromSnapshot(goal, snapshotAccounts)` mirrors `goalProgressHTML`: for a **normal goal** it sums the linked accounts' `valueEur` and divides by the target; for a **debt goal** (target 0) it uses `positive-sum / absolute-negative-sum`. The y-axis is fixed to 0–100 with `%` tick labels, and the zoom select (`#goalHistoryZoom`) reuses `applyHistoryZoom`.

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
- **Change vs previous snapshot:** On the main dashboard (live or in Time Travel, manual or play), the **Global Value** and **Debit / Credit** cards append the change from the previous snapshot in parentheses, e.g. `€100 (+€20.00)` / `€100 (-€20.00)` / `€100 (±€0.00)`. `getPreviousSnapshotData()` returns the snapshot immediately before the current view — in Time Travel the next **older** snapshot in the newest-first `timeTravelList` (null when viewing the **oldest**); on the live dashboard the **most recent snapshot that is NOT from today** (a same-day snapshot is ignored because it reflects the same live state, falling back to the next older one; null when there is no such snapshot). `todayDayString()` computes the current UTC date as `YYYYMMDD` to match the snapshot `day` format. `formatDelta(delta)` renders the signed delta as a `.value-delta` span containing a `.delta-sign` (the `(+` / `(-` / `(±` prefix) and a `.delta-num` (the amount). No delta is shown on the oldest snapshot or when there are no snapshots. Guest mode resets `timeTravelList = []` in `loadData()` so no delta ever shows. The `.value-delta` is an `inline-block` with `white-space: nowrap` and `max-width: 100%`, so the sign and amount wrap **together** onto the next line (the prefix never stays behind); `.delta-num` has `overflow-wrap: anywhere` so an extremely long amount can still break within itself. The delta is **colored by sign**: `.value-delta.zero` = white (`--text`), `.value-delta.pos` = light blue (`#7ab8ff`), `.value-delta.neg` = orange (`--warn`).
- `byType` — asset-type allocation in EUR (incl. Loans/Cash/Deposits), same as the **By Type** chart.
- `byProvider` — per-provider value in EUR, same as the **By Provider** chart.
- `accounts` — per-account EUR value + name/type/provider, same as the **Account Overview** grid.

**Backend:** routes in `functions/api/[[path]].js` (see §6). All require a logged-in user (`requireUser`). `POST /api/snapshots` computes `day` from the current UTC date and upserts; `GET /api/snapshots` lists the user's snapshots newest-first; `GET/DELETE /api/snapshots/{day}` fetch/delete a specific day.

**Frontend (`js/portfolio.js`):**
- **Time Travel controls** on the Dashboard header (right of the page title): a **←** previous button (`#timeTravelPrevBtn`), the **🕰** Time Travel button (`#timeTravelBtn`, **icon-only**), four **icon-only** shortcut buttons, and a **→** next button (`#timeTravelNextBtn`). All seven buttons are wrapped in a **card** (`.time-travel-controls` has a border, background, padding, and rounded corners) so they read as one compact control group without taking much extra space. The controls and the viewing banner are wrapped together in a `.time-travel-group` flex container (banner on the left, controls card on the right) with `flex-wrap: wrap`, so on narrow/low-resolution screens the controls card **flows below** the banner instead of overflowing. The `.page-head` also has `flex-wrap: wrap` so the whole group wraps below the page title. Shown to logged-in users, hidden in guest mode. The **←**/**→** arrows let the user quickly move between snapshots. **←** goes to the previous (older) snapshot; when not viewing a snapshot it **enters Time Travel** at the most recent snapshot (active whenever the user has at least one snapshot). **→** goes to the next (newer) snapshot; when on the most recent snapshot it stays **active** and clicking it **exits Time Travel** back to the live dashboard. Each arrow is **disabled** only when there is no snapshot in that direction (the **→** is disabled only when the current snapshot is not found in the list). The cached snapshot list (`timeTravelList`, newest-first) drives the arrow states via `updateTimeTravelArrows()`; `goToPrevSnapshot()` / `goToNextSnapshot()` perform the navigation. The list is loaded on app load via `loadTimeTravelList()` (called from `loadData()`) so the arrows are correct before the modal is ever opened.
  - **Icon shortcuts** (between the Time Travel button and the **→** arrow, styled `.icon-btn`): **💾** (`#timeTravelSaveBtn`) saves today's snapshot (calls `saveSnapshot`); **📈** (`#timeTravelHistoryBtn`) opens the history modal (`openHistoryModal`); **📅** (`#timeTravelCalendarBtn`) opens the standalone calendar modal (`openCalendarModal`); **▶** (`#timeTravelPlayBtn`) **plays through the snapshots** (see below).
  - **Play through snapshots** (`#timeTravelPlayBtn`, **▶**): `timeTravelPlay()` starts at the **oldest** snapshot (last in the newest-first `timeTravelList`) and every **2 seconds** advances to the next (newer) one via `scheduleTimeTravelPlay()` (a recursive `setTimeout` that waits for each `viewSnapshot` to finish, so ticks never overlap). After showing the **most recent** snapshot for 2s it **exits Time Travel** back to the live dashboard. The button is **disabled** when the user has no snapshots (`timeTravelList.length === 0`). Playback is stopped (`stopTimeTravelPlay()`) by any manual navigation (`goToPrevSnapshot` / `goToNextSnapshot`), by `exitTimeTravel()`, and when the Time Travel, calendar, or history modal is opened. Clicking **▶** while already in Time Travel (or mid-playback) restarts from the oldest snapshot.
- **Time Travel modal:** shows **only the snapshot list** with the paging system — the save/history/calendar buttons were removed (they now live on the dashboard header). The snapshot list (`#snapshotList`) shows each day with **View** and **Delete** buttons. **Delete** uses the existing `confirmDialog` and calls `DELETE /api/snapshots/{day}`; it is disabled for the snapshot currently being viewed. The modal has a header **✕** close button (`#closeTimeTravelBtn`).
  - **Paging:** the snapshot list is **paginated at 5 snapshots per page** (`SNAPSHOTS_PER_PAGE`), ordered **descending by date** (newest first, as returned by the API). `renderSnapshotPage()` slices the current page from `timeTravelList` and renders it; `renderSnapshotPagination()` draws the **← / "Page X of Y" / →** controls (`#snapshotPagination`), hidden when there is only one page. Page state is tracked in module-level `snapshotPage` (0-based), clamped to valid bounds.
  - **Clean Months / Clean Years:** two buttons at the bottom of the modal — **🧹 Clean Months** (`#cleanMonthsBtn`) and **🧹 Clean Years** (`#cleanYearsBtn`). Both call `cleanSnapshots(mode)` in `js/portfolio.js`, which first shows a `confirmDialog` (with a **Clean** confirm label) explaining the action, then POSTs to the API, shows a toast with the number of deleted snapshots (or "Nothing to clean."), and refreshes the list + re-renders. If a snapshot is currently being viewed, Time Travel is exited first.
    - **Clean Months** → `POST /api/snapshots/clean-months`: keeps only the **most recent snapshot per month** (by day) for all months **except the current month**, which is left untouched.
    - **Clean Years** → `POST /api/snapshots/clean-years`: keeps only the **most recent snapshot per year** for all years **except the current year**, which is left untouched.
    - Both endpoints live in `functions/api/[[path]].js`. They query the user's snapshots (excluding the current month/year prefix), keep the first (most recent) day per `YYYYMM` / `YYYY` prefix, and delete the rest one-by-one, returning `{ ok, deleted }`.
- **Standalone calendar modal:** the **📅** icon shortcut (`#timeTravelCalendarBtn`) opens a dedicated modal (`#calendarModalOverlay`) showing **only the calendar** — no snapshot list, save/history buttons, or pagination. `openCalendarModal()` resets to the current UTC month, clears the picker state, opens the modal, and renders the calendar into `#calendarModalBody` (reusing `renderSnapshotCalendar(container)`). It has a header **✕** close button (`#closeCalendarBtn`). The calendar supports the same **year/month picker** as before: clicking the **month/year label** (e.g. "August 2026", `#calMonthLabel`) toggles a picker (`calendarPicker`) with a year stepper (**← / →**, `#calPickerYearPrev` / `#calPickerYearNext`) and a 3-column grid of the 12 months (`.cal-picker-grid` / `.cal-picker-month`, current month highlighted `.cal-picker-current`); picking a month returns to the day grid. All recursive re-renders pass the container so the picker works inside the standalone modal. Days with a snapshot are **blue** (`.cal-has-snapshot`, accent-filled) and clickable to **View** that day's snapshot (`viewSnapshot`); days without a snapshot are **white** (`.cal-day`, panel background) and disabled. **← / →** buttons (`#calPrevMonth` / `#calNextMonth`) change the displayed month (wrapping across year boundaries).
- **History modal (line chart):** a **📈 History** button (`#historyBtn`) in the Time Travel modal opens the history modal (`#historyModalOverlay`). It has two combo boxes — **Chart type** (`#historyChartType`: Global / By Type / By Provider) and **Zoom** (`#historyZoom`: All / Monthly / Yearly) — and a Chart.js **line chart** (`#historyChart`). On open, a loading spinner (`#historyLoading`) is shown while all snapshot data is fetched (`loadHistoryData()` → `historyData`), then hidden once the chart renders. The full snapshot data is only loaded here (not elsewhere), and is cleared on close (`closeHistoryModal()` destroys the chart and nulls `historyData`). A **maximize** button (`#maximizeHistoryBtn`, ⛶) to the left of the close button toggles the modal to fullscreen (`toggleHistoryMaximize()` adds a `maximized` class to the overlay; the chart resizes to fill the space).
  - **Chart type:** **Global** plots three lines — `globalValue`, `debit`, `credit`. **By Type** plots one line per asset type from each snapshot's `byType`. **By Provider** plots one line per provider from each snapshot's `byProvider`.
  - **Zoom:** **All** uses every snapshot. **Monthly** keeps only the most recent snapshot of each month. **Yearly** keeps only the most recent snapshot of each year. Applied by `applyHistoryZoom()` (snapshots are newest-first, so the first per month/year is kept). The chart x-axis is chronological (oldest → newest).
- **Account history modal (per-account chart):** on the live Dashboard, each **Account Overview** card (`renderDashboardAccounts()`) becomes **clickable** (`.account-card.clickable`, with a `data-account-history` attribute and a "View account history" tooltip) **only when the user has at least one snapshot** (`timeTravelList.length > 0`). Clicking a card opens the account history modal (`#accountHistoryModalOverlay`), which mirrors the Snapshot History modal's design: a **maximize** button (`#maximizeAccountHistoryBtn`, ⛶) and a **close** button (`#closeAccountHistoryBtn`, ✕) in the header, a **Zoom** select (`#accountHistoryZoom`: All / Monthly / Yearly), a loading spinner (`#accountHistoryLoading`), a Chart.js **line chart** (`#accountHistoryChart`), and an empty state (`#accountHistoryEmpty`). The title shows the account name (e.g. "📈 Cash — History"). On open, `openAccountHistoryModal(accountId)` fetches all snapshots (`/snapshots`), then `renderAccountHistoryChart()` plots the selected account's `valueEur` from each snapshot's `accounts` array over time (chronological x-axis, `spanGaps: true` for snapshots where the account wasn't present). `closeAccountHistoryModal()` destroys the chart and clears the loaded data. The maximize/restore behavior (`toggleAccountHistoryMaximize()`) and CSS mirror the history modal.
- **Viewing a past snapshot:** `viewSnapshot(day)` sets the module-level `timeTravelSnapshot` and re-renders. `render()` checks `timeTravelActive()`: when true, the dashboard is rendered from the snapshot via `renderDashboardFromSnapshot(data)` (cards, charts + legends, account overview) instead of live state, and a banner (`.time-travel-banner`, id `#timeTravelBanner`) shows just the snapshot **date** (e.g. "Aug 17, 2026") with an **✕** icon button (`#exitTimeTravelBtn`, `title="Exit Time Travel"`) to exit. The banner sits **to the left of the Time Travel controls card** (inside the `.time-travel-group` flex container) and is **sized to its own content** (`width: max-content`, `white-space: nowrap`), not full-width. **Exit Time Travel** (`exitTimeTravel()`) clears the snapshot and re-renders live. Other pages (Assets, Dividends, My Accounts, My Portfolio, Goals) still render live while a snapshot is being viewed. The two dashboard doughnut charts recreated by `renderDashboardFromSnapshot` (the **By Type** `allocationChart` and **By Provider** `accountTypeChart`) set `animation: false` (matching the live dashboard render), so they update **instantly** when entering Time Travel or moving between days — no refill animation — making day-to-day differences easy to compare.
- **Snapshot collection:** `collectDashboardSnapshot()` mirrors the live dashboard computation (`render()`, `renderCharts()`, `renderDashboardAccounts()`) into the payload.
- **Guest mode:** no snapshots for guests (no `user_id`); the Time Travel controls are hidden.

**Styling (`css/portfolio.css`):** `.time-travel-group` (flex container holding the banner + controls card, `flex-wrap: wrap`), `.time-travel-controls` (flex row for the arrows + buttons, styled as a compact **card** with border, background, padding, and rounded corners), `.time-travel-controls .icon-btn` (compact icon-only shortcut buttons), `.time-travel-banner` (accent-tinted banner with the exit button, `width: max-content` so it is sized to its own content), `.nav-toggle` (hamburger menu button, hidden on desktop, shown on mobile), `.snapshot-row` (list rows with day, meta, and View/Delete actions), `.snapshot-pagination` (centered flex row with the page indicator), `.snapshot-calendar` (calendar popup with `.cal-head`, `.cal-grid`, `.cal-cell`, `.cal-weekday`, `.cal-day`, `.cal-has-snapshot` for blue snapshot days, `.cal-month-btn` clickable month/year label, `.cal-picker-grid` / `.cal-picker-month` / `.cal-picker-current` for the year/month picker), `.history-controls` (flex row for the two combo boxes), `.history-loading` + `.spinner` (loading animation).

---

## 8. Frontend (`js/portfolio.js`)

- **State:** `state` object holds `user`, `guest`, `assets`, `providers`, `accounts`, `holdings`, `users`, `currencies`, `goals`. Module-level `timeTravelSnapshot` holds the active snapshot being viewed (null = live dashboard); see §7d.
- **Guest mode:** `guestData` provides mock data; `state.guest` is true. Guest changes are local-only and not persisted.
- **Helpers:** `$` (querySelector), `esc` (HTML escape), `numeric`, `request` (fetch wrapper that throws on non-OK), `toast`, `openModal`/`closeModal`/`closeAllModals`, `confirmDialog` (Promise-based custom confirm modal), `isWriteAllowed`, `isAdminUser`.
- **Currency:** `getExchangeRate`, `convertToEUR`, `convertToCurrency`, `formatCurrency` — rates are relative to USD. `accountValue(acc, convertToEur)` returns an account's value: with `convertToEur=true` it converts to EUR; otherwise it converts to the **account's display currency** (`acc.coin`). For asset accounts, **each holding's value is converted to the target currency individually before summing** — so an account can hold assets in different coins (e.g. EUR + AED) and the total is still correct. For non-EUR/non-USD currencies the conversion goes through USD first (e.g. AED → USD → EUR).
- **`convertToCurrency(amount, fromCoin, toCoin)`** — generic conversion between any two coins (the future replacement for `convertToEUR`, which is kept as-is for now). Handles: `fromCoin === toCoin` (returns `amount`), `fromCoin === 'USD'` (uses the stored `toCoin` rate directly), `toCoin === 'USD'` (divides by the stored `fromCoin` rate), and neither being USD (converts `fromCoin → USD → toCoin`). If a rate is missing it falls back to returning `amount`. It is exercised by the admin-only **Currency Test** tab on the **Tools** page (see §8).
- **Data loading:** `loadData()` fetches all collections in parallel via `Promise.all`, then calls `render()`.
- **Rendering:** `render()` dispatches to per-page renderers: `renderDashboardAccounts`, `renderCharts`, `renderPortfolioCards`, `renderPortfolioCharts`, `renderAssets`, `renderDividends`, `renderAccounts`, `renderHoldings`, `renderGoals`, `renderUsers`, plus `fillDividendPeriodValue()`, `updateToggleAllLabel()`, and `fillSelects()`. The Assets page is split into two tabs: `renderAssets()` dispatches to `renderSystemAssets()` / `renderPersonalAssets()` via `switchAssetTab()` (see the "Assets page (two tabs)" subsection). The holdings table sort is handled by `sortHoldings`, `holdingSortRow`, `setHoldingsSort`, and `renderHoldingsSortIndicators` (see the "My Portfolio holdings table (sortable)" subsection).
- **Charts:** Chart.js instances are cached in module-level variables (`allocationChartInstance`, `goalSimChartInstance`, etc.) and destroyed/recreated on re-render.
- **Modals:** `openAssetModal`, `openUpdateAssetModal`, `openBulkUpdateModal`, `openProviderModal`, `openAccountModal`, `openHoldingModal`, `openGoalModal`, `openGoalDetailsModal`, `openGoalSimModal`, `openAccountDetailsModal`, `openProviderDetailsModal`, plus the first-run **welcome modal** (`#welcomeModalOverlay`, see the "First-run welcome / usage guide modal" subsection below). Modals are capped at `calc(100vh - 48px)` with `overflow-y: auto` so tall content (e.g. many linked accounts) scrolls instead of overflowing the screen. Pressing **Escape** closes any open modal without saving (`closeAllModals`). While any modal is open, background scrolling is locked: `openModal`/`closeModal`/`closeAllModals` call `syncBodyScrollLock()`, which toggles a `modal-open` class on `<body>` (`body.modal-open { overflow: hidden }`). The modal's own content still scrolls independently. Every modal has a header **✕** close button (`.modal-head` + `.modal-close`, e.g. `#closeAssetModalX`, `#closeWelcomeBtn`, `#closeTimeTravelBtn`). Modals that previously had a redundant footer **Close** button (update asset, update all prices, goal sim, goal details, account details, provider details) now close only via the header **✕**; footer buttons remain only where they are real form actions (e.g. **Cancel** on form modals, **Simulate** on the goal simulator/details).
- **Goal sub-goals:** `goalProgressHTML` (segmented/marked progress bar), `updateGoalSubGating` + `filterSubInput` (character filtering while typing), `validateGoalSubs` (save-time validation).
- **Goal simulator:** `openGoalSimModal`, `goalSimData`, `runGoalSimulation` — a modal (`#goalSimModalOverlay`) that projects goal progress over time given a monthly contribution, rendered as a Chart.js line chart (`#goalSimChart`).
- **Bulk price update:** `bulkUpdateEligibleAssets`, `openBulkUpdateModal`, `runBulkUpdate`, `setBulkUpdateProgress`, `appendBulkUpdateLog` (see §7a).
- **Event handling:** A single delegated click handler on `document` routes clicks via `data-*` attributes. Full set of handled attributes: `data-account-details`, `data-add-account-provider`, `data-delete-account`, `data-delete-asset` (with `data-delete-asset-personal`), `data-delete-goal`, `data-delete-holding`, `data-delete-provider`, `data-delete-user`, `data-duplicate-goal`, `data-edit-account`, `data-edit-asset` (with `data-edit-asset-personal`), `data-edit-goal`, `data-edit-holding`, `data-edit-provider`, `data-goal-details`, `data-legend-label`, `data-provider-details`, `data-remove-goal-account`, `data-reset-password-user`, `data-role-user`, `data-simulate-goal`, `data-tip`, `data-toggle-provider`, `data-update-asset`, `data-username`. The `*-personal` companion attributes carry the `is_personal` flag so the handler can disambiguate assets that share a numeric id.

### Pages (sidebar navigation)
The sidebar is organized into four labeled sections, in this order: **Personal** (Dashboard, Goals, My Portfolio, My Accounts), **System** (Assets, Dividends, Currency), **Account** (Profile), and **Admin** (Tools, Users — admin-only).

**Profile page:** a **👤 Profile** nav item (`#navProfile`, `data-page="profile"`) sits at the bottom of the sidebar under an **Account** section label. The page (`#page-profile`) shows the user's **username** (`#profileUsername`) and **user type** (`#profileRole`), populated by `renderProfile()` (called from `showApp()` and `render()`). It also has **New password** / **Confirm new password** fields and a **Reset password** button (`#profileResetPasswordBtn`). `resetProfilePassword()` validates the password (≥8 chars, matching), then POSTs to `POST /api/me/password` (a self-service endpoint in `functions/api/[[path]].js` that updates the logged-in user's own password via `requireMember`). For guests it shows a "Password reset simulated." toast. On success it clears the fields and shows "Password reset successfully."

**Currency page:** a **💱 Currency** nav item (`#navCurrency`, `data-page="currency"`) sits in the sidebar under a **System** section label (below the **Account** section). The page (`#page-currency`) shows **two ratio cards side by side** at the top (wrapped in `.currency-ratio-cards`, a `flex` container with `justify-content: center`, `gap: 16px`, and `flex-wrap: wrap` so the cards flow down on small screens; each card is `flex: 0 1 300px` with `max-width: 420px` — `flex-grow: 0` keeps the two cards centered together as a group on wide screens instead of stretching apart): a **USD → EUR** card (`#currencyUsdEur`, e.g. `1 USD = 0.8632 EUR`, computed as `eur.value / usd.value`) and a **EUR → USD** card (`#currencyEurUsd`, e.g. `1 EUR = 1.1585 USD`, the inverse `1 / (eur.value / usd.value)`). Both are populated in `renderCurrency()` from `state.currencies`. Below the cards is a **centered** search box (`#currencySearch`, styled with the shared `.search-input` class; its `.toolbar` wrapper uses `justify-content: center`), and a table (`#currencyTable`) listing every currency with its **Rate (per 1 USD)** and **Rate (per 1 EUR)**. `renderCurrency()` (called from `showApp()` and `render()`) filters out the **USD** and **EUR** rows from the list and supports live search by code (case-insensitive substring match on `c.coin`); an empty result shows "No currencies found." The **Rate (per 1 EUR)** is computed by converting through USD first: `c.value / eur.value` (where `c.value` is the rate per 1 USD and `eur.value` is the USD value of 1 EUR). The search input is wired via `$('#currencySearch')?.addEventListener('input', () => { currencyPage = 0; renderCurrency(); })`.

**Currency table pagination:** the currency list is **paginated at 20 rows per page** (`CURRENCIES_PER_PAGE = 20`, tracked by `currencyPage`). `renderCurrency()` filters the **full dataset** first, then slices the current page (`filtered.slice(start, start + CURRENCIES_PER_PAGE)`), so **search always applies to all currencies**, not just the current page. Pagination controls (`#currencyPagination`, reusing the `.snapshot-pagination` styling) show **← / page number buttons / →**, with the current page highlighted via the `.currency-page-btn.active` class (accent background, white text). The pagination is **fully adaptive to the available width**: it shows **all page numbers** when they fit on one line, falls back to a **windowed view** (current page + neighbors, far-away pages collapsed into an ellipsis `…` via `.currency-page-ellipsis`) when they don't, and to **arrows-only** (`← / →`) on very narrow screens. `renderCurrencyPagination()` renders the largest of the three modes (`all` / `windowed` / `arrows`, built by `buildPaginationHTML`) that fits, measuring the **actual rendered content width** via `paginationContentWidth()` (sum of child widths + the flex gap — more reliable than `scrollWidth` for a centered flex row) against the container's `clientWidth`. The pagination uses `flex-wrap: nowrap` so content never wraps to a second line. A `window` `resize` listener re-runs `renderCurrency()` while the Currency page is active, and `showPage('currency')` re-renders it once the page is visible (it can't be measured correctly while hidden), so it keeps adapting as the window is resized. For 9 pages at page 5: `all` needs ~421px, `windowed` ~301px, `arrows` ~86px. The controls sit **between the search box and the table** (better for small screens), with a small `margin-bottom` (`#currencyPagination`) so they don't touch the table, and are hidden when there's only one page. Searching resets `currencyPage` to 0 so results always start at page 1.

**Responsive nav dropdown:** on screens ≤ 760px the sidebar is hidden by default and a **☰ hamburger button** (`#navToggle`, `.nav-toggle`) appears in the topbar. When opened, the sidebar is `position: absolute` (relative to the `.layout`, which becomes `position: relative`) with `z-index: 50`, a solid `--panel` background, a drop shadow, and `max-height: calc(100vh - 60px)` with vertical scroll — so it **overlays on top of the page content** instead of pushing it down. The section labels (Personal/System/Account/Admin) are shown on mobile too. Clicking it toggles the `.open` class on the sidebar (`.sidebar.open`), which shows the nav items as a dropdown panel below the topbar. Selecting a nav item closes the dropdown (`closeNavDropdown()`). The toggle updates its `aria-expanded` attribute for accessibility.

**My Accounts** is a merged page combining providers and their accounts. It lists providers as **provider cards** (`.provider-card`), each with a styled header (`.provider-card-head`) showing a collapse toggle, provider icon, name, type tag, account count, the provider's **total value in EUR** (`.provider-total`, via `providerValue`), and icon-only action buttons (`.action-icon-btn`): **➕ Add Account** (green `.add`, leftmost), **ℹ️ Details**, **✏️ Edit**, **🗑️ Delete**. The body (`.provider-card-body`) contains the accounts nested inside so they visually belong to the provider. Each **account card** also uses icon-only buttons: **ℹ️ Details** (asset accounts with holdings only), **✏️ Edit**, **🗑️ Delete**.

- **Account value display:** every account card shows its value on the **left** of the detail grid (asset accounts show **Value** then **Holdings**; loan/interest accounts show **Balance** then **Interest Rate**; bank accounts show **Balance**). When an account's currency is not EUR, the converted **EUR value is shown in parentheses** after the value (e.g. `$1,234.56 (€1,050.00)`).

- **Collapse/expand:** each provider can be minimized/expanded via the toggle button (`data-toggle-provider`), hiding/showing its accounts. Collapsed state is tracked in the module-level `collapsedProviders` Set and persisted across re-renders (cleared when a provider is deleted).
- **Collapse/Expand All:** the toolbar's **Collapse All** / **Expand All** button (`#toggleAllProvidersBtn`) collapses or expands every provider at once. Its label is kept in sync by `updateToggleAllLabel()`.
- **+ Add Account (per provider):** opens the account modal with that provider preselected and the provider dropdown hidden (`openAccountModal(null, providerId)`), so no provider selection is needed.
- **Account Details (asset breakdown):** any **asset account** that has holdings shows a **Details** button (`data-account-details`). Clicking it opens `openAccountDetailsModal(accountId)` — a modal (`#accountDetailsModalOverlay`) with a summary (holdings count + value) and a **doughnut chart** (`#accountDetailsChart`) of the account's assets, showing the **top 9 + Others** ordered descending (via `topNWithOthers`), with a legend (`#accountDetailsLegend`) listing each asset's value and % share. Below the chart, an **"Others" table** (`#accountDetailsOthersTable`) lists each asset grouped into the Others slice with its **Ticker, Value and %** (hidden when there are no others). All values are converted to **EUR** via `convertToEUR` (consistent with the dashboard/portfolio charts), regardless of the account's or asset's currency.
- **Provider Details (account breakdown):** every provider card shows a **Details** button (`data-provider-details`). Clicking it opens `openProviderDetailsModal(providerId)` — a modal (`#providerDetailsModalOverlay`) with a summary (account count + total value) and a **doughnut chart** (`#providerDetailsChart`) of the provider's accounts, showing the **top 9 + Others** ordered descending (via `topNWithOthers`), with a legend (`#providerDetailsLegend`) listing each account's value and % share. Below the chart, an **"Others" table** (`#providerDetailsOthersTable`) lists each account grouped into the Others slice with its **Account, Value and %** (hidden when there are no others). All values are converted to **EUR** via `accountValue(acc, true)`.
- The toolbar groups **+ New Provider** and **+ New Account** together on the right. The **+ New Account** button is **disabled** (but visible) when the user has no providers, with a tooltip "Create a provider first."
- **Dividends** page (`renderDividends`) lists only assets with a **real dividend yield** — i.e. `dividend_yield` is set **and** `> 0`. Assets with a `0` yield (or no yield) are excluded. The page can be filtered by payment period (month / trimester / semester) via `#dividendPeriodType` + `#dividendPeriodValue`.

**Assets page (two tabs):** the **📈 Assets** page (`#page-assets`) is split into **two tabs** (`.asset-tabs` / `.asset-tab`, mirroring the Tools menu pattern) so system and personal assets are managed separately — this removed the old negative-id trick that merged them into one table.
- **📈 System Assets** tab (`#asset-panel-system`, active by default): shows platform assets in `#systemAssetsTable`, with its own search (`#systemAssetSearch`) and type filter (`#systemAssetTypeFilter`). The admin-only **+ New Asset** (`#newAssetBtn`) and **↻ Update All Prices** (`#updateAllPricesBtn`) buttons live here.
- **👤 Personal Assets** tab (`#asset-panel-personal`): shows the current user's personal assets in `#personalAssetsTable`, with its own search (`#personalAssetSearch`), type filter (`#personalAssetTypeFilter`), and the **+ New Personal Asset** button (`#newPersonalAssetBtn`).
- **Tab switching:** `switchAssetTab(tab)` toggles the `.active` class on the tabs and the `display` of the panels, and re-renders the active tab. The active tab is tracked in `activeAssetTab` (`'system'` or `'personal'`). `renderAssets()` dispatches to `renderSystemAssets()` or `renderPersonalAssets()` based on the active tab.
- **Permissions:** system assets are admin-managed (edit/delete/update only for admins); personal assets are manageable by their owner or an admin. The `#newAssetBtn`/`#updateAllPricesBtn` carry the `admin-action` class (admin-only); `#newPersonalAssetBtn` carries `write-action` (any logged-in member).
- **No per-row "Add to Account":** the asset lists no longer show a **➕ Add to Account** button on each row. Adding an asset to the portfolio is done only from the **My Portfolio** page via the **+ Add Holding** button (which opens the holding modal with the full asset dropdown). The `data-add-asset-to-account` handler and `openHoldingModal`'s pre-selected-asset parameter were removed.
- **ID disambiguation:** personal and platform assets can share the same numeric `id`, so the frontend never matches on `id` alone. The `findAsset(id, isPersonal)` helper matches on both `id` and the `is_personal` flag, and is used for all asset lookups (edit/delete, holding rendering, holding modal). The holding modal's asset `<select>` encodes each option as `"<id>|<is_personal>"` so a personal and platform asset with the same id are distinct options; the holding form parses that composite value back into `asset_id` + `is_personal` on submit.

**My Portfolio holdings table (sortable):** the holdings table (`#holdingsTable`, rendered by `renderHoldings()`) is **sortable by any column** by clicking its header. The **Action** column is not sortable. Sortable headers carry a `class="sortable"` and a `data-sort` attribute (`asset`, `account`, `quantity`, `purchase_price`, `market_value`, `gain_pct`, `gain_value`); the active column shows a **▲/▼** indicator (`.sort-arrow`). Clicking a header toggles ascending/descending; clicking a different header switches the sort field (defaulting to ascending).

- **Sort state:** module-level `holdingsSort = { field, dir }` (`dir` is `1` asc / `-1` desc, `null` = natural order). `setHoldingsSort(field)` toggles the direction when re-clicking the same column and re-renders. `renderHoldingsSortIndicators()` moves the ▲/▼ arrow to the active header.
- **Sorting logic:** `sortHoldings(holdings)` builds a sortable row per holding via `holdingSortRow(h)` (resolving the same display values the table shows — symbol, account name, quantity, purchase price, market value `price × quantity`, gain % and gain €), then sorts. **Special case for Account:** when sorting by `account`, the **secondary key is always asset ascending**, regardless of the account direction — so Account **ascending** sorts account asc then asset asc, and Account **descending** sorts account desc then asset asc. All other columns sort normally on their single field. Numeric columns place rows with missing values (`null`/`—`) at the end.
- **Interaction with filters:** the sort is applied **after** the portfolio filter (`portfolioFilter`) narrows the holdings, so it sorts only the currently filtered rows. The sort persists across re-renders (e.g. data refresh) until the user changes it.

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

- **Page 1 — Getting Started:** the numbered 5-step usage guide:
  1. **Add a Provider** — go to the **My Accounts** menu and create a provider (bank / broker / other).
  2. **Add an Account** — inside that provider, create an account (e.g. an **asset account** to hold investments).
  3. **Unlock Goals** — **Goals** are unlocked once at least **1 account** is created.
  4. **Unlock My Portfolio, Assets & Dividends** — once an **asset account** is created, the **My Portfolio**, **Assets** and **Dividends** menus unlock, allowing the user to add **Holdings / Assets** to their portfolio on any existing asset account.
  5. **Track Personal Assets** — on the **Assets** page, click **+ New Personal Asset** to track something that isn't a platform security. Personal assets are private to the user's account and their names are shown in `[]`.
- **Page 2 — Privacy & Time Travel:** describes that the user's data is **private** to their account (no other user can see it; guests only see demo data), that pressing **H** hides the values on screen from people nearby (the blur/privacy feature, see below), and the **Time Travel** snapshot feature (save a snapshot of today's dashboard, view past days, one snapshot per day, delete any snapshot).

The footer has **← Back** (`#welcomeModalPrev`), **Next →** (`#welcomeModalNext`), and **Got it, let's start** (`#welcomeModalOk`) buttons; Back/Next switch pages and the OK button (shown on the last page) calls `closeModal('welcomeModalOverlay')`. The modal also has a header **✕** close button (`#closeWelcomeBtn`). `showWelcomeModal()` resets to page 1 on open.

**Styling** (`.welcome-modal` in `css/portfolio.css`): the modal uses a step layout with numbered circular badges (`.welcome-num`), a title (`.welcome-title`) and body text (`.welcome-text`). Key terms are emphasized with color + bold + underline via the `.kw` classes (`.kw-provider`, `.kw-account`, `.kw-asset`, `.kw-goal`, `.kw-portfolio`, `.kw-assets`, `.kw-dividends`, `.kw-holding`, `.kw-guest`), and menu names use the `.menu` class (accent-colored, bold, underlined). The tab bar uses `.welcome-tabs` / `.welcome-tab` (active tab accent-highlighted).

**Help button:** a **?** icon button (`#helpButton`) sits in the topbar, left of the **Log out** button. Clicking it reopens the welcome/usage-guide modal at any time via `showWelcomeModal(state.guest)`, so users can revisit the guide after dismissing it — showing the correct variant (guest demo guide vs. regular first-run guide). It uses the same `.logout-btn` styling as the Log out button.

**Compact topbar:** the topbar is kept minimal — the **role pill** (`#rolePill`) and **username label** (`#usernameLabel`) were removed, and the **Log out** button is now just a **⏻ power-off icon** (`#logoutButton`, `title="Log out"`). Both the help and logout buttons are compact square icon buttons (`.logout-btn` is now `34×34px` with centered icons). The user's username and role are instead shown on the new **Profile** page.

**Grouped & centered topbar buttons:** all topbar buttons — the **☰ menu** (`#navToggle`), **👁 privacy** (`#blurButton`), **⟳ refresh** (`#refreshButton`), **? help** (`#helpButton`), and **⏻ logout** (`#logoutButton`) — are grouped together in a single `.topbar-center` flex container and **centered** in the topbar. The topbar layout is now `brand` (flex:1) + `.topbar-center` (flex:1, `justify-content:center`) + `.topbar-spacer` (flex:1), so the button group sits exactly in the middle. On mobile (≤760px) the **brand** (green dot + "Portfolio Manager") is hidden (`.brand { display: none }`) and `.topbar-center` becomes `flex: 1 1 100%; order: 2`, so the buttons span the full width on a single centered row — reducing the topbar's height and giving users more screen space.

**Clickable menu & keyword references:** the menu names and page-referencing keywords inside the welcome modal (e.g. **My Accounts**, **My Portfolio**, **Assets**, **Dividends**, **Dashboard**, **Goals**, **Holdings**, **Providers**, **Accounts**, **asset account**) carry a `data-page` attribute. Clicking one closes the modal and navigates to that page via `showPage(el.dataset.page)`. The handler is wired in the `DOMContentLoaded` init (a listener over `#welcomeModalOverlay [data-page]`). Clickable references show a pointer cursor and a hover color change (`.welcome-text [data-page]`).

### Blur (privacy) feature

A privacy toggle that blurs **monetary values only**, so a user can show their portfolio and its distributions (percentages, quantities, dates stay readable) without revealing any actual monetary value.

- **Toggle:** a **👁 privacy** button (`#blurButton`) sits in the topbar, **left of the refresh button**, grouped with all the other topbar buttons in the `.topbar-center` flex container. Clicking it toggles blur on/off. The **`H`** keyboard shortcut does the same (ignored while typing in an input/textarea/contentEditable, so it never interferes with data entry).
- **State:** module-level `blurMode` (bool) + `currentPage` (string, updated in `showPage`). `blurActive()` returns `blurMode && currentPage !== 'assets'`.
- **Assets page excluded:** blur never applies on the **Assets** page (it lists prices, not portfolio value). The privacy button still reflects the global toggle state, but no numbers are blurred there; navigating to any other page re-applies the blur.
- **Mechanism:** `applyBlur()` toggles a `blur-mode` class on `<body>` and the `.active` class on the privacy button, then calls `blurNumbers()`/`unblurNumbers()`. `blurNumbers()` walks text nodes and wraps the numeric part of each currency amount in a `<span class="blur-num">` (CSS `filter: blur(5px)`), leaving the currency symbol readable. `unblurNumbers()` replaces each span with a text node and then calls `root.normalize()` to merge adjacent text nodes back into a single node — this is essential so the currency symbol and amount are adjacent again and re-blurring works (without it, the amount becomes a bare number with no symbol and won't be re-blurred). A `MutationObserver` (`initBlurObserver`) re-applies the blur automatically after any re-render (e.g. `loadData()`/refresh), so it stays correct across page changes and data updates.
- **Currency-only detection:** the regex `BLUR_CURRENCY_RE = /([€$£¥₹₽₩₺₴₦฿₫₪₱₲₡₵₸₼₾₿¤])\s*(\d[\d.,]*)/g` matches a currency symbol followed by a number, and only the number is blurred. So `€23,733.29 · 24.4%` blurs only `23,733.29` (the `€` and `24.4%` stay readable), `$1,234.56` blurs `1,234.56`, while quantities (`10`), percentages (`+5.66%`), and other bare numbers are left untouched. Unblurring restores the exact original text (no `%` merge).
- **Styling:** `.topbar-center` (flex container holding all the topbar buttons), `.blur-btn` (mirrors `.refresh-btn`), `.blur-btn.active` (accent-filled when on), and `.blur-num` (`filter: blur(5px)`, `user-select: none`) in `css/portfolio.css`.

### Admin-only UI
Admin-only elements are gated by `isAdminUser()` and/or the `admin-action` CSS class. The admin nav section (`#adminSectionLabel`, `#navTools`, `#navUsers`) is shown only for admins.

**Tools page** (`#page-tools`, nav `#navTools`, admin only): merges the former **Import Data**, **Export Data** and **Currency Test** pages into a single page with three tabs. The tab bar (`.tools-tabs` / `.tools-tab`) switches between three panels (`#tools-panel-import`, `#tools-panel-export`, `#tools-panel-currency-test`) via `switchToolsTab(tab)` (called from the tab buttons' click handlers). The Import and Export panels keep their original element IDs (`#importForm`, `#csvFile`, `#importLog`, `#exportAssetsBtn`, `#exportLog`), so their existing handlers are unchanged.

**Currency Test tab** (`#tools-panel-currency-test`): a testing tool that exercises `convertToCurrency(amount, fromCoin, toCoin)`. It has a single **To coin** select (`#currencyTestTo`) and **5 rows**, each with an **Amount** input (`#currencyTestAmount1`–`5`) and a **From coin** select (`#currencyTestFrom1`–`5`) — all populated by `fillSelects()` via `fillCurrencyOptions()`. A **Convert** button (`#currencyTestConvertBtn`) calls `runCurrencyTest()`, which runs `convertToCurrency` once per filled row, renders each individual result in a results table (`#currencyTestResultsBody`), and shows the **sum** of all converted values in the total row (`#currencyTestTotal`). Empty rows are skipped (shown as "—") and the total sums only the filled rows. `renderCurrencyTest()` (called from `render()`) resets the results table on each render.

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
- **Fixed app shell:** `#app` is a `height: 100vh; overflow: hidden; display: flex; flex-direction: column` container (shown via `showApp()` setting `display: flex`). The `.topbar` is the first flex child and stays fixed at the top. `.layout` is `flex: 1; min-height: 0` and fills the remaining height; `.main` is `flex: 1; min-height: 0; overflow-y: auto` so **only the main content scrolls** while the topbar and sidebar stay in place. `.sidebar` has `overflow-y: auto` so it scrolls internally if it's taller than the viewport. This applies on both desktop (sidebar at left) and mobile (topbar fixed at top, sidebar overlays).
- Modals: `.modal-overlay` + `.modal` (toggled with `.show`), `.modal-actions`, `.field`, `.form-error`, `.modal-copy`.
- Progress bar: `.progress` / `.progress-bar`.
- Update log: `.update-log` (collapsible `<details>` with a `<pre>` block).
- Goal sub-goal bar: `.goal-progress-bar-seg` / `.goal-seg` / `.goal-seg-fill` (segmented bar), `.goal-progress-bar-marks` / `.goal-mark` (debt tick marks rendered inside the bar, with `::after` custom tooltip above on hover), `.goal-sub-label` (active sub-goal % label).
- Sortable table headers: `th.sortable` (pointer cursor, `user-select: none`, `white-space: nowrap`, accent on hover) and `th.sortable .sort-arrow` (accent-colored ▲/▼ indicator).
- Assets page tabs: `.asset-tabs` / `.asset-tab` (mirror `.tools-tabs` / `.tools-tab` — flex row, muted inactive, accent + tinted background when `.active`) and `.asset-panel` (the active panel is shown, the other is `display: none`).
- Currency ratio cards: `.currency-ratio-cards` (flex container, `justify-content: center`, `gap: 16px`, `flex-wrap: wrap`) and `.currency-ratio-cards .card` (`flex: 0 1 300px`, `max-width: 420px`) — two cards side by side that flow down on small screens; `flex-grow: 0` keeps them centered together on wide screens.
- Pagination: `.snapshot-pagination` (shared by the Currency table and the Time Travel snapshot list) centers the controls with `flex-wrap: nowrap`; the Currency page adapts to the available width (all pages → windowed with ellipsis → arrows-only) using `.currency-page-ellipsis` (muted `…`) for the collapsed gap.

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
2. Reorders the dump so the `assets`, `personal_assets` and `account_holdings` tables are created before the tables that reference them (a known D1 export quirk where table creation order isn't dependency-sorted — without this, import fails with `no such table: main.assets`). `personal_assets` is placed after `users` (which it references), and `account_holdings` after both `assets` and `personal_assets`.
3. Clears the local D1 state (`.wrangler/state/v3/d1/`).
4. Imports the reordered dump into the local database.

After refreshing, **restart the dev server** so it picks up the new local DB state.

### Guest mode (no database)

The app also has a guest mode (`state.guest`) backed by `guestData` in `js/portfolio.js`, which provides mock assets, providers, accounts, holdings, goals, and currencies. Guest changes are local-only and not persisted. This is useful for testing the UI (goal marks/tooltips, segmented bars, modals, etc.) without logging in.
