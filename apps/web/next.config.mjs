/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lectoaventura/ui', '@lectoaventura/contracts'],
  /**
   * La web y la API comparten origen: /api/* se reenvía a NestJS. Así la cookie httpOnly
   * del refresh token (RF-003) viaja sin configurar CORS ni cookies de terceros.
   */
  async rewrites() {
    const api = process.env.API_URL ?? 'http://localhost:3001';
    return [{ source: '/api/:ruta*', destination: `${api}/api/:ruta*` }];
  },
};

export default nextConfig;
