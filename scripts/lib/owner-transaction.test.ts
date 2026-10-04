import { test } from "node:test";
import assert from "node:assert/strict";
import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { buildCreateVault } from "@allen-saji/praxis";
import { assertOwnerTransaction } from "./owner-transaction";
const a = (d: string) => `0x${d.repeat(64)}`;
const owner = a("1");
const intent = () => buildCreateVault({ owner, packageId: a("2"), perPayment: 1n, allowance: 10n, recipients: [a("3")] });
function serialize(tx: Transaction, budget = 1000n) {
  tx.setGasOwner(owner); tx.setGasBudget(budget); tx.setGasPrice(1);
  tx.setGasPayment([{ objectId: a("4"), version: "1", digest: "11111111111111111111111111111111" }]);
  return new TransactionDataBuilder(tx.getData()).build();
}
test("owner action replay rejects substituted commands, arguments and gas", () => {
  assert.doesNotThrow(() => assertOwnerTransaction(serialize(intent()), intent(), owner, 1000n));
  assert.throws(() => assertOwnerTransaction(serialize(intent(), 1001n), intent(), owner, 1000n));
  const changed = buildCreateVault({ owner, packageId: a("2"), perPayment: 1n, allowance: 11n, recipients: [a("3")] });
  assert.throws(() => assertOwnerTransaction(serialize(changed), intent(), owner, 1000n));
  const extra = intent(); extra.transferObjects([extra.gas], a("5"));
  assert.throws(() => assertOwnerTransaction(serialize(extra), intent(), owner, 1000n));
});
