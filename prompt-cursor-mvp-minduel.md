# Prompt Cursor — MVP SaaS d’entraînement des téléprospecteurs par IA

Tu es un lead developer full-stack senior, architecte SaaS B2B et product designer. Ta mission est de construire un MVP fonctionnel, testable localement et déployable de **MINDUEL**, une application web d’onboarding et d’entraînement des téléprospecteurs grâce à des simulations d’appels vocaux avec une IA.

Ne te limite pas à produire une maquette statique ou un plan. Après l’audit initial, implémente réellement l’application, écran par écran et flux par flux, avec une base de données, une authentification, des données de démonstration et les intégrations IA prévues. Si une intégration externe n’est pas configurée, le produit doit rester démontrable grâce à un mode démo clairement isolé.

## 1. Contexte produit

MINDUEL est destiné en priorité aux entreprises ayant une équipe de téléprospection : régies, centres d’appels, équipes commerciales ou organismes de formation.

Le problème résolu :

- un nouveau téléprospecteur doit apprendre une offre, un script, une cible et les objections fréquentes avant de passer de vrais appels ;
- les jeux de rôle avec un manager sont coûteux, peu disponibles et difficiles à répéter ;
- les formations génériques ne reproduisent pas les vraies conversations de l’entreprise ;
- les managers manquent de données objectives pour savoir si un téléprospecteur est prêt.

La promesse du MVP :

> Le manager transforme les appels réels de son équipe en scénarios d’entraînement. Le téléprospecteur s’entraîne oralement face à un prospect IA, reçoit un feedback fondé sur une grille claire et recommence jusqu’à atteindre le niveau attendu.

Le produit est un outil d’entraînement et d’aide au coaching, pas un outil de surveillance cachée ni un système prenant seul une décision RH.

## 2. Références visuelles

Des maquettes sont fournies avec les noms suivants :

- `571A544A-4777-4359-8C2D-0F17BB09BCBB.jpeg`
- `8B1990F7-0FE0-49CE-9985-4B53B35E8223.jpeg`
- `884670A7-AD06-4790-862E-1B26A77EA55B.jpeg`
- `2D1A2A8A-A947-410C-8CF4-68F8D620B1A3.jpeg`
- `7FE93515-EA39-4DD8-9E49-37E1DDA61F82.jpeg`
- `DCBF336C-0B9C-4C66-87A1-FCE4BE1FD669.jpeg`
- `2C98E57C-3CF7-46B6-9DD5-566D2C223BDA.jpeg`
- `D6A06D2F-6795-486F-9538-90097235DE10.jpeg`

Commence par repérer leur emplacement dans le projet et analyse-les. Si elles ne sont pas dans le dépôt, crée un dossier `docs/mockups/`, indique précisément où les placer, puis continue l’implémentation sans rester bloqué.

Utilise ces images comme **direction artistique**, pas comme des écrans à recopier aveuglément.

Direction visuelle :

- fond noir ou bleu-noir profond ;
- accents violet électrique, bleu et orange ;
- cartes sombres légèrement transparentes ;
- bordures fines, halos et gradients subtils ;
- typographie moderne, très lisible ;
- sensation premium, immersive et ludique ;
- animations discrètes sur le son, la progression et les changements d’état ;
- contrastes accessibles et états focus visibles ;
- interface mobile-first côté téléprospecteur ;
- interface réellement adaptée au desktop côté manager.

Évite :

- l’excès de glow qui nuit à la lecture ;
- les textes trop petits ;
- les personnages réalistes générés présents partout ;
- une fausse interface de visioconférence ;
- les métriques inventées présentées comme si elles provenaient d’une analyse scientifique.

Le MVP est un simulateur **d’appel téléphonique audio**. Il ne nécessite ni caméra, ni avatar vidéo en temps réel.

## 3. Utilisateurs et rôles

Implémente un SaaS multi-tenant simple avec trois rôles :

### Administrateur de plateforme

- peut consulter les organisations ;
- peut activer ou désactiver une organisation ;
- fonction minimale dans le MVP, sans back-office complexe.

### Manager d’une organisation

