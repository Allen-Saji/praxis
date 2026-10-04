import { assessRisk } from "./risk";
import { decodeSimulationResult } from "./decoding";
import { decodeBalanceChanges, decodeGas, type NormalizedSimulationReport } from "./simulation";
import { validateVaultTransaction } from "./vault-execution";
import { SUI_TYPE } from "./config";
import { normalizeSuiAddressStrict } from "./address";
import type { SuiTransport } from "./ports";
import type { SpendingPolicy } from "./types";
import type { VaultSpend } from "./vault";

/** Risk is evaluated against vault principal, not the delegate's gas wallet.
 * Actual RPC balance changes remain unchanged in the returned audit report.
 * The principal outflow used for risk is derived from the validated single call. */
export async function simulateVaultPayment(input: { transport: SuiTransport; bytes: Uint8Array; request: VaultSpend; maxGas: bigint; vaultBalance: bigint; daySpent: bigint; policy?: SpendingPolicy }): Promise<NormalizedSimulationReport> {
  validateVaultTransaction(input.bytes, input.request, input.maxGas);
  const raw = await input.transport.simulateTransaction({ transaction: input.bytes, checksEnabled: true, include: { effects: true, balanceChanges: true } });
  const decoded = decodeSimulationResult(raw);
  const sender = normalizeSuiAddressStrict(input.request.vaultId);
  const gasEstimate = decodeGas(decoded.effects);
  const balanceChanges = decodeBalanceChanges(decoded.balanceChanges, sender, SUI_TYPE);
  const risk = assessRisk({ simSuccess: decoded.status.success, balanceChanges: [{ owner: sender, coinType: SUI_TYPE, amount: (-input.request.amount).toString() }], gasEstimate, sender, recipient: input.request.recipient, amount: input.request.amount, coinType: SUI_TYPE, walletBalance: input.vaultBalance, daySpent: input.daySpent, policy: input.policy });
  return { ...risk, success: decoded.status.success, gasEstimate, balanceChanges, walletBalance: input.vaultBalance, rawEffects: decoded.effects };
}
