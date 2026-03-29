const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

// ─── Configuration ──────────────────────────────────────────────────────────
const CONTENT_DIR = path.join(__dirname, 'content');
const TEMPLATE_DIR = path.join(__dirname, 'templates');
const OUTPUT_DIR = __dirname; // Output into lotro/ root
const ASSETS_PREFIX = '';   // Relative path to parent theme assets

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
    siteRoot: pageData.siteRoot || '',
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

// ─── Page Generators ────────────────────────────────────────────────────────

function buildIndex(allPosts) {
  const template = readTemplate('index-content.html');
  const latestPosts = allPosts.slice(0, 6);

  // Featured post (most recent)
  const featured = latestPosts[0];
  const featuredHtml = featured ? render(readTemplate('partials/featured-card.html'), {
    url: featured.url,
    image: featured.image || `${ASSETS_PREFIX}/img/blog/blog-lg-1.jpg`,
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
    image: post.image || `${ASSETS_PREFIX}/img/blog/blog-1.jpg`,
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

  return buildPage(body, { title: 'LOTRO Guides - LOTRO Fansite', currentPage: 'home' });
}

function buildListing(posts, category) {
  const template = readTemplate('listing-content.html');
  const cardTemplate = readTemplate('partials/post-card.html');

  const categoryName = category === 'guides' ? 'Guides & Walkthroughs' : 'Latest News';
  const categoryIcon = category === 'guides' ? 'fa-book' : 'fa-newspaper-o';

  const postsHtml = posts.map(post => render(cardTemplate, {
    url: post.url,
    image: post.image || `${ASSETS_PREFIX}/img/blog/blog-1.jpg`,
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
  });
}

function buildArticle(post, relatedPosts) {
  const template = readTemplate('article-content.html');
  const articleAssets = ASSETS_PREFIX + '/..';

  const tagsHtml = post.tags.map(t => `<a href="#">#${t}</a>`).join('\n                ');

  const relatedTemplate = readTemplate('partials/related-card.html');
  const relatedHtml = relatedPosts.slice(0, 4).map(rp => render(relatedTemplate, {
    url: `../${rp.url}`,
    image: rp.image ? `../${rp.image}` : `${articleAssets}/img/blog/blog-related-1.jpg`,
    title: rp.title,
    date: rp.formattedDate,
    excerpt: rp.excerpt,
    assets: articleAssets,
  })).join('\n');

  const body = render(template, {
    title: post.title,
    date: post.formattedDate,
    author: post.author || 'Amdor',
    image: post.image ? `../${post.image}` : `${articleAssets}/img/blog/blog-lg-1.jpg`,
    content: post.content,
    tags: tagsHtml,
    category: post.category === 'guides' ? 'Guides' : 'News',
    categoryUrl: post.category === 'guides' ? '../guides.html' : '../news.html',
    relatedPosts: relatedHtml,
    assets: articleAssets,
  });

  return buildPage(body, {
    title: `${post.title} - LOTRO Guides`,
    metaDescription: post.excerpt,
    currentPage: post.category,
    assets: articleAssets,
    siteRoot: '../',
  });
}

// ─── Main Build ─────────────────────────────────────────────────────────────

function build() {
  console.log('🏗  Building LOTRO fansite...');
  const startTime = Date.now();

  // Load all content
  const guides = loadContent('guides');
  const news = loadContent('news');
  const allPosts = [...guides, ...news].sort((a, b) => new Date(b.date) - new Date(a.date));

  console.log(`   Found ${guides.length} guides, ${news.length} news articles`);

  // Ensure output directories
  ensureDir(path.join(OUTPUT_DIR, 'guides'));
  ensureDir(path.join(OUTPUT_DIR, 'news'));

  // Build index page
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), buildIndex(allPosts));
  console.log('   ✓ index.html');

  // Build listing pages
  fs.writeFileSync(path.join(OUTPUT_DIR, 'guides.html'), buildListing(guides, 'guides'));
  console.log('   ✓ guides.html');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'news.html'), buildListing(news, 'news'));
  console.log('   ✓ news.html');

  // Build about page
  const aboutBody = readTemplate('about-content.html');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'about.html'), buildPage(aboutBody, {
    title: 'About - LOTRO Guides',
    currentPage: 'about',
  }));
  console.log('   ✓ about.html');

  // Build individual articles
  guides.forEach(post => {
    const related = guides.filter(p => p.slug !== post.slug);
    const outPath = path.join(OUTPUT_DIR, 'guides', `${post.slug}.html`);
    fs.writeFileSync(outPath, buildArticle(post, related));
    console.log(`   ✓ guides/${post.slug}.html`);
  });

  news.forEach(post => {
    const related = news.filter(p => p.slug !== post.slug);
    const outPath = path.join(OUTPUT_DIR, 'news', `${post.slug}.html`);
    fs.writeFileSync(outPath, buildArticle(post, related));
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
