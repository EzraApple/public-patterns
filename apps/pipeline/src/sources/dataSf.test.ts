import { describe, expect, it, vi } from "vitest";

import {
  fetchDataSf,
  parseDataSfUpperWatermark,
  socrataTimestampSchema,
} from "./dataSf.ts";

describe("DataSF source boundary", () => {
  it.each([
    "2024-02-29T23:59:59",
    "2026-07-24T10:05:00.000",
    "2026-07-24T10:05:00.1",
  ])("accepts a real offset-free timestamp: %s", (timestamp) => {
    expect(socrataTimestampSchema.safeParse(timestamp).success).toBe(true);
  });

  it.each([
    "2023-02-29T10:00:00",
    "2026-04-31T10:00:00",
    "2026-07-24T24:00:00",
    "2026-07-24T10:00:00.0000",
    "2026-07-24T10:00:00Z",
    "not-a-timestamp",
  ])("rejects an invalid or zoned timestamp: %s", (timestamp) => {
    expect(socrataTimestampSchema.safeParse(timestamp).success).toBe(false);
  });

  it("strictly parses DataSF aggregate watermark payloads", () => {
    expect(parseDataSfUpperWatermark([{}])).toBeNull();
    expect(
      parseDataSfUpperWatermark([
        { upper_watermark: "2026-07-24T10:05:00.000" },
      ]),
    ).toBe("2026-07-24T10:05:00.000");

    for (const payload of [
      [],
      [{}, {}],
      [{ unexpected: "value" }],
      [{ upper_watermark: "not-a-timestamp" }],
    ]) {
      expect(() => parseDataSfUpperWatermark(payload)).toThrow();
    }
  });

  it("honors Retry-After when retrying a throttled GET", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      )
      .mockResolvedValueOnce(Response.json([{ ok: true }]));
    const sleep = vi.fn(async () => undefined);

    const response = await fetchDataSf({
      fetch,
      url: new URL("https://data.sfgov.org/resource/test.json"),
      sleep,
    });

    expect(response.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetch.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetch.mock.calls[0]?.[1]?.signal).not.toBe(
      fetch.mock.calls[1]?.[1]?.signal,
    );
  });

  it("caps publisher-requested retry delays", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "3600" },
        }),
      )
      .mockResolvedValueOnce(Response.json([{ ok: true }]));
    const sleep = vi.fn(async () => undefined);

    await fetchDataSf({
      fetch,
      url: new URL("https://data.sfgov.org/resource/test.json"),
      sleep,
    });

    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it("retries transient server errors with bounded backoff", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json([{ ok: true }]));
    const sleep = vi.fn(async () => undefined);

    const response = await fetchDataSf({
      fetch,
      url: new URL("https://data.sfgov.org/resource/test.json"),
      sleep,
    });

    expect(response.ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("returns the final failure after the configured attempt bound", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const sleep = vi.fn(async () => undefined);

    const response = await fetchDataSf({
      fetch,
      url: new URL("https://data.sfgov.org/resource/test.json"),
      sleep,
      maxAttempts: 2,
    });

    expect(response.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("retries a rejected fetch with exponential backoff", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(Response.json([{ ok: true }]));
    const sleep = vi.fn(async () => undefined);

    const response = await fetchDataSf({
      fetch,
      url: new URL("https://data.sfgov.org/resource/test.json"),
      sleep,
    });

    expect(response.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("rethrows the final rejected fetch after bounded attempts", async () => {
    const finalError = new Error("still unavailable");
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockRejectedValueOnce(finalError);
    const sleep = vi.fn(async () => undefined);

    await expect(
      fetchDataSf({
        fetch,
        url: new URL("https://data.sfgov.org/resource/test.json"),
        sleep,
        maxAttempts: 2,
      }),
    ).rejects.toBe(finalError);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });
});
