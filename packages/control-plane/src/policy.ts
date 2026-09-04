import { canonicalJson, hashCanonical, toCanonicalPolicyDocument, type CanonicalPolicyDocument, type PolicyRuleDocument } from "./canonical";
import { DomainError } from "./errors";
import { normalizeSuiAddress, parseMist, U64_MAX } from "./validation";

export type RecipientEffect = "allow" | "deny";
export type RecipientRule = { recipient: string; effect: RecipientEffect };
export type PolicyValue = bigint | string;

export type PolicyInput = {
  maxPerTxMist: PolicyValue;
  maxPerDayMist: PolicyValue;
  maxPerMonthMist: PolicyValue;
  blockRiskScoreAt: number;
  requireSimulation: boolean;
  rules?: readonly RecipientRule[];
  allowlist?: readonly string[];
  denylist?: readonly string[];
  allowedRecipients?: readonly string[];
  deniedRecipients?: readonly string[];
};

export type Policy = {
  maxPerTxMist: bigint;
  maxPerDayMist: bigint;
  maxPerMonthMist: bigint;
  blockRiskScoreAt: number;
  requireSimulation: true;
  rules: RecipientRule[];
};

function policyLimit(value: PolicyValue): bigint {
  if (typeof value === "bigint") {
    if (value < 0n || value > U64_MAX) throw new DomainError("INVALID_POLICY", "policy limits must fit in u64");
    return value;
  }
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new DomainError("INVALID_POLICY", "policy limits must be canonical decimal values");
  }
  const result = BigInt(value);
  if (result > U64_MAX) throw new DomainError("INVALID_POLICY", "policy limits must fit in u64");
  return result;
}

export function normalizePolicy(input: PolicyInput): Policy {
  if (!input) throw new DomainError("INVALID_POLICY", "policy is required");
  for (const list of [input.rules, input.allowlist, input.denylist, input.allowedRecipients, input.deniedRecipients]) {
    if (list !== undefined && !Array.isArray(list)) throw new DomainError("INVALID_POLICY", "policy lists are invalid");
  }
  const rules = input.rules ?? [
    ...(input.allowlist ?? input.allowedRecipients ?? []).map((recipient) => ({ recipient, effect: "allow" as const })),
    ...(input.denylist ?? input.deniedRecipients ?? []).map((recipient) => ({ recipient, effect: "deny" as const })),
  ];
  if (!Array.isArray(rules)) throw new DomainError("INVALID_POLICY", "policy rules are required");
  const maxPerTxMist = policyLimit(input.maxPerTxMist);
  const maxPerDayMist = policyLimit(input.maxPerDayMist);
  const maxPerMonthMist = policyLimit(input.maxPerMonthMist);
  if (maxPerTxMist <= 0n || maxPerDayMist < maxPerTxMist || maxPerMonthMist < maxPerDayMist) {
    throw new DomainError("INVALID_POLICY", "policy limits must be positive and ordered");
  }
  if (!Number.isInteger(input.blockRiskScoreAt) || input.blockRiskScoreAt < 1 || input.blockRiskScoreAt > 100) {
    throw new DomainError("INVALID_POLICY", "risk threshold must be 1 through 100");
  }
  if (input.requireSimulation !== true) throw new DomainError("INVALID_POLICY", "simulation is required in Phase 1");
  const seen = new Set<string>();
  const normalizedRules = rules.map((rule) => {
    if (!rule || typeof rule.recipient !== "string" || (rule.effect !== "allow" && rule.effect !== "deny")) {
      throw new DomainError("INVALID_POLICY", "recipient rule is invalid");
    }
    const recipient = normalizeSuiAddress(rule.recipient);
    if (seen.has(recipient)) throw new DomainError("INVALID_POLICY", "recipient rules must be unique after normalization");
    seen.add(recipient);
    return { recipient, effect: rule.effect };
  });
  return { maxPerTxMist, maxPerDayMist, maxPerMonthMist, blockRiskScoreAt: input.blockRiskScoreAt, requireSimulation: true, rules: normalizedRules };
}

export const validatePolicy = normalizePolicy;
export const canonicalizePolicy = policyDocument;

