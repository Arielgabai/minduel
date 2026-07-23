"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={logout}
      disabled={loading}
      className={
        className ??
        "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 hover:bg-white/10"
      }
    >
      {loading ? "Déconnexion…" : "Se déconnecter"}
    </button>
  );
}
