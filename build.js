const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const sharp = require('sharp');

// ─── Configuration ──────────────────────────────────────────────────────────
const CONTENT_DIR = path.join(__dirname, 'content');
const TEMPLATE_DIR = path.join(__dirname, 'templates');
const OUTPUT_DIR = __dirname; // Output into lotro/ root
const ASSETS_PREFIX = '';   // Relative path to parent theme assets
const SITE_BASE_URL = 'https://lotroguides.com';
const GOOGLE_ADSENSE_ACCOUNT = process.env.GOOGLE_ADSENSE_ACCOUNT || '';
const LORE_DIR = path.join(__dirname, 'data', 'lore');

// ─── Lore / Item Index ─────────────────────────────────────────────────────
let itemIndex = {};
let questIndex = {};
let mapMarkerIndexCache = null;

function loadItemIndex() {
  const indexPath = path.join(LORE_DIR, 'item-index.json');
  if (!fs.existsSync(indexPath)) {
    console.log('   ℹ No lore data found — run: node scripts/extract-lore.js');
    return;
  }
  itemIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  console.log(`   📇 Loaded item index (${Object.keys(itemIndex).length} entries)`);
}

function loadQuestIndex() {
  const questsPath = path.join(LORE_DIR, 'quests.json');
  if (!fs.existsSync(questsPath)) {
    questIndex = {};
    return;
  }

  const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8'));
  const idx = {};
  for (const q of quests) {
    const name = (q.n || q.name || '').trim();
    if (!name) continue;
    idx[name] = { id: q.id, lv: q.lv, cat: q.cat };
  }
  questIndex = idx;
  console.log(`   🧭 Loaded quest index (${Object.keys(questIndex).length} entries)`);
}

function normalizeLookupName(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadMapMarkerIndex() {
  if (mapMarkerIndexCache) return mapMarkerIndexCache;

  const dir = path.join(LORE_DIR, 'map-markers');
  const byDid = {};
  const byLabel = {};

  if (!fs.existsSync(dir)) {
    mapMarkerIndexCache = { byDid, byLabel };
    return mapMarkerIndexCache;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const mapId = path.basename(file, '.json');
    const markers = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const mk of markers) {
      const row = {
        map: mapId,
        lng: mk.lng,
        lat: mk.lat,
        l: mk.l || '',
      };
      if (mk.d && !byDid[mk.d]) byDid[mk.d] = row;
      const key = normalizeLookupName(mk.l);
      if (key && !byLabel[key]) byLabel[key] = row;
    }
  }

  mapMarkerIndexCache = { byDid, byLabel };
  return mapMarkerIndexCache;
}

function findMarkerLocation(markerIndex, did, label) {
  if (did && markerIndex.byDid[did]) return markerIndex.byDid[did];
  const key = normalizeLookupName(label);
  if (key && markerIndex.byLabel[key]) return markerIndex.byLabel[key];
  return null;
}

/**
 * Auto-link known item/consumable/mob names within HTML content.
 * - Only matches names 8+ chars to avoid false positives
 * - Matches longest names first (greedy)
 * - Only links the first occurrence of each name per article
 * - Wraps in <a class="lotro-item" data-item-id="..." data-item-type="...">
 * - Skips content inside HTML tags (href, alt, etc.)
 */
function autoLinkItems(html) {
  if (!Object.keys(itemIndex).length) return html;

  // Build list of names to match: 8+ chars, sorted longest-first.
  // Keep deed/set linking in their dedicated linkers to avoid overlap.
  const allowedTypes = new Set(['item', 'consumable', 'quest-reward', 'virtue']);
  const names = Object.keys(itemIndex)
    .filter(n => n.length >= 8 && allowedTypes.has(itemIndex[n].type))
    .sort((a, b) => b.length - a.length);

  if (!names.length) return html;

  const linked = new Set();

  // Process each name — only match in text content, not inside tags
  for (const name of names) {
    if (linked.has(name)) continue;

    // Escape regex special chars in the item name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match whole-word only, case-insensitive, not inside HTML tags
    const regex = new RegExp(`(?<![<\\w/])\\b(${escaped})\\b(?![^<]*>)`, 'i');
    const match = html.match(regex);

    if (match) {
      const entry = itemIndex[name];
      // Link to our own items database page (articles live in subdir)
      const itemUrl = `../items.html?id=${entry.id}`;
      const qualityClass = entry.quality ? ` lotro-${entry.quality}` : '';
      const typeLabel = entry.type === 'consumable' ? entry.subtype || 'consumable' : entry.type;

      // Build tooltip data attribute with stats
      let tooltipData = '';
      if (entry.stats && entry.stats.length) {
        const statStr = entry.stats
          .filter(s => s.value !== 0)
          .slice(0, 6)
          .map(s => `${s.stat}: ${s.value.toLocaleString()}`)
          .join(' | ');
        tooltipData = ` data-item-stats="${statStr.replace(/"/g, '&quot;')}"`;
      }

      const replacement = `<a href="${itemUrl}" class="lotro-item${qualityClass}" data-item-type="${typeLabel}"${tooltipData}>${match[0]}</a>`;

      html = html.replace(match[0], replacement);
      linked.add(name);
    }
  }

  return html;
}

/**
 * Auto-link known mob names within HTML content.
 * Same approach as autoLinkItems but for mobs only.
 */
function autoLinkMobs(html) {
  if (!Object.keys(itemIndex).length) return html;

  const names = Object.keys(itemIndex)
    .filter(n => n.length >= 8 && itemIndex[n].type === 'mob')
    .sort((a, b) => b.length - a.length);

  if (!names.length) return html;

  const linked = new Set();

  for (const name of names) {
    if (linked.has(name)) continue;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![<\\w/])\\b(${escaped})\\b(?![^<]*>)`, 'i');
    const match = html.match(regex);

    if (match) {
      const entry = itemIndex[name];
      const mobUrl = `../mobs.html?id=${entry.id}`;
      const genusInfo = entry.genus ? ` data-mob-genus="${entry.genus}"` : '';
      const speciesInfo = entry.species ? ` data-mob-species="${entry.species}"` : '';
      const replacement = `<a href="${mobUrl}" class="lotro-mob" data-mob-id="${entry.id}"${genusInfo}${speciesInfo}>${match[0]}</a>`;

      html = html.replace(match[0], replacement);
      linked.add(name);
    }
  }

  return html;
}

/**
 * Auto-link known set names within HTML content.
 */
function autoLinkSets(html) {
  if (!Object.keys(itemIndex).length) return html;

  const names = Object.keys(itemIndex)
    .filter(n => n.length >= 10 && itemIndex[n].type === 'set')
    .sort((a, b) => b.length - a.length);

  if (!names.length) return html;

  const linked = new Set();

  for (const name of names) {
    if (linked.has(name)) continue;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![<\\w/])\\b(${escaped})\\b(?![^<]*>)`, 'i');
    const match = html.match(regex);

    if (match) {
      const entry = itemIndex[name];
      const setUrl = `../sets.html?id=${entry.id}`;
      const replacement = `<a href="${setUrl}" class="lotro-set" data-set-id="${entry.id}">${match[0]}</a>`;

      html = html.replace(match[0], replacement);
      linked.add(name);
    }
  }

  return html;
}

