import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { blake3Hex } from "./canonical";

export interface WalrusStoreOptions {
  publisher: string;
  aggregator: string;
  epochs?: number;
  localFallbackDir?: string;
}

export interface WriteResult {
  blobId: string;
  /** "walrus" when written to the network, "local" when the fallback kicked in. */
  mode: "walrus" | "local";
}

const LOCAL_PREFIX = "local:";

/**
 * Reasoning-blob store. Primary path is the public Walrus testnet publisher
 * (no WAL tokens required on the client). If the network is unreachable it
 * falls back to a local file so a flaky testnet never blocks the spend flow
 * (SPEC risk R1).
 */
export class WalrusStore {
  constructor(private opts: WalrusStoreOptions) {}

  async writeJson(value: unknown): Promise<WriteResult> {
    return this.write(new TextEncoder().encode(JSON.stringify(value)));
  }

  async write(body: Uint8Array): Promise<WriteResult> {
    const epochs = this.opts.epochs ?? 3;
    try {
      const res = await fetch(`${this.opts.publisher}/v1/blobs?epochs=${epochs}`, {
        method: "PUT",
        body: body as unknown as BodyInit,
      });
      if (!res.ok) throw new Error(`walrus publisher returned ${res.status}`);
      const json = (await res.json()) as WalrusPublishResponse;
      const blobId = json.newlyCreated?.blobObject?.blobId ?? json.alreadyCertified?.blobId;
      if (!blobId) throw new Error("walrus: no blobId in publisher response");
      return { blobId, mode: "walrus" };
    } catch {
      const blobId = `${LOCAL_PREFIX}${blake3Hex(body)}`;
      const dir = this.opts.localFallbackDir ?? ".praxis/blobs";
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${blobId.slice(LOCAL_PREFIX.length)}.json`), body);
      return { blobId, mode: "local" };
    }
  }

  async readJson<T = unknown>(blobId: string): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await this.read(blobId))) as T;
  }

  async read(blobId: string): Promise<Uint8Array> {
    if (blobId.startsWith(LOCAL_PREFIX)) {
      const dir = this.opts.localFallbackDir ?? ".praxis/blobs";
      const data = await readFile(join(dir, `${blobId.slice(LOCAL_PREFIX.length)}.json`));
      return new Uint8Array(data);
    }
    const res = await fetch(`${this.opts.aggregator}/v1/blobs/${blobId}`);
    if (!res.ok) throw new Error(`walrus aggregator returned ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

interface WalrusPublishResponse {
  newlyCreated?: { blobObject?: { blobId?: string } };
  alreadyCertified?: { blobId?: string };
}
