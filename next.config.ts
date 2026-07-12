import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],

  // The SkyTrade route shells out to the `tradingview-cli lookup` command
  // (see lib/skytrade/tradingview-client.ts). It resolves the CLI through a
  // runtime-computed specifier so webpack never bundles it — but that same
  // trick hides the dependency from Vercel/Next output file tracing (@vercel/nft),
  // so its files were omitted from the deployed function → "Cannot find module
  // 'tradingview-mcp-server/dist/cli.js'". Force-include the CLI package and its
  // runtime closure (node-fetch + its transitive deps) into that one function.
  outputFileTracingIncludes: {
    "/api/cron/skytrade/[market]": [
      "./node_modules/tradingview-mcp-server/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/data-uri-to-buffer/**/*",
      "./node_modules/fetch-blob/**/*",
      "./node_modules/formdata-polyfill/**/*",
      "./node_modules/node-domexception/**/*",
      "./node_modules/web-streams-polyfill/**/*",
    ],
  },
};

export default nextConfig;
