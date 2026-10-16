import type { Metadata } from "next";
import { formatDate } from "@/lib/format";
import { getVideos } from "@/lib/content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Media Gallery - LOTRO Guides" };

export default async function MediaPage() {
  const videos = await getVideos();
  return (
    <>
      <section
        className="hero hero-sm hero-media"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgba(10, 24, 38, 0.82), rgba(34, 59, 80, 0.78)), url('/img/default.jpg')",
        }}
      >
        <div className="container">
          <div className="hero-block text-center">
            <h1 className="hero-title">Media Gallery</h1>
            <p className="hero-text">Videos from the Lord of the Rings Online community.</p>
            <div className="hero-meta">
              <i className="fa fa-play-circle" /> {videos.length} Video(s)
            </div>
          </div>
        </div>
      </section>
      <section className="p-t-40 p-b-40">
        <div className="container">
          <div className="row">
            {videos.map((video) => (
              <div className="col-12 col-md-6 m-b-30" key={video.youtubeId}>
                <div className="panel panel-default">
                  <div className="panel-body">
                    <div className="embed-responsive embed-responsive-16by9 m-b-15">
                      <iframe
                        className="embed-responsive-item"
                        src={`https://www.youtube.com/embed/${video.youtubeId}`}
                        title={video.title}
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    </div>
                    <h4 className="m-b-10">{video.title}</h4>
                    {video.publishedOn && (
                      <span className="text-muted" style={{ fontSize: 13 }}>
                        <i className="fa fa-calendar" /> {formatDate(video.publishedOn)}
                      </span>
                    )}
                    <p className="text-muted m-b-10">{video.description}</p>
                    <a
                      className="btn btn-sm btn-default"
                      href={`https://youtu.be/${video.youtubeId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Watch on YouTube
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
