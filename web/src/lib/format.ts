export function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function cleanNavUrl(url: string) {
  if (!url || url === "index.html" || url === "./") return "/";
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const path = (hashIndex >= 0 ? url.slice(0, hashIndex) : url)
    .replace(/^\.\//, "")
    .replace(/\.html$/, "")
    .replace(/^\//, "");
  return `/${path}${hash}`;
}

export function stripMarkdown(markdown: string) {
  return markdown
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://lotroguides.com").replace(/\/$/, "");
}
