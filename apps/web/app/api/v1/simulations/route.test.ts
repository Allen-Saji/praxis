import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { authorize, preview } = vi.hoisted(() => ({ authorize: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/agent-auth.server", () => ({ authorizeAgentRequest: authorize }));
vi.mock("@/lib/preview.server", () => ({ previewSpend: preview }));
import { HttpError } from "@/lib/control-plane.server";
import { POST } from "./route";

const context = { assignment: { id: "actual-assignment" } };
const valid = { recipient: "0x3", amountMist: "1", coinType: "0x2::sui::SUI", reasoning: { prompt: "p", decision: "d", model: "m" }, privacy: "public" };
function request(body: unknown) { return new Request("https://praxis.example/api/v1/simulations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); authorize.mockResolvedValue(context); preview.mockResolvedValue({ executionAuthorized: false, simulationStatus: "completed" }); });

describe("POST /api/v1/simulations", () => {
  it("requires authentication before parsing a request", async () => {
    authorize.mockRejectedValue(new HttpError(401, "AGENT_UNAUTHENTICATED", "Invalid credential"));
    expect((await POST(request(valid))).status).toBe(401);
    expect(preview).not.toHaveBeenCalled();
  });
  it("uses server-derived identity and disables caching", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(preview).toHaveBeenCalledWith({ context, request: { ...valid, recipient: `0x${"0".repeat(63)}3` } });
  });
  it.each([{ ...valid, walletId: "other-wallet" }, { ...valid, amountMist: "0" }, { ...valid, simulationReport: { recommendation: "proceed" } }])("rejects identity overrides, invalid amounts and client reports", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(preview).not.toHaveBeenCalled();
  });
  it("rejects sealed payloads instead of silently publishing them", async () => {
    expect((await POST(request({ ...valid, privacy: "sealed" }))).status).toBe(422);
    expect(preview).not.toHaveBeenCalled();
  });
  it("preserves credential throttling and surfaces simulation unavailability", async () => {
    authorize.mockRejectedValueOnce(new HttpError(429, "RATE_LIMITED", "Wait"));
    const limited = await POST(request(valid));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    preview.mockResolvedValue({ executionAuthorized: false, simulationStatus: "unavailable", recommendation: "abort" });
    expect((await POST(request(valid))).status).toBe(503);
  });
});
