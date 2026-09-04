import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { blake3Hex, canonicalize } from "./canonical";
import { PraxisSdkError } from "./errors";

export interface WalrusStoreOptions {
  publisher: string;
  aggregator: string;
  epochs?: number;
  /** Direct/demo mode may use a local fallback for offline demos. */
  localFallbackDir?: string;
  mode?: "direct" | "hosted";
  timeoutMs?: number;
  maxBodyBytes?: number;
  fetch?: typeof fetch;
}

export interface WriteResult {
  blobId: string;
  mode: "walrus" | "local";
  hash: string;
}

export const LOCAL_EVIDENCE_PREFIX = "local:";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BODY_BYTES = 512 * 1024;

/**
 * Evidence transport for Walrus. Hosted mode is fail-closed: a publisher or
 * readback failure is surfaced and never replaced by a local blob ID.
 */
export class WalrusStore {
  private readonly mode: "direct" | "hosted";
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: WalrusStoreOptions) {
    this.mode = opts.mode ?? "direct";
    this.fetchFn = opts.fetch ?? fetch;
  }

  get hosted(): boolean {
    return this.mode === "hosted";
  }

  async writeJson(value: unknown): Promise<WriteResult> {
    return this.write(new TextEncoder().encode(canonicalize(value)));
  }

  async write(body: Uint8Array): Promise<WriteResult> {
    const bytes = new Uint8Array(body);
    const hash = blake3Hex(bytes);
    this.assertSize(bytes);
    try {
      const epochs = this.opts.epochs ?? 3;
      const response = await this.request(`${trimSlash(this.opts.publisher)}/v1/blobs?epochs=${encodeURIComponent(String(epochs))}`, {
        method: "PUT",
        body: bytes as unknown as BodyInit,
      }, "publish");
      if (!response.ok) throw new PraxisSdkError("EVIDENCE_PUBLISH_FAILED", "Walrus publisher rejected evidence", { retryable: response.status >= 500 || response.status === 429 });
      const blobId = await decodeBlobId(response, this.maxBodyBytes());
      const readback = await this.read(blobId);
      if (blake3Hex(readback) !== hash) throw new PraxisSdkError("EVIDENCE_READBACK_MISMATCH", "Walrus evidence readback failed integrity verification");
      return { blobId, mode: "walrus", hash };
    } catch (error) {
      if (this.mode === "hosted") {
        if (error instanceof PraxisSdkError) throw error;
        throw new PraxisSdkError("EVIDENCE_PUBLISH_FAILED", "Walrus evidence publication failed", { cause: error, retryable: true });
      }
      const blobId = `${LOCAL_EVIDENCE_PREFIX}${hash}`;
      const dir = this.opts.localFallbackDir ?? ".praxis/blobs";
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${hash}.json`), bytes);
      return { blobId, mode: "local", hash };
    }
  }

  async readJson<T = unknown>(blobId: string): Promise<T> {
    const bytes = await this.read(blobId);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch (cause) {
      throw new PraxisSdkError("EVIDENCE_READBACK_FAILED", "Walrus evidence is not valid JSON", { cause });
    }
  }

  async read(blobId: string): Promise<Uint8Array> {
    if (!blobId || typeof blobId !== "string") throw new PraxisSdkError("EVIDENCE_READBACK_FAILED", "Walrus blob ID is missing");
    if (blobId.startsWith(LOCAL_EVIDENCE_PREFIX)) {
      if (this.mode === "hosted") throw new PraxisSdkError("LOCAL_EVIDENCE_NOT_ALLOWED", "hosted evidence cannot use local blob IDs");
      const hash = blobId.slice(LOCAL_EVIDENCE_PREFIX.length);
      if (!/^[a-f0-9]{64}$/i.test(hash)) throw new PraxisSdkError("EVIDENCE_READBACK_FAILED", "local evidence blob ID is malformed");
      const dir = this.opts.localFallbackDir ?? ".praxis/blobs";
      try {
        const data = new Uint8Array(await readFile(join(dir, `${hash}.json`)));
        this.assertSize(data);
        if (blake3Hex(data) !== hash) throw new PraxisSdkError("EVIDENCE_READBACK_MISMATCH", "local evidence failed integrity verification");
        return data;
      } catch (error) {
        if (error instanceof PraxisSdkError) throw error;
        throw new PraxisSdkError("EVIDENCE_READBACK_FAILED", "local evidence could not be read", { cause: error });
      }
    }
    try {
      const response = await this.request(`${trimSlash(this.opts.aggregator)}/v1/blobs/${encodeURIComponent(blobId)}`, undefined, "read");
      if (!response.ok) throw new PraxisSdkError("EVIDENCE_READBACK_FAILED", "Walrus aggregator rejected evidence", { retryable: response.status >= 500 || response.status === 429 });
      const data = await readResponseBytes(response, this.maxBodyBytes());
      this.assertSize(data);
      return data;
    } catch (error) {
      if (error instanceof PraxisSdkError) throw error;
      throw new PraxisSdkError("EVIDENCE_READBACK_FAILED", "Walrus evidence could not be read", { cause: error, retryable: true });
    }
  }

  private assertSize(body: Uint8Array): void {
    if (body.byteLength > this.maxBodyBytes()) throw new PraxisSdkError("EVIDENCE_TOO_LARGE", "evidence exceeds the configured size limit");
  }

  private maxBodyBytes(): number {
    const max = this.opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    if (!Number.isSafeInteger(max) || max <= 0) throw new PraxisSdkError("CONFIGURATION_ERROR", "Walrus body limit must be positive");
    return max;
  }

  private async request(input: RequestInfo | URL, init: RequestInit | undefined, operation: "publish" | "read"): Promise<Response> {
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new PraxisSdkError("CONFIGURATION_ERROR", "Walrus timeout must be positive");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchFn(input, { ...init, signal: controller.signal });
    } catch (cause) {
      throw new PraxisSdkError(operation === "publish" ? "EVIDENCE_TIMEOUT" : "EVIDENCE_READBACK_FAILED", `Walrus ${operation} request failed`, { cause, retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}

async function decodeBlobId(response: Response, maxBodyBytes: number): Promise<string> {
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(await readResponseBytes(response, maxBodyBytes)));
  } catch (cause) {
    if (cause instanceof PraxisSdkError) throw cause;
    throw new PraxisSdkError("EVIDENCE_PUBLISH_FAILED", "Walrus publisher returned malformed JSON", { cause });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PraxisSdkError("EVIDENCE_PUBLISH_FAILED", "Walrus publisher response is malformed");
  const value = body as Record<string, unknown>;
  const newlyCreated = value.newlyCreated;
  const alreadyCertified = value.alreadyCertified;
  const blobId = newlyCreated && typeof newlyCreated === "object" && !Array.isArray(newlyCreated) && "blobObject" in newlyCreated
    ? (newlyCreated as Record<string, unknown>).blobObject && typeof (newlyCreated as Record<string, unknown>).blobObject === "object"
      ? ((newlyCreated as Record<string, unknown>).blobObject as Record<string, unknown>).blobId
      : undefined
    : alreadyCertified && typeof alreadyCertified === "object" && !Array.isArray(alreadyCertified)
      ? (alreadyCertified as Record<string, unknown>).blobId
      : undefined;
  if (typeof blobId !== "string" || !blobId || blobId.startsWith(LOCAL_EVIDENCE_PREFIX)) throw new PraxisSdkError("EVIDENCE_PUBLISH_FAILED", "Walrus publisher did not return a valid blob ID");
  return blobId;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function readResponseBytes(response: Response, maxBodyBytes: number): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBodyBytes) {
      throw new PraxisSdkError("EVIDENCE_TOO_LARGE", "Walrus response exceeds the configured size limit");
    }
  }
  if (!response.body) throw new PraxisSdkError("EVIDENCE_READBACK_FAILED", "Walrus response has no readable body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        throw new PraxisSdkError("EVIDENCE_TOO_LARGE", "Walrus response exceeds the configured size limit");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
