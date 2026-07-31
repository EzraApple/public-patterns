import { getArticleSlug, publishArticle } from "./articles.ts";
import { ingestDataSfSource } from "./features/dataSfSources/ingest.ts";
import { ingestTransitAlerts } from "./features/transitAlerts/ingest.ts";
import { shiftDay } from "./ingestion.ts";
import { investigateDailyBursts } from "./investigations.ts";
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
        const { input, result, error } = await investigateDailyBursts({
          db: env.DB,
          investigator: env.INVESTIGATOR,
          day,
          createdAt,
        });
        if (error) {
          console.error("Daily investigation failed", { day, input, error });
        } else {
          let publishedSlug: string | null = null;
          if (
            result?.submission.outcome === "investigate" &&
            result.article
          ) {
            try {
              const article = await publishArticle({
                db: env.DB,
                investigationId: result.id,
                publication: {
                  slug: getArticleSlug(result.article.title, day),
                },
                publishedAt: createdAt,
              });
              publishedSlug = article.slug;
            } catch (publicationError) {
              console.error("Daily publication failed", {
                day,
                investigationId: result.id,
                error:
                  publicationError instanceof Error
                    ? publicationError.message
                    : String(publicationError),
              });
            }
          }
          console.log("Daily investigation completed", {
            day,
            input,
            investigationId: result?.id ?? null,
            publishedSlug,
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
