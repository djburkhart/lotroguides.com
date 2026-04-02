const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Configuration ──────────────────────────────────────────────────────────
const LOTRO_HOME_URL = 'https://www.lotro.com/home';
const LOTRO_BASE_URL = 'https://www.lotro.com';
const NEWS_DIR = path.join(__dirname, 'content', 'news');
const TRACKING_FILE = path.join(NEWS_DIR, '.scraped.json');

// ─── HTTP Helpers ───────────────────────────────────────────────────────────
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'LOTRO-Fansite-Scraper/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${LOTRO_BASE_URL}${res.headers.location}`;
        fetchPage(redirectUrl).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

// ─── Feed Extraction ────────────────────────────────────────────────────────
// The LOTRO homepage embeds news data as JSON in SOE.Feeds.news.data,
// SOE.Feeds.guides.data, and SOE.Feeds.updateNotes.data variables.

function extractFeedData(html, feedName) {
  const pattern = new RegExp(
    `SOE\\.Feeds\\.${feedName}\\.data\\s*=\\s*(\\{[\\s\\S]*?\\});`
  );
  const match = html.match(pattern);
  if (!match) return [];

  try {
    const data = JSON.parse(match[1]);
    return data.list || [];
  } catch {
    return [];
  }
}

function extractAllNews(html) {
  const news = extractFeedData(html, 'news');
  const guides = extractFeedData(html, 'guides');
  const updateNotes = extractFeedData(html, 'updateNotes');

  const toArticle = (item, category) => ({
    title: item.title,
    summary: stripHtml(item.summary || ''),
    date: item.start_date,
    slug: item.pageName,
    thumbnail: item.thumbnail || '',
    category,
    url: `${LOTRO_BASE_URL}/${category === 'update-notes' ? 'update-notes' : category}/${item.pageName}`,
  });

  return [
    ...news.map(i => toArticle(i, 'news')),
    ...guides.map(i => toArticle(i, 'guides')),
    ...updateNotes.map(i => toArticle(i, 'update-notes')),
  ];
}

// ─── HTML-to-Markdown Conversion ────────────────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToMarkdown(html) {
  return html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
    .replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[uo]l[^>]*>/gi, '\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractArticleBody(html) {
  // The LOTRO article pages embed content similarly — look for article body
  // Try several container patterns
  const patterns = [
    /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="share|<\/section)/i,
    /<div[^>]*class="[^"]*post-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="share|<\/section)/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return htmlToMarkdown(match[1]);
  }

  // Fallback: look for the summary data embedded in SSG
  const ssgMatch = html.match(/window\.SSG\.article\s*=\s*(\{[\s\S]*?\});/);
  if (ssgMatch) {
    try {
      const data = JSON.parse(ssgMatch[1]);
      if (data.summary) return htmlToMarkdown(data.summary);
    } catch { /* ignore */ }
  }

  return null;
}

// ─── Date Formatting ────────────────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
}

// ─── Tag Generation ─────────────────────────────────────────────────────────
function generateTags(article) {
  const tags = [];
  const lower = (article.title + ' ' + article.summary).toLowerCase();

  if (article.category === 'update-notes') tags.push('update-notes');
  if (article.category === 'news') tags.push('news');
  if (article.category === 'guides') tags.push('guide');

  if (lower.includes('release notes')) tags.push('patch-notes');
  if (lower.includes('sale') || lower.includes('discount') || lower.includes('20% off')) tags.push('sales');
  if (lower.includes('bonus')) tags.push('bonus');
  if (lower.includes('festival') || lower.includes('spring') || lower.includes('yule')) tags.push('events');
  if (lower.includes('housing')) tags.push('housing');
  if (lower.includes('raid') || lower.includes('instance')) tags.push('instances');
  if (lower.includes('pvmp') || lower.includes('monster play')) tags.push('pvmp');
  if (lower.includes('soundtrack') || lower.includes('music')) tags.push('soundtrack');
  if (lower.includes('twitch') || lower.includes('stream')) tags.push('livestream');
  if (lower.includes('pax') || lower.includes('meetup')) tags.push('community');

  if (tags.length === 0) tags.push('official');
  return tags;
}