/**
 * Auto-link known deed names within HTML content.
 */
function autoLinkDeeds(html) {
  if (!Object.keys(itemIndex).length) return html;

  const names = Object.keys(itemIndex)
    .filter(n => n.length >= 10 && itemIndex[n].type === 'deed')
    .sort((a, b) => b.length - a.length);

  if (!names.length) return html;

  const linked = new Set();

  for (const name of names) {
    if (linked.has(name)) continue;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![<\\w/])\\b(${escaped})\\b(?![^<]*>)`, 'i');
    const match = html.match(regex);

    if (match) {
      const entry = itemIndex[name];
      const deedUrl = `../deeds.html?id=${entry.id}`;
      const replacement = `<a href="${deedUrl}" class="lotro-deed" data-deed-type="${entry.deedType || ''}">${match[0]}</a>`;

      html = html.replace(match[0], replacement);
      linked.add(name);
    }
  }

  return html;
}

/**
 * Auto-link known quest names within HTML content.
 */
function autoLinkQuests(html) {
  if (!Object.keys(questIndex).length) return html;

  const deedNames = new Set(
    Object.keys(itemIndex).filter(n => itemIndex[n].type === 'deed')
  );

  const names = Object.keys(questIndex)
    .filter(n => n.length >= 12)
    .filter(n => n.trim().split(/\s+/).length >= 3)
    .filter(n => !deedNames.has(n))
    .sort((a, b) => b.length - a.length);

  if (!names.length) return html;

  const linked = new Set();

  for (const name of names) {
    if (linked.has(name)) continue;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const first = escaped.charAt(0);
    const hasAsciiLetter = /^[A-Za-z]$/.test(first);
    const leading = hasAsciiLetter
      ? `[${first.toLowerCase()}${first.toUpperCase()}]${escaped.slice(1)}`
      : escaped;
    const regex = new RegExp(`(?<![<\\w/])\\b(${leading})\\b(?![^<]*>)`);
    const match = html.match(regex);

    if (match) {
      const entry = questIndex[name];
      const questUrl = `../quests.html?id=${entry.id}`;
      const levelInfo = entry.lv ? ` data-quest-level="${entry.lv}"` : '';
      const catInfo = entry.cat ? ` data-quest-category="${String(entry.cat).replace(/"/g, '&quot;')}"` : '';
      const replacement = `<a href="${questUrl}" class="lotro-quest"${levelInfo}${catInfo}>${match[0]}</a>`;

      html = html.replace(match[0], replacement);
      linked.add(name);
    }
  }

  return html;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf-8');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '');
}

function truncate(text, maxLen) {
  const plain = stripHtml(text);
  if (plain.length <= maxLen) return plain;
  return plain.substring(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

// ─── Image Optimization ────────────────────────────────────────────────────

// Cache of image dimensions: { 'img/guides/foo.jpg': { width: 800, height: 450 } }
const imageMeta = {};

async function convertImagesToWebp() {
  const imgDir = path.join(OUTPUT_DIR, 'img');
  if (!fs.existsSync(imgDir)) return;

  const extensions = ['.jpg', '.jpeg', '.png'];

  async function processDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const tasks = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        tasks.push(processDir(fullPath));
      } else if (extensions.includes(path.extname(entry.name).toLowerCase())) {
        const webpPath = fullPath.replace(/\.(jpe?g|png)$/i, '.webp');
        const relPath = path.relative(OUTPUT_DIR, fullPath).replace(/\\/g, '/');

        // Read dimensions and cache them
        tasks.push(
          sharp(fullPath).metadata().then(meta => {
            imageMeta[relPath] = { width: meta.width, height: meta.height };
            const webpRel = relPath.replace(/\.(jpe?g|png)$/i, '.webp');
            imageMeta[webpRel] = { width: meta.width, height: meta.height };
          }).catch(() => {})
        );

        // Skip conversion if WebP already exists and is newer than source
        if (fs.existsSync(webpPath) && fs.statSync(webpPath).mtimeMs >= fs.statSync(fullPath).mtimeMs) {
          continue;
        }

        tasks.push(
          sharp(fullPath)
            .webp({ quality: 80 })
            .toFile(webpPath)
            .then(() => console.log(`   ✓ webp: ${path.relative(OUTPUT_DIR, webpPath)}`))
            .catch(err => console.warn(`   ⚠ webp failed: ${path.relative(OUTPUT_DIR, fullPath)} — ${err.message}`))
        );
      }
    }
    await Promise.all(tasks);
  }

  await processDir(imgDir);
}

/**
 * Post-process HTML to upgrade <img> tags with SEO best practices:
 * - Wraps in <picture> with WebP <source> + original fallback
 * - Adds loading="lazy", decoding="async"
 * - Adds width/height attributes from cached metadata to prevent CLS
 * - Preserves existing alt text
 */
function optimizeImages(html) {
  return html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
    const srcMatch = attrs.match(/src=["']([^"']+)["']/);
    if (!srcMatch) return match;

    const src = srcMatch[1];
    const ext = path.extname(src).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) return match;

    // Derive WebP path
    const webpSrc = src.replace(/\.(jpe?g|png)$/i, '.webp');

    // Extract existing alt text
    const altMatch = attrs.match(/alt=["']([^"']*)["']/);
    const alt = altMatch ? altMatch[1] : '';

    // Extract existing class
    const classMatch = attrs.match(/class=["']([^"']*)["']/);
    const cls = classMatch ? ` class="${classMatch[1]}"` : '';

    // Extract existing style
    const styleMatch = attrs.match(/style=["']([^"']*)["']/);
    const style = styleMatch ? ` style="${styleMatch[1]}"` : '';

    // Look up dimensions — try with the src as-is and with ../ stripped
    const lookupKey = src.replace(/^\.\.\//g, '');
    const meta = imageMeta[lookupKey] || imageMeta[src] || null;
    const dims = meta ? ` width="${meta.width}" height="${meta.height}"` : '';

    return `<picture>` +
      `<source srcset="${webpSrc}" type="image/webp">` +
      `<img src="${src}" alt="${alt}"${cls}${style}${dims} loading="lazy" decoding="async">` +
      `</picture>`;
  });
}

