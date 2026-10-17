import { formatDate, siteUrl } from "@/lib/format";
import { renderBody } from "@/lib/markdown";
import type { Article } from "@/lib/content";
import { PostCard } from "./PostCard";

export function ArticleView({ article, related }: { article: Article; related: Article[] }) {
  const section = article.category === "guide" ? "guides" : "news";
  const sectionLabel = article.category === "guide" ? "Guides" : "News";
  const url = `${siteUrl()}/${section}/${article.slug}`;
  const encoded = encodeURIComponent(article.title);
  const html = renderBody(article.body, "markdown", article.slug);

  return (
    <>
      <section className="breadcrumbs">
        <div className="container">
          <ol className="breadcrumb">
            <li>
              <a href="/">Home</a>
            </li>
            <li>
              <a href={`/${section}`}>{sectionLabel}</a>
            </li>
            <li className="active">{article.title}</li>
          </ol>
        </div>
      </section>
      <section>
        <div className="container">
          <div className="row">
            <div className="col-lg-1 hidden-md-down">
              <div className="widget widget-share">
                <div className="widget-block">
                  <span>Share</span>
                  <ShareLinks url={url} encodedTitle={encoded} placement="right" />
                </div>
              </div>
            </div>
            <div className="col-lg-10">
              <div className="post post-single">
                <h2 className="post-title">{article.title}</h2>
                <div className="post-meta">
                  <span>
                    <i className="fa fa-clock-o" /> {formatDate(article.publishedOn)}
                  </span>
                  <span>
                    <i className="fa fa-user" /> {article.author}
                  </span>
                </div>
                <div className="post-content lotro-article" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
              <div className="post-actions">
                <div className="post-tags">
                  {article.tags.map((tag) => (
                    <span key={tag} className="badge badge-default m-r-5">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="social-share">
                  <ShareLinks url={url} encodedTitle={encoded} placement="bottom" />
                </div>
              </div>
              {article.source && (
                <p>
                  <a href={article.source} target="_blank" rel="noopener noreferrer">
                    Source
                  </a>
                </p>
              )}
              {related.length > 0 && (
                <div className="post-related">
                  <h6 className="subtitle">Related Posts</h6>
                  <div className="row">
                    {related.map((entry) => (
                      <PostCard key={entry.slug} article={entry} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ShareLinks({ url, encodedTitle, placement }: { url: string; encodedTitle: string; placement: string }) {
  return (
    <>
      <a
        className="btn btn-social btn-facebook btn-circle"
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Share on Facebook"
        data-placement={placement}
      >
        <i className="fa fa-facebook" />
      </a>
      <a
        className="btn btn-social btn-twitter btn-circle"
        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Share on Twitter"
        data-placement={placement}
      >
        <i className="fa fa-twitter" />
      </a>
      <a
        className="btn btn-social btn-reddit btn-circle"
        href={`https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Share on Reddit"
        data-placement={placement}
      >
        <i className="fa fa-reddit" />
      </a>
    </>
  );
}
