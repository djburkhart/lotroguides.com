# LOTRO Guides

A fansite for **Lord of the Rings Online** — guides, news, databases, an interactive map, and a full-featured content editor, built with a Markdown-powered static site generator.

🌐 **Live site:** [lotroguides.com](https://lotroguides.com)

## Features

- **Guides** — In-depth guides for raids, instances, crafting, leveling, legendary items, and class builds
- **Instance Database** — 80+ instance/raid detail pages with per-boss loot tables, skill breakdowns, and strategy notes
- **Item Database** — Searchable items database with sharded lazy loading (38,000+ items)
- **Deed, Mob, Quest, Set & Virtue Databases** — Filterable client-side databases with dedicated pages
- **Interactive Map** — LOTRO world map with quest POI overlays and embeddable map views
- **Media** — YouTube video library with category filtering
- **News** — Aggregated and original LOTRO news articles
- **Content Editor** — ProseMirror-based Markdown editor with custom widget nodes (DPS, map, consumable tables, instance loot), image upload, dirty tracking, and auto-draft
- **Comments** — Cusdis-powered comment widget on article and instance pages, gated behind reCAPTCHA Enterprise
- **Browser Extension** — Chrome extension for exporting in-game data via the LOTRO Bridge plugin
- **Clean URLs** — All internal links are extensionless
- **CDN Integration** — DigitalOcean Spaces for images and data with versioning support

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
templates/            HTML templates and partials
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
  github/             Serverless GitHub OAuth + Device Flow function
  recaptcha/          Serverless reCAPTCHA Enterprise assessment function
  quests/             Serverless quest search/lookup function
  cusdis/             Serverless Cusdis webhook function
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

## License

This project is licensed under the [MIT License](LICENSE).

© 2026 Daniel Burkhart
