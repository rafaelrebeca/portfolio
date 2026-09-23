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

- 📊 **Interactive Dashboard**: Real-time visual overview of net worth, assets, liabilities, cash reserves, loan balances, asset allocations, and projected monthly/annual dividend income. The Growth card cycles through All-Time, YTD, and Month views; account cards show up/down/unchanged indicators, total change, and top movers; breakdown charts switch between Type/Change and Provider/Account views. The Top Goal Status card shows the leading goal's progress plus an estimated reach date and monthly growth pace when snapshot history exists.
- 💼 **My Portfolio & Holdings**: Detailed view of positions across the asset types defined in the `asset_type` table (stock, bond, ETF, CFD, commodity, crypto, ...) linked to specific accounts. Calculates gain/loss percentage, invested value, and market value, with sortable holdings columns and separate System Assets and Personal Assets sections. Above the table, a By Asset doughnut and a single By Asset Type card that cycles through three modes — a By Asset Type doughnut (clicking a slice filters the holdings), a Type by Account vertical stacked bar showing each account's asset-type composition as percentages that always sum to 100%, and a Gain/Loss by Type bar chart with green gains and red losses.
- 🏦 **Accounts & Provider Management**: Providers are typed as bank, broker, or other. Accounts are typed as bank account, interest account, asset account, or loan; loans support payoff dates and interest calculations. Account History charts show account values over time.
- 🧮 **Loan Simulator**: Compare three principal-amortization scenarios—current payments, keeping the original term, and reducing the term—with payment, interest, principal, total-cost, and month-by-month comparisons.
- 🎯 **Financial Goals Tracker**: Create multi-tiered financial goals linked directly to specific accounts or overall savings milestones. Goals support ordering, any number of sub-goals added and removed in the goal form, Goal History charts, and goal simulations. Each goal shows its monthly growth pace and an estimated reach date (e.g. `Est: Oct 2026 (~8 mos)`) computed from linked-account snapshot history. Goals can carry an optional target date; when set, a compact on-track badge (🟢/🔴) appears next to the goal name and the details show the extra monthly amount needed (off track) or the surplus pace (on track). A Goal Statistics card above the list summarizes total goals, on-track/off-track/achieved/no-target-date counts, and best/worst performers judged by projected reach date.
- 💰 **Dividends Engine**: Track yield percentages and payout schedules by month for system assets (the payment calendar is reserved for system assets; personal assets carry a yield but no schedule).
- 💱 **Multi-Currency & Exchange Rates**: Multi-currency conversion support (USD, EUR, GBP, etc.) using stored ExchangeRate-API rates refreshed at most once per UTC day.
- 📅 **Growth Calendar**: A full-page view of daily portfolio growth with Month, Year, and All Time granularities. Month shows a 7-column day grid; Year shows one card per month; All Time shows one card per year that has data. Positive periods are green and negative periods red. An asset-accounts toggle switches between counting every account and excluding asset accounts. Clicking a day with a snapshot enters Time Travel for that day.
- 🕰 **Time Travel (Snapshots)**: Save and replay historical daily snapshots of your dashboard to visualize net worth growth over time via calendar, timeline, and playback controls. History supports Global, By Type, By Provider, By Account, By Account Type, and By Growth charts, with All, Monthly, Yearly, YTD, and Current Month zoom levels, Assets/Liabilities labels, and cleanup tools to retain the latest snapshot per historical month or year (the oldest snapshot is always preserved).
- 📈 **Simulation**: Available once at least one account exists. Explore principal-only Global Value projections at 1, 5, 10, and 20 years using the Dashboard's monthly growth pace, with All-Time/YTD/Month account contribution views, clickable paths to €0, the next power-of-ten milestone, Path to FIRE (auto) based on average portfolio-level losses, or Path to FIRE (user) using custom profile monthly expenses, plus estimated FIRE progress lines and optional +5% annual-growth scenario.
- 👁 **Privacy Blur Mode**: Quick keyboard shortcut (`H` key or toggle button) to blur sensitive monetary figures when viewing the app in public spaces; monetary chart axes are hidden and tooltip values show `hidden` while visuals remain sharp.
- ⌨️ **Keyboard Shortcuts**: `H` toggles privacy blur, `S` saves today's snapshot, `R` refreshes all data, and the left/right arrow keys step through snapshots in Time Travel. Single-key shortcuts are ignored while typing in a field or while a modal is open.
- ⏳ **Loading Modal**: A progress modal covers the app during the initial load, sign-in, and manual refresh, listing each step being performed and checking them off as they complete. It closes automatically when the work finishes.
- 👤 **Access Control**:
  - **Admin**: User management, database tools, asset price refreshes, global configuration.
  - **User / Member**: Full CRUD over private portfolios, accounts, holdings, and goals. Admin-created accounts can only be `user` or `admin`.
  - **Guest Mode**: A temporary, isolated interactive demo available only from the login screen; it is not a stored user role, and changes remain local and are not persisted.
- 📱 **Progressive Web App (PWA)**: Fully responsive mobile/desktop experience with an installable app manifest and service-worker caching for the application shell. Snapshot history is cached per user and navigation can use retained data, but authentication, live API data, and unsaved changes still require the application/backend environment.
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

- **Session Security**: Session tokens are stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies with automated 7-day expiration.
- **Password Security**: Passwords are standardly hashed using `bcrypt` before storage.
- **Privacy Shield**: Built-in visual blur mode allows safe viewing in open or shared environments.

---

## 📜 License

Private Project — All Rights Reserved.
