# Weather

**Status:** source not selected  
**Last verified:** 2026-07-24 01:00 PDT

## Current finding

DataSF catalog searches did not surface an operational observation dataset for
temperature, wind, precipitation, and visibility. Weather should be an external
context source.

The National Weather Service API is the current official candidate:

- no API key;
- requests should identify the application with a `User-Agent`;
- point metadata for central San Francisco (`37.7749,-122.4194`) maps to
  forecast grid `MTR/85,105`, forecast zone `CAZ006`, and county zone `CAC075`;
- station observations expose values with unit codes and quality-control flags.

## Candidate surfaces

| Need | Endpoint |
| --- | --- |
| Resolve forecast grid and stations | `https://api.weather.gov/points/37.7749,-122.4194` |
| Hourly forecast | `https://api.weather.gov/gridpoints/MTR/85,105/forecast/hourly` |
| Nearby stations | `https://api.weather.gov/gridpoints/MTR/85,105/stations` |
| Downtown observations | `https://api.weather.gov/stations/SFOC1/observations` |
| Airport observations | `https://api.weather.gov/stations/KSFO/observations` |
| Active alerts for SF County | `https://api.weather.gov/alerts/active?area=CA` with geographic filtering |

## Observed snapshot

For the seven-day request ending 2026-07-24:

- `SFOC1` (San Francisco Downtown, 37.77056, -122.42694) returned 162
  observations from 2026-07-17 07:43Z through 2026-07-23 23:43Z, roughly hourly.
- Its sample contained temperature, dew point, and relative humidity, while
  wind, pressure, visibility, and precipitation fields were null.
- `KSFO` (San Francisco International Airport, 37.61961, -122.36558) reached
  the 500-result request cap while covering only about 38 hours. It reported a
  richer set including pressure, visibility, wind gust, and weather text.

Neither station is a complete citywide truth. Downtown has sparse variables;
KSFO is outside the city core and sits in a different microclimate.

The observation shape is GeoJSON. Relevant properties include:

- `timestamp` and `textDescription`
- quantitative values such as `temperature`, `dewpoint`, `windDirection`,
  `windSpeed`, `windGust`, `barometricPressure`, `seaLevelPressure`,
  `visibility`, `precipitationLastHour`, and `relativeHumidity`
- each quantitative value's `unitCode`, `value`, and `qualityControl`

## Working ingestion recommendation

Do not activate weather ingestion until a small station comparison answers the
open questions below. If NWS is selected:

1. Poll selected stations on their observed cadence with overlapping time
   windows and deduplicate by station plus observation timestamp.
2. Preserve units and QC flags; normalize values only in a derived layer.
3. Keep raw observations because the operational API should not be treated as a
   permanent archive.
4. Treat forecast data separately from observations. Forecast revisions are
   predictions, not measured events.
5. Use weather as explanatory context, not proof that it caused a city-data
   anomaly.

## Retention recommendation

- Observations are compact enough to retain indefinitely after normalization.
- Keep raw NWS responses briefly and snapshot any observation used as evidence.
- Select a separate NOAA archive before relying on long historical baselines.

## Quality and interpretation risks

- San Francisco's microclimates make single-station correlations weak.
- Variables can be null after upstream quality control.
- Observation frequency differs by station.
- Airport conditions can materially differ from downtown and western
  neighborhoods.
- NWS notes that MADIS quality-control processing can delay observations.

## Open questions

- Which station set best covers downtown, western, bay-facing, and southern SF?
- Is precipitation sufficiently reliable and granular for 311/dispatch
  correlation?
- How much history does the operational observation endpoint reliably expose?
- Which NOAA archive offers the simplest durable hourly history?
- Should an easier gridded source supplement official station observations for
  neighborhood-scale estimates?
- Do alerts belong in the weather adapter or a separate emergency-alert source?

## Sources

- [NWS API documentation](https://www.weather.gov/documentation/services-web-api)
- [NWS OpenAPI specification](https://api.weather.gov/openapi.json)
- [Central SF point metadata](https://api.weather.gov/points/37.7749,-122.4194)
