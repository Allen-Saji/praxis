import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/control-plane.server", () => ({
  authRepository: vi.fn(),
  readJsonBody: async (request: Request, parse: (value: unknown) => unknown) => parse(await request.json()),
  requireSameOrigin: (request: Request) => {
    if (!process.env.APP_ORIGIN || request.headers.get("origin") !== process.env.APP_ORIGIN) throw Object.assign(new Error("Invalid origin"), { status: 403, code: "ORIGIN_DENIED" });
  },
  requireSession: vi.fn(async () => { throw Object.assign(new Error("Login required"), { status: 401, code: "UNAUTHENTICATED" }); }),
  safeErrorResponse: (error: { status?: number; code?: string; message?: string }, code: string, status: number) => Response.json({ error: { code: error.code ?? code, message: error.message ?? "failed", requestId: "test" } }, { status: error.status ?? status }),
  workspaceRepository: vi.fn(),
// @ts-expect-error Vitest's runtime supports the virtual-module option.
}), { virtual: true });

import { POST } from "./route";

afterEach(() => {
  delete process.env.APP_ORIGIN;
  delete process.env.DATABASE_URL;
  delete process.env.PRAXIS_SESSION_PEPPER;
});

async function errorCode(response: Response) {
  const body = await response.json() as { error?: { code?: string } };
  return body.error?.code;
}

describe("POST /api/workspaces", () => {
  it("rejects cross-origin mutations before reading the body", async () => {
    process.env.APP_ORIGIN = "https://praxis.example";
    const response = await POST(new Request("https://praxis.example/api/workspaces", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
      body: JSON.stringify({ slug: "attacker-workspace", name: "Attacker" }),
    }));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("ORIGIN_DENIED");
  });

  it("requires a server-side session before considering caller identity fields", async () => {
    process.env.APP_ORIGIN = "https://praxis.example";
    const unauthenticated = await POST(new Request("https://praxis.example/api/workspaces", {
      method: "POST",
      headers: { origin: "https://praxis.example" },
      body: JSON.stringify({ slug: "private-workspace", name: "Private" }),
    }));
    expect(unauthenticated.status).toBe(401);
    expect(await errorCode(unauthenticated)).toBe("UNAUTHENTICATED");

    const withCallerIdentity = await POST(new Request("https://praxis.example/api/workspaces", {
      method: "POST",
      headers: { origin: "https://praxis.example", cookie: "praxis_session=not-a-session" },
      body: JSON.stringify({ slug: "private-workspace", name: "Private", userId: "another-user", role: "owner" }),
    }));
    expect(withCallerIdentity.status).toBe(401);
    expect(await errorCode(withCallerIdentity)).toBe("UNAUTHENTICATED");
  });
});
