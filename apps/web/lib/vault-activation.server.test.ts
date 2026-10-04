import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ row: vi.fn(), overview: vi.fn(), state: vi.fn(), grant: vi.fn(), clock: vi.fn(), address: vi.fn(), balance: vi.fn(), active: vi.fn(), draft: vi.fn(), activate: vi.fn(), wallet: vi.fn(), assignment: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@allen-saji/praxis", () => ({ makeSuiClient: () => ({ getBalance: mocks.balance }), readVaultState: mocks.state, readVaultGrant: mocks.grant, readSuiClock: mocks.clock }));
vi.mock("./vault-config.server", () => ({ vaultPackageId: () => `0x${"1".repeat(64)}` }));
vi.mock("./vault-signer.server", () => ({ vaultDelegateAddress: mocks.address }));
vi.mock("./control-plane.server", () => ({
  HttpError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message); } },
  workspaceRepository: () => ({ assignmentExecutionForMember: mocks.row, workspaceOverview: mocks.overview, setWalletStatus: mocks.wallet, setAssignmentStatus: mocks.assignment }),
  policyRepository: () => ({ active: mocks.active, createDraft: mocks.draft, activate: mocks.activate }),
}));
import { activateVaultAssignment } from "./vault-activation.server";
const a = (d: string) => `0x${d.repeat(64)}`;
const input = { organizationId: "org", actorId: "user", assignmentId: "assignment" };
const state = { owner: a("3"), paused: false, version: "0", per_payment: "20", allowance: "100", spent: "0", budget: { daily_limit: "10", monthly_limit: "50" }, recipients: [a("4")] };
const grant = { ...state, active: true, expires_ms: "1000", delegate: a("5") };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("PRAXIS_VAULT_EXECUTION_ENABLED", "true"); vi.stubEnv("PRAXIS_VAULT_MAX_GAS_MIST", "100");
  mocks.row.mockResolvedValue({ assignment: { id: "assignment", status: "disabled" }, agent: { id: "agent", status: "active" }, member: { role: "owner" }, wallet: { id: "wallet", adapterType: "delegated_vault", vaultPackageId: a("1"), vaultOwnerAddress: a("3"), suiAddress: a("2") } });
  mocks.state.mockResolvedValue(state); mocks.grant.mockResolvedValue(grant); mocks.clock.mockResolvedValue(10n); mocks.address.mockResolvedValue(a("5")); mocks.balance.mockResolvedValue({ balance: { balance: "1000" } });
  mocks.overview.mockResolvedValue({ scopes: [{ id: "ws", scopeType: "wallet", walletId: "wallet" }, { id: "as", assignmentId: "assignment" }] });
  mocks.active.mockResolvedValue(null); mocks.draft.mockResolvedValue({ id: "draft" }); mocks.activate.mockResolvedValue({}); mocks.wallet.mockResolvedValue({}); mocks.assignment.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
describe("owner-approved vault activation", () => {
  it("mirrors confirmed chain ceilings conservatively before enabling access", async () => {
    expect(await activateVaultAssignment(input)).toMatchObject({ active: true, delegate: a("5") });
    expect(mocks.draft).toHaveBeenCalledWith(expect.objectContaining({ scopeId: "ws", maxPerTxMist: "10", maxPerDayMist: "10", maxPerMonthMist: "50", requireSimulation: true }));
    expect(mocks.activate).toHaveBeenCalledTimes(2);
    expect(mocks.assignment).toHaveBeenCalledWith({ ...input, status: "active" });
  });
  it("does not activate an expired grant or a different signer", async () => {
    mocks.clock.mockResolvedValue(1000n);
    await expect(activateVaultAssignment(input)).rejects.toMatchObject({ code: "GRANT_NOT_ACTIVE" });
    expect(mocks.activate).not.toHaveBeenCalled();
    mocks.clock.mockResolvedValue(10n); mocks.address.mockResolvedValue(a("9"));
    await expect(activateVaultAssignment(input)).rejects.toMatchObject({ code: "DELEGATE_MISMATCH" });
    expect(mocks.wallet).not.toHaveBeenCalled();
  });
  it("fails closed when rollout is disabled or gas is missing", async () => {
    vi.stubEnv("PRAXIS_VAULT_EXECUTION_ENABLED", "false");
    await expect(activateVaultAssignment(input)).rejects.toMatchObject({ code: "VAULT_EXECUTION_PENDING" });
    expect(mocks.state).not.toHaveBeenCalled();
    vi.stubEnv("PRAXIS_VAULT_EXECUTION_ENABLED", "true"); mocks.balance.mockResolvedValue({ balance: { balance: "0" } });
    await expect(activateVaultAssignment(input)).rejects.toMatchObject({ code: "DELEGATE_GAS_REQUIRED" });
    expect(mocks.wallet).not.toHaveBeenCalled();
  });
});
