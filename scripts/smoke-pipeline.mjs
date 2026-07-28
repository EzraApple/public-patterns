import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const pipelineDirectory = fileURLToPath(
  new URL("../apps/pipeline", import.meta.url),
);
const stateDirectory = await mkdtemp(
  path.join(tmpdir(), "public-patterns-pipeline-"),
);

const run = (arguments_) =>
  new Promise((resolve, reject) => {
    const child = spawn("pnpm", arguments_, {
      cwd: pipelineDirectory,
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(output));
      }
    });
  });

await run([
  "exec",
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "public-patterns-pipeline",
  "--local",
  "--persist-to",
  stateDirectory,
]);

const server = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "dev",
    "--local",
    "--port",
    "0",
    "--inspector-port",
    "0",
    "--persist-to",
    stateDirectory,
    "--var",
    "ENABLE_DEV_FIXTURES:true",
  ],
  {
    cwd: pipelineDirectory,
    env: { ...process.env, CI: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverOutput = "";
let resolveOrigin;
let rejectOrigin;
const originReady = new Promise((resolve, reject) => {
  resolveOrigin = resolve;
  rejectOrigin = reject;
});
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
server.once("exit", (code) => {
  rejectOrigin(new Error(`Wrangler exited before startup with code ${code}`));
});

try {
  const origin = await Promise.race([
    originReady,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Wrangler startup timed out")), 15_000),
    ),
  ]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) {
        break;
      }
    } catch {
      // Wrangler is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const invalidDayResponse = await fetch(
    `${origin}/bursts?source=311&day=2026-99-99`,
  );
  if (invalidDayResponse.status !== 400) {
    throw new Error(`Invalid day returned ${invalidDayResponse.status}`);
  }

  const seedResponse = await fetch(
    `${origin}/dev/seed?day=2026-07-23`,
    { method: "POST" },
  );
  const seeded = await seedResponse.json();
  if (!seedResponse.ok || seeded.observations !== 73) {
    throw new Error(`Unexpected seed result: ${JSON.stringify(seeded)}`);
  }
  const replayResponse = await fetch(
    `${origin}/dev/seed?day=2026-07-23`,
    { method: "POST" },
  );
  if (!replayResponse.ok) {
    throw new Error(`Seed replay failed: ${await replayResponse.text()}`);
  }

  const burstResponse = await fetch(
    `${origin}/bursts?source=311&day=2026-07-23`,
  );
  const burstResult = await burstResponse.json();
  if (
    !burstResponse.ok ||
    burstResult.ready !== true ||
    burstResult.bursts?.[0]?.observed !== 20
  ) {
    throw new Error(
      `Unexpected burst result: ${JSON.stringify(burstResult)}`,
    );
  }

  const dispatchBurstResponse = await fetch(
    `${origin}/bursts?source=dispatch&day=2026-07-23`,
  );
  const dispatchBurstResult = await dispatchBurstResponse.json();
  if (
    !dispatchBurstResponse.ok ||
    dispatchBurstResult.bursts?.[0]?.observed !== 20
  ) {
    throw new Error(
      `Dispatch reconciliation failed: ${JSON.stringify(dispatchBurstResult)}`,
    );
  }

  const historyResponse = await fetch(
    `${origin}/observations?source=dispatch&id=fixture-call`,
  );
  const history = await historyResponse.json();
  if (
    !historyResponse.ok ||
    history.observations?.length !== 3 ||
    history.observations?.[0]?.source !== "dispatch-realtime" ||
    history.observations?.[0]?.data?.feed !== "realtime" ||
    !history.observations
      ?.slice(1)
      .every((observation) => observation.source === "dispatch-closed") ||
    !history.observations
      ?.slice(1)
      .some((observation) => observation.data?.corrected === true)
  ) {
    throw new Error(
      `Observation history was not preserved: ${JSON.stringify(history)}`,
    );
  }

  console.log("Pipeline Worker+D1 observation smoke test passed");
} catch (error) {
  throw new Error(`${error.message}\n${serverOutput}`);
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  await rm(stateDirectory, { recursive: true, force: true });
}
