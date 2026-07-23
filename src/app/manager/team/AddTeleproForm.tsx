"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

export function AddTeleproForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Création impossible.");
        return;
      }
      setCreated({ email: json.data.email, tempPassword: json.data.tempPassword });
      setFullName("");
      setEmail("");
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50";

  return (
    <Card>
      {created && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          <p className="font-semibold text-emerald-300">Compte créé ✓</p>
          <p className="mt-1 text-white/70">
            Transmets ces identifiants au téléprospecteur :
          </p>
          <p className="mt-1 text-white">
            {created.email}
            <br />
            Mot de passe temporaire :{" "}
            <code className="text-flame-400">{created.tempPassword}</code>
          </p>
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="tp-name" className="mb-1 block text-xs text-white/60">
            Nom complet
          </label>
          <input id="tp-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} placeholder="Prénom Nom" />
        </div>
        <div>
          <label htmlFor="tp-email" className="mb-1 block text-xs text-white/60">
            E-mail
          </label>
          <input id="tp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="telepro@entreprise.com" />
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Création…" : "Créer le compte"}
        </Button>
        <p className="text-xs text-white/40">
          Un mot de passe temporaire sera généré et affiché ici (pas d&apos;e-mail
          dans le MVP).
        </p>
      </form>
    </Card>
  );
}
