"use client";
import * as Dialog from "@radix-ui/react-dialog";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ConnectButton, useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, LogOut, X } from "lucide-react";
import { Button } from "@/components/primitives/Button";

type ApiError = { error?: { message?: string } };
type MutationState = { pending: boolean; error: string | null; success: string | null };
const idle: MutationState = { pending: false, error: null, success: null };
const inputClass = "focus-ring min-h-11 w-full rounded-[var(--r-sm)] border border-[var(--border-hi)] bg-[var(--bg)] px-3 font-mono text-[13px] text-[var(--text-hi)] placeholder:text-[var(--text-low)]";
const labelClass = "grid gap-1.5 text-[12px] font-medium text-[var(--text-mid)]";

async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) throw new Error(result.error?.message ?? "Request could not be completed");
  return result;
}

function Feedback({ state }: { state: MutationState }) {
  if (!state.error && !state.success) return null;
  return <p role={state.error ? "alert" : "status"} className={`text-[12px] ${state.error ? "text-[var(--risk-critical)]" : "text-[var(--risk-low)]"}`}>{state.error ?? state.success}</p>;
}

export function OwnerSignIn() {
  const account = useCurrentAccount();
  const signer = useSignPersonalMessage();
  const [state, setState] = useState(idle);
  async function login() {
    if (!account) return;
    setState({ pending: true, error: null, success: null });
    try {
      const challenge = await api<{ nonce: string; message: string }>("/api/auth/challenge", "POST", { address: account.address, network: "testnet" });
      const signed = await signer.mutateAsync({ message: new TextEncoder().encode(challenge.message) });
      await api("/api/auth/verify", "POST", { address: account.address, nonce: challenge.nonce, signature: signed.signature });
      setState({ pending: false, error: null, success: "Signed in. Loading workspaces..." });
      window.location.assign("/app");
    } catch (error) {
      setState({ pending: false, error: error instanceof Error ? error.message : "Sign-in failed", success: null });
    }
  }
  return <div className="grid gap-4">
    <div className="flex min-h-11 flex-wrap items-center gap-3"><span className="praxis-connect"><ConnectButton connectText="Connect Sui wallet" /></span></div>
    <Button type="button" variant="primary" onClick={login} disabled={!account} loading={state.pending}>Sign in with wallet</Button>
    <p className="text-[12px] leading-5 text-[var(--text-low)]">Sign a message to verify your wallet. No gas or transfer.</p>
    <Feedback state={state} />
  </div>;
}

export function WorkspaceCreateForm() {
  const router = useRouter();
  const [state, setState] = useState(idle);
  const [workspaceName, setWorkspaceName] = useState("");
  const [customSlug, setCustomSlug] = useState<string | null>(null);
  const slug = customSlug ?? workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setState({ pending: true, error: null, success: null });
    try {
      const result = await api<{ organization: { slug: string } }>("/api/workspaces", "POST", { name: data.get("name"), slug: data.get("slug") });
      window.location.assign(`/app/workspaces/${result.organization.slug}`);
    } catch (error) { setState({ pending: false, error: message(error), success: null }); }
  }
  return <form onSubmit={submit} className="grid gap-4">
    <label className={labelClass}>Workspace name<input className={inputClass} name="name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required maxLength={80} placeholder="My workspace" /></label>
    <label className={labelClass}>URL slug<input className={inputClass} name="slug" value={slug} onChange={(event) => setCustomSlug(event.target.value)} required minLength={3} maxLength={48} pattern="[a-z0-9][a-z0-9-]{1,46}[a-z0-9]" placeholder="praxis-labs" /></label>
    <Button variant="primary" loading={state.pending}>Create workspace</Button><Feedback state={state} />
  </form>;
}

