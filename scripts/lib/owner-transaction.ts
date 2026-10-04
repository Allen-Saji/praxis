import { isDeepStrictEqual } from "node:util";
import { Transaction } from "@mysten/sui/transactions";

/** Bind replayed CLI signatures to the same owner action and gas ceiling.
 * Ignore only SDK argument type hints which are absent from serialized BCS. */
export function assertOwnerTransaction(bytes: Uint8Array, expected: Transaction, owner: string, maxGas: bigint): void {
  const actual = Transaction.from(bytes).getData();
  const intent = expected.getData();
  if (actual.sender !== owner || actual.gasData.owner !== owner || BigInt(actual.gasData.budget ?? "0") <= 0n || BigInt(actual.gasData.budget!) > maxGas) throw new Error("Stored owner transaction exceeds its authorization");
  const commands = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item?.$kind === "Input") { const { type: _type, ...argument } = item; return argument; }
    return item;
  }));
  if (!isDeepStrictEqual(commands(actual.commands), commands(intent.commands)) || actual.inputs.length !== intent.inputs.length) throw new Error("Stored owner transaction changed its commands");
  for (let i = 0; i < intent.inputs.length; i += 1) {
    const wanted = intent.inputs[i]!; const found = actual.inputs[i]!;
    if (wanted.Pure) { if (wanted.Pure.bytes !== found.Pure?.bytes) throw new Error("Stored owner transaction changed an argument"); }
    else if (wanted.UnresolvedObject) {
      const shared = found.Object?.SharedObject;
      if (!shared || shared.objectId !== wanted.UnresolvedObject.objectId) throw new Error("Stored owner transaction changed an object");
    } else if (!isDeepStrictEqual(wanted, found)) throw new Error("Unsupported stored owner transaction input");
  }
}
