import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev logs print server action arguments, which would include the Gmail app password.
  logging: { serverFunctions: false },
  images: {
    // unoptimized: true,
    formats: ["image/avif", "image/webp"],
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.builder.io",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.svg": {
        loaders: [
          {
            loader: "@svgr/webpack",
            options: {
              icon: true,
            },
          },
        ],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