- crée ou configure son organisation ;
- invite ou crée des comptes téléprospecteurs ;
- crée des campagnes ou parcours d’entraînement ;
- renseigne l’offre, la cible, le contexte, le script souhaité et les critères d’évaluation ;
- importe des appels réels en MP3/WAV/M4A ;
- suit leur traitement ;
- relit et valide les enseignements extraits par l’IA ;
- crée des scénarios à partir de ces enseignements ;
- assigne des scénarios aux téléprospecteurs ;
- suit les résultats individuels et collectifs ;
- écoute ou supprime les enregistrements si les droits et réglages de l’organisation l’autorisent.

### Téléprospecteur

- voit les entraînements qui lui sont assignés ;
- consulte les objectifs et le niveau attendu ;
- lance une simulation vocale ;
- converse naturellement avec un prospect IA ;
- peut couper le micro, interrompre ou terminer l’appel ;
- reçoit une analyse détaillée et actionnable ;
- retrouve son historique et sa progression ;
- rejoue un scénario.

Toutes les requêtes et données doivent être isolées par `organization_id`. Ne jamais faire confiance au rôle ou à l’organisation envoyés par le client : les vérifier côté serveur.

## 4. Périmètre fonctionnel du MVP

Construis les flux suivants de bout en bout.

### A. Authentification et onboarding

- inscription et connexion ;
- création d’une organisation par le premier manager ;
- choix d’un nom d’organisation ;
- écran de bienvenue ;
- comptes de démonstration préchargés ;
- gestion simple de session ;
- pages protégées par rôle.

Pour le MVP, l’invitation d’un téléprospecteur peut être simulée par la création d’un compte avec un mot de passe temporaire affiché au manager. N’implémente pas un système complet d’e-mails si cela ralentit le cœur du produit.

### B. Espace manager

Créer un tableau de bord desktop avec :

- nombre de téléprospecteurs ;
- nombre de simulations terminées ;
- score moyen ;
- progression sur les 7 ou 30 derniers jours ;
- taux de complétion des entraînements ;
- liste des téléprospecteurs ayant besoin d’accompagnement ;
- derniers appels réels importés et leur statut.

Créer les pages :

1. `Équipe`
   - liste des téléprospecteurs ;
   - ajout d’un compte ;
   - détail d’un téléprospecteur ;
   - scénarios assignés, tentatives, score moyen et évolution.

2. `Base d’appels réels`
   - zone de drag-and-drop ;
   - formats acceptés : MP3, WAV, M4A ;
   - champs : titre, campagne, résultat de l’appel, langue, tags et note du manager ;
   - consentement obligatoire confirmant que l’organisation a le droit de traiter cet enregistrement ;
   - affichage de la taille, durée et progression de l’upload ;
   - statuts : `UPLOADED`, `TRANSCRIBING`, `ANALYZING`, `READY`, `FAILED` ;
   - lecteur audio ;
   - transcript avec séparation des intervenants et timestamps quand disponibles ;
   - relance d’un traitement en erreur ;
   - activation/désactivation d’un appel dans la base utilisée par les simulations ;
   - suppression de l’audio, du transcript et des connaissances dérivées.

3. `Connaissances extraites`
   - synthèse produite après analyse des appels ;
   - objections rencontrées ;
   - formulations efficaces ;
   - erreurs ou formulations à éviter ;
   - questions de découverte ;
   - éléments de vocabulaire propres à l’entreprise ;
   - étapes du script observées ;
   - signaux de succès ou d’échec ;
   - extraits sources associés, avec appel et timestamp ;
   - chaque élément doit pouvoir être approuvé, édité, rejeté ou désactivé par le manager.

4. `Scénarios`
   - création manuelle ou génération depuis les connaissances approuvées ;
   - nom ;
   - campagne ;
   - offre vendue ;
   - profil du prospect ;
   - situation initiale ;
   - objectif du téléprospecteur ;
   - niveau `FACILE`, `MOYEN`, `DIFFICILE` ;
   - personnalité du prospect ;
   - objections autorisées ;
   - informations que le prospect ne révèle que si la bonne question est posée ;
   - conditions de réussite et d’échec ;
   - durée cible ;
   - grille d’évaluation et pondérations ;
   - statut brouillon/publié ;
   - bouton de test réservé au manager ;
   - assignation à un ou plusieurs téléprospecteurs.

