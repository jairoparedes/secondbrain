/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Nginx hace el enrutamiento /api -> backend y / -> frontend.
  // Next.js no necesita rewrites en este setup.
};

export default nextConfig;