// ─── Template Engine ────────────────────────────────────────────────────────
// Simple placeholder replacement: {{variable}}
function render(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

function buildPage(bodyContent, pageData) {
  const baseTemplate = readTemplate('base.html');
  const assetsPrefix = pageData.assets || ASSETS_PREFIX;
  const siteRoot = pageData.siteRoot || '';
  return render(baseTemplate, {
    title: pageData.title || 'LOTRO Guides & News',
    metaDescription: pageData.metaDescription || 'Lord of the Rings Online guides, news, and community content.',
    bodyClass: pageData.bodyClass || 'fixed-header',
    content: bodyContent,
    assets: assetsPrefix,
    year: new Date().getFullYear().toString(),
    currentGuides: pageData.currentPage === 'guides' ? 'active' : '',
    currentNews: pageData.currentPage === 'news' ? 'active' : '',
    currentHome: pageData.currentPage === 'home' ? 'active' : '',
    currentAbout: pageData.currentPage === 'about' ? 'active' : '',
    currentItems: pageData.currentPage === 'items' ? 'active' : '',
    currentMobs: pageData.currentPage === 'mobs' ? 'active' : '',
    currentVirtues: pageData.currentPage === 'virtues' ? 'active' : '',
    currentSets: pageData.currentPage === 'sets' ? 'active' : '',
    currentDeeds: pageData.currentPage === 'deeds' ? 'active' : '',
    currentQuests: pageData.currentPage === 'quests' ? 'active' : '',
    currentMap: pageData.currentPage === 'map' ? 'active' : '',
    siteRoot,
    guideNavItems: pageData.guideNavItems || '',
    newsNavItems: pageData.newsNavItems || '',
    ogUrl: pageData.ogUrl || SITE_BASE_URL,
    ogImage: pageData.ogImage || `${SITE_BASE_URL}/img/default.jpg`,
    googleAdsenseAccount: GOOGLE_ADSENSE_ACCOUNT,
  });
}

// ─── Content Loading ────────────────────────────────────────────────────────
function loadContent(subdir) {
  const dir = path.join(CONTENT_DIR, subdir);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  return files.map(file => {
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
    const { data, content } = matter(raw);
    const htmlContent = marked(content);
    const slug = path.basename(file, '.md');

    // Normalize image path to be relative to lotro/ root
    let image = data.image || null;
    if (image && image.startsWith('../lotro/')) {
      image = image.slice('../lotro/'.length);
    }

    return {
      ...data,
      slug,
      content: htmlContent,
      excerpt: data.excerpt || truncate(htmlContent, 200),
      date: data.date || '2026-01-01',
      formattedDate: formatDate(data.date || '2026-01-01'),
      category: subdir,
      url: `${subdir}/${slug}.html`,
      image,
      tags: data.tags || [],
    };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ─── Legacy HTML Scanner ────────────────────────────────────────────────────
// Picks up scraped HTML articles in the output dir that have no markdown source

function loadLegacyHtml(subdir) {
  const htmlDir = path.join(OUTPUT_DIR, subdir);
  const mdDir = path.join(CONTENT_DIR, subdir);
  if (!fs.existsSync(htmlDir)) return [];

  const mdSlugs = new Set();
  if (fs.existsSync(mdDir)) {
    fs.readdirSync(mdDir).filter(f => f.endsWith('.md'))
      .forEach(f => mdSlugs.add(path.basename(f, '.md')));
  }

  return fs.readdirSync(htmlDir)
    .filter(f => f.endsWith('.html') && !mdSlugs.has(path.basename(f, '.html')))
    .map(file => {
      const slug = path.basename(file, '.html');
      const html = fs.readFileSync(path.join(htmlDir, file), 'utf-8');

      // Extract metadata from generated HTML
      const titleMatch = html.match(/<h2 class="post-title">([\s\S]*?)<\/h2>/);
      const dateMatch = html.match(/<span><i class="fa fa-clock-o"><\/i>\s*(.*?)<\/span>/);
      const authorMatch = html.match(/<span><i class="fa fa-user"><\/i>\s*(.*?)<\/span>/);
      const descMatch = html.match(/<meta name="description" content="(.*?)">/);

      // Only look for a featured/hero image in the post content area, not related posts
      const postContentMatch = html.match(/<div class="post post-single">([\s\S]*?)<\/div>\s*<div class="post-actions">/);
      const postContent = postContentMatch ? postContentMatch[1] : '';
      const imgMatch = postContent.match(/<img[^>]*class="[^"]*post-img[^"]*"[^>]*src="([^"]*)"/) ||
                       postContent.match(/<img[^>]*src="((?!\.\.\/img\/default\.jpg)[^"]*)"/);

      const title = titleMatch ? titleMatch[1].trim() : slug;
      const dateStr = dateMatch ? dateMatch[1].trim() : '2026-01-01';
      let image = imgMatch ? imgMatch[1] : null;
      if (image && image.startsWith('../')) image = image.slice(3);

      return {
        title,
        slug,
        content: '',
        excerpt: descMatch ? descMatch[1] : '',
        date: dateStr,
        formattedDate: dateStr,
        category: subdir,
        url: `${subdir}/${slug}.html`,
        image,
        tags: [],
        author: authorMatch ? authorMatch[1].trim() : 'LOTRO.com',
        legacy: true,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ─── Nav Generation ─────────────────────────────────────────────────────────

function buildNavItems(posts, siteRoot, limit) {
  return posts.slice(0, limit).map(p =>
    `<li><a href="./${siteRoot}${p.url}">${p.title}</a></li>`
  ).join('\n                      ');
}

function classifyGuide(post) {
  const tags = (post.tags || []).map(t => String(t).toLowerCase());
  const title = String(post.title || '').toLowerCase();

  const hasAny = (words) => words.some(w => tags.includes(w) || title.includes(w));

  if (hasAny(['raid', 't2', 't2c', 'instance', 'dungeon'])) return 'raid';
  if (hasAny(['class', 'build', 'hunter', 'champion', 'captain', 'burglar', 'minstrel', 'warden', 'runekeeper', 'rune-keeper', 'beorning', 'mariner', 'lore-master', 'guardian'])) return 'class';
  if (hasAny(['leveling', 'levelling', 'beginner', 'new-player', 'getting-started', 'starter-zones'])) return 'leveling';
  if (hasAny(['crafting', 'legendary-items', 'li', 'systems'])) return 'systems';
  return 'general';
}

function buildGuideQuickNavLinks(siteRoot) {
  const root = `./${siteRoot}guides.html`;
  const links = [
    { key: 'all', label: 'All Guides' },
    { key: 'raid', label: 'Raid Guides' },
    { key: 'class', label: 'Class Guides' },
    { key: 'leveling', label: 'Leveling Guides' },
    { key: 'systems', label: 'Systems Guides' },
    { key: 'general', label: 'General Guides' },
  ];

  return links.map(l => {
    const href = l.key === 'all' ? root : `${root}?filter=${l.key}`;
    return `<li><a href="${href}">${l.label}</a></li>`;
  }).join('\n                      ');
}

// ─── Page Generators ────────────────────────────────────────────────────────

function buildIndex(allPosts, navData) {
  const template = readTemplate('index-content.html');
  const latestPosts = allPosts.slice(0, 6);

  // Featured post (most recent)
  const featured = latestPosts[0];
  const featuredHtml = featured ? render(readTemplate('partials/featured-card.html'), {
    url: featured.url,
    image: featured.image || 'img/default.jpg',
    title: featured.title,
    date: featured.formattedDate,
    author: featured.author || 'Amdor',
    excerpt: featured.excerpt,
    category: featured.category === 'guides' ? 'Guide' : 'News',
    categoryClass: featured.category === 'guides' ? 'badge-success' : 'badge-primary',
    assets: ASSETS_PREFIX,
  }) : '';

  // Recent posts grid
  const recentPosts = latestPosts.slice(1);
  const cardTemplate = readTemplate('partials/post-card.html');
  const recentHtml = recentPosts.map(post => render(cardTemplate, {
    url: post.url,
    image: post.image || 'img/default.jpg',
    title: post.title,
    date: post.formattedDate,
    author: post.author || 'Amdor',
    excerpt: post.excerpt,
    category: post.category === 'guides' ? 'Guide' : 'News',
    categoryClass: post.category === 'guides' ? 'badge-success' : 'badge-primary',
    assets: ASSETS_PREFIX,
  })).join('\n');

  const body = render(template, {
    featuredPost: featuredHtml,
    recentPosts: recentHtml,
    assets: ASSETS_PREFIX,
    siteRoot: '',
  });

  return buildPage(body, { title: 'LOTRO Guides - LOTRO Fansite', currentPage: 'home', ...navData });
}

function buildListing(posts, category, navData) {
  const template = readTemplate('listing-content.html');
  const cardTemplate = readTemplate('partials/post-card.html');

  const categoryName = category === 'guides' ? 'Guides & Walkthroughs' : 'Latest News';
  const categoryIcon = category === 'guides' ? 'fa-book' : 'fa-newspaper-o';

  const postsHtml = posts.map(post => {
    const guideType = category === 'guides' ? classifyGuide(post) : '';
    const tagsAttr = (post.tags || []).map(t => String(t).toLowerCase()).join(',');
    const cardAttrs = category === 'guides'
      ? ` data-guide-type="${guideType}" data-guide-tags="${tagsAttr}"`
      : '';

    return render(cardTemplate, {
    url: post.url,
    image: post.image || 'img/default.jpg',
    title: post.title,
    date: post.formattedDate,
    author: post.author || 'Amdor',
    excerpt: post.excerpt,
    category: post.category === 'guides' ? 'Guide' : 'News',
    categoryClass: post.category === 'guides' ? 'badge-success' : 'badge-primary',
    cardAttrs,
    assets: ASSETS_PREFIX,
    });
  }).join('\n');

  let quickNav = '';
  if (category === 'guides') {
    quickNav = `
        <div class="m-b-20" id="guides-quick-nav">
          <a class="btn btn-sm btn-default" href="guides.html">All Guides</a>
          <a class="btn btn-sm btn-default" href="guides.html?filter=raid">Raid Guides</a>
          <a class="btn btn-sm btn-default" href="guides.html?filter=class">Class Guides</a>
          <a class="btn btn-sm btn-default" href="guides.html?filter=leveling">Leveling Guides</a>
          <a class="btn btn-sm btn-default" href="guides.html?filter=systems">Systems Guides</a>
          <a class="btn btn-sm btn-default" href="guides.html?filter=general">General Guides</a>
        </div>`;
  }

  const body = render(template, {
    categoryName,
    categoryIcon,
    quickNav,
    posts: postsHtml,
    assets: ASSETS_PREFIX,
  });

  const pageTitle = category === 'guides' ? 'Guides & Walkthroughs' : 'Latest News';
  let html = buildPage(body, {
    title: `${pageTitle} - LOTRO Guides`,
    currentPage: category,
    ...navData,
  });

  if (category === 'guides') {
    const filterScript = [
      '<script>',
      '(function(){',
      '  var params = new URLSearchParams(window.location.search);',
      '  var filter = (params.get("filter") || "all").toLowerCase();',
      '  if (!filter || filter === "all") return;',
      '  var cards = document.querySelectorAll("[data-guide-type]");',
      '  var shown = 0;',
      '  for (var i = 0; i < cards.length; i++) {',
      '    var card = cards[i];',
      '    var type = (card.getAttribute("data-guide-type") || "").toLowerCase();',
      '    var keep = type === filter;',
      '    card.style.display = keep ? "" : "none";',
      '    if (keep) shown++;',
      '  }',
      '  var quickNav = document.getElementById("guides-quick-nav");',
      '  if (quickNav) {',
      '    var links = quickNav.querySelectorAll("a");',
      '    for (var j = 0; j < links.length; j++) {',
      '      var href = (links[j].getAttribute("href") || "").toLowerCase();',
      '      if (href.indexOf("filter=" + filter) !== -1) links[j].classList.add("btn-primary");',
      '    }',
      '  }',
      '})();',
      '</script>',
    ].join('\n    ');
    html = html.replace('</body>', `    ${filterScript}\n  </body>`);
  }

  return html;
}

function buildArticle(post, relatedPosts, navData) {
  const template = readTemplate('article-content.html');
  const articleAssets = ASSETS_PREFIX + '/..';

  const tagsHtml = post.tags.map(t => `<a href="#">#${t}</a>`).join('\n                ');

  const relatedTemplate = readTemplate('partials/related-card.html');
  const relatedHtml = relatedPosts.slice(0, 4).map(rp => {
    const rpImg = rp.image
      ? (rp.image.startsWith('http') ? rp.image : `../${rp.image}`)
      : '../img/default.jpg';
    return render(relatedTemplate, {
      url: `../${rp.url}`,
      image: rpImg,
      title: rp.title,
      date: rp.formattedDate,
      excerpt: rp.excerpt,
      assets: articleAssets,
    });
  }).join('\n');

  const postImg = post.image
    ? (post.image.startsWith('http') ? post.image : `../${post.image}`)
    : '../img/default.jpg';
  const articleUrl = `${SITE_BASE_URL}/${post.url}`;
  const encodedTitle = encodeURIComponent(post.title);
  const ogImage = post.image && post.image.startsWith('http')
    ? post.image
    : `${SITE_BASE_URL}/${post.image || 'img/default.jpg'}`;
  const body = render(template, {
    title: post.title,
    date: post.formattedDate,
    author: post.author || 'Amdor',
    image: postImg,
    content: autoLinkQuests(autoLinkDeeds(autoLinkSets(autoLinkMobs(autoLinkItems(post.content))))),
    tags: tagsHtml,
    category: post.category === 'guides' ? 'Guides' : 'News',
    categoryUrl: post.category === 'guides' ? '../guides.html' : '../news.html',
    relatedPosts: relatedHtml,
    assets: articleAssets,
    articleUrl,
    encodedTitle,
  });

  return buildPage(body, {
    title: `${post.title} - LOTRO Guides`,
    metaDescription: post.excerpt,
    currentPage: post.category,
    assets: articleAssets,
    siteRoot: '../',
    ogUrl: articleUrl,
    ogImage,
    ...navData,
  });
}

// ─── Items Database Page ────────────────────────────────────────────────────

function buildItemsPage(navData) {
  if (!Object.keys(itemIndex).length) return;

  // Build piece-id → {setId, setName} lookup from sets data
  const pieceToSet = {};
  const setsPath = path.join(LORE_DIR, 'sets.json');
  if (fs.existsSync(setsPath)) {
    const sets = JSON.parse(fs.readFileSync(setsPath, 'utf8'));
    for (const s of sets) {
      for (const p of (s.pieces || [])) {
        pieceToSet[p.id] = { sid: s.id, sn: s.name };
      }
    }
  }

  // Build compact client-side JSON: array of {id, n, t, st, q, lv, sl, stats:[{s,v}], sid?, sn?, dt?}
  const clientItems = Object.entries(itemIndex)
    .filter(([, v]) => v.type !== 'mob')          // exclude mobs from item DB
    .map(([name, v]) => {
      const row = { id: v.id, n: name, t: v.type };
      if (v.subtype) row.st = v.subtype;
      if (v.quality) row.q = v.quality;
      if (v.level) row.lv = v.level;
      if (v.slot) row.sl = v.slot;
      if (v.stats && v.stats.length) {
        row.stats = v.stats.filter(s => s.value !== 0).map(s => ({ s: s.stat, v: s.value }));
      }
      // Cross-link: set membership for equipment items
      const setInfo = pieceToSet[v.id];
      if (setInfo) { row.sid = setInfo.sid; row.sn = setInfo.sn; }
      // Cross-link: deed type for deed entries
      if (v.deedType) row.dt = v.deedType;
      return row;
    });

  // Inject quest reward items that aren't already in the item index
  const questsPath = path.join(LORE_DIR, 'quests.json');
  if (fs.existsSync(questsPath)) {
    const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8'));
    const existingIds = new Set(clientItems.map(r => r.id));
    const existingNames = new Set(clientItems.map(r => r.n));
    const rewardMap = new Map(); // id → {id, name, count}
    for (const q of quests) {
      if (q.rw && q.rw.it) {
        for (const it of q.rw.it) {
          if (existingIds.has(it.id) || existingNames.has(it.n)) continue;
          const entry = rewardMap.get(it.id) || { id: it.id, n: it.n, count: 0 };
          entry.count++;
          rewardMap.set(it.id, entry);
        }
      }
    }
    let added = 0;
    for (const [, v] of rewardMap) {
      clientItems.push({ id: v.id, n: v.n, t: 'quest-reward' });
      added++;
    }
    if (added) console.log(`   + ${added} quest reward items added to item DB`);
  }

  const itemCount = clientItems.length;

  // Write chunked JSON data files for progressive loading
  const CHUNK_SIZE = 5000;
  ensureDir(path.join(OUTPUT_DIR, 'data'));
  const totalChunks = Math.ceil(clientItems.length / CHUNK_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const chunk = clientItems.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'data', `items-db-${i}.json`),
      JSON.stringify(chunk)
    );
  }
  // Also write a small manifest so the client knows how many chunks exist
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'items-db-manifest.json'),
    JSON.stringify({ totalChunks, totalItems: itemCount, chunkSize: CHUNK_SIZE })
  );
  // Keep the full file for backward compatibility (direct links, etc.)
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'items-db.json'),
    JSON.stringify(clientItems)
  );

  // Build the page from template
  const template = readTemplate('items-content.html');
  const body = render(template, { itemCount: itemCount.toLocaleString() });

  // Wrap in base.html with extra scripts for DataTables + items JS
  let html = buildPage(body, {
    title: 'Content Database - LOTRO Guides',
    metaDescription: `Browse ${itemCount.toLocaleString()} items from the LotRO Companion database. Search, filter, and view stats for weapons, armor, consumables, and more.`,
    currentPage: 'items',
    ...navData,
  });

  // Inject DataTables CSS in <head> and scripts before </body>
  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script src="./js/items-db.js"></script>',
    '<script>',
    '  // Progressive chunked loading',
    '  $.getJSON("./data/items-db-manifest.json", function(manifest) {',
    '    $.getJSON("./data/items-db-0.json", function(firstChunk) {',
    '      window.LOTRO_ITEMS_DB = firstChunk;',
    '      if (window.LOTRO_ITEMS_INIT) window.LOTRO_ITEMS_INIT();',
    '      // Load remaining chunks in background',
    '      if (manifest.totalChunks > 1 && window.LOTRO_ITEMS_ADD_CHUNK) {',
    '        var loaded = 1;',
    '        (function loadNext(i) {',
    '          if (i >= manifest.totalChunks) return;',
    '          $.getJSON("./data/items-db-" + i + ".json", function(chunk) {',
    '            loaded++;',
    '            window.LOTRO_ITEMS_ADD_CHUNK(chunk, loaded, manifest.totalChunks);',
    '            loadNext(i + 1);',
    '          });',
    '        })(1);',
    '      }',
    '    });',
    '  });',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'items.html'), html);
}

