# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-04-02

### Added

- **Instances database** — Full instance/raid database (`instances-db.json`) with per-boss loot tables, skill breakdowns, and instance detail pages
- **Items database** — Sharded items database (`items-db-0.json` through `items-db-6.json`) with manifest-based lazy loading
- **Deeds, Mobs, Quests, Sets, Virtues databases** — Searchable/filterable client-side databases with dedicated pages
- **Interactive map** — LOTRO world map with quest POI overlays and embedded map views
- **Media page** — YouTube video library with category filtering
- **ProseMirror editor** — Full-featured Markdown editor (`src/editor.js`) bundled with esbuild, replacing previous Milkdown/Crepe editor
  - Custom widget nodes: DPS widget, map widget, consumable widget, instance loot reference widget
  - Toolbar with insert-widget support
  - NodeView rendering for all custom widgets
  - Dirty tracking with Save Changes bar and auto-draft
  - Per-article JSON format (`{slug, category, title, date, author, tags, image, excerpt, markdown}`)
  - Image upload with file picker — local dev upload via `serve.js` or CDN upload via serverless function
- **CDN integration** — DigitalOcean Spaces upload with versioning and restore support (`packages/cdn/upload/index.js`)
- **CDN sync script** (`scripts/sync-cdn.js`) — Syncs built assets to DO Spaces with proper MIME types
- **Data import scripts** — `import-lotro-companion-loot.js`, `import-all-instance-loot.js`, `import-instances.js`, `enrich-instance-skills.js`, `extract-lore.js`, `extract-icons.js`, `fetch-youtube-videos.js`
- **Consumable table tokenization** — Reusable consumable/buff tables via `{{consumable:token}}` syntax in guides
- **Auto-linker** — Build-time linking of item, quest, and mob names to their database pages
- **Browser extension** — Chrome extension (`extension/`) for exporting game data via the LOTRO Bridge plugin
- **Clean URLs** — All internal links are extensionless (e.g., `/guides/crafting-guide` instead of `/guides/crafting-guide.html`)
- 11 guide pages covering raids, instances, crafting, leveling, and class builds
- 80+ instance detail pages with loot tables and strategy breakdowns
- About page with project info

### Changed

- `serve.js` now supports clean URL routing with directory-to-HTML fallback, multipart image upload API, and proper MIME types for `.xml` and `.txt`
- Favicon uses absolute path (`/img/favicon.png`) for reliable loading across all routes
- Sitemap and robots.txt served with correct MIME types
- Navigation supports subdirectory pages with separate `subDirNavData` for proper relative links
- All scripts moved to `scripts/` directory with corrected `__dirname` paths

## [1.0.0] - 2026-03-29

### Added

- Static site generator (`build.js`) with Markdown + YAML front matter support
- Watch mode for automatic rebuilds during development
- News scraper (`scrape-news.js`) for pulling articles from lotro.com
- HTML templates with partial support
- Guides: Beginner's Guide, Crafting Guide, Legendary Items Guide
- News section with scraped and original articles
- Custom LOTRO-themed styling
- Bootstrap-based responsive layout
