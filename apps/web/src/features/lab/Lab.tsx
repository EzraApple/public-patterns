import { useState } from "react";

const ingestionSources = [
  "311",
  "dispatch-realtime",
  "dispatch-closed",
  "fire-ems",
  "police-incidents",
  "building-complaints",
  "traffic-crashes",
  "health-inspections",
  "building-permits",
  "eviction-notices",
  "transit-alerts",
] as const;

const burstSources = [
  "311",
  "dispatch",
  "fire-ems",
  "police-incidents",
  "building-complaints",
  "traffic-crashes",
  "health-inspections",
  "building-permits",
  "eviction-notices",
] as const;

type Burst = {
  day: string;
  kind: string;
  area: string | null;
  observed: number;
  expected: number;
  ratio: number;
};

type BurstResult = {
  ready: boolean;
  bursts: Burst[];
};

export function Lab() {
  const [token, setToken] = useState("");
  const [ingestion, setIngestion] =
    useState<(typeof ingestionSources)[number]>("building-complaints");
  const [source, setSource] =
    useState<(typeof burstSources)[number]>("building-complaints");
  const [day, setDay] = useState(previousUtcDay());
  const [bursts, setBursts] = useState<BurstResult>();
  const [output, setOutput] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  async function call(path: string, init?: RequestInit) {
    setBusy(true);
    try {
      const response = await fetch(`/api/internal${path}`, {
        ...init,
        headers: {
          ...init?.headers,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      });
      const body = (await response.json()) as unknown;
      setOutput(body);
      return response.ok ? body : undefined;
    } finally {
      setBusy(false);
    }
  }

  async function findBursts() {
    const result = (await call(
      `/bursts?source=${encodeURIComponent(source)}&day=${day}`,
    )) as BurstResult | undefined;
    if (result) {
      setBursts(result);
    }
  }

  async function investigate(burst: Burst) {
    await call("/investigations", {
      method: "POST",
      body: JSON.stringify({
        source,
        day,
        kind: burst.kind,
        area: burst.area,
      }),
    });
  }

  return (
    <main className="lab">
      <header>
        <p>Private workbench</p>
        <h1>Public Patterns</h1>
      </header>

      <label>
        Lab token
        <input
          autoComplete="off"
          onChange={(event) => setToken(event.target.value)}
          type="password"
          value={token}
        />
      </label>

      <section>
        <h2>1. Collect data</h2>
        <p>Each click processes a bounded ingestion batch.</p>
        <div className="lab-controls">
          <select
            onChange={(event) =>
              setIngestion(
                event.target.value as (typeof ingestionSources)[number],
              )
            }
            value={ingestion}
          >
            {ingestionSources.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button
            disabled={busy || !token}
            onClick={() => call(`/ingest/${ingestion}`, { method: "POST" })}
          >
            Ingest batch
          </button>
        </div>
      </section>

      <section>
        <h2>2. Find bursts</h2>
        <div className="lab-controls">
          <select
            onChange={(event) =>
              setSource(event.target.value as (typeof burstSources)[number])
            }
            value={source}
          >
            {burstSources.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <input
            onChange={(event) => setDay(event.target.value)}
            type="date"
            value={day}
          />
          <button disabled={busy || !token} onClick={findBursts}>
            Find bursts
          </button>
        </div>

        {bursts && !bursts.ready && (
          <p>The baseline is not complete yet. Continue ingesting.</p>
        )}
        {bursts?.ready && bursts.bursts.length === 0 && (
          <p>No bursts matched the current detector.</p>
        )}
        {bursts?.bursts.map((burst) => (
          <article className="lab-burst" key={`${burst.kind}-${burst.area}`}>
            <div>
              <strong>{burst.kind}</strong>
              <span>{burst.area ?? "No area"}</span>
              <span>
                {burst.observed} observed · {burst.expected.toFixed(1)} expected
                · {burst.ratio.toFixed(1)}×
              </span>
            </div>
            <button
              disabled={busy}
              onClick={() => investigate(burst)}
            >
              Investigate
            </button>
          </article>
        ))}
      </section>

      <section>
        <h2>Latest response</h2>
        <pre>{output ? JSON.stringify(output, null, 2) : "No requests yet."}</pre>
      </section>
    </main>
  );
}

function previousUtcDay() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
