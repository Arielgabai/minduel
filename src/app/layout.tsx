import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MINDUEL — Entraîne tes téléprospecteurs par l'IA",
  description:
    "Transforme les appels réels de ton équipe en simulations vocales d'entraînement. Feedback clair, progression mesurable.",
};

export const viewport: Viewport = {
  themeColor: "#05060f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
