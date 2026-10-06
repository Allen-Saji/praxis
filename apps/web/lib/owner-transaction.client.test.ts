import { describe, expect, it, vi } from "vitest";
import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import { submitOwnerTransaction } from "./owner-transaction.client";
const tx = new Transaction(); const owner = `0x${"1".repeat(64)}`;
tx.setSender(owner); tx.setGasOwner(owner); tx.setGasBudget(1000n); tx.setGasPrice(1); tx.setGasPayment([{ objectId: `0x${"2".repeat(64)}`, version: "1", digest: "11111111111111111111111111111111" }]);
const bytes = new TransactionDataBuilder(tx.getData()).build();
const digest = TransactionDataBuilder.getDigestFromBytes(bytes);
const input = { bytes: toBase64(bytes), signature: "test-signature" };
const success = { $kind: "Transaction", Transaction: { digest, status: { success: true }, effects: { bcs: new Uint8Array([1, 2]) } } };
const transport = () => ({ executeTransaction: vi.fn(), getTransaction: vi.fn().mockRejectedValue(new Error("not indexed")) });
describe("owner transaction submission", () => {
  it("retries a rate limit with identical signed bytes", async () => {
    const rpc = transport(); rpc.executeTransaction.mockRejectedValueOnce(new Error("429")).mockResolvedValueOnce(success);
    expect(await submitOwnerTransaction(input, rpc, vi.fn())).toEqual({ digest, rawEffects: [1, 2] });
    expect(rpc.executeTransaction).toHaveBeenCalledTimes(2);
    expect(rpc.executeTransaction.mock.calls[0]).toEqual(rpc.executeTransaction.mock.calls[1]);
  });
  it("recovers a confirmed transfer after a lost execution response", async () => {
    const rpc = transport(); rpc.executeTransaction.mockRejectedValue(new Error("timeout")); rpc.getTransaction.mockResolvedValue(success);
    expect((await submitOwnerTransaction(input, rpc)).digest).toBe(digest);
    expect(rpc.executeTransaction).toHaveBeenCalledTimes(1);
  });
  it("does not retry a positively failed transaction", async () => {
    const rpc = transport(); rpc.executeTransaction.mockResolvedValue({ ...success, Transaction: { ...success.Transaction, status: { success: false } } });
    await expect(submitOwnerTransaction(input, rpc)).rejects.toThrow("failed on-chain");
    expect(rpc.executeTransaction).toHaveBeenCalledTimes(1);
  });
  it("retains the digest when confirmation cannot be established", async () => {
    const rpc = transport(); rpc.executeTransaction.mockRejectedValue(new Error("429"));
    await expect(submitOwnerTransaction(input, rpc, vi.fn())).rejects.toThrow(`status is unknown: ${digest}`);
    expect(rpc.executeTransaction).toHaveBeenCalledTimes(3);
  });
});