export function policyDocument(policy: PolicyInput): CanonicalPolicyDocument {
  const normalized = normalizePolicy(policy);
  return toCanonicalPolicyDocument({ ...normalized, rules: normalized.rules });
}

export const canonicalPolicyDocument = policyDocument;
export function canonicalPolicyJson(policy: PolicyInput): string {
  return canonicalJson(policyDocument(policy));
}
export function policyHash(policy: PolicyInput): string {
  return hashCanonical(policyDocument(policy));
}
export const hashPolicy = policyHash;

export type PolicyVersionStatus = "draft" | "active" | "superseded";

export type PolicyVersionInput = {
  id: string;
  scopeId: string;
  version: number;
  status: PolicyVersionStatus;
  policy?: PolicyInput;
  policyDocument?: unknown;
  canonicalJson?: unknown;
  policyHash?: string;
};

export type PolicyVersion = Omit<PolicyVersionInput, "policy" | "canonicalJson" | "policyHash"> & {
  policy: Policy;
  canonicalJson: string;
  policyHash: string;
  document: CanonicalPolicyDocument;
};

function parseStoredDocument(value: unknown): PolicyInput {
  let decoded: unknown = value;
  if (typeof value === "string") {
    try {
      decoded = JSON.parse(value) as unknown;
    } catch (error) {
      throw new DomainError("POLICY_DOCUMENT_MISMATCH", undefined, { cause: error });
    }
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new DomainError("POLICY_DOCUMENT_MISMATCH");
  }
  const record = decoded as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ["blockRiskScoreAt", "maxPerDayMist", "maxPerMonthMist", "maxPerTxMist", "requireSimulation", "rules"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new DomainError("POLICY_DOCUMENT_MISMATCH");
  }
  if (typeof record.maxPerTxMist !== "string" || typeof record.maxPerDayMist !== "string" || typeof record.maxPerMonthMist !== "string") {
    throw new DomainError("POLICY_DOCUMENT_MISMATCH");
  }
  if (!Array.isArray(record.rules)) throw new DomainError("POLICY_DOCUMENT_MISMATCH");
  for (const rule of record.rules) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new DomainError("POLICY_DOCUMENT_MISMATCH");
    const ruleKeys = Object.keys(rule as Record<string, unknown>).sort();
    if (ruleKeys.length !== 2 || ruleKeys[0] !== "effect" || ruleKeys[1] !== "recipient") throw new DomainError("POLICY_DOCUMENT_MISMATCH");
  }
  return {
    maxPerTxMist: record.maxPerTxMist,
    maxPerDayMist: record.maxPerDayMist,
    maxPerMonthMist: record.maxPerMonthMist,
    blockRiskScoreAt: record.blockRiskScoreAt as number,
    requireSimulation: record.requireSimulation as boolean,
    rules: record.rules as PolicyRuleDocument[],
  };
}

export function normalizePolicyVersion(input: PolicyVersionInput): PolicyVersion {
  if (!input || typeof input.id !== "string" || input.id.length === 0 || typeof input.scopeId !== "string" || input.scopeId.length === 0 || !Number.isInteger(input.version) || input.version < 1) {
    throw new DomainError("INVALID_POLICY_VERSION");
  }
  if (input.status !== "draft" && input.status !== "active" && input.status !== "superseded") {
    throw new DomainError("INVALID_POLICY_VERSION");
  }
  const policy = normalizePolicy(input.policy ?? (input.policyDocument as PolicyInput | undefined) ?? parseStoredDocument(input.canonicalJson));
  const document = policyDocument(policy);
  const canonical = canonicalJson(document);
  if (input.policy !== undefined && input.policyDocument !== undefined) {
    const documentPolicy = normalizePolicy(input.policyDocument as PolicyInput);
    if (canonicalJson(policyDocument(documentPolicy)) !== canonical) throw new DomainError("POLICY_DOCUMENT_MISMATCH");
  }
  if (input.canonicalJson !== undefined) {
    const supplied = typeof input.canonicalJson === "string" ? input.canonicalJson : canonicalJson(input.canonicalJson);
    if (supplied !== canonical) throw new DomainError("POLICY_DOCUMENT_MISMATCH");
  }
  const computedHash = hashCanonical(document);
  if (input.policyHash !== undefined && (!/^[0-9a-f]{64}$/.test(input.policyHash) || input.policyHash !== computedHash)) {
    throw new DomainError("POLICY_HASH_MISMATCH");
  }
  return { id: input.id, scopeId: input.scopeId, version: input.version, status: input.status, policy, canonicalJson: canonical, policyHash: computedHash, document };
}

