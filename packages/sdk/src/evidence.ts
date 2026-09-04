import { blake3Hex, canonicalize } from "./canonical";
import { PraxisSdkError } from "./errors";
import type { EvidencePort } from "./ports";

export interface BuiltEvidence<T = unknown> {
  document: T;
  bytes: Uint8Array;
  hash: string;
}

/** Canonicalize evidence once so retries publish byte-identical payloads. */
export function buildReasoningEvidence<T>(document: T): BuiltEvidence<T> {
  const bytes = new TextEncoder().encode(canonicalize(document));
  return { document, bytes, hash: blake3Hex(bytes) };
}

export async function publishEvidence(input: { port: EvidencePort; evidence: BuiltEvidence<unknown>; hosted?: boolean }) {
  const result = await input.port.write(input.evidence.bytes);
  if (!result.blobId || typeof result.blobId !== "string") {
    throw new PraxisSdkError("EVIDENCE_PUBLISH_FAILED", "evidence transport returned no blob ID");
  }
  if (input.hosted && (result.mode === "local" || result.blobId.startsWith("local:"))) {
    throw new PraxisSdkError("LOCAL_EVIDENCE_NOT_ALLOWED", "hosted evidence cannot use local blob IDs");
  }
  let readback: Uint8Array;
  try {
    readback = await input.port.read(result.blobId);
  } catch (cause) {
    throw new PraxisSdkError("EVIDENCE_READBACK_FAILED", "evidence could not be verified after publication", { cause });
  }
  if (blake3Hex(readback) !== input.evidence.hash || (result.hash && result.hash !== input.evidence.hash)) {
    throw new PraxisSdkError("EVIDENCE_READBACK_MISMATCH", "evidence transport returned a different hash");
  }
  return { ...result, hash: input.evidence.hash };
}
