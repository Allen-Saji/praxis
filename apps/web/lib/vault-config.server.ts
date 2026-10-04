import "server-only";
import { normalizeSuiAddress, isValidSuiAddress } from "@mysten/sui/utils";
import { HttpError } from "./control-plane.server";
export function vaultPackageId(): string {
  const value = process.env.PRAXIS_VAULT_PACKAGE_ID;
  if ((process.env.PRAXIS_NETWORK ?? "testnet") !== "testnet" || !value || !isValidSuiAddress(value) || BigInt(value) === 0n) throw new HttpError(503, "VAULTS_UNAVAILABLE", "User-owned vaults are not enabled on this deployment yet.");
  return normalizeSuiAddress(value);
}
