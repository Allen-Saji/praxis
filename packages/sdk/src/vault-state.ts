import { bcs } from "@mysten/sui/bcs";
import { normalizeSuiAddressStrict } from "./address";
import type { SuiTransport } from "./ports";
import type { VaultTarget } from "./vault";

const Budget = bcs.struct("Budget", {
  daily_limit: bcs.u64(), monthly_limit: bcs.u64(), day: bcs.u64(), month: bcs.u64(), daily_spent: bcs.u64(), monthly_spent: bcs.u64(),
});
export const VaultBcs = bcs.struct("Vault", {
  id: bcs.Address, owner: bcs.Address, funds: bcs.u64(), paused: bcs.bool(), version: bcs.u64(),
  per_payment: bcs.u64(), allowance: bcs.u64(), spent: bcs.u64(), budget: Budget,
  recipients: bcs.vector(bcs.Address), grants: bcs.struct("Table", { id: bcs.Address, size: bcs.u64() }),
});
export type VaultState = ReturnType<typeof VaultBcs.parse>;

/** BCS avoids provider-specific JSON layouts. Deployment must be a trusted,
 * network-pinned configuration, never an arbitrary package supplied by a user. */
export async function readVaultState(transport: SuiTransport, target: VaultTarget): Promise<VaultState> {
  const packageId = normalizeSuiAddressStrict(target.packageId);
  const vaultId = normalizeSuiAddressStrict(target.vaultId);
  if (BigInt(packageId) === 0n) throw new Error("Vault package has not been deployed");
  const raw = await transport.getObject({ objectId: vaultId, include: { content: true } });
  if (!raw || typeof raw !== "object" || !("object" in raw)) throw new Error("Vault object is unavailable");
  const object = raw.object;
  if (!object || typeof object !== "object" || !("type" in object) || object.type !== `${packageId}::vault::Vault` || !("objectId" in object) || object.objectId !== vaultId) throw new Error("Unexpected vault object type or identity");
  if (!("owner" in object) || !object.owner || typeof object.owner !== "object" || !("Shared" in object.owner)) throw new Error("Vault must be a shared object");
  if (!("content" in object) || !(object.content instanceof Uint8Array)) throw new Error("Vault content is unavailable");
  const state = VaultBcs.parse(object.content);
  if (state.id !== vaultId) throw new Error("Vault content identity mismatch");
  return state;
}

export const GrantBcs = bcs.struct("Grant", {
  delegate: bcs.Address, active: bcs.bool(), version: bcs.u64(), per_payment: bcs.u64(), allowance: bcs.u64(), spent: bcs.u64(), budget: Budget,
  expires_ms: bcs.u64(), recipients: bcs.vector(bcs.Address), next_sequence: bcs.u64(),
});
export type VaultGrantState = ReturnType<typeof GrantBcs.parse>;
export interface VaultDynamicFields {
  getDynamicField(input: { parentId: string; name: { type: string; bcs: Uint8Array } }): Promise<unknown>;
}
export async function readVaultGrant(transport: VaultDynamicFields, packageId: string, state: VaultState, agent: string): Promise<VaultGrantState> {
  const normalized = normalizeSuiAddressStrict(agent);
  const name = bcs.Address.serialize(normalized).toBytes();
  const raw = await transport.getDynamicField({ parentId: state.grants.id, name: { type: "address", bcs: name } });
  if (!raw || typeof raw !== "object" || !("dynamicField" in raw)) throw new Error("Vault grant is unavailable");
  const field = raw.dynamicField;
  if (!field || typeof field !== "object" || !("value" in field) || !("name" in field)) throw new Error("Malformed vault grant");
  const value = field.value; const actualName = field.name;
  if (!value || typeof value !== "object" || !("type" in value) || value.type !== `${normalizeSuiAddressStrict(packageId)}::vault::Grant` || !("bcs" in value) || !(value.bcs instanceof Uint8Array)) throw new Error("Unexpected vault grant type");
  if (!actualName || typeof actualName !== "object" || !("type" in actualName) || actualName.type !== "address" || !("bcs" in actualName) || !(actualName.bcs instanceof Uint8Array) || bcs.Address.parse(actualName.bcs) !== normalized) throw new Error("Vault grant identity mismatch");
  return GrantBcs.parse(value.bcs);
}

const ClockBcs = bcs.struct("Clock", { id: bcs.Address, timestamp_ms: bcs.u64() });
export async function readSuiClock(transport: SuiTransport): Promise<bigint> {
  const id = normalizeSuiAddressStrict("0x6");
  const raw = await transport.getObject({ objectId: id, include: { content: true } });
  if (!raw || typeof raw !== "object" || !("object" in raw)) throw new Error("Chain clock is unavailable");
  const object = raw.object;
  if (!object || typeof object !== "object" || !("objectId" in object) || object.objectId !== id || !("type" in object) || !["0x2::clock::Clock", `${normalizeSuiAddressStrict("0x2")}::clock::Clock`].includes(String(object.type)) || !("content" in object) || !(object.content instanceof Uint8Array)) throw new Error("Invalid chain clock");
  const clock = ClockBcs.parse(object.content);
  if (clock.id !== id) throw new Error("Chain clock identity mismatch");
  return BigInt(clock.timestamp_ms);
}