// ─── Tracking ───────────────────────────────────────────────────────────────
function loadTracking() {
  if (fs.existsSync(TRACKING_FILE)) {
    return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf-8'));
  }
  return { scraped: [] };
}

function saveTracking(tracking) {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(tracking, null, 2));
}

// ─── Markdown Generation ────────────────────────────────────────────────────
function createMarkdownPost(article, bodyContent) {
  const date = formatDate(article.date);
  const tags = generateTags(article);
  const safeTitle = article.title.replace(/"/g, '\\"');
  const excerpt = (article.summary || bodyContent.substring(0, 200).replace(/\n/g, ' '))
    .substring(0, 300)
    .replace(/"/g, '\\"');

  return `---
title: "${safeTitle}"
date: ${date}
author: "LOTRO.com"
tags: [${tags.join(', ')}]
image: "${article.thumbnail}"
excerpt: "${excerpt}"
source: "${article.url}"
---

${bodyContent}

---

*This article was originally published on [lotro.com](${article.url}).*
`;
}

// ─── CLI Args ───────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const latestIdx = args.indexOf('--latest');
  const all = args.includes('--all');
  let limit = 10; // Default: only fetch the 10 most recent new articles
  if (all) limit = Infinity;
  else if (latestIdx !== -1 && args[latestIdx + 1]) limit = parseInt(args[latestIdx + 1], 10) || 10;
  return { limit };
}

// ─── Main Scraper ───────────────────────────────────────────────────────────
async function scrapeNews() {
  const { limit } = parseArgs();
  console.log('🔍 Scraping LOTRO news from lotro.com...');
  if (limit !== Infinity) console.log(`   (limiting to ${limit} newest articles — use --all for everything)`);
  console.log();

  const tracking = loadTracking();
  const existingSlugs = new Set(tracking.scraped);

  // Also check existing markdown files
  if (fs.existsSync(NEWS_DIR)) {
    fs.readdirSync(NEWS_DIR)
      .filter(f => f.endsWith('.md'))
      .forEach(f => existingSlugs.add(path.basename(f, '.md')));
  }

  // Fetch the LOTRO homepage
  let homepageHtml;
  try {
    homepageHtml = await fetchPage(LOTRO_HOME_URL);
  } catch (err) {
    console.error(`❌ Failed to fetch LOTRO homepage: ${err.message}`);
    process.exit(1);
  }

  // Extract all news from embedded JSON feeds
  const articles = extractAllNews(homepageHtml);
  console.log(`   Found ${articles.length} total articles on lotro.com`);

  // Filter to new articles only
  const newArticles = articles.filter(a => !existingSlugs.has(a.slug));
  if (newArticles.length === 0) {
    console.log('   ✔ No new articles to scrape. Everything is up to date.');
    return;
  }

  // Apply limit
  const toFetch = newArticles.slice(0, limit);
  console.log(`   📰 ${toFetch.length} article(s) to fetch${newArticles.length > toFetch.length ? ` (${newArticles.length - toFetch.length} more available with --all)` : ''}\n`);

  let created = 0;
  for (const article of toFetch) {
    console.log(`   Fetching: ${article.title}`);

    let bodyContent = '';
    try {
      const articleHtml = await fetchPage(article.url);
      bodyContent = extractArticleBody(articleHtml);
    } catch (err) {
      console.warn(`   ⚠ Could not fetch article page: ${err.message}`);
    }

    // Fallback to summary if full article extraction failed
    if (!bodyContent || bodyContent.length < 20) {
      bodyContent = `# ${article.title}\n\n${article.summary || 'Read the full article on lotro.com.'}`;
    }

    const markdown = createMarkdownPost(article, bodyContent);
    const filePath = path.join(NEWS_DIR, `${article.slug}.md`);

    fs.writeFileSync(filePath, markdown, 'utf-8');
    console.log(`   ✓ Created: content/news/${article.slug}.md`);

    tracking.scraped.push(article.slug);
    created++;

    // Respectful delay between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  saveTracking(tracking);

  console.log(`\n✅ Scrape complete — ${created} new article(s) created`);
  if (created > 0) {
    console.log('   Run "npm run build" to regenerate the site.');
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────
scrapeNews().catch(err => {
  console.error('❌ Scraper error:', err.message);
  process.exit(1);
});
