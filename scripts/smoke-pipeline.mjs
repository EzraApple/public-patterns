import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
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
const investigatorAttempts = new Map();
const investigationCases = new Map();
let pipelineOrigin;
const attemptServer = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const attempt = (investigatorAttempts.get(input.id) ?? 0) + 1;
    investigatorAttempts.set(input.id, attempt);
    const caseJson = JSON.stringify(input.case);
    const firstCase = investigationCases.get(input.id);
    investigationCases.set(input.id, firstCase ?? caseJson);
    if (
      input.case.signal.kind === "Initial Call" &&
      attempt === 1 &&
      pipelineOrigin
    ) {
      const mutation = await fetch(
        `${pipelineOrigin}/dev/seed?day=2026-07-22`,
        { method: "POST" },
      );
      if (!mutation.ok) {
        throw new Error("failed to mutate fixture data between retries");
      }
    }
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        attempt,
        sameCase: firstCase === undefined || firstCase === caseJson,
      }),
    );
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : String(error));
  }
});
await new Promise((resolve) => attemptServer.listen(0, "127.0.0.1", resolve));
const attemptAddress = attemptServer.address();
if (!attemptAddress || typeof attemptAddress === "string") {
  throw new Error("attempt server did not bind a TCP port");
}
const attemptUrl = `http://127.0.0.1:${attemptAddress.port}`;

await writeFile(
  mockWorkerPath,
  `export default {
    async fetch(request, env) {
      const input = await request.json();
      const attemptResponse = await fetch(env.ATTEMPT_URL, {
        method: "POST",
        body: JSON.stringify(input)
      });
      const attempt = await attemptResponse.json();
      if (!attempt.sameCase) {
        return Response.json({
          error: "investigation case changed between retries",
          retryable: false
        }, { status: 409 });
      }
      if (input.case.signal.kind === "Initial Call" && attempt.attempt === 1) {
        return Response.json({
          error: "fixture provider outage",
          retryable: true,
          provider: {
            provider: "Fixture",
            operation: "agent investigation",
            kind: "provider",
            retryable: true,
            action: "retry",
            detail: "private fixture detail"
          }
        }, { status: 503 });
      }
      if (input.case.signal.kind === "Corrected Final Call") {
        return Response.json({
          error: "fixture authentication failure",
          retryable: false,
          provider: {
            provider: "Fixture",
            operation: "agent investigation",
            kind: "authentication",
            retryable: false,
            action: "rotate credentials",
            detail: "private terminal output",
            unexpected: "must not escape"
          }
        }, { status: 401 });
      }
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
        article: {
          title: "Fixture article",
          dek: "A fixture article summary.",
          category: "Public safety",
          significance: 65,
          body: "Fixture article body.",
          sources: [
            {
              label: "Fixture record",
              href: "https://example.com/fixture"
            }
          ],
          figure: null,
          hero: {
            src: "/media/articles/" + input.id + ".webp",
            alt: "A foggy San Francisco street.",
            caption: "AI-generated contextual illustration."
          }
        },
        review: "# Fixture review"
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
    vars: { ATTEMPT_URL: attemptUrl },
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

async function startInvestigationJob(
  origin,
  path,
  input,
  idempotencyKey = crypto.randomUUID(),
) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const started = await response.json();
  if (response.status !== 202 || !started.id) {
    throw new Error(
      `Investigation job did not start: ${JSON.stringify(started)}`,
    );
  }
  return started;
}

async function waitForInvestigationJob(origin, id) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const statusResponse = await fetch(
      `${origin}/investigation-jobs/${id}`,
    );
    const job = await statusResponse.json();
    if (!statusResponse.ok) {
      throw new Error(
        `Investigation job lookup failed: ${JSON.stringify(job)}`,
      );
    }
    if (job.status === "complete" || job.status === "failed") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Investigation job ${id} did not finish`);
}

async function runInvestigationJob(origin, path, input) {
  const started = await startInvestigationJob(origin, path, input);
  const job = await waitForInvestigationJob(origin, started.id);
  return getInvestigationResult(origin, job);
}

