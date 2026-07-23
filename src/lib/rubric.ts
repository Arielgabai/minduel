// Grille d'évaluation par défaut (modifiable par le manager). Total = 100.

export interface RubricCriterion {
  key: string;
  label: string;
  weight: number; // = maxScore du critère
}

export const DEFAULT_RUBRIC: RubricCriterion[] = [
  { key: "accroche", label: "Accroche et présentation", weight: 10 },
  { key: "clarte", label: "Clarté et élocution", weight: 10 },
  { key: "decouverte", label: "Découverte et questions ouvertes", weight: 20 },
  { key: "ecoute", label: "Écoute et rebond", weight: 15 },
  { key: "qualification", label: "Qualification", weight: 10 },
  { key: "argumentation", label: "Argumentation personnalisée", weight: 15 },
  { key: "objections", label: "Traitement des objections", weight: 15 },
  { key: "conclusion", label: "Conclusion et prochaine étape", weight: 5 },
];

export function rubricTotal(criteria: RubricCriterion[]): number {
  return criteria.reduce((sum, c) => sum + c.weight, 0);
}
