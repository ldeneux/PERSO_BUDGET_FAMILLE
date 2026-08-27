# Budget famille

Appli de budget et simulation à 2 ans, partagée entre deux comptes, avec
synchronisation en temps réel (Next.js + Supabase + Vercel).

Suis les étapes dans l'ordre. Compte environ 20-30 minutes la première fois.

## 1. Créer le projet Supabase

1. Va sur https://supabase.com et crée un compte gratuit (avec ton email ou GitHub).
2. Clique sur **New project**. Choisis un nom (ex: `budget-famille`), un mot de
   passe de base de données (note-le, tu n'en auras pas besoin au quotidien
   mais garde-le de côté), et une région proche de toi (`eu-west` / Paris ou Francfort).
3. Attends 1-2 minutes que le projet soit prêt.

## 2. Créer les tables et la sécurité

1. Dans le menu de gauche, ouvre **SQL Editor**.
2. Ouvre le fichier `supabase/schema.sql` de ce projet, copie tout son contenu,
   colle-le dans l'éditeur SQL Supabase, puis clique **Run**.
3. Vérifie dans **Table Editor** que les tables `settings`, `categories` et
   `entries` sont bien créées.

Ce script active aussi la sécurité (Row Level Security) : seuls des comptes
authentifiés pourront lire ou écrire des données, personne d'autre.

## 3. Créer vos deux comptes (toi et ta femme)

Pas d'inscription publique — vous créez vos deux comptes vous-même :

1. Dans le menu de gauche, ouvre **Authentication > Users**.
2. Clique **Add user > Create new user**.
3. Renseigne ton email et un mot de passe. Coche **Auto Confirm User** pour
   ne pas avoir à valider par email.
4. Répète l'opération pour l'email de ta femme.

## 4. Récupérer les clés API

1. Dans le menu de gauche, ouvre **Project Settings > API**.
2. Note deux valeurs : **Project URL** et la clé **anon public**.
3. Ouvre le fichier `.env.local.example` de ce projet, duplique-le en
   `.env.local`, et colle-y ces deux valeurs.

## 5. Déployer sur Vercel

1. Mets ce projet sur GitHub (crée un nouveau dépôt, pousse ces fichiers).
2. Va sur https://vercel.com, crée un compte gratuit (idéalement avec GitHub),
   clique **Add New > Project**, choisis ton dépôt.
3. Avant de cliquer sur Deploy, ouvre **Environment Variables** et ajoute :
   - `NEXT_PUBLIC_SUPABASE_URL` → ta Project URL Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → ta clé anon public
4. Clique **Deploy**. Après 1-2 minutes, Vercel te donne une URL du type
   `budget-famille.vercel.app`.

## 6. Utilisation au quotidien

- Partage l'URL Vercel à ta femme. Chacun se connecte avec son email/mot de
  passe créé à l'étape 3.
- Toute modification (ajout d'une dépense, changement de solde...) apparaît
  quasi instantanément chez l'autre grâce au temps réel Supabase.
- Si personne n'ouvre l'appli pendant 7 jours, le projet Supabase gratuit se
  met en pause automatiquement. Il suffit d'ouvrir le dashboard Supabase et
  cliquer **Restore** pour le relancer (ça ne prend pas plus d'une minute) —
  vos données ne sont pas perdues.

## Développement local (optionnel)

```bash
npm install
npm run dev
```

Puis ouvre http://localhost:3000.

## Prochaine étape possible

Cette v1 couvre le budget et la simulation à 2 ans. Le suivi locatif
(quittances, historique des loyers, contrats) peut devenir une deuxième
appli du même type, avec son propre schéma Supabase — à faire quand tu es prêt.
