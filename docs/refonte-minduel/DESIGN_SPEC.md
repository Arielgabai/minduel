# Minduel — Spécification UX (maquette V2)

> Source visuelle : `Minduel fini maquette OK_compressed.pdf`, pages 14–41 (pièce jointe locale, hors dépôt).
> La maquette est une spécification UX, pas du code à copier. Les compteurs et titres visibles dans le PDF sont des exemples de rendu, jamais des données de production.

---

## 1. Architecture des cinq destinations

Navigation fixe en bas (`tab-bar`), contenue dans le shell mobile étroit (cadre desktop type téléphone). Chaque destination a un écran racine ; les sous-parcours utilisent une `topbar` avec retour. Tab-bar masquée sur les parcours immersifs (appel, fin d’exercice, débrief).

| Destination | Écran racine | Rôle |
|---|---|---|
| **Accueil** | Accueil | Reprise / exercice recommandé, synthèse courte (hors détail p.14–41) |
| **Missions** | Carte de phases + parcours d’exercices | Progression structurée par phases/niveaux, accès aux exercices |
| **Skills** | Bibliothèque pédagogique | Catégories → sections → articles administrables |
| **Progression** | Analytics | Tendances, Comparatif, Diagnostic, Badges |
| **Profil** | Profil | Identité, paramètres, déconnexion (intégrations reportées) |

**Hors tab-bar :** appel simulé, fin d’exercice, débrief détaillé ; plus tard : upload/analyse d’appels réels et écart simulé/réel.

**Base métier Missions (inchangée, lot I) :** `Scenario`, `ScenarioAssignment`, `Simulation` ; statuts et recommandation calculés localement, non persistés comme enum séparée.

---

## 2. Pages 14–15 — Missions

### 2.1 Carte des phases / niveaux

Écran type « Cold Call » : titre de parcours + sous-titre descriptif, puis liste verticale de phases reliées par un fil.

Chaque nœud de phase affiche :

* numéro ou indicateur d’ordre ;
* nom de phase ;
* sous-libellé (thème) ;
* progression **réelle** `terminé / total` d’exercices du niveau **présents et visibles** pour l’utilisateur ;
* ou libellé « Verrouillé » si le niveau n’est pas ouvert.

**États de phase (visuels) :**

| État | Rendu maquette | Calcul (lot I) |
|---|---|---|
| Terminé | Nœud en dégradé (bleu/violet → orange), texte actif | Tous les exercices du niveau présents sont `COMPLETED` |
| Courant | Nœud bordure orange / accent, compteur partiel | Niveau débloqué, progression incomplète |
| Verrouillé | Nœud et texte désaturés, sous-libellé « Verrouillé » | Niveau non ouvert selon règles de déblocage |

**Règles dynamiques (pas de chiffres codés en dur) :**

* l’ordre des niveaux et exercices vient des données (`missionLevel`, `sortOrder`, puis nom/`id`) ;
* le nombre de phases, d’exercices par phase et les libellés viennent des exercices `PUBLISHED` assignés ;
* aucun « 5 phases × 7 exercices = 35 » ni compteur marketing figé dans l’UI ;
* trous de numéros de niveau sans blocage artificiel (lot I).

### 2.2 Parcours d’exercices d’une phase

Écran type « La Sonde » : retour, titre de phase, sous-titre `thème · n/m exercices`, barre de progression réelle, puis **parcours visuel** (nœuds reliés, éventuellement en zigzag).

| État exercice | Rendu | Interaction |
|---|---|---|
| Terminé | Portrait / nœud bordure verte, badge succès | Accès débrief de la dernière tentative terminée si disponible ; possibilité de refaire selon CTA lot I |
| Recommandé / courant | Bordure dégradée, badge « GO » | CTA vers `/app/call/[id]` (`IN_PROGRESS`) ou `/app/prepare/[scenarioId]` (`AVAILABLE`) |
| Verrouillé | Contour en pointillés, libellé « ??? » ou équivalent non révélateur | Aucun lancement ; pas de fuite de persona/prompts |

**Exercice recommandé :** premier `IN_PROGRESS` en ordre déterministe, sinon premier `AVAILABLE`, sinon aucun (lot I). Mis en évidence sur le parcours (badge GO / nœud courant).

### 2.3 Comportement mobile

* largeur mobile étroite ; scroll vertical du parcours ;
* nœuds et CTA ≥ 44 px ; focus visible au clavier ;
* tab-bar Accueil / Missions / Skills / Progression / Profil visible sur ces écrans ;
* aucun texte de progression tronqué ; états vides explicites si aucune assignation.

