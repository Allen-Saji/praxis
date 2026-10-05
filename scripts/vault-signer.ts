import { readFile } from "node:fs/promises";
import { signerNetworkConfig, assertMountedVolume } from "./lib/vault-signer-config";
import { TestnetDelegateStore } from "@allen-saji/praxis/testnet-signer";
import { createVaultSignerServer } from "./lib/vault-signer-http";
function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
if (required("PRAXIS_SIGNER_NETWORK") !== "testnet") throw new Error("This signer supports Testnet only");
const { directory, host, port, mount } = signerNetworkConfig(process.env);
if (mount) assertMountedVolume(mount, await readFile("/proc/self/mountinfo", "utf8"));
const encoded = required("PRAXIS_SIGNER_MASTER_KEY");
if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("Signer master key must be base64 encoded 32 bytes");
const maxGas = required("PRAXIS_SIGNER_MAX_GAS_MIST");
if (!/^[1-9][0-9]{0,19}$/.test(maxGas)) throw new Error("Invalid signer gas ceiling");
const store = new TestnetDelegateStore({ directory, masterKey: Buffer.from(encoded, "base64"), packageId: required("PRAXIS_VAULT_PACKAGE_ID"), maxGas: BigInt(maxGas) });
const server = createVaultSignerServer(store, required("PRAXIS_SIGNER_TOKEN"));
server.listen(port, host, () => { console.log(`Praxis Testnet signer listening on ${host}:${port}`); });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { server.close(); });
