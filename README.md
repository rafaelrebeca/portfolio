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

- 📊 **Interactive Dashboard**: Real-time visual overview of net worth, total investments, cash reserves, loan balances, asset allocations, and projected monthly/annual dividend income. The Growth card cycles through All-Time, YTD, and Month views; account cards show up/down/unchanged indicators and top movers; breakdown charts switch between Provider and Account views.
- 💼 **My Portfolio & Holdings**: Detailed view of stock, bond, ETF, CFD, and commodity positions linked to specific accounts. Calculates gain/loss percentage, invested value, and market value, with sortable holdings columns and separate System Assets and Personal Assets sections.
- 🏦 **Accounts & Provider Management**: Supports bank accounts, brokerage accounts, high-yield interest accounts, and loan tracking with payoff dates and interest calculations. Account History charts show account values over time.
- 🧮 **Loan Simulator**: Compare three principal-amortization scenarios—current payments, keeping the original term, and reducing the term—with payment, interest, principal, total-cost, and month-by-month comparisons.
- 🎯 **Financial Goals Tracker**: Create multi-tiered financial goals linked directly to specific accounts or overall savings milestones. Goals support ordering, up to three milestones, Goal History charts, and goal simulations.
- 💰 **Dividends Engine**: Track yield percentages and payout schedules by month across all held assets.
- 💱 **Multi-Currency & Exchange Rates**: Multi-currency conversion support (USD, EUR, GBP, etc.) using stored ExchangeRate-API rates refreshed at most once per UTC day.
- 🕰 **Time Travel (Snapshots)**: Save and replay historical daily snapshots of your dashboard to visualize net worth growth over time via calendar, timeline, and playback controls. History supports Global, By Type, By Provider, By Account, and By Growth charts, with cleanup tools to retain the latest snapshot per historical month or year.
- 📈 **Simulation**: Explore principal-only Global Value projections at 1, 5, 10, and 20 years using the Dashboard's monthly growth pace, with All-Time/YTD/Month account contribution views, dynamic paths to €0 or the next power-of-ten milestone, and an optional +5% annual-growth scenario.
- 👁 **Privacy Blur Mode**: Quick keyboard shortcut (`H` key or toggle button) to blur sensitive monetary figures when viewing the app in public spaces.
- 👤 **Role-Based Access Control**:
  - **Admin**: User management, database tools, asset price refreshes, global configuration.
  - **User / Member**: Full CRUD over private portfolios, accounts, holdings, and goals.
  - **Guest Mode**: Isolated interactive demo mode populated with sample data; changes remain local and are not persisted.
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
| **External APIs** | Massive.com (Stock Prices API), ExchangeRate-API (Currency Rates) |

---

## 📁 Repository Structure

```
portfolio/
├── index.html              # Main Single-Page Application (SPA) shell
├── sw.js                   # Service Worker for PWA functionality
├── manifest.webmanifest    # Web App Manifest for installation
├── _routes.json            # Cloudflare Pages routing rule configuration
├── package.json            # Scripts & dependencies (Wrangler, bcryptjs)
├── wrangler.toml           # Cloudflare Wrangler development configuration
├── css/
│   └── portfolio.css       # Complete design system, layouts, modals, & theme variables
├── js/
│   └── portfolio.js        # Core client application logic and state management
├── functions/
│   └── api/
│       └── [[path]].js     # Cloudflare Worker API router and endpoints
└── icons/                  # Application icons & favicons
```

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
| `STOCK_API_KEY` | API key for Massive.com previous-trading-day US stock closes |
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
