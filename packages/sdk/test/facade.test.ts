import { describe, expect, it } from "vitest";
import type { Transaction } from "@mysten/sui/transactions";
import { Praxis } from "../src/client";
import type { SuiTransport } from "../src/ports";

const SUI = "0x2::sui::SUI";

function result(overrides: Record<string, unknown> = {}) {
  return {
    $kind: "Transaction",
    Transaction: {
      digest: "digest-1",
      status: { success: true, error: null },
      effects: { gasUsed: { computationCost: "2", storageCost: "3", storageRebate: "1" }, changedObjects: [{ idOperation: "Created", objectId: "0x99" }] },
      balanceChanges: [
        { address: "0xa", coinType: SUI, amount: "-10" },
        { address: "0xb", coinType: SUI, amount: "10" },
      ],
      objectTypes: { "0x99": "0x2::spending_receipt::SpendingReceipt" },
      ...overrides,
    },
  };
}

function transport(): SuiTransport {
  return {
    simulateTransaction: async () => result(),
    executeTransaction: async () => result(),
    getBalance: async () => ({ balance: { balance: "100" } }),
    getObject: async () => ({ object: { type: "0x2::agent_registry::AgentIndex", json: null } }),
  };
}

describe("Praxis public facade compatibility", () => {
  it("keeps simulate and spend usable with an injected transport-neutral client", async () => {
    const wallet = {
      address: async () => "0xA",
      signTransaction: async (_tx: Transaction) => ({ bytes: "AQI=", signature: "sig" }),
    };
    let posted = new Uint8Array();
    const praxis = new Praxis({
      network: "testnet",
      wallet,
      client: transport(),
      deployment: { packageId: "0x2", agentIndexId: "0x3", agentCapId: "0x4", clockId: "0x5" },
      walrus: {
        mode: "hosted",
        publisher: "https://publisher.invalid",
        aggregator: "https://aggregator.invalid",
        fetch: async (input, init) => {
          if (String(input).startsWith("https://publisher.invalid")) {
            posted = new Uint8Array(init?.body as ArrayBuffer);
            return new Response(JSON.stringify({ newlyCreated: { blobObject: { blobId: "blob-1" } } }), { status: 200 });
          }
          return new Response(posted, { status: 200 });
        },
      },
    });

    const report = await praxis.simulate({ to: "0xb", amount: 10n });
    expect(report.success).toBe(true);
    const spend = await praxis.spend({
      to: "0xb",
      amount: 10n,
      autoConfirm: true,
      idempotencyKey: "request-1",
      reasoning: { prompt: "send", decision: "approved", model: "test" },
    });
    expect(spend.status).toBe("confirmed");
    expect(spend.walrusBlobId).toBe("blob-1");
    expect(spend.txDigest).toBe("digest-1");
    await expect(
      praxis.spend({
        to: "0xb",
        amount: 1n,
        privacy: "sealed",
        autoConfirm: true,
        reasoning: { prompt: "send", decision: "approved", model: "test" },
      }),
    ).rejects.toMatchObject({ code: "SEALED_REASONING_NOT_AVAILABLE" });
  });
});
