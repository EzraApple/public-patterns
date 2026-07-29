import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const pipelineDirectory = fileURLToPath(
  new URL("../apps/pipeline", import.meta.url),
);
const repository = fileURLToPath(new URL("..", import.meta.url));
const stateDirectory = await mkdtemp(
  path.join(tmpdir(), "public-patterns-pipeline-"),
);
const mockWorkerPath = path.join(stateDirectory, "investigator.mjs");
const mockConfigPath = path.join(stateDirectory, "wrangler.json");

await writeFile(
  mockWorkerPath,
  `export default {
    async fetch(request) {
      const input = await request.json();
      return Response.json({
        id: input.id,
        archiveKey: "investigations/fixture.json",
        submission: {
          outcome: "investigate",
          confidence: 0.8,
          evidence: [
            "nearby:" + input.case.nearbyObservations.length
          ]
        },
        brief: "# Fixture investigation",
        article: "# Fixture article"
      });
    }
  };`,
);
await writeFile(
  mockConfigPath,
  JSON.stringify({
    name: "public-patterns-investigator",
    main: mockWorkerPath,
    compatibility_date: "2026-07-28",
  }),
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
    "--config",
    path.join(pipelineDirectory, "wrangler.jsonc"),
    "--config",
    mockConfigPath,
    "--local",
    "--port",
    "0",
    "--inspector-port",
    "0",
    "--persist-to",
    stateDirectory,
    "--test-scheduled",
    "--var",
    "ENABLE_DEV_FIXTURES:true",
  ],
  {
    cwd: repository,
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

  const investigationResponse = await fetch(`${origin}/investigations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "311",
      day: "2026-07-23",
      kind: "Noise Report",
      area: "Mission",
    }),
  });
  const investigation = await investigationResponse.json();
  if (
    investigationResponse.status !== 201 ||
    investigation.submission?.outcome !== "investigate" ||
    investigation.submission?.evidence?.[0] !== "nearby:22" ||
    investigation.brief !== "# Fixture investigation"
  ) {
    throw new Error(
      `Investigation handoff failed: ${JSON.stringify(investigation)}`,
    );
  }

  const savedResponse = await fetch(
    `${origin}/investigations/${investigation.id}`,
  );
  const saved = await savedResponse.json();
  if (
    !savedResponse.ok ||
    saved.id !== investigation.id ||
    saved.brief !== investigation.brief
  ) {
    throw new Error(`Investigation was not saved: ${JSON.stringify(saved)}`);
  }

  const scheduledResponse = await fetch(
    `${origin}/__scheduled?cron=30+15+*+*+*&time=${Date.parse("2026-07-24T15:30:00Z")}`,
  );
  for (
    let attempt = 0;
    attempt < 20 &&
    !serverOutput.includes("Daily investigation completed") &&
    !serverOutput.includes("Daily investigation failed");
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (
    !scheduledResponse.ok ||
    !serverOutput.includes("Daily investigation completed") ||
    serverOutput.includes("Daily investigation failed")
  ) {
    throw new Error(
      `Daily investigation failed: ${await scheduledResponse.text()}`,
    );
  }

  console.log("Pipeline Worker+D1 investigation smoke test passed");
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
