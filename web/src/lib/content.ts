import fs from "fs";
import path from "path";
import { stripMarkdown } from "./format";
import { readRepoJson, repoRoot } from "./paths";

export type ArticleCategory = "guide" | "news";

export type Article = {
  title: string;
  slug: string;
  category: ArticleCategory;
  excerpt: string;
  author: string;
  publishedOn: string;
  tags: string[];
  body: string;
  coverUrl: string;
  source: string;
};

export type StaticPage = {
  title: string;
  slug: string;
  body: string;
  format: "html" | "markdown";
};

export type Video = {
  title: string;
  youtubeId: string;
  description: string;
  publishedOn: string;
  thumbnail: string;
};

export type FlowCard = {
  href: string;
  icon: string;
  title: string;
  text: string;
};

export type NavLink = { label: string; url: string };
export type NavItem = NavLink & {
  activeOn?: string[];
  children?: NavLink[];
  childrenFrom?: string;
};

export type SiteSettings = {
  siteName: string;
  description: string;
  heroTitle: string;
  heroSubtitle: string;
  footerAbout: string;
  flowCards: FlowCard[];
  navigation: { header?: NavItem[]; footer?: { primary?: NavLink[]; secondary?: NavLink[] } };
};

const STRAPI_URL = (process.env.STRAPI_URL || "http://127.0.0.1:1337").replace(/\/$/, "");

type StrapiList<T> = {
  data?: T[];
  meta?: { pagination?: { page: number; pageCount: number } };
};

type StrapiSingle<T> = { data?: T | null };

function strapiInit(): RequestInit {
  if (process.env.NODE_ENV === "development") return { cache: "no-store" };
  return { next: { revalidate: 60 } };
}

async function strapiGet<T>(pathname: string): Promise<T | null> {
  try {
    const response = await fetch(`${STRAPI_URL}/api${pathname}`, strapiInit());
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
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
    if (value.startsWith("[") && value.endsWith("]")) {
      data[pair[1]] = value
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      data[pair[1]] = value;
    }
  }
  return { data, content: raw.slice(match[0].length) };
}

function text(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(", ") : value || "";
}

function normalizeCover(image: string) {
  if (!image) return "/img/default.jpg";
  if (/^https?:\/\//i.test(image)) return image;
  const cleaned = image.replace(/^(\.\.\/)+/, "").replace(/^lotro\//, "");
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

function normalizeArticle(input: Partial<Article> & { date?: string; image?: string }): Article {
  const body = input.body || "";
  const excerpt = input.excerpt || stripMarkdown(body).slice(0, 180);
  const tags = Array.isArray(input.tags) ? input.tags.map(String) : [];
  return {
    title: input.title || "Untitled",
    slug: input.slug || "",
    category: input.category === "guide" ? "guide" : "news",
    excerpt,
    author: input.author || "LOTRO Guides",
    publishedOn: input.publishedOn || input.date || "",
    tags,
    body,
    coverUrl: normalizeCover(input.coverUrl || input.image || ""),
    source: input.source || "",
  };
}

let fileArticleCache: { at: number; articles: Article[] } | null = null;

function articlesFromFiles(): Article[] {
  if (fileArticleCache && Date.now() - fileArticleCache.at < 5000) return fileArticleCache.articles;
  const articles: Article[] = [];
  for (const category of ["guide", "news"] as const) {
    const dir = path.join(repoRoot(), "content", category === "guide" ? "guides" : "news");
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".md"))) {
      const parsed = parseFrontmatter(fs.readFileSync(path.join(dir, file), "utf8"));
      const tags = parsed.data.tags;
      articles.push(
        normalizeArticle({
          title: text(parsed.data.title),
          slug: file.replace(/\.md$/, ""),
          category,
          excerpt: text(parsed.data.excerpt),
          author: text(parsed.data.author),
          publishedOn: text(parsed.data.date),
          tags: Array.isArray(tags) ? tags : tags ? [tags] : [],
          body: parsed.content.trim(),
          coverUrl: text(parsed.data.image),
          source: text(parsed.data.source),
        }),
      );
    }
  }
  articles.sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));
  fileArticleCache = { at: Date.now(), articles };
  return articles;
}

