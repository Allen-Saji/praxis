import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddressStrict } from "./address";
import { PraxisSdkError } from "./errors";
import { decodeSimulationResult } from "./decoding";
import { assessRisk } from "./risk";
import { SUI_TYPE } from "./config";
import type { SuiTransport } from "./ports";
import type { BalanceDelta, SimulationReport, SpendingPolicy } from "./types";

export type TransferTransactionInput = {
  sender: string;
  recipient: string;
  amount: bigint;
};

/** Build the exact SUI transfer transaction used by simulation and execution. */
export function buildSuiTransferTransaction(input: TransferTransactionInput): Transaction {
  const sender = normalizeAddress(input.sender);
  const recipient = normalizeAddress(input.recipient);
  assertAmount(input.amount);
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(input.amount)]);
  tx.transferObjects([coin], tx.pure.address(recipient));
  tx.setSender(sender);
  return tx;
}

export interface SimulateSuiTransferInput {
  transport: SuiTransport;
  transaction: Uint8Array | Transaction;
  sender: string;
  recipient: string;
  amount: bigint;
  coinType?: string;
  daySpent?: bigint;
  policy?: SpendingPolicy;
  typicalGas?: bigint;
}

export type NormalizedSimulationReport = SimulationReport & {
  walletBalance: bigint;
};

/** Simulate a transfer through an injected transport and normalize Core API output. */
export async function simulateSuiTransfer(input: SimulateSuiTransferInput): Promise<NormalizedSimulationReport> {
  const sender = normalizeAddress(input.sender);
  const recipient = normalizeAddress(input.recipient);
  const coinType = input.coinType ?? SUI_TYPE;
  if (coinType !== SUI_TYPE) throw new PraxisSdkError("UNSUPPORTED_COIN", "Phase 1 supports SUI only");
  assertAmount(input.amount);

  let raw: unknown;
  try {
    raw = await input.transport.simulateTransaction({
      transaction: input.transaction,
      checksEnabled: true,
      include: { balanceChanges: true, effects: true, commandResults: true },
    });
  } catch (cause) {
    throw new PraxisSdkError("SIMULATION_FAILED", "Sui simulation could not be completed", { cause, retryable: true });
  }
  const decoded = decodeSimulationResult(raw);
  const gasEstimate = decodeGas(decoded.effects);
  const balanceChanges = decodeBalanceChanges(decoded.balanceChanges, sender, coinType);
  const walletBalance = await readBalance(input.transport, sender, coinType);
  const report = assessRisk({
    simSuccess: decoded.status.success,
    balanceChanges,
    gasEstimate,
    sender,
    recipient,
    amount: input.amount,
    coinType,
    walletBalance,
    daySpent: input.daySpent ?? 0n,
    policy: input.policy,
    typicalGas: input.typicalGas,
  });
  return { ...report, success: decoded.status.success, balanceChanges, gasEstimate, rawEffects: decoded.effects, walletBalance };
}

function normalizeAddress(value: string): string {
  try {
    return normalizeSuiAddressStrict(value);
  } catch (cause) {
    throw new PraxisSdkError("INVALID_ADDRESS", "address is not a valid Sui address", { cause });
  }
}

function assertAmount(value: bigint): void {
  if (typeof value !== "bigint" || value <= 0n || value > 18_446_744_073_709_551_615n) {
    throw new PraxisSdkError("INVALID_AMOUNT", "amount must be a positive u64 value");
  }
}

async function readBalance(transport: SuiTransport, owner: string, coinType: string): Promise<bigint> {
  try {
    const value = await transport.getBalance({ owner, coinType });
    if (!isRecord(value) || !isRecord(value.balance) || typeof value.balance.balance !== "string" || !/^\d+$/.test(value.balance.balance)) {
      throw new Error("malformed balance response");
    }
    return BigInt(value.balance.balance);
  } catch (cause) {
    if (cause instanceof PraxisSdkError) throw cause;
    throw new PraxisSdkError("BALANCE_UNAVAILABLE", "wallet balance is unavailable; spend blocked", { cause, retryable: true });
  }
}

function decodeBalanceChanges(value: Array<Record<string, unknown>> | undefined, sender: string, coinType: string): BalanceDelta[] {
  if (!value) throw new PraxisSdkError("MALFORMED_SIMULATION", "simulation balance changes are missing");
  return value.map((change) => {
    if (typeof change.address !== "string" || typeof change.coinType !== "string" || typeof change.amount !== "string" || !/^-?\d+$/.test(change.amount)) {
      throw new PraxisSdkError("MALFORMED_SIMULATION", "simulation balance change is malformed");
    }
    let owner: string;
    try {
      owner = normalizeSuiAddressStrict(change.address);
    } catch (cause) {
      throw new PraxisSdkError("MALFORMED_SIMULATION", "simulation balance owner is malformed", { cause });
    }
    // Normalize every address before comparison and retain unrelated coins for
    // audit visibility; risk calculation filters by sender and coin type.
    void sender;
    return { owner, coinType: change.coinType, amount: change.amount };
  });
}

function decodeGas(effects: Record<string, unknown> | undefined): bigint {
  const gasUsed = effects?.gasUsed;
  if (!isRecord(gasUsed)) throw new PraxisSdkError("MALFORMED_SIMULATION", "simulation gas data is missing");
  const fields = ["computationCost", "storageCost", "storageRebate"];
  if (fields.some((key) => typeof gasUsed[key] !== "string" || !/^\d+$/.test(gasUsed[key] as string))) {
    throw new PraxisSdkError("MALFORMED_SIMULATION", "simulation gas data is malformed");
  }
  const total = BigInt(gasUsed.computationCost as string) + BigInt(gasUsed.storageCost as string) - BigInt(gasUsed.storageRebate as string);
  return total < 0n ? 0n : total;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
