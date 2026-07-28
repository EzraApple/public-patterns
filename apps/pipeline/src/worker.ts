import { ingestDataSfSource } from "./features/dataSfSources/ingest.ts";
import { ingestTransitAlerts } from "./features/transitAlerts/ingest.ts";
import { sources } from "./observation.ts";
import { routeRequest, type Env } from "./pipeline.ts";

export default {
  fetch: routeRequest,
  async scheduled(controller, env) {
    const source =
      sources[Math.floor(controller.scheduledTime / 300_000) % sources.length]!;
    if (source === "transit-alerts") {
      if (env.TRANSIT_511_API_KEY) {
        await ingestTransitAlerts(env, new Date().toISOString());
      }
      return;
    }
    await ingestDataSfSource(env, new Date().toISOString(), source);
  },
} satisfies ExportedHandler<Env>;
