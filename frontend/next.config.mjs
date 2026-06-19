import createNextIntlPlugin from "next-intl/plugin";

/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === "production";

// Note: Content-Security-Policy is set per-request in middleware.ts so we can
// emit a fresh nonce on every response. The remaining headers are static and
// fine to attach via the framework's headers() hook.

const staticSecurityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    // Serve modern formats (avif, webp) for browsers that support them.
    // Pixel art sprites intentionally bypass next/image to avoid
    // re-encoding; this config only affects <Image> usage (logos).
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  experimental: {
    typedRoutes: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: staticSecurityHeaders,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
