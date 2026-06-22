# PRD — WinPulse

## Problem statement (original, FR)
> Application de pronostics de paris sportifs (FootyStats + BetAI mais en mieux). Pronostics par IA, combinés en temps réel, multi-sports (foot, basket, tennis, NFL, hockey, MMA), abonnement mensuel par MTN Mobile Money +229 01 52 64 51 51 selon graduation. Soft, clair, analyse poussée. Couleurs vibrantes. Nom ludique fun et jouissif. Combinés du plus safe au plus risqué.

## Branding
- **Name**: WinPulse — "Ton pouls de gagnant"
- **Primary**: orange-600 #ea580c (energy, action)
- **Pulse accent**: rose-500 #f43f5e (live indicators)
- **Win green**: emerald-500 #10b981
- **Tone**: soft, clean, vibrant; FR-first

## Architecture
- **Backend** FastAPI + MongoDB (motor) — port 8001, prefix `/api`
- **Frontend** React (CRA + craco) + shadcn/ui + Tailwind
- **AI** Emergent LLM key (referred to as "IA experte" in UI) — on-demand + cached daily per match
- **Odds** The Odds API (real key) — 23 sport keys, 14-day horizon, 60 matches cap, MongoDB cache 60min
- **Emails** Resend (test mode for now — need verified sender domain for production broadcast)
- **Paiement** MTN Mobile Money manuel + panneau admin de validation

## Stratégie d'économie API
- Cache MongoDB 60 min sur les odds (`odds_cache`)
- Moteur de scoring déterministe (consensus + vig retiré + variance) → confidence pour TOUS les matchs sans IA
- IA appelée uniquement sur match detail on-demand, cache journalier (`ai_analysis_cache`)
- Free tier n'appelle pas l'IA (fallback engine)

## Implemented (22/06/2026)
### Iteration 1
- Landing pro, auth JWT, dashboard, top picks, match detail, history, combiné v1, subscription
### Iteration 2 (this run)
- **Rebrand WinPulse** + palette vibrante orange/rose
- **Real Odds API integration** — 60 matchs réels (MMA, ATP Wimbledon, MLB, WNBA, Brazil Série B…)
- **Multi-combos** : 3 niveaux **Sécurité / Équilibre / Jackpot** auto-générés
- **Admin panel** /app/admin : KPIs (revenue/users/payments), validation paiements 1-clic, broadcast emails
- **Resend email integration** : confirmation paiement automatique + broadcast picks aux abonnés
- **Admin seeding** automatique au démarrage backend
- Suppression de toute mention de l'agent IA dans l'UI ("IA experte" / "Moteur statistique")

## Tests
- Backend pytest 35/35 PASS
- Frontend Playwright : tous les flows critiques PASS (incluant cycle complet register→checkout→admin-confirm→upgrade)

## Backlog (P1)
- Vérifier un domaine d'envoi sur resend.com (sinon broadcast échoue sauf vers admin)
- Webhook MTN MoMo officiel (API marchand) pour activation automatique
- Migration des anciens refs PRX- vers WP- (cosmétique)
- Désactiver `/api/subscription/confirm/{ref}` self-confirm en production

## Backlog (P2)
- Bankroll tracker + Kelly calculator
- Marchés alternatifs (Over/Under, BTTS, handicaps)
- Programme parrainage / referral
- Page publique du track record (SEO)
- Notifications WhatsApp via Twilio
- Page admin pour gérer les sports/leagues affichés (toggle on/off)

