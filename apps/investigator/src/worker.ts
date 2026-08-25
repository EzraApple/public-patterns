import {
  investigationInputSchema,
  publicProviderFailureSchema,
} from "@public-patterns/contracts/investigation";

import type { Env } from "./environment.ts";
import {
  InvestigationCheckpointError,
  InvestigationFailedError,
  investigateCase,
} from "./investigate.ts";
import { providerFailureDiagnostic } from "./providerFailure.ts";

export { Sandbox } from "@cloudflare/sandbox";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        environment: env.PUBLIC_PATTERNS_ENV,
      });
    }

    if (request.method === "POST" && url.pathname === "/investigations") {
      const input = investigationInputSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!input.success) {
        return Response.json({ error: "invalid investigation" }, { status: 400 });
      }
      const startedAt = Date.now();
      console.info("Investigation started", {
        event: "investigation.started",
        investigationId: input.data.id,
        environment: env.PUBLIC_PATTERNS_ENV,
      });
      try {
        const result = await investigateCase(env, input.data);
        console.info("Investigation completed", {
          event: "investigation.completed",
          investigationId: input.data.id,
          archiveKey: result.archiveKey,
          outcome: result.submission.outcome,
          durationMs: Date.now() - startedAt,
        });
        return Response.json(result);
      } catch (error) {
        const providerFailure = providerFailureDiagnostic(error);
        const publicProviderFailure = providerFailure
          ? publicProviderFailureSchema.parse(providerFailure)
          : undefined;
        const archiveKey =
          error instanceof InvestigationFailedError ||
          error instanceof InvestigationCheckpointError
            ? error.archiveKey
            : undefined;
        let retryable = true;
        if (error instanceof InvestigationCheckpointError) {
          retryable = true;
        } else if (error instanceof InvestigationFailedError) {
          retryable = error.retryable;
        }
        console.error("Investigation failed", {
          event: "investigation.failed",
          investigationId: input.data.id,
          ...(publicProviderFailure
            ? { provider: publicProviderFailure }
            : {}),
          ...(archiveKey ? { archiveKey } : {}),
          retryable,
          durationMs: Date.now() - startedAt,
          error: "investigation failed",
        });
        return Response.json(
          {
            error: "investigation failed",
            ...(archiveKey ? { archiveKey } : {}),
            retryable,
            ...(publicProviderFailure
              ? { provider: publicProviderFailure }
              : {}),
          },
          { status: providerFailure ? 502 : 500 },
        );
      }
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
