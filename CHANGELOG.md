# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.6.3] - 2026-04-09

### Added

- **Editor draft & publish system** — Articles can be saved as drafts (with `draft: true` frontmatter) to CDN or disk, then published or unpublished independently; build system skips draft articles from the live site
- **Save Draft button** — Uploads article to CDN/disk with `draft: true` in frontmatter, with localStorage backup; auto-draft on idle saves to localStorage
- **Publish button** — Uploads article without `draft: true`, making it live; removes local draft backup on success
- **Unpublish button** — Moved to editor panel header so it's always visible for published articles; re-uploads with `draft: true` to hide from the live site
- **Article status badge** — Shows "Published" (green) or "Draft" (amber) in the editor panel header
- **Draft badge in article list** — Local-only drafts show an amber "draft" badge; published articles with local edits show a "local" badge; server-side drafts show "draft" in place of the category badge
- **Editor preview toggle** — Slide switch in the editor header renders the current markdown as formatted HTML with title, date, author, excerpt, and featured image in a read-only preview pane
- **localStorage draft helpers** — `saveLocalDraft()`, `loadLocalDraft()`, `deleteLocalDraft()`, `getLocalDraftIndex()` for browser-side draft persistence

### Changed

- **Build system** — `loadContent()` skips articles with `draft: true` frontmatter; `buildEditorPage()` scans source files directly for the editor manifest (including drafts with a `draft` flag)
- **CDN upload function** — `updateEditorManifest()` includes `draft` field in manifest entries when present in frontmatter

## [2.6.2] - 2026-04-07

### Added

- **Discord `/title` command** — Look up any of 3,035 LOTRO titles with autocomplete search, category badges, and in-game icon thumbnails
- **Discord `/faction` command** — Look up any of 105 reputation factions with tier progression, LOTRO Points totals, and custom LP emoji
- **Discord `/recipe` command** — Look up any of 7,753 crafting recipes with profession, tier, ingredients, result item links, recipe scroll links, and icon thumbnails
- **Discord command registration** — Registration script updated from 7 to 10 slash commands

## [2.6.1] - 2026-04-07

### Added

- **Title detail modal** — Clicking a title opens a detail modal showing category badge and description; URL updates to `?id=` for deep-linking and shareable links
- **Faction & Recipe URL deep-linking** — Faction and recipe modals now update the browser URL with `?id=` for shareable direct links
- **GA4 analytics events** — Faction, recipe, and title modals push `select_content` events to dataLayer for tracking

### Changed

- **Enhanced DataTable search** — Title, faction, and recipe tables now include category, description, profession, and other metadata in the search filter for richer full-text results
- **DataTable performance** — Faction and recipe tables use `deferRender` for faster initial load, increased default page size to 100, and consistent column widths

## [2.6.0] - 2026-04-07

### Added

- **Title Database** — Searchable database of 3,035 character titles with in-game category icons extracted from LotRO Companion data (13 unique title icons)
- **Faction Database** — 105 factions across 11 regions with tier progression tables, LOTRO Points rewards using the in-game LP icon, and reputation deed icons linking to the Deed Database
- **Recipe Database** — 7,753 crafting recipes across 10 professions with ingredient/result item cross-links, in-game item icons (99.9% coverage via icon-map), and filterable by profession, tier, and category
- **Emote Database** — 267 emotes imported with in-game icons (214 unique emote icons extracted from LotRO Companion)
- **XP Table** — Level progression data for 200 levels imported from lotro-data-master
- **Geographic Areas** — 6 regions, 83 territories, and 664 areas imported for location cross-referencing
- **Icon extraction pipeline** — `extract-icons.js` extended with title icon (section 7) and emote icon (section 8) extraction from LotRO Companion ZIP archives
- **Recipe cross-links in Item Database** — Items now show "Crafted By" and "Used In" recipe badges linking to the Recipe Database (5,455 crafted-by, 249 used-in)
- **Dark modal table styling** — Tables inside dark modals (faction, recipe) now have gold column headers, proper dark-theme row striping, and themed link colors

### Changed

- **Navigation** — Database dropdown expanded with Title, Faction, and Recipe links
- **Build pipeline** — `buildRecipesPage()` injects result-item icons from icon-map.json at build time; `buildTitlesPage()` and `buildFactionsPage()` produce enriched JSON with icon data
- **Faction modal** — Region-themed FontAwesome icons per category, reputation deed icons with deed name links, LOTRO Points icon replacing generic diamond icon, readable table styling for dark background

## [2.5.3] - 2026-04-05

### Added

