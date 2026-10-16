import type { Article } from "@/lib/content";
import { PostCard } from "./PostCard";

export function Listing({
  title,
  icon,
  articles,
}: {
  title: string;
  icon: string;
  articles: Article[];
}) {
  return (
    <>
      <section className="breadcrumbs">
        <div className="container">
          <ol className="breadcrumb">
            <li>
              <a href="/">Home</a>
            </li>
            <li className="active">{title}</li>
          </ol>
        </div>
      </section>
      <section className="p-y-80">
        <div className="container">
          <div className="heading">
            <i className={`fa ${icon}`} />
            <h2>{title}</h2>
          </div>
          <div className="row">
            {articles.map((article) => (
              <PostCard key={article.slug} article={article} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
