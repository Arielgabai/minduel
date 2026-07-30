"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

export interface KnowledgeOption {
  id: string;
  type: string;
  title: string;
}

export interface ScenarioInitial {
  id?: string;
  name: string;
  callType: string;
  level: string;
  campaign: string;
  offer: string;
  prospectProfile: string;
  initialSituation: string;
  objective: string;
  personality: string;
  allowedObjections: string; // texte, une par ligne
  secretInfos: Array<{ question: string; answer: string }>;
  successConditions: string;
  failureConditions: string;
  targetDurationSec: number;
  knowledgeRefs: string[];
}

const EMPTY: ScenarioInitial = {
  name: "",
  callType: "VENTE",
  level: "MOYEN",
  campaign: "",
  offer: "",
  prospectProfile: "",
  initialSituation: "",
  objective: "",
  personality: "",
  allowedObjections: "",
  secretInfos: [],
  successConditions: "",
  failureConditions: "",
  targetDurationSec: 300,
  knowledgeRefs: [],
};

export function ScenarioForm({
  initial,
  knowledgeOptions,
}: {
  initial?: ScenarioInitial;
  knowledgeOptions: KnowledgeOption[];
}) {
  const router = useRouter();
  const [persistedScenarioId, setPersistedScenarioId] = useState<string | undefined>(
    initial?.id,
  );
  const [form, setForm] = useState<ScenarioInitial>(() => {
    if (!initial) return EMPTY;
    return {
      name: initial.name,
      callType: initial.callType,
      level: initial.level,
      campaign: initial.campaign,
      offer: initial.offer,
      prospectProfile: initial.prospectProfile,
      initialSituation: initial.initialSituation,
      objective: initial.objective,
      personality: initial.personality,
      allowedObjections: initial.allowedObjections,
      secretInfos: initial.secretInfos,
      successConditions: initial.successConditions,
      failureConditions: initial.failureConditions,
      targetDurationSec: initial.targetDurationSec,
      knowledgeRefs: initial.knowledgeRefs,
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ScenarioInitial>(key: K, value: ScenarioInitial[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleKnowledge(id: string) {
    setForm((f) => ({
      ...f,
      knowledgeRefs: f.knowledgeRefs.includes(id)
        ? f.knowledgeRefs.filter((k) => k !== id)
        : [...f.knowledgeRefs, id],
    }));
  }

  function addSecret() {
    setForm((f) => ({ ...f, secretInfos: [...f.secretInfos, { question: "", answer: "" }] }));
  }
  function updateSecret(i: number, key: "question" | "answer", value: string) {
    setForm((f) => {
      const next = [...f.secretInfos];
      next[i] = { ...next[i]!, [key]: value };
      return { ...f, secretInfos: next };
    });
  }
  function removeSecret(i: number) {
    setForm((f) => ({ ...f, secretInfos: f.secretInfos.filter((_, idx) => idx !== i) }));
  }

  async function submit(publish: boolean) {
    setError(null);
    setBusy(true);
    const payload = {
      name: form.name,
      callType: form.callType,
      level: form.level,
      campaign: form.campaign || undefined,
      offer: form.offer || undefined,
      prospectProfile: form.prospectProfile || undefined,
      initialSituation: form.initialSituation || undefined,
      objective: form.objective || undefined,
      personality: form.personality || undefined,
      allowedObjections: form.allowedObjections
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      secretInfos: form.secretInfos.filter((s) => s.question && s.answer),
      successConditions: form.successConditions || undefined,
      failureConditions: form.failureConditions || undefined,
      targetDurationSec: Number(form.targetDurationSec),
      knowledgeRefs: form.knowledgeRefs,
    };

    try {
      const res = await fetch(
        persistedScenarioId
          ? `/api/scenarios/${persistedScenarioId}`
          : "/api/scenarios",
        {
          method: persistedScenarioId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Enregistrement impossible.");
        return;
      }
      const scenarioId = persistedScenarioId ?? json?.data?.id;
      if (!scenarioId) {
        setError("Enregistrement impossible.");
        return;
      }
      if (!persistedScenarioId) {
        setPersistedScenarioId(scenarioId);
      }
      if (publish) {
        const pubRes = await fetch(`/api/scenarios/${scenarioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PUBLISHED" }),
        });
        const pubJson = await pubRes.json().catch(() => null);
        if (!pubRes.ok) {
          const apiMsg =
            pubJson?.error?.message ??
            "Publication impossible. Réessaie ou contacte un administrateur.";
          setError(
            `Le brouillon a été enregistré, mais la publication a échoué : ${apiMsg}`,
          );
          return;
        }
      }
      router.push(`/manager/scenarios/${scenarioId}`);
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-violet-500/50";
  const label = "mb-1 block text-xs uppercase tracking-wide text-white/50";

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(false); }} className="space-y-5">
      <Card className="space-y-4">
        <div>
          <label className={label} htmlFor="s-name">Nom du scénario *</label>
          <input id="s-name" required value={form.name} onChange={(e) => set("name", e.target.value)} className={field} placeholder="Ex. Prospect pressé — énergie" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="s-type">Type d&apos;appel</label>
            <select id="s-type" value={form.callType} onChange={(e) => set("callType", e.target.value)} className={field}>
              <option value="VENTE">Vente</option>
              <option value="PITCH_INVESTISSEUR">Pitch investisseur</option>
              <option value="ENTRETIEN_EMBAUCHE">Entretien d&apos;embauche</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="s-level">Niveau</label>
            <select id="s-level" value={form.level} onChange={(e) => set("level", e.target.value)} className={field}>
              <option value="FACILE">Facile</option>
              <option value="MOYEN">Moyen</option>
              <option value="DIFFICILE">Difficile</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="s-dur">Durée cible (s)</label>
            <input id="s-dur" type="number" min={60} max={1800} value={form.targetDurationSec} onChange={(e) => set("targetDurationSec", Number(e.target.value))} className={field} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="s-camp">Campagne</label>
          <input id="s-camp" value={form.campaign} onChange={(e) => set("campaign", e.target.value)} className={field} />
        </div>
      </Card>

      <Card className="space-y-4">
        <p className="text-sm font-semibold text-white">Contexte</p>
        <div>
          <label className={label} htmlFor="s-offer">Offre vendue</label>
          <textarea id="s-offer" rows={2} value={form.offer} onChange={(e) => set("offer", e.target.value)} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="s-prof">Profil du prospect</label>
          <textarea id="s-prof" rows={2} value={form.prospectProfile} onChange={(e) => set("prospectProfile", e.target.value)} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="s-sit">Situation initiale</label>
          <textarea id="s-sit" rows={2} value={form.initialSituation} onChange={(e) => set("initialSituation", e.target.value)} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="s-obj">Objectif du téléprospecteur</label>
          <textarea id="s-obj" rows={2} value={form.objective} onChange={(e) => set("objective", e.target.value)} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="s-perso">Personnalité du prospect</label>
          <input id="s-perso" value={form.personality} onChange={(e) => set("personality", e.target.value)} className={field} placeholder="Ex. méfiant, pressé, curieux" />
        </div>
      </Card>

      <Card className="space-y-4">
        <p className="text-sm font-semibold text-white">Objections & informations secrètes</p>
        <div>
          <label className={label} htmlFor="s-obj2">Objections autorisées (une par ligne)</label>
          <textarea id="s-obj2" rows={3} value={form.allowedObjections} onChange={(e) => set("allowedObjections", e.target.value)} className={field} placeholder={"Je n'ai pas le temps.\nC'est trop cher.\nJ'ai déjà un fournisseur."} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className={label}>Infos révélées seulement si la bonne question est posée</span>
            <button type="button" onClick={addSecret} className="text-xs text-violet-300">+ Ajouter</button>
          </div>
          <div className="space-y-2">
            {form.secretInfos.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input value={s.question} onChange={(e) => updateSecret(i, "question", e.target.value)} className={field} placeholder="Déclencheur (ex. budget)" />
                <input value={s.answer} onChange={(e) => updateSecret(i, "answer", e.target.value)} className={field} placeholder="Réponse révélée" />
                <button type="button" onClick={() => removeSecret(i)} className="px-2 text-white/40">✕</button>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="s-succ">Conditions de réussite</label>
            <textarea id="s-succ" rows={2} value={form.successConditions} onChange={(e) => set("successConditions", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="s-fail">Conditions d&apos;échec</label>
            <textarea id="s-fail" rows={2} value={form.failureConditions} onChange={(e) => set("failureConditions", e.target.value)} className={field} />
          </div>
        </div>
      </Card>

      {/* Connaissances approuvées à injecter */}
      <Card>
        <p className="mb-3 text-sm font-semibold text-white">
          Connaissances approuvées à injecter ({form.knowledgeRefs.length})
        </p>
        {knowledgeOptions.length === 0 ? (
          <p className="text-sm text-white/50">
            Aucune connaissance approuvée. Valide des connaissances pour les utiliser ici.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {knowledgeOptions.map((k) => (
              <label
                key={k.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={form.knowledgeRefs.includes(k.id)}
                  onChange={() => toggleKnowledge(k.id)}
                  className="mt-0.5"
                />
                <span className="text-white/75">{k.title}</span>
              </label>
            ))}
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="ghost" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer le brouillon"}
        </Button>
        <Button type="button" variant="primary" disabled={busy} onClick={() => submit(true)}>
          Publier le scénario
        </Button>
      </div>
    </form>
  );
}
