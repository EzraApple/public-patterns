export function buildCaseInput(fixture) {
  return {
    datasets: fixture.datasets ?? [],
    series: fixture.series ?? [],
    targetWindows: fixture.targetWindows ?? [],
    controlWindows: fixture.controlWindows ?? [],
    sourceQueries: fixture.sourceQueries ?? [],
    evidenceUrls: [
      ...(fixture.evidenceUrls ?? []),
      ...(fixture.targetEvidence ?? []),
    ],
    limitations: fixture.limitations ?? [],
  };
}
