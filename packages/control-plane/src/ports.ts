import { resolveActivePolicies, type PolicyScopeRef, type PolicySnapshot, type PolicyVersionInput, type ResolvedPolicies } from "./policy";
import { revalidateBeforeSigning, type PreSignExecutionContext, type PreSignRevalidationInput } from "./intent";
import { DomainError } from "./errors";
import { parseMist } from "./validation";

/** Framework-neutral dependencies for application services built on the domain. */
export interface PolicyRepositoryPort {
  loadScope(scopeId: string): Promise<PolicyScopeRef | null>;
  loadVersions(scopeId: string): Promise<readonly PolicyVersionInput[]>;
}

export interface PolicyResolverPort {
  resolveActivePolicies(walletScopeId: string, assignmentScopeId: string): Promise<ResolvedPolicies>;
}

export interface PreSignStatusPort {
  /**
   * Resolve all signing identities and protections in one tenant-scoped
   * lookup. Implementations must not reconstruct this context from caller
   * supplied wallet, agent, or credential IDs.
   */
  loadExecutionContext(input: { organizationId: string; assignmentId: string; intentId: string }): Promise<PreSignExecutionContext | null>;
}

export interface ControlPlaneClock {
  now(): Date;
}

export async function resolveActivePoliciesFromPort(
  repository: PolicyRepositoryPort,
  walletScopeId: string,
  assignmentScopeId: string,
): Promise<ResolvedPolicies> {
  try {
    const [walletScope, assignmentScope] = await Promise.all([
      repository.loadScope(walletScopeId),
      repository.loadScope(assignmentScopeId),
    ]);
    if (!walletScope || !assignmentScope) {
      throw new DomainError("NO_ACTIVE_POLICY");
    }
    const [walletVersions, assignmentVersions] = await Promise.all([
      repository.loadVersions(walletScope.id),
      repository.loadVersions(assignmentScope.id),
    ]);
    return resolveActivePolicies({
      wallet: { scope: walletScope, versions: walletVersions },
      assignment: { scope: assignmentScope, versions: assignmentVersions },
    });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("NO_ACTIVE_POLICY", undefined, { cause: error });
  }
}

export type PreSignPortInput = {
  repository: PreSignStatusPort;
  organizationId: string;
  assignmentId: string;
  intentId: string;
  amountMist: bigint | string;
  workerId: string;
  expectedSnapshot: PolicySnapshot;
  now: Date;
};

export async function revalidateBeforeSigningFromPort(input: PreSignPortInput): Promise<{ ok: true }> {
  try {
    return await revalidateBeforeSigningFromPortUnsafe(input);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("PRESIGN_REVALIDATION_FAILED", undefined, { cause: error });
  }
}

async function revalidateBeforeSigningFromPortUnsafe(input: PreSignPortInput): Promise<{ ok: true }> {
  if (!input.organizationId || !input.assignmentId || !input.intentId || !input.workerId) throw new DomainError("PRESIGN_REVALIDATION_FAILED");
  const context = await input.repository.loadExecutionContext({ organizationId: input.organizationId, assignmentId: input.assignmentId, intentId: input.intentId });
  if (!context) throw new DomainError("PRESIGN_REVALIDATION_FAILED");
  let requestedAmount: bigint;
  let loadedAmount: bigint;
  try {
    requestedAmount = typeof input.amountMist === "bigint" ? input.amountMist : parseMist(input.amountMist);
    loadedAmount = typeof context.intent.amountMist === "bigint" ? context.intent.amountMist : parseMist(context.intent.amountMist);
  } catch (error) {
    throw new DomainError("PRESIGN_REVALIDATION_FAILED", undefined, { cause: error });
  }
  if (loadedAmount !== requestedAmount) throw new DomainError("PRESIGN_REVALIDATION_FAILED");
  const revalidation: PreSignRevalidationInput = {
    expectedSnapshot: input.expectedSnapshot,
    currentSnapshot: context.policySnapshot,
    organizationId: input.organizationId,
    walletId: context.wallet.id,
    agentId: context.agent.id,
    assignmentId: context.assignment.id,
    credentialId: context.credential.id,
    intentId: context.intent.id,
    amountMist: context.intent.amountMist,
    workerId: input.workerId,
    intentState: context.intent.state,
    reservation: context.reservation,
    executionLease: context.executionLease,
    walletStatus: context.wallet.status,
    walletArchivedAt: context.wallet.archivedAt,
    agentStatus: context.agent.status,
    assignmentStatus: context.assignment.status,
    credentialStatus: context.credential.status,
    credentialExpiresAt: context.credential.expiresAt,
    bindings: {
      organizationId: context.organizationId,
      intent: context.intent,
      wallet: context.wallet,
      agent: context.agent,
      assignment: context.assignment,
      credential: context.credential,
      reservation: context.reservation ?? { id: "", organizationId: "", intentId: "", walletId: "", assignmentId: "", amountMist: "0" },
      executionLease: context.executionLease ?? { id: "", organizationId: "", intentId: "", walletId: "" },
    },
    now: input.now,
  };
  if (context.intent.id !== input.intentId || context.intent.assignmentId !== input.assignmentId || context.intent.organizationId !== input.organizationId) throw new DomainError("PRESIGN_REVALIDATION_FAILED");
  return revalidateBeforeSigning(revalidation);
}

export class FixedClock implements ControlPlaneClock {
  constructor(private readonly value: Date) {
    if (Number.isNaN(value.getTime())) throw new DomainError("INVALID_CANONICAL_VALUE", "time must be a valid date");
  }

  now(): Date {
    return new Date(this.value.getTime());
  }
}

export class MutableClock implements ControlPlaneClock {
  private value: Date;

  constructor(value: Date) {
    if (Number.isNaN(value.getTime())) throw new DomainError("INVALID_CANONICAL_VALUE", "time must be a valid date");
    this.value = new Date(value.getTime());
  }

  now(): Date {
    return new Date(this.value.getTime());
  }

  set(value: Date): void {
    if (Number.isNaN(value.getTime())) throw new DomainError("INVALID_CANONICAL_VALUE", "time must be a valid date");
    this.value = new Date(value.getTime());
  }

  advance(milliseconds: number): Date {
    if (!Number.isFinite(milliseconds)) throw new DomainError("INVALID_CANONICAL_VALUE", "clock advance must be finite");
    this.value = new Date(this.value.getTime() + milliseconds);
    return this.now();
  }
}
