/**
 * Seed reproductible du mode démo MINDUEL.
 * Crée : une organisation "Démo MINDUEL", un manager, deux téléprospecteurs,
 * une grille par défaut, trois scénarios publiés, deux appels réels fictifs déjà
 * analysés (transcript + connaissances approuvées), des assignations et
 * plusieurs simulations historiques avec évaluations cohérentes.
 *
 * Idempotent : purge l'organisation démo puis la recrée.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

const DEMO_SLUG = "demo-minduel";
const PWD = "demo1234";

/**
 * Garde-fou : le seed de démonstration crée des comptes avec un mot de passe
 * public (demo1234). Il REFUSE de s'exécuter en production sauf si
 * ALLOW_DEMO_SEED=true est défini explicitement (démo assumée).
 */
function assertSeedAllowed(): void {
  const isProd = process.env.NODE_ENV === "production";
  const allowed = ["true", "1", "yes"].includes(
    (process.env.ALLOW_DEMO_SEED ?? "").toLowerCase(),
  );
  if (isProd && !allowed) {
    console.error(
      "⛔ Seed de démonstration refusé en production.\n" +
        "   Définissez ALLOW_DEMO_SEED=true UNIQUEMENT pour un environnement de démonstration assumé.",
    );
    process.exit(1);
  }
}

function iso(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * 864e5).toISOString();
}
function dayKey(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
}

const RUBRIC = [
  { key: "accroche", label: "Accroche et présentation", weight: 10 },
  { key: "clarte", label: "Clarté et élocution", weight: 10 },
  { key: "decouverte", label: "Découverte et questions ouvertes", weight: 20 },
  { key: "ecoute", label: "Écoute et rebond", weight: 15 },
  { key: "qualification", label: "Qualification", weight: 10 },
  { key: "argumentation", label: "Argumentation personnalisée", weight: 15 },
  { key: "objections", label: "Traitement des objections", weight: 15 },
  { key: "conclusion", label: "Conclusion et prochaine étape", weight: 5 },
];

