// Where the Ludo backend (ludo-fyp-backend) runs. The browser calls /api/... on this app
// and Next.js forwards the request to the backend, so there are no CORS problems.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // This app sits inside the React project's folder (which has its own package-lock.json),
  // so tell Turbopack that this folder is the root.
  turbopack: { root: import.meta.dirname },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }]
  },
}

export default nextConfig
