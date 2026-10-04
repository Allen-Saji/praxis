import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { normalizeSuiAddressStrict } from "./address";

/** Explicit unpublished-vault configuration. Never falls back to demo ids. */
export interface VaultTarget { packageId: string; vaultId: string }
export interface VaultPolicy { perPayment: bigint; allowance: bigint; recipients: string[] }
export interface VaultGrant extends VaultPolicy { agent: string; delegate: string; expiresMs: bigint; daily?: bigint; monthly?: bigint }
const MAX_U64 = (1n << 64n) - 1n;

function u64(value: bigint, label: string, positive = false): bigint {
  if (typeof value !== "bigint" || value < (positive ? 1n : 0n) || value > MAX_U64) throw new Error(`${label} must be a ${positive ? "positive " : ""}u64 bigint`);
  return value;
}
function packageAddress(value: string): string {
  const address = normalizeSuiAddressStrict(value);
  if (BigInt(address) === 0n) throw new Error("A published vault package ID is required");
  return address;
}
function policyArgs(tx: Transaction, policy: VaultPolicy) {
  u64(policy.perPayment, "perPayment", true);
  u64(policy.allowance, "allowance", true);
  if (policy.allowance < policy.perPayment) throw new Error("allowance must cover perPayment");
  if (!policy.recipients.length || policy.recipients.length > 32) throw new Error("One to 32 recipients are required");
  return [tx.pure.u64(policy.perPayment), tx.pure.u64(policy.allowance), tx.pure.vector("address", policy.recipients.map(normalizeSuiAddressStrict))];
}
function call(target: VaultTarget, method: string, sender: string) {
  const tx = new Transaction();
  tx.setSender(normalizeSuiAddressStrict(sender));
  return { tx, target: `${packageAddress(target.packageId)}::vault::${method}` as `${string}::${string}::${string}`, vault: tx.object(normalizeSuiAddressStrict(target.vaultId)) };
}

/** Builders do not sign, submit, fund gas, or authorize a hosted wallet. */
export function buildCreateVault(input: VaultPolicy & { packageId: string; owner: string }): Transaction {
  const tx = new Transaction();
  tx.setSender(normalizeSuiAddressStrict(input.owner));
  tx.moveCall({ target: `${packageAddress(input.packageId)}::vault::create`, arguments: policyArgs(tx, input) });
  return tx;
}

export function buildDepositVault(input: VaultTarget & { owner: string; amount: bigint }): Transaction {
  const { tx, target, vault } = call(input, "deposit", input.owner);
  // Owner pays gas; split only the explicitly requested SUI principal.
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(u64(input.amount, "amount", true))]);
  tx.moveCall({ target, arguments: [vault, coin] });
  return tx;
}

export function buildWithdrawVault(input: VaultTarget & { owner: string; amount: bigint }): Transaction {
  const { tx, target, vault } = call(input, "withdraw", input.owner);
  tx.moveCall({ target, arguments: [vault, tx.pure.u64(u64(input.amount, "amount", true))] });
  return tx;
}

export function buildSetVaultPolicy(input: VaultTarget & VaultPolicy & { owner: string }): Transaction {
  const { tx, target, vault } = call(input, "set_policy", input.owner);
  tx.moveCall({ target, arguments: [vault, ...policyArgs(tx, input)] });
  return tx;
}

export function buildSetVaultPaused(input: VaultTarget & { owner: string; paused: boolean }): Transaction {
  const { tx, target, vault } = call(input, "set_paused", input.owner);
  tx.moveCall({ target, arguments: [vault, tx.pure.bool(input.paused)] });
  return tx;
}

export function buildAuthorizeVaultAgent(input: VaultTarget & VaultGrant & { owner: string; update?: boolean }): Transaction {
  const { tx, target, vault } = call(input, input.update ? "update_grant" : "authorize", input.owner);
  const delegate = normalizeSuiAddressStrict(input.delegate);
  if (BigInt(delegate) === 0n) throw new Error("delegate must not be zero");
  tx.moveCall({ target, arguments: [vault, tx.pure.address(normalizeSuiAddressStrict(input.agent)), tx.pure.address(delegate), ...policyArgs(tx, input), tx.pure.u64(u64(input.expiresMs, "expiresMs", true)), tx.object("0x6")] });
  if (input.daily !== undefined || input.monthly !== undefined) {
    if (input.daily === undefined || input.monthly === undefined) throw new Error("Both calendar limits are required");
    u64(input.daily, "daily", true); u64(input.monthly, "monthly", true);
    if (input.monthly < input.daily) throw new Error("monthly must cover daily");
    tx.moveCall({ target: `${packageAddress(input.packageId)}::vault::set_agent_window_limits`, arguments: [vault, tx.pure.address(normalizeSuiAddressStrict(input.agent)), tx.pure.u64(input.daily), tx.pure.u64(input.monthly)] });
  }
  return tx;
}

export function buildRevokeVaultAgent(input: VaultTarget & { owner: string; agent: string }): Transaction {
  const { tx, target, vault } = call(input, "revoke", input.owner);
  tx.moveCall({ target, arguments: [vault, tx.pure.address(normalizeSuiAddressStrict(input.agent))] });
  return tx;
}

export interface VaultSpend extends VaultTarget {
  delegate: string;
  agent: string;
  recipient: string;
  amount: bigint;
  sequence: bigint;
  vaultVersion: bigint;
  grantVersion: bigint;
  evidence: string;
}

export function buildVaultSpend(input: VaultSpend): Transaction {
  const { tx, target, vault } = call(input, "spend", input.delegate);
  const evidence = new TextEncoder().encode(input.evidence);
  if (!evidence.length || evidence.length > 128) throw new Error("evidence must contain 1 to 128 UTF-8 bytes");
  tx.moveCall({ target, arguments: [vault, tx.pure.address(normalizeSuiAddressStrict(input.agent)), tx.pure.address(normalizeSuiAddressStrict(input.recipient)), tx.pure.u64(u64(input.amount, "amount", true)), tx.pure.u64(u64(input.sequence, "sequence")), tx.pure.u64(u64(input.vaultVersion, "vaultVersion")), tx.pure.u64(u64(input.grantVersion, "grantVersion")), tx.pure.vector("u8", [...evidence]), tx.object("0x6")] });
  return tx;
}


export function buildSetVaultWindowLimits(input: VaultTarget & { owner: string; daily: bigint; monthly: bigint; agent?: string }): Transaction {
  const { tx, target, vault } = call(input, input.agent === undefined ? "set_window_limits" : "set_agent_window_limits", input.owner);
  u64(input.daily, "daily", true);
  u64(input.monthly, "monthly", true);
  if (input.monthly < input.daily) throw new Error("monthly must cover daily");
  const args: TransactionArgument[] = [vault];
  if (input.agent !== undefined) args.push(tx.pure.address(normalizeSuiAddressStrict(input.agent)));
  args.push(tx.pure.u64(input.daily), tx.pure.u64(input.monthly));
  tx.moveCall({ target, arguments: args });
  return tx;
}
