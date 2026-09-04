import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Transaction } from "@mysten/sui/transactions";
import type { EvidencePort, SignerPort, SuiTransport } from "@allen-saji/praxis";
import { DEPLOYMENTS } from "@allen-saji/praxis";
import { createActivePolicies, createFixture, openDb, type Fixture } from "../../../packages/db/test/support";
import { assignments } from "../../../packages/db/src/schema";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));

let fixture: Fixture;
const opened: ReturnType<typeof openDb>[] = [];

beforeAll(async () => {
  const connection = openDb();
  opened.push(connection);
  fixture = await createFixture(connection.db, crypto.randomUUID().slice(0, 8));
  await createActivePolicies(connection.db, fixture, { maxPerTxMist: 10n, maxPerDayMist: 30n, maxPerMonthMist: 30n });
});

afterAll(async () => { await Promise.all(opened.map(({ client }) => client.end())); });

function runtime(overrides: Partial<SuiTransport> = {}, evidenceOverride?: EvidencePort) {
  const transaction = (receipt = true) => ({ $kind: "Transaction", Transaction: { digest: `digest-${crypto.randomUUID()}`, status: { success: true, error: null }, effects: { gasUsed: { computationCost: "2", storageCost: "3", storageRebate: "1" }, changedObjects: receipt ? [{ idOperation: "Created", objectId: "0x99" }] : [] }, objectTypes: receipt ? { "0x99": `${DEPLOYMENTS.testnet.packageId}::spending_receipt::SpendingReceipt` } : {}, balanceChanges: [{ address: "0x2", coinType: "0x2::sui::SUI", amount: "-1" }, { address: "0x3", coinType: "0x2::sui::SUI", amount: "1" }] } });
  const transport: SuiTransport = { simulateTransaction: async () => transaction(false), executeTransaction: async () => transaction(true), getBalance: async () => ({ balance: { balance: "100" } }), getObject: async () => ({}), waitForTransaction: async ({ digest }) => ({ digest }), ...overrides };
  const signer: SignerPort = { signTransaction: async (_transaction: Transaction) => ({ bytes: "AQI=", signature: "sig" }) };
  let bytes: Uint8Array<ArrayBufferLike> = new Uint8Array();
  const evidence: EvidencePort = evidenceOverride ?? { write: async (body) => { bytes = body; return { blobId: `blob-${crypto.randomUUID()}`, mode: "walrus" }; }, read: async () => bytes };
  return { transport, signer, evidence };
}

function context(value = fixture) {
  return { organization: { id: value.organizationId }, wallet: { id: value.walletId, suiAddress: "0x2" }, agent: { id: value.agentId }, assignment: { id: value.assignmentId }, credential: { id: value.credentialId } };
}

