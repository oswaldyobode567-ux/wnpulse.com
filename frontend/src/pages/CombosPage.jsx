import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Check, ChevronDown, Clock, Copy, Gift, CalendarDays, Info, Layers, Loader2, Lock, RefreshCw, Rocket, Scale, Shield, Sparkles, X } from "lucide-react";
import api from "@/lib/api";
import AppLayout, { usePageLanguage } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
const COMBOS_STYLES = `/* Scoped styles independent of generated Tailwind utility classes. */
.wp3-combos {
  --wp3-ink: #142033;
  --wp3-muted: #55657a;
  --wp3-orange: #ea580c;
  --wp3-line: #e3e8ef;
  width: 100%; max-width: 1280px; margin: 0 auto; padding: 32px 24px 56px;
  color: var(--wp3-ink); font-size: 16px; line-height: 1.6;
}
.wp3-combos *, .wp3-combos *::before, .wp3-combos *::after { box-sizing: border-box; }
.wp3-combos h1, .wp3-combos h2, .wp3-combos h3, .wp3-combos p, .wp3-combos dl, .wp3-combos dd { margin: 0; }
.wp3-combos button, .wp3-combos textarea { font: inherit; }
.wp3-combos button { cursor: pointer; }
.wp3-combos svg { width: 20px; height: 20px; flex-shrink: 0; }
.wp3-combos a { text-decoration: none; }
.wp3-combos :is(button, a, summary, textarea):focus-visible { outline: 3px solid #ea580c; outline-offset: 4px; }
.wp3-combos :is(h1, h2, h3, p, dt, dd, span, strong, b) { overflow-wrap: anywhere; }
.wp3-combos .wp3-hero {
  position: relative; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) 280px;
  gap: 32px; padding: 42px; border-radius: 30px; color: #fff;
  background: radial-gradient(ellipse at 100% 0%, #734125 0%, transparent 55%), linear-gradient(135deg, #121c2c, #17283b);
  box-shadow: 0 18px 40px rgb(20 32 51 / 12%);
}
.wp3-combos .wp3-hero-eyebrow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; color: #fdba74; font-size: 14px; font-weight: 800; letter-spacing: .1em; }
.wp3-combos .wp3-hero h1 { margin-top: 20px; font-size: clamp(36px, 4.5vw, 58px); font-weight: 850; line-height: 1.08; letter-spacing: -.045em; }
.wp3-combos .wp3-hero h1 span { color: #ffad67; }
.wp3-combos .wp3-hero-description { max-width: 590px; margin-top: 22px; color: #e0e7f0; font-size: 18px; line-height: 1.65; }
.wp3-combos .wp3-hero-meta { display: flex; flex-wrap: wrap; gap: 12px 22px; margin-top: 26px; font-size: 14px; color: #d4dfec; }
.wp3-combos .wp3-hero-meta span { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.wp3-combos .wp3-hero-side { display: flex; flex-direction: column; justify-content: center; gap: 18px; min-width: 0; }
.wp3-combos .wp3-hero-profile { padding: 22px; border: 1px solid rgb(255 255 255 / 18%); border-radius: 20px; background: rgb(255 255 255 / 7%); }
.wp3-combos .wp3-hero-profile > span { font-size: 14px; color: #d4dfec; }
.wp3-combos .wp3-hero-profile > strong { display: block; font-size: 32px; line-height: 1.2; margin: 7px 0 10px; }
.wp3-combos .wp3-hero-profile p { color: #d4dfec; font-size: 16px; }
.wp3-combos .wp3-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 48px; height: auto; padding: 12px 18px; border: 1px solid transparent; border-radius: 12px;
  white-space: normal; font-size: 16px; line-height: 1.45; font-weight: 750; text-align: center;
  transition: background-color .15s, border-color .15s; max-width: 100%;
}
.wp3-combos .wp3-button:disabled { cursor: not-allowed; opacity: .65; }
.wp3-combos .wp3-button--primary { background: #c2410c; color: #fff; }
.wp3-combos .wp3-button--primary:hover:not(:disabled) { background: #9a3412; }
.wp3-combos .wp3-button--light { background: #fff; border-color: #d9e1e9; color: #142033; }
.wp3-combos .wp3-button--light:hover:not(:disabled) { background: #fff7ed; border-color: #fb923c; }
.wp3-combos .wp3-button--hero { background: #ffad67; color: #172033; width: 100%; }
.wp3-combos .wp3-profile-section { margin: 36px 0 30px; }
.wp3-combos .wp3-section-heading { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 20px; margin-bottom: 20px; }
.wp3-combos .wp3-section-heading > div { min-width: 0; }
.wp3-combos .wp3-eyebrow { color: #9a3412; font-size: 14px; font-weight: 800; letter-spacing: .065em; line-height: 1.5; }
.wp3-combos .wp3-section-heading h2 { margin-top: 7px; font-size: 26px; font-weight: 800; line-height: 1.25; letter-spacing: -.025em; }
.wp3-combos .wp3-section-heading p:not(.wp3-eyebrow) { margin-top: 8px; font-size: 16px; color: var(--wp3-muted); }
.wp3-combos .wp3-section-heading p.wp3-first-start { font-size: 14px; }
.wp3-combos .wp3-profile-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.wp3-combos .wp3-profile { position: relative; min-width: 0; background: #fff; border: 2px solid var(--wp3-line); border-radius: 22px; padding: 22px; text-align: start; color: var(--wp3-ink); }
.wp3-combos .wp3-profile-top { display: flex; align-items: center; gap: 12px; }
.wp3-combos .wp3-profile-icon { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 14px; background: #fff2e8; color: #c2410c; }
.wp3-combos .wp3-profile-icon svg { width: 25px; height: 25px; }
.wp3-combos .wp3-profile-index { margin-inline-start: auto; color: #64748b; font-weight: 800; font-size: 18px; }
.wp3-combos .wp3-profile-title { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 18px; }
.wp3-combos .wp3-profile-title strong { font-size: 24px; font-weight: 850; }
.wp3-combos .wp3-profile > p { margin-top: 8px; color: var(--wp3-muted); font-size: 16px; line-height: 1.6; }
.wp3-combos .wp3-profile-stats { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--wp3-line); font-size: 14px; }
.wp3-combos .wp3-profile-stats b { display: flex; align-items: center; gap: 6px; }
.wp3-combos .wp3-profile-stats svg { width: 16px; height: 16px; }
.wp3-combos .wp3-profile--emerald .wp3-profile-icon { background: #ecfdf5; color: #047857; }
.wp3-combos .wp3-profile--rose .wp3-profile-icon { background: #fff1f2; color: #be123c; }
.wp3-combos .wp3-profile--selected { background: #142033; color: #fff; border-color: #f97316; box-shadow: 0 8px 22px rgb(20 32 51 / 14%); }
.wp3-combos .wp3-profile--selected > p, .wp3-combos .wp3-profile--selected .wp3-profile-index { color: #d4dfec; }
.wp3-combos .wp3-profile--selected .wp3-profile-stats { border-color: #435268; }
.wp3-combos .wp3-selected-check { color: #fdba74; }
.wp3-combos .wp3-free-label { color: #065f46; background: #d1fae5; border-radius: 20px; padding: 3px 10px; font-size: 14px; font-weight: 700; }
.wp3-combos :is(.wp3-comparison, .wp3-reading, .wp3-explanation) summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 15px 18px; font-weight: 750; font-size: 16px; line-height: 1.5; }
.wp3-combos summary::-webkit-details-marker { display: none; }
.wp3-combos summary svg:last-child { margin-inline-start: auto; transition: transform .15s; }
.wp3-combos details[open] > summary svg:last-child { transform: rotate(180deg); }
.wp3-combos .wp3-comparison { margin-top: 18px; border: 1px solid var(--wp3-line); border-radius: 16px; background: #fff; }
.wp3-combos .wp3-compare-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 0 18px 18px; }
.wp3-combos .wp3-compare-card { padding: 18px; border-radius: 14px; background: #f6f8fb; min-width: 0; }
.wp3-combos .wp3-compare-card h3 { font-size: 20px; margin-bottom: 15px; }
.wp3-combos .wp3-compare-card .wp3-button { width: 100%; margin-top: 16px; }
.wp3-combos .wp3-comparison-note { padding: 0 18px 18px; font-size: 14px; color: var(--wp3-muted); }
.wp3-combos .wp3-main { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 28px; align-items: start; }
.wp3-combos .wp3-selections, .wp3-combos .wp3-sidebar { min-width: 0; }
.wp3-combos .wp3-sidebar { position: sticky; top: 24px; scroll-margin-top: 90px; }
.wp3-combos .wp3-match-list { display: grid; gap: 20px; }
.wp3-combos .wp3-match-card { min-width: 0; background: #fff; border: 1px solid var(--wp3-line); border-radius: 22px; padding: 24px; box-shadow: 0 5px 16px rgb(20 32 51 / 4%); }
.wp3-combos .wp3-match-top { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px; }
.wp3-combos .wp3-selection-number { display: grid; place-items: center; min-width: 38px; height: 38px; border-radius: 11px; background: #142033; color: #fff; font-size: 16px; font-weight: 800; }
.wp3-combos .wp3-match-meta { flex: 1 1 180px; min-width: 0; }
.wp3-combos .wp3-match-meta > p { font-size: 16px; line-height: 1.55; font-weight: 700; }
.wp3-combos .wp3-match-meta > div { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 5px; font-size: 14px; color: var(--wp3-muted); }
.wp3-combos .wp3-match-meta > div > span { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.wp3-combos .wp3-match-meta svg { width: 16px; height: 16px; }
.wp3-combos .wp3-country { border: 1px solid #e3e8ef; border-radius: 20px; padding: 0 8px; color: #42536b; }
.wp3-combos .wp3-risk { display: inline-flex; align-items: center; max-width: 100%; border-radius: 20px; padding: 4px 10px; font-size: 14px; font-weight: 750; border: 1px solid #d9e1e9; background: #f6f8fb; color: #42536b; }
.wp3-combos .wp3-risk--safe { color: #065f46; background: #ecfdf5; border-color: #a7f3d0; }
.wp3-combos .wp3-risk--moderate { color: #854d0e; background: #fefce8; border-color: #fde68a; }
.wp3-combos .wp3-risk--risky { color: #9f1239; background: #fff1f2; border-color: #fecdd3; }
.wp3-combos .wp3-fixture { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 20px; align-items: start; margin-top: 24px; }
.wp3-combos .wp3-date-stamp { display: flex; flex-direction: column; align-items: center; text-align: center; border: 1px solid var(--wp3-line); border-radius: 14px; background: #f6f8fb; padding: 12px 7px; color: #42536b; font-size: 14px; line-height: 1.5; min-width: 0; }
.wp3-combos .wp3-date-stamp strong { font-size: 28px; font-weight: 850; line-height: 1.1; color: #142033; }
.wp3-combos .wp3-date-stamp b { margin-top: 7px; border-top: 1px solid #dce3ec; padding-top: 7px; width: 100%; font-size: 14px; color: #142033; }
.wp3-combos .wp3-team-pair { min-width: 0; }
.wp3-combos .wp3-team-pair p { font-size: 23px; font-weight: 800; line-height: 1.35; letter-spacing: -.015em; }
.wp3-combos .wp3-team-pair > span { display: block; font-size: 14px; color: #55657a; padding: 5px 0; }
.wp3-combos .wp3-pick-grid { display: grid; grid-template-columns: minmax(0, 1fr) 100px; margin-top: 24px; border: 1px solid #fed7aa; border-radius: 15px; background: #fff7ed; overflow: hidden; }
.wp3-combos .wp3-pick { min-width: 0; border-left: 4px solid #ea580c; padding: 16px 18px; }
.wp3-combos .wp3-pick p { margin-top: 7px; font-size: 22px; line-height: 1.4; font-weight: 800; }
.wp3-combos .wp3-leg-odds { min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: #ffedd5; padding: 14px 10px; }
.wp3-combos .wp3-leg-odds > span { font-size: 14px; color: #9a3412; font-weight: 700; }
.wp3-combos .wp3-leg-odds strong { color: #9a3412; font-size: 28px; line-height: 1.3; font-weight: 850; }
.wp3-combos .wp3-confidence { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 14px; padding: 14px 0 0; color: #55657a; font-size: 16px; }
.wp3-combos .wp3-confidence strong { color: #142033; font-size: 18px; }
.wp3-combos .wp3-explanation { border: 1px solid var(--wp3-line); border-radius: 12px; margin-top: 20px; }
.wp3-combos .wp3-explanation > div { border-top: 1px solid var(--wp3-line); padding: 16px 18px; }
.wp3-combos :is(.wp3-explanation, .wp3-reading) p { color: #55657a; font-size: 16px; line-height: 1.7; }
.wp3-combos :is(.wp3-explanation, .wp3-reading) p + p { margin-top: 12px; }
.wp3-combos .wp3-match-link { min-height: 48px; display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 12px; color: #c2410c; font-size: 16px; font-weight: 750; }
.wp3-combos .wp3-view-switch { display: inline-flex; gap: 4px; padding: 4px; border: 1px solid var(--wp3-line); border-radius: 12px; background: #fff; }
.wp3-combos .wp3-view-switch button { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 14px; min-height: 44px; border: 0; border-radius: 9px; color: #55657a; background: transparent; font-size: 16px; font-weight: 700; }
.wp3-combos .wp3-view-switch button[aria-pressed="true"] { background: #142033; color: #fff; }
.wp3-combos .wp3-view-switch svg { width: 18px; height: 18px; }
.wp3-combos .wp3-agenda .wp3-match-card { border-left: 4px solid #ea580c; }
.wp3-combos .wp3-agenda .wp3-date-stamp { background: #fff7ed; border-color: #fed7aa; }
.wp3-combos .wp3-ticket { position: relative; border: 1px solid #d9e1e9; border-radius: 22px; background: #fff; overflow: hidden; box-shadow: 0 12px 28px rgb(20 32 51 / 8%); }
.wp3-combos .wp3-ticket > header { padding: 24px; background: #142033; color: #fff; }
.wp3-combos .wp3-ticket > header .wp3-eyebrow { color: #fdba74; }
.wp3-combos .wp3-ticket h2 { font-size: 25px; font-weight: 800; line-height: 1.3; margin-top: 8px; }
.wp3-combos .wp3-ticket header > span { display: block; margin-top: 8px; font-size: 14px; color: #d4dfec; }
.wp3-combos .wp3-ticket-rows { padding: 22px 22px 4px; }
.wp3-combos .wp3-ticket-row { display: flex; gap: 10px; padding-bottom: 16px; }
.wp3-combos .wp3-ticket-row > b { display: grid; place-items: center; height: 25px; min-width: 25px; margin-top: 3px; border-radius: 50%; background: #fff2e8; color: #c2410c; font-size: 14px; }
.wp3-combos .wp3-ticket-row > div { min-width: 0; }
.wp3-combos .wp3-ticket-row p { font-size: 16px; font-weight: 750; line-height: 1.55; }
.wp3-combos .wp3-ticket-row p > span { color: #55657a; font-weight: 500; }
.wp3-combos .wp3-ticket-row div > span { display: block; margin-top: 5px; font-size: 14px; color: #9a3412; }
.wp3-combos .wp3-ticket-total { padding: 24px 22px; border-top: 2px dashed #d9e1e9; border-bottom: 2px dashed #d9e1e9; background: #fff7ed; }
.wp3-combos .wp3-ticket-total > span { font-size: 16px; font-weight: 700; color: #9a3412; }
.wp3-combos .wp3-ticket-total > strong { display: block; margin: 5px 0; font-size: 48px; line-height: 1.15; letter-spacing: -.025em; color: #9a3412; font-weight: 850; }
.wp3-combos .wp3-ticket-total > strong.wp3-reserved { font-size: 26px; }
.wp3-combos .wp3-ticket-total p { margin-top: 10px; font-size: 14px; color: #78513a; line-height: 1.65; }
.wp3-combos .wp3-ticket-bottom { padding: 24px 22px; }
.wp3-combos .wp3-metric { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: start; gap: 5px 12px; margin-top: 13px; }
.wp3-combos .wp3-metric:first-child { margin-top: 0; }
.wp3-combos .wp3-metric dt { color: #55657a; font-size: 16px; line-height: 1.55; flex: 1 1 130px; }
.wp3-combos .wp3-metric dd { font-size: 18px; font-weight: 800; color: #142033; }
.wp3-combos .wp3-ticket-bottom > .wp3-button { width: 100%; min-height: 52px; margin-top: 22px; }
.wp3-combos .wp3-copy-help { margin-top: 12px; font-size: 14px; color: #55657a; line-height: 1.65; }
.wp3-combos .wp3-reading { margin-top: 20px; border: 1px solid var(--wp3-line); border-radius: 16px; background: #fff; }
.wp3-combos .wp3-reading > div { padding: 0 18px 18px; }
.wp3-combos .wp3-alert { display: flex; align-items: flex-start; gap: 12px; margin: 20px 0; padding: 18px; border: 1px solid #fcd34d; border-radius: 15px; background: #fffbeb; color: #854d0e; font-size: 16px; line-height: 1.65; }
.wp3-combos .wp3-alert > svg { margin-top: 3px; }
.wp3-combos .wp3-alert > div { min-width: 0; }
.wp3-combos .wp3-alert p + p { margin-top: 8px; }
.wp3-combos .wp3-alert .wp3-button { margin-top: 12px; }
.wp3-combos .wp3-alert--compact { font-size: 14px; margin: 14px 0 0; padding: 10px 12px; }
.wp3-combos .wp3-loading, .wp3-combos .wp3-state { border: 1px solid var(--wp3-line); border-radius: 22px; background: #fff; text-align: center; padding: 42px 24px; }
.wp3-combos :is(.wp3-loading, .wp3-state) > svg { width: 34px; height: 34px; color: #c2410c; margin: 0 auto 18px; }
.wp3-combos :is(.wp3-loading, .wp3-state) h2 { font-size: 25px; line-height: 1.3; font-weight: 800; }
.wp3-combos :is(.wp3-loading, .wp3-state) p { max-width: 550px; margin: 12px auto 0; font-size: 16px; color: #55657a; }
.wp3-combos .wp3-state .wp3-button { margin-top: 22px; }
.wp3-combos .wp3-skeleton-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 30px; }
.wp3-combos .wp3-skeleton-grid > div { height: 110px; border-radius: 16px; background: #eef2f7; }
.wp3-combos .wp3-upgrade { display: flex; align-items: flex-start; gap: 26px; padding: 36px; border-radius: 24px; border: 1px solid #fed7aa; background: linear-gradient(130deg, #fff7ed, #fff); }
.wp3-combos .wp3-upgrade-icon { display: grid; place-items: center; width: 76px; height: 76px; flex-shrink: 0; border-radius: 22px; background: #142033; color: #fdba74; }
.wp3-combos .wp3-upgrade-icon svg { width: 30px; height: 30px; }
.wp3-combos .wp3-upgrade h2 { margin: 8px 0 14px; font-size: 30px; font-weight: 800; line-height: 1.25; }
.wp3-combos .wp3-upgrade p:not(.wp3-eyebrow) { max-width: 640px; font-size: 17px; color: #55657a; }
.wp3-combos .wp3-upgrade .wp3-button { margin-top: 24px; }
.wp3-combos .wp3-free-banner { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 14px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 16px; padding: 20px; margin-bottom: 24px; color: #065f46; }
.wp3-combos .wp3-free-banner > div { flex: 1 1 220px; }
.wp3-combos .wp3-free-banner strong { font-size: 18px; }
.wp3-combos .wp3-free-banner p { font-size: 16px; margin-top: 5px; }
.wp3-combos .wp3-locked-pick { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 14px; padding: 18px; background: #fff7ed; border-radius: 15px; margin-top: 24px; }
.wp3-combos .wp3-locked-pick > svg { color: #c2410c; margin-top: 3px; }
.wp3-combos .wp3-locked-pick > div { flex: 1 1 180px; min-width: 0; }
.wp3-combos .wp3-locked-pick p { font-size: 15px; color: #55657a; margin-top: 7px; }
.wp3-combos .wp3-manual-copy { margin-top: 20px; border: 1px solid var(--wp3-line); border-radius: 16px; background: #fff; padding: 18px; }
.wp3-combos .wp3-manual-copy > div { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-weight: 750; }
.wp3-combos .wp3-manual-copy button { display: grid; place-items: center; min-height: 44px; min-width: 44px; border: 0; border-radius: 10px; background: #f6f8fb; color: #42536b; }
.wp3-combos .wp3-manual-copy textarea { width: 100%; min-height: 280px; margin-top: 12px; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; font-size: 16px; line-height: 1.65; color: #142033; resize: vertical; }
.wp3-combos .wp3-manual-copy p { font-size: 14px; color: #55657a; margin-top: 10px; }
.wp3-combos .wp3-refresh-note { display: flex; align-items: center; gap: 8px; margin-top: 22px; font-size: 14px; color: #55657a; }
.wp3-combos .wp3-mobile-summary { display: none; }
.wp3-combos .wp3-spinning { animation: wp3-spin 1s linear infinite; }
@keyframes wp3-spin { to { transform: rotate(360deg); } }
@media (max-width: 1100px) {
  .wp3-combos .wp3-main { grid-template-columns: minmax(0, 1fr) 310px; gap: 20px; }
  .wp3-combos .wp3-hero { padding: 32px; gap: 24px; grid-template-columns: minmax(0, 1fr) 250px; }
}
@media (max-width: 900px) {
  .wp3-combos .wp3-main { grid-template-columns: minmax(0, 1fr); }
  .wp3-combos .wp3-sidebar { position: static; }
  .wp3-combos .wp3-mobile-summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid #fed7aa; border-radius: 15px; background: #fff7ed; padding: 16px 18px; margin: 0 0 20px; color: #9a3412; font-size: 16px; }
  .wp3-combos .wp3-mobile-summary > span:first-child { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .wp3-combos .wp3-mobile-summary strong { font-size: 26px; }
  .wp3-combos .wp3-mobile-summary > span:last-child { display: flex; align-items: center; gap: 6px; font-weight: 700; }
}
@media (max-width: 760px) {
  .wp3-combos { padding: 20px 16px 40px; }
  .wp3-combos .wp3-hero { grid-template-columns: minmax(0, 1fr); padding: 28px 24px; border-radius: 24px; }
  .wp3-combos .wp3-hero h1 { font-size: 40px; }
  .wp3-combos .wp3-hero-description { font-size: 17px; }
  .wp3-combos .wp3-hero-side { gap: 12px; }
  .wp3-combos .wp3-hero-profile { padding: 16px 18px; }
  .wp3-combos .wp3-hero-profile strong { font-size: 26px; }
  .wp3-combos .wp3-profile-grid, .wp3-combos .wp3-compare-grid { grid-template-columns: minmax(0, 1fr); }
  .wp3-combos .wp3-profile { padding: 20px; }
  .wp3-combos .wp3-profile { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 5px 12px; }
  .wp3-combos .wp3-profile-top { grid-column: 1; grid-row: 1 / 3; align-items: flex-start; }
  .wp3-combos .wp3-profile-index { display: none; }
  .wp3-combos .wp3-selected-check { position: absolute; top: 22px; inset-inline-end: 18px; }
  .wp3-combos .wp3-profile-title { grid-column: 2; margin-top: 0; padding-inline-end: 20px; }
  .wp3-combos .wp3-profile-title strong { font-size: 22px; }
  .wp3-combos .wp3-profile > p { grid-column: 2; margin-top: 0; }
  .wp3-combos .wp3-profile-stats { grid-column: 1 / -1; }
  .wp3-combos .wp3-profile-stats { margin-top: 14px; padding-top: 12px; }
  .wp3-combos .wp3-section-heading h2 { font-size: 24px; }
  .wp3-combos .wp3-upgrade { flex-direction: column; padding: 24px; }
  .wp3-combos .wp3-upgrade h2 { font-size: 28px; }
  .wp3-combos .wp3-free-banner .wp3-button, .wp3-combos .wp3-upgrade .wp3-button { width: 100%; }
}
@media (max-width: 480px) {
  .wp3-combos { padding: 16px 12px 32px; }
  .wp3-combos .wp3-hero { padding: 26px 20px; }
  .wp3-combos .wp3-hero h1 { font-size: 36px; }
  .wp3-combos .wp3-hero-description { font-size: 16px; }
  .wp3-combos .wp3-match-card { padding: 18px; border-radius: 18px; }
  .wp3-combos .wp3-match-meta { flex-basis: 160px; }
  .wp3-combos .wp3-match-top > .wp3-risk { margin-inline-start: 50px; }
  .wp3-combos .wp3-fixture { grid-template-columns: 62px minmax(0, 1fr); gap: 14px; }
  .wp3-combos .wp3-date-stamp { padding: 10px 4px; }
  .wp3-combos .wp3-date-stamp strong { font-size: 25px; }
  .wp3-combos .wp3-team-pair p { font-size: 21px; }
  .wp3-combos .wp3-pick-grid { grid-template-columns: minmax(0, 1fr); }
  .wp3-combos .wp3-pick { padding: 16px; }
  .wp3-combos .wp3-pick p { font-size: 21px; }
  .wp3-combos .wp3-leg-odds { flex-direction: row; justify-content: space-between; gap: 12px; padding: 10px 16px; }
  .wp3-combos .wp3-leg-odds strong { font-size: 30px; }
  .wp3-combos .wp3-view-switch { width: 100%; }
  .wp3-combos .wp3-view-switch button { flex: 1 1 0; min-width: 0; padding: 10px 8px; }
  .wp3-combos .wp3-skeleton-grid { grid-template-columns: minmax(0, 1fr); }
  .wp3-combos .wp3-ticket > header, .wp3-combos .wp3-ticket-bottom, .wp3-combos .wp3-ticket-total { padding: 22px; }
  .wp3-combos .wp3-reading summary, .wp3-combos .wp3-explanation summary { padding-inline-start: 14px; padding-inline-end: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .wp3-combos *, .wp3-combos *::before, .wp3-combos *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;
const TIERS = [{
  key: "safe",
  label: "Sécurité",
  icon: Shield,
  accent: "emerald",
  description: "Le profil prudent, à examiner sélection par sélection."
}, {
  key: "balanced",
  label: "Équilibre",
  icon: Scale,
  accent: "orange",
  description: "Un profil intermédiaire pour comparer les cotes et la confiance."
}, {
  key: "jackpot",
  label: "Jackpot",
  icon: Rocket,
  accent: "rose",
  description: "Le profil offensif : une cote élevée implique davantage d’incertitude."
}];
const FRESH_FOR_MS = 5 * 60 * 1000;
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function number(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\s*-?\d+(?:[.,]\d+)?\s*$/.test(value)) return null;
  const result = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(result) ? result : null;
}
function percentage(value) {
  const result = number(value);
  return result !== null && result >= 0 && result <= 100 ? result : null;
}
function odds(value) {
  const result = number(value);
  return result !== null && result > 1 ? result : null;
}
function formatNumber(i18n, value, digits = 2) {
  return value === null ? "—" : new Intl.NumberFormat(i18n.locale, {
    maximumFractionDigits: digits
  }).format(value);
}
function dateValue(value) {
  if (typeof value !== "string" || !value.includes("T")) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}
function dateLabel(i18n, value) {
  const date = dateValue(value);
  return date === null ? "Horaire non communiqué" : new Intl.DateTimeFormat(i18n.locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}
function paidAccount(account, now = Date.now()) {
  if (!object(account)) return false;
  if (account.is_admin === true) return true;
  const tier = text(account.subscription, text(account.subscription_tier)).toLowerCase();
  if (!tier || ["free", "none", "expired", "inactive", "null", "undefined"].includes(tier)) return false;
  if (account.subscription_expires_at) {
    const expiration = dateValue(account.subscription_expires_at);
    if (expiration === null || expiration <= now) return false;
  }
  return true;
}
function normalizeCombos(payload) {
  if (!object(payload)) throw new Error("INVALID_COMBOS");
  if (Object.keys(payload).length && !TIERS.some(tier => Object.prototype.hasOwnProperty.call(payload, tier.key))) throw new Error("INVALID_COMBOS");
  const result = {};
  for (const tier of TIERS) {
    const raw = payload[tier.key];
    if (raw === null || raw === undefined) {
      result[tier.key] = null;
      continue;
    }
    if (!object(raw) || raw.legs !== undefined && raw.legs !== null && !Array.isArray(raw.legs)) throw new Error("INVALID_COMBOS");
    result[tier.key] = {
      label: text(raw.label, tier.label),
      tagline: text(raw.tagline),
      description: text(raw.description),
      total_odds: odds(raw.total_odds),
      avg_confidence: percentage(raw.avg_confidence),
      combined_probability: percentage(raw.combined_probability),
      unlocked_for_free: raw.unlocked_for_free === true,
      locked: raw.locked === true || payload.access?.is_paid === false && raw.unlocked_for_free !== true,
      legs: (raw.legs || []).map((row, index) => {
        const leg = object(row) ? row : {};
        const identifier = leg.match_id ?? leg.id;
        return {
          match_id: ["string", "number"].includes(typeof identifier) ? String(identifier) : "",
          key: `${identifier ?? "missing"}-${index}`,
          home_team: text(leg.home_team),
          away_team: text(leg.away_team),
          sport_title: text(leg.sport_title),
          league: text(leg.league_name, text(leg.league)),
          country: text(leg.country_name, text(leg.country)),
          commence_time: dateValue(leg.commence_time) === null ? null : leg.commence_time,
          completed: leg.completed === true || leg.is_finished === true,
          pick: text(leg.pick),
          pick_odds: odds(leg.pick_odds),
          market_label: text(leg.market_label),
          market: text(leg.market),
          pick_point: number(leg.pick_point),
          label: text(leg.label),
          confidence: percentage(leg.confidence),
          locked: leg.locked === true
        };
      })
    };
  }
  return result;
}
function unlockedTier(combo, account, now) {
  return Boolean(combo && !combo.locked && (combo.unlocked_for_free || paidAccount(account, now)));
}
function legStatus(leg, now) {
  if (leg.completed) return "finished";
  const date = dateValue(leg.commence_time);
  return date === null ? "unknown" : date <= now ? "started" : "upcoming";
}
function completeTicket(combo, account, now, loadedAt) {
  return Boolean(unlockedTier(combo, account, now) && combo.legs.length >= 2 && loadedAt !== null && now - loadedAt >= 0 && now - loadedAt < FRESH_FOR_MS && combo.legs.every(leg => !leg.locked && leg.home_team && leg.away_team && leg.pick && leg.pick_odds !== null && legStatus(leg, now) === "upcoming"));
}
function ticketText(i18n, combo) {
  return [i18n.t("WNPulse \xB7 Combin\xE9 {{v0}}", {
    v0: combo.label
  }), i18n.t("Horaires : {{v0}}", {
    v0: Intl.DateTimeFormat().resolvedOptions().timeZone || i18n.t("heure locale du navigateur")
  }), ...combo.legs.map((leg, index) => [i18n.t("{{v0}}. {{v1}} vs {{v2}}", {
    v0: index + 1,
    v1: leg.home_team,
    v2: leg.away_team
  }), [leg.league || leg.sport_title, i18n.tx(leg.country)].filter(Boolean).join(" · "), dateLabel(i18n, leg.commence_time), [i18n.bet(leg.market_label), i18n.bet(leg.pick)].filter(Boolean).join(" : "), i18n.t("Cote : {{v0}}", {
    v0: formatNumber(i18n, leg.pick_odds)
  })].filter(Boolean).join("\n")), combo.total_odds !== null ? i18n.t("Cote totale du moteur : {{v0}}", {
    v0: formatNumber(i18n, combo.total_odds)
  }) : i18n.t("Cote totale non communiquée"), i18n.t("Sélections et cotes à vérifier avant le début des rencontres.")].join("\n\n");
}
function loadError(i18n, failure) {
  if (failure?.message === "INVALID_COMBOS" || failure?.message === "INVALID_ACCOUNT") return i18n.t("Les données reçues sont incomplètes. Réessaie pour obtenir une sélection valide.");
  if (["ECONNABORTED", "ETIMEDOUT"].includes(failure?.code)) return i18n.t("Le serveur met trop de temps à répondre. Tu peux réessayer.");
  if (failure?.response?.status === 429) return i18n.t("Les actualisations sont temporairement limitées. Réessaie dans quelques instants.");
  return i18n.t("Impossible d’actualiser les combinés pour le moment. Réessaie dans quelques instants.");
}
function chronologicalLegs(combo, viewMode) {
  const rows = (combo?.legs || []).map((leg, index) => ({
    leg,
    index
  }));
  return viewMode === "agenda" ? rows.sort((a, b) => (dateValue(a.leg.commence_time) ?? Infinity) - (dateValue(b.leg.commence_time) ?? Infinity) || a.index - b.index) : rows;
}
function explainMarket(i18n, leg) {
  const normalized = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const market = normalized(`${leg.market} ${leg.market_label}`),
    pick = normalized(leg.pick);
  if (/double.?chance/.test(market)) return i18n.t("Deux issues sont couvertes : celles indiquées par la sélection. Vérifie la période à laquelle le marché s’applique.");
  if (/draw_no_bet|nul rembourse/.test(market)) return i18n.t("Le choix porte sur une victoire. En cas de nul sur la période couverte, le règlement de ce marché prévoit le remboursement.");
  if (/btts|equipes marquent/.test(market)) return i18n.t("Le pari concerne le fait que les deux équipes marquent, ou non, pendant la période couverte par le marché.");
  if (/handicap|spreads/.test(market)) return i18n.t("Le résultat est évalué après application du handicap indiqué. La ligne et la période du marché déterminent le règlement.");
  if (/total/.test(market) || /moins de|plus de|over|under/.test(pick)) {
    const values = leg.pick.match(/\d+(?:[.,]\d+)?/g);
    const threshold = leg.pick_point ?? (values?.length ? number(values[values.length - 1]) : null);
    if (threshold !== null && threshold % 1 === 0.5) {
      if (/moins de|under/.test(pick)) return i18n.t("Le total doit rester inf\xE9rieur \xE0 {{v0}} sur la p\xE9riode couverte par ce march\xE9.", {
        v0: formatNumber(i18n, threshold)
      });
      if (/plus de|over/.test(pick)) return i18n.t("Le total doit d\xE9passer {{v0}} sur la p\xE9riode couverte par ce march\xE9.", {
        v0: formatNumber(i18n, threshold)
      });
    }
    return i18n.t("Le pari porte sur le total indiqué. Les règles de règlement dépendent de la ligne et de la période choisies.");
  }
  if (/vainqueur|victoire|h2h|1x2/.test(market)) return /^(nul|draw|match nul)$/.test(pick) ? i18n.t("La sélection prévoit un match nul sur la période couverte par le marché.") : i18n.t("Le moteur retient {{v0}} comme vainqueur sur la p\xE9riode couverte par le march\xE9.", {
    v0: i18n.bet(leg.pick)
  });
  return i18n.t("Le pronostic se lit avec son marché : consulte la fiche du match pour vérifier la période et les informations disponibles.");
}
function RiskBadge({
  label
}) {
  const i18n = usePageLanguage();
  if (!label) return null;
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const risk = /risqu|risky/.test(normalized) ? "risky" : /modere|value/.test(normalized) ? "moderate" : /sur|safe/.test(normalized) ? "safe" : "neutral";
  return <span className={`wp3-risk wp3-risk--${risk}`}>{i18n.tx(label)}</span>;
}
function DateStamp({
  value
}) {
  const i18n = usePageLanguage();
  const timestamp = dateValue(value);
  if (timestamp === null) return <div className="wp3-date-stamp"><CalendarDays aria-hidden="true" /><span>{i18n.t("\xC0 confirmer")}</span></div>;
  const date = new Date(timestamp);
  return <div className="wp3-date-stamp" aria-hidden="true">
    <strong>{i18n.tx(new Intl.DateTimeFormat(i18n.locale, {
        day: "2-digit"
      }).format(date))}</strong>
    <span>{i18n.tx(new Intl.DateTimeFormat(i18n.locale, {
        month: "short"
      }).format(date))}</span>
    <b>{i18n.tx(new Intl.DateTimeFormat(i18n.locale, {
        hour: "2-digit",
        minute: "2-digit"
      }).format(date))}</b>
  </div>;
}
function SelectionCard({
  leg,
  index,
  unlocked,
  now,
  onUpgrade
}) {
  const i18n = usePageLanguage();
  const visible = unlocked && !leg.locked,
    status = legStatus(leg, now);
  const competition = leg.league || leg.sport_title || "Compétition non communiquée";
  const href = leg.match_id ? `/app/match/${encodeURIComponent(leg.match_id)}` : null;
  return <article className="wp3-match-card" data-testid={`combo-leg-${leg.match_id || index}`}>
    <div className="wp3-match-top">
      <div className="wp3-selection-number">{i18n.tx(String(index + 1).padStart(2, "0"))}</div>
      <div className="wp3-match-meta"><p>{i18n.tx(competition)}</p><div>{i18n.tx(leg.country && <span className="wp3-country">{i18n.tx(leg.country)}</span>)}<span><Clock aria-hidden="true" />{i18n.tx(dateLabel(i18n, leg.commence_time))}</span></div></div>
      {i18n.tx(visible && <RiskBadge label={i18n.tx(leg.label)} />)}
    </div>
    {i18n.tx((status === "started" || status === "finished") && <p className="wp3-alert wp3-alert--compact">{i18n.tx(status === "finished" ? "Rencontre terminée · actualise le combiné" : "Rencontre commencée · actualise le combiné")}</p>)}
    <div className="wp3-fixture">
      <DateStamp value={leg.commence_time} />
      <div className="wp3-team-pair"><p>{i18n.tx(leg.home_team || "Équipe non communiquée")}</p><span>{i18n.t("contre")}</span><p>{i18n.tx(leg.away_team || "Équipe non communiquée")}</p></div>
    </div>
    {i18n.tx(visible ? <>
      <div className="wp3-pick-grid">
        <div className="wp3-pick"><span className="wp3-eyebrow">{i18n.tx(leg.market_label || "Pronostic sélectionné")}</span><p>{i18n.tx(leg.pick || "Sélection non communiquée")}</p></div>
        <div className="wp3-leg-odds"><span>{i18n.t("Cote")}</span><strong>{i18n.tx(formatNumber(i18n, leg.pick_odds))}</strong></div>
      </div>
      <div className="wp3-confidence"><span>{i18n.t("Confiance du moteur")}</span><strong>{i18n.tx(leg.confidence === null ? "Non communiquée" : `${formatNumber(i18n, leg.confidence, 1)} %`)}</strong></div>
      <details className="wp3-explanation"><summary><span>{i18n.t("Ce que signifie ce pronostic")}</span><ChevronDown aria-hidden="true" /></summary><div>
        <p>{i18n.tx(explainMarket(i18n, leg))}</p>
        <p>{i18n.tx(leg.confidence === null ? "Aucun score de confiance n’a été communiqué pour cette sélection." : `La confiance de ${formatNumber(i18n, leg.confidence, 1)} % est l’indicateur fourni par le moteur ; elle ne constitue pas un taux de réussite observé.`)}</p>
      </div></details>
      {i18n.tx(href && <Link to={href} className="wp3-match-link">{i18n.t("Consulter la rencontre")}<ArrowRight aria-hidden="true" /></Link>)}
    </> : <div className="wp3-locked-pick"><Lock aria-hidden="true" /><div><strong>{i18n.t("Le pronostic est r\xE9serv\xE9 aux abonn\xE9s")}</strong><p>{i18n.t("D\xE9bloque la s\xE9lection, son march\xE9 et sa cote.")}</p></div><button type="button" className="wp3-button wp3-button--light" onClick={onUpgrade}>{i18n.t("Voir les abonnements")}<ArrowRight aria-hidden="true" /></button></div>)}
  </article>;
}
export default function CombosPage() {
  const i18n = usePageLanguage();
  const {
    user,
    loading: authLoading = false
  } = useAuth();
  const navigate = useNavigate();
  const [combos, setCombos] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accessState, setAccessState] = useState("waiting");
  const [error, setError] = useState("");
  const [activeTier, setActiveTier] = useState("balanced");
  const [viewMode, setViewMode] = useState("cards");
  const [loadedAt, setLoadedAt] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [copyNotice, setCopyNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const mountedRef = useRef(false);
  const requestRef = useRef(null);
  const snapshotRef = useRef(null);
  const tierChosenRef = useRef(false);
  const copyGenerationRef = useRef(0);
  const sessionKey = user?.id || user?.email || "anonymous";
  const fetchCombos = useCallback(async () => {
    if (!mountedRef.current || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      // Verify current access independently of the cached AuthContext profile.
      const [profile, selection] = await Promise.allSettled([api.get("/auth/me", {
        timeout: 8000,
        signal: controller.signal
      }), api.get("/predictions/combos", {
        timeout: 16000,
        signal: controller.signal
      })]);
      if (!mountedRef.current || controller.signal.aborted) return;
      const statuses = [profile, selection].filter(result => result.status === "rejected").map(result => result.reason?.response?.status);
      if (statuses.includes(401)) {
        snapshotRef.current = null;
        setCombos(null);
        setAccount(null);
        setLoadedAt(null);
        setAccessState("unauthorized");
        setError("");
        return;
      }
      if (profile.status === "fulfilled") {
        if (!object(profile.value.data)) throw new Error("INVALID_ACCOUNT");
        setAccount(profile.value.data);
      }
      if (selection.status === "rejected" && selection.reason?.response?.status === 403) {
        snapshotRef.current = null;
        setCombos(null);
        setLoadedAt(null);
        setAccessState("locked");
        setError("");
        return;
      }
      if (profile.status === "rejected") throw profile.reason;
      if (selection.status === "rejected") throw selection.reason;
      const data = normalizeCombos(selection.value.data);
      snapshotRef.current = data;
      setCombos(data);
      setLoadedAt(Date.now());
      setNow(Date.now());
      setAccessState("ready");
      setError("");
      if (!tierChosenRef.current && !paidAccount(profile.value.data)) {
        const free = TIERS.find(tier => data[tier.key]?.unlocked_for_free && data[tier.key].legs.length > 0 && !data[tier.key].locked && data[tier.key].legs.every(leg => !leg.locked));
        if (free) setActiveTier(free.key);
      }
    } catch (failure) {
      if (mountedRef.current && !controller.signal.aborted) {
        setError(loadError(i18n, failure));
        if (!snapshotRef.current) setAccessState("error");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (mountedRef.current && !controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
  }, [i18n]);
  useEffect(() => {
    if (authLoading) return;
    mountedRef.current = true;
    snapshotRef.current = null;
    tierChosenRef.current = false;
    setCombos(null);
    setAccount(null);
    setLoadedAt(null);
    setLoading(true);
    setAccessState("waiting");
    setError("");
    fetchCombos();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") fetchCombos();
    };
    const timer = window.setInterval(refreshVisible, 120000);
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("focus", refreshVisible);
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("focus", refreshVisible);
      copyGenerationRef.current += 1;
    };
  }, [authLoading, sessionKey, user?.subscription, user?.subscription_tier, fetchCombos]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    const tick = () => setNow(Date.now());
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  useEffect(() => {
    copyGenerationRef.current += 1;
    setCopyNotice("");
    setManualCopy("");
  }, [activeTier, combos, accessState]);
  const tier = TIERS.find(item => item.key === activeTier) || TIERS[1];
  const activeCombo = combos?.[tier.key];
  const unlocked = unlockedTier(activeCombo, account, now);
  const fullAccess = unlocked && activeCombo?.legs.every(leg => !leg.locked);
  const isPaid = paidAccount(account, now);
  const freeTier = TIERS.find(item => combos?.[item.key]?.unlocked_for_free && combos[item.key].legs.length > 0 && !combos[item.key].locked && combos[item.key].legs.every(leg => !leg.locked));
  const stale = loadedAt !== null && now - loadedAt >= FRESH_FOR_MS;
  const unavailable = activeCombo?.legs.some(leg => ["started", "finished"].includes(legStatus(leg, now))) || false;
  const canCopy = completeTicket(activeCombo, account, now, loadedAt);
  const orderedLegs = useMemo(() => chronologicalLegs(activeCombo, viewMode), [activeCombo, viewMode]);
  const firstStart = useMemo(() => {
    const starts = (activeCombo?.legs || []).map(leg => dateValue(leg.commence_time)).filter(value => value !== null);
    return starts.length ? new Date(Math.min(...starts)).toISOString() : null;
  }, [activeCombo]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "heure locale", []);
  const upgrade = () => navigate("/app/abonnement");
  function chooseTier(key) {
    tierChosenRef.current = true;
    setActiveTier(key);
  }
  async function copyCombo() {
    if (!completeTicket(activeCombo, account, Date.now(), loadedAt)) return;
    const content = ticketText(i18n, activeCombo),
      generation = copyGenerationRef.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(content);
      if (mountedRef.current && generation === copyGenerationRef.current) {
        setCopyNotice("Combiné copié.");
        setManualCopy("");
      }
    } catch {
      if (mountedRef.current && generation === copyGenerationRef.current) {
        setCopyNotice("La copie automatique est indisponible. Sélectionne le texte ci-dessous.");
        setManualCopy(content);
      }
    }
  }
  return <AppLayout>
      <style>{i18n.tx(COMBOS_STYLES)}</style>
      <div className="wp3-combos" data-testid="combos-page" data-layout="combos-studio">
        <header className="wp3-hero">
          <div className="wp3-hero-main">
            <p className="wp3-hero-eyebrow"><Layers aria-hidden="true" />{i18n.t("WNPULSE \xB7 LES COMBIN\xC9S")}</p>
            <h1>{i18n.rich("Lis le match.{{v0}}{{v1}}", {
              v0: <br />,
              v1: <span>{i18n.t("Choisis ton combin\xE9.")}</span>
            })}</h1>
            <p className="wp3-hero-description">{i18n.t("Trois profils. Chaque rencontre expliqu\xE9e. Toutes les s\xE9lections r\xE9unies dans un ticket clair.")}</p>
            <div className="wp3-hero-meta"><span><Clock aria-hidden="true" />{i18n.rich("Horaires : {{v0}}", {
                v0: i18n.tx(timeZone)
              })}</span>{i18n.tx(loadedAt !== null && <span>{i18n.rich("{{v0}} \xE0 {{v1}}", {
                v0: i18n.tx(stale ? "Dernier chargement" : "Actualisé"),
                v1: i18n.tx(new Intl.DateTimeFormat(i18n.locale, {
                  hour: "2-digit",
                  minute: "2-digit"
                }).format(new Date(loadedAt)))
              })}</span>)}</div>
          </div>
          <div className="wp3-hero-side">
            <div className="wp3-hero-profile"><span>{i18n.t("Profil s\xE9lectionn\xE9")}</span><strong>{i18n.tx(tier.label)}</strong><p>{i18n.tx(activeCombo ? i18n.t("{{v0}} s\xE9lection{{v1}} dans ce ticket", {
                v0: activeCombo.legs.length,
                v1: activeCombo.legs.length > 1 ? "s" : ""
              }) : "Choisis un profil pour explorer ses sélections")}</p></div>
            <button type="button" onClick={() => fetchCombos()} disabled={loading || refreshing || authLoading} className="wp3-button wp3-button--hero" data-testid="refresh-combos-btn"><RefreshCw aria-hidden="true" className={refreshing ? "wp3-spinning" : ""} />{i18n.tx(refreshing ? "Actualisation…" : "Actualiser les combinés")}</button>
          </div>
        </header>

        <section className="wp3-profile-section" aria-labelledby="wp3-profiles-title">
          <div className="wp3-section-heading"><div><p className="wp3-eyebrow">{i18n.t("01 \xB7 Choisis ton profil")}</p><h2 id="wp3-profiles-title">{i18n.t("Quel combin\xE9 veux-tu explorer ?")}</h2></div></div>
          <div className="wp3-profile-grid">
            {i18n.tx(TIERS.map((item, index) => {
            const Icon = item.icon,
              combo = combos?.[item.key],
              selected = tier.key === item.key;
            const visible = unlockedTier(combo, account, now) && combo.legs.length > 0 && combo.legs.every(leg => !leg.locked);
            return <button type="button" key={item.key} aria-pressed={selected} onClick={() => chooseTier(item.key)} data-testid={`tier-tab-${item.key}`} className={cn("wp3-profile", `wp3-profile--${item.accent}`, selected && "wp3-profile--selected")}>
                <div className="wp3-profile-top"><span className="wp3-profile-icon"><Icon aria-hidden="true" /></span><span className="wp3-profile-index">0{i18n.tx(index + 1)}</span>{i18n.tx(selected && <Check aria-hidden="true" className="wp3-selected-check" />)}</div>
                <div className="wp3-profile-title"><strong>{i18n.tx(item.label)}</strong>{i18n.tx(combo?.unlocked_for_free && !combo.locked && combo.legs.length > 0 && combo.legs.every(leg => !leg.locked) && <span className="wp3-free-label">{i18n.t("Gratuit")}</span>)}</div>
                <p>{i18n.tx(item.description)}</p>
                <div className="wp3-profile-stats"><span>{i18n.tx(combo ? i18n.t("{{v0}} s\xE9lection{{v1}}", {
                    v0: combo.legs.length,
                    v1: combo.legs.length > 1 ? "s" : ""
                  }) : "Profil à découvrir")}</span><b>{i18n.tx(visible ? combo.total_odds !== null ? i18n.t("Cote {{v0}}", {
                    v0: formatNumber(i18n, combo.total_odds)
                  }) : "Cote non fournie" : <>{i18n.tx(combo?.legs.length > 0 && <Lock aria-hidden="true" />)}{i18n.tx(loading ? "En attente" : !combo || !combo.legs.length ? "Indisponible" : "Accès Pro")}</>)}</b></div>
              </button>;
          }))}
          </div>
          {i18n.tx(combos && <details className="wp3-comparison">
            <summary><Scale aria-hidden="true" /><span>{i18n.t("Comparer les trois profils")}</span><ChevronDown aria-hidden="true" /></summary>
            <div className="wp3-compare-grid">{i18n.tx(TIERS.map(item => {
              const combo = combos[item.key],
                accessible = unlockedTier(combo, account, now) && combo.legs.length > 0 && combo.legs.every(leg => !leg.locked);
              return <div key={item.key} className="wp3-compare-card"><h3>{i18n.tx(item.label)}</h3><dl><Metric label={i18n.t("Sélections")} value={combo ? combo.legs.length : "Non disponible"} /><Metric label={i18n.t("Cote totale")} value={!combo?.legs.length ? "Non disponible" : accessible ? formatNumber(i18n, combo.total_odds) : "Réservée"} /><Metric label={i18n.t("Confiance moyenne")} value={accessible && combo.avg_confidence !== null ? `${formatNumber(i18n, combo.avg_confidence, 1)} %` : "—"} /><Metric label={i18n.t("Probabilité combinée estimée")} value={accessible && combo.combined_probability !== null ? `${formatNumber(i18n, combo.combined_probability, 1)} %` : "—"} /></dl><button type="button" className="wp3-button wp3-button--light" onClick={() => chooseTier(item.key)}>{i18n.t("Explorer ce profil")}<ArrowRight aria-hidden="true" /></button></div>;
            }))}</div><p className="wp3-comparison-note">{i18n.t("Les indicateurs proviennent du moteur. La confiance moyenne et la probabilit\xE9 combin\xE9e d\xE9crivent deux choses diff\xE9rentes.")}</p>
          </details>)}
        </section>

        {i18n.tx(error && <div role="alert" className="wp3-alert"><AlertCircle aria-hidden="true" /><div><p>{i18n.tx(error)}</p>{i18n.tx(combos && <p>{i18n.t("La derni\xE8re s\xE9lection charg\xE9e reste affich\xE9e.")}</p>)}<button type="button" onClick={() => fetchCombos()} disabled={refreshing} className="wp3-button wp3-button--light">{i18n.t("R\xE9essayer")}</button></div></div>)}

        {i18n.tx(loading || authLoading ? <section role="status" aria-label={i18n.t("Chargement des combinés")} className="wp3-loading"><Loader2 aria-hidden="true" className="wp3-spinning" /><h2>{i18n.t("Pr\xE9paration des s\xE9lections")}</h2><p>{i18n.t("V\xE9rification de ton acc\xE8s et chargement des rencontres\u2026")}</p><div className="wp3-skeleton-grid"><div /><div /><div /></div></section> : accessState === "unauthorized" ? <section className="wp3-state"><Lock aria-hidden="true" /><h2>{i18n.t("Ta session doit \xEAtre renouvel\xE9e")}</h2><p>{i18n.t("Reconnecte-toi pour retrouver l\u2019acc\xE8s correspondant \xE0 ton compte.")}</p><Link to="/login" className="wp3-button wp3-button--primary">{i18n.t("Se connecter")}<ArrowRight aria-hidden="true" /></Link></section> : accessState === "locked" ? <section className="wp3-upgrade" data-testid="combos-locked"><div className="wp3-upgrade-icon"><Lock aria-hidden="true" /></div><div><p className="wp3-eyebrow">{i18n.t("Les s\xE9lections compl\xE8tes")}</p><h2>{i18n.t("Explore les trois profils avec Pro.")}</h2><p>{i18n.t("Ton acc\xE8s actuel ne permet pas de consulter ces combin\xE9s. Retrouve les rencontres, les march\xE9s et les cotes en d\xE9couvrant les abonnements disponibles.")}</p><button type="button" onClick={upgrade} className="wp3-button wp3-button--primary" data-testid="upgrade-from-combos-btn"><Sparkles aria-hidden="true" />{i18n.t("D\xE9couvrir les abonnements")}<ArrowRight aria-hidden="true" /></button></div></section> : accessState === "error" ? <section className="wp3-state"><AlertCircle aria-hidden="true" /><h2>{i18n.t("Les combin\xE9s n\u2019ont pas pu \xEAtre charg\xE9s")}</h2><p>{i18n.t("Utilise le bouton R\xE9essayer ci-dessus pour relancer la v\xE9rification.")}</p></section> : <>
          {i18n.tx(!isPaid && freeTier && <div className="wp3-free-banner" data-testid="free-combo-banner"><Gift aria-hidden="true" /><div><strong>{i18n.t("Un combin\xE9 gratuit \xE0 d\xE9couvrir")}</strong><p>{i18n.rich("Le profil {{v0}} est accessible avec ton compte.", {
                v0: i18n.tx(combos[freeTier.key].label)
              })}</p></div><button type="button" onClick={() => chooseTier(freeTier.key)} className="wp3-button wp3-button--light" data-testid="see-free-combo-btn">{i18n.t("Voir le combin\xE9")}<ArrowRight aria-hidden="true" /></button></div>)}
          {i18n.tx(!activeCombo?.legs.length ? <section className="wp3-state"><Layers aria-hidden="true" /><h2>{i18n.t("Aucune s\xE9lection pour ce profil")}</h2><p>{i18n.rich("Le moteur n\u2019a pas fourni de combin\xE9 {{v0}} pour le moment. Consulte un autre profil ou actualise plus tard.", {
              v0: i18n.tx(tier.label.toLowerCase())
            })}</p></section> : <>
            {i18n.tx((stale || unavailable) && <div role="status" className="wp3-alert"><AlertCircle aria-hidden="true" /><p>{i18n.tx(unavailable ? "Une rencontre a déjà commencé ou s’est terminée. Actualise pour vérifier les sélections disponibles." : "Cette sélection n’a pas été actualisée depuis plus de cinq minutes. Actualise avant de la copier.")}</p></div>)}
            <div className="wp3-main">
              <section className={cn("wp3-selections", viewMode === "agenda" && "wp3-agenda")} aria-labelledby="combo-selections-title" data-testid={`combo-legs-${tier.key}`}>
                <div className="wp3-section-heading"><div><p className="wp3-eyebrow">{i18n.t("02 \xB7 Parcours les rencontres")}</p><h2 id="combo-selections-title">{i18n.tx(viewMode === "agenda" ? "Le programme du combiné" : "Les sélections, une par une")}</h2><p>{i18n.rich("{{v0}} s\xE9lection{{v1}} \xB7 Profil {{v2}}", {
                      v0: i18n.tx(activeCombo.legs.length),
                      v1: i18n.tx(activeCombo.legs.length > 1 ? "s" : ""),
                      v2: i18n.tx(tier.label)
                    })}</p>{i18n.tx(firstStart && <p className="wp3-first-start">{i18n.rich("Premi\xE8re rencontre : {{v0}}", {
                      v0: i18n.tx(dateLabel(i18n, firstStart))
                    })}</p>)}</div>
                  <div className="wp3-view-switch" aria-label={i18n.t("Présentation des rencontres")}><button type="button" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")}><Layers aria-hidden="true" />{i18n.t("Fiches")}</button><button type="button" aria-pressed={viewMode === "agenda"} onClick={() => setViewMode("agenda")}><CalendarDays aria-hidden="true" />{i18n.t("Horaires")}</button></div>
                </div>
                <a href="#combo-summary" className="wp3-mobile-summary"><span>{i18n.rich("Cote totale du moteur{{v0}}", {
                    v0: <strong>{i18n.tx(fullAccess ? formatNumber(i18n, activeCombo.total_odds) : "Réservée")}</strong>
                  })}</span><span>{i18n.t("Voir le ticket")}<ChevronDown aria-hidden="true" /></span></a>
                <div className="wp3-match-list">{i18n.tx(orderedLegs.map(({
                  leg,
                  index
                }) => <SelectionCard key={leg.key} leg={leg} index={index} unlocked={unlocked} now={now} onUpgrade={upgrade} />))}</div>
              </section>

              <aside id="combo-summary" className="wp3-sidebar" aria-label={i18n.t("Récapitulatif du combiné")}>
                <section className="wp3-ticket" data-testid={`bet-slip-${tier.key}`}>
                  <header><p className="wp3-eyebrow">{i18n.t("03 \xB7 Ton ticket")}</p><h2>{i18n.rich("Combin\xE9 {{v0}}", {
                      v0: i18n.tx(activeCombo.label)
                    })}</h2><span>{i18n.rich("{{v0}} s\xE9lection{{v1}} r\xE9unies", {
                      v0: i18n.tx(activeCombo.legs.length),
                      v1: i18n.tx(activeCombo.legs.length > 1 ? "s" : "")
                    })}</span></header>
                  <div className="wp3-ticket-rows">{i18n.tx(activeCombo.legs.map((leg, index) => <div key={leg.key} className="wp3-ticket-row"><b>{i18n.tx(index + 1)}</b><div><p>{i18n.tx(leg.home_team || "Équipe à confirmer")} <span>{i18n.t("contre")}</span> {i18n.tx(leg.away_team || "Équipe à confirmer")}</p><span>{i18n.tx(fullAccess && !leg.locked ? leg.pick || "Sélection non communiquée" : "Pronostic réservé")}</span></div></div>))}</div>
                  <div className="wp3-ticket-total"><span>{i18n.t("Cote totale du moteur")}</span><strong className={!fullAccess ? "wp3-reserved" : ""}>{i18n.tx(fullAccess ? formatNumber(i18n, activeCombo.total_odds) : "Réservée")}</strong><p>{i18n.tx(fullAccess ? "Cote fournie avec la sélection ; elle peut évoluer chez le bookmaker." : "Disponible avec les sélections complètes.")}</p></div>
                  <div className="wp3-ticket-bottom"><dl><Metric label={i18n.t("Confiance moyenne du moteur")} value={fullAccess && activeCombo.avg_confidence !== null ? `${formatNumber(i18n, activeCombo.avg_confidence, 1)} %` : "—"} /><Metric label={i18n.t("Probabilité combinée estimée")} value={fullAccess && activeCombo.combined_probability !== null ? `${formatNumber(i18n, activeCombo.combined_probability, 1)} %` : "—"} /></dl>
                    {i18n.tx(fullAccess ? <button type="button" onClick={copyCombo} disabled={!canCopy} className="wp3-button wp3-button--primary" data-testid="copy-combo-btn"><Copy aria-hidden="true" />{i18n.t("Copier le ticket")}</button> : <button type="button" onClick={upgrade} className="wp3-button wp3-button--primary" data-testid="upgrade-combo-btn"><Lock aria-hidden="true" />{i18n.t("D\xE9bloquer le combin\xE9")}</button>)}
                    {i18n.tx(fullAccess && !canCopy && <p className="wp3-copy-help">{i18n.tx(stale || unavailable ? "Actualise le combiné avant de copier ses sélections." : "La copie est disponible avec au moins deux sélections complètes, dont les horaires sont à venir.")}</p>)}
                    {i18n.tx(copyNotice && <p role="status" className="wp3-copy-help">{i18n.tx(copyNotice)}</p>)}
                  </div>
                </section>
                {i18n.tx(manualCopy && canCopy && <section className="wp3-manual-copy"><div><label htmlFor="combo-manual-copy">{i18n.t("Texte du ticket")}</label><button type="button" onClick={() => setManualCopy("")} aria-label={i18n.t("Fermer le texte à copier")}><X aria-hidden="true" /></button></div><textarea id="combo-manual-copy" readOnly value={manualCopy} onFocus={event => event.target.select()} /><p>{i18n.t("Appuie dans le texte pour le s\xE9lectionner.")}</p></section>)}
                <details className="wp3-reading" open><summary><Info aria-hidden="true" /><span>{i18n.t("Bien lire le combin\xE9")}</span><ChevronDown aria-hidden="true" /></summary><div><p>{i18n.t("La confiance moyenne d\xE9crit les s\xE9lections individuellement. Elle ne correspond pas \xE0 la probabilit\xE9 que tout le combin\xE9 passe.")}</p><p>{i18n.t("La probabilit\xE9 combin\xE9e est une estimation du moteur, li\xE9e \xE0 ses hypoth\xE8ses sur les matchs. Elle ne constitue pas un taux de r\xE9ussite mesur\xE9.")}</p><p>{i18n.t("Un combin\xE9 d\xE9pend de chacune de ses s\xE9lections. Le profil \xAB S\xE9curit\xE9 \xBB reste soumis \xE0 cette incertitude.")}</p></div></details>
              </aside>
            </div>
          </>)}
        </>)}
        {i18n.tx(refreshing && !loading && <p role="status" className="wp3-refresh-note"><Loader2 aria-hidden="true" className="wp3-spinning" />{i18n.t("V\xE9rification des s\xE9lections et de ton acc\xE8s\u2026")}</p>)}
      </div>
    </AppLayout>;
}
function Metric({
  label,
  value
}) {
  const i18n = usePageLanguage();
  return <div className="wp3-metric"><dt>{i18n.tx(label)}</dt><dd>{i18n.tx(value)}</dd></div>;
}