async function getInvestigationResult(origin, job) {
  if (job.status === "failed") {
    throw new Error(`Investigation Workflow failed: ${JSON.stringify(job)}`);
  }
  const resultResponse = await fetch(
    `${origin}/investigations/${job.investigationId}`,
  );
  const result = await resultResponse.json();
  if (!resultResponse.ok) {
    throw new Error(
      `Investigation result was not saved: ${JSON.stringify(result)}`,
    );
  }
  return result;
}

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
await run([
  "exec",
  "wrangler",
  "d1",
  "execute",
  "public-patterns-pipeline",
  "--local",
  "--persist-to",
  stateDirectory,
  "--command",
  "INSERT INTO daily_investigation_runs " +
    "(day, attempt_id, started_at, status) VALUES " +
    "('2026-05-31', 'abandoned-attempt', " +
    "'2026-05-31T00:00:00.000Z', 'running'); " +
    "INSERT INTO daily_investigation_runs " +
    "(day, started_at, status, failure_stage, retryable) VALUES " +
    "('2026-05-30', '2026-05-30T00:00:00.000Z', 'failed', " +
    "'investigation', 0), " +
    "('2026-05-29', '2026-05-29T00:00:00.000Z', 'failed', " +
    "'investigation', 1)",
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
  pipelineOrigin = origin;
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

  const missingJobResponse = await fetch(
    `${origin}/investigation-jobs/missing-job`,
  );
  const oversizedJobResponse = await fetch(
    `${origin}/investigation-jobs/${"a".repeat(101)}`,
  );
  const invalidJobResponse = await fetch(
    `${origin}/investigation-jobs/invalid%3Aid`,
  );
  if (
    missingJobResponse.status !== 404 ||
    oversizedJobResponse.status !== 404 ||
    invalidJobResponse.status !== 404
  ) {
    throw new Error("Invalid Workflow IDs did not return 404");
  }
  const replayBody = JSON.stringify({
    source: "311",
    day: "2026-07-23",
    kind: "Noise Report",
    area: "Mission",
  });
  const missingKeyResponse = await fetch(`${origin}/investigations/replay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: replayBody,
  });
  const oversizedKeyResponse = await fetch(`${origin}/investigations/replay`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "a".repeat(201),
    },
    body: replayBody,
  });
  if (missingKeyResponse.status !== 400 || oversizedKeyResponse.status !== 400) {
    throw new Error("Invalid idempotency keys did not return 400");
  }

  const staleRunResponse = await fetch(`${origin}/daily-runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ day: "2026-05-31" }),
  });
  const staleRun = await staleRunResponse.json();
  if (staleRunResponse.status !== 201 || staleRun.status !== "not_ready") {
    throw new Error(`Stale daily run was not reclaimed: ${JSON.stringify(staleRun)}`);
  }
  const blockedRunResponse = await fetch(`${origin}/daily-runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ day: "2026-05-30" }),
  });
  if (blockedRunResponse.status !== 409) {
    throw new Error("A nonretryable daily failure was reclaimed");
  }
  const retryableRunResponse = await fetch(`${origin}/daily-runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ day: "2026-05-29" }),
  });
  if (retryableRunResponse.status !== 201) {
    throw new Error("A retryable daily failure was not reclaimed");
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
  if (!seedResponse.ok || seeded.observations !== 113) {
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

  const investigationInput = {
    source: "311",
    day: "2026-07-23",
    kind: "Noise Report",
    area: "Mission",
  };
  const idempotencyKey = crypto.randomUUID();
  const firstStart = await startInvestigationJob(
    origin,
    "/investigations",
    investigationInput,
    idempotencyKey,
  );
  const repeatedStart = await startInvestigationJob(
    origin,
    "/investigations",
    investigationInput,
    idempotencyKey,
  );
  if (repeatedStart.id !== firstStart.id) {
    throw new Error("An idempotent retry created a second Workflow");
  }
  const conflictingStartResponse = await fetch(`${origin}/investigations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      ...investigationInput,
      kind: "Different request",
    }),
  });
  if (conflictingStartResponse.status !== 409) {
    throw new Error("An idempotency key accepted a different request");
  }
  const investigation = await getInvestigationResult(
    origin,
    await waitForInvestigationJob(origin, firstStart.id),
  );
  if (
    investigation.submission?.outcome !== "investigate" ||
    investigation.submission?.evidence?.[0] !== "nearby:62" ||
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

  const replay = await runInvestigationJob(
    origin,
    "/investigations/replay",
    {
        source: "311",
        day: "2026-07-23",
        kind: "Noise Report",
        area: "Mission",
    },
  );
  if (
    replay.submission?.outcome !== "investigate" ||
    replay.submission?.evidence?.[0] !== "nearby:62"
  ) {
    throw new Error(`Observation replay failed: ${JSON.stringify(replay)}`);
  }

  const nonRetryStart = await startInvestigationJob(
    origin,
    "/investigations/replay",
    {
      source: "dispatch-closed",
      day: "2026-07-23",
      kind: "Corrected Final Call",
      area: "Mission",
    },
  );
  const nonRetryJob = await waitForInvestigationJob(origin, nonRetryStart.id);
  if (
    nonRetryJob.status !== "failed" ||
    nonRetryJob.retryable !== false ||
    nonRetryJob.provider?.kind !== "authentication" ||
    "detail" in (nonRetryJob.provider ?? {}) ||
    "action" in (nonRetryJob.provider ?? {}) ||
    "unexpected" in (nonRetryJob.provider ?? {}) ||
    investigatorAttempts.get(nonRetryStart.id) !== 1
  ) {
    throw new Error(
      `Nonretryable failure was not contained: ${JSON.stringify(nonRetryJob)}`,
    );
  }

  const retryStart = await startInvestigationJob(
    origin,
    "/investigations/replay",
    {
      source: "dispatch-realtime",
      day: "2026-07-23",
      kind: "Initial Call",
      area: "Mission",
    },
  );
  const retryJob = await waitForInvestigationJob(origin, retryStart.id);
  await getInvestigationResult(origin, retryJob);
  if (investigatorAttempts.get(retryStart.id) !== 2) {
    throw new Error("A retryable provider failure did not run twice");
  }

  const investigationListResponse = await fetch(`${origin}/investigations`);
  const investigationList = await investigationListResponse.json();
  const listedInvestigation = investigationList.investigations?.find(
    ({ id }) => id === investigation.id,
  );
  if (
    !investigationListResponse.ok ||
    listedInvestigation?.articleTitle !== "Fixture article" ||
    listedInvestigation?.publishedSlug !== null ||
    "brief" in listedInvestigation
  ) {
    throw new Error(
      `Investigation list failed: ${JSON.stringify(investigationList)}`,
    );
  }

  const publicationResponse = await fetch(
    `${origin}/investigations/${investigation.id}/publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "fixture-article",
        hero: null,
      }),
    },
  );
  const published = await publicationResponse.json();
  if (
    publicationResponse.status !== 201 ||
    published.slug !== "fixture-article" ||
    published.investigationId !== investigation.id ||
    published.body !== "Fixture article body." ||
    published.hero?.src !== `/media/articles/${investigation.id}.webp`
  ) {
    throw new Error(`Article publication failed: ${JSON.stringify(published)}`);
  }

  const articleListResponse = await fetch(`${origin}/articles`);
  const articleList = await articleListResponse.json();
  if (
    !articleListResponse.ok ||
    articleList.articles?.length !== 1 ||
    articleList.articles[0]?.slug !== "fixture-article" ||
    !articleList.articles[0]?.hero ||
    "body" in articleList.articles[0]
  ) {
    throw new Error(`Article list failed: ${JSON.stringify(articleList)}`);
  }

  const articleResponse = await fetch(`${origin}/articles/fixture-article`);
  const article = await articleResponse.json();
  if (
    !articleResponse.ok ||
    article.body !== "Fixture article body." ||
    !article.hero
  ) {
    throw new Error(`Article read failed: ${JSON.stringify(article)}`);
  }

  const replayPublicationResponse = await fetch(
    `${origin}/investigations/${investigation.id}/publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "fixture-article",
        hero: null,
      }),
    },
  );
  if (!replayPublicationResponse.ok) {
    throw new Error(
      `Idempotent publication failed: ${await replayPublicationResponse.text()}`,
    );
  }

  const changedPublicationResponse = await fetch(
    `${origin}/investigations/${investigation.id}/publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "different-article",
        hero: null,
      }),
    },
  );
  if (changedPublicationResponse.status !== 409) {
    throw new Error(
      `Changed publication returned ${changedPublicationResponse.status}`,
    );
  }

  const secondInvestigation = await runInvestigationJob(
    origin,
    "/investigations",
    {
      source: "311",
      day: "2026-07-23",
      kind: "Noise Report",
      area: "Mission",
    },
  );
  const revisionResponse = await fetch(
    `${origin}/investigations/${secondInvestigation.id}/publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "fixture-article",
        hero: null,
      }),
    },
  );
  const revision = await revisionResponse.json();
  if (
    revisionResponse.status !== 201 ||
    revision.revision !== 2 ||
    revision.investigationId !== secondInvestigation.id
  ) {
    throw new Error(
      `Article revision failed: ${JSON.stringify(revision)}`,
    );
  }

  const publishedListResponse = await fetch(`${origin}/investigations`);
  const publishedList = await publishedListResponse.json();
  if (
    !publishedListResponse.ok ||
    publishedList.investigations?.find(
      (candidate) => candidate.id === investigation.id,
    )?.publishedSlug !== "fixture-article"
  ) {
    throw new Error(
      `Published investigation was not linked: ${JSON.stringify(publishedList)}`,
    );
  }

  const deletionResponse = await fetch(
    `${origin}/articles/fixture-article`,
    { method: "DELETE" },
  );
  const deletedArticleResponse = await fetch(
    `${origin}/articles/fixture-article`,
  );
  const preservedInvestigationResponse = await fetch(
    `${origin}/investigations/${investigation.id}`,
  );
  if (
    deletionResponse.status !== 204 ||
    deletedArticleResponse.status !== 404 ||
    !preservedInvestigationResponse.ok
  ) {
    throw new Error("Article deletion did not preserve its investigation");
  }

  const manualRunResponse = await fetch(`${origin}/daily-runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ day: "2026-06-01" }),
  });
  const manualRun = await manualRunResponse.json();
  if (
    manualRunResponse.status !== 201 ||
    manualRun.status !== "not_ready" ||
    manualRun.day !== "2026-06-01"
  ) {
    throw new Error(`Manual daily run failed: ${JSON.stringify(manualRun)}`);
  }

  const duplicateRunResponse = await fetch(`${origin}/daily-runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ day: "2026-06-01" }),
  });
  if (duplicateRunResponse.status !== 201) {
    throw new Error(
      `Duplicate daily run returned ${duplicateRunResponse.status}`,
    );
  }

  const scheduledDate = new Date();
  scheduledDate.setUTCDate(scheduledDate.getUTCDate() - 1);
  const scheduledDay = scheduledDate.toISOString().slice(0, 10);
  const scheduledSeedResponse = await fetch(
    `${origin}/dev/seed?day=${scheduledDay}`,
    { method: "POST" },
  );
  if (!scheduledSeedResponse.ok) {
    throw new Error(
      `Scheduled fixture seed failed: ${await scheduledSeedResponse.text()}`,
    );
  }

  const fireBurstsResponse = await fetch(
    `${origin}/bursts?source=fire-ems&day=${scheduledDay}`,
  );
  const fireBursts = await fireBurstsResponse.json();
  if (
    !fireBurstsResponse.ok ||
    fireBursts.bursts?.[0]?.observed !== 20 ||
    fireBursts.bursts[0]?.observationIds?.length !== 40
  ) {
    throw new Error(`Fire call grouping failed: ${JSON.stringify(fireBursts)}`);
  }

  const scheduledResponse = await fetch(
    `${origin}/__scheduled?cron=30+22+*+*+*`,
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
    serverOutput.includes("Daily investigation failed") ||
    serverOutput.includes("Daily publication failed")
  ) {
    throw new Error(
      `Daily investigation failed: ${await scheduledResponse.text()}`,
    );
  }

  const scheduledArticlesResponse = await fetch(`${origin}/articles`);
  const scheduledArticles = await scheduledArticlesResponse.json();
  if (
    !scheduledArticlesResponse.ok ||
    scheduledArticles.articles?.length !== 1 ||
    !scheduledArticles.articles[0]?.slug.endsWith(`-${scheduledDay}`) ||
    scheduledArticles.articles[0]?.significance !== 65
  ) {
    throw new Error(
      `Daily article was not published: ${JSON.stringify(scheduledArticles)}`,
    );
  }

  const dailyRunsResponse = await fetch(`${origin}/daily-runs`);
  const dailyRuns = await dailyRunsResponse.json();
  if (
    !dailyRunsResponse.ok ||
    dailyRuns.runs?.length !== 5 ||
    dailyRuns.attempts?.length !== 6 ||
    !dailyRuns.attempts.some(
      (attempt) =>
        attempt.attemptId === "abandoned-attempt" &&
        attempt.status === "failed" &&
        attempt.error === "daily run lease expired",
    ) ||
    dailyRuns.runs[0]?.day !== scheduledDay ||
    dailyRuns.runs[0]?.status !== "published" ||
    !dailyRuns.runs[0]?.investigationId ||
    !dailyRuns.runs[0]?.publishedSlug?.endsWith(`-${scheduledDay}`) ||
    dailyRuns.runs[0]?.detector?.detector?.version !== 2 ||
    !dailyRuns.runs[0]?.detector?.sources?.some(({ candidates }) =>
      candidates.some(({ observed }) => observed === 20),
    )
  ) {
    throw new Error(`Daily run was not recorded: ${JSON.stringify(dailyRuns)}`);
  }

  const backfillResponse = await fetch(`${origin}/backfill/311`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ since: "2025-01-01T00:00:00.000" }),
  });
  const backfill = await backfillResponse.json();
  const repeatedBackfillResponse = await fetch(`${origin}/backfill/311`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ since: "2025-01-01T00:00:00.000" }),
  });
  const repeatedBackfill = await repeatedBackfillResponse.json();
  if (
    backfillResponse.status !== 202 ||
    backfill.status !== "started" ||
    !backfill.cursor?.collectingSince?.startsWith("2024-12-30") ||
    !repeatedBackfillResponse.ok ||
    repeatedBackfill.status !== "already_covered"
  ) {
    throw new Error(
      `DataSF backfill failed: ${JSON.stringify({ backfill, repeatedBackfill })}`,
    );
  }

  console.log("Pipeline Worker+D1 investigation smoke test passed");
} catch (error) {
  throw new Error(`${error.message}\n${serverOutput}`);
} finally {
  server.kill("SIGTERM");
  attemptServer.close();
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  await rm(stateDirectory, { recursive: true, force: true });
}
