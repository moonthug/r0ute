import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // self-contained server bundle for the docker image
  output: "standalone",
  // @r0ute/database exports TypeScript source, so next must compile it
  transpilePackages: ["@r0ute/database"],
  // the dev server 403s /_next assets for non-localhost origins unless they
  // are allowlisted — needed to open the dev map from other devices
  allowedDevOrigins: ["192.168.1.113", "*.local", "alex-coulchers-mac.local"],
};

export default nextConfig;
