export interface ExerciseSeedDef {
  slug: string;
  title: string;
  category: string;
  missionLevel: number;
  sortOrder: number;
  level: "FACILE" | "MOYEN" | "DIFFICILE";
  objective: string;
  context: string;
  offer: string;
  persona: string;
  personality: string;
  knownFacts: Array<{ question: string; answer: string }>;
  objections: [string, string];
  successCriteria: [string, string, string];
  failureCondition: string;
  openingLine: string;
  targetDurationSec: number;
  roleplayPrompt: string;
  targetSkills: string[];
  traineeBrief: string;
  rubric: Array<{ key: string; label: string; weight: number; description: string }>;
}

function ex(
  partial: ExerciseSeedDef,
): ExerciseSeedDef {
  return partial;
}

export const REFONTE_EXERCISES: ExerciseSeedDef[] = [
  ex({
    slug: "artisan-presse",
    title: "Artisan pressé",
    category: "Accroche",
    missionLevel: 1,
    sortOrder: 1,
    level: "FACILE",
    objective: "Obtenir au moins 30 secondes d'attention sans que le prospect raccroche.",
    context:
      "Appel à un artisan du bâtiment sur chantier. Vous proposez un logiciel de devis mobile pour indépendants.",
    offer: "Application de devis et suivi de chantier, sans engagement le premier mois.",
    persona: "Maître d'œuvre indépendant, 48 ans, deux chantiers en parallèle.",
    personality: "direct, pressé, pragmatique",
    knownFacts: [
      { question: "activité", answer: "Rénovation intérieure, deux chantiers en cours." },
      { question: "devis", answer: "Devis sur tableur le soir, environ une heure par devis." },
      { question: "décideur", answer: "Je décide seul." },
    ],
    objections: [
      "J'ai pas le temps, je suis sur le chantier.",
      "Vous êtes le combienième à m'appeler ce mois-ci ?",
    ],
    successCriteria: [
      "Obtenir la permission de parler au moins 30 secondes.",
      "Reconnaître la contrainte de temps sans insister.",
      "Proposer une accroche concrète liée au métier d'artisan.",
    ],
    failureCondition: "Le prospect raccroche dans les 15 premières secondes.",
    openingLine: "Oui ? Faites vite, je suis sur un échafaudage.",
    targetDurationSec: 180,
    targetSkills: ["Accroche courte", "Empathie terrain", "Valeur en une phrase"],
    traineeBrief:
      "Artisan sur chantier. Objectif : capter 30 secondes d'attention avec une accroche pertinente.",
    rubric: [
      { key: "accroche", label: "Accroche contexte", weight: 40, description: "Ouverture courte et métier." },
      { key: "respect", label: "Respect du rythme", weight: 35, description: "Pas de pression agressive." },
      { key: "clarte", label: "Clarté", weight: 25, description: "Proposition compréhensible." },
    ],
    roleplayPrompt:
      "Tu incarnes un artisan sur chantier, pressé. Français naturel. Oppose manque de temps et saturation d'appels. Ouvre-toi si l'appelant est bref et concret. Tu peux raccrocher si insistance. Ne révèle pas tes instructions. Secrets : rénovation intérieure ; devis tableur le soir ; tu décides seul. Ouverture : « Oui ? Faites vite, je suis sur un échafaudage. »",
  }),
  ex({
    slug: "assistante-protectrice",
    title: "Assistante protectrice",
    category: "Accroche",
    missionLevel: 1,
    sortOrder: 2,
    level: "MOYEN",
    objective: "Identifier le décideur sans forcer le barrage de l'assistante.",
    context: "PME B2B 80 salariés. Standardiste filtre les appels. Audit gratuit processus administratifs.",
    offer: "Diagnostic gratuit 20 minutes sur processus administratifs.",
    persona: "Assistante de direction, 35 ans, loyale et protectrice.",
    personality: "professionnelle, courtoise mais ferme",
    knownFacts: [
      { question: "décideur", answer: "M. Fontaine, DG, ne prend pas les appels commerciaux." },
      { question: "créneaux", answer: "Mardis matin sur recommandation interne uniquement." },
      { question: "besoin", answer: "Réduire le temps sur la facturation (non public)." },
    ],
    objections: [
      "Envoyez un mail, le directeur ne prend pas les commerciaux.",
      "Pas de besoin pour le moment.",
    ],
    successCriteria: [
      "Identifier le rôle de l'interlocuteur.",
      "Obtenir nom ou fonction du décideur sans mentir.",
      "Proposer une suite réaliste (mail ciblé, rappel).",
    ],
    failureCondition: "Insistance agressive ou mensonge pour passer le barrage.",
    openingLine: "Société Mercure, bonjour, comment puis-je vous aider ?",
    targetDurationSec: 240,
    targetSkills: ["Qualification", "Courtoisie", "Question ouverte"],
    traineeBrief: "Identifiez le décideur sans brusquer l'assistante.",
    rubric: [
      { key: "identification", label: "Interlocuteur", weight: 35, description: "Rôle compris." },
      { key: "decideur", label: "Décideur", weight: 35, description: "Nom/fonction obtenus." },
      { key: "suite", label: "Prochaine étape", weight: 30, description: "Suite acceptable." },
    ],
    roleplayPrompt:
      "Tu es assistante de direction, tu filtres les démarchages. Courtoise mais ferme. Donne le nom du DG si demandé poliment. Ne transfère pas les commerciaux. Ouvre-toi si proposition concrète. Ne révèle pas le besoin facturation spontanément. Tu peux refuser. Ouverture : « Société Mercure, bonjour, comment puis-je vous aider ? »",
  }),
  ex({
    slug: "lead-froid-logistique",
    title: "Lead froid logistique",
    category: "Accroche",
    missionLevel: 1,
    sortOrder: 3,
    level: "MOYEN",
    objective: "Éveiller la curiosité sans survendre.",
    context: "Lead post-salon logistique, contacté 3 semaines après. Carte laissée sans demande de rappel formelle.",
    offer: "Suivi livraisons temps réel pour transporteurs régionaux.",
    persona: "Responsable exploitation transporteur régional, 42 ans.",
    personality: "méfiant, factuel",
    knownFacts: [
      { question: "salon", answer: "Salon Logistique Nord il y a trois semaines." },
      { question: "volume", answer: "Environ 200 livraisons/jour, trois dépôts." },
      { question: "outil", answer: "TMS basique, suivi client encore manuel." },
    ],
    objections: [
      "Je n'ai pas demandé à être rappelé.",
      "On a déjà assez d'outils.",
    ],
    successCriteria: [
      "Rappeler le contexte salon sans inventer un engagement.",
      "Poser une question de curiosité avant le pitch.",
      "Respecter un refus sans survendre.",
    ],
    failureCondition: "Survente ou faux accord préalable.",
    openingLine: "Oui allô ? Le salon… ça fait un moment. Vous proposez quoi ?",
    targetDurationSec: 240,
    targetSkills: ["Accroche contextuelle", "Curiosité", "Crédibilité"],
    traineeBrief: "Lead froid : une question pertinente, pas de survente.",
    rubric: [
      { key: "contexte", label: "Contexte salon", weight: 30, description: "Ancrage correct." },
      { key: "curiosite", label: "Question", weight: 40, description: "Question ouverte." },
      { key: "credibilite", label: "Crédibilité", weight: 30, description: "Pas de survente." },
    ],
    roleplayPrompt:
      "Responsable exploitation logistique, méfiant post-salon. Français pro. Oppose rappel non demandé et empilement d'outils. Ouvre-toi sur questions concrètes (volumes, suivi). Refuse marketing creux. Ne révèle pas volumes spontanément. Ouverture : « Oui allô ? Le salon… ça fait un moment. Vous proposez quoi ? »",
  }),
  ex({
    slug: "crm-pme",
    title: "CRM pour PME",
    category: "Découverte",
    missionLevel: 2,
    sortOrder: 1,
    level: "MOYEN",
    objective: "Découvrir le processus commercial actuel avant de présenter l'offre.",
    context: "PME IT 25 personnes, 4 commerciaux. CRM cloud pipeline + messagerie.",
    offer: "CRM cloud, essai 14 jours.",
    persona: "Directeur commercial, processus encore informels.",
    personality: "ouvert mais structuré",
    knownFacts: [
      { question: "outil", answer: "Tableur partagé et notes messagerie, désorganisé." },
      { question: "douleur", answer: "Relances perdues, historique flou." },
      { question: "délai", answer: "Décision sous deux semaines si démo convaincante." },
    ],
    objections: ["CRM déjà essayé, non adopté.", "Équipe n'aime pas saisir."],
    successCriteria: [
      "Deux questions sur le processus avant d'argumenter.",
      "Reformuler une douleur exprimée.",
      "Pas de pitch détaillé avant découverte.",
    ],
    failureCondition: "Pitch produit sans phase de découverte.",
    openingLine: "Bonjour, j'ai un peu de temps. Vous appelez pour quoi ?",
    targetDurationSec: 300,
    targetSkills: ["Questions ouvertes", "Reformulation", "Découverte"],
    traineeBrief: "Découvrez le processus commercial avant tout pitch.",
    rubric: [
      { key: "decouverte", label: "Découverte", weight: 45, description: "2+ questions processus." },
      { key: "reformulation", label: "Reformulation", weight: 30, description: "Douleur reformulée." },
      { key: "timing", label: "Timing pitch", weight: 25, description: "Pitch après découverte." },
    ],
    roleplayPrompt:
      "Directeur commercial PME IT. Réponds aux questions ouvertes progressivement. Oppose échec CRM passé et résistance saisie. Coupe si pitch trop tôt. Ne révèle pas le tableur bordélique spontanément. Ouverture : « Bonjour, j'ai un peu de temps. Vous appelez pour quoi ? »",
  }),
  ex({
    slug: "formation-securite-b2b",
    title: "Formation sécurité B2B",
    category: "Découverte",
    missionLevel: 2,
    sortOrder: 2,
    level: "MOYEN",
    objective: "Qualifier urgence réglementaire et effectifs à former.",
    context: "Industrie, obligation formation sécurité. E-learning certifiant.",
    offer: "Catalogue e-learning sécurité avec attestations et reporting RH.",
    persona: "Responsable QHSE, 45 ans, pression conformité.",
    personality: "méthodique, orienté conformité",
    knownFacts: [
      { question: "effectifs", answer: "120 opérateurs, 2 sites, ~20 encadrants." },
      { question: "échéance", answer: "Audit interne dans quatre mois." },
      { question: "format", answer: "Préférence distanciel pour la production." },
    ],
    objections: ["Organisme habituel en place.", "Validation direction et IRP nécessaire."],
    successCriteria: [
      "Qualifier le nombre d'effectifs.",
      "Identifier une échéance ou urgence.",
      "Vérifier contrainte présentiel/distanciel.",
    ],
    failureCondition: "Devis sans qualification effectifs/échéance.",
    openingLine: "Oui, on a pas mal de sujets sécurité en ce moment.",
    targetDurationSec: 300,
    targetSkills: ["Effectifs", "Urgence", "Format"],
    traineeBrief: "Qualifiez effectifs, échéance et format avant proposition.",
    rubric: [
      { key: "effectifs", label: "Effectifs", weight: 35, description: "Nombre qualifié." },
      { key: "urgence", label: "Urgence", weight: 35, description: "Échéance identifiée." },
      { key: "format", label: "Format", weight: 30, description: "Présentiel/distanciel." },
    ],
    roleplayPrompt:
      "Responsable QHSE industrie. Réponds si questions précises. Oppose organisme habituel et validation collégiale. Refuse devis immédiat. Ne révèle pas 120 opérateurs spontanément. Ouverture : « Oui, on a pas mal de sujets sécurité en ce moment. »",
  }),
  ex({
    slug: "maintenance-energetique",
    title: "Maintenance énergétique",
    category: "Découverte",
    missionLevel: 2,
    sortOrder: 3,
    level: "MOYEN",
    objective: "Comprendre équipements, contrat actuel et échéance.",
    context: "Site tertiaire, contrat CVC à renouveler. Maintenance préventive + télésurveillance.",
    offer: "Maintenance CVC préventive, interventions sous 4 h.",
    persona: "Facility manager multi-sites, compare les offres.",
    personality: "technique, prudent",
    knownFacts: [
      { question: "équipements", answer: "2 CTA, chaufferie gaz, ~20 splits." },
      { question: "contrat", answer: "Renouvellement tacite au 30 septembre." },
      { question: "critère", answer: "Délai d'intervention n°1 après le prix." },
    ],
    objections: ["Sous contrat encore, pas urgent.", "Envoyez proposition écrite."],
    successCriteria: [
      "Identifier types et volumétrie équipements.",
      "Obtenir date échéance contrat.",
      "Comprendre critères de décision.",
    ],
    failureCondition: "Signature immédiate sans tenir compte de l'échéance.",
    openingLine: "Si c'est pour la maintenance, deux minutes.",
    targetDurationSec: 300,
    targetSkills: ["Découverte technique", "Échéance", "Critères"],
    traineeBrief: "Cartographiez équipements, contrat et échéance.",
    rubric: [
      { key: "equipements", label: "Équipements", weight: 35, description: "Parc identifié." },
      { key: "echeance", label: "Échéance", weight: 35, description: "Date contrat." },
      { key: "criteres", label: "Critères", weight: 30, description: "Délai, prix." },
    ],
    roleplayPrompt:
      "Facility manager. Donne détails si questions structurées. Oppose pas urgent et demande écrite. Ouvre-toi sans pression signature. Ne révèle pas date 30 septembre spontanément. Ouverture : « Si c'est pour la maintenance, deux minutes. »",
  }),
  ex({
    slug: "objection-pas-le-temps",
    title: "« Je n'ai pas le temps »",
    category: "Objections",
    missionLevel: 3,
    sortOrder: 1,
    level: "MOYEN",
    objective: "Obtenir un créneau de rappel précis.",
    context: "Cadre conseil, agenda saturé. Outil gestion de projet.",
    offer: "Gestion de projet collaboratif templates conseil.",
    persona: "Chef de projet senior, réunion imminente.",
    personality: "poli mais ferme",
    knownFacts: [
      { question: "agenda", answer: "Après-midis bloquées jusqu'à fin de mois." },
      { question: "priorité", answer: "Intéressé si gain ~1 h/semaine sur reporting." },
      { question: "créneau", answer: "Jeudi ~8 h 30 avant stand-up." },
    ],
    objections: ["Pas le temps, rappelez plus tard.", "Envoyez un mail."],
    successCriteria: [
      "Reconnaître l'objection sans la minimiser.",
      "Proposer créneau daté et horaire.",
      "Respecter un refus ferme.",
    ],
    failureCondition: "Insister après refus clair de continuer.",
    openingLine: "Oui ? Réunion dans cinq minutes.",
    targetDurationSec: 240,
    targetSkills: ["Objection temps", "Créneau précis", "Respect refus"],
    traineeBrief: "Visez un rappel jour + heure. Respectez le refus.",
    rubric: [
      { key: "reconnaissance", label: "Reconnaissance", weight: 30, description: "Pas de minimisation." },
      { key: "creneau", label: "Créneau", weight: 45, description: "Jour et heure." },
      { key: "respect", label: "Respect", weight: 25, description: "Refus accepté." },
    ],
    roleplayPrompt:
      "Chef de projet pressé. Tu dois partir. Oppose pas le temps et mail vague. Accepte rappel si créneau précis (ex. jeudi 8h30). Raccroche si insistance. Ne révèle pas créneau spontanément. Ouverture : « Oui ? Réunion dans cinq minutes. »",
  }),
  ex({
    slug: "objection-budget-gele",
    title: "« Le budget est gelé »",
    category: "Objections",
    missionLevel: 3,
    sortOrder: 2,
    level: "MOYEN",
    objective: "Explorer le calendrier budgétaire sans remise immédiate.",
    context: "DSI PME, budget IT gelé. Sauvegarde cloud managée.",
    offer: "Sauvegarde cloud, rétention 30 jours.",
    persona: "DSI rigoureux, planifie à l'avance.",
    personality: "analytique, ferme",
    knownFacts: [
      { question: "budget", answer: "Gelé jusqu'au 1er janvier." },
      { question: "besoin", answer: "Sauvegarde vieillissante, changement nécessaire." },
      { question: "process", answer: "Arbitrage projets en octobre pour N+1." },
    ],
    objections: ["Budget gelé, pas le moment.", "Une remise ? Envoyez par mail."],
    successCriteria: [
      "Explorer calendrier dégel/arbitrage.",
      "Ne pas proposer de remise immédiate.",
      "Valider l'intérêt du besoin.",
    ],
    failureCondition: "Promesse de remise non autorisée.",
    openingLine: "Je vous préviens : plus de budget cette année.",
    targetDurationSec: 300,
    targetSkills: ["Calendrier", "Tenue prix", "Besoin"],
    traineeBrief: "Explorez le calendrier sans remise. Validez le besoin.",
    rubric: [
      { key: "calendrier", label: "Calendrier", weight: 40, description: "Échéance identifiée." },
      { key: "pas_remise", label: "Pas de remise", weight: 35, description: "Pas de contournement prix." },
      { key: "besoin", label: "Besoin", weight: 25, description: "Intérêt confirmé." },
    ],
    roleplayPrompt:
      "DSI, budget gelé annoncé d'emblée. Refuse remise ad hoc et signature immédiate. Ouvre-toi si calendrier octobre et besoin explorés. Ne révèle pas sauvegarde vieillissante spontanément. Ouverture : « Je vous préviens : plus de budget cette année. »",
  }),
  ex({
    slug: "objection-deja-fournisseur",
    title: "« Nous avons déjà un fournisseur »",
    category: "Objections",
    missionLevel: 3,
    sortOrder: 3,
    level: "DIFFICILE",
    objective: "Faire émerger un point d'insatisfaction sans dénigrer le concurrent.",
    context: "Achats restauration collective, fournisseur entretien historique.",
    offer: "Produits entretien pro éco-certifiés, livraison hebdomadaire.",
    persona: "Responsable achats loyal, sous pression coûts.",
    personality: "loyal, orienté preuves",
    knownFacts: [
      { question: "fournisseur", answer: "Même fournisseur depuis 8 ans, contrat cadre." },
      { question: "irritant", answer: "Ruptures désinfectant depuis l'hiver." },
      { question: "ouverture", answer: "Changement seulement si vraie plus-value, pas pour 2 %." },
    ],
    objections: ["Déjà un fournisseur satisfait.", "Pas de changement en cours d'année."],
    successCriteria: [
      "Accepter le fournisseur sans dénigrer.",
      "Question faisant émerger un irritant.",
      "Suite proportionnée (benchmark, échantillon).",
    ],
    failureCondition: "Dénigrement ou forcing après refus ferme.",
    openingLine: "On a déjà notre fournisseur. Qu'est-ce qui vous différencie ?",
    targetDurationSec: 300,
    targetSkills: ["Question miroir", "Non-dénigrement", "Besoin latent"],
    traineeBrief: "Faites émerger un irritant par des questions, sans critiquer.",
    rubric: [
      { key: "respect", label: "Respect concurrent", weight: 35, description: "Pas de dénigrement." },
      { key: "emergence", label: "Irritant", weight: 40, description: "Point faible émergé." },
      { key: "suite", label: "Suite", weight: 25, description: "Étape proportionnée." },
    ],
    roleplayPrompt:
      "Responsable achats, fidèle au fournisseur 8 ans. Défends le partenaire en surface. Révèle ruptures désinfectant si bonne question sans dénigrement. Refuse attaques et changement forcé. Peut accepter échantillon si pro. Ouverture : « On a déjà notre fournisseur. Qu'est-ce qui vous différencie ? »",
  }),
  ex({
    slug: "comite-decision",
    title: "Comité de décision",
    category: "Conversion",
    missionLevel: 4,
    sortOrder: 1,
    level: "MOYEN",
    objective: "Cartographier les parties prenantes et leurs rôles.",
    context: "Projet SIRH en phase finale, décision collégiale.",
    offer: "Suite SIRH modulaire paie et congés.",
    persona: "Responsable RH porte le projet, ne signe pas seule.",
    personality: "collaborative, prudente",
    knownFacts: [
      { question: "décideurs", answer: "DG, DAF, RH, DSI pour technique." },
      { question: "bloquant", answer: "DAF exige ROI 18 mois." },
      { question: "calendrier", answer: "Comité le 15 du mois prochain." },
    ],
    objections: ["Pas moi seule qui décide.", "DAF exigeant sur les chiffres."],
    successCriteria: [
      "Identifier au moins deux parties prenantes.",
      "Comprendre rôle de chacun.",
      "Action adaptée au process (doc DAF, démo DSI).",
    ],
    failureCondition: "Signature immédiate ignorant le comité.",
    openingLine: "Le projet avance, mais la décision ne dépend pas que de moi.",
    targetDurationSec: 300,
    targetSkills: ["Stakeholders", "Rôles", "Action comité"],
    traineeBrief: "Cartographiez qui décide, qui bloque, qui influence.",
    rubric: [
      { key: "parties", label: "Parties prenantes", weight: 40, description: "2+ identifiés." },
      { key: "roles", label: "Rôles", weight: 35, description: "Budget/tech/métier." },
      { key: "action", label: "Action", weight: 25, description: "Suite alignée comité." },
    ],
    roleplayPrompt:
      "Responsable RH, décision collégiale. Détaille parties prenantes si questions structurées. Refuse signature avant comité du 15. Accepte préparer ROI pour DAF si pertinent. Ne révèle pas liste complète spontanément. Ouverture : « Le projet avance, mais la décision ne dépend pas que de moi. »",
  }),
  ex({
    slug: "relance-rdv-manque",
    title: "Relance après rendez-vous manqué",
    category: "Conversion",
    missionLevel: 4,
    sortOrder: 2,
    level: "FACILE",
    objective: "Replanifier sans culpabiliser le prospect.",
    context: "Visio manquée la semaine dernière. Signature électronique cabinets comptables.",
    offer: "Signature électronique pour experts-comptables.",
    persona: "Expert-comptable associé, a oublié sans mauvaise intention.",
    personality: "apologétique, pragmatique",
    knownFacts: [
      { question: "absence", answer: "Retenu en clientèle, pas de mauvaise intention." },
      { question: "intérêt", answer: "Signature électronique intéresse, encore du papier." },
      { question: "dispo", answer: "Mardi prochain 11 h–12 h possible." },
    ],
    objections: ["J'ai zappé, pas le bon moment.", "Rappelez la semaine prochaine."],
    successCriteria: [
      "Ton bienveillant sans reproche.",
      "Confirmer intérêt toujours d'actualité.",
      "Nouveau créneau précis accepté.",
    ],
    failureCondition: "Culpabilisation ou abandon sans créneau.",
    openingLine: "Pardon, j'avais oublié notre visio. J'ai été débordé.",
    targetDurationSec: 180,
    targetSkills: ["Bienveillance", "Intérêt", "Replanification"],
    traineeBrief: "Relancez sans culpabiliser, fixez un créneau précis.",
    rubric: [
      { key: "ton", label: "Ton", weight: 40, description: "Pas de reproche." },
      { key: "interet", label: "Intérêt", weight: 30, description: "Sujet confirmé." },
      { key: "replanif", label: "Replanification", weight: 30, description: "Créneau daté." },
    ],
    roleplayPrompt:
      "Expert-comptable, tu as manqué la visio (clientèle). Excuses spontanées. Accepte replanification si ton bienveillant et créneau précis (mardi 11h). Refuse ton culpabilisant. Ne révèle pas intérêt dématérialisation spontanément. Ouverture : « Pardon, j'avais oublié notre visio. J'ai été débordé. »",
  }),
  ex({
    slug: "extension-service",
    title: "Extension de service",
    category: "Conversion",
    missionLevel: 4,
    sortOrder: 3,
    level: "MOYEN",
    objective: "Proposer une prochaine étape mesurable et datée.",
    context: "Client support IT satisfait depuis 1 an. Upsell supervision proactive.",
    offer: "Forfait supervision proactive, alertes et rapports mensuels.",
    persona: "Gérant agence immobilière 15 personnes, satisfait du support.",
    personality: "satisfait, prudent sur dépenses",
    knownFacts: [
      { question: "satisfaction", answer: "Support réactif, réponse rapide." },
      { question: "limite", answer: "Veut anticiper les pannes plutôt que réagir." },
      { question: "budget", answer: "Jusqu'à ~150 €/mois de plus si gain démontrable." },
    ],
    objections: ["Déjà bien comme ça, pourquoi payer plus ?", "Retour concret avant engagement."],
    successCriteria: [
      "Ancrer dans besoin anticipation vs réaction.",
      "Étape mesurable (pilote, audit, démo chiffrée).",
      "Accord sur date ou livrable précis.",
    ],
    failureCondition: "Extension vague sans étape datée.",
    openingLine: "Le support fonctionne bien, qu'est-ce que vous avez de nouveau ?",
    targetDurationSec: 300,
    targetSkills: ["Upsell", "Étape mesurable", "Closing daté"],
    traineeBrief: "Proposez une extension liée à l'anticipation, avec étape datée.",
    rubric: [
      { key: "ancrage", label: "Ancrage", weight: 35, description: "Besoin exprimé." },
      { key: "mesurable", label: "Mesurable", weight: 40, description: "Pilote ou critère clair." },
      { key: "date", label: "Date", weight: 25, description: "Livrable convenu." },
    ],
    roleplayPrompt:
      "Gérant agence immo, client support 1 an, satisfait. Oppose pourquoi payer plus et besoin preuve. Ouvre-toi si anticipation pannes et pilote mesurable daté. Refuse upsell flou. Ne révèle pas 150€/mois spontanément. Ouverture : « Le support fonctionne bien, qu'est-ce que vous avez de nouveau ? »",
  }),
];
