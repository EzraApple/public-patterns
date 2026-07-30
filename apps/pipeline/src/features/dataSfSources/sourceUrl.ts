import type { Observation, Source } from "@/observation.ts";
import {
  dataSfSourceNames,
  getDataSfSourceConfig,
  type DataSfSourceName,
} from "./config.ts";

export function getSourceUrl(
  observation: Observation,
): string | undefined {
  if (!isDataSfSource(observation.source)) {
    return undefined;
  }

  const { datasetId, idField } = getDataSfSourceConfig(
    observation.source,
  );
  const url = new URL(
    `https://data.sfgov.org/resource/${datasetId}.json`,
  );
  const id = observation.id.replaceAll("'", "''");
  url.searchParams.set("$where", `${idField} = '${id}'`);
  return url.toString();
}

function isDataSfSource(
  source: Source,
): source is DataSfSourceName {
  return (dataSfSourceNames as readonly string[]).includes(source);
}
