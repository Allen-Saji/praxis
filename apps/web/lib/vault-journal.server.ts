import "server-only";
import { z } from "zod";
import type { VaultSubmission, VaultSubmissionJournal } from "@allen-saji/praxis";
import type { VaultSubmissionRepository } from "@allen-saji/praxis-db";
import { vaultSubmissionRepository } from "./control-plane.server";

const address = z.string().regex(/^0x[0-9a-f]{64}$/);
const u64 = z.string().regex(/^(0|[1-9][0-9]*)$/).refine((value) => BigInt(value) <= 18_446_744_073_709_551_615n);
const storedRequest = z.object({
  packageId: address, vaultId: address, delegate: address, agent: address, recipient: address,
  amount: u64, sequence: u64, vaultVersion: u64, grantVersion: u64, evidence: z.string().min(1).max(128),
}).strict();

/** Server-only bridge: exact decimal serialization, tenant-scoped DB access.
 * Do not pass this journal or its signed envelopes to a browser response. */
export function makeVaultJournal(organizationId: string, repository: Pick<VaultSubmissionRepository, "saveOnce" | "load"> = vaultSubmissionRepository(organizationId)): VaultSubmissionJournal {
  return {
    async saveOnce(row) {
      const request = storedRequest.parse({ ...row.request, amount: row.request.amount.toString(), sequence: row.request.sequence.toString(), vaultVersion: row.request.vaultVersion.toString(), grantVersion: row.request.grantVersion.toString() });
      await repository.saveOnce({ intentId: row.intentId, network: "testnet", packageId: request.packageId, vaultId: request.vaultId, agentAddress: request.agent, sequence: request.sequence, digest: row.digest, transactionBytes: row.bytes, signature: row.signature, requestJson: request, gasBudget: u64.parse(row.gasBudget.toString()) });
    },
    async load(intentId): Promise<VaultSubmission | null> {
      const row = await repository.load(intentId);
      if (!row) return null;
      const request = storedRequest.parse(row.requestJson);
      if (row.organizationId !== organizationId || row.intentId !== intentId || row.network !== "testnet" || row.packageId !== request.packageId || row.vaultId !== request.vaultId || row.agentAddress !== request.agent || row.sequence !== request.sequence) throw new Error("Stored vault submission identity mismatch");
      return { intentId, digest: row.digest, bytes: row.transactionBytes, signature: row.signature, gasBudget: BigInt(u64.parse(row.gasBudget)), request: { ...request, amount: BigInt(request.amount), sequence: BigInt(request.sequence), vaultVersion: BigInt(request.vaultVersion), grantVersion: BigInt(request.grantVersion) } };
    },
  };
}
