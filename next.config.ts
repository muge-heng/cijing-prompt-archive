import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      basePath: basePath || undefined,
      images: { unoptimized: true },
      trailingSlash: true,
    }
  : {};

export default nextConfig;
