import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // /dashboard is a common URL people type — redirect it to the root dashboard.
  async redirects() {
    return [
      { source: '/dashboard', destination: '/', permanent: false },
    ]
  },

  // Yjs and y-websocket reference Node.js built-ins (net, tls, fs) in
  // server-side code paths that webpack still tries to resolve when building
  // the browser bundle.  Setting them to `false` stubs them out so the
  // client bundle compiles cleanly — those code paths are never actually
  // called in the browser.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        crypto: false,
      }
    }
    return config
  },
}

export default nextConfig
