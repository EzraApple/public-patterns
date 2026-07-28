import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const outcomes = new Set(["investigate", "watch", "discard"]);
const caseFields = new Set([
  "id",
  "fixture",
  "allowedOutcomes",
  "requires",
  "requiresAny",
  "requiresNear",
  "forbids",
]);

const isStringList = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === "string" && item.trim().length > 0);

export function validateCases(value) {
  if (!Array.isArray(value)) {
    throw new Error("Investigator cases must be an array");
  }

  const ids = new Set();
  for (const testCase of value) {
    if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) {
      throw new Error("Each investigator case must be an object");
    }
    const unknownField = Object.keys(testCase).find(
      (field) => !caseFields.has(field),
    );
    if (unknownField) {
      throw new Error(`Unknown eval case field: ${unknownField}`);
    }
    if (
      typeof testCase.id !== "string" ||
      !testCase.id.trim() ||
      typeof testCase.fixture !== "string" ||
      !testCase.fixture.trim() ||
      !isStringList(testCase.allowedOutcomes) ||
      !testCase.allowedOutcomes.every((outcome) => outcomes.has(outcome))
    ) {
      throw new Error(`Invalid eval case identity or outcomes: ${testCase.id}`);
    }
    if (ids.has(testCase.id)) {
      throw new Error(`Duplicate eval case id: ${testCase.id}`);
    }
    ids.add(testCase.id);
    for (const field of ["requires", "forbids"]) {
      if (testCase[field] !== undefined && !isStringList(testCase[field])) {
        throw new Error(`Invalid ${field} for eval case ${testCase.id}`);
      }
    }
    if (
      testCase.requiresAny !== undefined &&
      (!Array.isArray(testCase.requiresAny) ||
        testCase.requiresAny.length === 0 ||
        !testCase.requiresAny.every(isStringList))
    ) {
      throw new Error(`Invalid requiresAny for eval case ${testCase.id}`);
    }
    if (
      testCase.requiresNear !== undefined &&
      (!Array.isArray(testCase.requiresNear) ||
        testCase.requiresNear.length === 0 ||
        !testCase.requiresNear.every(
          (requirement) =>
            requirement &&
            typeof requirement === "object" &&
            typeof requirement.anchor === "string" &&
            requirement.anchor.length > 0 &&
            isStringList(requirement.alternatives) &&
            Object.keys(requirement).every((field) =>
              ["anchor", "alternatives"].includes(field),
            ),
        ))
    ) {
      throw new Error(`Invalid requiresNear for eval case ${testCase.id}`);
    }
  }

  return value;
}

const cases = validateCases(
  JSON.parse(await readFile(new URL("./cases.json", import.meta.url), "utf8")),
);

const includesNearby = (brief, anchor, alternatives) => {
  let anchorIndex = brief.indexOf(anchor);
  while (anchorIndex !== -1) {
    const nearby = brief.slice(
      Math.max(0, anchorIndex - 80),
      anchorIndex + anchor.length + 80,
    );
    if (alternatives.some((alternative) => nearby.includes(alternative))) {
      return true;
    }
    anchorIndex = brief.indexOf(anchor, anchorIndex + anchor.length);
  }
  return false;
};

export function evaluate(testCase, result) {
  const failures = [];
  const brief = result.brief.toLowerCase();
  const outcome = result.submission.outcome;

  if (
    testCase.allowedOutcomes &&
    !testCase.allowedOutcomes.includes(outcome)
  ) {
    failures.push(
      `outcome ${outcome} is not one of ${testCase.allowedOutcomes.join(", ")}`,
    );
  }
  for (const required of testCase.requires ?? []) {
    if (!brief.includes(required.toLowerCase())) {
      failures.push(`missing required finding: ${required}`);
    }
  }
  for (const alternatives of testCase.requiresAny ?? []) {
    if (
      !alternatives.some((alternative) =>
        brief.includes(alternative.toLowerCase()),
      )
    ) {
      failures.push(
        `missing required finding: one of ${alternatives.join(", ")}`,
      );
    }
  }
  for (const requirement of testCase.requiresNear ?? []) {
    if (
      !includesNearby(
        brief,
        requirement.anchor.toLowerCase(),
        requirement.alternatives.map((alternative) =>
          alternative.toLowerCase(),
        ),
      )
    ) {
      failures.push(
        `missing ${requirement.anchor} near one of ${requirement.alternatives.join(", ")}`,
      );
    }
  }
  for (const forbidden of testCase.forbids ?? []) {
    if (brief.includes(forbidden.toLowerCase())) {
      failures.push(`unsupported claim: ${forbidden}`);
    }
  }

  return failures;
}

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repository,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with code ${code}`)),
    );
  });

async function main() {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  if (args.includes("--list")) {
    console.log(cases.map((testCase) => testCase.id).join("\n"));
    return;
  }

  const runIndex = args.indexOf("--run");
  const selectedId = runIndex === -1 ? undefined : args[runIndex + 1];
  if (!selectedId) {
    throw new Error(
      "Choose a case with --run <id>. Use --list to see the paid eval cases.",
    );
  }
  const selected = cases.find((testCase) => testCase.id === selectedId);
  if (!selected) {
    throw new Error(
      "Choose a case with --run <id>. Use --list to see the paid eval cases.",
    );
  }

  const directory = await mkdtemp(
    path.join(os.tmpdir(), "public-patterns-eval-"),
  );
  const resultPath = path.join(directory, "result.json");

  try {
    await run("node", [
      "scripts/smoke-investigator.mjs",
      selected.fixture,
      "--result",
      resultPath,
    ]);
    const result = JSON.parse(await readFile(resultPath, "utf8"));
    const failures = evaluate(selected, result);

    if (failures.length > 0) {
      console.error(`\nFAIL ${selected.id}`);
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exitCode = 1;
    } else {
      console.log(`\nPASS ${selected.id}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
