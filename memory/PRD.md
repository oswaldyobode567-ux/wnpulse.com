# WinPulse — Product Requirements Document

## Original Problem Statement
Build an AI-powered sports betting prediction application called **WinPulse**:
- Real-time odds + multi-sport coverage via The Odds API
- AI analysis using Claude Sonnet 4.5
- Subscription tiers (Free / Pro 4 900 FCFA / Elite 14 900 FCFA) via MTN Mobile Money Bénin
- Combo predictions and free daily picks
- Vibrant orange/rose UI + social proof, live scores, public track record, value bets, FootyStat-style match stats, profile.

## Company / Editor
- **Name:** WinPulse SARL
- **HQ:** Cotonou, Littoral, Bénin
- **Contact:** contact@winpulse.com
- **MTN MoMo / WhatsApp:** +229 01 67 30 54 39
- **Refund policy:** No refund after activation (explicit consent checkbox on payment)

## Tech Stack
- **Frontend:** React 18, Tailwind, Shadcn UI, Recharts, dayjs
- **Backend:** FastAPI, MongoDB (Motor async)
- **Email:** Resend
- **AI:** Claude Sonnet 4.5 (via Emergent LLM key)
- **Auth:** JWT custom
- **Realtime:** smart polling (no websockets)

## Implemented Features
### Auth & Onboarding
- JWT register/login, forgot password + email reset, social proof toast
### Core Product
- Real-time matches dashboard, top picks, multi-market combos (Safe/Balanced/Jackpot)
- Match Detail page with H2H/Form/Injuries stats (FootyStat style)
- Value Bets detector
- Public Track Record page with Recharts charts
- User Profile page
### Subscriptions
- 3 tiers (Free / Pro 4900 / Elite 14900 FCFA)
- **PaymentModal** (Feb 2026) — 3-step flow Récap → Paiement → Confirmation
  - PE-XXXXXXXX reference, MTN merchant +229 01 67 30 54 39
  - WhatsApp pre-filled confirmation deep-link
  - "Aucun remboursement" consent checkbox (required to proceed)
  - Wired on Dashboard, Subscription, Combos, TopPicks, ValueBets, MatchDetail, Profile
### Communications
- Welcome email, payment confirmation, weekly teaser, reset password
- **Drip campaign (Feb 2026)** — J+1 / J+3 / J+5 emails to Free users, idempotent via `drip_sent_days` field, background loop runs every 6h, admin endpoints `/api/admin/drip/preview` and `/api/admin/drip/run`
### Legal (Feb 2026)
- 4 pages at `/legal/:slug`:
  - `/legal/mentions-legales` — Éditeur, hébergeur (Emergent), propriété intellectuelle
  - `/legal/cgv` — 10 sections, no-refund policy explicit, droit béninois, juridiction Cotonou
  - `/legal/confidentialite` — Loi n° 2017-20 du Bénin (Code du numérique), droits APDP, sous-traitants
  - `/legal/jeu-responsable` — 18+, signes d'addiction, ressources d'aide
- Footer link on Landing + AppLayout
### Admin
- Admin panel with pending payments validation, broadcast picks, drip trigger
- Stats (revenue, paid users, conversions)

## Key Backend Endpoints
- Auth: `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`
- Data: `/api/data/status`, `/api/data/refresh`, `/api/scores`, `/api/matches`, `/api/matches/{id}`
- Predictions: `/api/predictions/top`, `/api/predictions/combos`, `/api/track-record`, `/api/value-bets`
- Subscription: `/api/plans`, `/api/subscription/checkout`, `/api/subscription/payments`
- Admin: `/api/admin/payments`, `/api/admin/payments/{ref}/confirm|reject`, `/api/admin/users`, `/api/admin/stats`, `/api/admin/broadcast/picks`, `/api/admin/drip/preview`, `/api/admin/drip/run`

## Backlog / Roadmap

### 🔴 P0 — Required for commercial launch
- [ ] **Odds API paid plan (~$30/mo)** — current free tier limited to 500 req/mo → mock fallback
- [ ] **Acquire domain** (e.g. winpulse.bj or .com) — for site + emails
- [ ] **Verify domain on Resend** (DNS SPF/DKIM/DMARC) — emails currently only delivered to whitelisted addresses
- [ ] **Deploy to production domain** via Emergent

### 🟠 P1 — Strong impact
- [ ] **Real MTN MoMo API** integration (currently manual admin validation via WhatsApp)
- [ ] **Auto-reveal results worker** — auto-settle predictions to WIN/LOSS when matches finish
- [ ] **A/B test promo codes** in drip day-5 (currently hardcoded WIN30)

### 🟡 P2 — Nice-to-have
- [ ] Refactor `server.py` into modular APIRouters (`/routes/auth`, `/routes/odds`, etc.)
- [ ] WhatsApp Business API for instant pick notifications
- [ ] Referral program (viral growth via WhatsApp share)
- [ ] Mobile app (React Native)

## Test Credentials
See `/app/memory/test_credentials.md`

## File Architecture
```
/app/
├── backend/
│   ├── server.py (auth, odds, predictions, subs, admin, drip)
│   ├── email_service.py (welcome, picks, teaser, reset, drip_day1/3/5)
│   ├── odds_service.py, prediction_engine.py, ai_service.py, auth.py
│   └── .env (MOMO_MERCHANT_PHONE=+229 01 67 30 54 39)
├── frontend/src/
│   ├── App.js (routing incl. /legal/:slug)
│   ├── components/
│   │   ├── payment/PaymentModal.jsx (3-step, PE-XXX ref, WhatsApp link)
│   │   ├── AppLayout.jsx (with legal footer)
│   │   ├── MatchCard.jsx, RealtimeBar.jsx, SocialProofToast.jsx
│   ├── pages/
│   │   ├── LegalPage.jsx (mentions / cgv / confidentialite / jeu-responsable)
│   │   ├── Landing/Dashboard/TopPicks/Combos/Match/Profile/TrackRecord/ValueBets...
│   ├── services/realtimeService.js
│   └── contexts/AuthContext.jsx
└── memory/ (PRD.md, test_credentials.md)
```

Last updated: Feb 2026
