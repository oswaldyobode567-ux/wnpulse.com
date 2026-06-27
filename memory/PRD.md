# WinPulse — Product Requirements Document

## Original Problem Statement
AI-powered sports betting prediction app for Bénin market with Claude Sonnet AI, MTN MoMo payments, French UI, full SaaS readiness.

## Company / Editor
- **Name:** WinPulse SARL · Cotonou, Littoral, Bénin
- **Contact:** contact@wnpulse.com (✅ Resend verified Feb 2026 — emails delivered worldwide)
- **MTN MoMo (compte personnel):** +229 01 66 28 06 03 — KOUKPAKI VIANEY
- **WhatsApp Support:** +229 01 60 48 39 57
- **Domain:** wnpulse.com (Namecheap, deployment pending click)

## Admin
- Email: `oswaldyobode567@gmail.com`
- Password: `kirikou36`
- Tier: Elite + is_admin=True

## Tech Stack
- **Frontend:** React 18, Tailwind, Shadcn UI, Recharts, dayjs, lucide-react
- **Backend:** FastAPI, MongoDB (Motor async)
- **Email:** Resend (verified domain wnpulse.com)
- **AI:** Claude Sonnet 4.5
- **Analytics:** PostHog (already installed) + Google Analytics 4 placeholder + Facebook Pixel placeholder
- **Workers:** drip emails (6h) + auto-settle (4h)

## Security Hardening
- CORS restricted to wnpulse.com domains
- HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- Brute-force protection: 7 attempts max / 15 min / IP
- Bcrypt + JWT 7-day tokens

## SEO Stack (production-grade)
- `<html lang="fr">`, comprehensive meta tags
- Open Graph + Twitter Card on all pages
- JSON-LD: Organization, WebSite SearchAction, Article (blog), all proper schemas
- Canonical URLs on Landing + Blog posts
- `/api/sitemap.xml` (all pages + blog), `/api/robots.txt`
- Preconnect to fonts + DNS-prefetch
- Inter font with weights 400/600/700/800/900
- PageTracker component fires page_view to PostHog + GA4 on route change
- GSC verification meta tag placeholder ready

## All Features Implemented

### Auth & User
- JWT register/login, password reset, referral code on signup
- Brute-force protection, sanitized email lookup

### Core Product
- Real-time dashboard (epic hero), top picks, multi-market combos, match detail (H2H/Form/Injuries), value bets, track record (Recharts), profile

### Subscriptions
- 3 tiers (Free / Pro 4 900 / Elite 14 900 FCFA)
- PaymentModal 3-step with MTN owner name verification, PE-XXXXXXXX ref, no-refund consent

### Marketing & Growth
- Drip campaign J+1/J+3/J+5 (idempotent, 6h scheduler)
- Referral program: 3 friends signed up = 7 days Pro auto-granted
- Real testimonials section + landing redesign (gradient blobs, animated CTAs)

### Customer Support (NEW)
- **WhatsApp floating widget** present on every page with:
  - Pulsing green button (animated halo effect, z-index 10001)
  - In-app chatbot panel (380px desktop, fullscreen mobile)
  - 10 pre-built FAQ Q&A with contextual CTAs
  - Direct WhatsApp open with pre-filled messages
  - Body-scroll lock on mobile

### Blog & SEO
- 6 SEO-optimized French articles (CAN 2026, bankroll, MTN MoMo, value betting, combos vs simple, débutant errors)
- `/blog` epic dark hero, `/blog/:slug` with markdown rendering, JSON-LD Article, share buttons, related articles

### Auto-Settle Worker
- Background loop fetches finished matches via Odds API every 4h
- Settles to `predictions_log` with won/profit, idempotent per match_id
- Admin endpoint for manual trigger

### Analytics
- PostHog session recording (already in index.html)
- Google Analytics 4 placeholder (active by uncomment + GA4 ID)
- Facebook Pixel placeholder
- **PageTracker** auto-tracks route changes to both platforms
- Advanced admin stats: MRR, ARPU, conversion rate, new users last 7d, referral metrics, blog content count, predictions win rate

### Legal
- 4 pages: mentions-legales, cgv, confidentialite, jeu-responsable
- Compliant with Bénin loi 2017-20 + APDP

### Admin Panel
- 1-click payment confirmation/rejection
- User management
- Broadcast picks email
- Drip & auto-settle manual triggers
- Stats dashboard

## Key Backend Endpoints
- Auth: `/api/auth/{login,register,forgot-password,reset-password,me}`
- Data: `/api/data/{status,refresh}`, `/api/scores`, `/api/matches`
- Predictions: `/api/predictions/{top,combos}`, `/api/track-record`, `/api/value-bets`
- Subscription: `/api/plans`, `/api/subscription/{checkout,payments}`
- Referral: `/api/referral/{me,claim}`
- Blog/SEO: `/api/blog/posts`, `/api/blog/posts/{slug}`, `/api/sitemap.xml`, `/api/robots.txt`
- Admin: `/api/admin/{payments,users,stats,broadcast/*,drip/*,auto-settle/run}`, payments confirm/reject

## DB Schema
- `users`: id, email, full_name, hashed_password, is_admin, subscription_tier, subscription_status, subscription_expires_at, created_at, referral_code, referral_count, referral_reward_claimed, referred_by, drip_sent_days
- `payments`: reference (PE-XXXXXXXX), user_id, tier, amount_xof, phone, payer_name, status, created_at
- `predictions_log`: match_id, date, datetime, match, home/away_team, league, sport_key, pick, odds, confidence, score_home/away, winner, won, profit, settled_at, source
- `blog_posts`: slug, title, excerpt, cover, tags, author, read_min, published_at, meta_description, content_md, published

## Backlog

### 🔴 P0 — User actions to launch
- [ ] Click Deploy in Emergent
- [ ] Configure CNAME at Namecheap (`www.wnpulse.com` → Emergent host + URL Redirect for `@`)
- [ ] Submit sitemap to Google Search Console
- [ ] (Optional) Activate GA4 by uncommenting in index.html + adding GA4 ID

### 🟠 P1
- [ ] Real MTN MoMo API
- [ ] Odds API paid plan
- [ ] Admin CMS to edit blog posts

### 🟡 P2
- [ ] Refactor server.py into APIRouters
- [ ] Mobile app (React Native)

Last updated: Feb 2026 — SaaS production-ready.