export type PolicyScopeRef = {
  id: string;
  scopeType: "wallet" | "assignment";
  walletId?: string;
  assignmentId?: string;
  currentVersionId?: string | null;
};

export type PolicySelection = { scope: PolicyScopeRef; versions: readonly PolicyVersionInput[] };

export type PolicySnapshotEntry = {
  versionId: string;
  version: number;
  policyHash: string;
  policy: CanonicalPolicyDocument;
};

export type PolicySnapshot = {
  wallet: PolicySnapshotEntry;
  assignment: PolicySnapshotEntry;
  effectivePolicyHash: string;
};

export type ResolvedPolicies = {
  wallet: PolicyVersion;
  assignment: PolicyVersion;
  effective: Policy;
  snapshot: PolicySnapshot;
  snapshotJson: string;
};

export type ResolveActivePoliciesInput = {
  wallet?: PolicySelection;
  assignment?: PolicySelection;
  walletScope?: PolicyScopeRef;
  assignmentScope?: PolicyScopeRef;
  versions?: readonly PolicyVersionInput[];
  walletVersions?: readonly PolicyVersionInput[];
  assignmentVersions?: readonly PolicyVersionInput[];
  walletPolicy?: PolicyVersionInput;
  assignmentPolicy?: PolicyVersionInput;
};

function activeVersion(selection: PolicySelection, expected: "wallet" | "assignment"): PolicyVersion {
  if (!selection || !selection.scope || !Array.isArray(selection.versions)) throw new DomainError("NO_ACTIVE_POLICY");
  if (selection.scope.scopeType !== expected || !selection.scope.currentVersionId) throw new DomainError("NO_ACTIVE_POLICY");
  const candidates = selection.versions.filter((version) => version.scopeId === selection.scope.id).map(normalizePolicyVersion);
  const identifiers = new Set<string>();
  for (const candidate of candidates) {
    if (identifiers.has(candidate.id) || candidates.some((other) => other !== candidate && other.version === candidate.version)) throw new DomainError("INVALID_POLICY_VERSION");
    identifiers.add(candidate.id);
  }
  const selected = candidates.find((version) => version.id === selection.scope.currentVersionId);
  if (!selected || selected.status !== "active") throw new DomainError("NO_ACTIVE_POLICY");
  return selected;
}

function snapshotEntry(version: PolicyVersion): PolicySnapshotEntry {
  return { versionId: version.id, version: version.version, policyHash: version.policyHash, policy: version.document };
}

function selectionsOf(input: ResolveActivePoliciesInput): { wallet: PolicySelection; assignment: PolicySelection } {
  if (input.wallet && input.assignment) return { wallet: input.wallet, assignment: input.assignment };
  if (input.walletScope && input.assignmentScope) {
    const all = input.versions ?? [];
    return {
      wallet: { scope: input.walletScope, versions: input.walletVersions ?? all },
      assignment: { scope: input.assignmentScope, versions: input.assignmentVersions ?? all },
    };
  }
  if (input.walletPolicy && input.assignmentPolicy) {
    return {
      wallet: { scope: { id: input.walletPolicy.scopeId, scopeType: "wallet", currentVersionId: input.walletPolicy.id }, versions: [input.walletPolicy] },
      assignment: { scope: { id: input.assignmentPolicy.scopeId, scopeType: "assignment", currentVersionId: input.assignmentPolicy.id }, versions: [input.assignmentPolicy] },
    };
  }
  throw new DomainError("NO_ACTIVE_POLICY");
}

