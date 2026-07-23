"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

export function ResultsFilters({
  telepros,
  scenarios,
  current,
}: {
  telepros: Array<{ id: string; fullName: string }>;
  scenarios: Array<{ id: string; name: string }>;
  current: { telepro?: string; scenario?: string; period?: string };
}) {
  const router = useRouter();

  function apply(key: string, value: string) {
    const params = new URLSearchParams();
    const next = { ...current, [key]: value };
    if (next.telepro) params.set("telepro", next.telepro);
    if (next.scenario) params.set("scenario", next.scenario);
    if (next.period) params.set("period", next.period);
    router.push(`/manager/results?${params.toString()}`);
  }

  const field =
    "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white";

  return (
    <Card className="flex flex-wrap gap-3">
      <select className={field} value={current.telepro ?? ""} onChange={(e) => apply("telepro", e.target.value)}>
        <option value="">Tous les téléprospecteurs</option>
        {telepros.map((t) => (
          <option key={t.id} value={t.id}>{t.fullName}</option>
        ))}
      </select>
      <select className={field} value={current.scenario ?? ""} onChange={(e) => apply("scenario", e.target.value)}>
        <option value="">Tous les scénarios</option>
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select className={field} value={current.period ?? ""} onChange={(e) => apply("period", e.target.value)}>
        <option value="">Toute période</option>
        <option value="7">7 derniers jours</option>
        <option value="30">30 derniers jours</option>
        <option value="90">90 derniers jours</option>
      </select>
    </Card>
  );
}
