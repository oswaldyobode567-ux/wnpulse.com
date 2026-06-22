# PRD — Pronostix AI

## Problem statement (original, FR)
> peux tu me généré un code pour une application de pronostique de paris sportifs? analyse de paris , les meilleurs paris de tout les sports selon un pronostiques élevé seront mis a la une une application comme bet Ai mais en plus puissant qui référence a chaque fois les bon pronostiques donné. je vais créé un processus d'abonnement mensuel en fonction des réussites j'ai besoin que ca devoloppe un truc réel tel que footystat avec de réel information en prenant en compte tout les sports. propose des combinée en tant réel, couvre tout les evènement, met toi en mode expert. footystat+BET AI en plus soft claire, analyse poussée, pack d'abonnement selon la graduation, paiement MTN Mobile Money +229 0152645151.

## User choices (verbatim)
- The Odds API (cotes temps réel multi-sports)
- Claude Sonnet 4.5 (analyse stats)
- Football, Basketball, Tennis, NFL, Hockey, MMA, tous
- Auth JWT email/password + abonnement MTN Mobile Money +229 01 52 64 51 51
- Couleurs : "choisis la meilleure option" → light/clinique/swiss

## Architecture
- **Backend** FastAPI + MongoDB (motor) — port 8001, prefix `/api`
- **Frontend** React (CRA + craco) + shadcn/ui + Tailwind + framer-motion
- **AI** Claude Sonnet 4.5 via `emergentintegrations` (clé `EMERGENT_LLM_KEY`)
- **Odds** The Odds API (clé `ODDS_API_KEY`, vide → fallback mock déterministe 30+ matchs/jour)
- **Paiement** MTN Mobile Money manuel (référence + WhatsApp confirmation admin)

## Stratégie d'économie API
- Cache MongoDB 60 min sur les odds (`odds_cache` collection)
- Moteur de scoring **déterministe** (consensus + vig + variance) → confidence pour TOUS les matchs sans Claude
- Claude appelé UNIQUEMENT sur l'analyse détaillée d'un match (on-demand) + cache journalier (`ai_analysis_cache`)
- Free tier n'appelle pas Claude (fallback engine)

## Implemented (22/06/2026)
- Landing pro avec hero, stats KPI, features, pricing, footer (FR)
- Auth JWT (register/login/me) + bcrypt + protection routes
- Dashboard : À la Une (top 3 confiance) + filtres 7 sports + grille matchs
- Top Picks (top 6 du jour)
- Match Detail : header, prediction box avec edge/probs, AI analysis (Claude ou fallback), bookmakers
- Combinés Gagnants : slider 2-5 sélections, parlay multi-sports, sticky bet slip avec payout
- Track Record : KPIs (win rate, ROI, avg odds) + historique 12 picks (auto-seedé)
- Subscription : 3 tiers (Free 0 / Pro 4900 / Elite 14900 FCFA), dialog MTN MoMo, instructions copy-paste, activation
- Sidebar desktop + bottom nav mobile, sonner toasts

## Tests
- Backend pytest 20/20 PASS (`/app/backend/tests/test_pronostix_api.py`)
- Frontend Playwright : tous les flows critiques PASS
- Identifiants démo : `demo@pronostix.ai` / `demo1234`

## Backlog (P1)
- Activer une clé The Odds API réelle (champ `ODDS_API_KEY` dans `/app/backend/.env`)
- Tableau admin pour valider les paiements MoMo (au lieu du self-confirm démo)
- Webhook MTN MoMo officiel (API marchand) pour activation automatique
- Notifications push / WhatsApp pour alertes value bets
- Historique réel basé sur résolutions matchs (via Odds API `/scores`)

## Backlog (P2)
- Filtres avancés (ligue spécifique, cote min/max)
- Bankroll tracker + Kelly criterion calculator
- Mode expert : marchés alternatifs (Over/Under, BTTS, handicaps asiatiques)
- Programme parrainage / referral
- Page publique de stats publiée (preuve sociale pour SEO)
