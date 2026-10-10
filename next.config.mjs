/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  deploymentId: process.env.APP_RELEASE_COMMIT && process.env.APP_RELEASE_COMMIT !== "unknown" ? process.env.APP_RELEASE_COMMIT : undefined,
  outputFileTracingExcludes: {
    "/*": [
      "./.codex-tmp/**/*",
      "./.codex_sheet_work/**/*",
      "./.env",
      "./.env.*",
      "./.git/**/*",
      "./.playwright-cli/**/*",
      "./.postgres-data/**/*",
      "./output/**/*",
      "./outputs/**/*",
      "./playwright-report/**/*",
      "./test-results/**/*",
      "./tsconfig.tsbuildinfo"
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.fotmob.com",
        pathname: "/image_resources/**"
      }
    ]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb"
    }
  }
};

export default nextConfig;
