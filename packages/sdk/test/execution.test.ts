import { describe, expect, it } from "vitest";
import type { Transaction } from "@mysten/sui/transactions";
import { executeApprovedSuiSpend, recordBlockedSuiIntent } from "../src/execution";
import type { SignerPort, SuiTransport } from "../src/ports";

const deployment = {
  packageId: "0x2",
  agentIndexId: "0x3",
  agentCapId: "0x4",
  clockId: "0x5",
};
const purposeTag = "a".repeat(64);

function result(overrides: Record<string, unknown> = {}) {
  return {
    $kind: "Transaction",
    Transaction: {
      digest: "digest-1",
      status: { success: true, error: null },
      effects: { changedObjects: [{ idOperation: "Created", objectId: "0x99" }] },
      objectTypes: { "0x99": "0x2::spending_receipt::SpendingReceipt" },
      ...overrides,
    },
  };
}

function signer(): SignerPort {
  return {
    signTransaction: async (_transaction: Transaction) => ({ bytes: "AQI=", signature: "sig" }),
  };
}

function transport(overrides: Partial<SuiTransport> = {}): SuiTransport {
  return {
    simulateTransaction: async () => result(),
    executeTransaction: async () => result(),
    getBalance: async () => ({ balance: { balance: "100" } }),
    getObject: async () => ({ object: { type: "0x2::x::X", json: null } }),
    ...overrides,
  };
}

const spend = {
  transport: transport(),
  signer: signer(),
  deployment,
  agent: "0xa",
  recipient: "0xb",
  amount: 10n,
  coinType: "0x2::sui::SUI",
  blobId: "walrus-1",
  sealPolicyId: "",
  riskScore: 4,
  simulationPassed: true,
  purposeTag,
};

describe("transport-neutral execution services", () => {
  it("executes an approved spend and decodes its receipt object", async () => {
    await expect(executeApprovedSuiSpend(spend)).resolves.toEqual({ digest: "digest-1", receiptId: "0x99" });
  });

  it("records blocked intent without requiring an approved spend", async () => {
    await expect(
      recordBlockedSuiIntent({
        transport: transport(),
        signer: signer(),
        deployment,
        agent: "0xa",
        recipient: "0xb",
        amount: 10n,
        blobId: "walrus-1",
        reason: "policy_block",
        riskScore: 95,
      }),
    ).resolves.toEqual({ digest: "digest-1" });
    const abortError = await recordBlockedSuiIntent({
      transport: transport({
        executeTransaction: async () => result({ status: { success: false, error: { message: "private abort details" } } }),
      }),
      signer: signer(),
      deployment,
      agent: "0xa",
      recipient: "0xb",
      amount: 10n,
      blobId: "walrus-1",
      reason: "policy_block",
      riskScore: 95,
    }).catch((error: unknown) => error as { code: string; message: string; cause?: unknown });
    expect(abortError).toMatchObject({ code: "TRANSACTION_FAILED", message: "blocked-intent recording transaction failed" });
    expect(abortError.cause).toBe("private abort details");
    expect(JSON.stringify(abortError)).not.toContain("private abort details");
    await expect(
      recordBlockedSuiIntent({
        transport: transport({ executeTransaction: async () => result({ status: { success: false, error: { message: "abort log reverted" } } }) }),
        signer: signer(),
        deployment,
        agent: "0xa",
        recipient: "0xb",
        amount: 10n,
        blobId: "walrus-1",
        reason: "policy_block",
        riskScore: 95,
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_FAILED" });
  });

  it("surfaces explicit on-chain failures and malformed responses", async () => {
    const spendError = await executeApprovedSuiSpend({
      ...spend,
      transport: transport({
        executeTransaction: async () => result({ status: { success: false, error: { message: "secret provider stack" } } }),
      }),
    }).catch((error: unknown) => error as { code: string; message: string; cause?: unknown });
    expect(spendError).toMatchObject({ code: "TRANSACTION_FAILED", message: "approved spend transaction failed", txDigest: expect.any(String) });
    expect(spendError.cause).toBe("secret provider stack");
    expect(JSON.stringify(spendError)).not.toContain("secret provider stack");
    await expect(
      executeApprovedSuiSpend({
        ...spend,
        transport: transport({
          executeTransaction: async () => result({ status: { success: false, error: { message: "reverted" } } }),
        }),
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_FAILED" });
    await expect(
      executeApprovedSuiSpend({ ...spend, transport: transport({ executeTransaction: async () => ({ nope: true }) }) }),
    ).rejects.toMatchObject({ code: "TRANSACTION_SUBMISSION_UNKNOWN", txDigest: expect.any(String) });
    await expect(
      executeApprovedSuiSpend({
        ...spend,
        transport: transport({ executeTransaction: async () => result({ effects: { changedObjects: [] } }) }),
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_SUBMISSION_UNKNOWN", txDigest: expect.any(String) });
    await expect(
      executeApprovedSuiSpend({
        ...spend,
        transport: transport({
          executeTransaction: async () => result({
            objectTypes: { "0x99": "0x2::spending_receipt::SpendingReceiptExtra" },
          }),
        }),
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_SUBMISSION_UNKNOWN", txDigest: expect.any(String) });
  });

  it("distinguishes unknown submission from an explicit transaction failure", async () => {
    await expect(
      executeApprovedSuiSpend({
        ...spend,
        transport: transport({ executeTransaction: async () => { throw new Error("timeout"); } }),
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_SUBMISSION_UNKNOWN" });
    await expect(
      executeApprovedSuiSpend({
        ...spend,
        signer: { signTransaction: async () => ({ bytes: "not-base64", signature: "sig" }) },
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_RESPONSE_MALFORMED" });
    await expect(
      recordBlockedSuiIntent({
        transport: transport(),
        signer: { signTransaction: async () => ({ bytes: "not-base64", signature: "sig" }) },
        deployment,
        agent: "0xa",
        recipient: "0xb",
        amount: 10n,
        blobId: "walrus-1",
        reason: "policy_block",
        riskScore: 95,
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_RESPONSE_MALFORMED" });
  });

  it("validates addresses, amounts, coin type, and purpose tag before signing", async () => {
    await expect(executeApprovedSuiSpend({ ...spend, amount: 0n })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(executeApprovedSuiSpend({ ...spend, recipient: "0xzz" })).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
    await expect(executeApprovedSuiSpend({ ...spend, coinType: "0x9::coin::COIN" })).rejects.toMatchObject({ code: "UNSUPPORTED_COIN" });
    await expect(executeApprovedSuiSpend({ ...spend, purposeTag: "short" })).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
  });
});
