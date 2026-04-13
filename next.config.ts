import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** Solo en `build:cloudflare`: sustituye drivers pesados por stubs y reduce el Worker bajo el límite gzip (plan Free ~3 MiB). */
const cfBuild = process.env.JUDICIALSYS_CF_BUILD === "1";
/** Rutas relativas al proyecto: Turbopack (Next 16) no acepta absolutas en resolveAlias (rompe en CI). */
const cfStubResolve: Record<string, string> = {
  puppeteer: "./src/lib/stubs/cf/puppeteer.ts",
  mssql: "./src/lib/stubs/cf/mssql.ts",
  "mssql/msnodesqlv8": "./src/lib/stubs/cf/mssql.ts",
  // ~2 MiB+ (resvg/yoga wasm) aunque no uses `next/og`
  "next/dist/compiled/@vercel/og": "./src/lib/stubs/cf/vercel-og.ts",
  docx: "./src/lib/stubs/cf/docx.ts",
  openai: "./src/lib/stubs/cf/openai.ts",
  mailparser: "./src/lib/stubs/cf/mailparser.ts",
  "html-to-text": "./src/lib/stubs/cf/html-to-text.ts",
  "pdf-lib": "./src/lib/stubs/cf/pdf-lib.ts",
  mammoth: "./src/lib/stubs/cf/mammoth.ts",
};

const nextConfig: NextConfig = {
  output: "standalone",
  ...(cfBuild
    ? {
        images: {
          unoptimized: true,
        },
      }
    : {}),
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
  },
  ...(cfBuild
    ? {
        outputFileTracingExcludes: {
          "*": [
            "./node_modules/puppeteer/**/*",
            "./node_modules/@puppeteer/browsers/**/*",
            "./node_modules/mssql/**/*",
            "./node_modules/tedious/**/*",
            "./node_modules/next/dist/compiled/@vercel/og/**/*",
            "./node_modules/sharp/**/*",
            "./node_modules/@img/**/*",
            "./node_modules/openai/**/*",
            "./node_modules/docx/**/*",
            "./node_modules/mailparser/**/*",
            "./node_modules/mammoth/**/*",
            "./node_modules/pdf-lib/**/*",
            "./node_modules/html-to-text/**/*",
          ],
        },
      }
    : {}),
  webpack: (config, { isServer }) => {
    if (cfBuild && isServer) {
      config.resolve = config.resolve ?? {};
      const abs = (rel: string) => path.join(process.cwd(), rel.replace(/^\.\//, ""));
      const alias: Record<string, string> = { ...config.resolve.alias };
      for (const [k, v] of Object.entries(cfStubResolve)) {
        alias[k] = abs(v);
      }
      config.resolve.alias = alias;
    }
    return config;
  },
  ...(cfBuild
    ? {
        turbopack: {
          resolveAlias: { ...cfStubResolve },
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
