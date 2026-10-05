import { deriveDynamicFieldID } from "@mysten/sui/utils";
import { bcs, TypeTagSerializer } from "@mysten/sui/bcs";
import { describe, expect, it, vi } from "vitest";
import { VaultBcs, readVaultState, GrantBcs, readVaultGrant } from "./vault-state";
import type { SuiTransport } from "./ports";
const addr = (d: string) => `0x${d.repeat(64)}`;
const target = { packageId: addr("1"), vaultId: addr("2") };
const state = { id: target.vaultId, owner: addr("3"), funds: "9007199254740993", paused: false, version: "0", per_payment: "10", allowance: "100", spent: "0", budget: { daily_limit: "20", monthly_limit: "80", day: "1", month: "24000", daily_spent: "0", monthly_spent: "0" }, recipients: [addr("4")], grants: { id: addr("5"), size: "0" } };
const object = () => ({ objectId: target.vaultId, type: `${target.packageId}::vault::Vault`, owner: { Shared: { initialSharedVersion: "1" } }, content: VaultBcs.serialize(state).toBytes() });
const transport = (value: unknown): SuiTransport => ({ getObject: vi.fn(async () => value), getBalance: vi.fn(), simulateTransaction: vi.fn(), executeTransaction: vi.fn() });
describe("vault chain state", () => {
  it("recognizes only the exact missing grant and preserves provider failures", async () => {
    const agent = addr("7");
    const fieldId = deriveDynamicFieldID(state.grants.id, TypeTagSerializer.parseFromStr("address"), bcs.Address.serialize(agent).toBytes());
    const client = { getDynamicField: vi.fn().mockRejectedValue(new Error(`Object ${fieldId} not found`)) };
    await expect(readVaultGrant(client, target.packageId, state, agent)).rejects.toMatchObject({ code: "dynamicFieldNotFound" });
    const outage = new Error("RPC unavailable"); client.getDynamicField.mockRejectedValue(outage);
    await expect(readVaultGrant(client, target.packageId, state, agent)).rejects.toBe(outage);
  });
  it("decodes a grant only for the requested agent and contract", async () => {
    const grant = { delegate: addr("6"), active: true, version: "2", per_payment: "10", allowance: "20", spent: "1", budget: state.budget, expires_ms: "1000", recipients: state.recipients, next_sequence: "1" };
    const dynamicField = { name: { type: "address", bcs: bcs.Address.serialize(addr("7")).toBytes() }, value: { type: `${target.packageId}::vault::Grant`, bcs: GrantBcs.serialize(grant).toBytes() } };
    const client = { getDynamicField: vi.fn(async () => ({ dynamicField })) };
    expect(await readVaultGrant(client, target.packageId, state, addr("7"))).toEqual(grant);
    await expect(readVaultGrant(client, target.packageId, state, addr("8"))).rejects.toThrow("identity mismatch");
    await expect(readVaultGrant(client, addr("9"), state, addr("7"))).rejects.toThrow("type");
  });
  it("reads BCS owner and exact balance from the configured package", async () => {
    expect(await readVaultState(transport({ object: object() }), target)).toEqual(state);
  });
  it("rejects wrong contract types, unshared objects and forged content identity", async () => {
    await expect(readVaultState(transport({ object: { ...object(), type: `${addr("9")}::vault::Vault` } }), target)).rejects.toThrow("type or identity");
    await expect(readVaultState(transport({ object: { ...object(), owner: { AddressOwner: addr("3") } } }), target)).rejects.toThrow("shared");
    await expect(readVaultState(transport({ object: { ...object(), content: VaultBcs.serialize({ ...state, id: addr("9") }).toBytes() } }), target)).rejects.toThrow("identity mismatch");
  });
});
