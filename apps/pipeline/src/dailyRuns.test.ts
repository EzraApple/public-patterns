/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDailyInvestigation } from "./dailyRuns.ts";
import { seedDevFixtures } from "./devFixtures.ts";
import { saveBatch } from "./observationStore.ts";

// Real SQLite queries and migrations; only the external investigator is faked.
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));
function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
  }
  function prepare(sql: string) {
    let values: SQLInputValue[] = [];
    return {
      bind(...parameters: SQLInputValue[]) { values = parameters; return this; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return { meta: sqlite.prepare(sql).run(...values) }; },
    };
  }
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { db, sqlite };
}

const day = "2026-09-16";
const startedAt = "2026-09-17T22:30:00.000Z";
const followUp = {
  question: "Did the next inspection resolve the recorded condition?",
  evidenceUrls: ["https://example.com/inspection/1"],
  afterDays: 1,
};
function investigator(outcome: "watch" | "discard" | "investigate" = "watch") {
  return {
    fetch: vi.fn(async (request: Request) => {
      const input = await request.clone().json() as { id: string };
      return Response.json({
        id: input.id, archiveKey: `investigations/${input.id}.json`,
        submission: { outcome, confidence: 0.7, evidence: [], ...(outcome === "watch" ? { followUp } : {}) },
        brief: "The condition is recorded; a later inspection could resolve it.",
        article: outcome === "investigate" ? {
          title: "A supported follow-up", dek: "The later inspection answers the question.",
          category: "Housing", body: "The condition was resolved at the later inspection.",
          sources: [{ label: "Inspection", href: followUp.evidenceUrls[0] }], hero: null,
        } : null,
        review: outcome === "investigate" ? "The inspection supports the claim." : null,
      });
    }),
  };
}
async function seed(db: D1Database) {
  await seedDevFixtures({ db, day, observedAt: startedAt });
  await saveBatch({
    db, ingestion: "building-complaints", observedAt: startedAt,
    cursor: { collectingSince: "2026-01-01T00:00:00", through: startedAt.slice(0, -1) },
    observations: Array.from({ length: 25 }, (_, index) => ({
      source: "building-complaints" as const, id: `complaint-${index}`,
      occurredAt: `${day}T12:00:00`, updatedAt: `${day}T12:00:00`,
      observedAt: startedAt, kind: "Complaint", area: "Mission", data: {},
    })),
  });
}

