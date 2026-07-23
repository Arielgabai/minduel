import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy raisonnable pour une bêta privée.
// - Autorise self + inline styles (Tailwind) et le bootstrap Next.
// - Autorise OpenAI Realtime (https/wss) et le stockage S3 (https) pour la lecture
//   audio pré-signée et l'upload direct éventuel.
// - Interdit l'embarquement en iframe (frame-ancestors 'none').
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "connect-src 'self' https: wss:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Le micro est nécessaire (WebRTC) : autorisé uniquement pour l'origine.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
  // HSTS (ignoré en http local, actif derrière le proxy HTTPS de prod).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Le contenu audio uploadé est servi via des URLs signées, jamais depuis /public.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