export function resolveActivePolicies(input: ResolveActivePoliciesInput): ResolvedPolicies {
  if (!input) throw new DomainError("NO_ACTIVE_POLICY");
  const selections = selectionsOf(input);
  const wallet = activeVersion(selections.wallet, "wallet");
  const assignment = activeVersion(selections.assignment, "assignment");
  const snapshotWithoutHash = { wallet: snapshotEntry(wallet), assignment: snapshotEntry(assignment) };
  const combinedRules = new Map<string, RecipientRule>();
  for (const rule of [...wallet.policy.rules, ...assignment.policy.rules]) {
    const existing = combinedRules.get(rule.recipient);
    if (!existing || rule.effect === "deny") combinedRules.set(rule.recipient, rule);
  }
  const effective = normalizePolicy({
    maxPerTxMist: wallet.policy.maxPerTxMist < assignment.policy.maxPerTxMist ? wallet.policy.maxPerTxMist : assignment.policy.maxPerTxMist,
    maxPerDayMist: wallet.policy.maxPerDayMist < assignment.policy.maxPerDayMist ? wallet.policy.maxPerDayMist : assignment.policy.maxPerDayMist,
    maxPerMonthMist: wallet.policy.maxPerMonthMist < assignment.policy.maxPerMonthMist ? wallet.policy.maxPerMonthMist : assignment.policy.maxPerMonthMist,
    blockRiskScoreAt: Math.min(wallet.policy.blockRiskScoreAt, assignment.policy.blockRiskScoreAt),
    requireSimulation: wallet.policy.requireSimulation || assignment.policy.requireSimulation,
    rules: [...combinedRules.values()],
  });
  const effectivePolicyHash = policyHash(effective);
  const snapshot: PolicySnapshot = { ...snapshotWithoutHash, effectivePolicyHash };
  return { wallet, assignment, effective, snapshot, snapshotJson: canonicalJson(snapshot) };
}

export const resolveEffectivePolicies = resolveActivePolicies;
export const resolvePolicies = resolveActivePolicies;
export const resolvePolicyVersions = resolveActivePolicies;

export type BudgetPeriod = { spentMist: PolicyValue; reservedMist: PolicyValue };
export type BudgetUsage = {
  wallet?: { day?: BudgetPeriod; month?: BudgetPeriod };
  assignment?: { day?: BudgetPeriod; month?: BudgetPeriod };
  walletDay?: BudgetPeriod;
  walletMonth?: BudgetPeriod;
  assignmentDay?: BudgetPeriod;
  assignmentMonth?: BudgetPeriod;
  walletDaySpentMist?: PolicyValue;
  walletDayReservedMist?: PolicyValue;
  walletMonthSpentMist?: PolicyValue;
  walletMonthReservedMist?: PolicyValue;
  assignmentDaySpentMist?: PolicyValue;
  assignmentDayReservedMist?: PolicyValue;
  assignmentMonthSpentMist?: PolicyValue;
  assignmentMonthReservedMist?: PolicyValue;
};

export type PolicyViolation = { code: string; scope: "wallet" | "assignment"; period?: "day" | "month" };
export type PolicyEvaluation = {
  allowed: boolean;
  code?: string;
  violations: PolicyViolation[];
  effectiveRiskScore: number;
  requireSimulation: true;
};

function budgetValue(value: PolicyValue | undefined): bigint {
  if (value === undefined) return 0n;
  if (typeof value === "bigint") {
    if (value < 0n) throw new DomainError("INVALID_POLICY", "budget values cannot be negative");
    if (value > U64_MAX) throw new DomainError("INVALID_POLICY", "budget values must fit in u64");
    return value;
  }
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new DomainError("INVALID_POLICY", "budget values must be canonical decimals");
  const result = BigInt(value);
  if (result > U64_MAX) throw new DomainError("INVALID_POLICY", "budget values must fit in u64");
  return result;
}

