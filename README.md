# LOTRO Guides

A fansite for **Lord of the Rings Online** — guides, news, databases, an interactive map, and a full-featured content editor, built with a Markdown-powered static site generator.

🌐 **Live site:** [lotroguides.com](https://lotroguides.com)

## Features

### Content & Databases
- **Guides** — In-depth guides for raids, instances, crafting, leveling, legendary items, and class builds
- **Instance Database** — 80+ instance/raid detail pages with per-boss loot tables, skill breakdowns, and strategy notes
- **Item Database** — Searchable items database with sharded lazy loading (38,000+ items across 7 shards)
- **Quest Database** — Server-side paginated quest browser with search, category filters, and level range filtering
- **Deed, Mob, Set & Virtue Databases** — Filterable client-side databases with dedicated pages
- **Interactive Map** — LOTRO world map with quest POI overlays and embeddable map views
- **Media** — YouTube video library with category filtering
- **News** — Aggregated and original LOTRO news articles

### Tools & Interactivity
- **Skills & Trait Builder** — Interactive trait planner for all LOTRO classes with save, share, and embed functionality
- **Content Editor** — ProseMirror-based Markdown editor with custom widget nodes (DPS, map, consumable tables, instance loot, quest/deed cards, trait planner), image upload, dirty tracking, and auto-draft
- **Discord Bot** — Slash commands (`/quest`, `/deed`, `/item`, `/map`, `/build`) with live autocomplete powered by DO Function APIs
- **Comments** — Cusdis-powered comment widget on article and instance pages, gated behind reCAPTCHA Enterprise

### Infrastructure
- **Serverless Functions** — DigitalOcean Functions for quest lookup (SSP), deed lookup, CDN upload, reCAPTCHA, GitHub auth, Cusdis webhooks, and Discord interactions
- **CDN Integration** — DigitalOcean Spaces for images and data with versioning support
- **Clean URLs** — All internal links are extensionless

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v22 or later)

### Installation

```bash
git clone https://github.com/your-username/lotroguides.com.git
cd lotroguides.com
npm install
```

### Usage

**Build the site:**

```bash
npm run build
```

**Build and start the dev server:**

```bash
npm run dev
```

**Watch for changes and rebuild automatically:**

```bash
npm run watch
```

**Start the static server:**

```bash
npm start
```

The server starts on port `8080` by default (override with the `PORT` environment variable).

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

This site is configured for [DigitalOcean App Platform](https://docs.digitalocean.com/products/app-platform/) using the Node.js buildpack.

1. Push the repo to GitHub.
2. Create a new App on DigitalOcean App Platform and connect the repository.
3. App Platform auto-detects Node.js, runs `npm run build`, then `npm start` to serve the site.

The server supports clean URLs — requests for `/guides/crafting-guide` serve `guides/crafting-guide.html` automatically.

## Project Structure

```
build.js              Static site generator and esbuild bundler
serve.js              Static file server with clean URL routing and image upload API
src/
  editor.js           ProseMirror editor source (bundled to js/editor.bundle.js)
templates/            HTML templates and partials (includes skills-content.html)
content/
  guides/             Guide articles (Markdown or JSON)
  instances/          Instance articles and loot reference data
  news/               News articles (Markdown or JSON)
  media/              Media page content
  navigation.json     Site navigation structure
data/                 Pre-built JSON databases (items, instances, deeds, mobs, quests, sets, virtues)
scripts/
  scrape-news.js      LOTRO.com news scraper
  sync-cdn.js         CDN sync to DigitalOcean Spaces
  import-*.js         Data import scripts (loot, instances)
  enrich-*.js         Data enrichment scripts
  extract-*.js        Data extraction scripts (lore, icons, maps, quests)
  fetch-*.js          External data fetchers (YouTube)
css/                  Site stylesheets
js/                   Client-side database scripts and editor bundle
img/                  Images for guides, news, icons, and maps
guides/               Built guide pages (HTML output)
instances/            Built instance detail pages (HTML output)
news/                 Built news pages (HTML output)
packages/
  cdn/                Serverless CDN upload function with versioning
  cusdis/             Serverless Cusdis webhook function
  deeds/              Serverless deed search/lookup function
  discord/            Serverless Discord interactions endpoint (slash commands + autocomplete)
  github/             Serverless GitHub OAuth + Device Flow function
  quests/             Serverless quest search/lookup function (SSP + detail)
  recaptcha/          Serverless reCAPTCHA Enterprise assessment function
extension/            Chrome browser extension for LOTRO data export
plugins/              Third-party libraries (Bootstrap, Font Awesome, etc.)
```

## Writing Content

Add Markdown files or JSON articles to `content/guides/`, `content/instances/`, or `content/news/`, then run `npm run build`. The build system converts them to HTML using the templates in `templates/`.

JSON article format:

```json
{
  "slug": "my-article",
  "category": "guides",
  "title": "My Article Title",
  "date": "2026-04-02",
  "author": "Author Name",
  "tags": ["tag1", "tag2"],
  "image": "https://cdn.example.com/image.jpg",
  "excerpt": "A short description.",
  "markdown": "# Article content in Markdown..."
}
```

You can also use the built-in editor at `/editor` to create and edit articles with a live preview.

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
