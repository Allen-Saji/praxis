import "server-only";
import { createHash } from "node:crypto";
import { createDb, AuthRepository, WorkspaceRepository } from "@allen-saji/praxis-db";
export function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function authRepository() { const url = process.env.DATABASE_URL; if (!url) throw new Error("DATABASE_URL is not configured"); return new AuthRepository(createDb(url).db); }
export function workspaceRepository() { const url = process.env.DATABASE_URL; if (!url) throw new Error("DATABASE_URL is not configured"); return new WorkspaceRepository(createDb(url).db); }
