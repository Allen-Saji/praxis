import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/vault.ts", "src/node-delegate.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
});
