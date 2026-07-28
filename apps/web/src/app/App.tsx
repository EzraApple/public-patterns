import { GoldenGateScene } from "@/features/landing/GoldenGateScene";

const links = [
  {
    href: "https://github.com/EzraApple/public-patterns",
    icon: "github",
    label: "GitHub",
  },
  {
    href: "https://x.com/Ezra_SF",
    icon: "x",
    label: "X / Twitter",
  },
] as const;

function SocialIcon({ icon }: { icon: (typeof links)[number]["icon"] }) {
  if (icon === "github") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path
          d="M12 2.5a9.75 9.75 0 0 0-3.08 19c.49.09.67-.21.67-.47v-1.7c-2.73.6-3.3-1.16-3.3-1.16-.45-1.13-1.1-1.43-1.1-1.43-.9-.62.07-.61.07-.61 1 .07 1.52 1.02 1.52 1.02.89 1.52 2.33 1.08 2.9.83.09-.64.35-1.08.63-1.33-2.18-.25-4.47-1.09-4.47-4.82 0-1.07.38-1.94 1.02-2.62-.1-.25-.44-1.24.1-2.58 0 0 .82-.26 2.68 1a9.3 9.3 0 0 1 4.88 0c1.86-1.26 2.68-1 2.68-1 .54 1.34.2 2.33.1 2.58.64.68 1.02 1.55 1.02 2.62 0 3.74-2.3 4.56-4.48 4.81.36.31.67.91.67 1.84v2.56c0 .26.18.57.67.47A9.75 9.75 0 0 0 12 2.5Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M18.9 2.75h3.28l-7.16 8.18 8.42 11.13h-6.6l-5.16-6.75-5.91 6.75H2.48l7.66-8.76L2.06 2.75h6.76l4.67 6.18 5.41-6.18Zm-1.15 17.35h1.82L7.83 4.6H5.88l11.87 15.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function App() {
  return (
    <main className="landing">
      <div className="atmosphere" aria-hidden="true" />
      <GoldenGateScene />

      <section className="intro" aria-labelledby="page-title">
        <h1 id="page-title">Public Patterns</h1>

        <div className="footer-row">
          <p className="status">Coming soon</p>
          <nav aria-label="Project links">
            {links.map((link) => (
              <a
                href={link.href}
                key={link.href}
                rel="noreferrer"
                target="_blank"
                title={link.label}
                aria-label={link.label}
              >
                <SocialIcon icon={link.icon} />
              </a>
            ))}
          </nav>
        </div>
      </section>
    </main>
  );
}
