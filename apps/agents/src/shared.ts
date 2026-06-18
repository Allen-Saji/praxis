import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { blake3Hex, KeypairAdapter, Praxis } from "@praxis/sdk";
import type { SpendArgs, SpendingPolicy, SpendResult } from "@praxis/sdk";

/** Deterministic 32-byte address from a label, for stable demo identities. */
export function addr(label: string): string {
  return `0x${blake3Hex(`praxis:${label}`)}`;
}

/** Logical agent identities (no keys; the operator wallet signs for all). */
export const AGENT = {
  researcher: addr("agent:researcher"),
  trader: addr("agent:trader"),
  attacker: addr("agent:attacker"),
} as const;

/** Stand-in payees: data APIs, DEX routers, and an exfiltration wallet. */
export const PAYEE = {
  coingecko: addr("payee:coingecko-pro"),
  dune: addr("payee:dune-analytics"),
  defillama: addr("payee:defillama-pro"),
  cetus: addr("payee:cetus-router"),
  turbos: addr("payee:turbos-router"),
  unknownVendor: addr("payee:unlisted-data-vendor"),
  exfilWallet: addr("payee:exfil-wallet"),
} as const;

export function sui(amount: number): bigint {
  return BigInt(Math.round(amount * 1e9));
}

export interface AgentContext {
  keypair: Ed25519Keypair;
  client: SuiJsonRpcClient;
  wallet: KeypairAdapter;
  address: string;
}

export function loadContext(): AgentContext {
  const key = process.env.PRAXIS_OPERATOR_KEY;
  if (!key) throw new Error("PRAXIS_OPERATOR_KEY is not set (export your suiprivkey)");
  const keypair = Ed25519Keypair.fromSecretKey(key);
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" });
  const wallet = new KeypairAdapter(keypair, client);
  return { keypair, client, wallet, address: keypair.toSuiAddress() };
}

export function makePraxis(ctx: AgentContext, policy?: SpendingPolicy): Praxis {
  return new Praxis({
    network: "testnet",
    wallet: ctx.wallet,
    policy,
    sealSecret: process.env.PRAXIS_SEAL_SECRET,
  });
}

/** One spend an agent attempts. `agent` is filled in by `attempt`. */
export type SpendJob = Omit<SpendArgs, "agent">;

/** Run a job through Praxis and print a one-line outcome. */
export async function attempt(praxis: Praxis, agent: string, job: SpendJob): Promise<SpendResult> {
  const res = await praxis.spend({ agent, autoConfirm: true, ...job });
  printOutcome(job, res);
  return res;
}

function printOutcome(job: SpendJob, res: SpendResult): void {
  const status = res.status === "confirmed" ? "CONFIRMED" : `ABORTED ${res.abortReason}`;
  const codes = res.simulationReport.risks.map((r) => r.code).join(",") || "none";
  const sealed = job.privacy === "sealed" ? " [sealed]" : "";
  console.log(
    `  ${status.padEnd(24)} ${formatSui(job.amount)} SUI  risk=${String(res.simulationReport.riskScore).padStart(3)}  ${codes}${sealed}`,
  );
  console.log(`     ${job.reasoning.decision}`);
}

function formatSui(mist: bigint): string {
  return (Number(mist) / 1e9).toFixed(3);
}