describe("daily editorial progression", () => {
  it("tries another source after watch, preserves both attempts, and caps the day", async () => {
    const { db, sqlite } = createDatabase();
    await seed(db);
    const agent = investigator();
    const run = () => runDailyInvestigation({ db, investigator: agent as unknown as Fetcher, day, startedAt });
    const first = await run();
    const second = await run();
    expect(first).toMatchObject({ status: "watch", selected: { source: "building-complaints" } });
    expect(second).toMatchObject({ status: "watch", selected: { source: "dispatch" } });
    expect(await run()).toBeNull();
    expect(agent.fetch).toHaveBeenCalledTimes(2);
    expect(sqlite.prepare("SELECT count(DISTINCT investigation_id) AS count FROM daily_investigation_attempts WHERE status = 'watch'").get()).toEqual({ count: 2 });
  });

  it("rotates toward a less-investigated source before a larger burst", async () => {
    const { db, sqlite } = createDatabase();
    await seed(db);
    sqlite.prepare("INSERT INTO investigations VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      "recent-building", "2026-09-17T00:00:00.000Z", "building-complaints", "2026-09-15", "Other", "Mission", "{}", "{}",
    );
    const run = await runDailyInvestigation({ db, investigator: investigator("discard") as unknown as Fetcher, day, startedAt });
    expect(run).toMatchObject({ status: "discard", selected: { source: "dispatch" } });
  });

  it("revisits a due question once and publishes without a hero under the original case date", async () => {
    const { db } = createDatabase();
    await seed(db);
    const first = await runDailyInvestigation({ db, investigator: investigator() as unknown as Fetcher, day, startedAt });
    const agent = investigator("investigate");
    const options = { db, investigator: agent as unknown as Fetcher, day: "2026-09-17", startedAt: "2026-09-18T22:30:00.000Z" };
    const next = await runDailyInvestigation(options);
    expect(next).toMatchObject({ status: "published", selected: { day }, publishedSlug: `a-supported-follow-up-${day}` });
    const request = agent.fetch.mock.calls[0]![0];
    const input = await request.json() as { case: Record<string, unknown> };
    expect(input.case.followUp).toMatchObject({ investigationId: first?.investigationId, attempt: 1, question: followUp.question });
    expect(input.case.scheduling).toMatchObject({ day: options.day });
    expect(await runDailyInvestigation(options)).toBeNull();
    expect(agent.fetch).toHaveBeenCalledTimes(1);
  });

  it("stops an unresolved watch chain after two follow-ups", async () => {
    const { db, sqlite } = createDatabase();
    await seed(db);
    const agent = investigator();
    for (let offset = 0; offset < 4; offset++) {
      await runDailyInvestigation({
        db, investigator: agent as unknown as Fetcher,
        day: `2026-09-${16 + offset}`, startedAt: `2026-09-${17 + offset}T22:30:00.000Z`,
      });
    }
    expect(agent.fetch).toHaveBeenCalledTimes(3);
    expect(sqlite.prepare("SELECT max(json_extract(case_json, '$.followUp.attempt')) AS attempt FROM investigations").get()).toEqual({ attempt: 2 });
  });

  it("lets a fresh lead proceed after an unavailable follow-up and bounds later retries", async () => {
    const { db, sqlite } = createDatabase();
    await seed(db);
    await runDailyInvestigation({ db, investigator: investigator() as unknown as Fetcher, day, startedAt });
    sqlite.exec("UPDATE observations SET kind = 'Corrected' WHERE source = 'building-complaints'");
    const nextDay = "2026-09-17";
    const nextStart = "2026-09-18T22:30:00.000Z";
    await seedDevFixtures({ db, day: nextDay, observedAt: nextStart });
    const agent = investigator("investigate");
    const options = { db, investigator: agent as unknown as Fetcher, day: nextDay, startedAt: nextStart };
    const failed = await runDailyInvestigation(options);
    expect(failed).toMatchObject({ status: "failed", detector: { followUp: { attempt: 1 } } });
    const fresh = await runDailyInvestigation(options);
    expect(fresh?.status).toBe("published");
    expect(fresh?.detector?.followUp).toBeUndefined();
    expect(agent.fetch).toHaveBeenCalledTimes(1);
    const secondFailure = await runDailyInvestigation({ ...options, day: "2026-09-18", startedAt: "2026-09-19T22:30:00.000Z" });
    expect(secondFailure).toMatchObject({ status: "failed", detector: { followUp: { attempt: 2 } } });
    const exhausted = await runDailyInvestigation({ ...options, day: "2026-09-19", startedAt: "2026-09-20T22:30:00.000Z" });
    expect(exhausted?.detector?.followUp).toBeUndefined();
  });

  it("retires a follow-up after a terminal provider failure", async () => {
    const { db } = createDatabase();
    await seed(db);
    await runDailyInvestigation({ db, investigator: investigator() as unknown as Fetcher, day, startedAt });
    const failedAgent = { fetch: vi.fn(async () => Response.json({ error: "terminal failure", retryable: false }, { status: 401 })) };
    const failed = await runDailyInvestigation({
      db, investigator: failedAgent as unknown as Fetcher,
      day: "2026-09-17", startedAt: "2026-09-18T22:30:00.000Z",
    });
    expect(failed).toMatchObject({ status: "failed", retryable: false, detector: { followUp: { attempt: 1 } } });
    const next = await runDailyInvestigation({
      db, investigator: failedAgent as unknown as Fetcher,
      day: "2026-09-18", startedAt: "2026-09-19T22:30:00.000Z",
    });
    expect(next?.detector?.followUp).toBeUndefined();
    expect(failedAgent.fetch).toHaveBeenCalledTimes(1);
  });

  it("counts a recovered follow-up against the daily allowance when another parent is due", async () => {
    const { db } = createDatabase();
    await seed(db);
    const options = { db, investigator: investigator() as unknown as Fetcher, day, startedAt };
    await runDailyInvestigation(options);
    await runDailyInvestigation(options);
    const agent = investigator();
    const tomorrow = { db, investigator: agent as unknown as Fetcher, day: "2026-09-17", startedAt: "2026-09-18T22:30:00.000Z" };
    const batch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockRejectedValueOnce(new Error("lost follow-up ledger write"));
    await expect(runDailyInvestigation(tomorrow)).rejects.toThrow("lost follow-up ledger write");
    vi.mocked(db.batch).mockImplementation(batch);
    const recovered = await runDailyInvestigation({ ...tomorrow, startedAt: "2026-09-18T23:01:00.000Z" });
    expect(recovered?.status).toBe("watch");
    const later = await runDailyInvestigation({ ...tomorrow, startedAt: "2026-09-18T23:02:00.000Z" });
    expect(later?.detector?.followUp).toBeUndefined();
    expect(agent.fetch).toHaveBeenCalledTimes(1);
  });

  it("recovers a saved watch after losing the final ledger write without repeating the agent", async () => {
    const { db } = createDatabase();
    await seed(db);
    const agent = investigator();
    const batch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockRejectedValueOnce(new Error("lost final write"));
    await expect(runDailyInvestigation({ db, investigator: agent as unknown as Fetcher, day, startedAt })).rejects.toThrow("lost final write");
    vi.mocked(db.batch).mockImplementation(batch);
    const retry = await runDailyInvestigation({ db, investigator: agent as unknown as Fetcher, day, startedAt: "2026-09-17T23:01:00.000Z" });
    expect(retry?.status).toBe("watch");
    expect(agent.fetch).toHaveBeenCalledTimes(1);
  });
});