async function articlesFromStrapi(): Promise<Article[] | null> {
  const pageSize = 100;
  const all: Article[] = [];
  for (let page = 1; page < 20; page += 1) {
    const json = await strapiGet<StrapiList<Article>>(
      `/articles?sort=publishedOn:desc&pagination[page]=${page}&pagination[pageSize]=${pageSize}&fields[0]=title&fields[1]=slug&fields[2]=category&fields[3]=excerpt&fields[4]=author&fields[5]=publishedOn&fields[6]=coverUrl&fields[7]=tags&fields[8]=source`,
    );
    if (!json?.data) return page === 1 ? null : all;
    all.push(...json.data.map((entry) => normalizeArticle(entry)));
    const pageCount = json.meta?.pagination?.pageCount || 1;
    if (page >= pageCount) break;
  }
  return all.length ? all : null;
}

export async function getArticles() {
  const remote = await articlesFromStrapi();
  return remote && remote.length ? remote : articlesFromFiles();
}

export async function getArticle(category: ArticleCategory, slug: string) {
  const json = await strapiGet<StrapiList<Article>>(
    `/articles?filters[slug][$eq]=${encodeURIComponent(slug)}&filters[category][$eq]=${category}&pagination[pageSize]=1`,
  );
  const remote = json?.data?.[0];
  if (remote) return normalizeArticle(remote);
  if (json) {
    const published = await articlesFromStrapi();
    if (published?.length) return null;
  }
  return articlesFromFiles().find((article) => article.category === category && article.slug === slug) || null;
}

export async function getRelated(article: Article) {
  const articles = await getArticles();
  return articles
    .filter((entry) => entry.category === article.category && entry.slug !== article.slug)
    .slice(0, 3);
}

function extractPostHtml(filename: string) {
  const file = path.join(repoRoot(), "templates", filename);
  if (!fs.existsSync(file)) return "";
  const html = fs.readFileSync(file, "utf8");
  const marker = '<div class="post-content lotro-article">';
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const from = start + marker.length;
  return html.slice(from, html.indexOf("</div>", from)).trim();
}

const PAGE_FILES: Record<string, { title: string; file: string }> = {
  about: { title: "About LOTRO Guides", file: "about-content.html" },
  privacy: { title: "Privacy Policy", file: "privacy-content.html" },
  terms: { title: "Terms of Service", file: "terms-content.html" },
};

export async function getPage(slug: string): Promise<StaticPage | null> {
  const json = await strapiGet<StrapiList<StaticPage>>(
    `/pages?filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1`,
  );
  const remote = json?.data?.[0];
  if (remote?.body) {
    return {
      title: remote.title,
      slug: remote.slug || slug,
      body: remote.body,
      format: remote.format === "markdown" ? "markdown" : "html",
    };
  }
  const fallback = PAGE_FILES[slug];
  if (!fallback) return null;
  const body = extractPostHtml(fallback.file);
  if (!body) return null;
  return { title: fallback.title, slug, body, format: "html" };
}

function youtubeId(value: string) {
  const match = value.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return match ? match[1] : value;
}

