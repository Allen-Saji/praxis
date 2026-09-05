"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ConnectButton, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { Bot, LayoutDashboard, WalletCards, List, Settings, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Wordmark } from "@/components/brand/Wordmark";
import { shortAddress } from "@/lib/workspace-display";
import { OwnerSignIn } from "@/components/workspace/WorkspaceControls";

export type WorkspaceOption = { slug: string; name: string };
export function PrivateShell({ address, workspaces, children }: { address: string | null; workspaces: WorkspaceOption[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const account = useCurrentAccount();
  const disconnect = useDisconnectWallet();
  const queryClient = useQueryClient();
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const previousWallet = useRef<string | null>(null);
  const mismatch = !!address && !!account && account.address.toLowerCase() !== address.toLowerCase();
  const active = workspaces.find((workspace) => pathname.startsWith(`/app/workspaces/${workspace.slug}/`) || pathname === `/app/workspaces/${workspace.slug}`);
  const base = active ? `/app/workspaces/${active.slug}` : "/app";
  const items = [
    { href: base, label: "Dashboard", icon: LayoutDashboard },
    { href: `${base}/agents`, label: "Agents", icon: Bot },
    { href: `${base}/wallets`, label: "Wallets", icon: WalletCards },
    { href: `${base}/decisions`, label: "Activity", icon: List },
    { href: `${base}/settings`, label: "Settings", icon: Settings },
  ];

  useEffect(() => {
    if (!address) { setVerified(false); return; }
    const controller = new AbortController();
    let mounted = true;
    setVerified(false);
    async function verify() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unable to check your session. Retry to continue.");
        const result = await response.json();
        if (!mounted) return;
        if (!result.authenticated || result.user?.address !== address) {
          setVerified(false); queryClient.clear();
          window.location.replace("/app/workspaces"); return;
        }
        setVerified(true); setError(null);
      } catch (failure) {
        if (!mounted || controller.signal.aborted) return;
        setVerified(false); setError(failure instanceof Error ? failure.message : "Session unavailable");
      }
    }
    const onVisibility = () => { if (document.visibilityState === "visible") { setVerified(false); void verify(); } };
    const onPageShow = () => { setVerified(false); void verify(); };
    void verify();
    const timer = window.setInterval(() => { void verify(); }, 15_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => { mounted = false; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pageshow", onPageShow); };
  }, [address, pathname, attempt, queryClient]);

  async function signOut() {
    setPending(true); setError(null); setVerified(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed. Please retry.");
      queryClient.clear();
      await disconnect.mutateAsync().catch(() => undefined);
      window.location.assign("/app/workspaces");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign out failed"); setPending(false); }
  }
  useEffect(() => {
    const previous = previousWallet.current;
    previousWallet.current = account?.address ?? null;
    if (address && previous && !account) void signOut();
    // Wallet disconnect must revoke the separate owner session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address]);
  const canShow = !address || (verified && !mismatch && !pending);
  return <div className="flex min-h-dvh bg-[var(--bg)]">
    <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-[var(--divider)] bg-[var(--workspace)] p-4 md:flex">
      <Link href="/" className="focus-ring mb-8 inline-flex min-h-11 items-center"><Wordmark /></Link>
      {address && verified && !mismatch ? <>
        <label className="mb-5 grid gap-2 text-xs text-[var(--text-low)]">Workspace
          <select aria-label="Workspace" value={active?.slug ?? ""} onChange={(event) => { window.location.assign(event.target.value ? `/app/workspaces/${event.target.value}` : "/app/workspaces"); }} className="focus-ring min-h-11 min-w-0 rounded border border-[var(--border)] bg-[var(--panel)] px-2 text-sm text-[var(--text-hi)]"><option value="">Choose workspace</option>{workspaces.map((workspace) => <option key={workspace.slug} value={workspace.slug}>{workspace.name}</option>)}</select>
        </label>
        {active ? <nav aria-label="Primary" className="grid gap-1">{items.map(({ href, label, icon: Icon }, index) => { const selected = index === 0 ? pathname === href : pathname.startsWith(href); return <Link key={label} href={href} aria-current={selected ? "page" : undefined} className={`focus-ring flex min-h-11 items-center gap-3 rounded px-3 text-sm ${selected ? "bg-[var(--accent-tint)] text-[var(--accent)]" : "text-[var(--text-mid)] hover:bg-white/5"}`}><Icon className="h-4 w-4" />{label}</Link>; })}</nav> : <Link href="/app/workspaces" className="focus-ring py-3 text-sm">Workspaces</Link>}
      </> : null}
      <div className="mt-auto grid gap-3 text-xs text-[var(--text-low)]"><Link className="focus-ring inline-flex min-h-11 items-center" href="/docs">Documentation</Link><span>Sui Testnet</span></div>
    </aside>
    <div className="min-w-0 flex-1 md:ml-56">
      <header className="flex min-h-16 items-center justify-between border-b border-[var(--divider)] px-4 sm:px-7">
        <Link href="/" className="focus-ring md:hidden"><Wordmark compactOnMobile /></Link>
        <span className="hidden md:block" />
        {address ? <details className="relative ml-auto"><summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl bg-[#f5f6f8] px-4 font-mono text-sm font-semibold text-[#111827]">{shortAddress(account?.address ?? address)}<ChevronDown className="h-4 w-4" /></summary><div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-xl">
          <p className="mb-1 text-xs text-[var(--text-low)]">Signed-in account</p><p className="break-all font-mono text-xs">{address}</p>
          <button className="focus-ring my-2 min-h-11 text-sm text-[var(--accent)]" onClick={async () => { try { await navigator.clipboard.writeText(address); setCopied(true); } catch { setError("Could not copy the address. Select it from the account menu."); } }}>{copied ? "Copied" : "Copy address"}</button>
          <div className="praxis-connect mb-3"><ConnectButton connectText="Connect wallet" /></div>
          <button disabled={pending} onClick={signOut} className="focus-ring min-h-11 w-full rounded border border-[var(--border)] text-sm">{pending ? "Signing out..." : "Sign out"}</button>
        </div></details> : <span className="text-xs text-[var(--text-low)] md:hidden">Sui Testnet</span>}
      </header>
      {address && verified && !mismatch ? <div className="flex items-center gap-3 border-b border-[var(--divider)] px-4 py-2 md:hidden"><select aria-label="Workspace" value={active?.slug ?? ""} onChange={(event) => window.location.assign(event.target.value ? `/app/workspaces/${event.target.value}` : "/app/workspaces")} className="min-h-11 min-w-0 flex-1 bg-[var(--bg)] text-sm"><option value="">Choose workspace</option>{workspaces.map((workspace) => <option key={workspace.slug} value={workspace.slug}>{workspace.name}</option>)}</select><span className="text-xs text-[var(--text-low)]">Testnet</span></div> : null}
      <main className="mx-auto max-w-6xl px-4 py-7 pb-28 sm:px-7 md:pb-10">
        {error ? <div role="alert" className="mb-5 rounded border border-[var(--risk-medium)] p-4 text-sm">{error}<button className="focus-ring ml-3 min-h-11 underline" onClick={() => setAttempt((n) => n + 1)}>Retry session check</button></div> : null}
        {mismatch ? <div className="mx-auto max-w-md py-12"><h1 className="mb-3 text-2xl font-semibold">Sign in with this wallet</h1><p className="mb-6 text-sm text-[var(--text-mid)]">Your connected wallet changed. Sign in to open its workspaces.</p><OwnerSignIn /></div> : canShow ? children : <p role="status" className="py-12 text-sm text-[var(--text-mid)]">{pending ? "Signing out..." : "Checking your session..."}</p>}
      </main>
      {active && address && verified && !mismatch ? <nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[var(--divider)] bg-[var(--workspace)] px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 md:hidden">{items.map(({ href, label, icon: Icon }, index) => <Link key={label} href={href} aria-current={(index === 0 ? pathname === href : pathname.startsWith(href)) ? "page" : undefined} className="focus-ring flex min-h-12 flex-col items-center justify-center gap-1 rounded text-[11px] text-[var(--text-mid)] aria-[current=page]:text-[var(--accent)]"><Icon className="h-4 w-4" />{label}</Link>)}</nav> : null}
    </div>
  </div>;
}
