import "server-only";
import type { DelegateScope } from "@allen-saji/praxis/testnet-signer";
import type { VaultSpend } from "@allen-saji/praxis";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { HttpError } from "./control-plane.server";

async function signerRequest(path: "/provision" | "/sign", body: unknown): Promise<Record<string, unknown>> {
  const endpoint = process.env.PRAXIS_SIGNER_URL;
  const token = process.env.PRAXIS_SIGNER_TOKEN;
  if (!endpoint || !token) throw new HttpError(503, "SIGNER_UNAVAILABLE", "Vault signing is not configured.");
  const url = new URL(endpoint);
  const local = process.env.NODE_ENV !== "production" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new HttpError(503, "SIGNER_UNAVAILABLE", "Vault signer configuration is invalid.");
  try {
    const response = await fetch(new URL(path, url), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Signer rejected request");
    const result = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Malformed response");
    return result;
  } catch { throw new HttpError(503, "SIGNER_UNAVAILABLE", "Vault signer is unavailable or rejected the request. No payment has been submitted by this request."); }
}
export async function provisionVaultDelegate(scope: DelegateScope): Promise<string> {
  const result = await signerRequest("/provision", { scope });
  if (typeof result.address !== "string" || !isValidSuiAddress(result.address)) throw new HttpError(503, "SIGNER_UNAVAILABLE", "Signer returned an invalid delegate address.");
  return normalizeSuiAddress(result.address);
}
export async function signVaultPayment(scope: DelegateScope, payment: VaultSpend, bytes: Uint8Array): Promise<string> {
  const encodedPayment = { ...payment, amount: payment.amount.toString(), sequence: payment.sequence.toString(), vaultVersion: payment.vaultVersion.toString(), grantVersion: payment.grantVersion.toString() };
  const result = await signerRequest("/sign", { scope, payment: encodedPayment, bytes: Buffer.from(bytes).toString("base64") });
  if (typeof result.signature !== "string" || !result.signature || result.signature.length > 4096) throw new HttpError(503, "SIGNER_UNAVAILABLE", "Signer returned an invalid signature.");
  return result.signature;
}
