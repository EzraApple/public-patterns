import { ingestDataSfSource } from "./features/dataSfSources/ingest.ts";
import { ingestTransitAlerts } from "./features/transitAlerts/ingest.ts";
import { shiftDay } from "./ingestion.ts";
import { investigateDailyBursts } from "./investigations.ts";
import { sources } from "./observation.ts";
import { routeRequest, type Env } from "./pipeline.ts";

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
        const { input, result, error } = await investigateDailyBursts({
          db: env.DB,
          investigator: env.INVESTIGATOR,
          day,
          createdAt,
        });
        if (error) {
          console.error("Daily investigation failed", { day, input, error });
        } else {
          console.log("Daily investigation completed", {
            day,
            input,
            investigationId: result?.id ?? null,
          });
        }
      } catch (error) {
        console.error("Daily investigation failed", { day, error });
      }
      return;
    }

    const source =
      sources[Math.floor(controller.scheduledTime / 300_000) % sources.length]!;
    if (source === "transit-alerts") {
      if (env.TRANSIT_511_API_KEY) {
        await ingestTransitAlerts(env, createdAt);
      }
      return;
    }
    await ingestDataSfSource(env, createdAt, source);
  },
} satisfies ExportedHandler<Env>;
