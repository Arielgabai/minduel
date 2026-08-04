"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Badge, SectionTitle } from "@/components/ui";
import { CALL_TYPE_LABELS, LEVEL_LABELS } from "@/lib/enums";

interface Practice {
  id: string;
  label: string;
  description: string;
  importance: string;
  evidenceSegmentIds: string[];
}
interface RubricCriterion {
  key: string;
  label: string;
  weight: number;
  description?: string;
  observableSignals?: string[];
  sourcePracticeIds?: string[];
}
export interface ReviewData {
  scenario: {
    id: string;
    name: string;
    status: string;
    callType: string;
    level: string;
    offer: string;
    objective: string;
    prospectProfile: string;
    initialSituation: string;
    personality: string;
    traineeBrief: string;
    relationshipHistory: string;
    allowedObjections: string[];
    successConditions: string;
    failureConditions: string;
    expectedNextSteps: string[];
    targetSkills: string[];
    coachingReference: string[];
  };
  analysis: {
    callType: string;
    callTypeConfidence: number;
    relationshipStage: string;
    summary: string;
    suitabilityScore: number;
    commercialObjective: string;
    outcome: string;
    customerProfile: {
      role: string;
      context: string;
      needs: string[];
      objections: string[];
      signals: string[];
    } | null;
    retainedPractices: Practice[];
    ambiguities: Array<{ id: string; question: string; importance: string }>;
  } | null;
  segmentsByIdx: Record<string, { role: string; text: string }>;
  rubric: RubricCriterion[];
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  NEW: "Nouveau prospect",
  EXISTING: "Client existant",
  RENEWAL: "Renouvellement",
  UNKNOWN: "Indéterminé",
};

/**
 * Consultation historique d'un appel modèle (LOT O : lecture seule).
 * Plus de publication, assignation, ni création d'exercice depuis l'UI.
 */
