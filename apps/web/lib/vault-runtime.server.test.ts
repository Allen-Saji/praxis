import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ load: vi.fn(), submit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@allen-saji/praxis", async (original) => ({ ...await original<typeof import("@allen-saji/praxis")>(), makeSuiClient: () => ({}), submitJournaledVaultPayment: mocks.submit }));
vi.mock("./vault-journal.server", () => ({ makeVaultJournal: () => ({ load: mocks.load }) }));
vi.mock("./vault-signer.server", () => ({ vaultDelegateAddress: vi.fn(), signVaultPayment: vi.fn() }));
vi.mock("./vault-config.server", () => ({ vaultPackageId: () => "package" }));
vi.mock("./control-plane.server", () => ({ HttpError: Error }));
import { PraxisSdkError } from "@allen-saji/praxis";
import { createVaultExecutionAdapter } from "./vault-runtime.server";
const binding = { organizationId: "org", assignmentId: "assignment", agentId: "agent", vaultId: "vault", owner: "owner", packageId: "package" };
const intent = { id: "intent", recipient: "recipient", amountMist: "1", evidenceBlobId: "blob" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("PRAXIS_VAULT_MAX_GAS_MIST", "100");
  mocks.load.mockResolvedValue({ digest: "digest", request: { vaultId: "vault", agent: `0x${createHash("sha256").update("agent").digest("hex")}`, recipient: "recipient", amount: 1n, evidence: "blob" } });
});
afterEach(() => vi.unstubAllEnvs());
it("retains unknown status if journal access fails after a broadcast error", async () => {
  mocks.load.mockResolvedValueOnce(await mocks.load()).mockRejectedValueOnce(new Error("database unavailable"));
  mocks.submit.mockRejectedValue(new Error("connection lost"));
  await expect(createVaultExecutionAdapter(binding).execute(intent)).rejects.toMatchObject({ code: "TRANSACTION_SUBMISSION_UNKNOWN" });
});
it("preserves a positively confirmed chain failure for reservation release", async () => {
  mocks.submit.mockRejectedValue(new PraxisSdkError("TRANSACTION_FAILED", "failed", { txDigest: "digest" }));
  await expect(createVaultExecutionAdapter(binding).execute(intent)).rejects.toMatchObject({ code: "TRANSACTION_FAILED", txDigest: "digest" });
  expect(mocks.load).toHaveBeenCalledTimes(1);
});
