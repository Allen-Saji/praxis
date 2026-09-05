import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ member: vi.fn(), decision: vi.fn(), reasoning: vi.fn() }));
vi.mock("@/lib/control-plane.server", () => ({
  requireOrganizationMember: mocks.member,
  workspaceRepository: () => ({ decisionForMember: mocks.decision }),
  HttpError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message); } },
  safeErrorResponse: (error: { status?: number }) => Response.json({}, { status: error.status ?? 503 }),
}));
vi.mock("@/lib/praxis.server", () => ({ getReasoning: mocks.reasoning }));
import { GET } from "./route";
const organizationId = "11111111-1111-4111-8111-111111111111";
const intentId = "22222222-2222-4222-8222-222222222222";
const request = () => new Request(`https://praxis.test/api/reasoning?organizationId=${organizationId}&intentId=${intentId}&blobId=someone-elses-blob`);
beforeEach(() => vi.resetAllMocks());
describe("personal evidence", () => {
  it("requires membership before any evidence read", async () => {
    mocks.member.mockRejectedValue({ status: 404 }); expect((await GET(request())).status).toBe(404);
    expect(mocks.decision).not.toHaveBeenCalled(); expect(mocks.reasoning).not.toHaveBeenCalled();
  });
  it("rejects a decision outside the authorized workspace", async () => {
    mocks.member.mockResolvedValue({ session: { user: { id: "owner" } } }); mocks.decision.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(404); expect(mocks.reasoning).not.toHaveBeenCalled();
  });
  it("resolves the blob from owned data and disables public caching", async () => {
    mocks.member.mockResolvedValue({ session: { user: { id: "owner" } } }); mocks.decision.mockResolvedValue({ decision: { evidenceBlobId: "owned-blob" } }); mocks.reasoning.mockResolvedValue({ sealed: false });
    const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(mocks.reasoning).toHaveBeenCalledWith("owned-blob"); expect(mocks.decision).toHaveBeenCalledWith(organizationId, "owner", intentId);
  });
});
