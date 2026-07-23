import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Le contenu audio uploadé est servi via des routes API signées, jamais depuis /public.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
