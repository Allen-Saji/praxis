import { describe, expect, it } from "vitest";
import { bcs } from "@mysten/sui/bcs";
import { buildAuthorizeVaultAgent, buildCreateVault, buildDepositVault, buildRevokeVaultAgent, buildVaultSpend, buildWithdrawVault } from "./vault";

const address = (digit: string) => `0x${digit.repeat(64)}`;
const target = { packageId: address("1"), vaultId: address("2") };
const owner = address("3");
const delegate = address("4");
const agent = address("5");
const recipient = address("6");
const request = { ...target, delegate, agent, recipient, amount: 42n, sequence: 7n, vaultVersion: 2n, grantVersion: 3n, evidence: "walrus-reference" };

describe("vault transaction builders", () => {
  it("spends from the vault with delegate sender and exact authorization fields", () => {
    const data = buildVaultSpend(request).getData();
    expect(data.sender).toBe(delegate);
    expect(data.commands).toHaveLength(1);
    const call = data.commands[0]!.MoveCall!;
    expect([call.package, call.module, call.function]).toEqual([target.packageId, "vault", "spend"]);
    expect(data.inputs[0]).toMatchObject({ UnresolvedObject: { objectId: target.vaultId } });
    const pure = (i: number) => data.inputs[i]!.Pure!.bytes;
    expect(bcs.Address.fromBase64(pure(1))).toBe(agent);
    expect(bcs.Address.fromBase64(pure(2))).toBe(recipient);
    expect([3, 4, 5, 6].map((i) => bcs.u64().fromBase64(pure(i)))).toEqual(["42", "7", "2", "3"]);
    expect(new TextDecoder().decode(new Uint8Array(bcs.vector(bcs.u8()).fromBase64(pure(7))))).toBe(request.evidence);
    expect(data.inputs[8]).toMatchObject({ UnresolvedObject: { objectId: `0x${"0".repeat(63)}6` } });
  });

  it("owner deposit splits explicit principal while withdrawal has no caller-selected recipient", () => {
    const deposit = buildDepositVault({ ...target, owner, amount: 42n }).getData();
    expect(deposit.sender).toBe(owner);
    expect(deposit.commands.map((c) => c.$kind)).toEqual(["SplitCoins", "MoveCall"]);
    const withdrawal = buildWithdrawVault({ ...target, owner, amount: 42n }).getData();
    expect(withdrawal.sender).toBe(owner);
    expect(withdrawal.commands[0]!.MoveCall!.arguments).toHaveLength(2);
    expect(withdrawal.commands[0]!.MoveCall!.function).toBe("withdraw");
  });

  it("builds owner grant and revoke without using the demo AgentCap", () => {
    const grant = buildAuthorizeVaultAgent({ ...target, owner, agent, delegate, perPayment: 5n, allowance: 10n, recipients: [recipient], expiresMs: 1000n }).getData();
    expect(grant.sender).toBe(owner);
    expect(grant.commands[0]!.MoveCall!.function).toBe("authorize");
    expect(buildRevokeVaultAgent({ ...target, owner, agent }).getData().commands[0]!.MoveCall!.function).toBe("revoke");
  });

  it("rejects invalid money, missing package and oversized evidence before signing", () => {
    for (const amount of [0n, -1n, 1n << 64n]) expect(() => buildVaultSpend({ ...request, amount })).toThrow();
    expect(() => buildVaultSpend({ ...request, sequence: -1n })).toThrow();
    expect(() => buildVaultSpend({ ...request, packageId: address("0") })).toThrow();
    expect(() => buildVaultSpend({ ...request, evidence: "" })).toThrow();
    expect(() => buildVaultSpend({ ...request, evidence: "x".repeat(129) })).toThrow();
  });

  it("rejects empty recipient lists and inconsistent policy", () => {
    expect(() => buildCreateVault({ packageId: target.packageId, owner, perPayment: 1n, allowance: 1n, recipients: [] })).toThrow();
    expect(() => buildCreateVault({ packageId: target.packageId, owner, perPayment: 2n, allowance: 1n, recipients: [recipient] })).toThrow();
  });
});
