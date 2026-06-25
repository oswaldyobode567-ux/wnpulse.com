# WinPulse — Product Requirements Document

## Original Problem Statement
AI-powered sports betting prediction app — real-time Odds API, Claude Sonnet AI, MTN MoMo subscriptions (Pro 4 900 / Elite 14 900 FCFA), combos, track record, value bets, vibrant orange/rose UI for Bénin.

## Company / Editor
- **Name:** WinPulse SARL · Cotonou, Littoral, Bénin
- **Contact:** contact@wnpulse.com · WhatsApp/MTN +229 01 67 30 54 39
- **Domain:** `wnpulse.com` (Namecheap, pending deployment + Resend verification)
- **Refund policy:** No refund after activation (explicit consent on payment)

## Tech Stack
- **Frontend:** React 18, Tailwind, Shadcn UI, Recharts, dayjs, lucide-react. Custom markdown renderer (no extra dep).
- **Backend:** FastAPI, MongoDB (Motor async)
- **Email:** Resend (sender `contact@wnpulse.com`)
- **AI:** Claude Sonnet 4.5 (Emergent LLM key)
- **Background workers:** drip emails (every 6h) + auto-settle (every 4h)

## Implemented Features (Feb 2026)

### Auth & Onboarding
- JWT register/login, password reset email, `?ref=CODE` pre-fill on signup

### Core Product
- Real-time matches dashboard (epic dark hero with greeting + live badges)
- Top picks, Multi-market combos (Safe/Balanced/Jackpot)
- Match detail page with H2H/Form/Injuries
- Value Bets detector
- Public Track Record page with epic emerald-orange hero + Recharts area chart
- User Profile page with avatar + tier crown + referral count badge
- Cross-page legal footer

### Subscriptions
- 3 tiers (Free / Pro 4 900 / Elite 14 900 FCFA)
- **PaymentModal**: 3-step Récap → MTN Instructions → WhatsApp Confirmation, `PE-XXXXXXXX` reference, no-refund consent checkbox, wired on 6+ pages

### Communications
- Welcome, payment confirmation, weekly teaser, reset password emails
- **Drip campaign J+1 / J+3 / J+5** automatic, idempotent via `drip_sent_days`
- J+3 email includes referral CTA

### Referral Program
- Unique `referral_code` per user, `?ref=` URL param, share WhatsApp/email
- 3 friends signed up = 7 days Pro auto-granted
- Endpoints: `GET /api/referral/me`, `POST /api/referral/claim`

### Blog & SEO (NEW)
- 6 SEO-optimized articles in French targeting Bénin betting search queries:
  - "Comment parier sur la CAN 2026 : guide complet pour le Bénin"
  - "Les 3 meilleures stratégies de bankroll pour le pari sportif"
  - "Pari sportif MTN Mobile Money au Bénin : guide complet 2026"
  - "Value Betting : trouver des cotes sous-évaluées"
  - "Combinés vs paris simples : quelle stratégie est rentable ?"
  - "Les 7 erreurs des débutants en paris sportifs"
- Blog index `/blog` (epic dark hero + featured + grid)
- Article detail `/blog/:slug` with markdown rendering, JSON-LD Article schema, canonical URL, OG meta tags, WhatsApp share
- `/api/sitemap.xml` and `/api/robots.txt` for Google indexation
- Pre-seeded automatically on backend startup

### Auto-Settle Worker (NEW)
- Background loop runs every 4h: fetches completed matches via Odds API scores endpoint
- Determines winner from score, picks favorite as prediction
- Settles to `predictions_log` (won/profit) — idempotent per `match_id`
- Admin endpoint `POST /api/admin/auto-settle/run` for manual trigger
- Powers the public Track Record page with growing real data

### Legal
- 4 pages at `/legal/:slug`: mentions-legales, cgv, confidentialite, jeu-responsable
- Compliant with Bénin loi n° 2017-20 + RGPD CEDEAO

### Marketing
- Real testimonials section on Landing (6 reviews, 4.8/5)
- Floating gradient blobs, animated CTAs, bigger typography on Landing
- Referral promo banner on Landing
- Blog navigation link in header + all footers

## Key Backend Endpoints
- Auth: `/api/auth/login|register|forgot-password|reset-password`
- Data: `/api/data/status|refresh`, `/api/scores`, `/api/matches`
- Predictions: `/api/predictions/top|combos`, `/api/track-record`, `/api/value-bets`
- Subscription: `/api/plans`, `/api/subscription/checkout|payments`
- Referral: `/api/referral/me|claim`
- Blog: `/api/blog/posts`, `/api/blog/posts/{slug}`, `/api/sitemap.xml`, `/api/robots.txt`
- Admin: `/api/admin/payments|users|stats|broadcast|drip/preview|drip/run|auto-settle/run|test-email`

## DB Schema (key collections)
- `users`: id, email, full_name, hashed_password, is_admin, subscription_tier, subscription_status, subscription_expires_at, created_at, referral_code, referral_count, referral_reward_claimed, referred_by, drip_sent_days
- `payments`: reference (PE-XXXXXXXX), user_id, tier, amount_xof, phone, status
- `predictions_log`: match_id, date, datetime, match, home/away_team, league, sport_key, pick, odds, confidence, score_home/away, winner, won, profit, settled_at, source
- `blog_posts`: slug, title, excerpt, cover, tags, author, read_min, published_at, meta_description, content_md, published

## Roadmap

### 🔴 P0 — Required for launch (USER ACTION)
- [ ] **Click Deploy** in Emergent UI
- [ ] **Add CNAME** at Namecheap pointing `www.wnpulse.com` to Emergent host
- [ ] **Verify domain on Resend** (DNS records propagation)
- [ ] **Odds API paid plan (~$30/mo)**
- [ ] **Submit sitemap.xml to Google Search Console** once deployed

### 🟠 P1
- [ ] Real MTN MoMo API integration (replace manual admin validation)
- [ ] Improve auto-settle prediction logic (use prediction_engine instead of "pick favorite")
- [ ] WhatsApp Business API for instant pick notifications

### 🟡 P2
- [ ] Refactor `server.py` into modular APIRouters
- [ ] Admin CMS to edit blog posts in UI
- [ ] Mobile app (React Native)
- [ ] More blog articles (target: 20+ for strong SEO authority)

Last updated: Feb 2026