---

## 3. Pages 16–17 — Appel et fin d’exercice

Spécification UX uniquement. **Aucun changement de runtime, de WebRTC ni d’appel OpenAI dans le lot J0** (ni dans les lots purement documentaires).

### 3.1 Appel immersif

Écran plein sans tab-bar :

* en-tête : numéro/libellé d’exercice, durée écoulée, accès « Conseils » si contenu disponible côté produit ;
* bandeau de contrainte d’exercice (ex. limite de temps d’écoute) **uniquement si fourni par les données d’exercice** ;
* barre de progression d’exercice / patience (données runtime existantes, pas de métrique inventée) ;
* avatar + nom + rôle / phase ;
* indicateur d’état émotionnel du prospect (« Ressenti ») **uniquement s’il est produit et exposé par le runtime existant** — sinon état masqué ou « Non disponible » ;
* zone de transcription / phrase courante (flux temps réel existant) ;
* visualiseur audio discret ;
* contrôles : micro, raccrocher (primaire danger), haut-parleur — cibles circulaires ≥ 44 px.

### 3.2 Écran intermédiaire de fin

Après raccrochage / fin d’évaluation disponible :

* titre « Exercice terminé » + durée réelle de la tentative ;
* score global **persisté** (anneau / grand chiffre) ;
* point fort (vert) et axe prioritaire (orange) **issus du débrief stocké** ;
* percentile / classement affiché **seulement s’il est déjà calculé et stocké** ; sinon omis ou « Non disponible » ;
* CTA primaire dégradé : « Voir le débrief détaillé » → `/app/analysis/[id]` ;
* CTA secondaire contour : « Retour aux niveaux » → Missions / phase.

Pas de recalcul OpenAI au seul affichage de cet écran.

---

## 4. Pages 18–21 — Débrief (simulation)

Titre type « Ton débrief détaillé », retour, **quatre onglets en pilules** :

1. **Résumé**
2. **Ligne par ligne**
3. **Pourquoi**
4. **Comparatif**

CTA bas d’écran : retour aux niveaux (dégradé). Navigation clavier entre onglets ; scroll mobile sans troncature ; tab-bar absente.

### 4.1 Onglet Résumé

* grilles de scores / compétences **existantes** (valeurs persistées + deltas vs moyenne personnelle si déjà stockés) ;
* timeline « Moments clés » : horodatages, libellés et tags **uniquement s’ils existent en base** ;
* priorité n°1 / axe prioritaire si présent dans le débrief.

### 4.2 Onglet Ligne par ligne

* transcription réelle (tours locuteur + timestamps persistés) ;
* bulles prospect / téléprospecteur différenciées ;
* annotations (bon / à corriger) et reformulations suggérées **uniquement si stockées** avec le débrief ;
* surlignage du passage déterminant **si annoté** ; sinon liste chronologique simple.

### 4.3 Onglet Pourquoi

* alertes de récurrence, cartes explicatives, impacts points **uniquement depuis données persistées** ;
* aucun conseil généré à la volée au chargement ;
* totaux d’impact affichés seulement s’ils sont déjà calculés/stockés.

### 4.4 Onglet Comparatif

* comparaison avec tentatives précédentes du même utilisateur (et moyennes équipe **si autorisé**, voir §7) ;
* barres + légende ; insight textuel seulement s’il est persisté ;
* pas de métrique inventée pour « remplir » l’écran.

### 4.5 États sans donnée

| Donnée absente | Comportement |
|---|---|
| Score / compétence | Carte « Non évalué » ou omise |
| Moments clés | Message « Aucun moment clé enregistré » |
| Transcription | « Transcription indisponible » |
| Annotation / reformulation | Pas de carte fantôme |
| Comparatif insuffisant | « Pas assez de tentatives pour comparer » |
| Évaluation en échec / pending | État explicite + lien retry existant si applicable |

**Interdits au chargement :** recalcul OpenAI ; invention de timestamps, locuteurs, scores, conseils ou percentiles.

Lien Skills recommandé : uniquement vers un article **PUBLISHED** dont l’identifiant/slug est déjà associé au débrief ou à l’axe de compétence mappé — sinon pas de lien inventé (détail d’implémentation : lot K).

---

## 5. Pages 22–31 — Skills administrables

