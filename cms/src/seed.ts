import fs from 'fs';
import path from 'path';

type StrapiLike = {
  db: {
    query: (uid: string) => {
      findOne: (args: unknown) => Promise<any>;
      create: (args: unknown) => Promise<any>;
      count: (args?: unknown) => Promise<number>;
      deleteMany: (args?: unknown) => Promise<unknown>;
    };
  };
  documents: (uid: string) => {
    create: (args: unknown) => Promise<unknown>;
    findFirst: (args?: unknown) => Promise<any>;
  };
  log: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
};

const PUBLIC_ACTIONS = [
  'api::article.article.find',
  'api::article.article.findOne',
  'api::page.page.find',
  'api::page.page.findOne',
  'api::video.video.find',
  'api::video.video.findOne',
  'api::site-setting.site-setting.find',
];

function findRepoRoot(start: string) {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, 'content', 'navigation.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate the site content directory from ' + start);
}

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const data: Record<string, string | string[]> = {};
  if (!match) return { data, content: raw };
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pair) continue;
    let value = pair[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      data[pair[1]] = value
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      data[pair[1]] = value;
    }
  }
  return { data, content: raw.slice(match[0].length) };
}

function asText(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(', ') : value || '';
}

function coverUrl(image: string) {
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return image;
  const cleaned = image.replace(/^(\.\.\/)+/, '').replace(/^lotro\//, '');
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

function extractPostHtml(file: string) {
  const html = fs.readFileSync(file, 'utf8');
  const marker = '<div class="post-content lotro-article">';
  const start = html.indexOf(marker);
  if (start < 0) return '';
  const from = start + marker.length;
  const end = html.indexOf('</div>', from);
  return html.slice(from, end).trim();
}

async function enablePublicRead(strapi: StrapiLike) {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'public' },
  });
  if (!role) {
    strapi.log.warn('Public role was not found; content API permissions were not updated.');
    return;
  }

  for (const action of PUBLIC_ACTIONS) {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: { action, role: role.id },
    });
    if (existing) continue;
    await strapi.db.query('plugin::users-permissions.permission').create({
      data: { action, role: role.id },
    });
  }
}

async function seedArticles(strapi: StrapiLike, root: string) {
  const force = process.env.STRAPI_RESEED === 'true';
  const existing = await strapi.db.query('api::article.article').count();
  if (existing && !force) return;
  if (force && existing) {
    await strapi.db.query('api::article.article').deleteMany({});
  }

  let created = 0;
  for (const category of ['guide', 'news'] as const) {
    const dir = path.join(root, 'content', category === 'guide' ? 'guides' : 'news');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.md'))) {
      const slug = file.replace(/\.md$/, '');
      const parsed = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf8'));
      const tags = parsed.data.tags;
      const publishedOn = asText(parsed.data.date);
      try {
        await strapi.documents('api::article.article').create({
          data: {
            title: asText(parsed.data.title) || slug,
            slug,
            category,
            excerpt: asText(parsed.data.excerpt),
            author: asText(parsed.data.author) || 'LOTRO Guides',
            ...(publishedOn ? { publishedOn } : {}),
            tags: Array.isArray(tags) ? tags : tags ? [tags] : [],
            body: parsed.content.trim(),
            coverUrl: coverUrl(asText(parsed.data.image)),
            source: asText(parsed.data.source),
          },
          status: 'published',
        });
        created += 1;
      } catch (error) {
        strapi.log.warn(`Skipped article ${slug}: ${(error as Error).message}`);
      }
    }
  }
  strapi.log.info(`Seeded ${created} articles from content/`);
}

async function seedPages(strapi: StrapiLike, root: string) {
  const existing = await strapi.db.query('api::page.page').count();
  if (existing && process.env.STRAPI_RESEED !== 'true') return;
  if (process.env.STRAPI_RESEED === 'true' && existing) {
    await strapi.db.query('api::page.page').deleteMany({});
  }

  const pages = [
    { slug: 'about', title: 'About LOTRO Guides', file: 'about-content.html' },
    { slug: 'privacy', title: 'Privacy Policy', file: 'privacy-content.html' },
    { slug: 'terms', title: 'Terms of Service', file: 'terms-content.html' },
  ];
  for (const page of pages) {
    const body = extractPostHtml(path.join(root, 'templates', page.file));
    if (!body) continue;
    await strapi.documents('api::page.page').create({
      data: { title: page.title, slug: page.slug, body, format: 'html' },
    });
  }
  strapi.log.info('Seeded About, Privacy, and Terms pages');
}

async function seedVideos(strapi: StrapiLike, root: string) {
  const existing = await strapi.db.query('api::video.video').count();
  if (existing && process.env.STRAPI_RESEED !== 'true') return;
  const file = path.join(root, 'content', 'media', 'videos.json');
  if (!fs.existsSync(file)) return;
  const videos = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(videos)) return;
  if (process.env.STRAPI_RESEED === 'true' && existing) {
    await strapi.db.query('api::video.video').deleteMany({});
  }
  for (const video of videos) {
    const youtubeId = String(video.youtubeId || video.url || '').trim();
    const idMatch = youtubeId.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
    const id = idMatch ? idMatch[1] : youtubeId;
    if (!id || id.includes('http')) continue;
    try {
      const publishedOn = video.publishedAt || video.publishedOn || '';
      await strapi.documents('api::video.video').create({
        data: {
          title: video.title || 'LOTRO Video',
          youtubeId: id,
          description: video.description || '',
          ...(publishedOn ? { publishedOn } : {}),
          thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        },
      });
    } catch (error) {
      strapi.log.warn(`Skipped video ${id}: ${(error as Error).message}`);
    }
  }
}

async function seedSettings(strapi: StrapiLike, root: string) {
  const current = await strapi.documents('api::site-setting.site-setting').findFirst();
  if (current && process.env.STRAPI_RESEED !== 'true') return;

  const flowPath = path.join(root, 'content', 'homepage-flow.json');
  const navPath = path.join(root, 'content', 'navigation.json');
  const flowCards = fs.existsSync(flowPath) ? JSON.parse(fs.readFileSync(flowPath, 'utf8')) : [];
  const navigation = fs.existsSync(navPath) ? JSON.parse(fs.readFileSync(navPath, 'utf8')) : {};

  await strapi.documents('api::site-setting.site-setting').create({
    data: {
      siteName: 'LOTRO Guides',
      description:
        'Guides, news, databases, and an interactive map for Lord of the Rings Online.',
      heroTitle: 'LOTRO Guides',
      heroSubtitle:
        'Your companion through Lord of the Rings Online — class builds, crafting guides, instance walkthroughs, and the latest news from Middle-earth.',
      footerAbout:
        'A fan-created resource for Lord of the Rings Online players. We cover class builds, crafting guides, instance walkthroughs, and the latest LOTRO news. Made by the community, for the community.',
      flowCards,
      navigation,
    },
  });
  strapi.log.info('Seeded site settings');
}

export async function seedContent(strapi: StrapiLike) {
  const root = findRepoRoot(__dirname);
  await enablePublicRead(strapi);
  await seedSettings(strapi, root);
  await seedPages(strapi, root);
  await seedVideos(strapi, root);
  await seedArticles(strapi, root);
}
