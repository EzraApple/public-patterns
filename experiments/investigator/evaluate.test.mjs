import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCaseInput } from "./case-input.mjs";
import { evaluate, validateCases } from "./evaluate.mjs";

const cases = JSON.parse(
  await readFile(new URL("./cases.json", import.meta.url), "utf8"),
);

test("reports outcome, missing evidence, and unsupported claims", () => {
  const failures = evaluate(
    {
      allowedOutcomes: ["watch"],
      requires: ["explicit uncertainty"],
      requiresAny: [["fell", "declined"]],
      forbids: ["one response chain"],
    },
    {
      submission: { outcome: "discard" },
      brief: "These records form one response chain.",
    },
  );

  assert.deepEqual(failures, [
    "outcome discard is not one of watch",
    "missing required finding: explicit uncertainty",
    "missing required finding: one of fell, declined",
    "unsupported claim: one response chain",
  ]);
});

test("accepts alternate and nearby wording", () => {
  assert.deepEqual(
    evaluate(
      {
        allowedOutcomes: ["investigate"],
        requiresAny: [
          ["closure", "closed"],
          ["reinspection", "reinspected"],
        ],
      },
      {
        submission: { outcome: "investigate" },
        brief: "The restaurant closed and was reinspected three days later.",
      },
    ),
    [],
  );

  assert.deepEqual(
    evaluate(
      {
        allowedOutcomes: ["watch"],
        requires: ["311", "dispatch"],
        requiresNear: [
          {
            anchor: "311",
            alternatives: ["fell", "went down", "no signal"],
          },
          {
            anchor: "dispatch",
            alternatives: ["rose", "increased", "went up"],
          },
        ],
      },
      {
        submission: { outcome: "watch" },
        brief: "Dispatch rose while 311 calls went down.",
      },
    ),
    [],
  );
});

test("rejects malformed eval cases before paid work", () => {
  const valid = {
    id: "case",
    fixture: "fixture.json",
    allowedOutcomes: ["watch"],
  };

  assert.throws(
    () => validateCases([{ ...valid, requires: "finding" }]),
    /Invalid requires/,
  );
  assert.throws(
    () => validateCases([{ ...valid, requiresAny: [[]] }]),
    /Invalid requiresAny/,
  );
  assert.throws(
    () =>
      validateCases([
        { ...valid, requiresNear: [{ anchor: "311" }] },
      ]),
    /Invalid requiresNear/,
  );
  assert.throws(
    () =>
      validateCases([
        {
          ...valid,
          requiresNear: [
            { anchor: "311", alternatives: ["fell"], window: 5 },
          ],
        },
      ]),
    /Invalid requiresNear/,
  );
  assert.throws(
    () => validateCases([{ ...valid, requires: [" "] }]),
    /Invalid requires/,
  );
  assert.throws(
    () => validateCases([valid, { ...valid }]),
    /Duplicate eval case id/,
  );
  assert.throws(
    () => validateCases([{ ...valid, required: ["finding"] }]),
    /Unknown eval case field/,
  );
});

test("passes only evidence fields into the sandbox case", () => {
  assert.deepEqual(
    buildCaseInput({
      id: "answer-bearing-id",
      note: "expected interpretation",
      role: "positive",
      expect: { classification: "positive" },
      evalRole: "positive",
      capturedAt: "2026-07-27",
      independentEvidence: ["https://example.com/answer"],
      absentEvidence: [{ source: "answer", rows: 0 }],
      datasets: [{ source: "test" }],
      targetEvidence: ["https://example.com/evidence"],
    }),
    {
      datasets: [{ source: "test" }],
      series: [],
      targetWindows: [],
      controlWindows: [],
      sourceQueries: [],
      evidenceUrls: ["https://example.com/evidence"],
      limitations: [],
    },
  );
});

test("eval cases reference valid fixtures and outcomes", async () => {
  validateCases(cases);

  for (const testCase of cases) {
    JSON.parse(
      await readFile(
        new URL(`../../${testCase.fixture}`, import.meta.url),
        "utf8",
      ),
    );
  }

  const evictionCase = cases.find(
    (testCase) => testCase.id === "eviction-notices-h1-2025",
  );
  const fixture = JSON.parse(
    await readFile(new URL(`../../${evictionCase.fixture}`, import.meta.url)),
  );
  assert.equal(
    fixture.series[0].targets.reduce((sum, value) => sum + value, 0),
    812,
  );
  assert.equal(
    fixture.series[0].controls.reduce((sum, value) => sum + value, 0),
    385,
  );
});
