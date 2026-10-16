import type { Metadata } from "next";

export const metadata: Metadata = { title: "Editor - LOTRO Guides" };

export default function EditorPage() {
  const cmsUrl = process.env.NEXT_PUBLIC_STRAPI_URL || process.env.STRAPI_URL || "http://127.0.0.1:1337";
  return (
    <section className="p-y-80">
      <div className="container">
        <div className="row">
          <div className="col-lg-8 offset-lg-2">
            <div className="heading">
              <i className="fa fa-pencil" />
              <h2>Content Editor</h2>
              <p>Guides, news, pages, videos, and the homepage are edited in Strapi.</p>
            </div>
            <p>
              Open the CMS admin, sign in, and publish changes. The site reads published entries from the
              Strapi API and falls back to the Markdown files in <code>content/</code> until the first import
              finishes.
            </p>
            <p>
              <a className="btn btn-primary btn-rounded" href={`${cmsUrl}/admin`} target="_blank" rel="noopener noreferrer">
                Open Strapi Admin
              </a>
            </p>
            <h3>What lives in Strapi</h3>
            <ul>
              <li>Guides and news articles, including Markdown and shortcodes</li>
              <li>About, privacy, and terms pages</li>
              <li>Media gallery videos</li>
              <li>Homepage hero, feature cards, footer, and navigation</li>
            </ul>
            <h3>What stays as game data</h3>
            <p>
              Item, quest, deed, recipe, and map databases are generated from LotRO Companion exports. Import
              them with the existing <code>npm run update</code> scripts. Those JSON files are served with the
              site and are not stored as Strapi entries.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
