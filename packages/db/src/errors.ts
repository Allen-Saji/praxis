export class DbDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = "DbDomainError";
    this.code = code;
    if (cause !== undefined) Object.defineProperty(this, "cause", { value: cause, enumerable: false, configurable: false, writable: false });
  }
}

export function isSerializationFailure(error: unknown): boolean {
  const value = error as { code?: string; cause?: { code?: string } };
  const code = value.code ?? value.cause?.code;
  return code === "40001" || code === "40P01";
}
