/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@trol/pension-core'],
  // pdf-parse (lectura de CURP en constancias) se carga en runtime, sin empaquetar pdfjs.
  experimental: { serverComponentsExternalPackages: ['pdf-parse'] },
};
export default nextConfig;
