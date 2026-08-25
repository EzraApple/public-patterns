import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "./environment.ts";
import worker from "./worker.ts";

const { getSandbox } = vi.hoisted(() => ({ getSandbox: vi.fn() }));

vi.mock("@cloudflare/sandbox", () => ({
  getSandbox,
  Sandbox: class {},
}));

describe("investigation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns and logs a retryable provider transport failure", async () => {
    getSandbox.mockReturnValue({
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      exec: vi.fn(async () => ({
        success: false,
        exitCode: 1,
        stdout: '{"type":"error","error":{"message":"Transport"}}',
        stderr: "",
      })),
      readFile: vi.fn(async () => {
        throw new Error("submission unavailable");
      }),
      destroy: vi.fn(async () => undefined),
    });
    const archive = {
      get: vi.fn(async () => null),
      put: vi.fn(),
    };
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await worker.fetch(
      new Request("https://investigator.test/investigations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "case-transport", case: {} }),
      }),
      {
        ARCHIVE: archive,
        DEEPSEEK_API_KEY: "deepseek-key",
        PUBLIC_PATTERNS_ENV: "test",
        Sandbox: {},
      } as unknown as Env,
    );

    const body = await response.json();
    expect({ status: response.status, body }).toMatchObject({
      status: 502,
      body: {
        error: "investigation failed",
        retryable: true,
        provider: { kind: "network", retryable: true },
      },
    });
    expect(errorLog).toHaveBeenCalledWith(
      "Investigation failed",
      expect.objectContaining({
        event: "investigation.failed",
        investigationId: "case-transport",
        retryable: true,
        durationMs: expect.any(Number),
        provider: expect.objectContaining({ kind: "network" }),
      }),
    );
  });

  it("marks unexpected sandbox failures as retryable", async () => {
    getSandbox.mockReturnValue({
      mkdir: vi.fn(async () => {
        throw new Error("sandbox unavailable");
      }),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await worker.fetch(
      new Request("https://investigator.test/investigations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "case-sandbox", case: {} }),
      }),
      {
        ARCHIVE: { get: vi.fn(async () => null) },
        DEEPSEEK_API_KEY: "deepseek-key",
        PUBLIC_PATTERNS_ENV: "test",
        Sandbox: {},
      } as unknown as Env,
    );

    await expect(response.json()).resolves.toMatchObject({
      error: "investigation failed",
      retryable: true,
    });
    expect(response.status).toBe(500);
  });
});
