import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @praxis/sdk uses node:fs and node:crypto. It must never reach the client
  // bundle. transpilePackages lets the workspace package compile from source on
  // the server while staying out of client chunks (we only import it in server
  // code).
  transpilePackages: ["@praxis/sdk"],
  serverExternalPackages: ["@mysten/walrus"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
