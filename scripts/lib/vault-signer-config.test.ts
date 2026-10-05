import { test } from "node:test";
import assert from "node:assert/strict";
import { signerNetworkConfig, assertMountedVolume } from "./vault-signer-config";
test("Railway signer requires mounted storage and explicit external binding", () => {
  const local = { PRAXIS_SIGNER_DIRECTORY: "/tmp/test-keys" };
  assert.equal(signerNetworkConfig(local).host, "127.0.0.1");
  assert.throws(() => signerNetworkConfig({ ...local, RAILWAY_ENVIRONMENT_ID: "env" }));
  const railway = { RAILWAY_ENVIRONMENT_ID: "env", RAILWAY_VOLUME_MOUNT_PATH: "/data", PRAXIS_SIGNER_DIRECTORY: "/data/keys", PRAXIS_SIGNER_HOST: "0.0.0.0", PORT: "8080" };
  assert.deepEqual(signerNetworkConfig(railway), { host: "0.0.0.0", port: 8080, directory: "/data/keys", mount: "/data" });
  for (const directory of ["/data", "/data-other/keys", "/data/../tmp/keys"]) assert.throws(() => signerNetworkConfig({ ...railway, PRAXIS_SIGNER_DIRECTORY: directory }));
  assert.throws(() => assertMountedVolume("/data", "1 2 3:4 / /data-other rw - ext4 /dev/a rw"));
  assert.doesNotThrow(() => assertMountedVolume("/data", "1 2 3:4 / /data rw - ext4 /dev/a rw"));
});
