import type { NextConfig } from "next";

// Built as a static website (the "out" folder) and served by our own Node server together with the
// API, so the whole system is one server on AWS Lightsail.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
