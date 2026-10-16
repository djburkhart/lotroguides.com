import { formatDate } from "@/lib/format";
import type { Article } from "@/lib/content";

export function PostCard({ article }: { article: Article }) {
  const href = `/${article.category === "guide" ? "guides" : "news"}/${article.slug}`;
  const label = article.category === "guide" ? "Guide" : "News";
  return (
    <div className="col-12 col-sm-6 col-md-4">
      <div className="card card-lg">
        <div className="card-img">
          <a href={href}>
            <img src={article.coverUrl} className="card-img-top" alt={article.title} />
          </a>
          <div className={`${article.category === "guide" ? "badge-success" : "badge-primary"} badge`}>{label}</div>
        </div>
        <div className="card-block">
          <h4 className="card-title">
            <a href={href}>{article.title}</a>
          </h4>
          <div className="card-meta">
            <span>
              <i className="fa fa-clock-o" /> {formatDate(article.publishedOn)}
            </span>
            <span>
              <i className="fa fa-user" /> {article.author}
            </span>
          </div>
          <p className="card-text">{article.excerpt}</p>
        </div>
      </div>
    </div>
  );
}
