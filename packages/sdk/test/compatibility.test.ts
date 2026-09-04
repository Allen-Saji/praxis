import { describe, expect, it } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { PraxisOptions } from "../src/client";
import { KeypairAdapter } from "../src/adapters";
import { makeSuiClient } from "../src/rpc";
import type { SpendArgs } from "../src/types";

describe("public quickstart compatibility", () => {
  it("keeps the documented Praxis and spend option shapes assignable", () => {
    const keypair = Ed25519Keypair.generate();
    const wallet = new KeypairAdapter(keypair, makeSuiClient("testnet"));
    const options: PraxisOptions = { network: "testnet", wallet };
    const spend: SpendArgs = {
      to: "0x3",
      amount: 1_000_000_000n,
      reasoning: { prompt: "send", decision: "approved", model: "demo" },
    };
    expect(options.network).toBe("testnet");
    expect(spend.amount).toBe(1_000_000_000n);
  });
});
