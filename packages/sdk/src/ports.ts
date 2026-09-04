import type { Transaction } from "@mysten/sui/transactions";

export type SuiTransaction = Transaction | Uint8Array;

export interface SuiTransport {
  simulateTransaction(input: {
    transaction: SuiTransaction;
    include?: Record<string, boolean>;
    checksEnabled?: boolean;
  }): Promise<unknown>;
  executeTransaction(input: {
    transaction: Uint8Array;
    signatures: string[];
    include?: Record<string, boolean>;
  }): Promise<unknown>;
  getBalance(input: { owner: string; coinType?: string }): Promise<unknown>;
  getObject(input: { objectId: string; include?: Record<string, boolean> }): Promise<unknown>;
  getTransaction?(input: { digest: string; include?: Record<string, boolean> }): Promise<unknown>;
  waitForTransaction?(input: { digest: string; include?: Record<string, boolean>; timeout?: number }): Promise<unknown>;
}

/** Injected evidence transport. WalrusStore is the default implementation. */
export interface EvidencePort {
  write(body: Uint8Array): Promise<{ blobId: string; mode: "walrus" | "local"; hash?: string }>;
  read(blobId: string): Promise<Uint8Array>;
}

/** A signer sees a transaction builder but never a private key. */
export interface SignerPort {
  signTransaction(transaction: Transaction): Promise<{ bytes: string; signature: string }>;
}

export type DeploymentPort = {
  packageId: string;
  agentIndexId: string;
  agentCapId: string;
  clockId: string;
};
