"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { normalizeSuiAddress, isValidSuiAddress } from "@mysten/sui/utils";
import { Button } from "@/components/primitives/Button";
import { sui, toMist } from "@/lib/workspace-display";
export type PolicyReview = { id: string; version: number; status: string; maxPerTxMist: string; maxPerDayMist: string; maxPerMonthMist: string; blockRiskScoreAt: number; policyHash: string; canonicalJson: unknown };
type Rule = { effect: "allow" | "deny"; recipient: string };
const field = "focus-ring min-h-11 w-full rounded border border-[var(--border-hi)] bg-[var(--bg)] px-3 text-sm";
function rulesOf(policy?: PolicyReview | null): Rule[] { return (policy?.canonicalJson as { rules?: Rule[] } | undefined)?.rules ?? []; }
async function post<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "Could not save policy"); return result;
}
export function PolicyEditor({ organizationId, scopeId, versions, active }: { organizationId: string; scopeId: string; versions: PolicyReview[]; active: PolicyReview | null }) {
  const router = useRouter(); const [review, setReview] = useState<PolicyReview | null>(null); const [rules, setRules] = useState<Rule[]>(rulesOf(active));
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError(null); setNotice(null);
    try {
      const normalized = rules.map((rule) => { if (!isValidSuiAddress(rule.recipient)) throw new Error("Check each recipient address"); return { ...rule, recipient: normalizeSuiAddress(rule.recipient) }; });
      const amounts = { maxPerTxMist: toMist(String(data.get("transaction"))), maxPerDayMist: toMist(String(data.get("day"))), maxPerMonthMist: toMist(String(data.get("month"))) };
      if (BigInt(amounts.maxPerDayMist) < BigInt(amounts.maxPerTxMist) || BigInt(amounts.maxPerMonthMist) < BigInt(amounts.maxPerDayMist)) throw new Error("Daily limit must cover one payment; monthly limit must cover one day");
      const result = await post<{ policyVersion: PolicyReview }>(`/api/workspaces/${organizationId}/policy-scopes/${scopeId}/versions`, { ...amounts, blockRiskScoreAt: Number(data.get("risk")), requireSimulation: true, rules: normalized });
      setReview(result.policyVersion); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save policy"); } finally { setPending(false); }
  }
  async function activate() {
    if (!review) return; setPending(true); setError(null);
    try { await post(`/api/workspaces/${organizationId}/policy-scopes/${scopeId}/versions/${review.id}/activate`); setNotice(`Version ${review.version} is active.`); setReview(null); router.refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Activation failed"); } finally { setPending(false); }
  }
  return <div className="space-y-6">
    {error ? <p role="alert" className="text-sm text-[var(--risk-critical)]">{error}</p> : null}{notice ? <p role="status" className="text-sm text-[var(--risk-low)]">{notice}</p> : null}
    {review ? <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--panel)] p-5"><h2 className="mb-4 font-semibold">Review version {review.version}</h2><PolicySummary policy={review} previous={active} /><p className="my-4 text-sm text-[var(--text-mid)]">Activating replaces these limits for new requests. Existing reservations remain in effect.</p><div className="flex flex-wrap gap-3"><Button type="button" variant="primary" loading={pending} onClick={activate}>Activate these limits</Button><Button type="button" onClick={() => setReview(null)}>Close review</Button></div></section> : null}
    <details open={!active} className="rounded-xl border border-[var(--border)] p-5"><summary className="focus-ring cursor-pointer font-semibold">{active ? "Change spending limits" : "Set spending limits"}</summary><form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
      {[["transaction", "Per payment (SUI)", active?.maxPerTxMist], ["day", "Per UTC day (SUI)", active?.maxPerDayMist], ["month", "Per UTC month (SUI)", active?.maxPerMonthMist]].map(([name, label, amount]) => <label key={name} className="grid gap-2 text-sm">{label}<input name={name} className={field} inputMode="decimal" placeholder="0.05" defaultValue={amount ? sui(amount) : ""} required /></label>)}
      <label className="grid gap-2 text-sm">Block at risk score<input className={field} name="risk" type="number" min={1} max={100} defaultValue={active?.blockRiskScoreAt ?? 80} required /></label>
      <fieldset className="space-y-3 sm:col-span-2"><legend className="mb-2 text-sm font-medium">Recipient rules</legend><p className="text-xs leading-5 text-[var(--text-mid)]">With no allow rules, any recipient may pass the other checks. Adding an allow rule restricts payments to that list. Deny rules block their recipients.</p>
        {rules.map((rule, index) => <div key={index} className="flex flex-wrap gap-2"><select aria-label={`Recipient ${index + 1} rule`} className={`${field} !w-24`} value={rule.effect} onChange={(event) => setRules(rules.map((item, i) => i === index ? { ...item, effect: event.target.value as Rule["effect"] } : item))}><option value="allow">Allow</option><option value="deny">Deny</option></select><input aria-label={`Recipient ${index + 1} address`} className={`${field} min-w-40 flex-1`} value={rule.recipient} placeholder="0x..." required onChange={(event) => setRules(rules.map((item, i) => i === index ? { ...item, recipient: event.target.value } : item))} /><Button type="button" onClick={() => setRules(rules.filter((_, i) => i !== index))} aria-label={`Remove recipient ${index + 1}`}>Remove</Button></div>)}
        <Button type="button" onClick={() => setRules([...rules, { effect: "allow", recipient: "" }])}>Add recipient</Button>
      </fieldset><p className="text-xs text-[var(--text-low)] sm:col-span-2">Every payment is simulated before signing.</p><div><Button variant="primary" loading={pending}>Save and review</Button></div>
    </form></details>
    <section><h2 className="mb-3 font-semibold">Version history</h2><div className="grid gap-3">{versions.map((version) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-4"><span className="text-sm">Version {version.version} <span className="ml-2 text-[var(--text-low)]">{version.status}</span></span>{version.status === "draft" ? <Button type="button" onClick={() => { setReview(version); setError(null); window.scrollTo({ top: 0, behavior: "instant" }); }}>Review draft</Button> : <details className="w-full"><summary className="focus-ring cursor-pointer text-sm text-[var(--text-mid)]">View limits</summary><div className="mt-4"><PolicySummary policy={version} /></div></details>}</div>)}</div></section>
  </div>;
}
export function PolicySummary({ policy, previous }: { policy: PolicyReview; previous?: PolicyReview | null }) {
  return <div className="space-y-4"><dl className="grid gap-3">{([['Per payment', 'maxPerTxMist'], ['Per UTC day', 'maxPerDayMist'], ['Per UTC month', 'maxPerMonthMist']] as const).map(([label, key]) => <div key={key} className="flex flex-wrap justify-between gap-2 border-b border-[var(--divider)] pb-2 text-sm"><dt>{label}</dt><dd>{previous && previous[key] !== policy[key] ? <span className="mr-2 text-[var(--text-low)]">{sui(previous[key])} SUI {"->"}</span> : null}{sui(policy[key])} SUI</dd></div>)}<div className="flex flex-wrap justify-between gap-2 text-sm"><dt>Risk threshold</dt><dd>{previous && previous.blockRiskScoreAt !== policy.blockRiskScoreAt ? `${previous.blockRiskScoreAt} -> ` : ""}{policy.blockRiskScoreAt}</dd></div></dl>
    <div className="text-sm"><p className="mb-2 font-medium">Recipients</p>{previous ? <details className="mb-3"><summary className="focus-ring cursor-pointer text-[var(--text-mid)]">Current recipient rules</summary><RuleList rules={rulesOf(previous)} /></details> : null}<RuleList rules={rulesOf(policy)} /></div>
    <details><summary className="focus-ring cursor-pointer text-xs text-[var(--text-low)]">Technical details</summary><p className="my-3 break-all font-mono text-xs">SHA-256 {policy.policyHash}</p><pre className="overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(policy.canonicalJson, null, 2)}</pre></details>
  </div>;
}
function RuleList({ rules }: { rules: Rule[] }) { return rules.length ? <ul className="space-y-2">{rules.map((rule) => <li key={rule.recipient} className="break-all rounded border border-[var(--border)] p-2 font-mono text-xs">{rule.effect}: {rule.recipient}</li>)}</ul> : <p className="text-[var(--text-mid)]">No recipient restrictions. Other policy checks still apply.</p>; }