// ─── Mobs Database Page ─────────────────────────────────────────────────────

function buildMobsPage(navData) {
  if (!Object.keys(itemIndex).length) return;

  // Build compact client-side JSON: array of {id, n, g, sp}
  const clientMobs = Object.entries(itemIndex)
    .filter(([, v]) => v.type === 'mob')
    .map(([name, v]) => {
      const row = { id: v.id, n: name };
      if (v.genus) row.g = v.genus;
      if (v.species) row.sp = v.species;
      return row;
    });

  const mobCount = clientMobs.length;

  // Build map overlays for mobs from map marker DID/label matches.
  const markerIndex = loadMapMarkerIndex();
  const mobOverlay = {};
  for (const mob of clientMobs) {
    const loc = findMarkerLocation(markerIndex, mob.id, mob.n);
    if (!loc) continue;
    mobOverlay[mob.id] = { n: mob.n, map: loc.map, lng: loc.lng, lat: loc.lat, l: loc.l || mob.n };
  }

  // Write the JSON data file
  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'mobs-db.json'),
    JSON.stringify(clientMobs)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'mob-overlay.json'),
    JSON.stringify(mobOverlay)
  );

  // Build the page from template
  const template = readTemplate('mobs-content.html');
  const body = render(template, { mobCount: mobCount.toLocaleString() });

  let html = buildPage(body, {
    title: 'Mob Database - LOTRO Guides',
    metaDescription: `Browse ${mobCount.toLocaleString()} enemies from the LotRO Companion database. Search and filter mobs by genus and species.`,
    currentPage: 'mobs',
    ...navData,
  });

  // Inject DataTables CSS in <head> and scripts before </body>
  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  // Load mobs data + map overlay, then init',
    '  $.when($.getJSON("./data/mobs-db.json"), $.getJSON("./data/mob-overlay.json"))',
    '    .done(function(mobsRes, overlayRes) {',
    '      window.LOTRO_MOBS_DB = mobsRes[0];',
    '      window.LOTRO_MOB_OVERLAY = overlayRes[0] || {};',
    '      $.getScript("./js/mobs-db.js", function() {',
    '        if (window.LOTRO_MOBS_INIT) window.LOTRO_MOBS_INIT();',
    '      });',
    '    });',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'mobs.html'), html);
}

