import { z } from "zod";

const imageResponseSchema = z.object({
  data: z.array(
    z.object({
      b64_json: z.string().min(1),
      revised_prompt: z.string().optional(),
    }),
  ).min(1),
});

export const imageModel = "gpt-image-2";
export const imageQuality = "low";
export const imageSize = "1536x1024";

export type ImageApiFailure = {
  provider: "OpenAI";
  operation: "image generation";
  kind:
    | "configuration"
    | "authentication"
    | "quota"
    | "rate_limit"
    | "timeout"
    | "provider"
    | "network"
    | "invalid_response"
    | "unknown";
  retryable: boolean;
  action: string;
  status?: number;
  providerCode?: string;
  requestId?: string;
  detail?: string;
};

export class ImageApiError extends Error {
  readonly diagnostic: ImageApiFailure;

  constructor(diagnostic: ImageApiFailure) {
    super(formatImageApiFailure(diagnostic));
    this.name = "ImageApiError";
    this.diagnostic = diagnostic;
  }
}

type ImageResponseFailureKind =
  | "authentication"
  | "quota"
  | "rate_limit"
  | "timeout"
  | "provider"
  | "unknown";

const houseStyle = `Create a wide editorial hero for Public Patterns, a calm San Francisco civic-news publication.
Use believable documentary photography with natural imperfections and subtle analog character.
Show a contextual San Francisco place, not a reconstruction of the reported event.
Keep the composition understated, observational, and crop-safe.
Do not depict victims, emergency action, identifiable people, invented evidence, text, signage, logos, watermarks, cinematic spectacle, or tourist-postcard staging.`;

export const buildImagePrompt = (scene: string) =>
  `${houseStyle}\n\nArticle-specific scene:\n${scene.trim()}`;

export async function generateImage({
  apiKey,
  fetcher = fetch,
  scene,
}: {
  apiKey: string;
  fetcher?: typeof fetch;
  scene: string;
}) {
  const prompt = buildImagePrompt(scene);
  let response: Response;
  try {
    response = await fetcher(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: imageModel,
          prompt,
          n: 1,
          size: imageSize,
          quality: imageQuality,
          output_format: "webp",
          moderation: "auto",
        }),
        signal: AbortSignal.timeout(240_000),
      },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const kind =
      (error instanceof Error &&
        ["AbortError", "TimeoutError"].includes(error.name)) ||
      /timed? ?out|timeout/i.test(detail)
        ? "timeout"
        : "network";
    throw new ImageApiError({
      provider: "OpenAI",
      operation: "image generation",
      kind,
      retryable: true,
      action:
        kind === "timeout"
          ? "Retry; if this persists, check OpenAI status and image-generation latency."
          : "Retry; if this persists, check sandbox egress and OpenAI reachability.",
      detail: detail.replaceAll(apiKey, "[redacted]").slice(0, 500),
    });
  }
  if (!response.ok) {
    throw await imageResponseError(response, apiKey);
  }
  try {
    const image = imageResponseSchema.parse(await response.json()).data[0];
    return {
      base64: image.b64_json,
      model: imageModel,
      prompt,
      revisedPrompt: image.revised_prompt,
    };
  } catch (error) {
    const providerRequestId = requestId(response);
    throw new ImageApiError({
      provider: "OpenAI",
      operation: "image generation",
      kind: "invalid_response",
      retryable: false,
      action:
        "Inspect the archived error and OpenAI request ID before changing the integration.",
      detail:
        error instanceof Error
          ? error.message.slice(0, 500)
          : String(error),
      ...(providerRequestId ? { requestId: providerRequestId } : {}),
    });
  }
}

export function imageConfigurationError(): ImageApiError {
  return new ImageApiError({
    provider: "OpenAI",
    operation: "image generation",
    kind: "configuration",
    retryable: false,
    action:
      "Set OPENAI_API_KEY in the active Doppler config and redeploy the investigator Worker.",
  });
}

