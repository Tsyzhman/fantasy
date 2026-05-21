/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.fotmob.com",
        pathname: "/image_resources/**"
      }
    ]
  },
  // Playwright is an optional runtime dep used only by browser-mode FotMob
  // ingestion. Keep it out of the server bundle so prod images that skip the
  // optional install still build.
  serverExternalPackages: ["playwright"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb"
    }
  }
};

export default nextConfig;
