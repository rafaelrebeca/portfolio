# Portfolio Manager 💼📊

A full-featured, private portfolio management dashboard built as a progressive web application (PWA) on Cloudflare Pages with D1 SQLite database storage and worker functions.

[![Cloudflare Pages](https://img.shields.io/badge/Deployed%20on-Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![Database](https://img.shields.io/badge/Database-Cloudflare%20D1%20SQLite-0051C3?style=for-the-badge&logo=sqlite&logoColor=white)](https://developers.cloudflare.com/d1/)
[![JavaScript](https://img.shields.io/badge/Frontend-Vanilla%20JS%20(ES%20Modules)-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![PWA Ready](https://img.shields.io/badge/PWA-Supported-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

---

## 🌟 Overview

**Portfolio Manager** is a sleek, single-page application (SPA) designed to track, analyze, and manage multi-asset portfolios, bank/broker accounts, dividend yields, loan payoff trajectories, and financial goals.

It operates with zero heavy client frameworks (written in clean Vanilla HTML, CSS, and modern JavaScript ES modules) and leverages Cloudflare's edge infrastructure for lightning-fast serverless execution and low-latency SQLite database access via Cloudflare D1.

---

## ✨ Key Features

- 📊 **Interactive Dashboard**: A net-worth layout. The hero shows global value (green above zero, red below zero, neutral at zero), today's change, a Debt-heavy tag when the total is negative, and an assets-versus-liabilities split. Growth has All-time, YTD, and Month tabs. A current-month spending card and a top-goal card (the first goal by `order_by`, with reach and pace when snapshot history exists) sit beside the charts. Allocation switches between By type and By change; Providers switches between By provider and By account, with hatched slices for negative totals. Account overview groups accounts by type and shows up, down, and unchanged versus the previous snapshot.
- 💼 **My Portfolio & Holdings**: Detailed view of positions across the asset types defined in the `asset_type` table (stock, bond, ETF, CFD, commodity, crypto, ...) linked to specific accounts. Calculates gain/loss percentage, invested value, and market value, with sortable holdings columns and separate System Assets and Personal Assets sections. Above the table, a By Asset doughnut and a single By Asset Type card that cycles through three modes — a By Asset Type doughnut (clicking a slice filters the holdings), a Type by Account vertical stacked bar showing each account's asset-type composition as percentages that always sum to 100%, and a Gain/Loss by Type bar chart with green gains and red losses.
- 🏦 **Accounts & Provider Management**: Providers are typed as bank, broker, or other. Accounts are typed as bank account, interest account, asset account, or loan; loans support payoff dates and interest calculations. Account History charts show account values over time.
- 🧮 **Loan Simulator**: Compare three principal-amortization scenarios—current payments, keeping the original term, and reducing the term—with payment, interest, principal, total-cost, and month-by-month comparisons.
- 🎯 **Financial Goals**: A split list and detail view. The list is in `order_by` order, with search, a status and type filter, move up/down, and a Shown on Dashboard pin on goal #1. The detail pane shows pace metrics, the existing progress bar, a path chart, sub-goals from the `subgoals` table (the block is hidden when there are none), a linked-account contribution donut, and a what-if pace preview that is not saved. Status chips and the statistics strip both use `goalStatusInfo` (On track, Behind, Achieved, No target date). The ⋯ menu is History, Simulate, Duplicate, and Delete.
- 💰 **Dividends Engine**: Track yield percentages and payout schedules by month for system assets (the payment calendar is reserved for system assets; personal assets carry a yield but no schedule).
- 💱 **Multi-Currency & Exchange Rates**: Multi-currency conversion support (USD, EUR, GBP, etc.) using stored ExchangeRate-API rates refreshed at most once per UTC day.
- 📅 **Growth Calendar**: A full-page view of daily portfolio growth with Month, Year, and All Time granularities. Month shows a 7-column day grid; Year shows one card per month; All Time shows one card per year that has data. Positive periods are green and negative periods red. Multi-select account and account-type filters, plus an asset-accounts toggle, control which values are counted. Clicking a day with a snapshot enters Time Travel for that day.
- 🕰 **Time Travel (Snapshots)**: Save and replay historical daily snapshots of your dashboard to visualize net worth growth over time via calendar, timeline, and playback controls. History supports Global, By Type, By Provider, By Account, By Account Type, By Growth, and an all-account min/current/max range chart with separate scales for loans and other accounts, plus exact min/current/max values. Historical charts offer All, Monthly, Yearly, YTD, and Current Month zoom levels, Assets/Liabilities labels, and cleanup tools to retain the latest snapshot per historical month or year (the oldest snapshot is always preserved).
- 📈 **Simulation**: Available once at least one account exists. A principal-only Global Value corridor uses the Dashboard's all-time monthly pace, with an in-memory pace preview, 5/10/20-year ranges, and an illustrative +5% path that compounds only while the balance is positive. FIRE lines use six complete months of My Expenses and the profile monthly-expense figure, both as `monthly × 12 × 25`. Next stop is a full-width card on top (the next power of ten, plus a ladder). Account drivers sit below it in their own card: Monthly is the lifetime average and YTD is the change since 1 January, in up to three groups with dividers and no total row.
- 👁 **Privacy Blur Mode**: Quick keyboard shortcut (`H` key or toggle button) to blur sensitive monetary figures when viewing the app in public spaces; monetary chart axes are hidden and tooltip values show `hidden` while visuals remain sharp.
- ⌨️ **Keyboard Shortcuts**: `H` toggles privacy blur and is ignored while typing. `S` saves today's snapshot and `R` refreshes all data; both are ignored while typing or while a modal is open. Left and right arrow keys step through snapshots unless focus is in a field, the Goals list, or the what-if input. Up and down in the Goals list move between rows and do not reorder them.
- ⏳ **Loading Modal**: A progress modal covers the app during the initial load, sign-in, and manual refresh, listing each step being performed and checking them off as they complete. It closes automatically when the work finishes.
- 👤 **Access Control**:
  - **Admin**: User management, database tools, asset price refreshes, global configuration.
  - **User / Member**: Full CRUD over private portfolios, accounts, holdings, and goals. Admin-created accounts can only be `user` or `admin`.
  - **Guest Mode**: A temporary, isolated interactive demo available only from the login screen; it is not a stored user role, and changes remain local and are not persisted.
- 📱 **Progressive Web App (PWA)**: Fully responsive mobile/desktop experience with an installable app manifest and service-worker caching for the application shell. The shell cache name in `sw.js` is `portfolio-manager-v26`. Snapshot history is cached per user and navigation can use retained data, but authentication, live API data, and unsaved changes still require the application/backend environment.
- 📄 **Adaptive Pagination**: Currency and snapshot lists adapt their pagination controls to the available screen width for a usable desktop and mobile layout.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Hosting** | Cloudflare Pages |
| **Backend / API** | Cloudflare Pages Functions (Serverless Workers - Single catch-all route) |
| **Database** | Cloudflare D1 (Serverless SQLite, binding `myd1db`) |
| **Frontend** | Vanilla HTML5, CSS3 (Custom Variables & Responsive Design), JS (ES Modules) |
| **Data Visualization** | Chart.js |
| **Authentication** | Secure `HttpOnly` Session Cookies + `bcrypt` password hashing |
| **External APIs** | Twelve Data, Massive.com, and Finnhub (US stock prices), ExchangeRate-API (Currency Rates) |

---

## 📁 Repository Structure

```
portfolio/
├── index.html              # Main Single-Page Application (SPA) shell
├── sw.js                   # Service Worker for PWA functionality
├── manifest.webmanifest    # Web App Manifest for installation
├── _routes.json            # Cloudflare Pages routing rule configuration
├── schema.sql              # D1 schema reference (tables, indexes, triggers, asset_type seed)
├── package.json            # Scripts & dependencies (Wrangler, bcryptjs)
├── package-lock.json       # Locked dependency tree
├── wrangler.toml           # Cloudflare Wrangler development configuration
├── project.md              # Implementation-backed project documentation
├── css/
│   └── portfolio.css       # Complete design system, layouts, modals, & theme variables
├── js/
│   └── portfolio.js        # Core client application logic and state management
├── functions/
│   └── api/
│       └── [[path]].js     # Cloudflare Worker API router and endpoints
└── icons/                  # Application icons & favicons
```

`schema.sql` is tracked in the repository and is the reference for the D1 table definitions. The deployed database is managed separately; one-off migrations are applied manually with `wrangler d1 execute`.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/)
- [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (included in `devDependencies`)

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rafaelrebeca/portfolio.git
   cd portfolio
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start local development server**:
   ```bash
   npm run dev
   ```
   This executes `wrangler pages dev .`, starting a local Cloudflare Pages server with D1 database emulation.

4. **Access local application**:
   Open [http://localhost:8788](http://localhost:8788) in your browser.

---

## 🔑 Environment Variables & Secrets

The live Cloudflare Pages deployment uses the following server-side secrets:

| Secret | Description |
|---|---|
| `STOCK_API_KEY_TWELVEDATA` | API key for Twelve Data US stock prices (7 calls/min) |
| `STOCK_API_KEY_MASSIVE` | API key for Massive.com previous-trading-day US stock closes (4 calls/min) |
| `STOCK_API_KEY_FINHUB` | API key for Finnhub.io real-time / current stock quote prices (1 call every 2s) |
| `API_KEY` | API key for ExchangeRate-API exchange-rate data |

For local development, provide these values through local Wrangler configuration or another local secret mechanism. Never commit real API keys or other credentials to the repository.

---

## ⚡ Deployment

To deploy updates directly to Cloudflare Pages:

```bash
npm run deploy
```

This runs `wrangler pages deploy . --project-name portfolio-manager`.

---

## 🔒 Security & Privacy

- **Session Security**: Session tokens are stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies with automated 7-day expiration. Password changes revoke existing sessions.
- **Password Security**: Passwords are hashed with `bcrypt`. Self-service changes require the current password.
- **Privacy Shield**: Built-in visual blur mode allows safe viewing in open or shared environments.

---

## 📜 License

Private Project — All Rights Reserved.
