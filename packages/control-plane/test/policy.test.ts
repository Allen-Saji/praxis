import { describe, expect, it } from "vitest";
import {
  DomainError,
  U64_MAX,
  canonicalPolicyJson,
  evaluateBudget,
  evaluatePolicies,
  hashPolicy,
  normalizePolicy,
  normalizePolicyVersion,
  policyHash,
  policyDocument,
  resolveActivePolicies,
  assertSuiCoinType,
  normalizeSuiAddress,
  parseMist,
  type PolicyInput,
  type PolicyVersionInput,
} from "../src";

const RECIPIENT = "0x1";
const OTHER = "0x2";
const base = (overrides: Partial<PolicyInput> = {}): PolicyInput => ({
  maxPerTxMist: 10n,
  maxPerDayMist: 20n,
  maxPerMonthMist: 30n,
  blockRiskScoreAt: 80,
  requireSimulation: true,
  rules: [],
  ...overrides,
});
const version = (id: string, scopeId: string, policy: PolicyInput = base(), overrides: Partial<PolicyVersionInput> = {}): PolicyVersionInput => ({
  id,
  scopeId,
  version: 1,
  status: "active",
  policy,
  ...overrides,
});
const selection = (scopeId: string, versionId: string, versions: readonly PolicyVersionInput[]) => ({
  scope: { id: scopeId, scopeType: scopeId.startsWith("wallet") ? "wallet" as const : "assignment" as const, currentVersionId: versionId },
  versions,
});

