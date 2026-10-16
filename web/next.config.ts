import type { NextConfig } from "next";
import path from "path";

const strapiOrigin = process.env.STRAPI_URL || "http://127.0.0.1:1337";

function proxyStrapi(prefix: string) {
  return [
    { source: `/${prefix}`, destination: `${strapiOrigin}/${prefix}` },
    { source: `/${prefix}/:path*`, destination: `${strapiOrigin}/${prefix}/:path*` },
  ];
}

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/editor", destination: "/admin", permanent: false },
      { source: "/:page.html", destination: "/:page", permanent: true },
    ];
  },
  async rewrites() {
    const contentApi = ["articles", "pages", "videos", "site-setting", "users", "auth", "connect"].flatMap((name) =>
      proxyStrapi(`api/${name}`),
    );
    return {
      beforeFiles: [
        ...proxyStrapi("admin"),
        ...proxyStrapi("content-manager"),
        ...proxyStrapi("content-type-builder"),
        ...proxyStrapi("i18n"),
        ...proxyStrapi("upload"),
        ...proxyStrapi("uploads"),
        ...proxyStrapi("users-permissions"),
        ...proxyStrapi("email"),
        ...contentApi,
      ],
    };
  },
};

export default nextConfig;
