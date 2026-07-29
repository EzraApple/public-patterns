import "./site-brand.css";

export function SiteBrand() {
  return (
    <a className="site-brand" href="/">
      <img
        aria-hidden="true"
        className="site-brand-bridge"
        src="/brand/golden-gate-pixel.png"
      />
      <span>Public Patterns</span>
    </a>
  );
}
