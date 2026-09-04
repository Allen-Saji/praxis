import { describe, expect, it } from "vitest";
import { BIGINT_TAG, DomainError, canonicalJson, hashCanonical, canonicalPolicyJson, hashPolicy as policyHashFromCanonical, purposeTag, toCanonicalPolicyDocument, domainError, isDomainError } from "../src";
import { canonicalPolicyJson as directCanonicalPolicyJson, hashPolicy as directHashPolicy } from "../src/canonical";

describe("canonical domain values", () => {
  it("sorts object keys recursively and distinguishes bigint from strings", () => {
    expect(canonicalJson({ z: { b: 2, a: 1 }, a: ["x", 1n] })).toBe(`{"a":["x",{"${BIGINT_TAG}":"1"}],"z":{"a":1,"b":2}}`);
    expect(hashCanonical({ value: 1n })).not.toBe(hashCanonical({ value: "1" }));
    expect(canonicalJson(Object.create(null))).toBe("{}");
    expect(purposeTag({ organizationId: "o", assignmentId: "a", idempotencyKey: "restart-stable", requestHash: "h" })).toHaveLength(64);
  });

  it("rejects hostile keys, cycles, sparse arrays, and non-JSON values", () => {
    for (const key of ["__proto__", "prototype", "constructor", BIGINT_TAG]) {
      const value = Object.create(null) as Record<string, unknown>;
      Object.defineProperty(value, key, { enumerable: true, value: "hostile" });
      expect(() => canonicalJson(value)).toThrow(DomainError);
    }
    const symbolObject = Object.create(null) as Record<string | symbol, unknown>;
    symbolObject[Symbol("hidden")] = 1;
    expect(() => canonicalJson(symbolObject)).toThrow(DomainError);
    const hiddenObject = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hiddenObject, "hidden", { value: 1, enumerable: false });
    expect(() => canonicalJson(hiddenObject)).toThrow(DomainError);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow(DomainError);
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => canonicalJson(sparse)).toThrow(DomainError);
    const decorated = [] as unknown[] as Record<string, unknown>;
    decorated.extra = "ignored";
    expect(() => canonicalJson(decorated)).toThrow(DomainError);
    const symbolValue = [] as unknown[];
    Object.defineProperty(symbolValue, Symbol("hidden"), { value: 1 });
    expect(() => canonicalJson(symbolValue)).toThrow(DomainError);
    const customArray = [] as unknown[];
    Object.setPrototypeOf(customArray, { marker: true });
    expect(() => canonicalJson(customArray)).toThrow(DomainError);
    for (const value of [undefined, Symbol("x"), () => 1, Number.NaN, Number.POSITIVE_INFINITY, new Date(), new Map()]) {
      expect(() => canonicalJson(value)).toThrow(DomainError);
    }
    const manyRules = { maxPerTxMist: 1n, maxPerDayMist: 2n, maxPerMonthMist: 3n, blockRiskScoreAt: 80, requireSimulation: true, rules: [{ recipient: "0x2", effect: "deny" as const }, { recipient: "0x1", effect: "allow" as const }] };
    expect(() => directCanonicalPolicyJson(manyRules)).not.toThrow();
    expect(directHashPolicy(manyRules)).toHaveLength(64);
    expect(directCanonicalPolicyJson({ ...manyRules, maxPerTxMist: "1" })).toContain('"maxPerTxMist":"1"');
    expect(() => directCanonicalPolicyJson({ ...manyRules, blockRiskScoreAt: 0 })).toThrow(DomainError);
    expect(() => directCanonicalPolicyJson({ ...manyRules, requireSimulation: false })).toThrow(DomainError);
    expect(directCanonicalPolicyJson({ ...manyRules, rules: undefined })).toContain('"rules":[]');
    expect(() => directCanonicalPolicyJson({ ...manyRules, rules: null as never })).toThrow(DomainError);
    expect(() => directCanonicalPolicyJson({ ...manyRules, allowlist: "0x1" as never })).toThrow(DomainError);
    expect(() => directCanonicalPolicyJson({ ...manyRules, maxPerTxMist: "1.0" })).toThrow(DomainError);
    expect(() => directCanonicalPolicyJson({ ...manyRules, maxPerTxMist: (18_446_744_073_709_551_616n) })).toThrow(DomainError);
    expect(() => directCanonicalPolicyJson({ ...manyRules, maxPerTxMist: -1n })).toThrow(DomainError);
    expect(() => directCanonicalPolicyJson({ ...manyRules, rules: [{ recipient: "0x1", effect: "other" as "allow" }] })).toThrow(DomainError);
    expect(() => directCanonicalPolicyJson({ ...manyRules, rules: [{ recipient: 1 as unknown as string, effect: "allow" }] })).toThrow(DomainError);
    expect(() => directCanonicalPolicyJson({ ...manyRules, rules: [{ recipient: "0x1", effect: "allow" }, { recipient: "0x01", effect: "deny" }] })).toThrow(DomainError);
    expect(directCanonicalPolicyJson({ ...manyRules, rules: undefined, allowlist: ["0x1"], denylist: ["0x2"] })).toContain('"rules"');
    expect(policyHashFromCanonical({ ...manyRules, rules: [] })).toHaveLength(64);
    const throwingProxy = new Proxy({}, { getPrototypeOf: () => { throw new Error("provider detail"); } });
    expect(() => canonicalJson(throwingProxy)).toThrow(DomainError);
  });

  it("does not leak throwing getters and emits decimal policy documents", () => {
    const value = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(value, "boom", { enumerable: true, get: () => { throw new Error("provider poison"); } });
    const error = (() => { try { canonicalJson(value); return undefined; } catch (caught) { return caught as DomainError; } })();
    expect(error).toBeInstanceOf(DomainError);
    expect(error?.message).toBe("value cannot be represented canonically");
    expect(JSON.stringify(error)).not.toContain("provider poison");

    const policy = { maxPerTxMist: 1n, maxPerDayMist: "2", maxPerMonthMist: 3n, blockRiskScoreAt: 80, requireSimulation: true, rules: [] };
    const document = toCanonicalPolicyDocument(policy);
    expect(document.maxPerTxMist).toBe("1");
    expect(canonicalPolicyJson(policy)).toContain('"maxPerMonthMist":"3"');
    const cause = { provider: "secret" };
    const domain = domainError("POLICY_BLOCKED", { cause });
    expect(isDomainError(domain)).toBe(true);
    expect(isDomainError(new Error("no"))).toBe(false);
    expect(Object.keys(domain)).not.toContain("cause");
    expect(domain.toJSON()).toEqual({ code: "POLICY_BLOCKED", message: "policy blocks this spend" });
    expect(new DomainError("UNKNOWN_CODE").message).toBe("control-plane request failed");
  });
});
