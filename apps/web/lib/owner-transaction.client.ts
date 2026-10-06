import { SuiGrpcClient } from "@mysten/sui/grpc";
import { TransactionDataBuilder } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import type { SuiClientTypes } from "@mysten/sui/client";

type Result = SuiClientTypes.TransactionResult<{ effects: true }>;
type Transport = {
  executeTransaction(input: { transaction: Uint8Array; signatures: string[]; include: { effects: true } }): Promise<Result>;
  getTransaction(input: { digest: string; include: { effects: true } }): Promise<Result>;
};
const client = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });
class ConfirmedFailure extends Error {}
function confirmed(result: Result, digest: string) {
  const tx = result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
  if (tx.digest !== digest) throw new Error("Transaction response digest mismatch");
  if (!tx.status.success) throw new ConfirmedFailure(`Transaction failed on-chain: ${digest}. Review it before trying again.`);
  if (!tx.effects?.bcs) throw new Error("Transaction effects are not available yet");
  return { digest, rawEffects: Array.from(tx.effects.bcs) };
}

/** Retry only the already signed bytes. A transport timeout is not a failed transfer. */
export async function submitOwnerTransaction(
  input: { bytes: string; signature: string },
  transport: Transport = client,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const bytes = fromBase64(input.bytes);
  const digest = TransactionDataBuilder.getDigestFromBytes(bytes);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return confirmed(await transport.executeTransaction({ transaction: bytes, signatures: [input.signature], include: { effects: true } }), digest);
    } catch (error) {
      if (error instanceof ConfirmedFailure) throw error;
      try { return confirmed(await transport.getTransaction({ digest, include: { effects: true } }), digest); }
      catch (lookupError) { if (lookupError instanceof ConfirmedFailure) throw lookupError; }
      if (attempt < 2) await wait(1000 * (attempt + 1));
    }
  }
  throw new Error(`Transaction status is unknown: ${digest}. Check this digest on Sui Testnet before repeating the action.`);
}
