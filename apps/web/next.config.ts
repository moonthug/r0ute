import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // self-contained server bundle for the docker image
  output: "standalone",
  // workspace packages export TypeScript source, so next must compile them
  transpilePackages: ["@r0ute/database", "@r0ute/ui"],
  // the dev server 403s /_next assets for non-localhost origins unless they
  // are allowlisted — needed to open the dev map from other devices
  allowedDevOrigins: ["192.168.1.113", "*.local", "alex-coulchers-mac.local"],
  // links already shared over the mesh use the old /path prefix
  redirects: async () => [{ source: "/path/:id", destination: "/p/:id", permanent: true }],
};

export default nextConfig;
