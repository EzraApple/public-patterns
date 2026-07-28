import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const deployments = {
  investigator: {
    directory: "apps/investigator",
    required: ["DEEPSEEK_API_KEY"],
  },
  pipeline: {
    directory: "apps/pipeline",
    optional: ["SOCRATA_APP_TOKEN", "TRANSIT_511_API_KEY"],
  },
  web: {
    build: "build",
    directory: "apps/web",
    required: ["LAB_TOKEN"],
  },
  "web-dev": {
    build: "build:dev",
    directory: "apps/web",
    required: ["LAB_TOKEN"],
  },
};

const name = process.argv[2];
const deployment = deployments[name];
if (!deployment) {
  throw new Error(`Unknown deployment: ${name}`);
}

const repository = fileURLToPath(new URL("..", import.meta.url));
const directory = path.join(repository, deployment.directory);
const required = Object.fromEntries(
  (deployment.required ?? []).map((key) => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`${key} is required`);
    }
    return [key, value];
  }),
);
const optional = Object.fromEntries(
  (deployment.optional ?? [])
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
const secrets = { ...required, ...optional };
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "public-patterns-deploy-"),
);
const secretsPath = path.join(temporaryDirectory, "secrets.json");

try {
  if (deployment.build) {
    await run(["run", deployment.build], directory);
  }
  const args = ["exec", "wrangler", "deploy"];
  if (Object.keys(secrets).length > 0) {
    await writeFile(secretsPath, JSON.stringify(secrets), { mode: 0o600 });
    args.push("--secrets-file", secretsPath);
  }
  await run(args, directory);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pnpm ${args.join(" ")} exited ${code}`)),
    );
  });
}
