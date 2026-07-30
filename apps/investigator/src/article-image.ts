import {
  type ArticleDraft,
  articleHeroSchema,
} from "@public-patterns/contracts/article";
import { z } from "zod";

export type ArticleImageSandbox = {
  readFile(
    path: string,
    options?: { encoding?: "base64" },
  ): Promise<{ content: string }>;
};

export type ArticleImageArchive = {
  put(
    key: string,
    value: string | Uint8Array,
    options: {
      httpMetadata: {
        cacheControl?: string;
        contentType: string;
      };
      customMetadata: Record<string, string>;
    },
  ): Promise<unknown>;
};

export type StoredArticleImage = {
  key: string;
  model: string;
  prompt: string;
  revisedPrompt?: string;
};

export const articleImageFailureSchema = z.object({
  provider: z.literal("OpenAI"),
  operation: z.literal("image generation"),
  kind: z.enum([
    "configuration",
    "authentication",
    "quota",
    "rate_limit",
    "timeout",
    "provider",
    "network",
    "invalid_response",
    "unknown",
  ]),
  retryable: z.boolean(),
  action: z.string().min(1),
  status: z.number().int().optional(),
  providerCode: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  detail: z.string().min(1).optional(),
});

export type ArticleImageFailure = z.infer<
  typeof articleImageFailureSchema
>;

const metadataSchema = z.object({
  hero: articleHeroSchema,
  model: z.string().min(1),
  prompt: z.string().min(1),
  revisedPrompt: z.string().optional(),
});

export function articleImageSrc(investigationId: string) {
  return `/media/articles/${investigationId}.webp`;
}

export async function readArticleImageFailure(
  sandbox: ArticleImageSandbox,
): Promise<ArticleImageFailure | undefined> {
  let file: { content: string };
  try {
    file = await sandbox.readFile("/workspace/output/hero-error.json");
  } catch {
    return;
  }
  return articleImageFailureSchema.parse(JSON.parse(file.content));
}

export async function saveArticleImage({
  archive,
  article,
  environment,
  investigationId,
  sandbox,
}: {
  archive: ArticleImageArchive;
  article: ArticleDraft | null;
  environment: string;
  investigationId: string;
  sandbox: ArticleImageSandbox;
}): Promise<StoredArticleImage | undefined> {
  if (!article?.hero) {
    return;
  }
  const metadata = metadataSchema.parse(
    JSON.parse(
      (await sandbox.readFile("/workspace/output/hero.json")).content,
    ),
  );
  if (JSON.stringify(metadata.hero) !== JSON.stringify(article.hero)) {
    throw new Error("Article hero does not match generated image metadata");
  }
  const expectedSrc = articleImageSrc(investigationId);
  if (article.hero.src !== expectedSrc) {
    throw new Error(`Article hero src must be ${expectedSrc}`);
  }
  const image = await sandbox.readFile("/workspace/output/hero.webp", {
    encoding: "base64",
  });
  const bytes = Uint8Array.from(atob(image.content), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) {
    throw new Error("Generated image must be between 1 byte and 10 MB");
  }
  const key = `article-media/${investigationId}.webp`;
  await archive.put(key, bytes, {
    httpMetadata: {
      cacheControl: "public, max-age=31536000, immutable",
      contentType: "image/webp",
    },
    customMetadata: { environment, investigationId },
  });
  return {
    key,
    model: metadata.model,
    prompt: metadata.prompt,
    ...(metadata.revisedPrompt
      ? { revisedPrompt: metadata.revisedPrompt }
      : {}),
  };
}
