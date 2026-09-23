# Portfolio Manager — Project Documentation

Implementation-backed documentation for the private portfolio management dashboard in this repository. The application tracks assets, dividends, providers, accounts, holdings, goals, currencies, and dashboard history snapshots.

This document describes the current source in `index.html`, `css/portfolio.css`, `js/portfolio.js`, and `functions/api/[[path]].js`. It is intended to be updated when user-visible behavior or operational behavior changes.

---

## 1. Architecture

| Layer | Current implementation |
|---|---|
| Hosting | Cloudflare Pages |
| Backend | Cloudflare Pages Functions, one catch-all worker route |
| Database | Cloudflare D1 / SQLite, binding `myd1db` |
| Frontend | Vanilla HTML, CSS, and an ES-module JavaScript client |
| Charts | Chart.js loaded by the page shell |
| Authentication | Session cookie named `portfolio_session`; passwords hashed with bcrypt |
| External data | Twelve Data (`STOCK_API_KEY_TWELVEDATA`), Massive (`STOCK_API_KEY_MASSIVE`), and Finnhub (`STOCK_API_KEY_FINHUB`) for US stock prices; ExchangeRate-API (`API_KEY`) for currency rates |
| PWA | `manifest.webmanifest` and `sw.js` |

The application is a single-page interface. `index.html` contains all page shells and modal markup. `js/portfolio.js` owns client state, API calls, rendering, event delegation, calculations, and modal behavior. `css/portfolio.css` contains the visual system and responsive layout. `_routes.json` sends only `/api/*` requests to the Pages Function.

## 2. Repository structure

```text
portfolio/
├── index.html
├── css/portfolio.css
├── js/portfolio.js
├── functions/api/[[path]].js
├── schema.sql
├── _routes.json
├── wrangler.toml
├── package.json
├── package-lock.json
├── sw.js
├── manifest.webmanifest
├── project.md
└── icons/
```

Important runtime files:

- `index.html` — Dashboard, Calendar, Simulation, Goals, My Portfolio, My Accounts, Assets, Dividends, Currency, Profile, Tools, Users, and all modal markup.
- `js/portfolio.js` — state, API wrapper, calculations, renderers, chart construction, filters, event handlers, snapshots, and simulations.
- `functions/api/[[path]].js` — authentication, authorization, validation, D1 queries, external API calls, and snapshot endpoints.
- `schema.sql` — tracked D1 schema reference: table definitions, indexes, triggers, and the `asset_type` seed rows. The deployed D1 database is managed separately; one-off migrations are applied manually with `wrangler d1 execute`.
- `wrangler.toml` — Pages project, D1 binding, compatibility date, and local variable configuration. Do not commit real credentials or API keys.

## 3. Local commands

```bash
npm install
npm run dev
npm run deploy
```

`npm run dev` starts Wrangler Pages development for the repository. `npm run deploy` deploys the current directory to the Cloudflare Pages project `portfolio-manager`.

The repository uses `bcryptjs` at runtime and Wrangler as a development dependency. The worker reads provider-specific credentials from the environment: `env.STOCK_API_KEY_TWELVEDATA` for Twelve Data, `env.STOCK_API_KEY_MASSIVE` for Massive, `env.STOCK_API_KEY_FINHUB` for Finnhub, and `env.API_KEY` for ExchangeRate-API. Each price provider reads only its own variable, with no shared fallback. In production these should be configured as Cloudflare secrets; local development may provide them through the local Wrangler configuration.

## 4. Data model

The worker uses these D1 tables:

- `users` — `id`, `username`, `password_hash`, `role`, `created_at`, `last_login`, and optional `fire_expenses` (monthly expenses used for the user-configured FIRE target); stored roles are `user` or `admin`.
- `sessions` — session `token`, `user_id`, `created_at`, and `expires_at`. Sessions expire after seven days.
- `assets` — platform assets with `id`, `name`, `symbol`, `type`, `price`, `coin`, `dividend_yield`, `created_at`, and `updated_at`.
- `asset_type` — reference table of valid asset types (`id`, `type`, `label`); drives the asset creation form, type filters, and validation.
- `personal_assets` — user-owned assets with the same core fields plus `user_id`, `created_at`, and `updated_at`; they carry a `dividend_yield` but never a payment schedule.
- `dividend_payment_months` — payment months from 1 to 12 for platform (system) assets only.
- `providers` — user-owned financial providers with type `bank`, `broker`, or `other`.
- `accounts` — provider-owned accounts with type `loan`, `interest_account`, `bank_account`, or `asset_account`; balances use the account currency and loans may have a `finish_date` stored as `YYYYMMDD`.
- `account_holdings` — holdings linked to either a platform asset or a personal asset, never both. The unique relationship is account + asset.
- `goals` — user-owned targets with currency, optional `sub1`/`sub2`/`sub3` milestones, and `order_by`.
- `goal_link` — links goals to user-owned accounts.
- `currency` — exchange rates relative to USD.
- `update_story` — `what` and `when` timestamps for external data refreshes, currently used to avoid repeating the daily currency refresh.
- `dashboard_snapshots` — one JSON dashboard snapshot per user per UTC day, keyed by `(user_id, day)`.

