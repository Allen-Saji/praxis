import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentCredential } from "@allen-saji/praxis-control-plane";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), touch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./control-plane.server", () => ({
  authRepository: () => ({ authorizeAgent: mocks.authorize, touchCredential: mocks.touch }),
  requiredSecret: () => "test-only-pepper",
  HttpError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } },
}));
import { authorizeAgentRequest } from "./agent-auth.server";
const request = () => new Request("https://praxis.example/api/v1/agent", { headers: { authorization: `Bearer ${createAgentCredential().token}` } });
beforeEach(() => { mocks.authorize.mockReset(); mocks.touch.mockReset().mockResolvedValue(undefined); });
describe("agent authentication failures", () => {
  it.each([["AGENT_UNAUTHENTICATED", 401], ["RATE_LIMITED", 429], ["DB_CLOCK_UNAVAILABLE", 503], ["INVALID_RATE_LIMIT", 503], ["ECONNREFUSED", 503]] as const)("maps %s to %i without exposing internals", async (code, status) => {
    mocks.authorize.mockRejectedValue(Object.assign(new Error("private database detail"), { code }));
    await expect(authorizeAgentRequest(request())).rejects.toMatchObject({ status });
    await expect(authorizeAgentRequest(request())).rejects.not.toThrow("private database");
    expect(mocks.touch).not.toHaveBeenCalled();
  });
  it("rejects malformed credentials before querying the database", async () => {
    await expect(authorizeAgentRequest(new Request("https://praxis.example", { headers: { authorization: "Bearer invalid" } }))).rejects.toMatchObject({ status: 401 });
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("authorizes the unchanged identity and tolerates last-used bookkeeping failure", async () => {
    const identity = { credential: { id: "credential" }, now: new Date() };
    mocks.authorize.mockResolvedValue(identity); mocks.touch.mockRejectedValue(new Error("unavailable"));
    expect(await authorizeAgentRequest(request())).toEqual(identity);
  });
});