export function imageApiFailure(error: unknown): ImageApiFailure {
  if (error instanceof ImageApiError) {
    return error.diagnostic;
  }
  return {
    provider: "OpenAI",
    operation: "image generation",
    kind: "unknown",
    retryable: false,
    action: "Inspect the sanitized detail before retrying.",
    detail: error instanceof Error ? error.message.slice(0, 500) : String(error),
  };
}

async function imageResponseError(
  response: Response,
  apiKey: string,
): Promise<ImageApiError> {
  const responseText = (await response.text())
    .replaceAll(apiKey, "[redacted]")
    .slice(0, 2_000);
  const providerError = parseProviderError(responseText);
  const detail =
    `${providerError.code ?? ""} ${providerError.message ?? ""}`.toLowerCase();
  const kind = classifyImageResponse(response.status, detail);
  const providerRequestId = requestId(response);
  return new ImageApiError({
    provider: "OpenAI",
    operation: "image generation",
    kind,
    retryable: ["rate_limit", "timeout", "provider"].includes(kind),
    action: imageResponseAction(kind),
    status: response.status,
    ...(providerError.code
      ? { providerCode: providerError.code }
      : {}),
    ...(providerRequestId ? { requestId: providerRequestId } : {}),
    ...(providerError.message
      ? { detail: providerError.message.slice(0, 500) }
      : {}),
  });
}

function classifyImageResponse(
  status: number,
  detail: string,
): ImageResponseFailureKind {
  if (
    status === 402 ||
    /insufficient[_ -]?(quota|balance|credits?)|billing|payment required|account balance/.test(
      detail,
    )
  ) {
    return "quota";
  }
  if (status === 401 || status === 403) {
    return "authentication";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status === 408 || status === 504) {
    return "timeout";
  }
  return status >= 500 ? "provider" : "unknown";
}

function imageResponseAction(kind: ImageResponseFailureKind): string {
  switch (kind) {
    case "authentication":
      return "Verify or rotate OPENAI_API_KEY in Doppler, then redeploy the investigator Worker.";
    case "quota":
      return "Refill credits or enable billing for the OpenAI project behind OPENAI_API_KEY, then retry.";
    case "rate_limit":
      return "Wait and retry; if this persists, check the OpenAI project tier and rate limits.";
    case "timeout":
      return "Retry; if this persists, check OpenAI status and image-generation latency.";
    case "provider":
      return "Check OpenAI status and retry after the outage clears.";
    case "unknown":
      return "Inspect the provider code, request ID, and sanitized detail before retrying.";
  }
}

function parseProviderError(value: string) {
  try {
    const body = JSON.parse(value) as Record<string, unknown>;
    const error =
      typeof body.error === "object" && body.error !== null
        ? (body.error as Record<string, unknown>)
        : body;
    return {
      code:
        typeof error.code === "string"
          ? error.code
          : typeof error.type === "string"
            ? error.type
            : undefined,
      message:
        typeof error.message === "string" ? error.message : undefined,
    };
  } catch {
    const message = value.replace(/\s+/g, " ").trim();
    return { message: message || undefined };
  }
}

function requestId(response: Response): string | undefined {
  return (
    response.headers.get("x-request-id") ??
    response.headers.get("cf-ray") ??
    undefined
  );
}

function formatImageApiFailure(diagnostic: ImageApiFailure): string {
  const references = [
    diagnostic.status ? `HTTP ${diagnostic.status}` : undefined,
    diagnostic.providerCode
      ? `code ${diagnostic.providerCode}`
      : undefined,
    diagnostic.requestId
      ? `request ${diagnostic.requestId}`
      : undefined,
  ].filter(Boolean);
  const suffix = references.length ? ` (${references.join(", ")})` : "";
  const detail = diagnostic.detail ? ` ${diagnostic.detail}` : "";
  return `OpenAI image generation failed [${diagnostic.kind}]${suffix}.${detail} Action: ${diagnostic.action}`;
}
