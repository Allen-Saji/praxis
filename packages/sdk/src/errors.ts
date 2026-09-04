export type SdkErrorCode =
  | "INVALID_AMOUNT"
  | "INVALID_ADDRESS"
  | "UNSUPPORTED_COIN"
  | "BALANCE_UNAVAILABLE"
  | "MALFORMED_SIMULATION"
  | "SIMULATION_FAILED"
  | "TRANSACTION_FAILED"
  | "TRANSACTION_SUBMISSION_UNKNOWN"
  | "TRANSACTION_RESPONSE_MALFORMED"
  | "EVIDENCE_PUBLISH_FAILED"
  | "EVIDENCE_READBACK_FAILED"
  | "EVIDENCE_READBACK_MISMATCH"
  | "EVIDENCE_TOO_LARGE"
  | "EVIDENCE_TIMEOUT"
  | "LOCAL_EVIDENCE_NOT_ALLOWED"
  | "EVENT_READ_FAILED"
  | "EVENT_RESPONSE_MALFORMED"
  | "SEALED_REASONING_NOT_AVAILABLE"
  | "CONFIGURATION_ERROR";

/** Safe, structured SDK error. The cause is intentionally non-enumerable. */
export class PraxisSdkError extends Error {
  override readonly name = "PraxisSdkError";
  readonly retryable: boolean;
  readonly txDigest?: string;

  constructor(
    readonly code: SdkErrorCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean; txDigest?: string },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.retryable = options?.retryable ?? false;
    this.txDigest = options?.txDigest;
  }
}

export function errorCode(error: unknown): SdkErrorCode | undefined {
  return error instanceof PraxisSdkError ? error.code : undefined;
}
