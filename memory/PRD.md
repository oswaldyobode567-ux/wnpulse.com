# WinPulse — Product Requirements Document

## Original Problem Statement
AI-powered sports betting prediction app — real-time Odds API, Claude Sonnet AI, MTN MoMo subscriptions (Pro 4 900 / Elite 14 900 FCFA), combos, track record, value bets, vibrant orange/rose UI for Bénin market.

## Company / Editor
- **Name:** WinPulse SARL · Cotonou, Littoral, Bénin
- **Contact:** contact@wnpulse.com
- **MTN MoMo (NOT a merchant account):** +229 01 66 28 06 03 — **KOUKPAKI VIANEY** (owner name must be verified before sending)
- **WhatsApp confirmation:** +229 01 60 48 39 57
- **Domain:** `wnpulse.com` (Namecheap, deployment pending)
- **Refund policy:** No refund after activation (explicit consent on payment)

## Admin Access
- **Email:** `oswaldyobode567@gmail.com`
- **Password:** `kirikou36`
- **Tier:** Elite + Admin (full access to all features)
- Seed mechanism resets this password on every backend restart (controlled by `ADMIN_RESET_PASSWORD=true` env var)

## Tech Stack
- **Frontend:** React 18, Tailwind, Shadcn UI, Recharts, dayjs, lucide-react
- **Backend:** FastAPI, MongoDB (Motor async)
- **Email:** Resend (sender `contact@wnpulse.com`)
- **AI:** Claude Sonnet 4.5 (Emergent LLM key)
- **Background workers:** drip emails (6h) + auto-settle (4h)

## Security Hardening (Feb 2026)
- CORS restricted to: `wnpulse.com`, `www.wnpulse.com`, preview Emergent, localhost
- Security headers on all responses: HSTS (1 year), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy
- Brute-force protection on login: 7 attempts max / 15 min / IP
- Bcrypt password hashing
- JWT 7-day tokens
- Sanitized email lookup (lowercase + trim) on register and login

## SEO Optimizations (Feb 2026)
- Full meta tags in `public/index.html`: title, description, keywords, robots, Open Graph, Twitter Card
- JSON-LD `Organization` schema with address + sameAs (WhatsApp)
- JSON-LD `WebSite` schema with SearchAction (sitelinks search box)
- JSON-LD `Article` schema on every blog post
- Canonical URLs on landing + blog posts
- `/api/sitemap.xml` with all static pages + blog posts
- `/api/robots.txt` allowing Googlebot, blocking `/app/` and `/admin`
- `<html lang="fr">` for proper language detection
- Preconnect to fonts, dns-prefetch to Unsplash
- Inter font 400/600/700/800/900 (proper weight range for headings)

## All Features Implemented
- **Auth**: JWT register/login, password reset, referral code on signup, brute-force protection
- **Dashboard**: epic dark hero with greeting + live confidence badges
- **Top Picks, Combos** (Safe/Balanced/Jackpot), **Match Detail** (FootyStat style), **Value Bets**, **Track Record** (epic hero + Recharts)
- **Profile**: avatar XXL + tier crown + referral count badge
- **Subscription**: PaymentModal 3-step (Récap → MTN with owner name verification → WhatsApp), `PE-XXXXXXXX` ref, no-refund consent checkbox
- **Drip emails**: J+1 / J+3 / J+5 idempotent
- **Referral program**: unique code, share WhatsApp/email, 3 friends = 7 days Pro
- **Auto-settle worker**: settles finished matches every 4h into `predictions_log`
- **Blog** (`/blog`): 6 SEO articles, epic dark hero, markdown rendering, JSON-LD, sitemap, robots.txt
- **Legal**: 4 pages (mentions-legales, cgv, confidentialite, jeu-responsable) conformes loi béninoise 2017-20
- **Admin Panel**: payments validation (1-click confirm/reject), stats (users, revenue, pending), broadcast picks, drip trigger, auto-settle trigger

## Key Backend Endpoints
- Auth: `/api/auth/login|register|forgot-password|reset-password`, `/api/auth/me`
- Data: `/api/data/status|refresh`, `/api/scores`, `/api/matches`
- Predictions: `/api/predictions/top|combos`, `/api/track-record`, `/api/value-bets`
- Subscription: `/api/plans`, `/api/subscription/checkout|payments`
- Referral: `/api/referral/me|claim`
- Blog: `/api/blog/posts`, `/api/blog/posts/{slug}`, `/api/sitemap.xml`, `/api/robots.txt`
- Admin: `/api/admin/payments|users|stats|broadcast|drip/preview|drip/run|auto-settle/run|test-email`, `/api/admin/payments/{ref}/confirm|reject`

## DB Schema
- `users`: id, email, full_name, hashed_password, is_admin, subscription_tier, subscription_status, subscription_expires_at, created_at, referral_code, referral_count, referral_reward_claimed, referred_by, drip_sent_days
- `payments`: reference (PE-XXXXXXXX), user_id, tier, amount_xof, phone, payer_name, status (pending/confirmed/rejected), created_at
- `predictions_log`: match_id, date, datetime, match, home/away_team, league, sport_key, pick, odds, confidence, score_home/away, winner, won, profit, settled_at, source
- `blog_posts`: slug, title, excerpt, cover, tags, author, read_min, published_at, meta_description, content_md, published

## Backlog / Roadmap

### 🔴 P0 — Required for launch (USER ACTION)
- [ ] Click Deploy in Emergent UI
- [ ] Configure CNAME at Namecheap (`www.wnpulse.com` → Emergent host)
- [ ] Finalize Resend domain verification (SPF DNS pending propagation)
- [ ] Submit `https://wnpulse.com/api/sitemap.xml` to Google Search Console

### 🟠 P1 — Future improvements
- [ ] Real MTN MoMo API (replace manual admin validation)
- [ ] Odds API paid plan ($30/mo)
- [ ] Improve auto-settle prediction logic (use prediction_engine instead of "pick favorite")
- [ ] WhatsApp Business API for instant notifications
- [ ] Admin CMS to edit blog posts in UI

### 🟡 P2
- [ ] Refactor `server.py` into modular APIRouters
- [ ] Mobile app (React Native)
- [ ] Floating WhatsApp customer service button

Last updated: Feb 2026 — All features ready for deployment.