Platform assets and personal assets can have the same numeric ID. The frontend therefore always resolves an asset using both its ID and its `is_personal` flag. Holding select values encode both pieces as `<id>|<is_personal>`.

## 5. Authentication and authorization

The worker exposes three authorization helpers:

- `requireUser` — any authenticated stored account.
- `requireMember` — authenticated stored user or administrator; required for real portfolio data.
- `requireAdmin` — authenticated administrator.

Login creates a random session token and stores it in D1. The cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, and has a seven-day maximum age. Logout deletes the token and expires the cookie. The strict same-site policy means cross-site requests do not carry an authenticated session.

Input is trimmed and validated at the API boundary. Usernames accept 3–50 characters from `[a-zA-Z0-9_.-]`; passwords accept 8–50 characters. Names, enum values, numeric fields, dates, roles, and ownership are validated before writes. Unexpected server errors are logged server-side and returned to the client as a generic internal error.

Guest mode is a login-menu mode, not a stored user role. It never calls the member data endpoints; it uses isolated in-memory mock data in `guestData`, including examples for accounts, loans, holdings, personal assets, dividends, goals, currency, and simulation. Guest changes are local-only and are not persisted.

## 6. Backend API

All routes are under `/api`. The route is implemented by `functions/api/[[path]].js`.

### Authentication

| Method | Path | Access | Behavior |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Validates credentials and sets the session cookie. |
| POST | `/api/auth/logout` | User | Deletes the current session and clears the cookie. |
| GET | `/api/auth/me` | User | Returns the current user. |

### Assets and dividends

| Method | Path | Access | Behavior |
|---|---|---|---|
| GET | `/api/assets` | Member | Returns all platform assets plus the current user's personal assets, including dividend metadata for platform assets. |
| GET | `/api/asset-types` | Member | Returns the valid asset types (`id`, `type`, `label`) from the `asset_type` table. |
| POST | `/api/assets` | Admin | Creates a platform asset with an optional dividend yield and payment months. |
| PUT/PATCH | `/api/assets/{id}` | Admin | Updates a platform asset, dividend yield, and payment months. |
| DELETE | `/api/assets/{id}` | Admin | Deletes a platform asset and its related holdings/payment-month rows. |
| POST | `/api/assets/{id}/price` | Admin | Fetches the quote price from the selected provider (Twelve Data, Massive, or Finnhub; defaults to Finnhub). |
| POST | `/api/personal-assets` | Member | Creates a user-owned personal asset with an optional dividend yield (no payment schedule). |
| PUT/PATCH | `/api/personal-assets/{id}` | Owner/Admin | Updates a personal asset and its dividend yield (no payment schedule). |
| DELETE | `/api/personal-assets/{id}` | Owner/Admin | Deletes a personal asset. |
| GET | `/api/dividends` | Member | Returns platform assets with a configured yield or payment schedule. |

### Providers, accounts, and holdings

| Method | Path | Access | Behavior |
|---|---|---|---|
| GET/POST | `/api/providers` | Member | Lists or creates the user's providers. |
| DELETE | `/api/providers/{id}` | Member | Deletes the user's provider and dependent accounts through database relationships. |
| GET/POST | `/api/accounts` | Member | Lists accounts or creates/updates one through the form payload. |
| PUT/PATCH | `/api/accounts/{id}` | Member | Updates an owned account. |
| DELETE | `/api/accounts/{id}` | Member | Deletes an owned account. |
| GET/POST | `/api/holdings` | Member | Lists or upserts an owned holding. A `holding_id` updates a specific row. |
| DELETE | `/api/holdings/{id}` | Member | Deletes an owned holding. |

Holdings accept platform or personal assets. Personal holdings are ownership-checked and returned with `is_personal: 1`. Asset accounts calculate their value from holding price × quantity; non-asset accounts calculate value from their balance.

### Goals

| Method | Path | Access | Behavior |
|---|---|---|---|
| GET/POST | `/api/goals` | Member | Lists or creates/updates goals and their account links. |
| POST | `/api/goals/reorder` | Member | Persists a complete user-owned goal order from an ID array. |
| DELETE | `/api/goals/{id}` | Member | Deletes an owned goal and renumbers remaining goals. |

