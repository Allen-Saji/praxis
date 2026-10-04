import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createVaultSignerServer } from "./vault-signer-http";
const token = "test-service-token-".repeat(3);
const scope = { organizationId: "org", assignmentId: "assignment", packageId: "0x1", vaultId: "0x2", agent: "0x3" };
test("signer authenticates callers and does not return exception details", async () => {
  let provisions = 0;
  const server = createVaultSignerServer({ address: async () => ({ address: "0x4" }), provision: async () => { provisions += 1; return { address: "0x4" }; }, sign: async () => { throw new Error("private/path/secret-detail"); } }, token);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const endpoint = server.address(); if (!endpoint || typeof endpoint === "string") throw new Error("No port");
  const base = `http://127.0.0.1:${endpoint.port}`;
  try {
    const send = (path: string, body: unknown, authenticated = true) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await send("/provision", { scope }, false)).status, 401);
    assert.equal(provisions, 0);
    assert.equal((await send("/provision", { scope, extra: true })).status, 400);
    const provision = await send("/provision", { scope });
    assert.equal(provision.status, 200); assert.deepEqual(await provision.json(), { address: "0x4" });
    const result = await send("/sign", { scope, bytes: "AQI=", payment: { packageId: "0x1", vaultId: "0x2", delegate: "0x4", agent: "0x3", recipient: "0x5", amount: "1", sequence: "0", vaultVersion: "0", grantVersion: "0", evidence: "ref" } });
    assert.equal(result.status, 400); assert.deepEqual(await result.json(), { error: "Signer rejected the request" });
    assert.equal((await send("/sign", { scope, bytes: "x".repeat(70000) })).status, 400);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
