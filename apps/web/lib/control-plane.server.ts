import "server-only";
import { createHash } from "node:crypto";
import { createDb, AuthRepository, IntentRepository, PolicyRepository, ReservationRepository, WalletExecutionLeaseRepository, WorkspaceRepository } from "@allen-saji/praxis-db";
import { tokenDigest } from "@allen-saji/praxis-control-plane";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

let database: ReturnType<typeof createDb> | undefined;

function controlPlaneDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }

  database ??= createDb(url);
  return database.db;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function authRepository() {
  return new AuthRepository(controlPlaneDb());
}

export function workspaceRepository() {
  return new WorkspaceRepository(controlPlaneDb());
}

export function policyRepository() {
  return new PolicyRepository(controlPlaneDb());
}

export function intentRepository() { return new IntentRepository(controlPlaneDb()); }
export function reservationRepository() { return new ReservationRepository(controlPlaneDb()); }
export function executionLeaseRepository() { return new WalletExecutionLeaseRepository(controlPlaneDb()); }

export const SESSION_MAX_AGE_SECONDS = 43_200;

export function sessionCookieName(): "__Host-praxis_session" | "praxis_session" {
  return process.env.NODE_ENV === "production" ? "__Host-praxis_session" : "praxis_session";
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function requestSessionToken(request: Request): string | null {
  const name = sessionCookieName();
  const rawCookie = request.headers.get("cookie");
  if (!rawCookie) return null;
  for (const segment of rawCookie.split(";")) {
    const [key, ...parts] = segment.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}

export async function sessionForRequest(request: Request) {
  const token = requestSessionToken(request);
  if (!token) return null;
  return authRepository().activeSession(
    tokenDigest(token, requiredSecret("PRAXIS_SESSION_PEPPER")),
    new Date(),
  );
}

export async function requireSession(request: Request) {
  const session = await sessionForRequest(request);
  if (!session) throw new HttpError(401, "UNAUTHENTICATED", "Login required");
  return session;
}

const ROLE_LEVEL = { viewer: 0, admin: 1, owner: 2 } as const;

export async function requireOrganizationMember(
  request: Request,
  organizationId: string,
  minimumRole: keyof typeof ROLE_LEVEL = "viewer",
) {
  const session = await requireSession(request);
  const membership = await workspaceRepository().organizationForMember(
    organizationId,
    session.user.id,
  );
  const role = membership?.member.role as keyof typeof ROLE_LEVEL | undefined;
  if (!membership || !role || ROLE_LEVEL[role] < ROLE_LEVEL[minimumRole]) {
    throw new HttpError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
  }
  return { ...membership, session };
}

export function configuredOrigin(request?: Request): string {
  const value = process.env.APP_ORIGIN ?? (process.env.NODE_ENV !== "production" && request
    ? new URL(request.url).origin
    : undefined);
  if (!value) throw new HttpError(503, "CONFIGURATION_ERROR", "Application origin is not configured");
  const origin = new URL(value).origin;
  if (origin !== value.replace(/\/$/, "")) {
    throw new HttpError(503, "CONFIGURATION_ERROR", "Application origin is invalid");
  }
  return origin;
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== configuredOrigin(request)) {
    throw new HttpError(403, "ORIGIN_DENIED", "Invalid origin");
  }
}

export function authGraphqlClient() {
  return new SuiGraphQLClient({
    network: "testnet",
    url: process.env.SUI_GRAPHQL_URL ?? "https://graphql.testnet.sui.io/graphql",
  });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function safeErrorResponse(error: unknown, fallbackCode: string, fallbackStatus = 400) {
  const requestId = crypto.randomUUID();
  const known = error instanceof HttpError ? error : null;
  return Response.json({
    error: {
      code: known?.code ?? fallbackCode,
      message: known?.message ?? "Request could not be completed",
      requestId,
    },
  }, { status: known?.status ?? fallbackStatus });
}

export async function readJsonBody<T>(request: Request, parse: (value: unknown) => T): Promise<T> {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type !== "application/json") throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > 32 * 1024) throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 32 * 1024) throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body is too large");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new HttpError(400, "INVALID_JSON", "Request body is not valid JSON"); }
  return parse(value);
}

export function requiredSecret(name: "PRAXIS_SESSION_PEPPER" | "PRAXIS_CREDENTIAL_PEPPER") {
  const value = process.env[name];
  if (!value || value.startsWith("replace-with-")) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}
