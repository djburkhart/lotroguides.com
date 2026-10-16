import type { Metadata } from "next";
import { getArticles, getSettings } from "@/lib/content";
import { PostCard } from "@/components/PostCard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return { description: settings.description };
}

export default async function HomePage() {
  const [settings, articles] = await Promise.all([getSettings(), getArticles()]);
  const featured = articles[0];
  const recent = articles.slice(1, 7);
  const featuredHref = featured
    ? `/${featured.category === "guide" ? "guides" : "news"}/${featured.slug}`
    : "/guides";

  return (
    <>
      <section className="lotro-hero bg-inverse p-y-0">
        <div className="lotro-hero-bg" style={{ backgroundImage: "url('/img/lotro-hero.jpg')" }}>
          <div className="carousel-overlay" />
          <div className="lotro-hero-content">
            <h1 className="lotro-hero-title">{settings.heroTitle}</h1>
            <p className="lotro-hero-subtitle">{settings.heroSubtitle}</p>
          </div>
        </div>
      </section>

      <section className="lotro-home-flow p-y-40">
        <div className="container">
          <div className="lotro-home-flow-grid">
            {settings.flowCards.map((card) => (
              <a className="lotro-home-flow-card" href={card.href.startsWith("/") ? card.href : `/${card.href}`} key={card.href}>
                <span className="lotro-home-flow-icon">
                  <i className={`fa ${card.icon}`} />
                </span>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {featured && (
        <section className="p-y-80 bg-secondary no-border-bottom">
          <div className="container">
            <div className="row">
              <div className="col-lg-8">
                <div className="card card-lg lotro-featured-card">
                  <div className="card-img">
                    <a href={featuredHref}>
                      <img src={featured.coverUrl} className="card-img-top" alt={featured.title} />
                    </a>
                    <div className={`${featured.category === "guide" ? "badge-success" : "badge-primary"} badge`}>
                      {featured.category === "guide" ? "Guide" : "News"}
                    </div>
                  </div>
                  <div className="card-block">
                    <h3 className="card-title">
                      <a href={featuredHref}>{featured.title}</a>
                    </h3>
                    <p className="card-text">{featured.excerpt}</p>
                    <a href={featuredHref} className="btn btn-primary btn-rounded btn-sm">
                      Read More
                    </a>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="widget widget-sidebar">
                  <h5 className="widget-title">
                    <i className="fa fa-compass m-r-5" /> Quick Navigation
                  </h5>
                  <ul className="lotro-quick-nav">
                    <li>
                      <a href="/guides">
                        <i className="fa fa-book" /> All Guides
                      </a>
                    </li>
                    <li>
                      <a href="/news">
                        <i className="fa fa-newspaper-o" /> Latest News
                      </a>
                    </li>
                    <li>
                      <a href="/skills">
                        <i className="fa fa-shield" /> Trait Builder
                      </a>
                    </li>
                    <li>
                      <a href="/characters">
                        <i className="fa fa-user" /> Character Log
                      </a>
                    </li>
                    <li>
                      <a href="/instances">
                        <i className="fa fa-users" /> Instances &amp; Raids
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="p-y-80">
        <div className="container">
          <div className="heading">
            <i className="fa fa-book" />
            <h2>Latest Guides &amp; News</h2>
            <p>Stay up to date with the latest guides, builds, and news for Lord of the Rings Online.</p>
          </div>
          <div className="row">
            {recent.map((article) => (
              <PostCard key={`${article.category}-${article.slug}`} article={article} />
            ))}
          </div>
          <div className="text-center m-t-30">
            <a className="btn btn-primary btn-shadow btn-rounded btn-effect btn-lg" href="/guides">
              Browse All Guides
            </a>
            <a className="btn btn-secondary btn-shadow btn-rounded btn-effect btn-lg m-l-10" href="/news">
              Latest News
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
