import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Server Actions cap request bodies at 1 MB by default. Resume
      // uploads go up to 5 MB (RESUME_MAX_BYTES), so allow a little more
      // than that. The extra covers multipart overhead, and it means a
      // slightly oversized file reaches our own size check and gets a
      // friendly error instead of a framework error.
      bodySizeLimit: "6mb",
    },
  },
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
