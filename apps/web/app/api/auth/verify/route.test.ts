import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/control-plane.server", () => ({
  authGraphqlClient: vi.fn(),
  authRepository: vi.fn(),
  configuredOrigin: (request: Request) => process.env.APP_ORIGIN ?? new URL(request.url).origin,
  readJsonBody: async (request: Request, parse: (value: unknown) => unknown) => parse(await request.json()),
  requestSessionToken: vi.fn(() => null),
  requireSameOrigin: (request: Request) => {
    const expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
    if (request.headers.get("origin") !== expected) throw Object.assign(new Error("Invalid origin"), { status: 403, code: "ORIGIN_DENIED" });
  },
  requiredSecret: vi.fn(),
  safeErrorResponse: (error: { status?: number; code?: string; message?: string }, code: string, status: number) => Response.json({ error: { code: error.code ?? code, message: error.message ?? "failed", requestId: "test" } }, { status: error.status ?? status }),
  sessionCookieName: () => "praxis_session",
  sessionCookieOptions: () => ({ httpOnly: true, sameSite: "strict", secure: false, path: "/", maxAge: 43_200 }),
  sha256: (value: string) => value,
// @ts-expect-error Vitest's runtime supports the virtual-module option.
}), { virtual: true });

import { POST } from "./route";

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.PRAXIS_SESSION_PEPPER;
  delete process.env.APP_ORIGIN;
});

async function code(response: Response) {
  const body = await response.json() as { error?: { code?: string } };
  return body.error?.code;
}

describe("POST /api/auth/verify", () => {
  it("rejects malformed input without creating a session", async () => {
    const response = await POST(new Request("http://localhost/api/auth/verify", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ address: "0x2", nonce: "nonce" }),
    }));
    expect(response.status).toBe(401);
    expect(await code(response)).toBe("AUTHENTICATION_FAILED");
  });

  it("does not accept a caller-selected user or role", async () => {
    const response = await POST(new Request("http://localhost/api/auth/verify", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ address: "0x2", nonce: "nonce", signature: "sig", userId: "other-user", role: "owner" }),
    }));
    expect(response.status).toBe(401);
    expect(await code(response)).toBe("AUTHENTICATION_FAILED");
  });
});
