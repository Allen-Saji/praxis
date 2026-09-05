import { AppProviders } from "@/components/providers/AppProviders";
import { TooltipProvider } from "@/components/primitives/Tooltip";
import { currentOwnerSession } from "@/lib/workspace-view.server";
import { workspaceRepository } from "@/lib/control-plane.server";
import { PrivateShell } from "./PrivateShell";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await currentOwnerSession();
  const workspaces = session ? await workspaceRepository().listForUser(session.user.id) : [];
  return <AppProviders><TooltipProvider><PrivateShell address={session?.user.primarySuiAddress ?? null} workspaces={workspaces.map(({ organization }) => ({ slug: organization.slug, name: organization.name }))}>{children}</PrivateShell></TooltipProvider></AppProviders>;
}
