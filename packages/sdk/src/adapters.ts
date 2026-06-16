import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Transaction } from "@mysten/sui/transactions";
import type { SignedTransaction, WalletAdapter } from "./types";

/** Raw Sui keypair adapter, for demos and dev. */
export class KeypairAdapter implements WalletAdapter {
  constructor(
    private keypair: Ed25519Keypair,
    private client: SuiJsonRpcClient,
  ) {}

  async address(): Promise<string> {
    return this.keypair.toSuiAddress();
  }

  async signTransaction(tx: Transaction): Promise<SignedTransaction> {
    tx.setSenderIfNotSet(await this.address());
    const bytes = await tx.build({ client: this.client });
    const { signature } = await this.keypair.signTransaction(bytes);
    return { bytes: Buffer.from(bytes).toString("base64"), signature };
  }
}

export interface GenericAdapterOptions {
  address: string | (() => Promise<string>);
  /** Sign the BCS tx bytes, returning a Sui signature string. */
  sign: (txBytes: Uint8Array) => Promise<string>;
  client: SuiJsonRpcClient;
}

/** Escape hatch: wrap any provider that can sign transaction bytes. */
export class GenericAdapter implements WalletAdapter {
  constructor(private opts: GenericAdapterOptions) {}

  async address(): Promise<string> {
    return typeof this.opts.address === "function" ? this.opts.address() : this.opts.address;
  }

  async signTransaction(tx: Transaction): Promise<SignedTransaction> {
    tx.setSenderIfNotSet(await this.address());
    const bytes = await tx.build({ client: this.opts.client });
    const signature = await this.opts.sign(bytes);
    return { bytes: Buffer.from(bytes).toString("base64"), signature };
  }
}
