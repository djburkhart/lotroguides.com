import { renderBody } from "@/lib/markdown";
import type { StaticPage } from "@/lib/content";

export function PageView({ page }: { page: StaticPage }) {
  const html = renderBody(page.body, page.format);
  return (
    <>
      <section className="breadcrumbs">
        <div className="container">
          <ol className="breadcrumb">
            <li>
              <a href="/">Home</a>
            </li>
            <li className="active">{page.title}</li>
          </ol>
        </div>
      </section>
      <section className="p-y-80">
        <div className="container">
          <div className="row">
            <div className="col-lg-10 offset-lg-1">
              <div className="post post-single">
                <h2 className="post-title">{page.title}</h2>
                <div className="post-content lotro-article" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
