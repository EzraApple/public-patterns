import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { request } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify, stripVTControlCharacters } from "node:util";

import { buildCaseInput } from "../experiments/investigator/case-input.mjs";

const execute = promisify(execFile);

function requestInvestigation(origin, input) {
  return new Promise((resolve, reject) => {
    const investigationRequest = request(`${origin}/investigations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(960_000),
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => resolve({
        status: response.statusCode,
        ok: response.statusCode >= 200 && response.statusCode < 300,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    investigationRequest.once("error", reject);
    investigationRequest.end(JSON.stringify(input));
  });
}

const parseArguments = () => {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  let fixture;
  let result;
  let model = "deepseek-v4-pro";

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--model") {
      model = args[++index];
      if (!["deepseek-v4-pro", "deepseek-v4-flash"].includes(model)) {
        throw new Error("Unsupported investigator model");
      }
    } else if (argument === "--result") {
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

  return { fixture, result, model };
};

const workerName = `pp-eval-${crypto.randomUUID()}`;

const listInvestigatorContainers = async () => {
  const { stdout } = await execute("docker", [
    "ps",
    "--filter",
    `name=workerd-${workerName}-Sandbox-`,
    "--format",
    "{{.Names}}",
  ]);
  return stdout.trim().split("\n").filter(Boolean);
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

const server = spawn(
  "doppler",
  [
    "run",
    "--",
    "pnpm",
    "--filter",
    "@public-patterns/investigator",
    "dev",
    "--name",
    workerName,
    "--port",
    "0",
    "--inspector-port",
    "0",
    "--var",
    `INVESTIGATOR_MODEL:${options.model}`,
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
  const caseInput = buildCaseInput(fixture);
  const inputHash = createHash("sha256")
    .update(JSON.stringify(caseInput)).digest("hex");
  const startedAt = Date.now();
  const response = await requestInvestigation(origin, {
    id: `dev-eval-${fixture.id}-${options.model}-${crypto.randomUUID()}`,
    case: caseInput,
  });
  const body = JSON.parse(response.body);
  const durationMs = Date.now() - startedAt;
  if (options.result) {
    const resultPath = path.resolve(repository, options.result);
    await writeFile(resultPath, `${JSON.stringify(body, null, 2)}\n`);
    if (typeof body.archiveKey === "string") {
      try {
        await execute("pnpm", [
          "--filter", "@public-patterns/investigator", "exec", "wrangler",
          "r2", "object", "get", `public-patterns-archive-dev/${body.archiveKey}`,
          "--local", "--file", `${resultPath}.archive.json`,
        ], { cwd: repository });
      } catch (error) {
        console.warn("Could not export the local session archive", error.message);
      }
    }
    await writeFile(`${resultPath}.run.json`, `${JSON.stringify({
      fixture: fixture.id,
      inputHash,
      model: options.model,
      startedAt: new Date(startedAt).toISOString(),
      durationMs,
      httpStatus: response.status,
      archiveKey: body.archiveKey,
    }, null, 2)}\n`);
  }

  if (
    !response.ok ||
    typeof body.brief !== "string" ||
    !body.brief.trim() ||
    !["investigate", "watch", "discard"].includes(body.submission?.outcome) ||
    (body.submission?.outcome === "investigate" &&
      (!body.article ||
        typeof body.article.title !== "string" ||
        !body.article.title.trim() ||
        typeof body.review !== "string" ||
        !body.review.trim()))
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
    console.log(JSON.stringify(body.article, null, 2));
    console.log("\n--- Self-review ---\n");
    console.log(body.review);
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
    const createdContainers = await listInvestigatorContainers();
    if (createdContainers.length > 0) {
      await execute("docker", ["rm", "--force", ...createdContainers]);
    }
  } catch (error) {
    console.warn("Could not remove the smoke test containers", error);
  }
}