Goal validation enforces the dependency chain (`sub2` requires `sub1`, `sub3` requires `sub2`). Debt goals use negative milestones. Positive goals use positive, ascending milestones below the target.

### Admin and currency

| Method | Path | Access | Behavior |
|---|---|---|---|
| GET | `/api/admin/users` | Admin | Lists users without password hashes. |
| POST | `/api/admin/users` | Admin | Creates a user with a bcrypt password hash. |
| POST | `/api/admin/users/{id}/password` | Admin | Resets another user's password. |
| PATCH | `/api/admin/users/{id}/role` | Admin | Changes another user's role; an admin cannot change their own role. |
| POST | `/api/me/password` | Member | Changes the current user's password. |
| PATCH | `/api/me/profile` | Member | Updates the current user's profile settings (`fire_expenses`, the monthly expenses used for the FIRE target). |
| POST | `/api/admin/import` | Admin | Imports or updates platform assets from rows. |
| GET | `/api/currency` | Member | Lists stored exchange rates. |
| POST | `/api/admin/update-currency` | Admin | Refreshes ExchangeRate-API data at most once per UTC day. |

### Dashboard snapshots

| Method | Path | Access | Behavior |
|---|---|---|---|
| POST | `/api/snapshots` | User | Creates or replaces today's UTC snapshot. |
| GET | `/api/snapshots` | User | Lists the current user's snapshots newest first. |
| GET | `/api/snapshots/{YYYYMMDD}` | User | Retrieves one owned snapshot. |
| DELETE | `/api/snapshots/{YYYYMMDD}` | User | Deletes one owned snapshot. |
| POST | `/api/snapshots/clean-months` | User | Keeps the most recent snapshot per historical month; current month is untouched and the oldest snapshot is always preserved. |
| POST | `/api/snapshots/clean-years` | User | Keeps the most recent snapshot per historical year; current year is untouched and the oldest snapshot is always preserved. |

## 7. Frontend pages

Navigation is conditionally shown by `updateNavVisibility()`:

- Dashboard, Calendar, and My Accounts are always available.
- Simulation and Goals appear when the user has at least one account. If the last account is removed while Simulation is open, the view returns to Dashboard.
- My Portfolio, Assets, and Dividends appear when the user has at least one `asset_account`.
- Tools and Users are admin-only.
- Profile and Currency are available to authenticated members according to the navigation state.

### Dashboard

The Dashboard renders summary cards for Top Goal Status, Growth, Global Value, and Assets/Liabilities. Monetary calculations are normalized to EUR using `accountValue(account, true)` and `convertToEUR`. The Assets/Liabilities card lists the positive total in green and the negative total in red, and omits a line whose total is zero, so a portfolio with no liabilities shows the assets total alone and a portfolio with neither shows a dash.

The **Top Goal Status** card shows the first goal's completion percentage, its name, and — when snapshot history exists — an estimated reach date and monthly growth pace (e.g. `Est: Oct 2026 (~8 mos) (+$450/mo)`). The estimate is hidden when viewing a past Time Travel snapshot.

The two doughnut charts are:

- **By Type / By Change** — the card is clickable. By Type shows asset holdings plus Loans, Cash, and Deposits; By Change shows Gain and Loss slices based on account value movement versus the previous snapshot. Clicking Gain or Loss filters Account Overview to accounts that increased or decreased.
- **By Provider / By Account** — the card is clickable and cycles between provider totals and account totals. The selected mode is stored in `localStorage` as `portfolio_dashboard_breakdown_mode`, so it survives reloads.

Both breakdown charts use the reusable `topNWithOthers(map, 9)` helper: the nine largest categories are shown individually and the remainder is grouped into **Others**. Clicking a slice or legend row filters Account Overview. Clicking the same slice again clears that filter. “Others” resolves to the underlying providers or account IDs rather than displaying only an aggregate.

The Growth card cycles through All-Time Growth, YTD Growth, and Month Growth. Its mode is stored as `portfolio_growth_card_mode`. Growth compares the current value to an appropriate baseline snapshot and shows the percentage and average pace.

#### Collapsible Account Overview

Account Overview is visible by default and has the `#toggleDashboardAccountsBtn` collapse control. The summary is rendered as:

```text
6 accounts · 4 up · 1 down · 1 unchanged · Top movers: Trading 212 +€318.42 / Mortgage −€201.70 / Revolut +€65.20
```

Up/down/unchanged status uses the same previous-snapshot comparison as the account-card border colors. Accounts without a comparison are counted as unchanged. The top three movers are ranked by absolute EUR change and exclude accounts without a previous value. The summary and cards update when filters, data, or Time Travel state changes.

