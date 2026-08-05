/**
 * LOT Q3A — recommandation d'exercices associés à un appel réel.
 *
 * Audit : les exercices publiés n'ont PAS de clés de compétences stables et
 * fiables pour une correspondance déterministe avec weakSkillKeys :
 * - Scenario.targetSkills est du texte libre (souvent issu du LLM) ;
 * - EvaluationRubric.criteria.key n'est pas un vocabulaire imposé au catalogue ;
 * - SkillArticleMapping.skillKey sert au débrief/articles, pas à la reco mission.
 *
 * Donc : aucune correspondance par titre/intuition/LLM ; liste vide.
 * Le contrat weakSkillKeys est exposé pour qu'un mapping administrable
 * puisse être ajouté en Q3B.
 */

export type AssociatedExerciseCta = {
  scenarioId: string;
  playable: boolean;
};

export type AssociatedExerciseRecommendation = {
  /**
   * Toujours vide tant qu'aucun mapping administrable clé→exercice
   * n'existe sur le catalogue P2.
   */
  items: AssociatedExerciseCta[];
  /** Clés de faiblesses normalisées (contrat pour Q3B). */
  weakSkillKeys: string[];
  /** Pourquoi la liste est vide (documentation stable pour l'UI). */
  reason:
    | "NO_RELIABLE_SKILL_KEY_MAPPING"
    | "NO_WEAK_SKILLS"
    | "MATCHED";
};

/**
 * Service pur et déterministe. Sans mapping fiable → liste vide (jamais fictive).
 */
export function recommendExercisesForWeakSkills(input: {
  weakSkillKeys: readonly string[];
}): AssociatedExerciseRecommendation {
  const weakSkillKeys = [...input.weakSkillKeys]
    .map((k) => k.trim())
    .filter(Boolean)
    .sort();

  if (weakSkillKeys.length === 0) {
    return {
      items: [],
      weakSkillKeys,
      reason: "NO_WEAK_SKILLS",
    };
  }

  return {
    items: [],
    weakSkillKeys,
    reason: "NO_RELIABLE_SKILL_KEY_MAPPING",
  };
}