export function RecordingReview({ data }: { data: ReviewData }) {
  const { scenario, analysis } = data;
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const published = scenario.status === "PUBLISHED";
  const confidencePct = analysis ? Math.round(analysis.callTypeConfidence * 100) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone={published ? "mint" : "flame"}>
            {published ? "Publié" : "Brouillon historique"}
          </Badge>
          {analysis && (
            <>
              <Badge tone="violet">
                {CALL_TYPE_LABELS[analysis.callType] ?? analysis.callType} ·{" "}
                {confidencePct}%
              </Badge>
              <Badge tone="blue">
                {RELATIONSHIP_LABELS[analysis.relationshipStage] ??
                  analysis.relationshipStage}
              </Badge>
              <Badge tone={analysis.suitabilityScore >= 60 ? "mint" : "gray"}>
                Pertinence {analysis.suitabilityScore}/100
              </Badge>
            </>
          )}
          <Badge tone="gray">
            {LEVEL_LABELS[scenario.level] ?? scenario.level}
          </Badge>
        </div>
        <h2 className="text-xl font-bold text-white">{scenario.name}</h2>
        {analysis && (
          <p className="mt-1 max-w-2xl text-sm text-white/60">{analysis.summary}</p>
        )}
        <p className="mt-3 text-xs text-white/40">
          Consultation historique — administration du catalogue dans /admin.
          {published ? (
            <>
              {" "}
              <Link
                href={`/manager/exercises/detail/${scenario.id}`}
                className="text-electric-300 underline-offset-2 hover:underline"
              >
                Voir la fiche exercice
              </Link>
            </>
          ) : null}
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {analysis && (
            <Card>
              <SectionTitle className="mb-3">Analyse de l&apos;appel</SectionTitle>
              <dl className="space-y-2 text-sm">
                <Row label="Objectif commercial" value={analysis.commercialObjective} />
                <Row label="Issue" value={analysis.outcome} />
                {analysis.customerProfile && (
                  <>
                    <Row label="Interlocuteur" value={analysis.customerProfile.role} />
                    <Row label="Contexte" value={analysis.customerProfile.context} />
                  </>
                )}
              </dl>
            </Card>
          )}

          {analysis && analysis.retainedPractices.length > 0 && (
            <Card>
              <SectionTitle className="mb-3">Bonnes pratiques retenues</SectionTitle>
              <div className="space-y-2">
                {analysis.retainedPractices.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-white/10 bg-white/5 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white">{p.label}</p>
                      <Badge
                        tone={
                          p.importance === "HIGH"
                            ? "flame"
                            : p.importance === "MEDIUM"
                              ? "violet"
                              : "gray"
                        }
                      >
                        {p.importance}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-white/65">{p.description}</p>
                    {p.evidenceSegmentIds.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenEvidence(openEvidence === p.id ? null : p.id)
                          }
                          className="mt-2 text-xs text-violet-300 hover:underline"
                        >
                          {openEvidence === p.id
                            ? "Masquer les preuves"
                            : `Voir les preuves (${p.evidenceSegmentIds.length})`}
                        </button>
                        {openEvidence === p.id && (
                          <div className="mt-2 space-y-1 border-l-2 border-violet-500/40 pl-2">
                            {p.evidenceSegmentIds.map((idx) => {
                              const seg = data.segmentsByIdx[idx];
                              return (
                                <p key={idx} className="text-xs italic text-white/50">
                                  {seg
                                    ? `${seg.role === "AGENT" ? "Commercial" : "Client"} : « ${seg.text} »`
                                    : `Segment ${idx}`}
                                </p>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {analysis && analysis.ambiguities.length > 0 && (
            <Card className="border-amber-500/20 bg-amber-500/5">
              <SectionTitle className="mb-2">Points d&apos;attention</SectionTitle>
              <ul className="list-disc space-y-1 pl-5 text-sm text-white/60">
                {analysis.ambiguities.map((a) => (
                  <li key={a.id}>{a.question}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <SectionTitle className="mb-3">Exercice associé</SectionTitle>
            <dl className="space-y-2 text-sm">
              <Row label="Brief du commercial" value={scenario.traineeBrief} />
              <Row label="Objectif" value={scenario.objective} />
              <Row label="Situation initiale" value={scenario.initialSituation} />
              {scenario.relationshipHistory && (
                <Row label="Historique relation" value={scenario.relationshipHistory} />
              )}
              {scenario.targetSkills.length > 0 && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-white/40">
                    Compétences ciblées
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {scenario.targetSkills.map((s) => (
                      <Badge key={s} tone="violet">
                        {s}
                      </Badge>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <SectionTitle className="mb-3">Grille d&apos;évaluation</SectionTitle>
            <div className="space-y-2">
              {data.rubric.map((c) => (
                <div
                  key={c.key}
                  className="rounded-lg border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">{c.label}</p>
                    <Badge tone="violet">{c.weight} pts</Badge>
                  </div>
                  {c.description && (
                    <p className="mt-1 text-xs text-white/55">{c.description}</p>
                  )}
                  {c.observableSignals && c.observableSignals.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-white/45">
                      {c.observableSignals.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <p className="text-right text-xs text-white/40">
                Total : {data.rubric.reduce((s, c) => s + c.weight, 0)} / 100
              </p>
            </div>
          </Card>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-sm text-white/45 hover:text-white/70"
        >
          {showAdvanced
            ? "− Masquer les détails avancés"
            : "+ Détails avancés (transcript anonymisé)"}
        </button>
        {showAdvanced && (
          <Card className="mt-2 max-h-[400px] space-y-2 overflow-y-auto">
            {Object.keys(data.segmentsByIdx).length === 0 ? (
              <p className="text-sm text-white/50">Aucun segment disponible.</p>
            ) : (
              Object.entries(data.segmentsByIdx)
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .map(([idx, seg]) => (
                  <p key={idx} className="text-sm">
                    <span
                      className={
                        seg.role === "AGENT" ? "text-violet-300" : "text-flame-400"
                      }
                    >
                      {seg.role === "AGENT" ? "Commercial" : "Client"} :
                    </span>{" "}
                    <span className="text-white/70">{seg.text}</span>
                  </p>
                ))
            )}
            <p className="pt-2 text-xs text-white/40">
              Transcript anonymisé (PII remplacées). L&apos;original chiffré reste côté
              serveur.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-white/40">{label}</dt>
      <dd className="mt-0.5 text-white/75">{value}</dd>
    </div>
  );
}
