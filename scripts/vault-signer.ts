import { isAbsolute } from "node:path";
import { TestnetDelegateStore } from "@allen-saji/praxis/testnet-signer";
import { createVaultSignerServer } from "./lib/vault-signer-http";
function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
if (required("PRAXIS_SIGNER_NETWORK") !== "testnet") throw new Error("This signer supports Testnet only");
const directory = required("PRAXIS_SIGNER_DIRECTORY");
if (!isAbsolute(directory)) throw new Error("Signer directory must be an absolute path");
const encoded = required("PRAXIS_SIGNER_MASTER_KEY");
if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("Signer master key must be base64 encoded 32 bytes");
const maxGas = required("PRAXIS_SIGNER_MAX_GAS_MIST");
if (!/^[1-9][0-9]{0,19}$/.test(maxGas)) throw new Error("Invalid signer gas ceiling");
const port = Number(process.env.PRAXIS_SIGNER_PORT ?? "4317");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid signer port");
const store = new TestnetDelegateStore({ directory, masterKey: Buffer.from(encoded, "base64"), packageId: required("PRAXIS_VAULT_PACKAGE_ID"), maxGas: BigInt(maxGas) });
const server = createVaultSignerServer(store, required("PRAXIS_SIGNER_TOKEN"));
server.listen(port, "127.0.0.1", () => { console.log(`Praxis Testnet signer listening on loopback port ${port}`); });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { server.close(); });
