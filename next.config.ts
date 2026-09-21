import type { NextConfig } from 'next';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Content Security Policy — PRD Part II §12.2.
 *
 * React's development build uses eval() for debugging features, so
 * 'unsafe-eval' is permitted in development only and never in a built
 * artifact. Map tiles are the one external image source, matching the
 * OpenStreetMap adapter.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // OSM serves tiles from the bare host as well as a/b/c subdomains, and
  // a `*.` wildcard does not match the bare host, so both are listed.
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ...(isDevelopment
          ? []
          : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
      ],
    },
    {
      // The service worker must never be served from cache, or an update can
      // never reach a device. PRD Part II §11.
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
  ],
};

export default nextConfig;
