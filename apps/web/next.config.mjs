/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@acme/contracts'],
  /**
   * Same-origin `/api/*` proxy so the HTTPS Vercel site can call the HTTP GCP API
   * without mixed-content blocks. Set API_INTERNAL_URL to the API origin (no /api suffix).
   * Browser should use NEXT_PUBLIC_API_URL="" (same origin) or the Vercel URL.
   */
  async rewrites() {
    const apiOrigin = (
      process.env.API_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:4000'
    ).replace(/\/$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
