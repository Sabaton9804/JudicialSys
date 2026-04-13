import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** Solo en `build:cloudflare`: sustituye drivers pesados por stubs y reduce el Worker bajo el límite gzip (plan Free ~3 MiB). */
const cfBuild = process.env.JUDICIALSYS_CF_BUILD === "1";
const cfStubDir = path.join(process.cwd(), "src/lib/stubs/cf");

const nextConfig: NextConfig = {
  output: "standalone",
  // En CF el Worker debe resolver stubs (alias); si quedan como externos, el bundle no incluye el reemplazo.
  serverExternalPackages: cfBuild
    ? ["pdfjs-dist", "pdf-parse"]
    : [
        "puppeteer",
        "@puppeteer/browsers",
        "pdfjs-dist",
        "pdf-parse",
        "mssql",
      ],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "date-fns",
    ],
    ...(cfBuild
      ? {
          outputFileTracingExcludes: {
            "*": [
              "./node_modules/puppeteer/**/*",
              "./node_modules/@puppeteer/browsers/**/*",
              "./node_modules/mssql/**/*",
              "./node_modules/tedious/**/*",
            ],
          },
        }
      : {}),
  },
  webpack: (config, { isServer }) => {
    if (cfBuild && isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...config.resolve.alias,
        puppeteer: path.join(cfStubDir, "puppeteer.ts"),
        mssql: path.join(cfStubDir, "mssql.ts"),
        "mssql/msnodesqlv8": path.join(cfStubDir, "mssql.ts"),
      };
    }
    return config;
  },
  ...(cfBuild
    ? {
        turbopack: {
          resolveAlias: {
            puppeteer: path.join(cfStubDir, "puppeteer.ts"),
            mssql: path.join(cfStubDir, "mssql.ts"),
            "mssql/msnodesqlv8": path.join(cfStubDir, "mssql.ts"),
          },
        },
      }
    : {}),
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;

initOpenNextCloudflareForDev();
