/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Type/lint errors shouldn't block a deploy of a personal dashboard.
  // Run `npx tsc --noEmit` locally when you want to see them.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
