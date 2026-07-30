import { execFile, spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify, stripVTControlCharacters } from "node:util";

import { buildCaseInput } from "../experiments/investigator/case-input.mjs";

const execute = promisify(execFile);

const parseArguments = () => {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  let fixture;
  let result;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--result") {
      result = args[index + 1];
      if (!result) {
        throw new Error("--result requires a file path");
      }
      index += 1;
    } else if (!fixture) {
      fixture = argument;
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }

  return { fixture, result };
};

const listInvestigatorProxies = async () => {
  const { stdout } = await execute("docker", [
    "ps",
    "--filter",
    "name=workerd-public-patterns-investigator-Sandbox-",
    "--format",
    "{{.Names}}",
  ]);
  return new Set(
    stdout
      .trim()
      .split("\n")
      .filter((name) => name.endsWith("-proxy")),
  );
};

const repository = fileURLToPath(new URL("..", import.meta.url));
const options = parseArguments();
const fixturePath = path.resolve(
  repository,
  options.fixture ??
    "experiments/clustering/fixtures/third-mendell-palou-2023-09-01.json",
);
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

if (
  !fixture.id ||
  (!Array.isArray(fixture.datasets) && !Array.isArray(fixture.series))
) {
  throw new Error("The investigator smoke fixture needs an id and evidence");
}

const existingProxies = await listInvestigatorProxies();
const server = spawn(
  "doppler",
  [
    "run",
    "--",
    "pnpm",
    "--filter",
    "@public-patterns/investigator",
    "dev",
    "--port",
    "0",
  ],
  {
    cwd: repository,
    env: { ...process.env, CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOutput = "";
const {
  promise: originReady,
  resolve: resolveOrigin,
  reject: rejectOrigin,
} = Promise.withResolvers();
const appendServerOutput = (chunk) => {
  serverOutput += chunk;
  const match = stripVTControlCharacters(serverOutput).match(
    /Ready on (http:\/\/\S+)/,
  );
  if (match) {
    resolveOrigin(match[1]);
  }
};

server.stdout.on("data", appendServerOutput);
server.stderr.on("data", appendServerOutput);
server.once("error", rejectOrigin);
server.once("exit", (code) => {
  rejectOrigin(new Error(`Wrangler exited before startup with code ${code}`));
});

console.log("Starting the local Investigator Worker through Doppler...");

try {
  const startupTimeout = setTimeout(
    () => rejectOrigin(new Error("Investigator startup timed out")),
    180_000,
  );
  const origin = await originReady.finally(() => clearTimeout(startupTimeout));
  const healthResponse = await fetch(`${origin}/health`);
  if (!healthResponse.ok) {
    throw new Error(`Investigator health check returned ${healthResponse.status}`);
  }

  console.log(`Running evidence-only fixture ${fixture.id}...`);
  const response = await fetch(`${origin}/investigations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: `dev-smoke-${fixture.id}`,
      case: buildCaseInput(fixture),
    }),
    signal: AbortSignal.timeout(960_000),
  });
  const body = await response.json();

  if (
    !response.ok ||
    typeof body.brief !== "string" ||
    !body.brief.trim() ||
    !["investigate", "watch", "discard"].includes(body.submission?.outcome) ||
    (body.submission?.outcome === "investigate" &&
      (typeof body.article !== "string" || !body.article.trim()))
  ) {
    throw new Error(
      `Unexpected investigator result (${response.status}): ${JSON.stringify(body)}`,
    );
  }

  console.log(
    `Investigator returned ${body.submission.outcome} at ${body.submission.confidence} confidence.\n`,
  );
  console.log(body.brief);
  if (body.article) {
    console.log("\n--- Article ---\n");
    console.log(body.article);
  }
  if (options.result) {
    await writeFile(
      path.resolve(repository, options.result),
      `${JSON.stringify(body, null, 2)}\n`,
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`${message}\n${serverOutput}`);
} finally {
  if (server.exitCode === null) {
    const exited = Promise.withResolvers();
    server.once("exit", exited.resolve);
    server.kill("SIGTERM");
    const shutdownTimeout = setTimeout(exited.resolve, 5_000);
    await exited.promise;
    clearTimeout(shutdownTimeout);
  }
  try {
    const createdProxies = [...(await listInvestigatorProxies())].filter(
      (name) => !existingProxies.has(name),
    );
    if (createdProxies.length > 0) {
      await execute("docker", ["rm", "--force", ...createdProxies]);
    }
  } catch (error) {
    console.warn("Could not remove the smoke test proxy container", error);
  }
}
