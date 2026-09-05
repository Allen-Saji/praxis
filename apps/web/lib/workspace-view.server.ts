import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { tokenDigest } from "@allen-saji/praxis-control-plane";
import { authRepository, requiredSecret, sessionCookieName, workspaceRepository } from "./control-plane.server";

export const currentOwnerSession = cache(async () => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  return authRepository().activeSession(
    tokenDigest(token, requiredSecret("PRAXIS_SESSION_PEPPER")),
    new Date(),
  );
});

export async function requireOwnerSession() {
  const session = await currentOwnerSession();
  if (!session) redirect("/app/workspaces");
  return session;
}

export async function requireWorkspace(slug: string) {
  const session = await requireOwnerSession();
  const membership = await workspaceRepository().organizationBySlugForMember(slug, session.user.id);
  if (!membership) notFound();
  return { session, ...membership };
}

export async function requireWorkspaceOverview(slug: string) {
  const context = await requireWorkspace(slug);
  const overview = await workspaceRepository().workspaceOverview(context.organization.id, context.session.user.id);
  if (!overview) notFound();
  return { session: context.session, ...overview };
}

export async function defaultWorkspacePath(section = "") {
  const session = await requireOwnerSession();
  const workspaces = await workspaceRepository().listForUser(session.user.id);
  return workspaces[0] ? `/app/workspaces/${workspaces[0].organization.slug}${section}` : "/app/workspaces/new";
}
