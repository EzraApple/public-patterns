import { investigationInputSchema } from "@public-patterns/contracts/investigation";

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
      try {
        return Response.json(await investigateCase(env, input.data));
      } catch (error) {
        const providerFailure = providerFailureDiagnostic(error);
        const archiveKey =
          error instanceof InvestigationFailedError ||
          error instanceof InvestigationCheckpointError
            ? error.archiveKey
            : undefined;
        console.error("Investigation failed", {
          event: "investigation.failed",
          investigationId: input.data.id,
          ...(providerFailure ? { provider: providerFailure } : {}),
          error: error instanceof Error ? error.message : String(error),
        });
        return Response.json(
          {
            error: "investigation failed",
            ...(archiveKey ? { archiveKey } : {}),
            ...(error instanceof InvestigationCheckpointError
              ? { retryable: true }
              : {}),
            ...(providerFailure ? { provider: providerFailure } : {}),
          },
          { status: providerFailure ? 502 : 500 },
        );
      }
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