function usageFor(usage: BudgetUsage | undefined, scope: "wallet" | "assignment", period: "day" | "month"): BudgetPeriod {
  const nested = usage?.[scope]?.[period];
  const flatKey = period === "day" ? (scope === "wallet" ? "walletDay" : "assignmentDay") : (scope === "wallet" ? "walletMonth" : "assignmentMonth");
  const flat = usage?.[flatKey];
  if (nested ?? flat) return nested ?? flat!;
  const prefix = `${scope}${period === "day" ? "Day" : "Month"}` as "walletDay" | "walletMonth" | "assignmentDay" | "assignmentMonth";
  return {
    spentMist: usage?.[`${prefix}SpentMist` as keyof BudgetUsage] as PolicyValue | undefined ?? 0n,
    reservedMist: usage?.[`${prefix}ReservedMist` as keyof BudgetUsage] as PolicyValue | undefined ?? 0n,
  };
}

export type BudgetEvaluation = { allowed: boolean; code?: string; violations: PolicyViolation[] };

export function evaluateBudget(policyInput: PolicyInput, amountInput: bigint | string, usage: BudgetUsage | undefined, scope: "wallet" | "assignment"): BudgetEvaluation {
  const policy = normalizePolicy(policyInput);
  const amount = typeof amountInput === "bigint" ? amountInput : parseMist(amountInput);
  if (amount <= 0n || amount > U64_MAX) throw new DomainError("INVALID_AMOUNT");
  const violations: PolicyViolation[] = [];
  for (const period of ["day", "month"] as const) {
    const current = usageFor(usage, scope, period);
    const total = budgetValue(current.spentMist) + budgetValue(current.reservedMist) + amount;
    const limit = period === "day" ? policy.maxPerDayMist : policy.maxPerMonthMist;
    if (total > limit) violations.push({ code: `${scope.toUpperCase()}_${period.toUpperCase()}_BUDGET_EXCEEDED`, scope, period });
  }
  return { allowed: violations.length === 0, code: violations[0]?.code, violations };
}

export function evaluatePolicies(walletInput: PolicyInput, assignmentInput: PolicyInput, recipient: unknown, amountInput: bigint | string, usage?: BudgetUsage): PolicyEvaluation {
  const wallet = normalizePolicy(walletInput);
  const assignment = normalizePolicy(assignmentInput);
  const amount = typeof amountInput === "bigint" ? amountInput : parseMist(amountInput);
  if (amount <= 0n || amount > U64_MAX) throw new DomainError("INVALID_AMOUNT");
  const recipientAddress = normalizeSuiAddress(recipient);
  const effectiveRiskScore = Math.min(wallet.blockRiskScoreAt, assignment.blockRiskScoreAt);
  const violations: PolicyViolation[] = [];
  const policies: Array<["wallet" | "assignment", Policy]> = [["wallet", wallet], ["assignment", assignment]];

  // Deny is evaluated for both policies before either allowlist.  A deny can
  // never be masked by a permissive policy or by an allow rule.
  for (const [scope, policy] of policies) {
    if (policy.rules.some((rule) => rule.effect === "deny" && rule.recipient === recipientAddress)) {
      violations.push({ code: "BLOCKED_RECIPIENT", scope });
    }
  }
  if (violations.length > 0) return { allowed: false, code: "BLOCKED_RECIPIENT", violations, effectiveRiskScore, requireSimulation: true };

  for (const [scope, policy] of policies) {
    const allow = policy.rules.filter((rule) => rule.effect === "allow").map((rule) => rule.recipient);
    if (allow.length > 0 && !allow.includes(recipientAddress)) violations.push({ code: "RECIPIENT_NOT_ALLOWED", scope });
  }
  for (const [scope, policy] of policies) {
    if (amount > policy.maxPerTxMist) violations.push({ code: "OVER_TX_LIMIT", scope });
  }
  for (const [scope, policy] of policies) {
    for (const period of ["day", "month"] as const) {
      const current = usageFor(usage, scope, period);
      const total = budgetValue(current.spentMist) + budgetValue(current.reservedMist) + amount;
      const limit = period === "day" ? policy.maxPerDayMist : policy.maxPerMonthMist;
      if (total > limit) violations.push({ code: `${scope.toUpperCase()}_${period.toUpperCase()}_BUDGET_EXCEEDED`, scope, period });
    }
  }
  return { allowed: violations.length === 0, code: violations[0]?.code, violations, effectiveRiskScore, requireSimulation: true };
}

export const evaluatePolicyPair = evaluatePolicies;