// ─── Virtues Database Page ───────────────────────────────────────────────────

function buildVirtuesPage(navData) {
  const virtuesPath = path.join(LORE_DIR, 'virtues.json');
  if (!fs.existsSync(virtuesPath)) return;

  const virtues = JSON.parse(fs.readFileSync(virtuesPath, 'utf8'));

  // Compact format: {id, n, st:[], mr}
  const clientVirtues = virtues.map(v => ({
    id: v.id,
    n: v.name,
    st: v.stats || [],
    mr: v.maxTier || 0,
  }));

  const count = clientVirtues.length;

  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'virtues-db.json'),
    JSON.stringify(clientVirtues)
  );

  const template = readTemplate('virtues-content.html');
  const body = render(template, { virtueCount: count.toLocaleString() });

  let html = buildPage(body, {
    title: 'Virtue Database - LOTRO Guides',
    metaDescription: `Browse all ${count} virtues from the LotRO Companion database. View stats and ranks for every virtue in Lord of the Rings Online.`,
    currentPage: 'virtues',
    ...navData,
  });

  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  $.getJSON("./data/virtues-db.json", function(data) {',
    '    window.LOTRO_VIRTUES_DB = data;',
    '    $.getScript("./js/virtues-db.js", function() {',
    '      if (window.LOTRO_VIRTUES_INIT) window.LOTRO_VIRTUES_INIT();',
    '    });',
    '  });',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'virtues.html'), html);
}

