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
      archiveKey: "private/success.json",
      publishedSlug: "the-answer",
      independentEvidence: ["https://example.com/answer"],
      absentEvidence: [{ source: "answer", rows: 0 }],
      datasets: [{ source: "test" }],
      targetEvidence: ["https://example.com/evidence"],
    }),
    {
      priorCoverage: [],
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

  const boilerCase = cases.find(
    (testCase) =>
      testCase.id === "western-addition-boiler-renewals-2026-08-03",
  );
  const boilerFixture = JSON.parse(
    await readFile(new URL(`../../${boilerCase.fixture}`, import.meta.url)),
  );
  assert.equal(boilerFixture.series[0].observed, 37);
  assert.equal(
    boilerFixture.series[0].parcels.reduce(
      (sum, parcel) => sum + parcel.complaints,
      0,
    ),
    37,
  );
  assert.equal(buildCaseInput(boilerFixture).evidenceUrls.length, 0);
});

test("boiler regression rewards the missing investigation instead of its conclusion", () => {
  const testCase = cases.find(
    (candidate) =>
      candidate.id === "western-addition-boiler-renewals-2026-08-03",
  );
  const priorBrief = {
    submission: { outcome: "watch" },
    brief:
      "The 37 complaints may reflect a routine enforcement sweep across three parcels. The supplied weekday baseline is too thin to establish novelty.",
  };
  const completeBrief = {
    submission: { outcome: "watch" },
    brief:
      "The 37 complaints were part of a semi-monthly citywide batch of 62. Permit IDs resolve in 5dp4-gtxk to renewals for permits that expired June 12. At 1675 Eddy, a recent complaint reports no hot water. That correlation does not prove the expired paperwork caused the outage.",
  };

  assert.notDeepEqual(evaluate(testCase, priorBrief), []);
  assert.deepEqual(evaluate(testCase, completeBrief), []);
});

test("traffic-stop regressions preserve the editorial threshold", () => {
  const bayview = cases.find(
    (candidate) => candidate.id === "bayview-traffic-stops-2026-08-08",
  );
  const haight = cases.find(
    (candidate) => candidate.id === "haight-traffic-stops-2026-08-06",
  );

  assert.deepEqual(
    evaluate(bayview, {
      submission: { outcome: "investigate" },
      brief:
        "All 50 stops were officer-initiated; 41 ended in citations. Fifteen clustered at Palou and Selby and nine at Oakdale and Rankin. The count exceeded each of the prior Saturdays, but no SFPD press release confirmed a named operation.",
    }),
    [],
  );
  assert.deepEqual(
    evaluate(haight, {
      submission: { outcome: "watch" },
      brief:
        "The 23 officer-initiated stops followed 19 the prior day. There was no external confirmation of an operation. The SFMTA report was released nearby in time, but the timing is only coincident and does not establish why the stops increased.",
    }),
    [],
  );
  assert.notDeepEqual(
    evaluate(haight, {
      submission: { outcome: "investigate" },
      brief:
        "The 23 stops followed 19 the prior day and were caused by the SFMTA report.",
    }),
    [],
  );
});

test("published article fixtures preserve provenance without passing answers", async () => {
  const publishedCases = cases.filter((testCase) => testCase.publishedSlug);
  assert.equal(publishedCases.length, 4);
  for (const testCase of publishedCases) {
    const fixture = JSON.parse(await readFile(
      new URL(`../../${testCase.fixture}`, import.meta.url), "utf8",
    ));
    assert.ok(fixture.archiveKey.startsWith("investigations/"));
    assert.ok(fixture.capturedAt);
    const input = buildCaseInput(fixture);
    assert.equal(input.sourceQueries.length, 1);
    assert.ok(!JSON.stringify(input).includes(testCase.publishedSlug));
    assert.equal(input.archiveKey, undefined);
  }
});


test("duplicate regression passes published coverage as context without labels", async () => {
  const testCase = cases.find(
    (candidate) => candidate.id === "bayview-already-covered-2026-08-08",
  );
  const fixture = JSON.parse(await readFile(
    new URL(`../../${testCase.fixture}`, import.meta.url), "utf8",
  ));
  const input = buildCaseInput(fixture);
  assert.equal(input.priorCoverage.length, 1);
  assert.deepEqual(input.priorCoverage, fixture.priorCoverage);
  assert.equal(input.id, undefined);
  assert.equal(input.allowedOutcomes, undefined);
  assert.equal(input.expect, undefined);
});


test("traffic origin check accepts caller wording without asserting residence", () => {
  const testCase = cases.find(
    (candidate) => candidate.id === "outside-lands-traffic-2026-08-07",
  );
  assert.deepEqual(evaluate(testCase, {
    submission: { outcome: "investigate" },
    brief: "The 42 Outside Lands records were caller-originated. SFMTA described complaint-based enforcement.",
  }), []);
});


test("duplicate control requires identifying the existing article", () => {
  const testCase = cases.find(
    (candidate) => candidate.id === "bayview-already-covered-2026-08-08",
  );
  const unrelatedHold = {
    submission: { outcome: "watch" },
    brief: "Palou and Selby had no duplicate CAD records. More research is needed.",
  };
  assert.notDeepEqual(evaluate(testCase, unrelatedHold), []);
  assert.deepEqual(evaluate(testCase, {
    submission: { outcome: "discard" },
    brief: "The Palou and Selby finding is already covered by bayview-s-busiest-monday-for-traffic-stops-centered-on-two-intersections-2026-08-17.",
  }), []);
});
