import type { NextConfig } from "next";

const supabasePackagesToTranspile = [
  '@supabase/supabase-js',
  '@supabase/ssr',
  '@supabase/postgrest-js',
  '@supabase/realtime-js',
  '@supabase/gotrue-js',
  '@supabase/functions-js',
  '@supabase/storage-js',
  '@supabase/auth-js',
  '@supabase/node-fetch',
];

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: supabasePackagesToTranspile,
  async rewrites() {
    const target = process.env.API_URL;
    if (!target || target.startsWith('/')) {
      return [];
    }

    const destination = target.replace(/\/$/, '');

    return [
      {
        source: '/v1/:path*',
        destination: `${destination}/v1/:path*`,
      },
      {
        source: '/api/proxy/:path*',
        destination: `${destination}/:path*`,
      },
      {
        source: '/revision-notes',
        destination: `${destination}/revision-notes`,
      },
      {
        source: '/lecture-planning',
        destination: `${destination}/lecture-planning`,
      },
    ];
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has TypeScript errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Disable source maps to prevent 404 errors for source files
  productionBrowserSourceMaps: false,
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.devtool = false;
    }
    
    // Add WebAssembly support for DuckDB-WASM and Pyodide
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    
    // Handle .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });
    
    // Exclude WebAssembly modules from being processed by other loaders
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    
    return config;
  },
};

// Pin Turbopack root to this app directory to avoid
// Next.js selecting a parent directory with another lockfile.
// This silences the multiple lockfiles warning and ensures
// the correct workspace root is used.
// @ts-ignore - "turbopack" may not be in older NextConfig types
(nextConfig as any).turbopack = {
  root: __dirname,
};

export default nextConfig;