// ─── Sets Database Page ─────────────────────────────────────────────────────

function buildSetsPage(navData) {
  const setsPath = path.join(LORE_DIR, 'sets.json');
  if (!fs.existsSync(setsPath)) return;

  const sets = JSON.parse(fs.readFileSync(setsPath, 'utf8'));

  // Compact format: {id, n, lv, ml, pc:[{id,n}], bn:[{c, st:[{s,v}]}]}
  const clientSets = sets.map(s => {
    const row = { id: s.id, n: s.name };
    if (s.level) row.lv = s.level;
    if (s.maxLevel) row.ml = s.maxLevel;
    if (s.pieces && s.pieces.length) {
      row.pc = s.pieces.map(p => ({ id: p.id, n: p.name }));
    }
    if (s.bonuses && s.bonuses.length) {
      row.bn = s.bonuses.map(b => ({
        c: b.count,
        st: (b.stats || []).map(st => ({ s: st.stat, v: st.value })),
      }));
    }
    return row;
  });

  const count = clientSets.length;

  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'sets-db.json'),
    JSON.stringify(clientSets)
  );

  const template = readTemplate('sets-content.html');
  const body = render(template, { setCount: count.toLocaleString() });

  let html = buildPage(body, {
    title: 'Set Database - LOTRO Guides',
    metaDescription: `Browse ${count.toLocaleString()} equipment sets from the LotRO Companion database. View set bonuses, pieces, and level requirements.`,
    currentPage: 'sets',
    ...navData,
  });

  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  $.getJSON("./data/sets-db.json", function(data) {',
    '    window.LOTRO_SETS_DB = data;',
    '    $.getScript("./js/sets-db.js", function() {',
    '      if (window.LOTRO_SETS_INIT) window.LOTRO_SETS_INIT();',
    '    });',
    '  });',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'sets.html'), html);
}

// ─── Deeds Database Page ────────────────────────────────────────────────────

