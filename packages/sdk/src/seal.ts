import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface SealedBlob {
  sealed: true;
  /** Identity bytes for the seal policy (hash of the auditor allowlist). */
  policyId: string;
  scheme: "local-aes-256-gcm";
  auditors: string[];
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface Sealer {
  seal(plaintext: Uint8Array, auditors: string[]): Promise<SealedBlob>;
  reveal(blob: SealedBlob, viewer: string): Promise<Uint8Array>;
}

/**
 * Local stand-in for Seal threshold encryption. AES-256-GCM under a key derived
 * from the auditor allowlist, so the dashboard decrypt flow is fully
 * demonstrable without live testnet key servers. The on-chain receipt and
 * Walrus blob shapes are identical to the real-Seal path, so swapping in
 * `SealClient` later is drop-in (SPEC risk R2).
 */
export class LocalSealer implements Sealer {
  constructor(private masterSecret: string) {}

  private keyFor(auditors: string[]): Buffer {
    const allowlist = normalize(auditors).join(",");
    return createHash("sha256").update(`${this.masterSecret}|${allowlist}`).digest();
  }

  async seal(plaintext: Uint8Array, auditors: string[]): Promise<SealedBlob> {
    const key = this.keyFor(auditors);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const policyId = createHash("sha256").update(normalize(auditors).join(",")).digest("hex").slice(0, 32);
    return {
      sealed: true,
      policyId,
      scheme: "local-aes-256-gcm",
      auditors,
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    };
  }

  async reveal(blob: SealedBlob, viewer: string): Promise<Uint8Array> {
    if (!normalize(blob.auditors).includes(viewer.toLowerCase())) {
      throw new Error("viewer is not in the auditor allowlist");
    }
    const key = this.keyFor(blob.auditors);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
    decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(blob.ciphertext, "base64")),
      decipher.final(),
    ]);
    return new Uint8Array(plaintext);
  }
}

function normalize(addrs: string[]): string[] {
  return [...addrs].map((a) => a.toLowerCase()).sort();
}
