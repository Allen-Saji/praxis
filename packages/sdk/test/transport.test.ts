import { describe, expect, it } from "vitest";
import { PraxisSdkError } from "../src/errors";
import { canonicalize } from "../src/canonical";
import { buildSuiTransferTransaction, simulateSuiTransfer } from "../src/simulation";
import type { SuiTransport } from "../src/ports";

const sender = "0xA";
const recipient = "0xB";
const SUI = "0x2::sui::SUI";

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    $kind: "Transaction",
    Transaction: {
      digest: "dry-run",
      status: { success: true, error: null },
      effects: { gasUsed: { computationCost: "2", storageCost: "3", storageRebate: "1" } },
      balanceChanges: [
        { address: sender, coinType: SUI, amount: "-10" },
        { address: recipient, coinType: SUI, amount: "10" },
        { address: sender, coinType: "0x9::other::COIN", amount: "-999999999999999999999" },
      ],
      ...overrides,
    },
  };
}

function transport(overrides: Partial<SuiTransport> = {}): SuiTransport {
  return {
    simulateTransaction: async () => transaction(),
    executeTransaction: async () => transaction(),
    getBalance: async () => ({ balance: { balance: "100" } }),
    getObject: async () => ({ object: { type: "0x2::x::X", json: null } }),
    ...overrides,
  };
}

describe("transport-neutral SUI simulation", () => {
  it("normalizes addresses, preserves multi-row changes, and uses bigint gas math", async () => {
    const report = await simulateSuiTransfer({
      transport: transport(),
      transaction: new Uint8Array([1]),
      sender,
      recipient,
      amount: 10n,
    });

    expect(report.success).toBe(true);
    expect(report.balanceChanges).toHaveLength(3);
    expect(report.balanceChanges[0]?.owner).toMatch(/^0x0{63}a$/);
    expect(report.gasEstimate).toBe(4n);
    expect(report.walletBalance).toBe(100n);
    expect(report.recommendation).toBe("proceed");
  });

  it("accepts the current Core API simulation shape with its digest in effects", async () => {
    const report = await simulateSuiTransfer({
      transport: transport({
        simulateTransaction: async () => ({
          $kind: "Transaction",
          Transaction: {
            status: { success: true, error: null },
            effects: {
              bcs: new Uint8Array([1, 2, 3]),
              transactionDigest: "simulated-digest",
              gasUsed: { computationCost: "2", storageCost: "3", storageRebate: "1" },
            },
            balanceChanges: [
              { address: sender, coinType: SUI, amount: "-10" },
              { address: recipient, coinType: SUI, amount: "10" },
            ],
          },
        }),
      }),
      transaction: new Uint8Array([1]),
      sender,
      recipient,
      amount: 10n,
    });

    expect(report.success).toBe(true);
    expect(report.gasEstimate).toBe(4n);
    expect(report.recommendation).toBe("proceed");
    expect(report.rawEffects).not.toHaveProperty("bcs");
    expect(() => canonicalize(report)).not.toThrow();
  });

  it("clamps a storage rebate larger than gas without floating point conversion", async () => {
    const report = await simulateSuiTransfer({
      transport: transport({
        simulateTransaction: async () =>
          transaction({ effects: { gasUsed: { computationCost: "900719925474099312345", storageCost: "2", storageRebate: "900719925474099999999" } } }),
      }),
      transaction: new Uint8Array([1]),
      sender,
      recipient,
      amount: 10n,
    });
    expect(report.gasEstimate).toBe(0n);
  });

  it("hard-blocks a failed simulation", async () => {
    const report = await simulateSuiTransfer({
      transport: transport({
        simulateTransaction: async () => transaction({ status: { success: false, error: { message: "reverted" } } }),
      }),
      transaction: new Uint8Array([1]),
      sender,
      recipient,
      amount: 10n,
    });
    expect(report.success).toBe(false);
    expect(report.recommendation).toBe("abort");
    expect(report.risks.some((risk) => risk.code === "SIM_FAILED")).toBe(true);
  });

  it("surfaces simulation timeout and rate-limit failures as retryable structured errors", async () => {
    await expect(
      simulateSuiTransfer({
        transport: transport({ simulateTransaction: async () => { throw new Error("rate limited"); } }),
        transaction: new Uint8Array([1]),
        sender,
        recipient,
        amount: 10n,
      }),
    ).rejects.toMatchObject({ code: "SIMULATION_FAILED", retryable: true });
  });

  it("fails closed on malformed simulation data", async () => {
    await expect(
      simulateSuiTransfer({
        transport: transport({ simulateTransaction: async () => transaction({ balanceChanges: undefined }) }),
        transaction: new Uint8Array([1]),
        sender,
        recipient,
        amount: 10n,
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_RESPONSE_MALFORMED" });
  });

  it("treats unavailable balance as a hard block instead of guessing", async () => {
    await expect(
      simulateSuiTransfer({
        transport: transport({ getBalance: async () => ({ balance: { balance: "unknown" } }) }),
        transaction: new Uint8Array([1]),
        sender,
        recipient,
        amount: 10n,
      }),
    ).rejects.toMatchObject({ code: "BALANCE_UNAVAILABLE" });
  });

  it("detects the exact drain threshold with integer arithmetic", async () => {
    const report = await simulateSuiTransfer({
      transport: transport({
        simulateTransaction: async () => transaction({
          balanceChanges: [{ address: sender, coinType: SUI, amount: "-80" }],
        }),
      }),
      transaction: new Uint8Array([1]),
      sender,
      recipient,
      amount: 80n,
    });
    expect(report.risks.some((risk) => risk.code === "DRAIN_DETECTED")).toBe(true);
    expect(report.recommendation).toBe("abort");
  });

  it("rejects unsupported coins, invalid addresses, and non-u64 amounts", async () => {
    const base = { transport: transport(), transaction: new Uint8Array([1]), sender, recipient, amount: 1n };
    await expect(simulateSuiTransfer({ ...base, coinType: "0x9::other::COIN" })).rejects.toMatchObject({ code: "UNSUPPORTED_COIN" });
    await expect(simulateSuiTransfer({ ...base, sender: "not-an-address" })).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
    await expect(simulateSuiTransfer({ ...base, amount: 18_446_744_073_709_551_616n })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("builds a sender-bound transfer transaction", () => {
    const tx = buildSuiTransferTransaction({ sender, recipient, amount: 7n });
    expect(tx).toBeDefined();
  });

  it("exposes structured errors without leaking secret fields", () => {
    const error = new PraxisSdkError("SIMULATION_FAILED", "simulation failed", { cause: { secret: "hidden" } });
    expect(error).toMatchObject({ code: "SIMULATION_FAILED", message: "simulation failed" });
    expect(JSON.stringify(error)).not.toContain("hidden");
  });
});