function buildDeedsPage(navData) {
  const deedsPath = path.join(LORE_DIR, 'deeds.json');
  if (!fs.existsSync(deedsPath)) return;

  const deeds = JSON.parse(fs.readFileSync(deedsPath, 'utf8'));

  // Build lookup maps for resolving achievableId references
  const deedNameById = {};
  for (const d of deeds) deedNameById[d.id] = d.name;

  const questsPath = path.join(LORE_DIR, 'quests.json');
  const questNameById = {};
  if (fs.existsSync(questsPath)) {
    const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8'));
    for (const q of quests) questNameById[q.id] = q.n || q.name;
  }

  // Compact format: {id, n, tp, lv, rw:[{t,v}], cl?, obj?:[{...}]}
  const clientDeeds = deeds.map(d => {
    const row = { id: d.id, n: d.name, tp: d.type || 'Other' };
    if (d.level) row.lv = d.level;
    if (d.rewards && d.rewards.length) {
      row.rw = d.rewards.map(r => ({ t: r.type, v: r.value }));
    }
    if (d.requiredClass) row.cl = d.requiredClass;

    // Compact objectives
    if (d.objectives && d.objectives.length) {
      row.obj = d.objectives.map(o => {
        if (o.type === 'kill') {
          const r = { t: 'kill' };
          if (o.mobId) { r.mid = o.mobId; r.mn = o.mobName; }
          if (o.count) r.c = o.count;
          if (o.zone) r.z = o.zone;
          return r;
        }
        if (o.type === 'complete') {
          const r = { t: 'complete', aid: o.achievableId };
          // Resolve name: check deeds first, then quests
          if (deedNameById[o.achievableId]) {
            r.an = deedNameById[o.achievableId];
            r.ad = true; // is a deed
          } else if (questNameById[o.achievableId]) {
            r.an = questNameById[o.achievableId];
            r.aq = true; // is a quest
          }
          return r;
        }
        if (o.type === 'questCount') return { t: 'qc', c: o.count };
        if (o.type === 'landmark') return { t: 'lm', n: o.name };
        if (o.type === 'item') return { t: 'item', n: o.name };
        if (o.type === 'useItem') return { t: 'use', n: o.name };
        if (o.type === 'npc') return { t: 'npc', n: o.name };
        if (o.type === 'skill') return { t: 'skill', c: o.count };
        if (o.type === 'emote') return { t: 'emote', n: o.name, c: o.count };
        if (o.type === 'explore') return { t: 'explore', c: o.count };
        if (o.type === 'faction') return { t: 'fac', n: o.name, tier: o.tier };
        return o;
      });
    }

    return row;
  });

  // Build map overlays for deeds from objective links to maps/quests/mobs/landmarks.
  const markerIndex = loadMapMarkerIndex();
  const questOverlayPath = path.join(LORE_DIR, 'quest-overlay.json');
  const questOverlay = fs.existsSync(questOverlayPath)
    ? JSON.parse(fs.readFileSync(questOverlayPath, 'utf8'))
    : {};
  const deedOverlay = {};

  for (const deed of clientDeeds) {
    if (!deed.obj || !deed.obj.length) continue;

    const pts = [];
    const maps = new Set();
    const seen = new Set();

    for (let i = 0; i < deed.obj.length; i++) {
      const o = deed.obj[i];
      let loc = null;

      if (o.t === 'complete' && o.aq && o.aid && questOverlay[o.aid]) {
        const q = questOverlay[o.aid];
        if (q.maps && q.maps.length && q.steps && q.steps.length && q.steps[0].pts && q.steps[0].pts.length) {
          const pt = q.steps[0].pts[0];
          loc = {
            map: q.maps[0],
            lng: pt[0],
            lat: pt[1],
            l: o.an || q.n || deed.n,
          };
        }
      } else if (o.t === 'kill') {
        loc = findMarkerLocation(markerIndex, o.mid, o.mn);
      } else if (o.t === 'lm' || o.t === 'npc' || o.t === 'item' || o.t === 'use') {
        loc = findMarkerLocation(markerIndex, '', o.n);
      }

      if (!loc) continue;

      const key = `${loc.map}|${loc.lng}|${loc.lat}`;
      if (seen.has(key)) continue;
      seen.add(key);
      maps.add(loc.map);
      pts.push({
        i: i + 1,
        map: loc.map,
        lng: loc.lng,
        lat: loc.lat,
        t: o.an || o.mn || o.n || deed.n,
      });
      if (pts.length >= 12) break;
    }

    if (pts.length) {
      deedOverlay[deed.id] = {
        n: deed.n,
        lv: deed.lv || 0,
        tp: deed.tp || 'Other',
        maps: Array.from(maps),
        pts,
      };
    }
  }

  const count = clientDeeds.length;

  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'deeds-db.json'),
    JSON.stringify(clientDeeds)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'deed-overlay.json'),
    JSON.stringify(deedOverlay)
  );

  const template = readTemplate('deeds-content.html');
  const body = render(template, { deedCount: count.toLocaleString() });

  let html = buildPage(body, {
    title: 'Deed Database - LOTRO Guides',
    metaDescription: `Browse ${count.toLocaleString()} deeds from the LotRO Companion database. Search by type, rewards, and class requirements.`,
    currentPage: 'deeds',
    ...navData,
  });

  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  $.when($.getJSON("./data/deeds-db.json"), $.getJSON("./data/deed-overlay.json"))',
    '    .done(function(deedsRes, overlayRes) {',
    '      window.LOTRO_DEEDS_DB = deedsRes[0];',
    '      window.LOTRO_DEED_OVERLAY = overlayRes[0] || {};',
    '      $.getScript("./js/deeds-db.js", function() {',
    '        if (window.LOTRO_DEEDS_INIT) window.LOTRO_DEEDS_INIT();',
    '      });',
    '    });',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'deeds.html'), html);
}

// ─── Quest Database Page ────────────────────────────────────────────────────

function buildQuestsPage(navData) {
  const questsPath = path.join(LORE_DIR, 'quests.json');
  if (!fs.existsSync(questsPath)) return;

  const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8'));
  const count = quests.length;

  // Write quest data for client-side loading
  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'quests-db.json'),
    JSON.stringify(quests)
  );

  // Copy POI cross-reference files for map enrichment
  const poiFiles = ['quest-poi.json', 'map-quests.json', 'quest-overlay.json', 'npcs.json'];
  for (const f of poiFiles) {
    const src = path.join(LORE_DIR, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(OUTPUT_DIR, 'data', f));
    }
  }

  const template = readTemplate('quests-content.html');
  const body = render(template, { questCount: count.toLocaleString() });

  let html = buildPage(body, {
    title: 'Quest Database - LOTRO Guides',
    metaDescription: `Browse ${count.toLocaleString()} quests from the LotRO Companion database. Search by name, category, level, and quest giver.`,
    currentPage: 'quests',
    ...navData,
  });

  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  $.getJSON("./data/quests-db.json", function(data) {',
    '    window.LOTRO_QUESTS_DB = data;',
    '    $.getScript("./js/quests-db.js", function() {',
    '      if (window.LOTRO_QUESTS_INIT) window.LOTRO_QUESTS_INIT();',
    '    });',
    '  });',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'quests.html'), html);
}

