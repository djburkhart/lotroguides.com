import fs from "fs";
import path from "path";
import Script from "next/script";
import { DATABASES, type DatabaseId, skillsTemplateVars } from "@/lib/databases";
import { repoRoot } from "@/lib/paths";

function fillTemplate(html: string, vars: Record<string, string>) {
  return html
    .replace(/\{\{(\w+)\}\}/g, (_match, key: string) => (key in vars ? vars[key] : ""))
    .replace(/href="\.\/"/g, 'href="/"');
}

function splitScripts(html: string) {
  const scripts: { src?: string; code?: string }[] = [];
  const cleaned = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_match, attrs: string, code: string) => {
    const src = /src="([^"]+)"/.exec(attrs);
    if (src) scripts.push({ src: src[1].replace(/^\.\//, "/") });
    else scripts.push({ code });
    return "";
  });
  return { html: cleaned, scripts };
}

export function DatabasePage({ id }: { id: DatabaseId }) {
  const page = DATABASES[id];
  const file = path.join(repoRoot(), "templates", page.template);
  const raw = fs.readFileSync(file, "utf8");
  const vars = id === "skills" ? { ...page.vars, ...skillsTemplateVars() } : { ...page.vars };
  if (id === "items") {
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(repoRoot(), "data", "items-db-manifest.json"), "utf8"),
      ) as { totalItems?: number };
      if (manifest.totalItems) vars.itemCount = manifest.totalItems.toLocaleString();
    } catch {
      /* Keep the generic count when the manifest has not been imported. */
    }
  }
  const filled = fillTemplate(raw, vars);
  const parts = splitScripts(filled);
  const inline = parts.scripts
    .filter((script) => script.code)
    .map((script) => script.code)
    .join("\n");
  const external = [
    ...page.scripts,
    ...parts.scripts.filter((script) => script.src).map((script) => script.src as string),
  ];

  const runner = `;(function () {
    function ready(fn) {
      if (window.jQuery) fn(window.jQuery);
      else setTimeout(function () { ready(fn); }, 40);
    }
    function load(src) {
      return new Promise(function (resolve) {
        var existing = document.querySelector('script[src="' + src + '"]');
        if (existing && existing.getAttribute("data-loaded") === "1") return resolve();
        var el = existing || document.createElement("script");
        el.src = src;
        el.onload = function () { el.setAttribute("data-loaded", "1"); resolve(); };
        el.onerror = function () { resolve(); };
        if (!existing) document.body.appendChild(el);
      });
    }
    ready(function () {
      var sources = ${JSON.stringify(external)};
      var chain = Promise.resolve();
      sources.forEach(function (src) { chain = chain.then(function () { return load(src); }); });
      chain.then(function () {
        ${page.boot}
        var originalAdd = document.addEventListener.bind(document);
        document.addEventListener = function (type, listener, options) {
          if ((type === "DOMContentLoaded" || type === "load") && document.readyState !== "loading") {
            if (typeof listener === "function") listener();
            return;
          }
          return originalAdd(type, listener, options);
        };
        (0, eval)(${JSON.stringify(inline)});
        document.addEventListener = originalAdd;
      });
    });
  })();`;

  return (
    <>
      {page.styles.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div dangerouslySetInnerHTML={{ __html: parts.html }} />
      <Script id={`db-${id}`} strategy="afterInteractive">
        {runner}
      </Script>
    </>
  );
}
