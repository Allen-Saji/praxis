"use client";
import { useState, type FormEvent } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { submitOwnerTransaction } from "@/lib/owner-transaction.client";
import { useRouter } from "next/navigation";
import { buildAuthorizeVaultAgent, buildRevokeVaultAgent } from "@allen-saji/praxis/vault";
import { toMist } from "@/lib/workspace-display";
import { Button } from "@/components/primitives/Button";
const field = "focus-ring min-h-11 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 text-sm";
export function VaultAgentControls({ organizationId, assignmentId, owner, vaultId, packageId, agent, hasGrant }: { organizationId: string; assignmentId: string; owner: string; vaultId: string; packageId: string; agent: string; hasGrant: boolean | null }) {
  const account = useCurrentAccount(); const signer = useSignAndExecuteTransaction({ execute: submitOwnerTransaction }); const router = useRouter();
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null); const [digest, setDigest] = useState<string | null>(null); const [activated, setActivated] = useState(false);
  const connected = account?.address === owner;
  async function run(form: FormData | null) {
    setPending(true); setError(null); setDigest(null);
    try {
      if (!connected) throw new Error("Connect the vault owner's wallet.");
      let tx;
      if (!form) tx = buildRevokeVaultAgent({ packageId, vaultId, owner, agent });
      else {
        if (hasGrant === null) throw new Error("Grant state could not be checked. Refresh before authorizing.");
        const hours = Number(form.get("hours"));
        if (!Number.isInteger(hours) || hours < 1 || hours > 720) throw new Error("Choose an expiry from 1 to 720 hours.");
        const response = await fetch(`/api/workspaces/${organizationId}/assignments/${assignmentId}/delegate`, { method: "POST" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? "Delegate setup is unavailable.");
        if (result.packageId !== packageId || result.vaultId !== vaultId || result.agent !== agent || result.network !== "testnet") throw new Error("Delegate scope does not match this vault.");
        tx = buildAuthorizeVaultAgent({ packageId, vaultId, owner, agent, delegate: result.delegate, perPayment: BigInt(toMist(String(form.get("perPayment")))), allowance: BigInt(toMist(String(form.get("allowance")))), daily: BigInt(toMist(String(form.get("daily")))), monthly: BigInt(toMist(String(form.get("monthly")))), recipients: [String(form.get("recipient")).trim()], expiresMs: BigInt(Date.now() + hours * 3600000), update: hasGrant });
      }
      const result = await signer.mutateAsync({ transaction: await tx.toJSON(), chain: "sui:testnet" });
      setDigest(result.digest); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Agent authorization failed"); }
    finally { setPending(false); }
  }
  async function fundGas() {
    setPending(true); setError(null); setDigest(null);
    try {
      if (!connected) throw new Error("Connect the vault owner's wallet.");
      const response = await fetch(`/api/workspaces/${organizationId}/assignments/${assignmentId}/delegate`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Delegate setup is unavailable.");
      if (result.packageId !== packageId || result.vaultId !== vaultId || result.agent !== agent || result.network !== "testnet" || !/^0x[0-9a-f]{64}$/.test(result.delegate)) throw new Error("Delegate scope does not match this vault.");
      const tx = new Transaction(); tx.setSender(owner);
      const [gasCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(50_000_000n)]);
      tx.transferObjects([gasCoin], result.delegate);
      const funded = await signer.mutateAsync({ transaction: await tx.toJSON(), chain: "sui:testnet" });
      setDigest(funded.digest); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Agent gas funding failed"); }
    finally { setPending(false); }
  }
  async function activate() {
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/workspaces/${organizationId}/assignments/${assignmentId}/activate-vault`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Hosted access could not be enabled.");
      setActivated(true); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Activation failed"); }
    finally { setPending(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void run(new FormData(event.currentTarget)); }
  return <div className="space-y-4">
    <details className="rounded border border-[var(--border)] p-4"><summary className="focus-ring cursor-pointer text-sm">{hasGrant ? "Update agent authorization" : "Authorize agent in your wallet"}</summary>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm sm:col-span-2">Allowed recipient<input className={field} name="recipient" placeholder="0x..." required /></label>
        {[["perPayment", "Per payment (SUI)", "0.001"], ["daily", "Daily limit (SUI)", "0.001"], ["monthly", "Monthly limit (SUI)", "0.01"], ["allowance", "Total allowance (SUI)", "0.01"], ["hours", "Expires after (hours)", "24"]].map(([name, label, value]) => <label key={name} className="grid gap-2 text-sm">{label}<input className={field} name={name} inputMode="decimal" defaultValue={value} required disabled={pending} /></label>)}
        <p className="text-xs leading-5 text-[var(--text-low)] sm:col-span-2">This approval lets the hosted delegate make SUI payments from this vault within these limits. It does not access the rest of your wallet. Updating permissions preserves recorded spending.</p>
        <Button variant="primary" disabled={!connected || pending || hasGrant === null}>Approve agent access</Button>
      </form>
    </details>
    {hasGrant ? <div className="space-y-2 rounded border border-[var(--border)] p-4">
      <p className="text-sm">Agent transaction fees</p>
      <p className="text-xs leading-5 text-[var(--text-low)]">Send 0.05 Testnet SUI from your connected wallet to this agent's delegate for network fees. This is separate from vault funds and cannot be withdrawn through the vault. Each click requests another top-up in your wallet.</p>
      <Button disabled={!connected || pending} onClick={() => void fundGas()}>Fund agent gas: 0.05 Testnet SUI</Button>
    </div> : null}
    {hasGrant ? <Button variant="primary" disabled={pending || activated} onClick={() => void activate()}>{activated ? "Hosted access enabled" : "Verify and enable hosted access"}</Button> : null}
    {hasGrant ? <Button disabled={!connected || pending} onClick={() => void run(null)}>Revoke on-chain access</Button> : null}
    {error ? <p role="alert" className="text-sm text-[var(--risk-critical)]">{error}</p> : null}
    {pending ? <p role="status" className="text-sm">Processing your request...</p> : null}
    {digest ? <p role="status" className="text-sm">Approval submitted. <a className="text-[var(--accent)] underline" href={`https://suiscan.xyz/testnet/tx/${digest}`} target="_blank" rel="noreferrer">Check confirmation</a></p> : null}
  </div>;
}
