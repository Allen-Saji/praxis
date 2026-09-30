import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), check: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/workspace-mutations.server", () => ({ assertWalletEnablement: mocks.check }));
vi.mock("@/lib/control-plane.server", async (original) => ({ ...await original<typeof import("@/lib/control-plane.server")>(), requireOrganizationMember: mocks.authorize }));
import { HttpError } from "@/lib/control-plane.server";
import { GET } from "./route";
const request = () => new Request(`https://praxis.example/api/workspaces/org/wallets/eligibility?address=0x${"2".repeat(64)}`);
const context = { params: Promise.resolve({ orgId: "org" }) };
describe("wallet eligibility failures", () => {
  it("returns false only for an unsupported wallet", async () => {
    mocks.check.mockRejectedValue(new HttpError(403, "WALLET_NOT_SUPPORTED", "Unsupported wallet"));
    const response = await GET(request(), context);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ eligible: false });
  });
  it.each(["EXECUTION_UNAVAILABLE", "EXECUTION_AUTHORITY_UNAVAILABLE", "ELIGIBILITY_UNAVAILABLE"])("reports %s as unavailable rather than blaming the wallet", async (code) => {
    mocks.check.mockRejectedValue(new HttpError(503, code, "Service unavailable"));
    const response = await GET(request(), context);
    expect(response.status).toBe(503); expect((await response.json()).error.code).toBe(code);
  });
  it("does not expose unexpected RPC details", async () => {
    mocks.check.mockRejectedValue(new Error("private provider details"));
    const response = await GET(request(), context);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private provider");
  });
});