5. `Résultats`
   - filtres par téléprospecteur, scénario et période ;
   - scores ;
   - détails d’une tentative ;
   - transcript ;
   - feedback ;
   - points forts et axes de travail ;
   - comparaison avec la tentative précédente ;
   - export CSV simple de la liste des résultats.

### C. Espace téléprospecteur

Créer :

1. `Accueil`
   - message de bienvenue ;
   - entraînement recommandé ;
   - bouton principal « Lancer une simulation » ;
   - progression ;
   - série de jours actifs, clairement présentée comme une mécanique d’engagement ;
   - score moyen ;
   - scénarios assignés et état de complétion.

2. `Préparation de la simulation`
   - scénario ;
   - niveau ;
   - objectif ;
   - contexte et informations que le téléprospecteur est censé connaître ;
   - choix de la sortie audio ;
   - test microphone ;
   - autorisation du microphone ;
   - bouton « Démarrer ».

3. `Appel en cours`
   - nom et profil fictif du prospect ;
   - chronomètre ;
   - animation de waveform réactive au niveau audio ;
   - états `Connexion`, `Le prospect écoute`, `Le prospect parle`, `À vous`, `Reconnexion` ;
   - commandes : micro, volume, terminer ;
   - ne pas afficher une émotion prétendument détectée en temps réel si elle n’est pas réellement calculée ;
   - ne pas afficher le score pendant l’appel ;
   - gérer proprement les interruptions : le prospect IA doit pouvoir s’arrêter lorsque l’utilisateur reprend la parole ;
   - confirmation avant d’abandonner.

4. `Analyse`
   - score global sur 100 ;
   - score par critère ;
   - trois points forts maximum ;
   - trois priorités d’amélioration maximum ;
   - conseils concrets ;
   - exemple d’une meilleure formulation ;
   - moments clés du transcript avec citations ;
   - résultat de l’appel simulé ;
   - bouton « Rejouer » ;
   - bouton « Retour aux entraînements ».

5. `Historique et progression`
   - toutes les tentatives ;
   - détail d’une tentative ;
   - évolution par compétence ;
   - comparaison première/dernière tentative d’un scénario.

### D. Ce qui est explicitement hors périmètre V1

- paiement et abonnement ;
- marketplace de scénarios ;
- appels téléphoniques réels vers des prospects ;
- connexion CRM ;
- avatar vidéo ou lipsync ;
- clonage de la voix d’une personne réelle ;
- fine-tuning automatique d’un modèle ;
- classement public humiliant entre salariés ;
- application mobile native ;
- système RH décidant automatiquement qu’une personne est apte ou inapte.

Prépare une architecture extensible, mais n’implémente pas ces éléments.

## 5. Traitement des appels réels

Important : dans ce MVP, « entraîner l’IA avec les appels réels » signifie :

1. stocker l’enregistrement de façon privée ;
2. le transcrire ;
3. distinguer les intervenants quand c’est possible ;
4. extraire des connaissances structurées et traçables ;
5. faire valider ces connaissances par un manager ;
6. injecter uniquement les éléments approuvés dans le contexte des simulations et du feedback.

Cela ne signifie pas fine-tuner automatiquement un modèle sur chaque MP3.

Pipeline attendu :

```text
Upload privé
→ validation du format et de la taille
→ transcription
→ diarisation / identification générique Agent-Prospect
→ extraction structurée
→ validation humaine
→ indexation des éléments approuvés
→ utilisation dans les scénarios
```

Exigences :

- l’upload va d’abord dans un stockage privé, jamais dans `/public` ;
- utiliser des URLs signées temporaires pour lire un fichier ;
- ne jamais envoyer une clé API OpenAI au navigateur ;
- vérifier le type MIME et l’extension côté serveur ;
- prévoir une limite configurable ;
- pour les fichiers dépassant la limite de transcription du fournisseur, prévoir un service de découpage audio avec `ffmpeg`, avec léger chevauchement et recomposition du transcript ;
- traiter l’audio dans une tâche asynchrone avec retries et message d’erreur exploitable ;
- rendre le traitement idempotent ;
- journaliser les étapes sans journaliser le contenu complet des conversations ;
- conserver la provenance de chaque connaissance : `recording_id`, extrait et timestamps ;
- ne jamais présenter comme certaine une conclusion non étayée par le transcript ;
- ne jamais utiliser un élément rejeté ou désactivé dans une simulation ;
- permettre une durée de conservation configurable et la suppression complète.

