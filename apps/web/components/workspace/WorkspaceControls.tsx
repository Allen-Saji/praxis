"use client";

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
  const router = useRouter();
  const [state, setState] = useState(idle);
  async function login() {
    if (!account) return;
    setState({ pending: true, error: null, success: null });
    try {
      const challenge = await api<{ nonce: string; message: string }>("/api/auth/challenge", "POST", { address: account.address, network: "testnet" });
      const signed = await signer.mutateAsync({ message: new TextEncoder().encode(challenge.message) });
      await api("/api/auth/verify", "POST", { address: account.address, nonce: challenge.nonce, signature: signed.signature });
      setState({ pending: false, error: null, success: "Signed in. Loading workspaces..." });
      router.refresh();
    } catch (error) {
      setState({ pending: false, error: error instanceof Error ? error.message : "Sign-in failed", success: null });
    }
  }
  return <div className="grid gap-4">
    <div className="flex min-h-11 flex-wrap items-center gap-3"><span className="praxis-connect"><ConnectButton connectText="Connect Sui wallet" /></span>{account ? <span className="max-w-full truncate font-mono text-[11px] text-[var(--text-low)]">{account.address}</span> : null}</div>
    <Button type="button" variant="primary" onClick={login} disabled={!account} loading={state.pending}>Sign in with wallet</Button>
    <p className="text-[12px] leading-5 text-[var(--text-low)]">This asks for a personal-message signature. It is not a transaction, costs no gas, and cannot move funds.</p>
    <Feedback state={state} />
  </div>;
}

export function WorkspaceCreateForm() {
  const router = useRouter();
  const [state, setState] = useState(idle);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setState({ pending: true, error: null, success: null });
    try {
      const result = await api<{ organization: { slug: string } }>("/api/workspaces", "POST", { name: data.get("name"), slug: data.get("slug") });
      router.push(`/app/workspaces/${result.organization.slug}`); router.refresh();
    } catch (error) { setState({ pending: false, error: message(error), success: null }); }
  }
  return <form onSubmit={submit} className="grid gap-4">
    <label className={labelClass}>Workspace name<input className={inputClass} name="name" required maxLength={80} placeholder="Praxis Labs" /></label>
    <label className={labelClass}>URL slug<input className={inputClass} name="slug" required minLength={3} maxLength={48} pattern="[a-z0-9][a-z0-9-]{1,46}[a-z0-9]" placeholder="praxis-labs" /></label>
    <Button variant="primary" loading={state.pending}>Create workspace</Button><Feedback state={state} />
  </form>;
}

export function RegisterWalletForm({ organizationId }: { organizationId: string }) {
  return <SimpleForm endpoint={`/api/workspaces/${organizationId}/wallets`} method="POST" success="Wallet registered. Add and activate its policy before creating assignments." fields={[
    { name: "label", label: "Wallet label", placeholder: "Operations Treasury" },
    { name: "suiAddress", label: "Canonical Sui address", placeholder: "0x..." },
  ]} fixed={{ network: "testnet", adapterType: "demo_keypair" }} submit="Register Testnet wallet" />;
}

export function CreateAgentForm({ organizationId }: { organizationId: string }) {
  return <SimpleForm endpoint={`/api/workspaces/${organizationId}/agents`} method="POST" success="Agent created." fields={[
    { name: "name", label: "Agent name", placeholder: "Research Agent" },
    { name: "externalRef", label: "External reference", placeholder: "research-agent-v1" },
  ]} submit="Create agent" />;
}

