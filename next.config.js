/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @-Alias wird via tsconfig.json paths aufgelöst: "@/*" → "src/*"
  // Für Monorepo-Packages später aktivieren:
  // transpilePackages: ["@grow-observer/ui", "@grow-observer/shared"],
  // images: { remotePatterns: [{ protocol: "https", hostname: "images.pexels.com" }] },
};

module.exports = nextConfig;