### 5.1 Rendu téléprospecteur (cible UX)

* **Liste catégories** : cartes (icône, nom, compteurs `n fiches • m sous-thèmes` **calculés** sur contenu `PUBLISHED` visible) ;
* **Liste sections** dans une catégorie : en-têtes de sous-thème + lignes article (titre, résumé, chevron) ;
* **Article** : retour, pills tags + durée de lecture, titre, contenu structuré, encadrés exemple, bloc « À retenir ».

**Catégories initiales de la maquette (exemples, pas constantes applicatives) :**

* Élocution ;
* Phase de découverte ;
* Traitement des objections ;
* Phase de closing.

Exemples de titres suffisent pour le rendu (ne pas recopier l’intégralité du PDF) : « Poser les bonnes questions », « Le principe de réciprocité », « La technique de la ligne droite », « L’intonation compte plus que les mots ».

### 5.2 Contrat fonctionnel paramétrable (futur)

Hiérarchie : **Catégorie → Section (sous-thème) → Article**.

**Catégorie**

| Champ | Notes |
|---|---|
| nom, slug, description | slug unique stable |
| icône | référence contrôlée (pas SVG arbitraire non sanitisé) |
| ordre d’affichage | entier |
| statut | `DRAFT` / `PUBLISHED` / `ARCHIVED` |
| auteur, createdAt, updatedAt | audit |
| publishedAt / archivedAt | selon cycle de vie |

**Section**

| Champ | Notes |
|---|---|
| categoryId, nom, slug, description | |
| ordre d’affichage | |
| statut | `DRAFT` / `PUBLISHED` / `ARCHIVED` |

**Article**

| Champ | Notes |
|---|---|
| sectionId, titre, slug, résumé | |
| tags | liste de libellés |
| durée de lecture | estimée ou saisie (minutes) |
| contenu structuré | blocs typés (paragraphe, titre, liste, encadré exemple, « À retenir ») — **pas de HTML arbitraire ni script** |
| ordre d’affichage | |
| statut | `DRAFT` / `PUBLISHED` / `ARCHIVED` |
| correspondances locales | liens optionnels vers axes de compétences / scores existants (ids ou clés locales) |
| auteur, dates | audit + publication / archivage |

**Compteurs UI :** toujours dérivés du contenu publié (et visible org/scope), jamais hardcodés (ni « 104 fiches »).

### 5.3 Administration `/admin` (lots J1–J2)

* liste + filtres (statut, catégorie, recherche) ;
* création / édition catégorie, section, article ;
* aperçu local du rendu télépro (sans OpenAI) ;
* publication / dépublication / archivage ;
* réordonnancement catégories, sections, articles ;
* **pas de suppression physique** si l’article est référencé par un débrief (ou autre lien métier) — archivage à la place ;
* contenu sûr : schéma de blocs validé côté serveur ;
* **aucune dépendance aux prompts OpenAI** pour stocker ou afficher Skills ;
* contenu **intégralement administrable** ; **aucune donnée de production Skills créée dans J0**.

### 5.4 Téléprospecteur (lot J3)

* n’affiche que `PUBLISHED` non archivé ;
* état vide explicite si bibliothèque vide ;
* deep-link depuis débrief uniquement vers articles publiés mappés.

---

## 6. Pages 32–37 — Appels réels (lot ultérieur)

Fonctionnalité **distincte** de la simulation. Peut déclencher transcription et analyse **payantes** → **hors feuille de route immédiate** (après J–M).

### 6.1 Upload manuel (cible UX future)

* écran liste + CTA « Charger un appel » (fichier audio) ;
* statuts liste : analysé / en cours / échec — depuis jobs persistés ;
* métadonnées : contact/libellé, date, durée, **source : upload manuel**.

### 6.2 Analyse déjà calculée

Même structure à **quatre onglets** que le débrief simulation (Résumé, Ligne par ligne, Pourquoi, Comparatif), alimentée uniquement par résultats **déjà persistés** après traitement asynchrone. Aucun recalcul au simple chargement de page.

### 6.3 Comparaison simulation / réel

Écran type « Simulation vs réel » : écarts par axe, totaux, actions recommandées **si stockés**. CTA possible vers rejouer un scénario lié — sans inventer le lien.

### 6.4 Hors périmètre explicite — Ringover

Ringover **n’est pas** une fonctionnalité disponible :

* aucun bouton de connexion ;
* aucun état « Connecté » ;
* aucune synchronisation ;
* aucune variable d’environnement ;
* aucune route ;
* aucune mention marketing comme disponible.

