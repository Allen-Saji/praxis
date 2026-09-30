"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/primitives/Button";

const field = "focus-ring min-h-11 w-full rounded border border-[var(--border-hi)] bg-[var(--bg)] px-3 text-base sm:text-sm";

export function WalletAgentSetup({ organizationId, walletId, slug, agents }: {
  organizationId: string; walletId: string; slug: string; agents: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("new");
  const [name, setName] = useState("");
  const [createdAgent, setCreatedAgent] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`/api/workspaces/${organizationId}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? "Could not complete setup. Your agent is saved if it was created.");
    return result as T;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError(null);
    try {
      let agentId = selected === "new" ? createdAgent : selected;
      if (!agentId) {
        const result = await post<{ agent: { id: string } }>("agents", { name: name.trim(), externalRef: `agent-${crypto.randomUUID()}` });
        agentId = result.agent.id;
        setCreatedAgent(agentId);
      }
      const result = await post<{ policyScope: { id: string } }>("assignments", { walletId, agentId });
      router.push(`/app/workspaces/${slug}/policies/${result.policyScope.id}`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Setup could not be completed");
      router.refresh();
    } finally { setPending(false); }
  }

  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm leading-6 text-[var(--text-mid)]">Choose an agent, review its limits, then enable access and issue its credential. Payments stay disabled until you finish.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm">Agent<select className={field} value={selected} disabled={pending || !!createdAgent} onChange={(event) => setSelected(event.target.value)}><option value="new">Create a new agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
      {selected === "new" ? <label className="grid gap-2 text-sm">Agent name<input className={field} value={name} disabled={pending || !!createdAgent} onChange={(event) => setName(event.target.value)} required maxLength={64} placeholder="Research agent" /></label> : null}
    </div>
    {createdAgent ? <p className="text-sm text-[var(--text-mid)]">Agent saved. Retry to finish wallet access, or <Link className="focus-ring text-[var(--accent)] underline" href={`/app/workspaces/${slug}/agents/${createdAgent}`}>continue from its agent page</Link>.</p> : null}
    {error ? <p role="alert" className="text-sm text-[var(--risk-high)]">{error}</p> : null}
    <Button variant="primary" loading={pending} disabled={selected === "new" && !name.trim()}>Continue to agent limits</Button>
  </form>;
}