export function RegisterWalletForm({ organizationId }: { organizationId: string }) {
  const router = useRouter(); const [state, setState] = useState(idle);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setState({ pending: true, error: null, success: null });
    try {
      const address = String(data.get("suiAddress")).trim();
      const eligibility = await api<{ eligible: boolean }>(`/api/workspaces/${organizationId}/wallets/eligibility?address=${encodeURIComponent(address)}`, "GET");
      if (!eligibility.eligible) throw new Error("This wallet is not available for hosted execution. Only the configured Testnet wallet is supported today.");
      await api(`/api/workspaces/${organizationId}/wallets`, "POST", { label: data.get("label"), suiAddress: address, network: "testnet", adapterType: "demo_keypair" });
      setState({ pending: false, error: null, success: "Wallet added. Open it to set spending limits." }); router.refresh();
    } catch (error) { setState({ pending: false, error: message(error), success: null }); }
  }
  return <form onSubmit={submit} className="grid gap-4"><p className="text-sm leading-6 text-[var(--text-mid)]">Hosted payments currently use a configured Testnet wallet. Connecting a wallet for sign-in does not enable it for payments. We check eligibility before adding it.</p><label className={labelClass}>Wallet label<input className={inputClass} name="label" placeholder="Operations" required maxLength={64} /></label><label className={labelClass}>Wallet address<input className={inputClass} name="suiAddress" placeholder="0x..." required /></label><Button variant="primary" loading={state.pending}>Check and add wallet</Button><Feedback state={state} /></form>;
}

export function CreateAgentForm({ organizationId }: { organizationId: string }) {
  return <SimpleForm endpoint={`/api/workspaces/${organizationId}/agents`} method="POST" success="Agent created." fields={[
    { name: "name", label: "Agent name", placeholder: "Research Agent" },

  ]} submit="Create agent" />;
}

