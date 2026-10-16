# LOTRO Guides

A fansite for **Lord of the Rings Online** — guides, news, databases, and an interactive map. Editorial content is managed in **Strapi** and rendered by a **Next.js** app. Game databases stay as generated JSON and the existing browser tools.

🌐 **Live site:** [lotroguides.com](https://lotroguides.com)

## Features

### Content & Databases
- **Guides** — In-depth guides for raids, instances, crafting, leveling, legendary items, and class builds
- **Instance Database** — 80+ instance/raid detail pages with per-boss loot tables, skill breakdowns, and strategy notes
- **Item Database** — Searchable items database with sharded lazy loading (38,000+ items across 7 shards)
- **Quest Database** — Server-side paginated quest browser with search, category filters, and level range filtering
- **Title Database** — 3,035 character titles with in-game category icons and category filtering
- **Faction Database** — 105 factions with tier progression, LOTRO Points rewards, and reputation deed cross-links
- **Recipe Database** — 7,753 crafting recipes with ingredient/result item links and in-game icons
- **Deed, Mob, Set & Virtue Databases** — Filterable client-side databases with dedicated pages
- **Interactive Map** — LOTRO world map with quest POI overlays and embeddable map views
- **Media** — YouTube video library with category filtering
- **News** — Aggregated and original LOTRO news articles

### Tools & Interactivity
- **Skills & Trait Builder** — Interactive trait planner for all LOTRO classes with save, share, and embed functionality
- **Content Editor** — Strapi admin for guides, news, pages, videos, and homepage settings. Article Markdown keeps map and trait-planner shortcodes
- **Discord Bot** — Slash commands (`/quest`, `/deed`, `/item`, `/map`, `/build`, `/statcaps`) with live autocomplete powered by DO Function APIs
- **Comments** — Cusdis-powered comment widget on article and instance pages, gated behind reCAPTCHA Enterprise

### Infrastructure
- **Serverless Functions** — DigitalOcean Functions for quest lookup (SSP), deed lookup, CDN upload, reCAPTCHA, GitHub auth, Cusdis webhooks, and Discord interactions
- **CDN Integration** — DigitalOcean Spaces for images and data with versioning support
- **Clean URLs** — All internal links are extensionless

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later)

### Installation

```bash
git clone https://github.com/your-username/lotroguides.com.git
cd lotroguides.com
npm install
npm install --prefix cms
npm install --prefix web
```

### Usage

**Start Strapi and Next.js together:**

```bash
npm run dev
```

- Site: http://localhost:3000
- Strapi admin: http://localhost:1337/admin

The first launch asks you to create a Strapi admin user, then imports guides, news, pages, videos, and site settings from `content/`. Set `STRAPI_RESEED=true` to import again.

**Production:**

```bash
npm run build
npm start
```

`npm start` runs Strapi on port 1337 and Next.js on `PORT` (default 3000). Use Postgres in production by setting `DATABASE_CLIENT=postgres` and `DATABASE_URL` in `cms/.env`.

**Update content from external sources:**

```bash
npm run update          # Run all update scripts
npm run update:news     # Scrape latest news from lotro.com
npm run update:loot     # Import loot data from LOTRO Companion exports
npm run update:skills   # Enrich instance skill data
npm run update:lore     # Extract lore text
npm run update:icons    # Extract item icons
npm run update:videos   # Fetch YouTube video metadata
```

**Sync built assets to CDN:**

```bash
npm run sync
```

**Deploy serverless functions to DigitalOcean:**

```bash
npm run deploy:functions              # deploy all functions
npm run deploy:functions recaptcha    # deploy only recaptcha
npm run deploy:functions cdn github   # deploy specific packages
```

## Deployment

`npm run build` builds the Strapi admin and the Next.js app. `npm start` runs both processes. Point the public HTTP port at Next.js. Strapi listens on 127.0.0.1:1337 for the Next.js server.

Game-data JSON is still produced by the import scripts and downloaded during `prebuild`.

## Project Structure

```
cms/                  Strapi 5 content API (articles, pages, videos, site settings)
web/                  Next.js App Router frontend
content/              Markdown source imported into Strapi on first boot
templates/            Database, map, bot, and trait-builder markup
data/                 Generated game databases (items, quests, maps, instances)
js/ css/ plugins/ img/  Client assets linked into web/public
scripts/              Data imports, asset linking, and the Strapi + Next process runner
packages/             Discord, quest, deed, and other serverless functions
```

## Writing Content

Create and edit guides, news, pages, videos, and homepage settings in the Strapi admin at http://localhost:1337/admin. Article bodies stay in Markdown and can include the existing shortcodes (`{{map:...}}`, `{{traitPlanner:...}}`).

The first boot copies `content/guides/` and `content/news/` into Strapi. After that, Strapi is the source the site reads. If Strapi is not running, Next.js renders those Markdown files directly.

## Changelog

### [2.5.1] — 2026-04-04
- **reCAPTCHA submit-time verification** — Moved assessment from page-load gating to comment submit time; widget renders immediately
- **Discord bot with autocomplete** — `/quest`, `/deed`, `/item` commands use Discord autocomplete with live results from DO Function APIs
- **Deed lookup function** — New `packages/deeds/lookup` deployed to DigitalOcean Functions with search, filter, and pagination

### [2.5.0] — 2026-04-04
- **Trait Planner editor widget** — ProseMirror widget for `{{traitPlanner:class=X,build=Y,level=Z}}` tokens
- **Embedded trait planner template** — `embedded-trait-planner.html` built via `buildEmbeddedTraitPlanner()`
- **Instance mob filtering** — Mob Database links on instance pages filter to instance-specific mobs
- **CSS Celtic knotwork navbar** — Pure CSS pattern with lotro.com-style gold gradient text and nav hover effects
- **Barad Guldur loot restructured** — Reorganized from flat entries to properly grouped bosses with chest tiers

### [2.2.0] — 2026-04-03
- **Skills & Trait Builder page** — Interactive trait planner for all LOTRO classes
- **reCAPTCHA Enterprise** — Fully wired into App Platform with DO Function
- **Quest lookup function** — `packages/quests/lookup` with search API and in-memory caching
- **Cusdis comments webhook** — `packages/cusdis/webhook` for comment notifications

### [2.1.0] — 2026-04-02
- **Cusdis comments** — Comment widget on guide, news, and instance pages
- **GitHub Device Flow auth** — Editor OAuth with Google ID token verification
- **CDN preconnect hints** — Faster resource loading
- **Deferred script loading** — jQuery, Bootstrap, and theme scripts use `defer`

### [2.0.0] — 2026-04-02
- **Instance, Item, Deed, Mob, Quest, Set & Virtue databases** — Full searchable/filterable databases
- **Interactive map** — LOTRO world map with quest POI overlays
- **ProseMirror editor** — Custom widget nodes, toolbar, image upload, dirty tracking, auto-draft
- **CDN integration** — DigitalOcean Spaces upload with versioning
- **Browser extension** — Chrome extension for LOTRO data export
- **11 guide pages** and **80+ instance detail pages**

### [1.0.0] — 2026-03-29
- Static site generator with Markdown + YAML front matter
- News scraper, HTML templates, custom LOTRO-themed styling

See [CHANGELOG.md](CHANGELOG.md) for the full detailed changelog.

## License

This project is licensed under the [MIT License](LICENSE).

© 2026 Daniel Burkhart
