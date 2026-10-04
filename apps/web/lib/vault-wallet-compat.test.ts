import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { buildCreateVault, buildDepositVault, buildAuthorizeVaultAgent } from "@allen-saji/praxis/vault";
const requireWeb = createRequire(new URL("../package.json", import.meta.url));
const requireWallet = createRequire(requireWeb.resolve("@mysten/dapp-kit"));
const { Transaction: WalletTransaction } = requireWallet("@mysten/sui/transactions");
const a = (d: string) => `0x${d.repeat(64)}`;
describe("wallet-kit transaction serialization", () => {
  it("accepts SDK builders through the wallet kit's installed transaction parser", async () => {
    const target = { packageId: a("1"), vaultId: a("2"), owner: a("3") };
    const transactions = [
      buildCreateVault({ packageId: target.packageId, owner: target.owner, perPayment: 1n, allowance: 10n, recipients: [a("4")] }),
      buildDepositVault({ ...target, amount: 1n }),
      buildAuthorizeVaultAgent({ ...target, agent: a("5"), delegate: a("6"), perPayment: 1n, allowance: 10n, daily: 2n, monthly: 5n, recipients: [a("4")], expiresMs: 1000n }),
    ];
    for (const tx of transactions) {
      const restored = WalletTransaction.from(await tx.toJSON());
      expect(restored.getData().sender).toBe(target.owner);
      // The JSON wire format omits the SDK-only argument type hint.
      const wireCommands = JSON.parse(JSON.stringify(tx.getData().commands, (_key, value) => {
        if (value?.$kind === "Input") { const { type: _type, ...argument } = value; return argument; }
        return value;
      }));
      expect(restored.getData().commands).toEqual(wireCommands);
      expect(restored.getData().inputs).toEqual(tx.getData().inputs);
    }
  });
});
