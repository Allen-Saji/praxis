import { NavRail } from "./NavRail";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { AppProviders } from "@/components/providers/AppProviders";
import { TooltipProvider } from "@/components/primitives/Tooltip";
import { DEPLOYMENTS } from "@allen-saji/praxis";

/**
 * The dashboard frame: nav rail + top bar + Cmd+K palette + content slot. Wraps
 * children in the client provider tree (wallet, react-query, viewer). The
 * package id is read from the SDK deployment config on the server and passed
 * down to the network badge.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const packageId = DEPLOYMENTS.testnet.packageId;
  return (
    <AppProviders>
      <TooltipProvider>
        <div className="flex h-screen w-full overflow-hidden bg-[rgba(8,10,14,0.8)]">
          <NavRail />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar packageId={packageId} />
            <main className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 lg:px-8">
                {children}
              </div>
            </main>
          </div>
          <CommandPalette />
        </div>
      </TooltipProvider>
    </AppProviders>
  );
}
