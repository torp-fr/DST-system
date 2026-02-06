# CLAUDE.md — DST-SYSTEM

## Project Overview

**DST-SYSTEM** (Drill & Skills Training) is an internal strategic management tool for a French tactical training company. It serves as a command post for the company director to manage economics, human resources, training modules, clients, sessions, and strategic alerts.

**Domain**: Simulation, operational training, stress management, decision-making training for law enforcement, military, and security personnel.

**Tech stack**: Vanilla HTML/CSS/JS — no frameworks, no build step, no external dependencies. Opens directly in a browser. Data persisted via localStorage.

## Repository Structure

```
DST-system/
├── index.html                 # App entry point (SPA shell)
├── css/
│   └── styles.css             # Complete design system (dark theme)
├── js/
│   ├── db.js                  # Data persistence layer (localStorage CRUD)
│   ├── engine.js              # Economic calculation engine
│   ├── app.js                 # Main app: router, sidebar, header, alerts
│   └── views/
│       ├── dashboard.js       # Executive dashboard with KPIs and alerts
│       ├── clients.js         # Client management (CRUD + detail + history)
│       ├── offers.js          # Offers & subscriptions (CRUD + clone + floor price)
│       ├── sessions.js        # Sessions (links everything, cost breakdown)
│       ├── operators.js       # Operator pool / HR (bidirectional cost calc)
│       ├── modules.js         # Training modules catalog (incompatibilities)
│       ├── locations.js       # Training locations (module compatibility)
│       └── settings.js        # Economic parameters (editable, export/import)
├── img/                       # Logo placeholder directory
├── .github/workflows/
│   └── blank.yml              # GitHub Actions CI template
├── .gitignore
├── README
└── CLAUDE.md
```

## Architecture

### Data Layer (`js/db.js`)
- Generic CRUD factory over localStorage with prefix `dst_`
- Entities: `operators`, `modules`, `clients`, `offers`, `sessions`, `locations`
- Settings stored separately with defaults and `update()` merge
- Full `exportAll()` / `importAll()` / `clearAll()` support
- Each record gets auto-generated `id`, `createdAt`, `updatedAt`

### Economic Engine (`js/engine.js`)
- **HR bidirectional calculation**: `netToCompanyCost()` and `companyCostToNet()` for all operator statuses (freelance, interim, CDD, CDI, contrat journalier, fondateur)
- **Status comparison**: `compareAllStatuses()` for HR arbitrage
- **Session cost computation**: `computeSessionCost()` — operators + modules + variable costs + fixed cost share + amortization share = total cost, then margin, floor price, alerts
- **Global alert engine**: `computeAllAlerts()` — floor breach, low margin, operator overload, CDI threshold, dependency risk, unprofitable modules
- **Dashboard KPIs**: `computeDashboardKPIs()` — active clients, upcoming sessions, margins, revenue, operator load

### App Shell (`js/app.js`)
- Hash-based SPA router (`#dashboard`, `#clients`, etc.)
- Sidebar with navigation sections (Pilotage, Gestion opérationnelle, Ressources, Configuration)
- Header with context date and alerts panel
- Each route maps to a `Views.X.render(container)` call

### View Modules (`js/views/*.js`)
Each module follows the pattern:
```js
window.Views = window.Views || {};
Views.ModuleName = { render(container) { ... } };
```

All HTML is generated as template strings, set via `innerHTML`, with event listeners attached after rendering. Each view handles its own search/filter state locally.

## Key Conventions

- **Language**: All UI text, comments, and labels are in **French**
- **No frameworks**: Pure vanilla JS, CSS, HTML
- **No build step**: Open `index.html` in a browser to run
- **Data persistence**: localStorage (key prefix: `dst_`)
- **CSS**: Custom properties (CSS vars) for theming, BEM-lite class names
- **Security**: All user input is HTML-escaped before rendering (XSS prevention)
- **Module pattern**: IIFE or object literal with `render(container)` method
- **Alerts are informative, never blocking**: The system warns but never prevents actions

## Visual Identity

- **Dark theme**: anthracite/black backgrounds (`#1a1a1e`, `#222228`)
- **Light text**: white/grey (`#e8e8ec`, `#a0a0a8`)
- **Red = signal only**: alerts, thresholds, critical decisions (`#d32f2f`)
- **No fun colors, no SaaS marketing aesthetics**
- **Institutional, operational, sober** design

## Key Commands

```bash
# Run the app — just open in a browser:
open index.html
# or
python3 -m http.server 8000  # then visit localhost:8000

# No build, no install, no dependencies required
```

## CI / GitHub Actions

- **Workflow**: `.github/workflows/blank.yml` — placeholder template
- **Triggers**: push/PR on `main` + manual dispatch
- **Status**: Needs real CI steps when testing is added

## Economic Model (Core Business Logic)

The economic engine tracks:
1. **Fixed costs** (annual, parameterizable) — split across estimated sessions/year
2. **Equipment amortization** — purchase price / duration in years
3. **Variable costs per session** — transport, consumables, rental
4. **Operator costs** — computed from status and daily rate (bidirectional)
5. **Module costs** — fixed + variable surcharges per training module
6. **Floor price** = total cost + 5% safety margin — alerts if price is below
7. **Margin** = revenue - total cost — compared against target margin

## Notes for AI Assistants

1. **No build step** — changes are immediately visible by refreshing the browser
2. **Script load order matters** — `db.js` → `engine.js` → view modules → `app.js` (see `index.html`)
3. **All views are self-contained** — each `js/views/*.js` file handles its own rendering, events, and state
4. **DB and Engine are global singletons** — accessed as `DB.operators.getAll()`, `Engine.computeSessionCost()`, etc.
5. **To add a new view**: create `js/views/newview.js`, add script tag to `index.html`, register route in `app.js` routes object
6. **Settings changes require save** — the settings view keeps a working copy in memory, only committed to localStorage on save
7. **Session completion triggers subscription tracking** — when a session status changes to `terminee` and is linked to an abonnement offer, `sessionsConsumed` is incremented
8. **Operator costs are zero until assigned** — operators exist in a pool and only contribute cost when attached to a session