- **Discord bot** — Full Discord Interactions endpoint (`packages/discord/interact`) with slash commands: `/quest`, `/deed`, `/item`, `/map`, `/build`, `/guide`, `/statcaps`. Includes Ed25519 signature verification, autocomplete handlers for quest/deed/item/guide, deferred response with webhook follow-up for slow queries, and rich embeds matching the site's visual style
- **`/guide` command** — Links to guides on lotroguides.com with autocomplete search by title, category, or slug across all 14 guides
- **`/statcaps` command** — Calculates LOTRO stat caps using Giseldah formulas for any class, level, and penetration preset; contributed via PR #1
- **Deeds DO Function** — Serverless deed search/lookup (`packages/deeds/lookup`) with `?q=`, `?id=`, filter, and pagination support; used by Discord bot autocomplete
- **Community Builds API** — Serverless build save/like/delete (`packages/builds/save`) backed by DigitalOcean Spaces S3 storage with manifest-based listing and per-class stats
- **Build delete system** — Users can delete their own community builds from the library
- **Discord command registration script** — `scripts/register-discord-commands.js` registers all 7 slash commands with Discord API via bulk PUT

### Changed

- **Skills page community builds** — Trait Builder now loads/saves/likes/deletes builds via the Builds API; browse builds modal with like counts and class filtering
- **CDN upload URL** — Fixed 404 by pointing `CDN_UPLOAD_URL` to standalone DO Functions URL instead of App Platform `/api` route

### Fixed

- **CDN storage error** — Added `DO_SPACES_*` env vars to `.do/app.yaml` functions component; builds function now correctly connects to DigitalOcean Spaces
- **CI build fix** — Minor build pipeline correction

## [2.5.1] - 2026-04-04

### Changed

- **reCAPTCHA Enterprise submit-time verification** — Moved reCAPTCHA assessment from page-load gating to comment submit time; Cusdis widget now renders immediately and a capture-phase click handler intercepts Post/Reply, executes `grecaptcha.enterprise.execute()`, and interprets the assessment (action match + score ≥ 0.5) per [Google docs](https://cloud.google.com/recaptcha/docs/interpret-assessment-website) before allowing the comment through
- **Enriched assessment response** — DO Function (`packages/recaptcha/verify`) and local dev server now return `reasons`, `assessmentName`, `valid`, and `action` fields from the Enterprise API for downstream logging and annotation
- **reCAPTCHA score in dataLayer** — `comment_submit` GTM event now includes `recaptcha_score` for analytics

## [2.5.0] - 2026-04-04

### Added

- **Trait Planner editor widget** — Full ProseMirror widget for `{{traitPlanner:class=X,build=Y,level=Z}}` tokens with schema node, NodeView, markdown serializer, toolbar menu item, and modal with class/build/level selects that load from `data/builds/*.json`
- **Embedded trait planner template** — `embedded-trait-planner.html` moved to `templates/partials/` and built via `buildEmbeddedTraitPlanner()` with `{{assets}}` resolution
- **Instance mob filtering** — Mob Database links on instance pages now include `?instance=<slug>` parameter; `mobs-db.js` loads instance mob IDs from `instances-db.json` and filters the DataTable, showing an info banner with the instance name and clear-filter button
- **CSS Celtic knotwork navbar texture** — Pure CSS pattern replacing the `nav-bg-tile.png` image, using layered radial/linear gradients on `#header` with subtle interlocking knot motif and braid lines
- **lotro.com-style gold gradient text** — `.lotro-logo-text`, `.skills-title`, and `.lotro-hero-title` use `linear-gradient(to bottom, #f3f1ae 35%, #dab44f 60%)` with `background-clip: text` matching lotro.com's Trajan Pro styling
- **Nav hover effect** — Blue radial gradient on nav links via `::before` pseudo-element matching lotro.com's hover style
- **Site background** — `site-bg.webp` as fixed cover background on `body.fixed-header` for the Skills page, with semi-transparent `.skills-header` gradient overlay

### Changed

- **Barad Guldur loot restructured** — Loot data reorganized from flat chest-as-boss entries to properly grouped bosses (Durchest, Twins of Fire and Shadow, Lieutenant of Dol Guldur, General Loot) with chest tiers (Fancy/Fancier/Fanciest Wood Chest) under each
- **Instance guide image paths fixed** — Guide card images in instance pages now use `../` prefix for correct resolution from the `/instances/` subdirectory
- **Embedded trait planner background** — Removed alpha transparency from `.ltp-points-display` background (now solid `#000000`)
- **Navbar backdrop** — `#header .navbar-backdrop` set to transparent, texture pattern applied directly to `#header`

## [2.2.0] - 2026-04-03

### Added

- **Skills & Trait Builder page** — Interactive trait planner for all LOTRO classes with save and share functionality. Generates shareable URLs and embed codes for guide integration. Editor widget allows inserting trait builds into articles.
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
