import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // self-contained server bundle for the docker image
  output: "standalone",
  // @r0ute/database exports TypeScript source, so next must compile it
  transpilePackages: ["@r0ute/database"],
};

export default nextConfig;
