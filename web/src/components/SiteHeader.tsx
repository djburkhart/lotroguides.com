"use client";

import { usePathname } from "next/navigation";
import { cleanNavUrl } from "@/lib/format";
import type { Article, NavItem } from "@/lib/content";

function isActive(pathname: string, keys: string[] = []) {
  return keys.some((key) => {
    if (key === "home") return pathname === "/";
    return pathname === `/${key}` || pathname.startsWith(`/${key}/`);
  });
}

export function SiteHeader({
  siteName,
  items,
  guides,
  news,
}: {
  siteName: string;
  items: NavItem[];
  guides: Article[];
  news: Article[];
}) {
  const pathname = usePathname();

  return (
    <header id="header">
      <div className="container">
        <div className="navbar-backdrop">
          <div className="navbar">
            <div className="navbar-left">
              <a className="navbar-toggle">
                <i className="fa fa-bars" />
              </a>
              <a href="/" className="logo">
                <span className="lotro-logo-text">{siteName}</span>
              </a>
              <nav className="nav">
                <ul>
                  {items.map((item) => {
                    const children = [...(item.children || [])];
                    if (item.childrenFrom === "guideNavItems") {
                      guides.forEach((guide) => children.push({ label: guide.title, url: `guides/${guide.slug}` }));
                    }
                    if (item.childrenFrom === "newsNavItems") {
                      news.slice(0, 8).forEach((post) => children.push({ label: post.title, url: `news/${post.slug}` }));
                    }
                    const active = isActive(pathname, item.activeOn);
                    const className = [children.length ? "has-dropdown" : "", active ? "active" : ""]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <li key={item.label} className={className}>
                        <a href={cleanNavUrl(item.url)}>{item.label}</a>
                        {children.length > 0 && (
                          <ul>
                            {children.map((child) => (
                              <li key={`${child.label}-${child.url}`}>
                                <a href={cleanNavUrl(child.url)}>{child.label}</a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>
            <div className="nav navbar-right">
              <ul>
                <li>
                  <a data-toggle="search">
                    <i className="fa fa-search" />
                  </a>
                </li>
                <li>
                  <a href="/editor" title="Editor">
                    <i className="fa fa-user-circle-o" />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="navbar-search">
          <div className="container">
            <form method="get" action="/items" id="navbar-search-form">
              <input type="text" name="q" className="form-control" placeholder="Search items..." autoComplete="off" />
              <i className="fa fa-times close" />
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
