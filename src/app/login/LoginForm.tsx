"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Connexion impossible.");
        return;
      }
      router.push(json.data.redirect);
      router.refresh();
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  function quickFill(kind: "manager" | "telepro") {
    setEmail(kind === "manager" ? "manager@demo.minduel.app" : "ruben@demo.minduel.app");
    setPassword("demo1234");
  }

  return (
    <form onSubmit={submit} className="mt-8 w-full space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-white/70">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-violet-500/50"
          placeholder="toi@entreprise.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-white/70">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-violet-500/50"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full py-3.5">
        {loading ? "Connexion…" : "Se connecter"}
      </Button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => quickFill("manager")}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 hover:bg-white/10"
        >
          Remplir Manager démo
        </button>
        <button
          type="button"
          onClick={() => quickFill("telepro")}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 hover:bg-white/10"
        >
          Remplir Télépro démo
        </button>
      </div>
    </form>
  );
}
