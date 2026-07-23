"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    organizationName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Inscription impossible.");
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

  const field =
    "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-violet-500/50";

  return (
    <form onSubmit={submit} className="mt-8 w-full space-y-4">
      <div>
        <label htmlFor="org" className="mb-1 block text-sm text-white/70">
          Nom de l&apos;organisation
        </label>
        <input id="org" required value={form.organizationName} onChange={update("organizationName")} className={field} placeholder="Ex. Régie Novéo" />
      </div>
      <div>
        <label htmlFor="name" className="mb-1 block text-sm text-white/70">
          Ton nom complet
        </label>
        <input id="name" required value={form.fullName} onChange={update("fullName")} className={field} placeholder="Prénom Nom" />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-white/70">
          E-mail
        </label>
        <input id="email" type="email" autoComplete="email" required value={form.email} onChange={update("email")} className={field} placeholder="toi@entreprise.com" />
      </div>
      <div>
        <label htmlFor="pwd" className="mb-1 block text-sm text-white/70">
          Mot de passe
        </label>
        <input id="pwd" type="password" autoComplete="new-password" required minLength={6} value={form.password} onChange={update("password")} className={field} placeholder="6 caractères minimum" />
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full py-3.5">
        {loading ? "Création…" : "Créer mon organisation →"}
      </Button>
    </form>
  );
}
