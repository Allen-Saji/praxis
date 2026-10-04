import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { DelegateScope, TestnetDelegateStore } from "@allen-saji/praxis/testnet-signer";
import type { VaultSpend } from "@allen-saji/praxis";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 1024) throw new Error("Invalid text");
  return value;
}
function exact(value: Record<string, unknown>, names: string[]) {
  if (Object.keys(value).length !== names.length || names.some((name) => !(name in value))) throw new Error("Unexpected fields");
}
function scope(value: unknown): DelegateScope {
  const row = object(value);
  exact(row, ["organizationId", "assignmentId", "packageId", "vaultId", "agent"]);
  return { organizationId: text(row.organizationId), assignmentId: text(row.assignmentId), packageId: text(row.packageId), vaultId: text(row.vaultId), agent: text(row.agent) };
}
function u64(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > 18_446_744_073_709_551_615n) throw new Error("Invalid integer");
  return BigInt(value);
}
function payment(value: unknown): VaultSpend {
  const row = object(value);
  exact(row, ["packageId", "vaultId", "delegate", "agent", "recipient", "amount", "sequence", "vaultVersion", "grantVersion", "evidence"]);
  return { packageId: text(row.packageId), vaultId: text(row.vaultId), delegate: text(row.delegate), agent: text(row.agent), recipient: text(row.recipient), amount: u64(row.amount), sequence: u64(row.sequence), vaultVersion: u64(row.vaultVersion), grantVersion: u64(row.grantVersion), evidence: text(row.evidence) };
}
async function body(request: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const data = Buffer.from(chunk); size += data.length;
    if (size > 65536) throw new Error("Request too large");
    chunks.push(data);
  }
  return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}

/** Bind to loopback; use an authenticated TLS reverse proxy for remote access.
 * Token belongs only to the web backend, never browsers or agent credentials. */
export function createVaultSignerServer(store: Pick<TestnetDelegateStore, "provision" | "address" | "sign">, token: string) {
  if (Buffer.byteLength(token) < 32) throw new Error("Signer service token must contain at least 32 bytes");
  const expected = createHash("sha256").update(`Bearer ${token}`).digest();
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    const finish = (status: number, result: unknown) => { response.statusCode = status; response.end(JSON.stringify(result)); };
    const received = createHash("sha256").update(request.headers.authorization ?? "").digest();
    if (!timingSafeEqual(expected, received)) return finish(401, { error: "Unauthorized" });
    if (request.method !== "POST" || !["/provision", "/address", "/sign"].includes(request.url ?? "")) return finish(404, { error: "Not found" });
    if (request.headers["content-type"] !== "application/json") return finish(415, { error: "JSON required" });
    try {
      const row = await body(request);
      if (request.url === "/provision" || request.url === "/address") {
        exact(row, ["scope"]);
        return finish(200, await (request.url === "/address" ? store.address(scope(row.scope)) : store.provision(scope(row.scope))));
      }
      exact(row, ["scope", "payment", "bytes"]);
      if (typeof row.bytes !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(row.bytes) || row.bytes.length % 4 !== 0) throw new Error("Invalid transaction encoding");
      const bytes = Buffer.from(row.bytes, "base64");
      const signature = await store.sign(scope(row.scope), payment(row.payment), bytes);
      return finish(200, { signature });
    } catch {
      // Deliberately exclude key-store paths, request bodies and exception text.
      return finish(400, { error: "Signer rejected the request" });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 32;
  return server;
}
