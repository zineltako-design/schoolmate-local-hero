# Passage au cloud partagé (base de données intégrée)

Objectif : les données ne vivent plus seulement dans le navigateur. Toi, ton mari et tout autre membre de l'école voyez les mêmes élèves, notes, paiements, en temps réel — et rien ne s'efface en navigation privée.

L'application reste exactement la même à l'écran : mêmes pages, même connexion en 2 étapes (code école, puis email + mot de passe). Tout le changement est en coulisses.

## 1. Activation de la base cloud

Activation de la base de données intégrée du projet (base Postgres + comptes utilisateurs + temps réel), sans compte externe à créer.

## 2. Création des tables

Création des 18 tables du schéma actuel, à l'identique (mêmes noms, mêmes champs) :

`ecole_config`, `classes`, `eleves`, `matieres`, `utilisateurs`, `notes`, `paiements`, `depenses`, `config_scolarite`, `notes_audit_log`, `presences`, `archives_eleves`, `archives_finances`, `ecoles`, `licences_keys`, `abonnements`, `annonces_plateforme`, `comptabilite_caisse`, `comptabilite_banque`, `comptabilite_config`.

Chaque table liée à une école porte la colonne `ecole_code`, indexée. La base cloud démarre vide (choix retenu) : les données locales actuelles ne sont pas poussées.

## 3. Sécurité : cloisonnement par école

- Chaque compte cloud est rattaché à une école et à un rôle (admin, directeur, prof, comptable, superviseur).
- Le serveur, et non le navigateur, décide de ce qui est lisible : un compte ne peut lire ni écrire que les lignes de son école. Impossible d'aller voir les données d'une autre école, même en trafiquant l'application.
- Les tables globales (écoles, licences, abonnements, annonces) sont réservées au SuperAdmin.
- Les mots de passe ne sont plus stockés en clair : ils sont gérés et chiffrés par le service de comptes du cloud.

## 4. Connexion : même écran, sécurité réelle

- Étape 1 : le code école est vérifié dans la table `ecoles` du cloud.
- Étape 2 : email + mot de passe ouvrent une vraie session cloud en arrière-plan ; l'app vérifie ensuite que le compte appartient bien au code école saisi.
- Création d'un membre depuis le panneau « Utilisateurs » : le compte cloud est créé et rattaché à l'école connectée, utilisable immédiatement par la personne concernée depuis son propre appareil.
- Création d'une école depuis le SuperAdmin : école + compte directeur créés côté cloud, connectables tout de suite.
- Un compte de démarrage administrateur est créé pour ton école afin de ne jamais être bloquée à la première connexion.

## 5. Synchronisation dans js/db.js

Le fonctionnement « local d'abord » est conservé (affichage instantané, tolérance aux coupures réseau), mais le cloud devient la source de vérité :

- Lecture : cloud au chargement de la session, stockage local pour l'affichage immédiat et le mode hors-ligne.
- Écriture : enregistrement local instantané + envoi cloud immédiat ; en cas de coupure, la file d'attente existante renvoie automatiquement au retour du réseau.
- Temps réel : quand ton mari saisit un paiement, ton écran se met à jour sans rafraîchir.
- Le filtre `ecole_code` est appliqué localement **et** verrouillé côté serveur (double barrière).

## 6. Vérification

Test réel dans le navigateur : connexion, ajout d'un élève / d'une note / d'un paiement, contrôle que la donnée arrive bien dans la base cloud, qu'une seconde session la voit apparaître, et qu'un compte d'une autre école ne voit rien.

## Détails techniques

- Base intégrée (Supabase) activée via l'outil Cloud ; tables créées par migration SQL avec `GRANT` + RLS activée sur chacune.
- RLS basée sur une table `profils` (`user_id`, `ecole_code`, `role`, `actif`) et des fonctions `SECURITY DEFINER` (`current_ecole_code()`, `has_role()`) pour éviter toute récursion de politique.
- La table `utilisateurs` conserve les informations métier (rôle, classe titulaire, matières autorisées) ; l'authentification passe par `auth.users`. Aucun mot de passe en clair conservé.
- Création de comptes par un admin : route serveur protégée (vérification du rôle appelant) utilisant l'API admin, plutôt qu'une inscription publique.
- `js/db.js` : la couche transport `tables/…` (`_apiGet`/`_apiPost`/`_pullFromCloud`/`_pushToCloud`) est remplacée par des appels PostgREST du client Supabase chargé dans `public/app/index.html`. `getAll`, `getById`, `query`, `insert`, `update`, `delete`, `getUsersByEcole` gardent leurs signatures — `pages.js`, `app.js`, `superadmin.js`, `db-extras.js` ne changent pas de contrat.
- `insert`/`update` envoient un `upsert` idempotent sur `id` ; les suppressions restent en soft-delete synchronisé.
- Abonnements temps réel par table de l'école courante, avec invalidation du cache mémoire et re-render de la page active.
