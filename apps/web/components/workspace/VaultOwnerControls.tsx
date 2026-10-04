"use client";
import { useState, type FormEvent } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { useRouter } from "next/navigation";
import { buildDepositVault, buildWithdrawVault, buildSetVaultPaused, buildSetVaultWindowLimits } from "@allen-saji/praxis/vault";
import { toMist } from "@/lib/workspace-display";
import { Button } from "@/components/primitives/Button";
const inputClass = "focus-ring min-h-11 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 text-sm";
export function VaultOwnerControls({ packageId, vaultId, owner, paused }: { packageId: string; vaultId: string; owner: string; paused: boolean }) {
  const account = useCurrentAccount(); const signer = useSignAndExecuteTransaction(); const router = useRouter();
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null); const [digest, setDigest] = useState<string | null>(null);
  const connected = account?.address === owner;
  async function run(action: "deposit" | "withdraw" | "pause" | "windows", form?: FormData) {
    setPending(true); setError(null); setDigest(null);
    try {
      if (!connected) throw new Error("Connect the vault owner's wallet to continue.");
      const target = { packageId, vaultId, owner };
      const transaction = action === "pause" ? buildSetVaultPaused({ ...target, paused: !paused }) : action === "windows" ? buildSetVaultWindowLimits({ ...target, daily: BigInt(toMist(String(form?.get("daily")))), monthly: BigInt(toMist(String(form?.get("monthly")))) }) : action === "deposit" ? buildDepositVault({ ...target, amount: BigInt(toMist(String(form?.get("amount")))) }) : buildWithdrawVault({ ...target, amount: BigInt(toMist(String(form?.get("amount")))) });
      const result = await signer.mutateAsync({ transaction: await transaction.toJSON(), chain: "sui:testnet" });
      setDigest(result.digest); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Wallet action failed"); }
    finally { setPending(false); }
  }
  function submit(action: "deposit" | "withdraw" | "windows") { return (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void run(action, new FormData(event.currentTarget)); }; }
  return <div className="space-y-5">
    {!connected ? <p className="text-sm text-[var(--text-mid)]">Connect the vault owner's wallet to manage funds and permissions.</p> : null}
    <div className="grid gap-5 sm:grid-cols-2">{(["deposit", "withdraw"] as const).map((action) => <form key={action} onSubmit={submit(action)} className="grid gap-3 rounded border border-[var(--border)] p-4">
      <label className="grid gap-2 text-sm">{action === "deposit" ? "Deposit SUI" : "Withdraw SUI"}<input className={inputClass} name="amount" inputMode="decimal" placeholder="0.01" required disabled={pending} /></label>
      <p className="text-xs leading-5 text-[var(--text-low)]">{action === "deposit" ? "Only deposited funds are available to your agents." : "Funds return to your wallet. Withdrawal remains available while paused."}</p>
      <Button variant="primary" disabled={!connected || pending} type="submit">{action === "deposit" ? "Approve deposit" : "Approve withdrawal"}</Button>
    </form>)}</div>
    <details className="rounded border border-[var(--border)] p-4"><summary className="focus-ring cursor-pointer text-sm">Change daily and monthly limits</summary><form onSubmit={submit("windows")} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm">Daily limit (SUI)<input className={inputClass} name="daily" inputMode="decimal" required /></label><label className="grid gap-2 text-sm">Monthly limit (SUI)<input className={inputClass} name="monthly" inputMode="decimal" required /></label><p className="text-xs text-[var(--text-low)] sm:col-span-2">Changing limits preserves spending already recorded. The total allowance remains an additional ceiling.</p><Button variant="primary" disabled={!connected || pending}>Approve limit change</Button></form></details>
    <Button disabled={!connected || pending} onClick={() => void run("pause")}>{paused ? "Resume agent payments" : "Pause agent payments"}</Button>
    {pending ? <p role="status" className="text-sm">Waiting for your wallet...</p> : null}
    {error ? <p role="alert" className="text-sm text-[var(--risk-critical)]">{error}</p> : null}
    {digest ? <p role="status" className="text-sm">Transaction submitted. <a className="text-[var(--accent)] underline" href={`https://suiscan.xyz/testnet/tx/${digest}`} target="_blank" rel="noreferrer">Check confirmation</a></p> : null}
  </div>;
}
