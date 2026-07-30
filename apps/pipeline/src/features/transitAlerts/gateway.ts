import type { SourceError } from "@/observation.ts";
import {
  apiConfigurationError,
  apiNetworkError,
  apiResponseError,
} from "@/sources/apiFailure.ts";
import {
  fetchWithRetry,
  type RequestSleep,
} from "@/sources/request.ts";
import {
  transitAlertEntitySchema,
  transitAlertFeedSchema,
  type TransitAlertEntity,
} from "./schema.ts";

const ORIGIN = "https://api.511.org";
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;
const INITIAL_RETRY_DELAY_MILLISECONDS = 1_000;

export type TransitAlertSnapshot = {
  generatedAt: number;
  entities: TransitAlertEntity[];
  errors: SourceError[];
};

export type TransitAlertGateway = {
  getSnapshot(): Promise<TransitAlertSnapshot>;
};

export function createTransitAlertGateway({
  fetch,
  apiKey,
  origin = ORIGIN,
  sleep,
  maxAttempts,
  requestTimeoutMilliseconds,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
}: {
  fetch: typeof globalThis.fetch;
  apiKey: string;
  origin?: string;
  sleep?: RequestSleep;
  maxAttempts?: number;
  requestTimeoutMilliseconds?: number;
  maxResponseBytes?: number;
}): TransitAlertGateway {
  if (!apiKey) {
    throw apiConfigurationError({
      provider: "511",
      operation: "transit alerts request",
      credentialName: "TRANSIT_511_API_KEY",
    });
  }
  assertPositiveInteger(maxResponseBytes, "maxResponseBytes");

  return {
    async getSnapshot() {
      const url = new URL("/transit/servicealerts", origin);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("agency", "SF");
      url.searchParams.set("format", "json");

      let response: Response;
      try {
        response = await fetchWithRetry({
          fetch,
          url,
          sleep,
          maxAttempts,
          requestTimeoutMilliseconds,
          initialRetryDelayMilliseconds:
            INITIAL_RETRY_DELAY_MILLISECONDS,
          label: "511 transit",
        });
      } catch (error) {
        throw apiNetworkError({
          provider: "511",
          operation: "transit alerts request",
          error,
          secrets: [apiKey],
        });
      }
      if (!response.ok) {
        throw await apiResponseError({
          provider: "511",
          operation: "transit alerts request",
          response,
          credentialName: "TRANSIT_511_API_KEY",
          hasCredential: true,
          secrets: [apiKey],
        });
      }

      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > maxResponseBytes) {
        throw new Error("511 transit response exceeded the size limit");
      }
      const feed = transitAlertFeedSchema.parse(JSON.parse(body));
      const entities: TransitAlertSnapshot["entities"] = [];
      const errors: TransitAlertSnapshot["errors"] = [];

      for (const sourceEntity of feed.Entities) {
        const parsed = transitAlertEntitySchema.safeParse(sourceEntity);
        if (parsed.success) {
          entities.push(parsed.data);
        } else {
          errors.push({
            source: "transit-alerts",
            dataset: "511-service-alerts",
            data: sourceEntity,
            issues: parsed.error.issues.map((issue) => ({
              path:
                issue.path.length === 0
                  ? "$"
                  : issue.path.map(String).join("."),
              message: issue.message,
            })),
          });
        }
      }

      return {
        generatedAt: feed.Header.Timestamp,
        entities,
        errors,
      };
    },
  };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}
