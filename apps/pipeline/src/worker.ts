import { runDailyInvestigation } from "./dailyRuns.ts";
import { ingestDataSfSource } from "./features/dataSfSources/ingest.ts";
import { ingestTransitAlerts } from "./features/transitAlerts/ingest.ts";
import { shiftDay } from "./ingestion.ts";
import { sources } from "./observation.ts";
import { routeRequest, type Env } from "./pipeline.ts";
import { apiFailureDiagnostic } from "./sources/apiFailure.ts";

const dailyInvestigationCron = "30 15 * * *";

export default {
  fetch: routeRequest,
  async scheduled(controller, env) {
    const createdAt = new Date().toISOString();
    if (controller.cron === dailyInvestigationCron) {
      const day = shiftDay(
        new Date(controller.scheduledTime).toISOString().slice(0, 10),
        -1,
      );
      try {
        const run = await runDailyInvestigation({
          db: env.DB,
          investigator: env.INVESTIGATOR,
          day,
          startedAt: createdAt,
        });
        const message = run
          ? "Daily investigation completed"
          : "Daily investigation skipped";
        const fields = {
          event: run
            ? "daily-investigation.completed"
            : "daily-investigation.duplicate",
          day,
          status: run?.status ?? null,
          investigationId: run?.investigationId ?? null,
          publishedSlug: run?.publishedSlug ?? null,
          failureStage: run?.failureStage ?? null,
        };
        if (run?.status === "failed") {
          console.error(message, fields);
        } else {
          console.log(message, fields);
        }
      } catch (error) {
        console.error("Daily investigation failed", {
          event: "daily-investigation.unrecorded-failure",
          day,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    const source =
      sources[Math.floor(controller.scheduledTime / 300_000) % sources.length]!;
    if (source === "transit-alerts") {
      if (env.TRANSIT_511_API_KEY) {
        await ingestScheduled(source, () =>
          ingestTransitAlerts(env, createdAt),
        );
      }
      return;
    }
    await ingestScheduled(source, () =>
      ingestDataSfSource(env, createdAt, source),
    );
  },
} satisfies ExportedHandler<Env>;

async function ingestScheduled(
  source: string,
  ingest: () => Promise<unknown>,
) {
  try {
    await ingest();
  } catch (error) {
    const api = apiFailureDiagnostic(error);
    console.error("Scheduled ingestion failed", {
      event: "source.ingestion.failed",
      source,
      ...(api ? { api } : {}),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