// ─── Interactive Map Page ───────────────────────────────────────────────────

function buildMapPage(navData) {
  const manifestPath = path.join(LORE_DIR, 'maps-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.log('   ℹ No map data found — run: node scripts/extract-maps.js');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const template = readTemplate('map-content.html');
  const body = render(template, {});

  let html = buildPage(body, {
    title: 'Interactive Map - LOTRO Guides',
    metaDescription: `Explore Middle-earth with an interactive map featuring ${manifest.totalMarkers.toLocaleString()} points of interest across ${manifest.totalMaps.toLocaleString()} maps. Find stable-masters, vendors, landmarks, and more.`,
    currentPage: 'map',
    ...navData,
  });

  // Inject Leaflet CSS + MarkerCluster CSS in <head>
  const mapCss = [
    '<link href="./plugins/leaflet/leaflet.css" rel="stylesheet">',
    '<link href="./plugins/leaflet/MarkerCluster.css" rel="stylesheet">',
    '<link href="./plugins/leaflet/MarkerCluster.Default.css" rel="stylesheet">',
  ].join('\n    ');
  html = html.replace('</head>', `    ${mapCss}\n  </head>`);

  // Inject Leaflet JS + MarkerCluster + map JS before </body>
  const mapScripts = [
    '<script src="./plugins/leaflet/leaflet.js"></script>',
    '<script src="./plugins/leaflet/leaflet.markercluster.js"></script>',
    '<script src="./js/lotro-map.js"></script>',
    '<script>',
    '  if (window.LOTRO_MAP_INIT) window.LOTRO_MAP_INIT();',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${mapScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'map.html'), html);
}

// ─── Main Build ─────────────────────────────────────────────────────────────

async function build() {
  console.log('🏗  Building LOTRO guides...');
  const startTime = Date.now();

  // Convert images to WebP and collect dimensions metadata
  console.log('   📸 Converting images to WebP...');
  await convertImagesToWebp();

  // Load lore item index for auto-linking
  loadItemIndex();
  loadQuestIndex();

  // Load all markdown content
  const guides = loadContent('guides');
  const news = loadContent('news');

  // Pick up legacy scraped HTML articles not yet converted to markdown
  const legacyNews = loadLegacyHtml('news');
  const legacyGuides = loadLegacyHtml('guides');

  // Merge markdown + legacy, deduplicate by slug, sort by date
  const allNews = [...news, ...legacyNews].sort((a, b) => new Date(b.date) - new Date(a.date));
  const allGuides = [...guides, ...legacyGuides].sort((a, b) => new Date(b.date) - new Date(a.date));
  const allPosts = [...allGuides, ...allNews].sort((a, b) => new Date(b.date) - new Date(a.date));

  console.log(`   Found ${allGuides.length} guides (${legacyGuides.length} legacy), ${allNews.length} news (${legacyNews.length} legacy)`);

  // Build nav items from content (latest 5 each)
  const guideNav = [buildGuideQuickNavLinks(''), buildNavItems(allGuides, '', 5)].filter(Boolean).join('\n                      ');
  const newsNav = buildNavItems(allNews, '', 5);
  const guideNavArticle = [buildGuideQuickNavLinks('../'), buildNavItems(allGuides, '../', 5)].filter(Boolean).join('\n                      ');
  const newsNavArticle = buildNavItems(allNews, '../', 5);

  // Ensure output directories
  ensureDir(path.join(OUTPUT_DIR, 'guides'));
  ensureDir(path.join(OUTPUT_DIR, 'news'));

  // Build index page
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), optimizeImages(buildIndex(allPosts, { guideNavItems: guideNav, newsNavItems: newsNav })));
  console.log('   ✓ index.html');

  // Build listing pages
  fs.writeFileSync(path.join(OUTPUT_DIR, 'guides.html'), optimizeImages(buildListing(allGuides, 'guides', { guideNavItems: guideNav, newsNavItems: newsNav })));
  console.log('   ✓ guides.html');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'news.html'), optimizeImages(buildListing(allNews, 'news', { guideNavItems: guideNav, newsNavItems: newsNav })));
  console.log('   ✓ news.html');

  // Build about page
  const aboutBody = readTemplate('about-content.html');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'about.html'), optimizeImages(buildPage(aboutBody, {
    title: 'About - LOTRO Guides',
    currentPage: 'about',
    guideNavItems: guideNav,
    newsNavItems: newsNav,
  })));
  console.log('   ✓ about.html');

  // Build items database page
  buildItemsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ items.html');

  // Build mobs database page
  buildMobsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ mobs.html');

  // Build virtues database page
  buildVirtuesPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ virtues.html');

  // Build sets database page
  buildSetsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ sets.html');

  // Build deeds database page
  buildDeedsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ deeds.html');

  // Build quests database page
  buildQuestsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ quests.html');

  // Build interactive map page
  buildMapPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ map.html');

  // Build individual articles (only from markdown — legacy HTML already exists)
  guides.forEach(post => {
    const related = allGuides.filter(p => p.slug !== post.slug);
    const outPath = path.join(OUTPUT_DIR, 'guides', `${post.slug}.html`);
    fs.writeFileSync(outPath, optimizeImages(buildArticle(post, related, { guideNavItems: guideNavArticle, newsNavItems: newsNavArticle })));
    console.log(`   ✓ guides/${post.slug}.html`);
  });

  news.forEach(post => {
    const related = allNews.filter(p => p.slug !== post.slug);
    const outPath = path.join(OUTPUT_DIR, 'news', `${post.slug}.html`);
    fs.writeFileSync(outPath, optimizeImages(buildArticle(post, related, { guideNavItems: guideNavArticle, newsNavItems: newsNavArticle })));
    console.log(`   ✓ news/${post.slug}.html`);
  });

  const elapsed = Date.now() - startTime;
  const itemCount = Object.keys(itemIndex).length;
  console.log(`\n✅ Build complete in ${elapsed}ms — ${allPosts.length} articles, ${itemCount.toLocaleString()} items`);
}

// ─── Watch Mode ─────────────────────────────────────────────────────────────

if (process.argv.includes('--watch')) {
  const chokidar = require('chokidar');
  build().then(() => {
    console.log('\n👁  Watching for changes in content/ and templates/...\n');
    chokidar.watch([CONTENT_DIR, TEMPLATE_DIR], { ignoreInitial: true })
      .on('all', (event, filePath) => {
        console.log(`\n📝 ${event}: ${path.relative(__dirname, filePath)}`);
        build();
      });
  });
} else {
  build();
}
