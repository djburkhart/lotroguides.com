export default function NotFound() {
  return (
    <section className="p-y-80">
      <div className="container text-center">
        <div className="heading">
          <i className="fa fa-map-o" />
          <h2>Page not found</h2>
          <p>That path is not on the map.</p>
        </div>
        <a className="btn btn-primary btn-rounded" href="/">
          Back home
        </a>
      </div>
    </section>
  );
}