describe("versioned policy domain", () => {
  it("normalizes addresses, decimal limits, and canonical policy hashes", () => {
    const normalized = normalizePolicy(base({ maxPerTxMist: "10", maxPerDayMist: "20", maxPerMonthMist: "30", rules: [{ recipient: "0x01", effect: "allow" }] }));
    expect(normalized.rules[0]?.recipient).toBe(`0x${"0".repeat(63)}1`);
    expect(policyDocument(normalized).maxPerTxMist).toBe("10");
    expect(policyHash(normalized)).toBe(hashPolicy(normalized));
  });

  it("enforces both policy rule sets with deny precedence and independent budgets", () => {
    const wallet = base({ maxPerTxMist: 100n, maxPerDayMist: 100n, maxPerMonthMist: 100n });
    const assignment = base({ maxPerTxMist: 50n, maxPerDayMist: 60n, maxPerMonthMist: 70n, rules: [{ recipient: RECIPIENT, effect: "allow" }] });
    expect(evaluatePolicies(wallet, assignment, RECIPIENT, 50n).allowed).toBe(true);
    expect(evaluatePolicies(wallet, assignment, OTHER, 50n).code).toBe("RECIPIENT_NOT_ALLOWED");
    const denied = evaluatePolicies(wallet, { ...assignment, rules: [{ recipient: RECIPIENT, effect: "allow" }, { recipient: OTHER, effect: "deny" }] }, OTHER, 1n);
    expect(denied.code).toBe("BLOCKED_RECIPIENT");
    expect(evaluatePolicies(wallet, assignment, RECIPIENT, 51n).code).toBe("OVER_TX_LIMIT");
    expect(evaluatePolicies(wallet, assignment, RECIPIENT, 10n, {
      wallet: { day: { spentMist: 89n, reservedMist: 1n }, month: { spentMist: 89n, reservedMist: 1n } },
      assignmentDaySpentMist: 49n,
      assignmentDayReservedMist: 1n,
      assignmentMonthSpentMist: 59n,
      assignmentMonthReservedMist: 1n,
    }).allowed).toBe(true);
    expect(evaluatePolicies(wallet, assignment, RECIPIENT, 11n, {
      walletDay: { spentMist: 89n, reservedMist: 1n },
      walletMonth: { spentMist: 89n, reservedMist: 1n },
      assignmentDay: { spentMist: 49n, reservedMist: 1n },
      assignmentMonth: { spentMist: 59n, reservedMist: 1n },
    }).violations.map((v) => v.code)).toEqual(expect.arrayContaining(["WALLET_DAY_BUDGET_EXCEEDED", "ASSIGNMENT_DAY_BUDGET_EXCEEDED"]));
  });

  it("accepts exact budget boundaries and rejects one mist above them", () => {
    const p = base({ maxPerTxMist: U64_MAX, maxPerDayMist: U64_MAX, maxPerMonthMist: U64_MAX });
    expect(evaluateBudget(p, U64_MAX, undefined, "wallet").allowed).toBe(true);
    expect(evaluateBudget(p, 1n, { walletDay: { spentMist: U64_MAX - 1n, reservedMist: 0n }, walletMonth: { spentMist: U64_MAX - 1n, reservedMist: 0n } }, "wallet").allowed).toBe(true);
    expect(evaluateBudget(p, 2n, { walletDay: { spentMist: U64_MAX - 1n, reservedMist: 0n }, walletMonth: { spentMist: U64_MAX - 1n, reservedMist: 0n } }, "wallet").allowed).toBe(false);
  });

  it("resolves only pointed-to active versions and snapshots both policies", () => {
    const wallet = version("wallet-v1", "wallet-scope");
    const assignment = version("assignment-v1", "assignment-scope");
    const resolved = resolveActivePolicies({ wallet: selection("wallet-scope", wallet.id, [wallet]), assignment: selection("assignment-scope", assignment.id, [assignment]) });
    expect(resolved.snapshot.wallet).toMatchObject({ versionId: wallet.id, policyHash: resolved.wallet.policyHash, policy: resolved.wallet.document });
    expect(resolved.snapshot.assignment).toMatchObject({ versionId: assignment.id, policyHash: resolved.assignment.policyHash, policy: resolved.assignment.document });
    expect(resolved.snapshotJson).toContain(wallet.id);
    expect(resolved.snapshotJson).toContain(assignment.id);
    expect(resolved.snapshot.effectivePolicyHash).toBe(policyHash(resolved.effective));
    expect(resolveActivePolicies({ walletScope: { id: "wallet-scope", scopeType: "wallet", currentVersionId: wallet.id }, assignmentScope: { id: "assignment-scope", scopeType: "assignment", currentVersionId: assignment.id }, versions: [wallet, assignment] }).snapshot.wallet.versionId).toBe(wallet.id);
    expect(resolveActivePolicies({ walletPolicy: wallet, assignmentPolicy: assignment }).snapshot.assignment.versionId).toBe(assignment.id);
    expect(resolveActivePolicies({
      wallet: selection("wallet-scope", wallet.id, [version(wallet.id, "wallet-scope", base({ maxPerTxMist: 5n, maxPerDayMist: 6n, maxPerMonthMist: 7n }))]),
      assignment: selection("assignment-scope", assignment.id, [version(assignment.id, "assignment-scope", base({ maxPerTxMist: 10n, maxPerDayMist: 20n, maxPerMonthMist: 30n }))]),
    }).effective.maxPerTxMist).toBe(5n);
    expect(resolveActivePolicies({
      wallet: selection("wallet-scope", wallet.id, [version(wallet.id, "wallet-scope", base({ maxPerTxMist: 10n, maxPerDayMist: 20n, maxPerMonthMist: 30n }))]),
      assignment: selection("assignment-scope", assignment.id, [version(assignment.id, "assignment-scope", base({ maxPerTxMist: 5n, maxPerDayMist: 6n, maxPerMonthMist: 7n }))]),
    }).effective.maxPerTxMist).toBe(5n);
    const sameAllow = resolveActivePolicies({
      wallet: selection("wallet-scope", wallet.id, [version(wallet.id, "wallet-scope", base({ rules: [{ recipient: RECIPIENT, effect: "allow" }] }))]),
      assignment: selection("assignment-scope", assignment.id, [version(assignment.id, "assignment-scope", base({ rules: [{ recipient: RECIPIENT, effect: "allow" }] }))]),
    });
    expect(sameAllow.effective.rules).toHaveLength(1);
    const denyWins = resolveActivePolicies({
      wallet: selection("wallet-scope", wallet.id, [version(wallet.id, "wallet-scope", base({ rules: [{ recipient: RECIPIENT, effect: "allow" }] }))]),
      assignment: selection("assignment-scope", assignment.id, [version(assignment.id, "assignment-scope", base({ rules: [{ recipient: RECIPIENT, effect: "deny" }] }))]),
    });
    expect(denyWins.effective.rules[0]?.effect).toBe("deny");
    for (const bad of [
      { ...wallet, status: "draft" as const },
      { ...wallet, status: "superseded" as const },
    ]) {
      expect(() => resolveActivePolicies({ wallet: selection("wallet-scope", bad.id, [bad]), assignment: selection("assignment-scope", assignment.id, [assignment]) })).toThrow(DomainError);
    }
    expect(() => resolveActivePolicies({ wallet: { ...selection("wallet-scope", "missing", [wallet]) }, assignment: selection("assignment-scope", assignment.id, [assignment]) })).toThrow(DomainError);
    expect(() => resolveActivePolicies(undefined as unknown as never)).toThrow(DomainError);
  });

  it("validates stored policy documents and hashes", () => {
    const raw = version("wallet-v1", "wallet-scope");
    const valid = normalizePolicyVersion({ ...raw, canonicalJson: raw.policy ? canonicalPolicyJson(raw.policy) : undefined, policyHash: raw.policy ? policyHash(raw.policy) : undefined });
    expect(valid.policyHash).toHaveLength(64);
    expect(() => normalizePolicyVersion({ ...raw, policyHash: "f".repeat(64) })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, canonicalJson: JSON.stringify({ nope: true }) })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, canonicalJson: raw.policy ? canonicalPolicyJson({ ...raw.policy, maxPerTxMist: 9n }) : undefined })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, id: "", version: 0 })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, status: "invalid" as "active" })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, policy: undefined, canonicalJson: "{" })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, policy: undefined, canonicalJson: [] })).toThrow(DomainError);
    const document = policyDocument(base());
    expect(normalizePolicyVersion({ ...raw, policy: undefined, canonicalJson: document }).canonicalJson).toBe(canonicalPolicyJson(base()));
    expect(() => normalizePolicyVersion({ ...raw, canonicalJson: { ...document, extra: true } })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, canonicalJson: { ...document, rules: [{ recipient: RECIPIENT, effect: "allow", extra: true }] } })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, canonicalJson: { ...document, maxPerTxMist: 1 } })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, canonicalJson: { ...document, rules: [null] } })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, canonicalJson: { ...document, rules: [[]] } })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, canonicalJson: { ...document, requireSimulation: false } })).toThrow(DomainError);
    expect(() => normalizePolicyVersion({ ...raw, policyDocument: { ...document, maxPerTxMist: "9" } })).toThrow(DomainError);
  });

  it("rejects missing and mismatched scope pointers", () => {
    const wallet = version("wallet-v1", "wallet-scope");
    const assignment = version("assignment-v1", "assignment-scope");
    const validAssignment = selection("assignment-scope", assignment.id, [assignment]);
    expect(() => resolveActivePolicies({ wallet: { scope: { id: "wallet-scope", scopeType: "assignment", currentVersionId: wallet.id }, versions: [wallet] }, assignment: validAssignment })).toThrow(DomainError);
    expect(() => resolveActivePolicies({ wallet: { scope: { id: "wallet-scope", scopeType: "wallet", currentVersionId: wallet.id }, versions: [{ ...wallet, scopeId: "other" }] }, assignment: validAssignment })).toThrow(DomainError);
    expect(() => resolveActivePolicies({ wallet: { scope: { id: "wallet-scope", scopeType: "wallet", currentVersionId: null }, versions: [wallet] }, assignment: validAssignment })).toThrow(DomainError);
    expect(() => resolveActivePolicies({ wallet: { scope: { id: "wallet-scope", scopeType: "wallet", currentVersionId: wallet.id }, versions: [wallet, wallet] }, assignment: validAssignment })).toThrow(DomainError);
    expect(() => resolveActivePolicies({})).toThrow(DomainError);
  });

  it("keeps strict amount, coin, and address boundaries at the domain edge", () => {
    expect(parseMist("1")).toBe(1n);
    for (const value of ["", " 1", "+1", "1.0", "1e3", "01", "-1", 1, null, undefined]) expect(() => parseMist(value)).toThrow(DomainError);
    expect(normalizeSuiAddress("0xA")).toBe(`0x${"0".repeat(63)}a`);
    for (const value of ["0X1", "1", "0x", "0x1 ", " 0x1", "0xgg", "0x" + "a".repeat(65)]) expect(() => normalizeSuiAddress(value)).toThrow(DomainError);
    expect(assertSuiCoinType("0x2::sui::SUI")).toBe("0x2::sui::SUI");
    for (const value of ["0x2::sui::SUI ", "0x2::sui::sui", "0x2::sui::USDC", undefined]) expect(() => assertSuiCoinType(value)).toThrow(DomainError);
  });

  it("rejects invalid policy settings and normalized duplicates", () => {
    for (const invalid of [
      base({ maxPerTxMist: 0n }),
      base({ maxPerDayMist: 9n }),
      base({ maxPerMonthMist: 9n }),
      base({ maxPerTxMist: U64_MAX + 1n }),
      base({ blockRiskScoreAt: 0 }),
      base({ blockRiskScoreAt: 101 }),
      base({ blockRiskScoreAt: 1.2 }),
      base({ requireSimulation: false }),
      base({ rules: null as never }),
      base({ rules: [{ recipient: RECIPIENT, effect: "allow" }, { recipient: "0x01", effect: "deny" }] }),
      base({ rules: [{ recipient: "not-an-address", effect: "allow" }] }),
      base({ maxPerTxMist: "-1" }),
      base({ maxPerTxMist: "1.0" }),
    ]) expect(() => normalizePolicy(invalid)).toThrow(DomainError);
    expect(normalizePolicy({ ...base(), rules: undefined }).rules).toEqual([]);
    expect(() => evaluateBudget(base(), "bad", undefined, "wallet")).toThrow(DomainError);
    expect(() => evaluateBudget(base(), 1n, { walletDay: { spentMist: "bad", reservedMist: 0n } }, "wallet")).toThrow(DomainError);
    expect(() => evaluateBudget(base(), 1n, { walletDay: { spentMist: -1n, reservedMist: 0n } }, "wallet")).toThrow(DomainError);
    expect(() => evaluateBudget(base(), 1n, { walletDay: { spentMist: 1 as never, reservedMist: 0n } }, "wallet")).toThrow(DomainError);
    expect(() => evaluateBudget(base(), 1n, { walletDay: { spentMist: U64_MAX + 1n, reservedMist: 0n } }, "wallet")).toThrow(DomainError);
    expect(() => evaluateBudget(base(), 0n, undefined, "wallet")).toThrow(DomainError);
    expect(() => evaluateBudget(base(), U64_MAX + 1n, undefined, "wallet")).toThrow(DomainError);
    expect(() => evaluatePolicies(base(), base(), RECIPIENT, "1")).not.toThrow();
    expect(() => evaluatePolicies(base(), base(), RECIPIENT, -1n)).toThrow(DomainError);
    expect(() => evaluateBudget(base(), 1n, { wallet: { day: {} as never } }, "wallet")).not.toThrow();
    expect(() => evaluateBudget(base(), 1n, { walletDay: { spentMist: "0", reservedMist: "0" }, walletMonth: { spentMist: "0", reservedMist: "0" } }, "wallet")).not.toThrow();
  });
});
