import { NextResponse } from "next/server";
import { z } from "zod";
import { tokenDigest } from "@allen-saji/praxis-control-plane";
import { authRepository, workspaceRepository } from "@/lib/control-plane.server";
export const dynamic = "force-dynamic";
const schema = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/), name: z.string().trim().min(1).max(80) }).strict();
export async function POST(request: Request) { try { if (!sameOrigin(request)) return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "Invalid origin" } }, { status: 403 }); const session = await sessionFor(request); if (!session) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Login required" } }, { status: 401 }); const body = schema.parse(await request.json()); const organization = await workspaceRepository().createOrganization({ ...body, userId: session.user.id }); return NextResponse.json({ organization }, { status: 201 }); } catch { return NextResponse.json({ error: { code: "INVALID_WORKSPACE_REQUEST", message: "Unable to create workspace" } }, { status: 400 }); } }
async function sessionFor(request: Request) { const name = process.env.NODE_ENV === "production" ? "__Host-praxis_session" : "praxis_session"; const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1); const pepper = process.env.PRAXIS_SESSION_PEPPER; return token && pepper ? authRepository().activeSession(tokenDigest(token, pepper), new Date()) : null; }
function sameOrigin(request: Request) { const expected = process.env.APP_ORIGIN; return !expected || request.headers.get("origin") === expected; }
