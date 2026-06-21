import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @allen-saji/praxis uses node:fs and node:crypto. It must never reach the client
  // bundle. transpilePackages lets the workspace package compile from source on
  // the server while staying out of client chunks (we only import it in server
  // code).
  transpilePackages: ["@allen-saji/praxis"],
  serverExternalPackages: ["@mysten/walrus"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
