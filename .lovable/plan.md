# Recommandations d'amélioration — Zean School Manager

Le projet fonctionne (login 2 étapes, 18 tables IndexedDB, tous les modules). Voici les axes d'amélioration classés par priorité, à valider avant toute implémentation.

## Priorité 1 — Sécurité des comptes

- Les mots de passe sont stockés et comparés en clair (`js/app.js` compare `u.mot_de_passe === pwd`, `js/bootstrap.js` injecte `admin123` etc.). Recommandation : hachage via l'API Web Crypto (PBKDF2/SHA-256 + sel par utilisateur), avec migration transparente au premier login des comptes existants.
- Comptes de démo à mots de passe connus : les cantonner à l'école `DEMO` et forcer un changement de mot de passe à la première connexion pour toute nouvelle école.
- Verrouillage après N tentatives échouées et journalisation dans la table d'audit.

## Priorité 2 — Fiabilité hors-ligne

- `sw.js` met en cache des chemins racine (`/index.html`, `/js/db.js`) alors que l'app est servie sous `/app/`. Recommandation : chemins relatifs, `CACHE_NAME` versionné automatiquement et purge des anciens caches à l'activation.
- Ajouter un indicateur clair « données non synchronisées » basé sur la `write_queue`, avec compteur et bouton de relance manuelle.
- Gérer explicitement l'absence d'API distante (mode 100 % local) au lieu de dépendre d'échecs `fetch` silencieux.

## Priorité 3 — Sauvegarde et restauration

- L'export JSON existe déjà ; ajouter une restauration robuste (validation du schéma, choix fusion ou remplacement, aperçu avant import) et un export chiffré optionnel.
- Sauvegarde automatique périodique (téléchargement mensuel proposé à la clôture) pour éviter la perte du navigateur.

## Priorité 4 — Maintenabilité du code

- `js/pages.js` fait 7 403 lignes. Recommandation : découpage progressif par domaine (`pages.eleves.js`, `pages.notes.js`, `pages.caisse.js`, `pages.rapports.js`) sans changer les API publiques `Pages.*`, module par module pour éviter toute régression.
- Réintégrer dans `js/db.js` les fonctions actuellement dans `js/db-extras.js` (`getStatsDashboard`, `getEcheances`, `getRapportFinancier`…) pour n'avoir qu'une source de vérité.
- Centraliser le rendu des tableaux/modales (helpers communs) : beaucoup de HTML est dupliqué entre modules.

## Priorité 5 — Qualité de données et UX

- Validation stricte à la saisie (email unique par école, montants positifs, notes bornées par le barème, dates cohérentes avec l'année scolaire).
- Confirmation systématique + suppression logique (corbeille) pour les entités financières et les élèves, plutôt qu'une suppression définitive.
- Recherche globale (élève, reçu, utilisateur) et pagination/virtualisation des listes au-delà de quelques centaines de lignes.
- Accessibilité et mobile : l'interface est consultée en 360 px de large ; vérifier les tableaux scrollables, tailles de cibles tactiles, contrastes.

## Priorité 6 — Vérification automatisée

- Petite suite de tests navigateur (Playwright) couvrant : login 2 étapes, création d'école, création d'utilisateur, inscription d'un élève, saisie de notes + bulletin, paiement + reçu, clôture. Objectif : détecter les régressions avant qu'elles n'apparaissent en préview.

## Détails techniques

- Hachage : `crypto.subtle.deriveBits` PBKDF2, 100 000 itérations, sel 16 octets ; champs ajoutés `pwd_hash`, `pwd_salt`, `pwd_algo`, ancien champ conservé le temps de la migration puis effacé.
- Découpage `pages.js` : chaque fichier étend l'objet global `Pages` (`Object.assign(Pages, {...})`), chargé après `pages.core.js` dans `index.html` ; aucun changement d'appel dans le routeur.
- Service worker : `self.registration.scope` comme base des URLs mises en cache, stratégie cache-first inchangée pour le shell.
- Aucune modification du filtrage multi-tenant `ecole_code` ni transformation de `getAll()` en appel réseau.

## Ordre proposé

1. Sécurité mots de passe + verrouillage
2. Correctif service worker + indicateur de synchronisation
3. Restauration de sauvegarde
4. Tests de non-régression
5. Découpage de `pages.js`
6. Améliorations UX / validation

Dis-moi quels blocs tu veux garder et dans quel ordre, je n'implémente rien avant ton accord.
