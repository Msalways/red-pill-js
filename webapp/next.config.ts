import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['redpillx'],
  serverExternalPackages: ['nodejs-polars'],
  turbopack: {},
};

export default nextConfig;
