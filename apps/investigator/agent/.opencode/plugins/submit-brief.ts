import { stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { Plugin } from "@opencode-ai/plugin";
import { z } from "zod";

const WORKSPACE = "/workspace";
const OUTPUT_DIRECTORY = `${WORKSPACE}/output`;
const SUBMISSION_PATH = `${OUTPUT_DIRECTORY}/submission.json`;

async function requireOutputFile(relativePath: string): Promise<string> {
  const absolutePath = path.resolve(WORKSPACE, relativePath);
  if (!absolutePath.startsWith(`${OUTPUT_DIRECTORY}${path.sep}`)) {
    throw new Error("Submitted files must be under output/");
  }
  if (!(await stat(absolutePath)).isFile()) {
    throw new Error(`${relativePath} is not a file`);
  }
  return path.relative(WORKSPACE, absolutePath);
}

export default Plugin.define({
  id: "public-patterns.submit-brief",
  setup: async (plugin) => {
    await plugin.tool.transform((tools) => {
      tools.add({
        name: "submit_brief",
        description: "Submit the completed investigation brief.",
        input: z.object({
          outcome: z.enum(["investigate", "watch", "discard"]),
          confidence: z
            .number()
            .min(0)
            .max(1)
            .describe("Confidence in the triage outcome, not a causal story."),
          briefPath: z
            .string()
            .describe("Workspace-relative path under output/."),
          evidence: z
            .array(z.string())
            .describe("Source record IDs or URLs supporting the brief."),
          artifacts: z
            .array(z.string())
            .describe("Workspace-relative paths under output/."),
        }),
        output: z.object({ accepted: z.boolean() }),
        options: {
          codemode: false,
          permission: "submit_brief",
        },
        execute: async (submission) => {
          const briefPath = await requireOutputFile(submission.briefPath);
          const artifacts = await Promise.all(
            submission.artifacts.map(requireOutputFile),
          );
          await writeFile(
            SUBMISSION_PATH,
            JSON.stringify({ ...submission, briefPath, artifacts }, null, 2),
          );
          return {
            output: { accepted: true },
            content: "Brief accepted.",
          };
        },
      });
    });
  },
});