export function CreateAssignmentForm({ organizationId, wallets, agents }: { organizationId: string; wallets: Array<{ id: string; label: string }>; agents: Array<{ id: string; name: string }> }) {
  const router = useRouter(); const [state, setState] = useState(idle);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setState({ pending: true, error: null, success: null });
    try { await api(`/api/workspaces/${organizationId}/assignments`, "POST", { walletId: data.get("walletId"), agentId: data.get("agentId") }); setState({ pending: false, error: null, success: "Wallet access added. Review and activate the agent limits, then enable access." }); router.refresh(); }
    catch (error) { setState({ pending: false, error: message(error), success: null }); }
  }
  return <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
    <label className={labelClass}>Wallet<select className={inputClass} name="walletId" required defaultValue=""><option value="" disabled>Select wallet</option>{wallets.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
    <label className={labelClass}>Agent<select className={inputClass} name="agentId" required defaultValue=""><option value="" disabled>Select agent</option>{agents.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <div className="sm:col-span-2"><Button variant="primary" loading={state.pending} disabled={!wallets.length || !agents.length}>Add wallet access</Button></div><div className="sm:col-span-2"><Feedback state={state} /></div>
  </form>;
}

export function StatusAction({ endpoint, method = "PATCH", status, label, danger = false }: { endpoint: string; method?: string; status?: string; label: string; danger?: boolean }) {
  const router = useRouter(); const [state, setState] = useState(idle);
  async function run() { setState({ pending: true, error: null, success: null }); try { await api(endpoint, method, status ? { status } : undefined); setState({ pending: false, error: null, success: `${label} complete.` }); router.refresh(); } catch (error) { setState({ pending: false, error: message(error), success: null }); } }
  return <div className="grid gap-2"><Button type="button" variant={danger ? "danger" : "secondary"} onClick={run} loading={state.pending}>{label}</Button><Feedback state={state} /></div>;
}

export function CredentialIssue({ organizationId, assignmentId }: { organizationId: string; assignmentId: string }) {
  const router = useRouter(); const [state, setState] = useState(idle); const [token, setToken] = useState<string | null>(null); const [copied, setCopied] = useState(false); const dismissRef = useRef<HTMLButtonElement>(null); const issueRef = useRef<HTMLButtonElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setState({ pending: true, error: null, success: null }); try { const result = await api<{ token: string }>(`/api/workspaces/${organizationId}/assignments/${assignmentId}/credentials`, "POST", { name: data.get("name") }); setToken(result.token); setState({ pending: false, error: null, success: null }); router.refresh(); } catch (error) { setState({ pending: false, error: message(error), success: null }); } }
  async function copy() { if (!token) return; try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setState({ pending: false, error: "Copy failed. Select and copy the credential manually.", success: null }); } }
  function dismiss() { setToken(null); setCopied(false); }
  useEffect(() => {
    if (!token) return;
    dismissRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [token]);
  return <><form onSubmit={submit} className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end"><label className={`${labelClass} min-w-0 flex-1`}>Credential name<input className={inputClass} name="name" required maxLength={64} placeholder="demo-runner" /></label><Button ref={issueRef} variant="secondary" loading={state.pending}><KeyRound className="h-4 w-4" />Issue credential</Button><Feedback state={state} /></form>
    <Dialog.Root open={!!token} onOpenChange={(open) => { if (!open) dismiss(); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" /><Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); issueRef.current?.focus(); }} className="glass-solid fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><Dialog.Title className="font-display text-xl font-semibold">Copy credential now</Dialog.Title><Dialog.Description className="mt-2 text-sm text-[var(--risk-medium)]">This token is shown once. Store it before closing.</Dialog.Description></div><Button ref={dismissRef} type="button" size="icon" variant="ghost" onClick={dismiss} aria-label="Dismiss credential"><X className="h-5 w-5" /></Button></div>
      <div className="mt-5 flex min-w-0 items-center rounded border border-[var(--border-hi)] bg-black/30 p-2"><code className="min-w-0 flex-1 break-all px-2 font-mono text-[12px]">{token}</code><Button type="button" size="icon" onClick={copy} aria-label="Copy credential">{copied ? <Check className="h-4 w-4 text-[var(--risk-low)]" /> : <Copy className="h-4 w-4" />}</Button></div>
      <Button className="mt-5 w-full" type="button" variant={copied ? "primary" : "secondary"} onClick={dismiss}>{copied ? "I stored this token" : "Dismiss without copy"}</Button>
    <Feedback state={state} /></Dialog.Content></Dialog.Portal></Dialog.Root></>;
}

export function LogoutButton() {
  const [state, setState] = useState(idle);
  async function logout() { setState({ pending: true, error: null, success: null }); try { await api("/api/auth/logout", "POST"); window.location.assign("/app/workspaces"); } catch (error) { setState({ pending: false, error: message(error), success: null }); } }
  return <div><Button type="button" variant="secondary" onClick={logout} loading={state.pending}>Sign out</Button><Feedback state={state} /></div>;
}

function SimpleForm({ endpoint, method, fields, fixed = {}, submit, success }: { endpoint: string; method: string; fields: Array<{ name: string; label: string; placeholder: string }>; fixed?: Record<string, unknown>; submit: string; success: string }) {
  const router = useRouter(); const [state, setState] = useState(idle);
  async function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setState({ pending: true, error: null, success: null }); try { const body = { ...fixed, ...Object.fromEntries(data) }; if (endpoint.endsWith("/agents")) body.externalRef = `agent-${crypto.randomUUID()}`; await api(endpoint, method, body); form.reset(); setState({ pending: false, error: null, success }); router.refresh(); } catch (error) { setState({ pending: false, error: message(error), success: null }); } }
  return <form onSubmit={onSubmit} className="grid gap-3">{fields.map((field) => <label key={field.name} className={labelClass}>{field.label}<input className={inputClass} name={field.name} placeholder={field.placeholder} required /></label>)}<Button variant="primary" loading={state.pending}>{submit}</Button><Feedback state={state} /></form>;
}
function message(error: unknown) { return error instanceof Error ? error.message : "Request could not be completed"; }
