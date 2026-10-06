"use client";
import { useState, useEffect, type FormEvent } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { submitOwnerTransaction } from "@/lib/owner-transaction.client";
import { useRouter } from "next/navigation";
import { buildCreateVault } from "@allen-saji/praxis/vault";
import { Button } from "@/components/primitives/Button";
import { toMist } from "@/lib/workspace-display";

const inputClass = "focus-ring min-h-11 w-full rounded-[var(--r-sm)] border border-[var(--border-hi)] bg-[var(--bg)] px-3 text-sm";
export function CreateVaultForm({ organizationId, packageId, ownerAddress }: { organizationId: string; packageId: string; ownerAddress: string }) {
  const account = useCurrentAccount();
  const signer = useSignAndExecuteTransaction({ execute: submitOwnerTransaction });
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ digest: string; label: string } | null>(null);
  const [complete, setComplete] = useState(false);
  const recoveryKey = `praxis-vault-create:${organizationId}:${ownerAddress}:${packageId}`;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.digest === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(saved.digest) && typeof saved.label === "string") setCreated(saved);
    } catch { /* Storage may be unavailable; the wallet retains transaction history. */ }
  }, [recoveryKey]);
  async function register(result: { digest: string; label: string }) {
    const response = await fetch(`/api/workspaces/${organizationId}/vaults`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: result.label, transactionDigest: result.digest }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Vault registration failed. Retry without creating another vault.");
    setComplete(true);
    try { sessionStorage.removeItem(recoveryKey); } catch { /* Optional recovery cache. */ }
    router.refresh();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null);
    try {
      if (!account || account.address !== ownerAddress) throw new Error("Connect the wallet you used to sign in.");
      if (created) { await register(created); return; }
      const form = new FormData(event.currentTarget);
      const label = String(form.get("label")).trim();
      const transaction = buildCreateVault({ packageId, owner: ownerAddress, perPayment: BigInt(toMist(String(form.get("perPayment")))), allowance: BigInt(toMist(String(form.get("allowance")))), recipients: [String(form.get("recipient")).trim()] });
      const result = await signer.mutateAsync({ transaction: await transaction.toJSON(), chain: "sui:testnet" });
      const recovery = { digest: result.digest, label };
      setCreated(recovery);
      try { sessionStorage.setItem(recoveryKey, JSON.stringify(recovery)); } catch { /* Keep in-memory recovery. */ }
      await register(recovery);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Vault setup failed"); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="grid max-w-xl gap-5">
    <p className="text-sm leading-6 text-[var(--text-mid)]">Create a spending vault controlled by your wallet. This approval creates an empty vault on Sui Testnet. You pay network gas; no deposit is made.</p>
    <fieldset disabled={pending || !!created || complete} className="grid gap-4 disabled:opacity-70">
      <label className="grid gap-2 text-sm">Vault name<input className={inputClass} name="label" required maxLength={64} placeholder="Agent spending" /></label>
      <label className="grid gap-2 text-sm">Allowed recipient<input className={`${inputClass} font-mono`} name="recipient" required placeholder="0x..." /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">Maximum per payment (SUI)<input className={inputClass} name="perPayment" inputMode="decimal" required defaultValue="0.001" /></label>
        <label className="grid gap-2 text-sm">Total spending allowance (SUI)<input className={inputClass} name="allowance" inputMode="decimal" required defaultValue="0.01" /></label>
      </div>
      <p className="text-xs leading-5 text-[var(--text-low)]">Daily and monthly ceilings initially equal the total allowance. Creating a vault does not authorize an agent or give Praxis access to the rest of your wallet.</p>
    </fieldset>
    {created ? <p role="status" className="break-all text-xs text-[var(--text-mid)]">Creation submitted: {created.digest}. {complete ? "Vault registered." : "Retry registration if confirmation is still pending; this will not create another vault."}</p> : null}
    {error ? <p role="alert" className="text-sm text-[var(--risk-critical)]">{error}</p> : null}
    {!complete ? <Button variant="primary" loading={pending} disabled={!account || account.address !== ownerAddress}>{created ? "Retry registration" : "Create vault in wallet"}</Button> : null}
  </form>;
}
