<div align="center">

<img src="public/icons/icon.svg" alt="Vesta Logo" width="80" />

# Vesta

**Protégez, faites fructifier et investissez votre patrimoine.**

Application web de gestion financière personnelle et patrimoniale, alimentée par une IA multi-agents.

[![Déployé sur Vercel](https://img.shields.io/badge/Déployé%20sur-Vercel-000?logo=vercel&logoColor=white)](https://vercel.com)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth-orange?logo=firebase)](https://firebase.google.com)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/fr/docs/Web/JavaScript)
[![PWA](https://img.shields.io/badge/PWA-Compatible-5A0FC8?logo=pwa)](https://web.dev/progressive-web-apps/)

</div>

---

## Aperçu

Vesta est une application de gestion de patrimoine tout-en-un, conçue pour vous donner une vision claire et complète de vos finances. Elle intègre le suivi des transactions, la gestion budgétaire, l'analyse boursière avec IA multi-agents, et bien plus encore.

---

## Fonctionnalités

### Vue d'ensemble
- Tableau de bord avec répartition budgétaire visuelle (règle 50/30/20)
- Solde global en temps réel sur tous vos comptes
- Graphiques d'évolution du patrimoine net

### Transactions
- Suivi des revenus et dépenses par compte et catégorie
- 14 catégories (salaire, loyer, alimentation, loisirs, voyages…)
- Filtrage, recherche et tri avancés
- 5 types de comptes (courant, épargne, joint, professionnel, investissement)

### Budget
- Budgets mensuels par catégorie avec suivi en temps réel
- Visualisation des dépenses vs objectifs
- Analytiques et recommandations

### Patrimoine
- Vue consolidée de l'ensemble de vos actifs
- Suivi de l'évolution du patrimoine net dans le temps

### Épargne & Investissements
- Planification d'épargne avec calcul des intérêts composés
- Simulateur de projections financières

### Bourse (IA Multi-Agents)
- Analyse d'opportunités d'investissement via un pipeline multi-agents :
  - Analyste technique (chartisme)
  - Analyste des actualités (sentiment de marché)
  - Analyste des fondamentaux
  - Gestionnaire des risques
  - Agent de décision finale
- Produits financiers recommandés
- Gestion de portefeuille et suivi des placements

### Crédits & Abonnements
- Suivi des abonnements récurrents
- Gestion des contrats de crédit et prêts immobiliers

### Importation
- Import de relevés bancaires et documents financiers (PDF)
- Parsing intelligent via PDF.js

### Conseiller IA
- Assistant financier conversationnel
- Compatible OpenAI, Anthropic Claude, Google Gemini, Mistral

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| Visualisation | Chart.js 4.4.1 |
| Import PDF | PDF.js 3.11.174 |
| Auth & Base de données | Firebase Authentication + Firestore |
| IA | OpenAI GPT-4o, Anthropic Claude Sonnet, Google Gemini 1.5, Mistral Large |
| Serveur | Node.js (zero-dependency) |
| Déploiement | Vercel |
| PWA | Service Worker + Web App Manifest |

> **Zéro dépendance NPM côté frontend.** Toute la logique est construite en JavaScript natif.

---

## Installation

### Prérequis

- Node.js 18+
- Un projet Firebase (Firestore + Authentication activés)

### Lancer en local

```bash
# Cloner le dépôt
git clone https://github.com/ghost0fmars/vesta.git
cd vesta

# (Optionnel) Configurer les variables d'environnement
cp .env.example .env.local
# Remplir les clés API dans .env.local

# Démarrer le serveur
npm run dev
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

Le serveur détecte automatiquement un port disponible si 3000 est occupé (jusqu'au port 3020).

---

## Variables d'environnement

Créez un fichier `.env.local` à la racine du projet :

```env
# Clé API OpenAI (si vous utilisez GPT-4o)
OPENAI_API_KEY=sk-...

# Port du serveur (optionnel, défaut : 3000)
PORT=3000
```

Les clés des autres fournisseurs IA (Claude, Gemini, Mistral) se configurent directement dans les **Paramètres** de l'application — elles sont stockées de manière sécurisée dans Firebase.

---

## Architecture

```
vesta/
├── index.html           # Point d'entrée SPA
├── server.mjs           # Serveur HTTP Node.js
├── sw.js                # Service Worker (PWA)
├── manifest.webmanifest # Manifest PWA
│
├── src/
│   ├── app.js           # Logique principale, rendu, graphiques
│   ├── agents.js        # Pipeline IA multi-agents (analyse boursière)
│   ├── auth.js          # Gestion de l'authentification
│   ├── firebase.js      # Initialisation Firebase
│   └── styles.css       # Styles (responsive, mode sombre)
│
├── public/
│   └── icons/           # Icônes de l'application
│
└── database/
    └── schema.sql       # Schéma PostgreSQL (backend alternatif)
```

---

## Déploiement

L'application est préconfigurée pour **Vercel** via `vercel.json`. Un simple `git push` sur la branche principale déclenche un déploiement automatique.

Pour tout autre hébergeur supportant Node.js :

```bash
npm start
```

---

## À propos

Vesta est développée par **àlaclé**, une association loi 1901 basée en France.

- **Numéro RNA** : W131016315
- **Contact** : contact@alacle.org

---

## Licence

Ce projet est licencié sous la [Licence Apache 2.0](LICENSE).

Copyright (c) 2026 àlaclé