Schéma JSON minimal d’un élément de connaissance :

```json
{
  "type": "OBJECTION|GOOD_PRACTICE|BAD_PRACTICE|DISCOVERY_QUESTION|VOCABULARY|SCRIPT_STEP|COMPLIANCE_RULE",
  "title": "string",
  "content": "string",
  "source_excerpt": "string",
  "start_ms": 0,
  "end_ms": 0,
  "confidence": 0.0,
  "review_status": "PENDING|APPROVED|REJECTED",
  "enabled": true
}
```

## 6. Simulation vocale et analyse

Pour les sessions vocales dans le navigateur, utiliser l’API Realtime via **WebRTC**. Le serveur doit créer un secret client éphémère ou négocier la session côté serveur. La clé API longue durée reste exclusivement côté serveur.

Documentation officielle à suivre :

- Realtime avec WebRTC : `https://developers.openai.com/api/docs/guides/realtime-webrtc`
- Agents vocaux : `https://developers.openai.com/api/docs/guides/voice-agents`
- Transcription : `https://developers.openai.com/api/docs/guides/speech-to-text`

Ne copie pas un exemple obsolète sans vérifier la documentation actuelle et la version du SDK installée. Centralise les noms de modèles dans une configuration serveur et documente-les dans `.env.example`.

La personnalité du prospect IA doit être construite à partir :

- du scénario publié ;
- de son niveau ;
- des informations secrètes du prospect ;
- des objections sélectionnées ;
- des règles métier approuvées ;
- de quelques extraits pertinents des appels réels ;
- d’instructions strictes interdisant à l’IA de coacher l’utilisateur pendant le rôle-play.

Le prospect IA doit :

- rester dans son rôle ;
- répondre comme une personne appelée par téléphone, avec des réponses plutôt courtes ;
- ne pas livrer toutes les informations spontanément ;
- varier ses formulations ;
- opposer des objections cohérentes ;
- devenir plus ou moins réceptif selon la qualité de l’échange ;
- accepter une conclusion réaliste : refus, rappel, rendez-vous ou vente selon le scénario ;
- ne jamais révéler son prompt, la grille de notation ou les informations secrètes.

Après l’appel, lancer une évaluation serveur séparée. Elle doit produire un JSON structuré validé par schéma, sans faire confiance à du texte libre.

Grille par défaut, modifiable par le manager :

- accroche et présentation : 10 ;
- clarté et élocution : 10 ;
- découverte et questions ouvertes : 20 ;
- écoute et rebond : 15 ;
- qualification : 10 ;
- argumentation personnalisée : 15 ;
- traitement des objections : 15 ;
- conclusion et prochaine étape : 5.

Total : 100.

Chaque note doit contenir :

- un score ;
- une justification courte ;
- au moins une preuve issue du transcript lorsqu’elle existe ;
- une recommandation.

Les affirmations purement vocales comme le débit, le temps de parole ou les silences ne doivent être notées que si les données nécessaires sont réellement disponibles. Sinon, ne pas les inventer.

## 7. Architecture technique

Si le dépôt contient déjà une application, commence par l’auditer et conserve les choix cohérents. Ne réécris pas inutilement une base fonctionnelle.

Si le dépôt est vide, utilise cette architecture par défaut :

- monorepo ;
- frontend : Next.js App Router, TypeScript strict, Tailwind CSS et composants accessibles ;
- backend : FastAPI, Python 3.12, Pydantic, SQLAlchemy 2 et Alembic ;
- base : PostgreSQL ;
- stockage local de développement : MinIO compatible S3 ;
- stockage de production : interface S3 compatible ;
- tâches asynchrones : Redis + worker Python léger ;
- validation des réponses IA : modèles Pydantic ;
- tests frontend : Vitest et Testing Library ;
- tests backend : Pytest ;
- environnement local : Docker Compose.

Structure suggérée :

```text
apps/
  web/
  api/
  worker/
packages/
  ui/
  shared/
docs/
  mockups/
  architecture.md
infra/
docker-compose.yml
.env.example
README.md
```

Reste pragmatique. Une abstraction propre pour le stockage, l’IA et les tâches vaut mieux qu’une infrastructure cloud surdimensionnée.