async function main() {
  assertSeedAllowed();
  const hash = await bcrypt.hash(PWD, 10);

  // Purge de l'organisation démo existante (cascade).
  const existing = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } });
  if (existing) {
    // Supprimer les users liés (sessions cascade) puis l'org.
    await prisma.user.deleteMany({ where: { organizationId: existing.id } });
    await prisma.organization.delete({ where: { id: existing.id } });
    console.log("• Ancienne organisation démo supprimée");
  }

  // Organisation
  const org = await prisma.organization.create({
    data: {
      name: "Démo MINDUEL",
      slug: DEMO_SLUG,
      isActive: true,
      isDemo: true,
      retentionDays: 90,
      allowManagerPlayback: true,
      createdAt: iso(30),
      updatedAt: iso(),
    },
  });

  // Grille par défaut
  await prisma.evaluationRubric.create({
    data: {
      organizationId: org.id,
      name: "Grille par défaut",
      criteria: JSON.stringify(RUBRIC),
      createdAt: iso(30),
      updatedAt: iso(30),
    },
  });

  // Utilisateurs
  const manager = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "manager@demo.minduel.app",
      passwordHash: hash,
      fullName: "Claire Dubois",
      role: "MANAGER",
      isActive: true,
      createdAt: iso(30),
      updatedAt: iso(),
    },
  });
  await prisma.teamMembership.create({
    data: { organizationId: org.id, userId: manager.id, role: "MANAGER", createdAt: iso(30) },
  });

  const ruben = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "ruben@demo.minduel.app",
      passwordHash: hash,
      fullName: "Ruben Martin",
      role: "TELEPRO",
      isActive: true,
      streakDays: 3,
      lastActiveDay: dayKey(0),
      tempPassword: PWD,
      createdAt: iso(20),
      updatedAt: iso(),
    },
  });
  const lina = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "lina@demo.minduel.app",
      passwordHash: hash,
      fullName: "Lina Bernard",
      role: "TELEPRO",
      isActive: true,
      streakDays: 1,
      lastActiveDay: dayKey(1),
      tempPassword: PWD,
      createdAt: iso(18),
      updatedAt: iso(),
    },
  });
  for (const u of [ruben, lina]) {
    await prisma.teamMembership.create({
      data: { organizationId: org.id, userId: u.id, role: "TELEPRO", createdAt: iso(18) },
    });
  }

  // ---- Deux appels réels fictifs déjà analysés ----
  const recordings = [
    {
      title: "Appel énergie — objection saturation",
      campaign: "Énergie Q3",
      outcome: "RDV",
      tags: ["énergie", "objection"],
      segments: [
        { speaker: "PROSPECT", text: "Allô, oui ?", startMs: 1500, endMs: 2600 },
        { speaker: "AGENT", text: "Bonjour, Julie de Novéo, je vous appelle au sujet de votre facture d'énergie.", startMs: 3000, endMs: 6200 },
        { speaker: "PROSPECT", text: "On m'a déjà appelé mille fois pour ça.", startMs: 6600, endMs: 8400 },
        { speaker: "AGENT", text: "C'est vrai que le secteur est saturé. La différence, c'est qu'on part de votre consommation réelle.", startMs: 8800, endMs: 12800 },
        { speaker: "PROSPECT", text: "Et c'est quoi le piège ?", startMs: 13200, endMs: 14600 },
        { speaker: "AGENT", text: "Aucun engagement la première année. Vous êtes propriétaire ou locataire ?", startMs: 15000, endMs: 18200 },
        { speaker: "PROSPECT", text: "Propriétaire, tout électrique.", startMs: 18600, endMs: 20000 },
        { speaker: "AGENT", text: "Parfait. Seriez-vous disponible jeudi pour un point de 15 minutes ?", startMs: 20400, endMs: 23400 },
        { speaker: "PROSPECT", text: "Oui, jeudi ça peut aller.", startMs: 23800, endMs: 25200 },
      ],
      knowledge: [
        { type: "OBJECTION", title: "« On m'a déjà appelé mille fois »", content: "Objection de saturation. Reconnaître puis différencier par la donnée réelle.", excerpt: "On m'a déjà appelé mille fois pour ça.", startMs: 6600, endMs: 8400, conf: 0.86 },
        { type: "GOOD_PRACTICE", title: "Rebond par la consommation réelle", content: "Se différencier des estimations concurrentes en partant de la consommation réelle.", excerpt: "on part de votre consommation réelle", startMs: 8800, endMs: 12800, conf: 0.9 },
        { type: "DISCOVERY_QUESTION", title: "Propriétaire/locataire + type de chauffage", content: "Deux questions clés pour qualifier rapidement.", excerpt: "Vous êtes propriétaire ou locataire ?", startMs: 15000, endMs: 18200, conf: 0.88 },
        { type: "SCRIPT_STEP", title: "Proposer un créneau daté", content: "Conclure sur un rendez-vous précis plutôt qu'une relance vague.", excerpt: "disponible jeudi pour un point de 15 minutes", startMs: 20400, endMs: 23400, conf: 0.84 },
      ],
    },
    {
      title: "Appel logiciel — sensible au prix",
      campaign: "SaaS PME",
      outcome: "RAPPEL",
      tags: ["saas", "prix"],
      segments: [
        { speaker: "PROSPECT", text: "Oui allô ?", startMs: 1200, endMs: 2000 },
        { speaker: "AGENT", text: "Bonjour, Marc de PilotPro, on aide les PME à automatiser leur facturation.", startMs: 2400, endMs: 6000 },
        { speaker: "PROSPECT", text: "Franchement, ça doit être trop cher pour nous.", startMs: 6400, endMs: 8200 },
        { speaker: "AGENT", text: "Je comprends. Combien de factures gérez-vous par mois environ ?", startMs: 8600, endMs: 11200 },
        { speaker: "PROSPECT", text: "Une centaine je dirais.", startMs: 11600, endMs: 12800 },
        { speaker: "AGENT", text: "À ce volume, nos clients économisent environ 6h par semaine. Le coût est vite absorbé.", startMs: 13200, endMs: 17200 },
        { speaker: "PROSPECT", text: "Mmh, envoyez-moi une doc et rappelez-moi la semaine prochaine.", startMs: 17600, endMs: 20400 },
      ],
      knowledge: [
        { type: "OBJECTION", title: "« C'est trop cher »", content: "Objection prix précoce. Requalifier le volume avant de parler tarif.", excerpt: "ça doit être trop cher pour nous.", startMs: 6400, endMs: 8200, conf: 0.83 },
        { type: "GOOD_PRACTICE", title: "Chiffrer le gain de temps", content: "Traduire le bénéfice en heures économisées pour justifier le coût.", excerpt: "économisent environ 6h par semaine", startMs: 13200, endMs: 17200, conf: 0.87 },
        { type: "DISCOVERY_QUESTION", title: "Volume de factures mensuel", content: "Question de qualification essentielle avant d'argumenter le prix.", excerpt: "Combien de factures gérez-vous par mois", startMs: 8600, endMs: 11200, conf: 0.85 },
        { type: "VOCABULARY", title: "« coût vite absorbé »", content: "Formulation maison pour relativiser le prix face au ROI.", excerpt: "Le coût est vite absorbé.", startMs: 13200, endMs: 17200, conf: 0.72 },
      ],
    },
  ];

  const approvedKnowledgeIds: string[] = [];
  for (let i = 0; i < recordings.length; i++) {
    const r = recordings[i]!;
    const rec = await prisma.callRecording.create({
      data: {
        organizationId: org.id,
        uploaderId: manager.id,
        title: r.title,
        campaign: r.campaign,
        callOutcome: r.outcome,
        language: "fr",
        tags: JSON.stringify(r.tags),
        consent: true,
        storageKey: null,
        mimeType: "audio/mpeg",
        sizeBytes: 2_400_000 + i * 500_000,
        durationSec: 26 + i * 5,
        status: "READY",
        enabled: true,
        processingHash: randomUUID(),
        createdAt: iso(12 - i * 3),
        updatedAt: iso(12 - i * 3),
      },
    });
    await prisma.transcript.create({
      data: {
        recordingId: rec.id,
        language: "fr",
        segments: JSON.stringify(r.segments),
        createdAt: iso(12 - i * 3),
      },
    });
    for (let j = 0; j < r.knowledge.length; j++) {
      const k = r.knowledge[j]!;
      // La plupart approuvées, une laissée en attente pour la démo de validation.
      const approved = !(i === 1 && j === r.knowledge.length - 1);
      const item = await prisma.knowledgeItem.create({
        data: {
          organizationId: org.id,
          recordingId: rec.id,
          type: k.type,
          title: k.title,
          content: k.content,
          sourceExcerpt: k.excerpt,
          startMs: k.startMs,
          endMs: k.endMs,
          confidence: k.conf,
          reviewStatus: approved ? "APPROVED" : "PENDING",
          enabled: approved,
          createdAt: iso(11 - i * 3),
          updatedAt: iso(11 - i * 3),
        },
      });
      if (approved) approvedKnowledgeIds.push(item.id);
    }
    await prisma.auditEvent.create({
      data: {
        organizationId: org.id,
        actorId: manager.id,
        action: "UPLOAD",
        targetType: "CallRecording",
        targetId: rec.id,
        metadata: JSON.stringify({ title: r.title }),
        createdAt: iso(12 - i * 3),
      },
    });
  }

  // ---- Appel modèle fictif « client existant » entièrement traité ----
  // Démontre le pipeline appel -> exercice : transcript diarisé anonymisé,
  // analyse structurée et exercice généré (à valider). Aucune donnée réelle.
  {
    const modelRec = await prisma.callRecording.create({
      data: {
        organizationId: org.id,
        uploaderId: manager.id,
        title: "Suivi renouvellement — cliente logiciel",
        campaign: "Renouvellements",
        callOutcome: "RAPPEL",
        language: "fr",
        tags: JSON.stringify(["renouvellement", "upsell", "client existant"]),
        consent: true,
        consentAt: iso(4),
        useAsModel: true,
        storageKey: null,
        mimeType: "audio/mpeg",
        sizeBytes: 3_100_000,
        durationSec: 41,
        status: "READY",
        detectedCallType: "EXISTING_CUSTOMER",
        callTypeConfidence: 0.88,
        referenceSuitabilityScore: 82,
        usableAsReference: true,
        enabled: true,
        processingHash: randomUUID(),
        createdAt: iso(4),
        updatedAt: iso(4),
      },
    });

    // Segments diarisés : speaker_0 = commercial (AGENT), speaker_1 = cliente (PROSPECT).
    const modelSegments: Array<{
      speakerId: string;
      role: "AGENT" | "PROSPECT";
      startMs: number;
      endMs: number;
      text: string;
      anonymizedText: string;
      confidence: number;
    }> = [
      { speakerId: "speaker_0", role: "AGENT", startMs: 400, endMs: 5200, confidence: 0.94,
        text: "Bonjour Madame Lefèvre, c'est Julien de chez NordSoft, je vous appelle pour faire le point sur votre contrat.",
        anonymizedText: "Bonjour [CLIENTE], c'est [COMMERCIAL] de chez [ENTREPRISE], je vous appelle pour faire le point sur votre contrat." },
      { speakerId: "speaker_1", role: "PROSPECT", startMs: 5600, endMs: 9200, confidence: 0.91,
        text: "Ah bonjour Julien, oui justement je voulais vous parler de notre renouvellement.",
        anonymizedText: "Ah bonjour [COMMERCIAL], oui justement je voulais vous parler de notre renouvellement." },
      { speakerId: "speaker_0", role: "AGENT", startMs: 9600, endMs: 14200, confidence: 0.93,
        text: "Parfait. Depuis l'an dernier vous êtes passés à 30 utilisateurs, tout se passe bien ?",
        anonymizedText: "Parfait. Depuis l'an dernier vous êtes passés à 30 utilisateurs, tout se passe bien ?" },
      { speakerId: "speaker_1", role: "PROSPECT", startMs: 14600, endMs: 18800, confidence: 0.9,
        text: "Globalement oui, mais on trouve le module reporting un peu limité.",
        anonymizedText: "Globalement oui, mais on trouve le module reporting un peu limité." },
      { speakerId: "speaker_0", role: "AGENT", startMs: 19200, endMs: 24000, confidence: 0.92,
        text: "Je note. On a justement sorti un module analytics avancé, je peux vous le présenter.",
        anonymizedText: "Je note. On a justement sorti un module analytics avancé, je peux vous le présenter." },
      { speakerId: "speaker_1", role: "PROSPECT", startMs: 24400, endMs: 28600, confidence: 0.89,
        text: "Pourquoi pas, mais attention le budget est serré cette année.",
        anonymizedText: "Pourquoi pas, mais attention le budget est serré cette année." },
      { speakerId: "speaker_0", role: "AGENT", startMs: 29000, endMs: 35200, confidence: 0.92,
        text: "Bien sûr. Vu votre fidélité depuis trois ans, je peux voir ce qu'on peut faire sur le tarif de renouvellement.",
        anonymizedText: "Bien sûr. Vu votre fidélité depuis trois ans, je peux voir ce qu'on peut faire sur le tarif de renouvellement." },
      { speakerId: "speaker_1", role: "PROSPECT", startMs: 35600, endMs: 40400, confidence: 0.9,
        text: "D'accord, envoyez-moi une proposition et on en reparle jeudi.",
        anonymizedText: "D'accord, envoyez-moi une proposition et on en reparle jeudi." },
    ];

    const modelTranscript = await prisma.transcript.create({
      data: {
        recordingId: modelRec.id,
        language: "fr",
        segments: JSON.stringify(
          modelSegments.map((s) => ({ speaker: s.role, text: s.text, startMs: s.startMs, endMs: s.endMs })),
        ),
        commercialSpeakerId: "speaker_0",
        customerSpeakerId: "speaker_1",
        speakerAssignmentConfidence: 0.9,
        speakerAssignmentRationale:
          "Le locuteur speaker_0 mène l'appel, présente l'offre et propose une prochaine étape ; speaker_1 est la cliente.",
        provider: "demo",
        model: "demo-diarize",
        createdAt: iso(4),
      },
    });

    const segIds: string[] = [];
    for (let j = 0; j < modelSegments.length; j++) {
      const s = modelSegments[j]!;
      const seg = await prisma.transcriptSegment.create({
        data: {
          transcriptId: modelTranscript.id,
          idx: j,
          speakerId: s.speakerId,
          role: s.role,
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
          anonymizedText: s.anonymizedText,
          confidence: s.confidence,
        },
      });
      segIds.push(seg.id);
    }

    const retainedPractices = [
      { id: "p_reprise", label: "Réactiver l'historique de la relation", importance: "HIGH",
        description: "Rappeler le contexte connu (contrat, ancienneté) dès l'ouverture pour ancrer la relation.",
        evidenceSegmentIds: [segIds[0]!] },
      { id: "p_decouverte", label: "Découverte sur base existante", importance: "HIGH",
        description: "Interroger l'usage actuel (nombre d'utilisateurs, satisfaction) avant d'argumenter.",
        evidenceSegmentIds: [segIds[2]!, segIds[3]!] },
      { id: "p_upsell", label: "Rebond upsell contextualisé", importance: "MEDIUM",
        description: "Relier le besoin exprimé (reporting limité) à une offre complémentaire pertinente.",
        evidenceSegmentIds: [segIds[4]!] },
      { id: "p_prix", label: "Levier fidélité face à l'objection prix", importance: "HIGH",
        description: "Utiliser l'ancienneté du client comme levier de négociation sur le renouvellement.",
        evidenceSegmentIds: [segIds[6]!] },
    ];

    const modelAnalysis = await prisma.callAnalysis.create({
      data: {
        organizationId: org.id,
        recordingId: modelRec.id,
        callType: "EXISTING_CUSTOMER",
        callTypeConfidence: 0.88,
        relationshipStage: "EXISTING",
        referenceSuitabilityScore: 82,
        usable: true,
        language: "fr",
        model: "demo-analysis",
        promptVersion: "v1",
        summary:
          "Appel de suivi avec une cliente fidèle : préparation du renouvellement et rebond upsell sur un module analytics, avec une objection budgétaire traitée par le levier fidélité.",
        customerProfile: JSON.stringify({
          role: "Responsable achats",
          context: "Cliente depuis 3 ans, passée à 30 utilisateurs.",
          needs: ["Reporting plus avancé"],
          objections: ["Budget serré cette année"],
          signals: ["Fidèle", "Ouverte à l'upsell"],
        }),
        commercialStrategy: JSON.stringify({
          objective: "Sécuriser le renouvellement et vendre le module analytics.",
          outcome: "Proposition à envoyer ; point de suivi jeudi.",
          retainedPractices,
        }),
        ambiguities: JSON.stringify([]),
        referenceSuitability: JSON.stringify({
          score: 82,
          usable: true,
          rationale:
            "Appel de suivi clair, relation existante bien exploitée, objection prix traitée : bon modèle d'exercice.",
        }),
        createdAt: iso(4),
        updatedAt: iso(4),
      },
    });

    const modelScenario = await prisma.scenario.create({
      data: {
        organizationId: org.id,
        authorId: manager.id,
        name: "Renouvellement client — éditeur logiciel",
        callType: "EXISTING_CUSTOMER",
        level: "MOYEN",
        campaign: "Renouvellements",
        offer: "Renouvellement annuel + module analytics avancé.",
        prospectProfile: "Responsable achats d'une PME cliente depuis 3 ans (30 utilisateurs).",
        initialSituation: "Vous appelez une cliente fidèle pour préparer le renouvellement annuel.",
        objective: "Sécuriser le renouvellement et proposer le module analytics.",
        personality: "cordiale, fidèle mais attentive au budget",
        allowedObjections: JSON.stringify([
          "Le budget est serré cette année.",
          "Le reporting actuel est un peu limité.",
          "Il faut que j'en parle en interne.",
        ]),
        secretInfos: JSON.stringify([
          { question: "budget", answer: "J'ai environ 10% de marge de plus que l'an dernier, mais je ne le dis pas tout de suite." },
        ]),
        successConditions: "La cliente accepte de recevoir une proposition renouvellement + analytics.",
        failureConditions: "La cliente repousse sans aucun engagement.",
        targetDurationSec: 300,
        status: "REVIEW_REQUIRED",
        knowledgeRefs: JSON.stringify([]),
        sourceRecordingId: modelRec.id,
        sourceAnalysisId: modelAnalysis.id,
        generatedByModel: "demo-scenario",
        promptVersion: "v1",
        traineeBrief:
          "Cliente connue depuis 3 ans. Objectif : renouveler le contrat et vendre l'upsell analytics en tenant compte d'un budget annoncé serré.",
        relationshipHistory:
          "Cliente depuis 3 ans, passée de 15 à 30 utilisateurs. Globalement satisfaite, reproche un reporting limité.",
        expectedNextSteps: JSON.stringify(["Envoyer une proposition chiffrée", "Recontacter jeudi"]),
        targetSkills: JSON.stringify([
          "Découverte sur base existante",
          "Upsell contextualisé",
          "Traitement de l'objection prix",
          "Ancrage de la relation",
        ]),
        coachingReference: JSON.stringify(retainedPractices.map((p) => p.label)),
        aiProspect: JSON.stringify({
          persona: "[CLIENTE], responsable achats fidèle mais prudente sur le budget.",
          behaviorRules: [
            "Tu connais déjà le commercial et l'éditeur : pas de présentation d'inconnu.",
            "Tu es globalement satisfaite mais tu cites le reporting limité.",
            "Tu t'ouvres à l'upsell si le budget est ménagé.",
          ],
          prohibitedRevelations: ["Ne révèle pas spontanément ton enveloppe budgétaire réelle."],
          openingLine: "Ah bonjour, oui justement je voulais vous parler du renouvellement.",
        }),
        createdAt: iso(4),
        updatedAt: iso(3),
      },
    });

    await prisma.evaluationRubric.create({
      data: {
        organizationId: org.id,
        scenarioId: modelScenario.id,
        name: "Grille — Renouvellement client",
        criteria: JSON.stringify([
          { key: "reprise_relation", label: "Reprise de la relation", weight: 15,
            description: "Ancrer l'appel dans l'historique connu du client.",
            observableSignals: ["Rappelle le contrat / l'ancienneté", "Ton de client connu"],
            sourcePracticeIds: ["p_reprise"] },
          { key: "decouverte_existant", label: "Découverte sur l'existant", weight: 25,
            description: "Vérifier l'usage et la satisfaction avant d'argumenter.",
            observableSignals: ["Questionne l'usage actuel", "Fait exprimer un besoin"],
            sourcePracticeIds: ["p_decouverte"] },
          { key: "upsell", label: "Rebond upsell", weight: 20,
            description: "Relier le besoin à l'offre analytics.",
            observableSignals: ["Propose le module au bon moment", "Lie besoin et solution"],
            sourcePracticeIds: ["p_upsell"] },
          { key: "objection_prix", label: "Objection prix", weight: 25,
            description: "Traiter le budget serré via le levier fidélité.",
            observableSignals: ["Ne baisse pas le prix sans contrepartie", "Valorise la fidélité"],
            sourcePracticeIds: ["p_prix"] },
          { key: "conclusion", label: "Conclusion et prochaine étape", weight: 15,
            description: "Verrouiller un prochain pas daté.",
            observableSignals: ["Propose une proposition", "Fixe un suivi"],
            sourcePracticeIds: [] },
        ]),
        createdAt: iso(4),
        updatedAt: iso(3),
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: org.id,
        actorId: manager.id,
        action: "UPLOAD",
        targetType: "CallRecording",
        targetId: modelRec.id,
        metadata: JSON.stringify({ title: modelRec.title, useAsModel: true }),
        createdAt: iso(4),
      },
    });
  }

  // ---- Trois scénarios publiés ----
  const scenarioDefs = [
    {
      name: "Prospect pressé — énergie",
      level: "MOYEN",
      personality: "pressé, impatient",
      objective: "Obtenir un rendez-vous de 15 minutes.",
      offer: "Offre d'électricité à consommation réelle, sans engagement la 1re année.",
      prospectProfile: "Particulier propriétaire, tout électrique.",
      initial: "Le prospect décroche entre deux tâches, il a peu de temps.",
      objections: ["Je n'ai pas le temps.", "On m'a déjà appelé pour ça.", "C'est quoi le piège ?"],
      secrets: [{ question: "propriétaire", answer: "Je suis propriétaire, tout électrique." }],
      success: "Le prospect accepte un créneau daté.",
      failure: "Le prospect raccroche sans rendez-vous.",
    },
    {
      name: "Prospect sceptique — logiciel",
      level: "DIFFICILE",
      personality: "méfiant, sceptique",
      objective: "Décrocher un second échange avec démonstration.",
      offer: "Logiciel d'automatisation de facturation pour PME.",
      prospectProfile: "Gérant de PME, échaudé par de mauvaises expériences fournisseurs.",
      initial: "Le prospect doute de l'intérêt réel de la solution.",
      objections: ["Ça ne marche jamais comme promis.", "J'ai déjà un outil.", "Je n'ai pas confiance."],
      secrets: [{ question: "outil", answer: "J'utilise un vieux tableur, ça me prend un temps fou." }],
      success: "Le prospect accepte une démonstration.",
      failure: "Le prospect reste fermé et refuse.",
    },
    {
      name: "Intéressé mais sensible au prix — SaaS",
      level: "FACILE",
      personality: "ouvert mais économe",
      objective: "Faire accepter un essai en levant l'objection prix.",
      offer: "Abonnement SaaS de gestion, essai gratuit 14 jours.",
      prospectProfile: "Responsable de petite structure, curieux mais attentif au budget.",
      initial: "Le prospect est intéressé mais bloque sur le prix.",
      objections: ["C'est trop cher.", "Je dois voir le budget.", "Combien ça coûte exactement ?"],
      secrets: [{ question: "budget", answer: "Mon budget outils est d'environ 100€ par mois." }],
      success: "Le prospect démarre un essai gratuit.",
      failure: "Le prospect reporte indéfiniment.",
    },
  ];

  const scenarios: Awaited<ReturnType<typeof prisma.scenario.create>>[] = [];
  for (let i = 0; i < scenarioDefs.length; i++) {
    const d = scenarioDefs[i]!;
    const s = await prisma.scenario.create({
      data: {
        organizationId: org.id,
        authorId: manager.id,
        name: d.name,
        callType: "VENTE",
        level: d.level,
        campaign: i === 0 ? "Énergie Q3" : "SaaS PME",
        offer: d.offer,
        prospectProfile: d.prospectProfile,
        initialSituation: d.initial,
        objective: d.objective,
        personality: d.personality,
        allowedObjections: JSON.stringify(d.objections),
        secretInfos: JSON.stringify(d.secrets),
        successConditions: d.success,
        failureConditions: d.failure,
        targetDurationSec: 300,
        status: "PUBLISHED",
        knowledgeRefs: JSON.stringify(approvedKnowledgeIds.slice(0, 4)),
        createdAt: iso(10),
        updatedAt: iso(5),
      },
    });
    scenarios.push(s);
  }

  // ---- Assignations ----
  const assignPairs: Array<[typeof ruben, (typeof scenarios)[number]]> = [
    [ruben, scenarios[0]!],
    [ruben, scenarios[1]!],
    [lina, scenarios[0]!],
    [lina, scenarios[2]!],
  ];
  for (const [tp, sc] of assignPairs) {
    await prisma.scenarioAssignment.create({
      data: {
        organizationId: org.id,
        scenarioId: sc.id,
        teleproId: tp.id,
        managerId: manager.id,
        status: "IN_PROGRESS",
        createdAt: iso(9),
      },
    });
  }

  // ---- Simulations historiques avec évaluations ----
  async function createSimulation(opts: {
    telepro: typeof ruben;
    scenario: (typeof scenarios)[number];
    daysAgo: number;
    score: number;
    outcome: string;
    prospectName: string;
    turns: Array<[string, string]>;
    strengths: string[];
    improvements: string[];
  }) {
    const sim = await prisma.simulation.create({
      data: {
        organizationId: org.id,
        scenarioId: opts.scenario.id,
        teleproId: opts.telepro.id,
        mode: "DEMO",
        status: "COMPLETED",
        prospectName: opts.prospectName,
        startedAt: iso(opts.daysAgo),
        endedAt: iso(opts.daysAgo),
        durationSec: 180 + Math.round(opts.score),
        outcome: opts.outcome,
        createdAt: iso(opts.daysAgo),
        updatedAt: iso(opts.daysAgo),
      },
    });
    let atMs = 1000;
    for (const [role, content] of opts.turns) {
      await prisma.simulationTurn.create({
        data: { simulationId: sim.id, role, content, atMs, createdAt: iso(opts.daysAgo) },
      });
      atMs += 4000;
    }
    // Répartit le score sur la grille proportionnellement.
    const ratio = opts.score / 100;
    const evaluation = await prisma.simulationEvaluation.create({
      data: {
        simulationId: sim.id,
        overallScore: opts.score,
        summary:
          opts.score >= 75
            ? "Très bon échange, structuré et orienté prochaine étape."
            : opts.score >= 55
              ? "Échange correct ; découverte et objections à renforcer."
              : "Fondamentaux à consolider.",
        strengths: JSON.stringify(opts.strengths),
        improvements: JSON.stringify(opts.improvements),
        advice: JSON.stringify([
          "Pose au moins deux questions ouvertes avant d'argumenter.",
          "Reformule l'objection avant d'y répondre.",
        ]),
        betterExample:
          "« Je comprends que vous soyez sollicité. Pour ne pas vous faire perdre de temps : votre facture est plutôt au-dessus ou en dessous de 100 € ? »",
        keyMoments: JSON.stringify([
          { role: "PROSPECT", quote: opts.turns.find((t) => t[0] === "PROSPECT")?.[1] ?? "", atMs: 5000 },
          { role: "AGENT", quote: opts.turns.find((t) => t[0] === "AGENT")?.[1] ?? "", atMs: 9000 },
        ]),
        outcome: opts.outcome,
        createdAt: iso(opts.daysAgo),
        skillScores: {
          create: RUBRIC.map((c) => ({
            key: c.key,
            label: c.label,
            score: Math.max(1, Math.round(c.weight * ratio)),
            maxScore: c.weight,
            rationale: "Évaluation démo déterministe.",
            evidence: "—",
            recommendation: "Continue à t'entraîner sur ce point.",
          })),
        },
      },
    });
    return evaluation;
  }

  const rubenTurns: Array<[string, string]> = [
    ["PROSPECT", "Oui allô ? Je n'ai pas trop le temps."],
    ["AGENT", "Bonjour, Ruben de Novéo, je serai bref. Vous êtes propriétaire ?"],
    ["PROSPECT", "Oui, propriétaire tout électrique."],
    ["AGENT", "Parfait, seriez-vous dispo jeudi 15 minutes ?"],
    ["PROSPECT", "D'accord, jeudi ça marche."],
  ];
  const linaTurns: Array<[string, string]> = [
    ["PROSPECT", "C'est trop cher pour moi."],
    ["AGENT", "Je comprends. Combien de factures par mois ?"],
    ["PROSPECT", "Une centaine."],
    ["AGENT", "À ce volume, on économise 6h par semaine, l'essai est gratuit."],
    ["PROSPECT", "Ok, je teste."],
  ];

  // Ruben : progression sur le scénario 0 (62 -> 78), + une sur scénario 1.
  await createSimulation({ telepro: ruben, scenario: scenarios[0]!, daysAgo: 6, score: 62, outcome: "RAPPEL", prospectName: "Malik", turns: rubenTurns, strengths: ["Présentation claire."], improvements: ["Trop peu de questions ouvertes.", "Conclure plus tôt."] });
  await createSimulation({ telepro: ruben, scenario: scenarios[0]!, daysAgo: 2, score: 78, outcome: "RDV", prospectName: "Malik", turns: rubenTurns, strengths: ["Bonne accroche.", "Prochaine étape claire."], improvements: ["Approfondir la découverte."] });
  await createSimulation({ telepro: ruben, scenario: scenarios[1]!, daysAgo: 1, score: 58, outcome: "REFUS", prospectName: "Sophie", turns: rubenTurns, strengths: ["Ton posé."], improvements: ["Traiter l'objection de confiance.", "Personnaliser l'argumentaire."] });

  // Lina : deux tentatives scénario 2.
  await createSimulation({ telepro: lina, scenario: scenarios[2]!, daysAgo: 5, score: 68, outcome: "RAPPEL", prospectName: "Karim", turns: linaTurns, strengths: ["Bonne écoute."], improvements: ["Chiffrer le ROI plus tôt."] });
  await createSimulation({ telepro: lina, scenario: scenarios[2]!, daysAgo: 1, score: 81, outcome: "VENTE", prospectName: "Karim", turns: linaTurns, strengths: ["Excellent traitement du prix.", "Closing net."], improvements: ["Qualifier davantage le besoin."] });

  console.log("✅ Seed terminé.");
  console.log("   Organisation : Démo MINDUEL");
  console.log("   Manager      : manager@demo.minduel.app / demo1234");
  console.log("   Télépros     : ruben@demo.minduel.app, lina@demo.minduel.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
