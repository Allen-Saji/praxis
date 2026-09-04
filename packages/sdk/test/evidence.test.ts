import { describe, expect, it } from "vitest";
import { blake3Hex, canonicalize, stablePurposeTag } from "../src/canonical";
import { buildReasoningEvidence } from "../src/evidence";

describe("canonical evidence and purpose tags", () => {
  it("produces byte-identical evidence regardless of object insertion order", () => {
    const first = buildReasoningEvidence({ b: 2, a: 1, nested: { z: true, c: [3, 2, 1] } });
    const second = buildReasoningEvidence({ nested: { c: [3, 2, 1], z: true }, a: 1, b: 2 });
    expect(first.bytes).toEqual(second.bytes);
    expect(first.hash).toBe(second.hash);
    expect(first.hash).toBe(blake3Hex(first.bytes));
    expect(new TextDecoder().decode(first.bytes)).toBe(canonicalize(first.document));
  });

  it("derives a stable purpose tag from the replay identity, excluding wall-clock time", () => {
    const input = {
      organizationId: "org-1",
      assignmentId: "assignment-1",
      idempotencyKey: "request-1",
      requestHash: "a".repeat(64),
    };
    const first = stablePurposeTag(input);
    const second = stablePurposeTag({ ...input });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });

  it("rejects prototype-polluting keys and values that JSON.stringify would silently coerce", () => {
    const dangerous = JSON.parse('{"nested":[{"constructor":{"prototype":{"polluted":true}}}]}');
    expect(() => canonicalize(dangerous)).toThrow(/forbidden key/);
    expect(() => canonicalize({ value: undefined })).toThrow();
    expect(() => canonicalize({ value: Number.NaN })).toThrow();
    expect(() => canonicalize({ value: Infinity })).toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalize(circular)).toThrow(/circular/);
    const bigint = canonicalize({ amount: 18_446_744_073_709_551_615n });
    expect(bigint).toBe('{"amount":{"$praxis_bigint":"18446744073709551615"}}');
    expect(bigint).not.toBe(canonicalize({ amount: "18446744073709551615" }));
    expect(() => canonicalize({ $praxis_bigint: "1" })).toThrow(/forbidden key/);
  });
});
