import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ member: vi.fn(), state: vi.fn(), register: vi.fn(), transaction: vi.fn(), package: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@allen-saji/praxis", () => ({ makeSuiClient: () => ({ getTransaction: mocks.transaction }), readVaultState: mocks.state }));
vi.mock("@/lib/control-plane.server", () => ({
  requireSameOrigin: () => {}, requireOrganizationMember: mocks.member,
  HttpError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message); } },
  safeErrorResponse: (error: { status?: number; message: string }) => Response.json({ error: { message: error.message } }, { status: error.status ?? 400 }),
}));
vi.mock("@/lib/workspace-mutations.server", () => ({ readJsonBody: async (request: Request, parse: (value: unknown) => unknown) => parse(await request.json()), workspaceRepository: () => ({ registerVault: mocks.register }) }));
vi.mock("@/lib/vault-config.server", () => ({ vaultPackageId: mocks.package }));
import { POST } from "./route";
const owner = `0x${"1".repeat(64)}`;
const vaultId = `0x${"2".repeat(64)}`;
const packageId = `0x${"3".repeat(64)}`;
const context = { params: Promise.resolve({ orgId: "org" }) };
const request = (body: unknown) => new Request("https://praxis.test/api/workspaces/org/vaults", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.package.mockReturnValue(packageId);
  mocks.member.mockResolvedValue({ session: { user: { id: "user", primarySuiAddress: owner } } });
  mocks.state.mockResolvedValue({ owner }); mocks.register.mockResolvedValue({ wallet: { id: "wallet" } });
});
describe("verified vault registration", () => {
  it("registers only chain state belonging to the authenticated owner", async () => {
    expect((await POST(request({ label: "Mine", vaultId }), context)).status).toBe(201);
    expect(mocks.member).toHaveBeenCalledWith(expect.any(Request), "org", "owner");
    expect(mocks.state).toHaveBeenCalledWith(expect.anything(), { packageId, vaultId });
    expect(mocks.register).toHaveBeenCalledWith({ organizationId: "org", actorId: "user", label: "Mine", vaultId, ownerAddress: owner, packageId });
  });
  it("rejects someone else's vault and caller-supplied package identity", async () => {
    mocks.state.mockResolvedValue({ owner: `0x${"4".repeat(64)}` });
    expect((await POST(request({ label: "Mine", vaultId }), context)).status).toBe(403);
    expect(mocks.register).not.toHaveBeenCalled();
    expect((await POST(request({ label: "Mine", vaultId, packageId }), context)).status).toBe(400);
  });
  it("does not register an unconfirmed creation transaction", async () => {
    mocks.transaction.mockResolvedValue({ $kind: "FailedTransaction", FailedTransaction: {} });
    expect((await POST(request({ label: "Mine", transactionDigest: "1".repeat(44) }), context)).status).toBe(409);
    expect(mocks.register).not.toHaveBeenCalled();
  });
});
