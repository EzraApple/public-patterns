import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { Plugin } from "@opencode-ai/plugin";
import { z } from "zod";
import { articleDraftSchema } from "../article-schema.ts";

const WORKSPACE = "/workspace";
const OUTPUT_DIRECTORY = `${WORKSPACE}/output`;
const SUBMISSION_PATH = `${OUTPUT_DIRECTORY}/submission.json`;
const outputPath = z
  .string()
  .describe("Workspace-relative path under output/.");

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
        input: z
          .object({
            outcome: z.enum(["investigate", "watch", "discard"]),
            confidence: z
              .number()
              .min(0)
              .max(1)
              .describe("Confidence in the triage outcome, not a causal story."),
            briefPath: outputPath,
            articlePath: outputPath
              .optional()
              .describe(
                "Structured article JSON path. Required for investigate outcomes.",
              ),
            reviewPath: outputPath
              .optional()
              .describe(
                "Final claim and editorial review path. Required for investigate outcomes.",
              ),
            evidence: z
              .array(z.string())
              .describe("Source record IDs or URLs supporting the brief."),
          })
          .superRefine((submission, context) => {
            if (submission.outcome === "investigate") {
              for (const field of ["articlePath", "reviewPath"] as const) {
                if (!submission[field]) {
                  context.addIssue({
                    code: "custom",
                    path: [field],
                    message: `Investigate outcomes require ${field}.`,
                  });
                }
              }
            }
          }),
        output: z.object({ accepted: z.boolean() }),
        options: {
          codemode: false,
          permission: "submit_brief",
        },
        execute: async (submission) => {
          const briefPath = await requireOutputFile(submission.briefPath);
          const articlePath = submission.articlePath
            ? await requireOutputFile(submission.articlePath)
            : undefined;
          const reviewPath = submission.reviewPath
            ? await requireOutputFile(submission.reviewPath)
            : undefined;
          if (articlePath) {
            articleDraftSchema.parse(
              JSON.parse(
                await readFile(path.resolve(WORKSPACE, articlePath), "utf8"),
              ),
            );
          }
          if (
            reviewPath &&
            !(await readFile(path.resolve(WORKSPACE, reviewPath), "utf8")).trim()
          ) {
            throw new Error("The article review cannot be blank.");
          }
          await writeFile(
            SUBMISSION_PATH,
            JSON.stringify(
              { ...submission, briefPath, articlePath, reviewPath },
              null,
              2,
            ),
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
