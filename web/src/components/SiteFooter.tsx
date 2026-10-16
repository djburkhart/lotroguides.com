import { cleanNavUrl } from "@/lib/format";
import type { NavLink } from "@/lib/content";

export function SiteFooter({
  about,
  primary,
  secondary,
}: {
  about: string;
  primary: NavLink[];
  secondary: NavLink[];
}) {
  const year = new Date().getFullYear();
  return (
    <footer id="footer">
      <div className="container">
        <div className="row">
          <div className="col-sm-12 col-md-5">
            <h4 className="footer-title">About LOTRO Guides</h4>
            <p>{about}</p>
            <p>This is a fan site and is not affiliated with or endorsed by Standing Stone Games or Middle-earth Enterprises.</p>
          </div>
          <div className="col-sm-12 col-md-3">
            <h4 className="footer-title">Quick Links</h4>
            <div className="row">
              <div className="col">
                <ul>
                  {primary.map((link) => (
                    <li key={link.url}>
                      <a href={cleanNavUrl(link.url)}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="col">
                <ul>
                  {secondary.map((link) => (
                    <li key={link.url}>
                      <a href={cleanNavUrl(link.url)}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="col-sm-12 col-md-4">
            <h4 className="footer-title">Community</h4>
            <p>Join fellow LOTRO adventurers across Middle-earth. Share your knowledge, ask questions, and help new players find their way.</p>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-social">
            <a href="/bot" title="Discord">
              <i className="fa fa-comments" />
            </a>
            <a href="https://www.reddit.com/r/lotro/" title="Reddit">
              <i className="fa fa-reddit" />
            </a>
            <a href="/media" title="YouTube">
              <i className="fa fa-youtube" />
            </a>
          </div>
          <p>Copyright &copy; {year} LOTRO Guides. A LOTRO fan site. Not affiliated with Standing Stone Games.</p>
        </div>
      </div>
    </footer>
  );
}
