import "server-only";
import { createHash } from "node:crypto";
import { createDb, AuthRepository, WorkspaceRepository } from "@allen-saji/praxis-db";
export function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function authRepository() { const url = process.env.DATABASE_URL; if (!url) throw new Error("DATABASE_URL is not configured"); return new AuthRepository(createDb(url).db); }
export function workspaceRepository() { const url = process.env.DATABASE_URL; if (!url) throw new Error("DATABASE_URL is not configured"); return new WorkspaceRepository(createDb(url).db); }
export function requiredSecret(name: "PRAXIS_SESSION_PEPPER" | "PRAXIS_CREDENTIAL_PEPPER") { const value = process.env[name]; if (!value || value.startsWith("replace-with-")) throw new Error(`${name} is not configured`); return value; }
