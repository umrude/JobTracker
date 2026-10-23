import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only Next.js badge defaults to the bottom left, on top of the
  // sidebar's Collapse button.
  devIndicators: { position: "bottom-right" },
  // Basic hardening for every response, live and public demo alike. No
  // page frames anything (PDFs open in their own tab), so framing is denied
  // outright, which also rules out clickjacking.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // The app is never sent with an X-Powered-By: Next.js header.
  poweredByHeader: false,
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