Each account card shows the account name, type tag, and current EUR value, followed by a footer row with the provider name on the left and the difference versus the previous snapshot right-aligned beneath the total (e.g. `+€318.42` in green, `−€201.70` in red, `±€0.00` in muted grey). The difference line is absent when the account has no previous snapshot value to compare against. Its color matches the card border highlight: green for an increase, red for a decrease. Time Travel renders the same card layout and difference value, comparing against the next older snapshot in the list.

Account cards become clickable for account history when snapshots exist. The account history modal plots that account's EUR value through time.

### Calendar

Calendar is a full-page monthly view of daily portfolio growth, placed in the **Personal** navigation section directly below Dashboard. It is always available, like Dashboard and My Accounts.

The toolbar carries a **Month / Year / All Time** switch that sets the granularity, plus previous/next buttons, a period label that opens a picker, a **Today** button, and an asset-accounts toggle. The selected granularity is stored in `localStorage` as `portfolio_growth_calendar_view_mode`.

- **Month** (default) — a 7-column grid with one cell per day. The label opens a month picker (year stepper plus a twelve-month grid); selecting a month closes the picker and renders it. Chips show the month's net change, the count of up and down days, and the best and worst single day.
- **Year** — one card per month of the selected year, twelve in total, with months that have no data rendered as dashed empty cards. The label opens a year picker (year stepper only) and the arrows step a year at a time. Chips show the year's net change, the count of up and down months, and the best and worst month.
- **All Time** — one card per year that has recorded growth, oldest first. There is no navigation: the arrows and **Today** are omitted and the label is a disabled "All Time". Chips show the all-time net change, the count of up and down years, and the best and worst year.

Each period card shows the period name, the aggregated growth amount and percentage, and the count of up and down days within it. Cards are color-coded like day cells (green positive, red negative, neutral for zero). The best/worst chips are hidden on narrow screens.

Day-cell amounts use a fluid font size (`clamp(8px, 0.95vw, 14px)`) so they shrink with the cell instead of wrapping mid-number, which previously made cells uneven and hard to scan. Amounts and percentages are single-line with ellipsis overflow as a final fallback. Today's cell is marked by the accent ring alone, with no badge; whether the value is a stored snapshot or a live estimate is stated in the cell tooltip.

The asset-accounts toggle switches growth between **Assets included** (every account, the default) and **Assets excluded** (asset accounts omitted, so only cash, deposits, and loans count). The active mode is highlighted and stored in `localStorage` as `portfolio_growth_calendar_asset_mode`, so it survives reloads. Both variants are precomputed by the shared growth cache, so switching is instant and does not recalculate. The toggle applies to all three granularities; the History chart's **By Growth** series always uses the all-accounts variant.

Year and All-time cards are built by `aggregateGrowthPeriod()`, which sums the daily growths whose `YYYYMMDD` key starts with the period prefix. It skips the baseline snapshot (whose growth is `null`) and today's live estimate, so a period's total is the sum of its recorded day-over-day changes. The card percentage is that summed growth over the period's opening value, matching the daily percentage formula. `buildGrowthMonthSummaries()` returns all twelve months of a year; `buildGrowthYearSummaries()` returns only years that have recorded growth.

Each day cell shows the day number, the growth amount versus the previous snapshot, and the growth percentage. Cells are color-coded: green (`.cal-day-pos`) for a positive day, red (`.cal-day-neg`) for a negative day, and a neutral style for a zero-change day. The first recorded snapshot is labelled **Baseline** because it has no previous value to compare against. Days with no snapshot render as a dashed empty cell. Today's cell carries an accent ring. The cell tooltip states the date, growth, portfolio value, and whether the value is a stored snapshot, a live estimate, or clickable to open in Time Travel.

Clicking a day that has a snapshot enters Time Travel mode for that day and opens the Dashboard, matching the snapshot calendar modal. Days without a snapshot are not clickable. The portfolio value for a day is available in the cell tooltip rather than as a visible line in the cell. Monetary amounts on this page are blurred by privacy mode.

### Assets

Assets has separate **System Assets** and **Personal Assets** tabs. Each tab has its own search and type filter. Platform assets are administrator-managed; personal assets are private to their owner and can also be managed by an administrator. Personal assets have no dividend schedule and are visually distinguished in holding displays. The asset type options (creation form, filters) are loaded from the `asset_type` reference table and cached at startup, so adding a type there surfaces it across the UI.