Crée des interfaces de fournisseurs :

- `AudioStorageProvider`
- `TranscriptionProvider`
- `RealtimeSessionProvider`
- `EvaluationProvider`

Prévois :

- implémentation OpenAI réelle ;
- implémentation `DemoProvider` déterministe pour la démonstration et les tests.

## 8. Modèle de données minimal

Implémente au minimum :

- `Organization`
- `User`
- `TeamMembership`
- `TrainingProgram`
- `Scenario`
- `ScenarioAssignment`
- `CallRecording`
- `Transcript`
- `KnowledgeItem`
- `EvaluationRubric`
- `Simulation`
- `SimulationTurn`
- `SimulationEvaluation`
- `SkillScore`
- `AuditEvent`

Champs transverses :

- identifiant UUID ;
- `organization_id` quand pertinent ;
- `created_at` ;
- `updated_at` ;
- auteur quand pertinent ;
- statuts sous forme d’enums ;
- suppression logique uniquement si elle est nécessaire ; pour les fichiers audio, fournir aussi une vraie suppression.

Ajoute les index utiles et les contraintes d’unicité. Les tentatives et erreurs de traitement ne doivent pas créer de doublons.

## 9. API minimale

Créer des endpoints REST documentés, notamment :

- auth/session ;
- organisations ;
- utilisateurs et équipe ;
- recordings : init upload, finalisation, liste, détail, retry, activation, suppression ;
- transcripts ;
- knowledge items : liste, approbation, modification, rejet ;
- scenarios : CRUD, publication, assignation ;
- simulations : création, session Realtime éphémère, fin, état, transcript ;
- evaluations ;
- dashboard/progression ;
- export CSV.

Valider toutes les entrées. Retourner des erreurs cohérentes et compréhensibles. Ajouter un identifiant de corrélation aux logs et aux réponses d’erreur.

## 10. Sécurité, confidentialité et RGPD

Le produit manipule potentiellement des conversations réelles et des données personnelles. Implémente dès le MVP :

- stockage privé ;
- isolation stricte entre organisations ;
- contrôle d’accès côté API ;
- clés et secrets uniquement dans les variables d’environnement ;
- aucune donnée sensible dans Git ;
- consentement/déclaration de base légale avant upload ;
- message demandant d’éviter les données inutiles et de supprimer/anonymiser les données sensibles ;
- suppression d’un enregistrement et de ses dérivés ;
- journal d’audit des uploads, validations, exports et suppressions ;
- durée de conservation configurable ;
- protection CSRF si l’authentification choisie l’exige ;
- limitation de débit sur les endpoints coûteux ;
- validation de fichier ;
- aucune utilisation des enregistrements d’une organisation pour une autre ;
- aucun clonage de voix ;
- mention claire que la voix entendue est générée par IA.

Ne prétends pas que l’application est « conforme RGPD » au seul motif que ces fonctions existent. Documente les points restant à valider juridiquement avant une production réelle.

## 11. Mode démo obligatoire

Le projet doit être utilisable sans clé OpenAI.

Créer :

- une organisation « Démo MINDUEL » ;
- un manager ;
- deux téléprospecteurs ;
- trois scénarios : prospect pressé, prospect sceptique, prospect intéressé mais sensible au prix ;
- deux appels réels fictifs déjà analysés ;
- des connaissances approuvées ;
- plusieurs simulations historiques ;
- des scores cohérents.

Dans le mode démo :

- l’interface complète fonctionne ;
- le traitement d’un faux fichier traverse les statuts attendus ;
- une simulation textuelle ou vocale simplifiée peut être jouée avec des réponses déterministes ;
- un bandeau discret indique que l’IA réelle n’est pas configurée ;
- aucun bouton principal ne mène vers une impasse.

Fournir les identifiants de connexion de démonstration dans le README.

## 12. Qualité d’implémentation

- TypeScript strict, sans `any` évitable ;
- code Python typé ;
- composants réutilisables mais sans abstraction prématurée ;
- aucun secret codé en dur ;
- migrations reproductibles ;
- seed reproductible ;
- états loading, empty, error et success sur les écrans ;
- responsive de 375 px à grand écran ;
- navigation clavier ;
- labels accessibles ;
- pas de bouton factice ;
- pas de données aléatoires changeant à chaque rechargement ;
- formatage et lint ;
- tests ciblés sur les permissions multi-tenant, le pipeline d’upload, la validation des évaluations et les principaux parcours UI.

