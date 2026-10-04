import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TransactionDataBuilder } from "@mysten/sui/transactions";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import { buildVaultSpend } from "./vault";
import { TestnetDelegateStore } from "./node-delegate";
const a = (digit: string) => `0x${digit.repeat(64)}`;
const scope = { organizationId: "org", assignmentId: "assignment", packageId: a("1"), vaultId: a("2"), agent: a("3") };
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "praxis-signer-test-"));
  const options = { directory, masterKey: new Uint8Array(32).fill(7), packageId: scope.packageId, maxGas: 1000n };
  return { directory, options, signer: new TestnetDelegateStore(options) };
}
describe("isolated Testnet delegate storage", () => {
  it("signs only a payment bound to its stored delegate and vault", async () => {
    const { signer } = await setup();
    const { address } = await signer.provision(scope);
    const request = { ...scope, delegate: address, recipient: a("4"), amount: 1n, sequence: 0n, vaultVersion: 0n, grantVersion: 0n, evidence: "reference" };
    const tx = buildVaultSpend(request);
    tx.setGasOwner(address); tx.setGasBudget(1000n); tx.setGasPrice(1);
    tx.setGasPayment([{ objectId: a("5"), version: "1", digest: "11111111111111111111111111111111" }]);
    const data = new TransactionDataBuilder(tx.getData());
    for (const i of [0, 8]) {
      const objectId = data.inputs[i]!.UnresolvedObject!.objectId;
      data.inputs[i] = { $kind: "Object", Object: { $kind: "SharedObject", SharedObject: { objectId, initialSharedVersion: "1", mutable: i === 0 } } };
    }
    const bytes = data.build();
    const signature = await signer.sign(scope, request, bytes);
    expect((await verifyTransactionSignature(bytes, signature)).toSuiAddress()).toBe(address);
    await expect(signer.sign(scope, { ...request, vaultId: a("9") }, bytes)).rejects.toThrow("scope");
    await expect(signer.sign(scope, { ...request, amount: 2n }, bytes)).rejects.toThrow("changed");
  });
  it("converges concurrent provisioners and survives a new process instance", async () => {
    const { signer, options, directory } = await setup();
    const [first, second] = await Promise.all([signer.provision(scope), signer.provision(scope)]);
    expect(first).toEqual(second);
    expect(await new TestnetDelegateStore(options).provision(scope)).toEqual(first);
    expect(await signer.provision({ ...scope, assignmentId: "another" })).not.toEqual(first);
    for (const name of await readdir(directory)) expect((await readFile(join(directory, name))).includes(Buffer.from("suiprivkey"))).toBe(false);
  });
  it("fails closed on a wrong master key or tampered encrypted record", async () => {
    const { signer, options, directory } = await setup();
    await signer.provision(scope);
    await expect(new TestnetDelegateStore({ ...options, masterKey: new Uint8Array(32).fill(8) }).provision(scope)).rejects.toThrow();
    const file = (await readdir(directory)).find((name) => name.endsWith(".key"))!;
    const encrypted = await readFile(join(directory, file));
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1;
    await writeFile(join(directory, file), encrypted);
    await expect(signer.provision(scope)).rejects.toThrow();
  });
  it("rejects package changes and malformed encryption configuration", async () => {
    const { signer, options } = await setup();
    await expect(signer.provision({ ...scope, packageId: a("9") })).rejects.toThrow("not allowed");
    expect(() => new TestnetDelegateStore({ ...options, masterKey: new Uint8Array(16) })).toThrow();
  });
});