The administrator-only price updates support choosing between Twelve Data (7 calls/min), Massive.com (4 calls/min), and Finnhub.io (1 call every 2s). Both the bulk update and the single-asset manual refresh offer this provider choice. The single-asset modal opens prefilled with the asset's current price and does not fetch on open; an **Update** button next to **Commit** fetches a fresh quote from the selected provider, and **Commit** saves the value in the field. The bulk update feature is limited to USD stocks, allows selecting the API provider before running, estimates duration, and spaces calls according to the provider's rate limit. If a call fails, exponential backoff retries after 30s, 60s, and 120s. The UI displays progress, 3 live summary cards below the action buttons and above the console log (count of assets that went up, count of assets that went down, and total portfolio value change), per-asset results, and detailed console log.

### Dividends

The Dividend Calendar lists platform (system) assets with a configured yield or payment months and supports Month, Trimester, and Semester filters. Personal assets are excluded because the payment calendar is reserved for system assets. The page is populated from the stored asset and payment data; it does not create or update data during display.

### My Accounts

My Accounts combines providers and nested accounts. Provider cards show provider type, account count, collapse/expand state, and total EUR value. Account cards show account type, currency/value, edit/delete actions, and:

- Account Details for asset accounts with holdings, showing a top-9-plus-Others asset breakdown.
- Loan Simulator for loan accounts with balance, interest rate, and finish date.

Provider and account detail charts convert values to EUR. Their Others tables list the individual rows included in the aggregate.

### Simulation

Simulation is a read-only, principal-only projection of Global Value. It uses the same All-Time Growth monthly pace shown on the Dashboard, calculated with elapsed days so an incomplete calendar month is included, then shows the implied value today, in 1, 5, 10, and 20 years. The clickable Path card toggles between the next increasing power-of-ten milestone, Path to FIRE (auto), and Path to FIRE (user). FIRE (auto) uses the average portfolio-level loss across the full snapshot history as an expense proxy: decreases in overall Global Value between consecutive snapshots are summed and divided by the elapsed months since the first snapshot. This is transfer-neutral, so moving money between accounts without changing Global Value contributes no loss. It targets 25 times annual expenses (`average monthly expenses × 12 × 25`). FIRE (user) uses the user-configured `fire_expenses` from the Profile page (`monthly expenses for FIRE × 12 × 25`). When FIRE targets and a positive growth pace are available, the Historical & Projected Global Value chart also shows Estimated Path to FIRE (auto) and Estimated Path to FIRE (user) lines, capped at each FIRE target when reached. The historical chart displays the first snapshot and the latest snapshot available for each calendar year, while all snapshots remain available for the growth calculation. It includes a linear current-pace projection plus a purple `Projected +5% Annual Growth` scenario; for each year, that scenario adds 12 months of the current pace to the previous year's value and multiplies the result by 1.05. The Growth Contribution by Account card is clickable and cycles through All-Time, YTD, and Month views. It scans all snapshots to build a distinct account history, then calculates each account's monthly change as `(latest known value - period start value) / months in period`; All-Time uses the account's first known value, while YTD and Month use the value at the start of the current year or month when available. Live values are used as the latest point for existing accounts and deleted accounts end at their last snapshot. It uses top-9-plus-Others grouping; positive and negative changes are shown as separate doughnut datasets, with negative changes represented by absolute values. Hovering Others shows the aggregate and each included account's signed monthly change. When the current Global Value is negative and the historical pace is positive, it also estimates the month and year in which the value reaches €0. The projection ignores interest, dividends, market returns, inflation, and future deposits or withdrawals; a dated snapshot baseline is required for a growth rate.

### My Portfolio

My Portfolio lists holdings assigned to asset accounts. It shows asset, account, quantity, purchase price, market value, gain percentage, and gain value. Every displayed column except Action is sortable. Sorting respects the active asset/type filter and persists through re-renders. Asset and account names resolve platform/personal IDs with the personal flag.

The page shows two chart cards above the holdings table:

- **By Asset** — a doughnut of market value per asset. The card is clickable and cycles between market value and gain/loss. Clicking a slice or legend row filters the holdings table to that asset; clicking the same slice again clears the filter.
- **By Asset Type** — a single card that cycles through three modes when clicked (stored in `localStorage` as `portfolio_type_chart_mode`):
  - **By Asset Type** — a doughnut of market value per asset type. Clicking a slice or legend row filters the holdings table to that type; clicking the same slice again clears the filter. The card highlights with an accent border while a type filter is active.
  - **Type by Account** — a vertical stacked bar chart. Each account is one bar that always fills to 100%, with segments showing the percentage share of each asset type within that account, so composition is comparable across accounts regardless of absolute size. Accounts with no asset holdings are omitted. Hovering a segment shows the type and its percentage.
  - **Gain/Loss by Type** — a vertical bar chart of each asset type's current gain/loss (no time axis). Positive gains are green, losses are red, matching the By Growth history chart style. Holdings without a purchase price are excluded.

