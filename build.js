const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

// ─── Configuration ──────────────────────────────────────────────────────────
const CONTENT_DIR = path.join(__dirname, 'content');
const TEMPLATE_DIR = path.join(__dirname, 'templates');
const OUTPUT_DIR = __dirname; // Output into lotro/ root
const ASSETS_PREFIX = '';   // Relative path to parent theme assets
const SITE_BASE_URL = 'https://lotroguides.com';

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
    siteRoot,
    guideNavItems: pageData.guideNavItems || '',
    newsNavItems: pageData.newsNavItems || '',
    ogUrl: pageData.ogUrl || SITE_BASE_URL,
    ogImage: pageData.ogImage || `${SITE_BASE_URL}/img/default.jpg`,
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

  const postsHtml = posts.map(post => render(cardTemplate, {
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
    categoryName,
    categoryIcon,
    posts: postsHtml,
    assets: ASSETS_PREFIX,
  });

  const pageTitle = category === 'guides' ? 'Guides & Walkthroughs' : 'Latest News';
  return buildPage(body, {
    title: `${pageTitle} - LOTRO Guides`,
    currentPage: category,
    ...navData,
  });
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
    content: post.content,
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

// ─── Main Build ─────────────────────────────────────────────────────────────

function build() {
  console.log('🏗  Building LOTRO fansite...');
  const startTime = Date.now();

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
  const guideNav = buildNavItems(allGuides, '', 5);
  const newsNav = buildNavItems(allNews, '', 5);
  const guideNavArticle = buildNavItems(allGuides, '../', 5);
  const newsNavArticle = buildNavItems(allNews, '../', 5);

  // Ensure output directories
  ensureDir(path.join(OUTPUT_DIR, 'guides'));
  ensureDir(path.join(OUTPUT_DIR, 'news'));

  // Build index page
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), buildIndex(allPosts, { guideNavItems: guideNav, newsNavItems: newsNav }));
  console.log('   ✓ index.html');

  // Build listing pages
  fs.writeFileSync(path.join(OUTPUT_DIR, 'guides.html'), buildListing(allGuides, 'guides', { guideNavItems: guideNav, newsNavItems: newsNav }));
  console.log('   ✓ guides.html');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'news.html'), buildListing(allNews, 'news', { guideNavItems: guideNav, newsNavItems: newsNav }));
  console.log('   ✓ news.html');

  // Build about page
  const aboutBody = readTemplate('about-content.html');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'about.html'), buildPage(aboutBody, {
    title: 'About - LOTRO Guides',
    currentPage: 'about',
    guideNavItems: guideNav,
    newsNavItems: newsNav,
  }));
  console.log('   ✓ about.html');

  // Build individual articles (only from markdown — legacy HTML already exists)
  guides.forEach(post => {
    const related = allGuides.filter(p => p.slug !== post.slug);
    const outPath = path.join(OUTPUT_DIR, 'guides', `${post.slug}.html`);
    fs.writeFileSync(outPath, buildArticle(post, related, { guideNavItems: guideNavArticle, newsNavItems: newsNavArticle }));
    console.log(`   ✓ guides/${post.slug}.html`);
  });

  news.forEach(post => {
    const related = allNews.filter(p => p.slug !== post.slug);
    const outPath = path.join(OUTPUT_DIR, 'news', `${post.slug}.html`);
    fs.writeFileSync(outPath, buildArticle(post, related, { guideNavItems: guideNavArticle, newsNavItems: newsNavArticle }));
    console.log(`   ✓ news/${post.slug}.html`);
  });

  const elapsed = Date.now() - startTime;
  console.log(`\n✅ Build complete in ${elapsed}ms — ${allPosts.length} articles generated`);
}

// ─── Watch Mode ─────────────────────────────────────────────────────────────

if (process.argv.includes('--watch')) {
  const chokidar = require('chokidar');
  build();
  console.log('\n👁  Watching for changes in content/ and templates/...\n');
  chokidar.watch([CONTENT_DIR, TEMPLATE_DIR], { ignoreInitial: true })
    .on('all', (event, filePath) => {
      console.log(`\n📝 ${event}: ${path.relative(__dirname, filePath)}`);
      build();
    });
} else {
  build();
}
