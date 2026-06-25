# WinPulse — Product Requirements Document

## Original Problem Statement
Build an AI-powered sports betting prediction application called **WinPulse** with real-time odds via The Odds API, Claude Sonnet AI analysis, MTN Mobile Money subscriptions (Pro 4 900 / Elite 14 900 FCFA), combo predictions, track record, value bets, vibrant orange/rose UI for Bénin market.

## Company / Editor
- **Name:** WinPulse SARL · Cotonou, Littoral, Bénin
- **Contact:** contact@wnpulse.com · WhatsApp/MTN +229 01 67 30 54 39
- **Domain:** `wnpulse.com` (purchased Feb 2026 via Namecheap — pending deployment + Resend verification)
- **Refund policy:** No refund after activation (explicit consent checkbox on payment)

## Tech Stack
- **Frontend:** React 18, Tailwind, Shadcn UI, Recharts, dayjs, lucide-react
- **Backend:** FastAPI, MongoDB (Motor async)
- **Email:** Resend (sender `contact@wnpulse.com`)
- **AI:** Claude Sonnet 4.5 (Emergent LLM key)
- **Auth:** JWT custom
- **Realtime:** smart polling

## Implemented Features

### Auth & Onboarding
- JWT register/login, password reset email, ?ref=CODE pre-fill on signup

### Core Product
- Real-time matches dashboard (epic hero card with greeting + tier badges), Top picks
- Multi-market combos (Safe/Balanced/Jackpot)
- Match detail page with H2H/Form/Injuries (FootyStat style)
- Value Bets detector
- Public Track Record page with **epic emerald-orange hero** + Recharts area chart
- User Profile page with **epic dark hero** + tier crown/sparkles badge + referral count
- Cross-page footer with all legal links

### Subscriptions
- 3 tiers (Free / Pro 4 900 / Elite 14 900 FCFA)
- **PaymentModal**: 3-step Récap → MTN Instructions → WhatsApp Confirmation, `PE-XXXXXXXX` reference, no-refund consent checkbox, wired on 6+ pages
- Admin manual validation via WhatsApp until real MTN API integration

### Communications
- Welcome, payment confirmation, weekly teaser, reset password emails
- **Drip campaign J+1 / J+3 / J+5** auto-runs every 6h on Free users, idempotent via `drip_sent_days` field
- J+3 email includes referral CTA

### Referral Program (Feb 2026)
- Unique `referral_code` per user (e.g. `WIN-BE7BA`)
- `?ref=CODE` URL param picked up by RegisterPage
- Page `/app/parrainage` with progress bar, WhatsApp 1-click share, email share, copy link/code
- Endpoints `GET /api/referral/me`, `POST /api/referral/claim` — 3 friends signed up = 7 days Pro auto-granted

### Legal (Feb 2026)
- 4 pages at `/legal/:slug`: mentions-legales, cgv, confidentialite, jeu-responsable
- Compliant with Bénin law n° 2017-20 (Code du numérique) + APDP rights
- Footer link on Landing + AppLayout

### Marketing / Social Proof
- ❌ Removed fake "X just won..." floating toast
- ✅ Real testimonials section on Landing (6 reviews from Cotonou/Lomé/Abidjan/Parakou, 4.8/5 rating, stats bar)
- ✅ Referral promo banner on Landing
- ✅ Epic hero on Landing (floating gradient blobs, animated CTA, bigger typography)

### Admin
- Pending payments validation, broadcast picks, drip trigger endpoints, stats

## Key Backend Endpoints
- Auth: `/api/auth/login|register|forgot-password|reset-password`
- Data: `/api/data/status|refresh`, `/api/scores`, `/api/matches`, `/api/matches/{id}`
- Predictions: `/api/predictions/top|combos`, `/api/track-record`, `/api/value-bets`
- Subscription: `/api/plans`, `/api/subscription/checkout|payments`
- Referral: `/api/referral/me`, `/api/referral/claim`
- Admin: `/api/admin/payments|users|stats|broadcast|drip/preview|drip/run|test-email`

## DB Schema (key fields)
- `users`: id, email, full_name, hashed_password, is_admin, subscription_tier, subscription_status, subscription_expires_at, created_at, **referral_code**, **referral_count**, **referral_reward_claimed**, **referred_by**, **drip_sent_days**
- `payments`: reference (PE-XXXXXXXX), user_id, tier, amount_xof, phone, status (pending/confirmed/rejected)
- `predictions_log`: match_id, user_id, pick, odds, result, profit, created_at

## Backlog / Roadmap

### 🔴 P0 — Required for commercial launch
- [ ] **Click Deploy** in Emergent UI (user action) — required to put `wnpulse.com` live
- [ ] **Add CNAME at Namecheap** pointing `www.wnpulse.com` to Emergent deployment host
- [ ] **Verify domain on Resend** (DNS records pending propagation) — required for emails to non-whitelisted addresses
- [ ] **Odds API paid plan (~$30/mo)** — currently limited to 500 req/mo

### 🟠 P1 — Strong impact
- [ ] Real MTN MoMo API integration (replace manual admin validation)
- [ ] Auto-reveal results worker (auto-settle WIN/LOSS)
- [ ] Submit to Google Search Console + index sitemap

### 🟡 P2 — Nice-to-have
- [ ] Refactor `server.py` into modular APIRouters
- [ ] WhatsApp Business API for pick notifications
- [ ] Mobile app (React Native)
- [ ] A/B test promo codes in drip day-5

## File Architecture
```
/app/
├── backend/
│   ├── server.py (auth, odds, predictions, subs, admin, drip, referral)
│   ├── email_service.py (welcome, picks, teaser, reset, drip_day1/3/5)
│   ├── odds_service.py, prediction_engine.py, ai_service.py, auth.py
│   └── .env (APP_BASE_URL=https://wnpulse.com, SENDER_EMAIL=contact@wnpulse.com)
├── frontend/src/
│   ├── App.js (routing incl. /legal/:slug, /app/parrainage)
│   ├── components/
│   │   ├── payment/PaymentModal.jsx (3-step, no-refund consent)
│   │   ├── AppLayout.jsx (with Parrainage nav + legal footer)
│   │   └── MatchCard.jsx, RealtimeBar.jsx
│   ├── pages/
│   │   ├── LandingPage.jsx (epic hero + testimonials section + referral banner)
│   │   ├── DashboardPage.jsx (epic greeting hero)
│   │   ├── ProfilePage.jsx (epic dark hero with tier crown)
│   │   ├── TrackRecordPage.jsx (emerald-orange epic hero)
│   │   ├── ParrainagePage.jsx (referral dashboard)
│   │   ├── LegalPage.jsx (4 docs)
│   │   └── ... (Combos, TopPicks, ValueBets, MatchDetail, Login, Register, Admin)
│   └── contexts/AuthContext.jsx (supports referral_code on register)
└── memory/ (PRD.md, test_credentials.md)
```

Last updated: Feb 2026
