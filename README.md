# LOTRO Guides

A fansite for **Lord of the Rings Online** — guides, news, and community content built with a Markdown-powered static site generator.

🌐 **Live site:** [lotroguides.com](https://lotroguides.com)

## Features

- **Guides** — In-depth guides for beginners, crafting, legendary items, and more
- **News** — Aggregated and original LOTRO news articles
- **News scraper** — Automatically pulls the latest articles from lotro.com
- **Static site generator** — Converts Markdown content into themed HTML pages
- **Watch mode** — Rebuilds pages on file changes during development

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

**Watch for changes and rebuild automatically:**

```bash
npm run watch
```

**Scrape latest news from lotro.com:**

```bash
npm run scrape
```

**Scrape news and rebuild:**

```bash
npm run scrape:build
```

**Run the static server locally:**

```bash
npm start
```

The server starts on port `8080` by default (override with the `PORT` environment variable).

## Deployment

This site is configured for [DigitalOcean App Platform](https://docs.digitalocean.com/products/app-platform/) using the Node.js buildpack.

1. Push the repo to GitHub.
2. Create a new App on DigitalOcean App Platform and connect the repository.
3. App Platform auto-detects Node.js, runs `npm run build`, then `npm start` to serve the site.

No extra configuration is needed — the `engines`, `build`, and `start` scripts in `package.json` handle everything.

## Project Structure

```
content/          Markdown source files (guides & news)
templates/        HTML templates and partials
css/              Site stylesheets
js/               Site scripts
plugins/          Third-party libraries (Bootstrap, Font Awesome, etc.)
guides/           Built guide pages (HTML output)
news/             Built news pages (HTML output)
img/              Images for guides and news
build.js          Static site generator
serve.js          Static file server (for production / App Platform)
scrape-news.js    LOTRO.com news scraper
```

## Writing Content

Add Markdown files to `content/guides/` or `content/news/` with YAML front matter, then run `npm run build`. The build system converts them to HTML using the templates in `templates/`.

## License

This project is licensed under the [MIT License](LICENSE).

© 2026 Daniel Burkhart