The By Asset Type and Type by Account modes use the reusable `topNWithOthers(map, 9)` helper so the nine largest types are shown individually and the remainder is grouped into **Others**. Both chart cards respect the privacy blur mode.

### Goals

Goals can link to multiple accounts, contain up to three milestones, and be reordered with arrow controls. Positive goals use segmented progress bars; debt goals use a debt-cleared bar with milestone diamond markers. Goal Details and Goal Simulation reuse the same progress and account-value calculations. Goal History plots historical progress from snapshots.

For goals whose linked accounts include both positive and negative values, the Goal History chart plots two dashed lines alongside the Progress (%) line: **Positive (%)** in green and **Negative (%)** in red. Each is that side's share of the goal's absolute total, so a goal with −100 and +50 reads 66.7% negative and 33.3% positive. The two lines sum to 100%. They are absent for goals that are entirely positive or entirely negative, and the chart legend appears only when these lines are present. Snapshots where the goal has no mixed split leave a gap in both lines.

Each goal card and the Goal Details modal display two additional fields computed by `calculateGoalPaceAndEstimate(goal)`:

- **Growth Pace** — the sum of each linked account's all-time monthly growth rate, converted to the goal's currency. Shown in green when positive, red when negative.
- **Est. Reach** — the projected date at which the current pace reaches the goal target (e.g. `Oct 2026 (~8 mos)`). Shows `Target reached` / `Debt cleared` when already achieved, `Declining` or `No growth` when the pace is ≤ 0, and `Need snapshot history` when no snapshot data is available.

The Dashboard Top Goal Status card also shows this estimate beneath the goal name.

Goals have an optional **Target Date** (`end_date`, `YYYY-MM-DD`) set with a calendar picker in the create/edit form. When a target date is present, the goal name is followed by a compact on-track badge computed by `goalOnTrackInfo(goal)`:

- **On track** (green pill, 🟢) — the current monthly pace is enough to close the gap by the target date, or the target is already reached.
- **Not on track** (red pill, 🔴) — the current pace is insufficient to reach the target on/before the date.

In the Goal Details grid, the target date is replaced by a status field that states the **extra monthly amount** needed when off track (e.g. `Extra Needed +€242.39/mo`), the surplus pace when on track (`Ahead of Pace +Y/mo`), or `Status: Reached` when the goal is already achieved.