La mention Ringover de la maquette (sous-titre uploader) est **reportée** ; l’UI future d’upload ne doit pas promettre de synchro Ringover.

---

## 7. Pages 38–41 — Progression

Quatre vues en onglets pilules sous le titre « Progression » ; tab-bar visible.

### 7.1 Tendances

* indicateurs / fréquences issus de tentatives et analyses **persistées** (fenêtre configurable, ex. N derniers appels **disponibles**) ;
* insight textuel seulement s’il est stocké ou dérivé déterministe de compteurs réels ;
* état vide : « Pas encore assez de tentatives pour calculer des tendances ».

### 7.2 Comparatif

* barres utilisateur vs moyenne de référence ;
* **comparatif équipe** : strictement limité à l’organisation, aux permissions manager/télépro définies produit, et à un **seuil d’anonymisation à définir avant implémentation** (effectif minimal avant affichage de la moyenne) ;
* sans permission ou sous le seuil : message explicite, pas de moyenne fantôme.

### 7.3 Diagnostic

* score initial / score actuel / delta sur période **uniquement s’ils existent** (baseline enregistrée) ;
* sinon « Diagnostic non disponible — baseline absente ».

### 7.4 Badges

* streak, score moyen, grille de badges **uniquement depuis règles et faits persistés** ;
* badges non obtenus : état verrouillé ou absent selon design, sans faux « obtenu ».

**Interdit :** métriques fictives pour peupler la démo en production.

---

## 8. Direction visuelle (p.14–41)

Condensé des règles visibles — ne pas copier HTML ni dimensions pixel à pixel.

* fond presque noir ;
* cartes sombres à bordure discrète ;
* typographie blanche compacte ; labels secondaires gris ;
* accents bleu / violet / orange ;
* boutons principaux en dégradé bleu → orange ;
* onglets en pilules (actif = fond bleu) ;
* états positifs verts ; alertes orange / rouge ;
* largeur mobile étroite dans un cadre desktop arrondi ;
* barre de navigation inférieure dans le cadre ;
* cibles tactiles ≥ 44 px ; focus visible ;
* aucun texte ou contrôle tronqué.

Tokens de référence (héritage maquette, ajustables) :

| Token | Exemple | Usage |
|---|---|---|
| Fond | `#05060a` / quasi noir | App |
| Panel | `#0d1017` | Cartes |
| Bleu | `#3E6BFF` | Onglet actif, liens |
| Orange | `#FF7A3D` | Courant, alertes douces, CTA secondaire |
| Texte / dim | `#F5F6FA` / `#9AA1B2` | Prim / sec |
| Vert / rouge | `#3ECF8E` / `#FF5C5C` | Succès / alerte |

---

## 9. Accessibilité

* un `main` par destination ; `aria-current="page"` sur tab active ;
* onglets débrief / progression actionables clavier ;
* cibles ≥ 44 px ; `lang="fr"` ; un H1 par écran ;
* tutoiement cohérent dans les libellés produit ;
* contrôles sémantiques (boutons/liens), pas de `div` cliquables nus en production.

---

## 10. Cartographie maquette → lots

| Zone maquette (p.) | Lot |
|---|---|
| Contrat + API Skills | **J1** |
| UI admin Skills | **J2** |
| UI télépro Skills | **J3** |
| Débrief 4 onglets + liens Skills | **K** |
| Alignement visuel Missions / appel / fin | **L** |
| Progression avancée (4 vues) | **M** |
| Upload + analyse appels réels + écart simulé/réel | **Ultérieur** (coût IA) |
| Ringover | **Reporté** (hors périmètre actif) |

**Déjà livré (contexte) :** shell 5 destinations (H) ; Missions dynamiques sur `Scenario` / assignations / simulations (I). J0 = documentation uniquement.

---

## Principes de réalisation

* Réutiliser auth, Prisma, routes télépro/admin, débriefs et tentatives existants.
* Toute valeur chiffrée à l’écran = donnée persistée ou agrégat déterministe local — jamais hardcode maquette.
* Maquette = référence visuelle et flux ; pas de copie du PDF ni du HTML monolithique historique.
* Pas d’appel OpenAI, d’upload, ni de synchro téléphonie dans les lots documentaires ou UI pure sans pipeline dédié.
* Tests : fixtures/mocks locaux ; vérifications viewport mobile étroit + desktop cadre.
