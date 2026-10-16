import type { Metadata } from "next";
import "./globals.css";
import { getArticles, getSettings } from "@/lib/content";
import type { Article } from "@/lib/content";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: {
    default: "LOTRO Guides",
    template: "%s",
  },
  description: "Guides, news, databases, and an interactive map for Lord of the Rings Online.",
  icons: {
    icon: [
      { url: "/img/favicon.png", sizes: "64x64", type: "image/png" },
    ],
  },
};

function summary(article: Article): Article {
  return { ...article, body: "" };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, articles] = await Promise.all([getSettings(), getArticles()]);
  const guides = articles.filter((article) => article.category === "guide").map(summary);
  const news = articles.filter((article) => article.category === "news").slice(0, 8).map(summary);
  const analyticsId = process.env.GOOGLE_ANALYTICS_ID || "";
  const cdnUrl = (process.env.DO_CDN_URL || "").trim().replace(/\/$/, "");
  const cdnScript = /^https:\/\/[A-Za-z0-9.-]+$/.test(cdnUrl)
    ? `window.LOTRO_CDN=${JSON.stringify(cdnUrl)};`
    : "";

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap"
          rel="stylesheet"
        />
        <link href="/plugins/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
        <link href="/plugins/font-awesome/css/font-awesome.min.css" rel="stylesheet" />
        <link href="/css/theme.min.css" rel="stylesheet" />
        <link href="/css/lotro.css" rel="stylesheet" />
        {cdnScript ? <script dangerouslySetInnerHTML={{ __html: cdnScript }} /> : null}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if(/[?&]embed=1/.test(location.search))document.documentElement.className+=' lotro-map-embed-mode';",
          }}
        />
        {analyticsId ? (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${analyticsId}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${analyticsId}');`,
              }}
            />
          </>
        ) : null}
        <script src="/plugins/jquery/jquery-3.1.0.min.js" defer />
        <script src="/plugins/bootstrap/js/bootstrap.min.js" defer />
        <script src="/js/theme.min.js" defer />
      </head>
      <body>
        <SiteHeader
          siteName={settings.siteName}
          items={settings.navigation.header || []}
          guides={guides}
          news={news}
        />
        <main>{children}</main>
        <SiteFooter
          about={settings.footerAbout}
          primary={settings.navigation.footer?.primary || []}
          secondary={settings.navigation.footer?.secondary || []}
        />
      </body>
    </html>
  );
}
