import { mkdir, stat, writeFile } from "node:fs/promises";

import { Plugin } from "@opencode-ai/plugin";
import { z } from "zod";

import { articleHeroSchema } from "../article-schema.ts";
import {
  generateImage,
  imageApiFailure,
  imageConfigurationError,
  imageModel,
  imageQuality,
  imageSize,
} from "./image-generation.ts";

const outputDirectory = "/workspace/output";
const imagePath = `${outputDirectory}/hero.webp`;
const metadataPath = `${outputDirectory}/hero.json`;
const failurePath = `${outputDirectory}/hero-error.json`;
const imageCaption =
  "AI-generated contextual illustration; it does not depict the reported event.";

async function imageAlreadyExists() {
  return stat(imagePath).then(
    () => true,
    () => false,
  );
}

export default Plugin.define({
  id: "public-patterns.generate-image",
  setup: async (plugin) => {
    await plugin.tool.transform((tools) => {
      tools.add({
        name: "generate_image",
        description:
          "Generate one understated contextual hero image for a completed article. The image is illustrative, never evidence.",
        input: z.object({
          scene: z
            .string()
            .trim()
            .min(20)
            .max(2_000)
            .describe(
              "The place, composition, light, palette, and article-specific constraints. Describe context, not the reported incident.",
            ),
          alt: z
            .string()
            .trim()
            .min(1)
            .max(300)
            .describe("Concise literal description for screen readers."),
        }),
        output: z.object({
          hero: articleHeroSchema,
          model: z.string(),
          quality: z.string(),
          size: z.string(),
        }),
        options: {
          codemode: false,
          permission: "generate_image",
        },
        execute: async ({ alt, scene }) => {
          if (await imageAlreadyExists()) {
            throw new Error("This investigation already generated its one image.");
          }
          const apiKey = process.env.OPENAI_API_KEY;
          const src = process.env.PUBLIC_PATTERNS_IMAGE_SRC;
          let generated: Awaited<ReturnType<typeof generateImage>>;
          try {
            if (!apiKey || !src) {
              throw imageConfigurationError();
            }
            generated = await generateImage({ apiKey, scene });
          } catch (error) {
            const diagnostic = imageApiFailure(error);
            await mkdir(outputDirectory, { recursive: true });
            await writeFile(
              failurePath,
              JSON.stringify(diagnostic, null, 2),
            );
            throw error;
          }
          const hero = articleHeroSchema.parse({
            src,
            alt,
            caption: imageCaption,
          });
          await mkdir(outputDirectory, { recursive: true });
          await writeFile(imagePath, Buffer.from(generated.base64, "base64"));
          await writeFile(
            metadataPath,
            JSON.stringify(
              {
                hero,
                model: generated.model,
                prompt: generated.prompt,
                revisedPrompt: generated.revisedPrompt,
              },
              null,
              2,
            ),
          );
          return {
            output: {
              hero,
              model: imageModel,
              quality: imageQuality,
              size: imageSize,
            },
            content: JSON.stringify(
              { hero, model: imageModel, quality: imageQuality, size: imageSize },
              null,
              2,
            ),
          };
        },
      });
    });
  },
});
