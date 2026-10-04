import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { normalizeSuiAddressStrict } from "./address";
import { validateVaultTransaction } from "./vault-execution";
import type { VaultSpend } from "./vault";

export interface DelegateScope { organizationId: string; assignmentId: string; packageId: string; vaultId: string; agent: string }

/** Node-only Testnet key storage prototype. Run in a separate signer process.
 * It is not a production custody provider or a general transaction-signing API.
 * Keep masterKey outside the encrypted directory and out of web/runtime secrets.
 * Deploying this class does not itself provide network authentication or TLS. */
export class TestnetDelegateStore {
  private readonly masterKey: Buffer;
  private readonly packageId: string;
  constructor(private readonly options: { directory: string; masterKey: Uint8Array; packageId: string; maxGas: bigint }) {
    if (options.masterKey.byteLength !== 32) throw new Error("Signer encryption requires a 32-byte key");
    if (options.maxGas <= 0n || options.maxGas > 18_446_744_073_709_551_615n) throw new Error("Invalid signer gas ceiling");
    this.masterKey = Buffer.from(options.masterKey);
    this.packageId = normalizeSuiAddressStrict(options.packageId);
    if (BigInt(this.packageId) === 0n) throw new Error("Signer requires a published Testnet vault package");
  }

  private binding(scope: DelegateScope) {
    if (!scope.organizationId || !scope.assignmentId || scope.organizationId.length > 128 || scope.assignmentId.length > 128) throw new Error("Invalid delegate scope");
    if (normalizeSuiAddressStrict(scope.packageId) !== this.packageId) throw new Error("Signer package is not allowed");
    return JSON.stringify(["praxis-testnet-delegate-v1", scope.organizationId, scope.assignmentId, this.packageId, normalizeSuiAddressStrict(scope.vaultId), normalizeSuiAddressStrict(scope.agent)]);
  }

  private file(binding: string) { return join(this.options.directory, `${createHash("sha256").update(binding).digest("hex")}.key`); }

  private async read(binding: string): Promise<Ed25519Keypair> {
    const file = await open(this.file(binding), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077) !== 0) throw new Error("Signer key file permissions or size are invalid");
      const payload = await file.readFile();
      if (payload.length < 29 || payload[0] !== 1) throw new Error("Invalid encrypted delegate envelope");
      const decipher = createDecipheriv("aes-256-gcm", this.masterKey, payload.subarray(1, 13));
      decipher.setAAD(Buffer.from(binding));
      decipher.setAuthTag(payload.subarray(13, 29));
      const secret = Buffer.concat([decipher.update(payload.subarray(29)), decipher.final()]);
      try { return Ed25519Keypair.fromSecretKey(secret.toString("utf8")); }
      finally { secret.fill(0); }
    } finally { await file.close(); }
  }

  async provision(scope: DelegateScope): Promise<{ address: string }> {
    const binding = this.binding(scope);
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    try { return { address: (await this.read(binding)).toSuiAddress() }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const key = Ed25519Keypair.generate();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, iv);
    cipher.setAAD(Buffer.from(binding));
    const secret = Buffer.from(key.getSecretKey(), "utf8");
    let encrypted: Buffer;
    try { encrypted = Buffer.concat([cipher.update(secret), cipher.final()]); }
    finally { secret.fill(0); }
    const payload = Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
    // Publish a fully fsynced file atomically. Concurrent provisioners converge
    // on the winner; no caller receives an address before durable publication.
    const temporary = `${this.file(binding)}.${randomBytes(12).toString("hex")}`;
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(payload); await file.sync(); }
    finally { await file.close(); }
    const { link } = await import("node:fs/promises");
    try { await link(temporary, this.file(binding)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const directory = await open(this.options.directory, constants.O_RDONLY | constants.O_DIRECTORY);
    try { await directory.sync(); } finally { await directory.close(); }
    // Temporary encrypted files are retained for operator-controlled cleanup.
    return { address: (await this.read(binding)).toSuiAddress() };
  }

  async sign(scope: DelegateScope, request: VaultSpend, bytes: Uint8Array): Promise<string> {
    const binding = this.binding(scope);
    if (normalizeSuiAddressStrict(request.packageId) !== this.packageId || normalizeSuiAddressStrict(request.vaultId) !== normalizeSuiAddressStrict(scope.vaultId) || normalizeSuiAddressStrict(request.agent) !== normalizeSuiAddressStrict(scope.agent)) throw new Error("Payment does not match delegate scope");
    const copy = Uint8Array.from(bytes);
    validateVaultTransaction(copy, request, this.options.maxGas);
    const key = await this.read(binding);
    if (key.toSuiAddress() !== normalizeSuiAddressStrict(request.delegate)) throw new Error("Payment delegate does not match stored key");
    return (await key.signTransaction(copy)).signature;
  }
}
