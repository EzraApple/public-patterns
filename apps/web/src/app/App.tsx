import { GoldenGateScene } from "../features/landing/GoldenGateScene";

const links = [
  {
    href: "https://github.com/EzraApple/public-patterns",
    label: "GitHub",
  },
  {
    href: "https://x.com/Ezra_SF",
    label: "X / Twitter",
  },
];

export function App() {
  return (
    <main className="landing">
      <div className="atmosphere" aria-hidden="true" />
      <GoldenGateScene />

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          San Francisco, in public
        </p>

        <h1 id="page-title">Public Patterns</h1>

        <p className="lede">
          Looking for what changes, what connects, and what the city&apos;s data
          can explain.
        </p>

        <div className="footer-row">
          <p className="status">Coming soon</p>
          <nav aria-label="Project links">
            {links.map((link) => (
              <a
                href={link.href}
                key={link.href}
                rel="noreferrer"
                target="_blank"
              >
                {link.label}
                <span aria-hidden="true"> ↗</span>
              </a>
            ))}
          </nav>
        </div>
      </section>
    </main>
  );
}

