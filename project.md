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
| External data | Massive.com for previous-day US stock closes; ExchangeRate-API for currency rates |
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
├── sw.js
├── manifest.webmanifest
└── icons/
```

Important runtime files:

- `index.html` — Dashboard, Assets, Dividends, My Accounts, My Portfolio, Goals, Tools, Users, Profile, Currency, and all modal markup.
- `js/portfolio.js` — state, API wrapper, calculations, renderers, chart construction, filters, event handlers, snapshots, and simulations.
- `functions/api/[[path]].js` — authentication, authorization, validation, D1 queries, external API calls, and snapshot endpoints.
- `schema.sql` — local schema reference. The deployed D1 database is managed separately.
- `wrangler.toml` — Pages project, D1 binding, compatibility date, and local variable configuration. Do not commit real credentials or API keys.

## 3. Local commands

```bash
npm install
npm run dev
npm run deploy
```

`npm run dev` starts Wrangler Pages development for the repository. `npm run deploy` deploys the current directory to the Cloudflare Pages project `portfolio-manager`.

The repository uses `bcryptjs` at runtime and Wrangler as a development dependency. API keys are read by the worker from `env.STOCK_API_KEY` and `env.API_KEY`. In production they should be configured as Cloudflare secrets; local development may provide them through the local Wrangler configuration.

## 4. Data model

The worker uses these D1 tables:

- `users` — `id`, `username`, `password_hash`, `role`, `created_at`, `last_login`.
- `sessions` — session `token`, `user_id`, and `expires_at`. Sessions expire after seven days.
- `assets` — platform assets with `id`, `name`, `symbol`, `type`, `price`, and `coin`.
- `personal_assets` — user-owned assets with the same core fields plus `user_id`, `created_at`, and `updated_at`.
- `dividends` — one dividend yield per platform asset.
- `dividend_payment_months` — payment months from 1 to 12 for platform assets.
- `providers` — user-owned financial providers with type `bank`, `broker`, or `other`.
- `accounts` — provider-owned accounts with type `loan`, `interest_account`, `bank_account`, or `asset_account`; balances use the account currency and loans may have a `finish_date` stored as `YYYYMMDD`.
- `account_holdings` — holdings linked to either a platform asset or a personal asset, never both. The unique relationship is account + asset.
- `goals` — user-owned targets with currency, optional `sub1`/`sub2`/`sub3` milestones, and `order_by`.
- `goal_link` — links goals to user-owned accounts.
- `currency` — exchange rates relative to USD.
- `update_story` — timestamps for external data refreshes, currently used to avoid repeating the daily currency refresh.
- `dashboard_snapshots` — one JSON dashboard snapshot per user per UTC day, keyed by `(user_id, day)`.

Platform assets and personal assets can have the same numeric ID. The frontend therefore always resolves an asset using both its ID and its `is_personal` flag. Holding select values encode both pieces as `<id>|<is_personal>`.

## 5. Authentication and authorization

The worker exposes three authorization helpers:

- `requireUser` — any authenticated account, including guest accounts for snapshot access.
- `requireMember` — authenticated non-guest user; required for real portfolio data.
- `requireAdmin` — authenticated administrator.

Login creates a random session token and stores it in D1. The cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, and has a seven-day maximum age. Logout deletes the token and expires the cookie. The strict same-site policy means cross-site requests do not carry an authenticated session.

Input is trimmed and validated at the API boundary. Usernames accept 3–50 characters from `[a-zA-Z0-9_.-]`; passwords accept 8–50 characters. Names, enum values, numeric fields, dates, roles, and ownership are validated before writes. Unexpected server errors are logged server-side and returned to the client as a generic internal error.

Guest mode never calls the member data endpoints. It uses isolated in-memory mock data in `guestData`; guest changes are local-only and are not persisted.

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
| POST | `/api/assets` | Admin | Creates a platform asset. |
| PUT/PATCH | `/api/assets/{id}` | Admin | Updates a platform asset, dividend yield, and payment months. |
| DELETE | `/api/assets/{id}` | Admin | Deletes a platform asset and its related holdings/dividend rows. |
| POST | `/api/assets/{id}/price` | Admin | Fetches the previous trading day's close from Massive.com. |
| POST | `/api/personal-assets` | Member | Creates a user-owned personal asset. |
| PUT/PATCH | `/api/personal-assets/{id}` | Owner/Admin | Updates a personal asset. |
| DELETE | `/api/personal-assets/{id}` | Owner/Admin | Deletes a personal asset. |
| GET | `/api/dividends` | Member | Returns assets with a configured yield or payment schedule. |

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
| POST | `/api/snapshots/clean-months` | User | Keeps the most recent snapshot per historical month; current month is untouched. |
| POST | `/api/snapshots/clean-years` | User | Keeps the most recent snapshot per historical year; current year is untouched. |

## 7. Frontend pages

Navigation is conditionally shown by `updateNavVisibility()`:

- Dashboard and My Accounts are always available.
- Goals appears when the user has at least one account.
- My Portfolio, Assets, and Dividends appear when the user has at least one `asset_account`.
- Tools and Users are admin-only.
- Profile and Currency are available to authenticated members according to the navigation state.

### Dashboard

The Dashboard renders summary cards for Top Goal Status, Growth, Global Value, and Debit/Credit. Monetary calculations are normalized to EUR using `accountValue(account, true)` and `convertToEUR`.

The two doughnut charts are:

- **By Type** — asset holdings plus Loans, Cash, and Deposits.
- **By Provider / By Account** — the card is clickable and cycles between provider totals and account totals. The selected mode is stored in `localStorage` as `portfolio_dashboard_breakdown_mode`, so it survives reloads.

Both breakdown charts use the reusable `topNWithOthers(map, 9)` helper: the nine largest categories are shown individually and the remainder is grouped into **Others**. Clicking a slice or legend row filters Account Overview. Clicking the same slice again clears that filter. “Others” resolves to the underlying providers or account IDs rather than displaying only an aggregate.

The Growth card cycles through All-Time Growth, YTD Growth, and Month Growth. Its mode is stored as `portfolio_growth_card_mode`. Growth compares the current value to an appropriate baseline snapshot and shows the percentage and average pace.

#### Collapsible Account Overview

Account Overview is visible by default and has the `#toggleDashboardAccountsBtn` collapse control. The summary is rendered as:

```text
6 accounts · 4 up · 1 down · 1 unchanged · Top movers: Trading 212 +€318.42 / Mortgage −€201.70 / Revolut +€65.20
```

Up/down/unchanged status uses the same previous-snapshot comparison as the account-card border colors. Accounts without a comparison are counted as unchanged. The top three movers are ranked by absolute EUR change and exclude accounts without a previous value. The summary and cards update when filters, data, or Time Travel state changes.

Account cards become clickable for account history when snapshots exist. The account history modal plots that account's EUR value through time.

### Assets

Assets has separate **System Assets** and **Personal Assets** tabs. Each tab has its own search and type filter. Platform assets are administrator-managed; personal assets are private to their owner and can also be managed by an administrator. Personal assets have no dividend schedule and are visually distinguished in holding displays.

The administrator-only single-asset update uses Massive.com's previous-day bar endpoint. The bulk update feature is limited to USD stocks and spaces calls to stay below the free-tier rate limit. The UI shows progress, per-asset results, and portfolio impact for the updated holdings.

### Dividends

The Dividend Calendar lists assets with a configured yield or payment months and supports Month, Trimester, and Semester filters. The page is populated from the stored asset and dividend data; it does not create or update data during display.

### My Accounts

My Accounts combines providers and nested accounts. Provider cards show provider type, account count, collapse/expand state, and total EUR value. Account cards show account type, currency/value, edit/delete actions, and:

- Account Details for asset accounts with holdings, showing a top-9-plus-Others asset breakdown.
- Loan Simulator for loan accounts with balance, interest rate, and finish date.

Provider and account detail charts convert values to EUR. Their Others tables list the individual rows included in the aggregate.

### My Portfolio

My Portfolio lists holdings assigned to asset accounts. It shows asset, account, quantity, purchase price, market value, gain percentage, and gain value. Every displayed column except Action is sortable. Sorting respects the active asset/type filter and persists through re-renders. Asset and account names resolve platform/personal IDs with the personal flag.

### Goals

Goals can link to multiple accounts, contain up to three milestones, and be reordered with arrow controls. Positive goals use segmented progress bars; debt goals use a debt-cleared bar with milestone diamond markers. Goal Details and Goal Simulation reuse the same progress and account-value calculations. Goal History plots historical progress from snapshots.

### Tools, Users, Profile, and Currency

- **Tools** is admin-only and has Import, Export, and Currency Test tabs. Import accepts asset CSV data; Export generates import-ready CSV; Currency Test converts up to five rows and shows individual and total results.
- **Users** is admin-only and supports user creation, password reset, and role changes, except changing the current administrator's role.
- **Profile** shows the current username/role and provides self-service password reset.
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

- **Global** — Global Value, Debit, and Credit lines.
- **By Type** — one line per asset type.
- **By Provider** — one line per provider.
- **By Account** — one line per account reconstructed from each snapshot's `accounts` array.

By Account, By Type, and By Provider use top-9-plus-**Others** grouping. The nine categories with the largest aggregate values are shown individually; all remaining category values are summed into an Others line for each date. The chart supports All, Monthly, and Yearly zoom. Monthly/yearly zoom retains the most recent snapshot in each period, while the x-axis is displayed oldest to newest.

Separate Account History and Goal History modals provide focused per-account and per-goal charts. Chart instances are destroyed when their modal closes or when a new chart is rendered.

## 9. Calculations and formatting

- `accountValue(account, true)` returns account value in EUR. Asset accounts sum holdings after converting each holding to EUR; cash, deposits, and loans use their balance.
- `providerValue(provider)` sums the EUR values of that provider's accounts.
- `convertToEUR` and `convertToCurrency` use stored rates relative to USD and preserve full precision internally.
- Display values use localized currency formatting, normally EUR on portfolio/dashboard surfaces.
- Loans use the French amortization formula, with a zero-rate fallback, and infer remaining months from the finish date.
- Goal values are converted into the goal currency for progress calculations.

## 10. Privacy and first-run UX

The topbar provides navigation, refresh, help, logout, and the privacy toggle. Pressing `H` toggles privacy while not typing. Privacy mode blurs currency amounts only, preserving symbols, percentages, quantities, and dates. It is excluded from the Assets page and reapplied after re-renders through a MutationObserver.

The welcome modal provides a two-page guide. Regular users see it on first use when they have no providers; guests see an isolated demo guide on every guest login. The guide explains providers, accounts, holdings, goals, personal assets, privacy, and Time Travel.

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