Above the goal list, a **Goal Statistics** card (`renderGoalStats`) summarizes the goals: total count, how many are on track / not on track / achieved / without a target date, and the best- and worst-performing goals. Best/Worst are judged by projected reach date among not-yet-achieved goals with growth (earliest reach = best; won't-reach or latest reach = worst), not by progress percentage. No combined target/current totals are shown.

### Tools, Users, Profile, and Currency

- **Tools** is admin-only and has Import, Export, and Currency Test tabs. Import accepts asset CSV data; Export generates import-ready CSV; Currency Test converts up to five rows and shows individual and total results.
- **Users** is admin-only and supports user creation, password reset, and role changes between `user` and `admin`, except changing the current administrator's role. Guest mode is available only from the login menu and is not a stored user.
- **Profile** shows the current username/role, allows setting monthly expenses for FIRE, and provides self-service password reset.
- **Currency** displays stored exchange rates with search and pagination.

## 8. Snapshot and Time Travel behavior

Snapshots are collected by `collectDashboardSnapshot()` and contain:

- `globalValue`, `debit`, and `credit`;
- `byType` in EUR, including Loans/Cash/Deposits;
- `byProvider` in EUR;
- an `accounts` array with account ID, name, type, provider, and EUR value;
- provider and account counts for metadata.

The snapshot list is cached per user in local storage with a versioned key. Startup and explicit refresh may refresh it from `/api/snapshots`; ordinary display/navigation uses the retained local list. Failed reads do not discard known cached data.

The Dashboard header provides previous/next navigation, save, history, calendar, and playback controls. Time Travel shows a date banner and renders the selected snapshot without replacing live data on the other pages. One snapshot per UTC day is supported; saving again on that day replaces it.

### Snapshot History line chart

The History modal uses the in-memory snapshot list and offers:

- **Global** — Global Value, plus Assets and Liabilities lines when the snapshots contain that side. These display labels map to the stored snapshot fields `debit` and `credit`. The Assets line is plotted only when at least one snapshot in the current zoom has a non-zero `debit`, and the Liabilities line only when at least one has a non-zero `credit`; a portfolio with no liabilities therefore shows Global Value and Assets alone.
- **By Type** — one line per asset type.
- **By Provider** — one line per provider.
- **By Account** — one line per account reconstructed from each snapshot's `accounts` array.
- **By Account Type** — one line per account type (Bank Account, Interest Account, Asset Account, Loan), summing each snapshot's `accounts` values by `account.type` via `accountTypeLabel()`.
- **By Growth** — a bar for each snapshot's change in Global Value versus the previous snapshot; positive growth is green and negative growth is red. With Monthly, Yearly, or YTD zoom, all snapshot-to-snapshot changes within each period are summed into that period's bar; with Current Month zoom each bar is a single day's change. The first snapshot has no comparison and is left blank when using All zoom. These values come from the shared snapshot daily growth cache, so they match the Calendar page for the same period.

By Account, By Account Type, By Type, and By Provider use top-9-plus-**Others** grouping. The nine categories with the largest aggregate values are shown individually; all remaining category values are summed into an Others line for each date. The x-axis is displayed oldest to newest.

All three history charts — Snapshot History, Account History, and Goal History — share the same five zoom levels, applied by `applyHistoryZoom()`:

- **All** — every snapshot.
- **Monthly** — the most recent snapshot in each calendar month, across all history.
- **Yearly** — the most recent snapshot in each calendar year, across all history.
- **YTD** — the most recent snapshot in each month of the current year, from January 1 to today.
- **Current Month** — every snapshot in the current calendar month, one point per day.

Monthly, Yearly, and YTD bucket by period; Current Month keeps each day. YTD and Current Month additionally restrict the range to the current year or month, so they show recent detail rather than the whole history. Period keys come from `historyZoomPeriodKey()`, which both `applyHistoryZoom()` and `buildHistoryGrowthValues()` use, so the By Growth bars aggregate on the same boundaries as the lines. A zoom with no snapshots in range renders the chart's empty state.

Separate Account History and Goal History modals provide focused per-account and per-goal charts. Chart instances are destroyed when their modal closes or when a new chart is rendered.

## 9. Calculations and formatting

- `accountValue(account, true)` returns account value in EUR. Asset accounts sum holdings after converting each holding to EUR; cash, deposits, and loans use their balance.
- `providerValue(provider)` sums the EUR values of that provider's accounts.
- `convertToEUR` and `convertToCurrency` use stored rates relative to USD and preserve full precision internally.
- Display values use localized currency formatting, normally EUR on portfolio/dashboard surfaces.
- Loans use the French amortization formula, with a zero-rate fallback, and infer remaining months from the finish date.
- Goal values are converted into the goal currency for progress calculations.

### Account growth cache

Three helpers compute per-account monthly growth from snapshot history:

- `getAccountHistories()` — builds a `Map<accountId, { observations[] }>` from all snapshots (sorted oldest to newest) plus a live observation for each current account.
- `calculateAccountGrowths(mode)` — iterates the history map and returns a `Map<accountId, { delta, observationsCount, … }>` where `delta` is the EUR monthly change over the account's lifetime (`'all'`) or within the current year/month (`'ytd'` / `'month'`). Used directly by the Simulation Growth Contribution chart for non-`'all'` modes.
- `getGlobalAccountGrowths()` — memoized wrapper for `calculateAccountGrowths('all')`. The result is stored in `state.accountGrowths` and reused by `calculateGoalPaceAndEstimate()` and the Simulation chart (all-time mode) without recomputation. The cache is invalidated via `invalidateAccountGrowthCache()` whenever snapshots change (`setSnapshotList`) or account/portfolio data is reloaded (`loadData`).

### Snapshot daily growth cache

`getSnapshotDailyGrowthMap()` is the shared engine for day-over-day growth, consumed by both the Calendar page and the History chart's **By Growth** series so the two cannot drift apart. It sorts snapshots chronologically, then for each day computes the change in Global Value versus the previous snapshot, the percentage change against that previous value, and the end-of-day portfolio value. Results are cached in `state.snapshotDailyGrowths` as a `Map` keyed by `YYYYMMDD`, with `state.snapshotDailyGrowthsDirty` tracking validity. The first snapshot has no previous value, so its growth and percentage are `null` and it is flagged as the baseline. When the latest snapshot is not today, a live entry for today is appended from `totalPortfolioValue()` and flagged `isLive`.

Each entry carries two variants. The plain fields (`globalValue`, `growth`, `percentGrowth`) count every account. The `*ExAssets` fields (`globalValueExAssets`, `growthExAssets`, `percentGrowthExAssets`) subtract the asset-account portion, derived from the snapshot's own `accounts` array via `snapshotAssetAccountsValue()`, so the split is available retroactively without re-reading holdings. Today's live entry derives its excluded variant from `liveAssetAccountsValue()`. Both variants are computed in the same pass, which is what lets the Calendar toggle switch instantly.

`invalidateSnapshotDailyGrowths()` marks the cache dirty and is called whenever snapshots are created, refreshed, or deleted, so the O(N) pass runs once per change rather than once per feature. `buildHistoryGrowthValues(points, zoom)` reads the map directly instead of recalculating, summing the per-day changes within each period for Monthly, Yearly, and YTD zoom, and using each day's own change for Current Month. It reads the all-accounts fields, so the History chart is unaffected by the Calendar's asset-accounts toggle.

## 10. Privacy and first-run UX

The topbar provides navigation, refresh, help, logout, and the privacy toggle. Pressing `H` toggles privacy while not typing. Privacy mode blurs currency amounts only, preserving symbols, percentages, and dates. While active, monetary chart axis labels are hidden and monetary tooltip values show `hidden`; chart visuals remain sharp. It is excluded from the Assets page and reapplied after re-renders through a MutationObserver.

Two further single-key shortcuts mirror the topbar buttons: `S` saves today's snapshot (the same action as the 💾 button) and `R` refreshes all data (the same action as the ⟳ button). Both are ignored while a text field, textarea, select, or contenteditable element has focus, while any modal is open, and when a modifier key is held. `S` is also ignored while the save button is disabled, and `R` while a refresh is already running.

### Loading modal

A loading modal covers the app while data is being fetched, so a slow connection shows what is happening instead of a frozen screen. It appears on the initial page load, on sign-in, and on a manual refresh (the ⟳ button or the `R` shortcut). It does not appear in guest mode, which loads from local demo data, nor for the many `loadData()` calls that follow a write, which refresh in place without blocking.

The modal lists the steps `loadData()` performs and marks each one off as it completes: **Loading portfolio data**, then **Loading user accounts** (admin only), then **Loading snapshot history**. The step list is built by `dataLoadSteps()`, which adds the admin step only when the signed-in user has the `admin` role. The subtitle changes as the load moves from portfolio data to snapshot history.

`openLoadingModal()` returns a token that `setLoadingStep()`, `setLoadingSub()`, and `closeLoadingModal()` use to ignore stale updates, so a load that finishes after a newer one has started cannot close the newer modal. The modal closes itself when the work finishes, including on failure, and a 20-second safety timeout guarantees it never stays stuck open. A 600 ms minimum visible time prevents a flash on fast connections.

Privacy covers two surfaces. `blurNumbers()` walks text nodes and wraps each amount in a `.blur-num` span. `blurTitles()` handles native `title` tooltips, which are attributes rather than text nodes and therefore invisible to the text walker: it replaces each monetary amount in a title with `hidden` (keeping the currency symbol) and stores the original in `data-orig-title` so `unblurTitles()` can restore it exactly. Both run from `applyBlur()` and from the MutationObserver, so tooltips stay hidden across re-renders. This is what keeps the Calendar day-cell tooltips from leaking portfolio values while privacy mode is active.

The welcome/help modal provides a seven-tab feature guide. Regular users see the onboarding tab on first use when they have no providers; guests see an isolated demo guide on every guest login. The guide covers onboarding and privacy, Dashboard insights, providers and accounts, portfolio assets and dividends, goals, simulations, currency, and admin data tools. History and Time Travel remain documented in their dedicated views.

All modals use shared open/close behavior, lock background scrolling while open, close through a header ✕, and respond to Escape. Destructive actions use the custom confirmation modal rather than browser `confirm()`.

## 11. External integrations and operational boundaries

Massive.com is used only for the previous trading day's US stock close. It does not provide a live quote through this application, and unsupported/non-US symbols may fail.

ExchangeRate-API data is previous-day/end-of-day data and is refreshed at most once per UTC day through `update_story`.

The service worker and manifest provide the existing PWA shell/offline boundary. Cached snapshot history is not equivalent to an offline authenticated dashboard: live API data, authentication, and unsaved changes still require the application/backend environment.

Source checks can validate syntax and documentation consistency, but they do not prove browser layout, PWA installation, authenticated Cloudflare behavior, D1 binding configuration, or external API availability. Those require a live browser/deployment check.

## 12. Maintenance checklist

When changing the application:

1. Search all call sites and both live and snapshot render paths.
2. Preserve user-scoped data and guest isolation.
3. Keep read/display paths from issuing unnecessary writes or refresh calls.
4. Update this document for user-visible behavior, data shape, API changes, and operational limits.
5. Run `node --check js/portfolio.js` and `git diff --check` for frontend/documentation changes.
6. Treat browser, PWA, Cloudflare, D1, and external API behavior as separately requiring live verification.
