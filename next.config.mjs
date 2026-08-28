/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [
      "./.codex-tmp/**/*",
      "./.codex_sheet_work/**/*",
      "./.env",
      "./.env.*",
      "./.git/**/*",
      "./.next/**/*",
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