## 13. Méthode de travail demandée

1. Inspecte le dépôt, les maquettes et les instructions existantes (`README`, `AGENTS.md`, règles Cursor, configuration).
2. Résume brièvement l’état initial et les choix conservés.
3. Écris ou mets à jour `docs/architecture.md` avec :
   - architecture ;
   - flux audio ;
   - flux Realtime ;
   - modèle de données ;
   - choix de sécurité ;
   - limites du MVP.
4. Établis un plan d’implémentation par lots.
5. Implémente immédiatement le lot 1, puis poursuis les lots suivants sans demander une validation à chaque étape, sauf vrai blocage ou choix irréversible.
6. Après chaque lot, exécute les tests, le lint et le build pertinents, puis corrige les erreurs.
7. Termine avec :
   - commandes exactes de lancement ;
   - comptes de démonstration ;
   - variables d’environnement nécessaires ;
   - fonctionnalités terminées ;
   - limites restantes ;
   - prochaines étapes recommandées.

Ne masque pas les erreurs avec des mocks dispersés. Le mode démo doit passer par les mêmes interfaces de services que le mode réel.

## 14. Lots d’implémentation

### Lot 1 — Socle démontrable

- monorepo et Docker Compose ;
- design system MINDUEL ;
- base PostgreSQL et migrations ;
- authentification ;
- rôles et isolation organisation ;
- seed ;
- espace téléprospecteur ;
- scénarios ;
- simulation en mode démo ;
- écran d’analyse ;
- historique.

### Lot 2 — Personnalisation par appels réels

- upload privé ;
- worker ;
- transcription réelle ou démo ;
- transcript ;
- extraction des connaissances ;
- validation manager ;
- gestion des erreurs et suppression.

### Lot 3 — Voix IA réelle

- session Realtime WebRTC ;
- secret éphémère côté serveur ;
- états d’appel ;
- interruptions ;
- transcript ;
- fin de session robuste ;
- évaluation structurée après appel.

### Lot 4 — Pilotage manager

- création/édition/publication de scénarios ;
- assignations ;
- dashboards ;
- détail téléprospecteur ;
- progression ;
- export CSV ;
- audit minimal.

### Lot 5 — Stabilisation

- tests ;
- accessibilité ;
- responsive ;
- logs ;
- rate limiting ;
- gestion des erreurs ;
- documentation de déploiement.

## 15. Critères d’acceptation

Le MVP est accepté si :

1. Un manager peut se connecter et créer un téléprospecteur.
2. Il peut importer un appel audio avec confirmation des droits.
3. Il voit le fichier passer par les statuts de traitement.
4. Il peut lire le transcript et approuver ou rejeter les connaissances extraites.
5. Il peut créer et publier un scénario utilisant ces connaissances.
6. Il peut assigner ce scénario.
7. Le téléprospecteur voit l’assignation.
8. Il peut tester son micro et lancer une simulation.
9. Avec une clé OpenAI, la conversation vocale fonctionne via WebRTC sans exposer la clé.
10. Sans clé OpenAI, un mode démo cohérent permet de parcourir le flux complet.
11. Après l’appel, une évaluation structurée et fondée sur le transcript est enregistrée.
12. Le téléprospecteur peut consulter son feedback et son historique.
13. Le manager peut voir sa progression.
14. Un utilisateur d’une organisation ne peut jamais accéder aux données d’une autre.
15. La suppression d’un appel supprime aussi son fichier et ses dérivés.
16. Le projet démarre avec les commandes documentées et passe lint, tests et build.

## 16. Priorité produit

En cas d’arbitrage, applique cet ordre :

1. boucle complète manager → appel réel → scénario → simulation → feedback ;
2. qualité et crédibilité du feedback ;
3. simplicité du parcours téléprospecteur ;
4. confidentialité et isolation des données ;
5. fidélité à la direction artistique ;
6. fonctionnalités secondaires.

La réussite du MVP ne se mesure pas au nombre d’écrans, mais à la capacité de démontrer que des appels réels d’une entreprise peuvent rendre l’entraînement de ses nouveaux téléprospecteurs plus pertinent, mesurable et répétable.
