import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/control-plane.server", () => ({
  authRepository: vi.fn(),
  configuredOrigin: (request: Request) => process.env.APP_ORIGIN ?? new URL(request.url).origin,
  readJsonBody: async (request: Request, parse: (value: unknown) => unknown) => parse(await request.json()),
  requireSameOrigin: (request: Request) => {
    const expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
    if (request.headers.get("origin") !== expected) throw Object.assign(new Error("Invalid origin"), { status: 403, code: "ORIGIN_DENIED" });
  },
  safeErrorResponse: (error: { status?: number; code?: string; message?: string }, code: string, status: number) => Response.json({ error: { code: error.code ?? code, message: error.message ?? "failed", requestId: "test" } }, { status: error.status ?? status }),
  sha256: (value: string) => value,
// @ts-expect-error Vitest's runtime supports the virtual-module option.
}), { virtual: true });

import { POST } from "./route";

afterEach(() => {
  delete process.env.APP_ORIGIN;
});

async function jsonResponse(response: Response) {
  return response.json() as Promise<{ error?: { code?: string } }>;
}

describe("POST /api/auth/challenge", () => {
  it("rejects mainnet requests and unexpected fields", async () => {
    const mainnet = await POST(new Request("http://localhost/api/auth/challenge", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ address: "0x2", network: "mainnet" }),
    }));
    expect(mainnet.status).toBe(400);
    expect((await jsonResponse(mainnet)).error?.code).toBe("INVALID_CHALLENGE_REQUEST");

    const extra = await POST(new Request("http://localhost/api/auth/challenge", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ address: "0x2", network: "testnet", userId: "other-user" }),
    }));
    expect(extra.status).toBe(400);
    expect((await jsonResponse(extra)).error?.code).toBe("INVALID_CHALLENGE_REQUEST");
  });

  it("rejects malformed addresses before creating a challenge", async () => {
    for (const address of ["not-an-address", "0xZZZZ"]) {
      const response = await POST(new Request("http://localhost/api/auth/challenge", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ address, network: "testnet" }),
      }));
      expect(response.status).toBe(400);
      expect((await jsonResponse(response)).error?.code).toBe("INVALID_CHALLENGE_REQUEST");
    }
  });
});
