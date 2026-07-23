import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { formatDateTimeFr } from "@/lib/utils";
import { rateLimit } from "@/lib/ratelimit";

function csvEscape(value: string): string {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET() {
  const manager = await requireManager();

  // Limitation de débit sur l'export (endpoint potentiellement coûteux).
  if (!rateLimit(`export:${manager.id}`, 10, 60_000).allowed) {
    return new Response("Trop d'exports. Réessaie dans une minute.", {
      status: 429,
    });
  }

  const sims = await prisma.simulation.findMany({
    where: { organizationId: manager.organizationId, status: "COMPLETED" },
    include: {
      scenario: { select: { name: true, level: true } },
      telepro: { select: { fullName: true, email: true } },
      evaluation: { select: { overallScore: true, outcome: true } },
    },
    orderBy: { endedAt: "desc" },
  });

  const header = [
    "Date",
    "Téléprospecteur",
    "Email",
    "Scénario",
    "Niveau",
    "Score",
    "Résultat",
    "Durée (s)",
  ];
  const rows = sims.map((s) =>
    [
      formatDateTimeFr(s.endedAt),
      s.telepro.fullName,
      s.telepro.email,
      s.scenario.name,
      s.scenario.level,
      String(s.evaluation?.overallScore ?? ""),
      s.evaluation?.outcome ?? s.outcome ?? "",
      String(s.durationSec),
    ]
      .map((v) => csvEscape(v))
      .join(","),
  );
  const csv = "\uFEFF" + [header.join(","), ...rows].join("\n");

  await logAudit({
    organizationId: manager.organizationId,
    actorId: manager.id,
    action: "EXPORT",
    targetType: "Results",
    metadata: { count: sims.length },
  });

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="minduel-resultats.csv"`,
    },
  });
}