export function CreateAssignmentForm({ organizationId, wallets, agents }: { organizationId: string; wallets: Array<{ id: string; label: string }>; agents: Array<{ id: string; name: string }> }) {
  const router = useRouter(); const [state, setState] = useState(idle);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setState({ pending: true, error: null, success: null });
    try { await api(`/api/workspaces/${organizationId}/assignments`, "POST", { walletId: data.get("walletId"), agentId: data.get("agentId") }); setState({ pending: false, error: null, success: "Assignment created disabled with a cloned policy draft." }); router.refresh(); }
    catch (error) { setState({ pending: false, error: message(error), success: null }); }
  }
  return <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
    <label className={labelClass}>Wallet<select className={inputClass} name="walletId" required defaultValue=""><option value="" disabled>Select wallet</option>{wallets.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
    <label className={labelClass}>Agent<select className={inputClass} name="agentId" required defaultValue=""><option value="" disabled>Select agent</option>{agents.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <div className="sm:col-span-2"><Button variant="primary" loading={state.pending} disabled={!wallets.length || !agents.length}>Create assignment</Button></div><div className="sm:col-span-2"><Feedback state={state} /></div>
  </form>;
}

export function StatusAction({ endpoint, method = "PATCH", status, label, danger = false }: { endpoint: string; method?: string; status?: string; label: string; danger?: boolean }) {
  const router = useRouter(); const [state, setState] = useState(idle);
  async function run() { setState({ pending: true, error: null, success: null }); try { await api(endpoint, method, status ? { status } : undefined); setState({ pending: false, error: null, success: `${label} complete.` }); router.refresh(); } catch (error) { setState({ pending: false, error: message(error), success: null }); } }
  return <div className="grid gap-2"><Button type="button" variant={danger ? "danger" : "secondary"} onClick={run} loading={state.pending}>{label}</Button><Feedback state={state} /></div>;
}

export function PolicyDraftForm({ organizationId, scopeId }: { organizationId: string; scopeId: string }) {
  const router = useRouter(); const [state, setState] = useState(idle); const [review, setReview] = useState<{ id: string; version: number; policyHash: string; canonicalJson: unknown } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setState({ pending: true, error: null, success: null });
    try {
      const rules = String(data.get("rules") ?? "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [effect, recipient] = line.split(/\s+/, 2); return { effect, recipient }; });
      const result = await api<{ policyVersion: typeof review }>(`/api/workspaces/${organizationId}/policy-scopes/${scopeId}/versions`, "POST", { maxPerTxMist: data.get("maxPerTxMist"), maxPerDayMist: data.get("maxPerDayMist"), maxPerMonthMist: data.get("maxPerMonthMist"), blockRiskScoreAt: Number(data.get("blockRiskScoreAt")), requireSimulation: true, rules });
      setReview(result.policyVersion); setState({ pending: false, error: null, success: "Draft saved. Review the normalized policy and hash before activation." }); router.refresh();
    } catch (error) { setState({ pending: false, error: message(error), success: null }); }
  }
  async function activate() { if (!review) return; setState({ pending: true, error: null, success: null }); try { await api(`/api/workspaces/${organizationId}/policy-scopes/${scopeId}/versions/${review.id}/activate`, "POST"); setState({ pending: false, error: null, success: `Policy v${review.version} activated.` }); setReview(null); router.refresh(); } catch (error) { setState({ pending: false, error: message(error), success: null }); } }
  return <div className="grid gap-5">
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <MoneyField name="maxPerTxMist" label="Per transaction (MIST)" placeholder="50000000" /><MoneyField name="maxPerDayMist" label="Per day (MIST)" placeholder="100000000" /><MoneyField name="maxPerMonthMist" label="Per month (MIST)" placeholder="1000000000" />
      <label className={labelClass}>Block at risk score<input className={inputClass} name="blockRiskScoreAt" type="number" min="1" max="100" defaultValue="80" required /></label>
      <label className={`${labelClass} sm:col-span-2`}>Recipient rules, one per line<textarea className={`${inputClass} min-h-24 py-2`} name="rules" placeholder="allow 0x...&#10;deny 0x..." /></label>
      <p className="sm:col-span-2 text-[12px] text-[var(--text-low)]">Simulation is always required. Mainnet and sealed reasoning are unavailable in hosted Phase 1.</p>
      <div className="sm:col-span-2"><Button variant="primary" loading={state.pending}>Save policy draft</Button></div>
    </form>
    <Feedback state={state} />
    {review ? <div className="rounded-[var(--r-sm)] border border-[var(--accent)]/30 bg-[var(--accent-tint)] p-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><Check className="h-4 w-4 text-[var(--accent)]" />Activation review</div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-black/25 p-3 font-mono text-[11px] text-[var(--text-mid)]">{JSON.stringify(review.canonicalJson, null, 2)}</pre>
      <p className="mt-3 break-all font-mono text-[11px] text-[var(--text-mid)]">SHA-256 {review.policyHash}</p>
      <Button className="mt-4" type="button" variant="primary" onClick={activate} loading={state.pending}>Activate reviewed policy v{review.version}</Button>
    </div> : null}
  </div>;
}

export function CredentialIssue({ organizationId, assignmentId }: { organizationId: string; assignmentId: string }) {
  const router = useRouter(); const [state, setState] = useState(idle); const [token, setToken] = useState<string | null>(null); const [copied, setCopied] = useState(false); const dismissRef = useRef<HTMLButtonElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setState({ pending: true, error: null, success: null }); try { const result = await api<{ token: string }>(`/api/workspaces/${organizationId}/assignments/${assignmentId}/credentials`, "POST", { name: data.get("name") }); setToken(result.token); setState({ pending: false, error: null, success: null }); router.refresh(); } catch (error) { setState({ pending: false, error: message(error), success: null }); } }
  async function copy() { if (!token) return; await navigator.clipboard.writeText(token); setCopied(true); }
  function dismiss() { setToken(null); setCopied(false); }
  useEffect(() => {
    if (!token) return;
    dismissRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [token]);
  return <><form onSubmit={submit} className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end"><label className={`${labelClass} min-w-0 flex-1`}>Credential name<input className={inputClass} name="name" required maxLength={64} placeholder="demo-runner" /></label><Button variant="secondary" loading={state.pending}><KeyRound className="h-4 w-4" />Issue credential</Button><Feedback state={state} /></form>
    {token ? <div role="dialog" aria-modal="true" aria-labelledby="credential-title" className="fixed inset-0 z-[var(--z-palette)] grid place-items-center bg-black/70 p-4"><div className="glass-solid w-full max-w-xl rounded-[var(--r-lg)] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><h2 id="credential-title" className="font-display text-xl font-semibold">Copy credential now</h2><p className="mt-2 text-[13px] text-[var(--risk-medium)]">This token is shown once. Praxis cannot reopen it after dismissal.</p></div><Button ref={dismissRef} type="button" size="icon" variant="ghost" onClick={dismiss} aria-label="Dismiss credential"><X className="h-5 w-5" /></Button></div>
      <div className="mt-5 flex min-w-0 items-center rounded border border-[var(--border-hi)] bg-black/30 p-2"><code className="min-w-0 flex-1 break-all px-2 font-mono text-[12px]">{token}</code><Button type="button" size="icon" onClick={copy} aria-label="Copy credential">{copied ? <Check className="h-4 w-4 text-[var(--risk-low)]" /> : <Copy className="h-4 w-4" />}</Button></div>
      <Button className="mt-5 w-full" type="button" variant={copied ? "primary" : "secondary"} onClick={dismiss}>{copied ? "I stored this token" : "Dismiss without copy"}</Button>
    </div></div> : null}</>;
}

export function LogoutButton() { const router = useRouter(); const [pending, setPending] = useState(false); async function logout() { setPending(true); await api("/api/auth/logout", "POST").catch(() => null); router.push("/app/workspaces"); router.refresh(); } return <Button type="button" variant="secondary" onClick={logout} loading={pending}><LogOut className="h-4 w-4" />Sign out</Button>; }

function SimpleForm({ endpoint, method, fields, fixed = {}, submit, success }: { endpoint: string; method: string; fields: Array<{ name: string; label: string; placeholder: string }>; fixed?: Record<string, unknown>; submit: string; success: string }) {
  const router = useRouter(); const [state, setState] = useState(idle);
  async function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setState({ pending: true, error: null, success: null }); try { await api(endpoint, method, { ...fixed, ...Object.fromEntries(data) }); event.currentTarget.reset(); setState({ pending: false, error: null, success }); router.refresh(); } catch (error) { setState({ pending: false, error: message(error), success: null }); } }
  return <form onSubmit={onSubmit} className="grid gap-3">{fields.map((field) => <label key={field.name} className={labelClass}>{field.label}<input className={inputClass} name={field.name} placeholder={field.placeholder} required /></label>)}<Button variant="primary" loading={state.pending}>{submit}</Button><Feedback state={state} /></form>;
}
function MoneyField({ name, label, placeholder }: { name: string; label: string; placeholder: string }) { return <label className={labelClass}>{label}<input className={inputClass} name={name} inputMode="numeric" pattern="[1-9][0-9]*" placeholder={placeholder} required /></label>; }
function message(error: unknown) { return error instanceof Error ? error.message : "Request could not be completed"; }
