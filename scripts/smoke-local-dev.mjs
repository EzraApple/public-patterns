import { spawn } from "node:child_process";

const origin = "http://127.0.0.1:4173";
const server = spawn(
  "pnpm",
  [
    "--filter",
    "@public-patterns/web",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    "4173",
    "--strictPort",
  ],
  {
    env: {
      ...process.env,
      CLOUDFLARE_ENV: "dev",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";

server.stdout.on("data", (chunk) => {
  output += chunk;
});

server.stderr.on("data", (chunk) => {
  output += chunk;
});

const waitForServer = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Local dev server exited early.\n${output}`);
    }

    try {
      const response = await fetch(`${origin}/api/health`);

      if (response.ok) {
        return response;
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Local dev server did not become ready.\n${output}`);
};

try {
  const healthResponse = await waitForServer();
  const health = await healthResponse.json();

  if (
    health.environment !== "dev" ||
    health.service !== "public-patterns-web" ||
    health.status !== "ok"
  ) {
    throw new Error(`Unexpected health response: ${JSON.stringify(health)}`);
  }

  const pageResponse = await fetch(origin);
  const page = await pageResponse.text();

  if (!pageResponse.ok || !page.includes('<div id="root"></div>')) {
    throw new Error("Local site did not return the application shell.");
  }

  const missingMediaResponse = await fetch(
    `${origin}/media/articles/missing.webp`,
  );
  if (
    missingMediaResponse.status !== 404 ||
    missingMediaResponse.headers.get("content-type")?.includes("text/html")
  ) {
    throw new Error(
      "Article media did not route through the web Worker.",
    );
  }

  console.log(`Local dev smoke test passed at ${origin}`);
} finally {
  server.kill("SIGTERM");

  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}
