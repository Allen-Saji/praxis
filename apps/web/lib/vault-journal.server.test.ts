import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./control-plane.server", () => ({ vaultSubmissionRepository: vi.fn() }));
import { makeVaultJournal } from "./vault-journal.server";
import type { VaultSubmissionRepository } from "@allen-saji/praxis-db";
const address = `0x${"1".repeat(64)}`;
const request = { packageId: address, vaultId: address, delegate: address, agent: address, recipient: address, amount: 9007199254740993n, sequence: 0n, vaultVersion: 2n, grantVersion: 3n, evidence: "reference" };

describe("database vault journal adapter", () => {
  it("round-trips exact money without floating-point conversion", async () => {
    let stored: Awaited<ReturnType<VaultSubmissionRepository["load"]>> = null;
    const repository = { saveOnce: vi.fn(async (row) => { stored = { ...row, organizationId: "org", createdAt: new Date() }; }), load: vi.fn(async () => stored) };
    const journal = makeVaultJournal("org", repository);
    const submission = { intentId: "intent", digest: "digest", bytes: "AQI=", signature: "signature", request, gasBudget: 1000n };
    await journal.saveOnce(submission);
    expect(await journal.load("intent")).toEqual(submission);
    expect(repository.saveOnce.mock.calls[0]![0].requestJson.amount).toBe("9007199254740993");
    expect(await makeVaultJournal("other", { ...repository, load: async () => null }).load("intent")).toBeNull();
    await expect(makeVaultJournal("other", repository).load("intent")).rejects.toThrow("identity mismatch");
  });
});