export async function getVideos(): Promise<Video[]> {
  const json = await strapiGet<StrapiList<Video>>("/videos?sort=publishedOn:desc&pagination[pageSize]=100");
  if (json?.data?.length) {
    return json.data.map((video) => ({
      title: video.title,
      youtubeId: video.youtubeId,
      description: video.description || "",
      publishedOn: video.publishedOn || "",
      thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`,
    }));
  }
  const fileVideos = readRepoJson<Array<Record<string, string>>>("content", "media", "videos.json") || [];
  return fileVideos
    .map((video) => {
      const id = youtubeId(String(video.youtubeId || video.url || ""));
      return {
        title: video.title || "LOTRO Video",
        youtubeId: id,
        description: video.description || "",
        publishedOn: video.publishedAt || video.publishedOn || "",
        thumbnail: video.thumbnail || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ""),
      };
    })
    .filter((video) => video.youtubeId && !video.youtubeId.includes("http"));
}

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "LOTRO Guides",
  description: "Guides, news, databases, and an interactive map for Lord of the Rings Online.",
  heroTitle: "LOTRO Guides",
  heroSubtitle:
    "Your companion through Lord of the Rings Online — class builds, crafting guides, instance walkthroughs, and the latest news from Middle-earth.",
  footerAbout:
    "A fan-created resource for Lord of the Rings Online players. We cover class builds, crafting guides, instance walkthroughs, and the latest LOTRO news. Made by the community, for the community.",
  flowCards: [],
  navigation: {},
};

function ensureCharacterLog(navigation: SiteSettings["navigation"]): SiteSettings["navigation"] {
  const header: NavItem[] = (navigation.header || []).map((item) => ({
    ...item,
    activeOn: item.activeOn ? [...item.activeOn] : undefined,
    children: item.children ? item.children.map((child) => ({ ...child })) : undefined,
  }));
  const hasCharacterLog = header.some(
    (item) =>
      item.url.replace(/\.html$/, "") === "characters" ||
      item.children?.some((child) => child.url.replace(/\.html$/, "") === "characters"),
  );
  if (!hasCharacterLog) {
    const skills = header.find((item) => (item.activeOn || []).includes("skills") || item.url.replace(/\.html$/, "") === "skills");
    if (skills) {
      const activeOn = new Set(skills.activeOn || []);
      activeOn.add("skills");
      activeOn.add("characters");
      skills.activeOn = [...activeOn];
      const children = skills.children || [];
      if (!children.some((child) => child.url.replace(/\.html$/, "") === "skills")) {
        children.unshift({ label: "Trait Builder", url: "skills.html" });
      }
      children.push({ label: "Character Log", url: "characters.html" });
      skills.children = children;
    } else {
      header.push({ label: "Character Log", url: "characters.html", activeOn: ["characters"] });
    }
  }
  const primary = [...(navigation.footer?.primary || [])];
  if (!primary.some((link) => link.url.replace(/\.html$/, "") === "characters")) {
    primary.push({ label: "Character Log", url: "characters.html" });
  }
  return {
    ...navigation,
    header,
    footer: { ...navigation.footer, primary, secondary: navigation.footer?.secondary },
  };
}

export async function getSettings(): Promise<SiteSettings> {
  const json = await strapiGet<StrapiSingle<SiteSettings>>("/site-setting");
  const remote = json?.data;
  const fileFlow = readRepoJson<FlowCard[]>("content", "homepage-flow.json") || [];
  const fileNav = readRepoJson<SiteSettings["navigation"]>("content", "navigation.json") || {};
  if (!remote) {
    return { ...DEFAULT_SETTINGS, flowCards: fileFlow, navigation: ensureCharacterLog(fileNav) };
  }
  return {
    siteName: remote.siteName || DEFAULT_SETTINGS.siteName,
    description: remote.description || DEFAULT_SETTINGS.description,
    heroTitle: remote.heroTitle || DEFAULT_SETTINGS.heroTitle,
    heroSubtitle: remote.heroSubtitle || DEFAULT_SETTINGS.heroSubtitle,
    footerAbout: remote.footerAbout || DEFAULT_SETTINGS.footerAbout,
    flowCards: Array.isArray(remote.flowCards) && remote.flowCards.length ? remote.flowCards : fileFlow,
    navigation: ensureCharacterLog(remote.navigation?.header ? remote.navigation : fileNav),
  };
}
