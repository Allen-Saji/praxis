/**
 * Errors exposed by the control-plane domain are intentionally boring.  A
 * provider exception may be attached as a non-enumerable cause, but it is
 * never copied into the public message or serialized by accident.
 */
export type DomainErrorCode =
  | "INVALID_AMOUNT"
  | "INVALID_ADDRESS"
  | "INVALID_COIN_TYPE"
  | "INVALID_CANONICAL_VALUE"
  | "INVALID_POLICY"
  | "INVALID_POLICY_VERSION"
  | "NO_ACTIVE_POLICY"
  | "POLICY_SNAPSHOT_MISMATCH"
  | "POLICY_HASH_MISMATCH"
  | "POLICY_DOCUMENT_MISMATCH"
  | "POLICY_BLOCKED"
  | "BUDGET_EXCEEDED"
  | "PRESIGN_REVALIDATION_FAILED"
  | "INVALID_INTENT_TRANSITION"
  | "INVALID_CREDENTIAL"
  | "CONFIGURATION_ERROR";

const DEFAULT_MESSAGES: Record<DomainErrorCode, string> = {
  INVALID_AMOUNT: "amount is invalid",
  INVALID_ADDRESS: "address is invalid",
  INVALID_COIN_TYPE: "coin type is not supported",
  INVALID_CANONICAL_VALUE: "value cannot be represented canonically",
  INVALID_POLICY: "policy is invalid",
  INVALID_POLICY_VERSION: "policy version is invalid",
  NO_ACTIVE_POLICY: "no active policy is available",
  POLICY_SNAPSHOT_MISMATCH: "policy snapshot is stale",
  POLICY_HASH_MISMATCH: "policy hash is invalid",
  POLICY_DOCUMENT_MISMATCH: "policy document is invalid",
  POLICY_BLOCKED: "policy blocks this spend",
  BUDGET_EXCEEDED: "budget would be exceeded",
  PRESIGN_REVALIDATION_FAILED: "pre-sign revalidation failed",
  INVALID_INTENT_TRANSITION: "intent transition is invalid",
  INVALID_CREDENTIAL: "credential is invalid",
  CONFIGURATION_ERROR: "control-plane configuration is invalid",
};

export type DomainErrorOptions = { cause?: unknown };

export class DomainError extends Error {
  readonly code: DomainErrorCode | (string & {});

  constructor(code: DomainErrorCode | (string & {}), message?: string, options?: DomainErrorOptions) {
    super(message ?? DEFAULT_MESSAGES[code as DomainErrorCode] ?? "control-plane request failed");
    this.name = "DomainError";
    this.code = code;
    if (options && "cause" in options) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: options.cause,
        writable: false,
      });
    }
  }

  toJSON(): { code: string; message: string } {
    return { code: this.code, message: this.message };
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export function domainError(
  code: DomainErrorCode | (string & {}),
  options?: DomainErrorOptions,
): DomainError {
  return new DomainError(code, undefined, options);
}