function request() {
  return { recipient: "0x3", amountMist: "1", coinType: "0x2::sui::SUI" as const, reasoning: { prompt: "Pay approved vendor", decision: "Invoice is valid", model: "test-model" }, privacy: "public" as const };
}

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("hosted spend orchestration", () => {
  it("confirms once and returns the same intent on an idempotent replay", async () => {
    const { createAndProcessSpend } = await import("./spend.server");
    const key = `confirm-${crypto.randomUUID()}`;
    const first = await createAndProcessSpend({ context: context(), idempotencyKey: key, request: request(), runtime: runtime() });
    expect(first.intent.state).toBe("confirmed");
    const replay = await createAndProcessSpend({ context: context(), idempotencyKey: key, request: request(), runtime: runtime() });
    expect(replay.kind).toBe("existing");
    expect(replay.intent.id).toBe(first.intent.id);
    const changed = await createAndProcessSpend({ context: context(), idempotencyKey: key, request: { ...request(), amountMist: "2" }, runtime: runtime() });
    expect(changed.kind).toBe("conflict");
  });

  it("keeps an allowed intent unsigned while evidence publication is unavailable", async () => {
    const { createAndProcessSpend } = await import("./spend.server");
    let signed = false;
    const value = runtime({}, { write: async () => { throw new Error("offline"); }, read: async () => new Uint8Array() });
    value.signer = { signTransaction: async () => { signed = true; throw new Error("must not sign"); } };
    const result = await createAndProcessSpend({ context: context(), idempotencyKey: `evidence-${crypto.randomUUID()}`, request: request(), runtime: value });
    expect(result.intent.state).toBe("evidence_pending");
    expect(signed).toBe(false);
  });

  it("retains reservation and lease when submission becomes unknown", async () => {
    const { createAndProcessSpend } = await import("./spend.server");
    const result = await createAndProcessSpend({ context: context(), idempotencyKey: `unknown-${crypto.randomUUID()}`, request: request(), runtime: runtime({ executeTransaction: async () => { throw new Error("disconnect"); } }) });
    expect(result.intent.state).toBe("submission_unknown");
  });

  it("blocks a drain before spend signing and records the protected outcome", async () => {
    const { createAndProcessSpend } = await import("./spend.server");
    const value = runtime({ getBalance: async () => ({ balance: { balance: "1" } }) });
    const result = await createAndProcessSpend({ context: context(), idempotencyKey: `drain-${crypto.randomUUID()}`, request: request(), runtime: value });
    expect(result.intent.state).toBe("blocked");
    expect(result.intent.outcome).toBe("blocked");
  });

  it("releases reserved budget after a definite pre-submission signer failure", async () => {
    const { createAndProcessSpend } = await import("./spend.server");
    const connection = opened[0]!;
    const isolated = await createFixture(connection.db, crypto.randomUUID().slice(0, 8));
    await createActivePolicies(connection.db, isolated, { maxPerTxMist: 10n, maxPerDayMist: 30n, maxPerMonthMist: 30n });
    const value = runtime();
    value.signer = { signTransaction: async () => { throw new Error("signer unavailable"); } };
    const result = await createAndProcessSpend({ context: context(isolated), idempotencyKey: `signer-${crypto.randomUUID()}`, request: request(), runtime: value });
    expect(result.intent.state).toBe("failed");
    expect(result.intent.failureCode).toBe("TRANSACTION_FAILED");
  });

  it("uses the failed transaction digest to settle an explicit on-chain failure", async () => {
    const { createAndProcessSpend } = await import("./spend.server");
    const connection = opened[0]!;
    const isolated = await createFixture(connection.db, crypto.randomUUID().slice(0, 8));
    await createActivePolicies(connection.db, isolated, { maxPerTxMist: 10n, maxPerDayMist: 30n, maxPerMonthMist: 30n });
    const result = await createAndProcessSpend({
      context: context(isolated),
      idempotencyKey: `chain-failure-${crypto.randomUUID()}`,
      request: request(),
      runtime: runtime({
        executeTransaction: async () => ({
          $kind: "Transaction",
          Transaction: { digest: `failed-${crypto.randomUUID()}`, status: { success: false, error: { message: "Move abort" } }, effects: {}, objectTypes: {} },
        }),
      }),
    });
    expect(result.intent.state).toBe("failed");
    expect(result.intent.failureCode).toBe("TRANSACTION_FAILED");
    expect(result.intent.txDigest).toMatch(/^failed-/);
  });

  it("releases the reservation without signing when identity changes before signing", async () => {
    const { createAndProcessSpend } = await import("./spend.server");
    const connection = opened[0]!;
    const isolated = await createFixture(connection.db, crypto.randomUUID().slice(0, 8));
    await createActivePolicies(connection.db, isolated, { maxPerTxMist: 10n, maxPerDayMist: 30n, maxPerMonthMist: 30n });
    let evidenceBytes = new Uint8Array();
    let signed = false;
    const value = runtime({}, {
      write: async (body) => {
        evidenceBytes = new Uint8Array(body);
        await connection.db.update(assignments).set({ status: "disabled" }).where(eq(assignments.id, isolated.assignmentId));
        return { blobId: `blob-${crypto.randomUUID()}`, mode: "walrus" };
      },
      read: async () => evidenceBytes,
    });
    value.signer = { signTransaction: async () => { signed = true; throw new Error("must not sign"); } };
    const result = await createAndProcessSpend({ context: context(isolated), idempotencyKey: `presign-${crypto.randomUUID()}`, request: request(), runtime: value });
    expect(result.intent.state).toBe("failed");
    expect(result.intent.failureCode).toBe("PRESIGN_REVALIDATION_FAILED");
    expect(signed).toBe(false);
  });

  it("keeps a blocked audit record pending when indexed visibility is unavailable", async () => {
    const { createAndProcessSpend } = await import("./spend.server");
    const result = await createAndProcessSpend({
      context: context(),
      idempotencyKey: `abort-pending-${crypto.randomUUID()}`,
      request: request(),
      runtime: runtime({
        getBalance: async () => ({ balance: { balance: "1" } }),
        waitForTransaction: async () => { throw new Error("index unavailable"); },
      }),
    });
    expect(result.intent.state).toBe("abort_record_pending");
    expect(result.intent.txDigest).toBeTruthy();
  });

  it("persists static per-transaction blocks without simulation or transfer", async () => {
    const { createAndProcessSpend } = await import("./spend.server");
    let simulated = false;
    const value = runtime({ simulateTransaction: async () => { simulated = true; throw new Error("must not simulate"); } });
    const result = await createAndProcessSpend({ context: context(), idempotencyKey: `limit-${crypto.randomUUID()}`, request: { ...request(), amountMist: "11" }, runtime: value });
    expect(result.intent.state).toBe("blocked");
    expect(simulated).toBe(false);
  });
});
