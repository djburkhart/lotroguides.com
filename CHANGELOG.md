# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.2.0] - 2026-04-03

### Added

- **Favicon ICO generation** — Build step generates a multi-size `favicon.ico` (16×16, 32×32, 48×48) from `img/favicon.png` using sharp, fixing missing favicon in browsers that only check `/favicon.ico`
- **SVG favicon support** — `<link rel="icon" type="image/svg+xml">` added to base template alongside ICO and PNG declarations
- **reCAPTCHA Enterprise assessments** — DO Function (`packages/recaptcha/verify`) now fully wired into App Platform with correct `/api/recaptcha/verify` routing and required env vars (`RECAPTCHA_SECRET_KEY`, `RECAPTCHA_SITE_KEY`, `GOOGLE_CLOUD_PROJECT`) in `app.yaml`
- **Quest lookup serverless function** — New `packages/quests/lookup` function fetches quest-index from CDN and provides search/lookup API with in-memory caching
- **Cusdis comments webhook** — New `packages/cusdis/webhook` serverless function for comment notifications

### Changed

- Comment widget verification endpoint updated from `/api/verify-recaptcha` to `/api/recaptcha/verify` to match DO Functions routing conventions
- Local dev server (`serve.js`) updated to match the new reCAPTCHA endpoint path

## [2.1.0] - 2026-04-02

### Added

- **Cusdis comments** — Comment widget on guide, news, and instance pages with reCAPTCHA Enterprise gating and graceful fallback
- **GitHub Device Flow authentication** — Editor now uses GitHub Device Flow for OAuth, gated behind Google ID token verification with allowed-email list
- **CDN preconnect hints** — `<link rel="preconnect">` for Google Fonts and CDN origin added to base template
- **GitHub auth serverless function** — `packages/github/auth` expanded with `device-code` and `device-poll` actions, Google ID token verification, and CORS support
- **GitHub Device Flow modal** — Full modal UI with copy-to-clipboard user code, auto-polling, and status feedback

### Changed

- **Deferred script loading** — jQuery, Bootstrap, and theme scripts now use `defer` attribute to unblock rendering
- **Font loading optimized** — Google Fonts loaded with `display=swap` for faster text paint
- Removed Facebook SDK integration (unused)
- Removed `animate.min.css` dependency (unused)

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
