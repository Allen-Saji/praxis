import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TransactionDataBuilder } from "@mysten/sui/transactions";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import { buildVaultSpend } from "@allen-saji/praxis";

const a = (digit: string) => `0x${digit.repeat(64)}`;
const scope = { organizationId: "test-org", assignmentId: "test-assignment", packageId: a("1"), vaultId: a("2"), agent: a("3") };

test("isolated signer preserves its identity across process restarts and rejects changed payments", { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "praxis-signer-process-"));
  const token = randomBytes(32).toString("base64");
  const master = randomBytes(32).toString("base64");
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const address = listener.address(); if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((done) => listener.close(() => done()));
  async function start(masterKey = master) {
    const child = spawn(process.execPath, ["--import", "tsx", resolve("scripts/vault-signer.ts")], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(port), RAILWAY_ENVIRONMENT_ID: "", PRAXIS_SIGNER_HOST: "127.0.0.1", PRAXIS_SIGNER_NETWORK: "testnet", PRAXIS_SIGNER_DIRECTORY: directory, PRAXIS_SIGNER_MASTER_KEY: masterKey, PRAXIS_SIGNER_TOKEN: token, PRAXIS_SIGNER_MAX_GAS_MIST: "1000", PRAXIS_SIGNER_PORT: String(port), PRAXIS_VAULT_PACKAGE_ID: scope.packageId } });
    // Process output is never included in assertions: it must not leak secrets.
    child.stderr.resume();
    await new Promise<void>((done, reject) => {
      const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Signer start timeout")); }, 10000);
      child.once("error", () => { clearTimeout(timeout); reject(new Error("Signer start failed")); });
      child.once("exit", () => { clearTimeout(timeout); reject(new Error("Signer exited before readiness")); });
      child.stdout.on("data", (data: Buffer) => { if (data.toString().includes("signer listening on")) { clearTimeout(timeout); done(); } });
    });
    return async () => { const stopped = once(child, "exit"); child.kill("SIGTERM"); await stopped; };
  }
  const base = `http://127.0.0.1:${port}`;
  const send = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value), signal: AbortSignal.timeout(5000) });
  let stop = await start();
  try {
    assert.equal((await fetch(base + "/health")).status, 401);
    assert.deepEqual(await (await fetch(base + "/readyz")).json(), { status: "ok" });
    const health = await fetch(base + "/health", { headers: { Authorization: `Bearer ${token}` } });
    assert.deepEqual(await health.json(), { status: "ok", network: "testnet" });
    assert.equal((await send("/address", { scope })).status, 400);
    const provision = await send("/provision", { scope }); assert.equal(provision.status, 200);
    const delegate = (await provision.json() as { address: string }).address;
    const payment = { packageId: scope.packageId, vaultId: scope.vaultId, agent: scope.agent, delegate, recipient: a("4"), amount: 1n, sequence: 0n, vaultVersion: 0n, grantVersion: 0n, evidence: "offline-process-test" };
    const tx = buildVaultSpend(payment); tx.setGasOwner(delegate); tx.setGasBudget(1000n); tx.setGasPrice(1);
    tx.setGasPayment([{ objectId: a("5"), version: "1", digest: "11111111111111111111111111111111" }]);
    const data = new TransactionDataBuilder(tx.getData());
    for (const i of [0, 8]) { const objectId = data.inputs[i]!.UnresolvedObject!.objectId; data.inputs[i] = { $kind: "Object", Object: { $kind: "SharedObject", SharedObject: { objectId, initialSharedVersion: "1", mutable: i === 0 } } }; }
    const bytes = data.build(); const encoded = Buffer.from(bytes).toString("base64");
    async function verify() {
      const response = await send("/sign", { scope, payment, bytes: encoded }); assert.equal(response.status, 200);
      const signature = (await response.json() as { signature: string }).signature;
      assert.equal((await verifyTransactionSignature(bytes, signature)).toSuiAddress(), delegate);
    }
    await verify();
    assert.equal((await send("/sign", { scope, payment: { ...payment, amount: 2n }, bytes: encoded })).status, 400);
    assert.equal((await send("/sign", { scope: { ...scope, assignmentId: "other" }, payment, bytes: encoded })).status, 400);
    await stop(); stop = await start();
    assert.deepEqual(await (await send("/address", { scope })).json(), { address: delegate });
    await verify();
    await stop(); stop = await start(randomBytes(32).toString("base64"));
    assert.equal((await send("/address", { scope })).status, 400);
  } finally { await stop(); }
});
