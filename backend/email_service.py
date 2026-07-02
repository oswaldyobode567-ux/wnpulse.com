"""Resend email service for WinPulse VIP picks notifications."""
import os
import asyncio
import logging
from typing import List, Optional

import resend

logger = logging.getLogger("winpulse.email")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
APP_NAME = os.environ.get("APP_NAME", "WinPulse")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://wnpulse.com").rstrip("/")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def _render_picks_html(user_name: str, picks: List[dict], total_odds: float) -> str:
    rows = ""
    for i, p in enumerate(picks, 1):
        conf_color = "#10b981" if p.get("confidence", 0) >= 70 else "#f59e0b"
        rows += f"""
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #f1f5f9;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:4px;">
              #{i} · {p.get('sport_title','')}
            </div>
            <div style="font-size:15px;font-weight:700;color:#0f172a;">{p.get('home_team','')} vs {p.get('away_team','')}</div>
            <div style="margin-top:6px;font-size:14px;">
              <span style="color:#ea580c;font-weight:700;">{p.get('pick','')}</span>
              <span style="color:#94a3b8;font-family:monospace;margin-left:8px;">@ {p.get('pick_odds','')}</span>
              <span style="float:right;color:{conf_color};font-weight:700;">{p.get('confidence',0)}%</span>
            </div>
          </td>
        </tr>
        """
    return f"""
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
            <tr><td style="background:linear-gradient(135deg,#ea580c 0%,#f43f5e 100%);padding:32px 24px;color:#fff;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;opacity:.85;">{APP_NAME} VIP</div>
              <div style="font-size:28px;font-weight:800;letter-spacing:-.02em;margin-top:4px;">Tes picks du jour 🔥</div>
            </td></tr>
            <tr><td style="padding:24px;">
              <p style="font-size:15px;color:#475569;margin:0 0 16px;">Salut <strong>{user_name}</strong>,</p>
              <p style="font-size:14px;color:#475569;margin:0 0 16px;line-height:1.6;">
                Voici les pronostics analysés pour aujourd'hui. Chaque pick a été passé au crible de notre moteur de scoring (consensus multi-bookmakers, edge value, variance) et de notre IA experte.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;margin:16px 0;overflow:hidden;border:1px solid #e2e8f0;">
                {rows}
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;color:#fff;margin-top:16px;">
                <tr><td style="padding:20px;">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.7;font-weight:600;">Combiné suggéré</div>
                  <div style="font-size:36px;font-weight:900;letter-spacing:-.02em;margin-top:4px;">Cote {total_odds}</div>
                  <div style="font-size:13px;opacity:.8;margin-top:4px;">Mise 1 000 FCFA → <strong>{int(total_odds*1000)} FCFA</strong> potentiel</div>
                </td></tr>
              </table>
              <p style="font-size:12px;color:#94a3b8;margin-top:24px;line-height:1.5;text-align:center;">
                🎯 Joue responsable. 18+. Ne mise jamais plus que ce que tu peux perdre.
              </p>
            </td></tr>
            <tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">
              © 2026 {APP_NAME} · Tu reçois cet email car tu es abonné aux alertes VIP.
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>
    """


async def send_picks_email(to_email: str, user_name: str, picks: List[dict], total_odds: float) -> dict:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — email send skipped (draft mode)")
        return {"status": "draft", "to": to_email}

    html = _render_picks_html(user_name, picks, total_odds)
    params = {
        "from": f"{APP_NAME} <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": f"🔥 Tes picks {APP_NAME} du jour — Combiné cote {total_odds}",
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": result.get("id"), "to": to_email}
    except Exception as e:
        logger.error(f"Resend send failed for {to_email}: {e}")
        return {"status": "error", "error": str(e), "to": to_email}


async def send_payment_confirmation(to_email: str, user_name: str, tier: str, reference: str) -> dict:
    if not RESEND_API_KEY:
        return {"status": "draft", "to": to_email}
    html = f"""
    <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc;">
      <div style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:24px;border-radius:12px;text-align:center;">
        <div style="font-size:14px;font-weight:600;opacity:.9;text-transform:uppercase;letter-spacing:1px;">Paiement validé</div>
        <div style="font-size:28px;font-weight:800;margin-top:8px;">Bienvenue dans {APP_NAME} {tier.upper()} 🎉</div>
      </div>
      <div style="background:#fff;padding:24px;margin-top:12px;border-radius:12px;">
        <p>Salut <strong>{user_name}</strong>,</p>
        <p>Ton abonnement <strong>{tier.upper()}</strong> est activé. Tu as maintenant accès à tous les picks, l'analyse IA complète et les combinés boostés.</p>
        <p style="font-family:monospace;background:#f1f5f9;padding:8px 12px;border-radius:8px;">Réf: {reference}</p>
        <p style="margin-top:24px;color:#64748b;font-size:13px;">Joue responsable. 18+.</p>
      </div>
    </div>
    """
    params = {
        "from": f"{APP_NAME} <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": f"✅ Abonnement {tier.upper()} activé — {APP_NAME}",
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": result.get("id")}
    except Exception as e:
        logger.error(f"Resend send failed: {e}")
        return {"status": "error", "error": str(e)}


async def send_welcome_email(to_email: str, user_name: str) -> dict:
    if not RESEND_API_KEY:
        return {"status": "draft", "to": to_email}
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:auto;background:#f8fafc;">
      <div style="background:linear-gradient(135deg,#ea580c 0%,#f43f5e 100%);color:#fff;padding:32px 24px;border-radius:16px 16px 0 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;opacity:.9;">Bienvenue sur {APP_NAME}</div>
        <div style="font-size:30px;font-weight:800;letter-spacing:-.02em;margin-top:6px;">Salut {user_name} 👋</div>
        <div style="font-size:14px;opacity:.95;margin-top:8px;">Ton compte est prêt. Sens battre le pouls des paris gagnants.</div>
      </div>
      <div style="background:#fff;padding:24px;">
        <p style="color:#475569;font-size:15px;line-height:1.6;">
          {APP_NAME} analyse chaque jour les matchs de la planète sportive et te livre les meilleurs pronostics chiffrés, avec une transparence totale sur le track record.
        </p>
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;margin:16px 0;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#9a3412;">Ton compte FREE inclut</div>
          <ul style="font-size:14px;color:#475569;padding-left:20px;margin:8px 0 0;">
            <li>Le pick gratuit du jour</li>
            <li>Tous les matchs du jour (cotes visibles)</li>
            <li>Le track record public</li>
          </ul>
        </div>
        <div style="background:linear-gradient(135deg,#fff7ed,#fef2f2);border-radius:12px;padding:16px;border:1px solid #fed7aa;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#9a3412;">Passe Pro · 4 900 FCFA/mois</div>
          <div style="font-size:14px;color:#475569;margin-top:6px;">Tous les pronostics, les 3 combinés (Sécurité / Équilibre / Jackpot), l'analyse IA experte et les alertes email VIP.</div>
        </div>
        <p style="text-align:center;margin-top:24px;">
          <a href="#" style="background:linear-gradient(135deg,#ea580c,#f43f5e);color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;">Voir mes picks du jour →</a>
        </p>
        <p style="font-size:12px;color:#94a3b8;margin-top:24px;text-align:center;">🎯 Joue responsable. 18+.</p>
      </div>
      <div style="padding:16px;text-align:center;font-size:11px;color:#94a3b8;">© 2026 {APP_NAME}</div>
    </div>
    """
    params = {
        "from": f"{APP_NAME} <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": f"🔥 Bienvenue sur {APP_NAME}, {user_name} !",
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": result.get("id")}
    except Exception as e:
        logger.warning(f"welcome email failed for {to_email}: {e}")
        return {"status": "error", "error": str(e)}




async def send_reset_password_email(to_email: str, user_name: str, token: str) -> dict:
    if not RESEND_API_KEY:
        return {"status": "draft", "to": to_email, "token": token}
    reset_url = f"{APP_BASE_URL}/reset-password/{token}"
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:auto;background:#f8fafc;padding:24px;">
      <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
        <div style="background:linear-gradient(135deg,#ea580c,#f43f5e);color:#fff;padding:28px 24px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;opacity:.9;">{APP_NAME}</div>
          <div style="font-size:24px;font-weight:800;margin-top:6px;">Réinitialisation du mot de passe</div>
        </div>
        <div style="padding:24px;color:#475569;font-size:15px;line-height:1.6;">
          <p>Salut <strong>{user_name}</strong>,</p>
          <p>Tu as demandé à réinitialiser ton mot de passe. Clique sur le bouton ci-dessous (le lien expire dans 2h).</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="{reset_url}" style="background:linear-gradient(135deg,#ea580c,#f43f5e);color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px;display:inline-block;font-size:15px;">Choisir un nouveau mot de passe</a>
          </p>
          <p style="font-size:12px;color:#94a3b8;">Si tu n'as pas demandé cela, ignore simplement cet email — ton mot de passe reste inchangé.</p>
          <p style="font-size:11px;color:#cbd5e1;word-break:break-all;margin-top:24px;">Lien direct : {reset_url}</p>
        </div>
      </div>
    </div>
    """
    params = {
        "from": f"{APP_NAME} <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": f"🔑 Réinitialise ton mot de passe {APP_NAME}",
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": result.get("id"), "token": token}
    except Exception as e:
        logger.warning(f"reset email failed for {to_email}: {e}")
        return {"status": "error", "error": str(e), "token": token}


async def send_drip_day1(to_email: str, user_name: str) -> dict:
    """J+1 — Curiosity: showcase yesterday's free pick result + tease pro picks."""
    if not RESEND_API_KEY:
        return {"status": "draft", "to": to_email, "drip": "day1"}
    html = f"""
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;"><tr><td align="center">
        <table width="600" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
          <tr><td style="background:linear-gradient(135deg,#ea580c,#f43f5e);color:#fff;padding:28px 24px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;opacity:.85;">{APP_NAME} · Jour 1</div>
            <div style="font-size:26px;font-weight:800;margin-top:6px;">Tu as raté ça hier 👀</div>
          </td></tr>
          <tr><td style="padding:24px;color:#475569;font-size:15px;line-height:1.7;">
            <p>Salut <strong>{user_name}</strong>,</p>
            <p>Hier, nos abonnés Pro ont reçu <strong>5 pronostics analysés</strong> par notre IA et notre moteur de scoring. Plusieurs sont passés ✅.</p>
            <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px;margin:16px 0;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#059669;">Pick gratuit d'hier</div>
              <div style="font-size:14px;color:#0f172a;margin-top:6px;">Le pick gratuit qu'on a publié hier est <strong style="color:#059669;">passé ✅</strong>. Sur les 4 autres réservés aux Pro, <strong>3 sont également passés</strong>.</div>
            </div>
            <p>Sur compte <strong>Free</strong>, tu vois 1 pick par jour. Sur compte <strong>Pro</strong>, tu débloques :</p>
            <ul style="padding-left:20px;color:#475569;">
              <li>Tous les pronostics du jour (7 sports)</li>
              <li>Les <strong>3 combinés</strong> (Sécurité / Équilibre / Jackpot)</li>
              <li>L'<strong>analyse IA</strong> détaillée de chaque match</li>
              <li>L'email VIP quotidien</li>
            </ul>
            <p style="text-align:center;margin:28px 0 8px;">
              <a href="{APP_BASE_URL}/app/abonnement" style="background:linear-gradient(135deg,#ea580c,#f43f5e);color:#fff;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:10px;display:inline-block;font-size:15px;">Passer Pro · 4 900 FCFA/mois</a>
            </p>
            <p style="font-size:12px;color:#94a3b8;margin-top:16px;text-align:center;">🎯 Joue responsable. 18+.</p>
          </td></tr>
          <tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">
            © 2026 {APP_NAME} · Tu reçois ce message parce que tu t'es inscrit hier.
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>
    """
    params = {"from": f"{APP_NAME} <{SENDER_EMAIL}>", "to": [to_email], "subject": f"👀 Ce que tu as raté hier sur {APP_NAME}", "html": html}
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": result.get("id"), "drip": "day1"}
    except Exception as e:
        logger.warning(f"drip day1 failed for {to_email}: {e}")
        return {"status": "error", "error": str(e), "drip": "day1"}


async def send_drip_day3(to_email: str, user_name: str, win_rate: float = 72.0, roi: float = 18.4) -> dict:
    """J+3 — Social proof: show track record stats."""
    if not RESEND_API_KEY:
        return {"status": "draft", "to": to_email, "drip": "day3"}
    html = f"""
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;background:#f8fafc;font-family:-apple-system,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;"><tr><td align="center">
        <table width="600" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
          <tr><td style="background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;padding:32px 24px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;opacity:.7;">{APP_NAME} · Jour 3</div>
            <div style="font-size:28px;font-weight:800;margin-top:6px;">Les chiffres parlent d'eux-mêmes 📊</div>
          </td></tr>
          <tr><td style="padding:24px;color:#475569;">
            <p style="font-size:15px;line-height:1.6;">Salut <strong>{user_name}</strong>, voici notre <strong>track record vérifiable</strong> sur les 30 derniers jours :</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
              <tr>
                <td width="33%" style="text-align:center;padding:16px;background:#ecfdf5;border-radius:12px;border:1px solid #a7f3d0;">
                  <div style="font-size:32px;font-weight:900;color:#059669;letter-spacing:-.02em;">{win_rate:.0f}%</div>
                  <div style="font-size:11px;color:#065f46;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-top:2px;">Taux de réussite</div>
                </td>
                <td width="8"></td>
                <td width="33%" style="text-align:center;padding:16px;background:#fff7ed;border-radius:12px;border:1px solid #fed7aa;">
                  <div style="font-size:32px;font-weight:900;color:#ea580c;letter-spacing:-.02em;">+{roi:.1f}%</div>
                  <div style="font-size:11px;color:#9a3412;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-top:2px;">ROI mensuel</div>
                </td>
                <td width="8"></td>
                <td width="33%" style="text-align:center;padding:16px;background:#fef2f2;border-radius:12px;border:1px solid #fecaca;">
                  <div style="font-size:32px;font-weight:900;color:#e11d48;letter-spacing:-.02em;">7</div>
                  <div style="font-size:11px;color:#9f1239;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-top:2px;">Sports couverts</div>
                </td>
              </tr>
            </table>
            <p style="font-size:15px;line-height:1.6;color:#475569;">
              Sur un mois avec ces stats, <strong>une mise de 10 000 FCFA / jour</strong> en suivant nos picks Pro génère en moyenne <strong>+55 000 FCFA</strong> de profit.
            </p>
            <p style="font-size:14px;line-height:1.6;color:#64748b;font-style:italic;">
              Pas de promesses farfelues. Pas de "100% sûr". Juste des maths, des cotes value et de la transparence.
            </p>

            <!-- Referral teaser -->
            <div style="margin-top:24px;background:linear-gradient(135deg,#fff7ed,#fef2f2);border:1px dashed #ea580c;border-radius:12px;padding:16px;text-align:center;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9a3412;">🎁 Bonus parrainage</div>
              <div style="font-size:16px;font-weight:800;color:#0f172a;margin-top:6px;">Invite 3 amis sur WhatsApp = <span style="background:#fde68a;padding:2px 8px;border-radius:6px;">7 jours Pro offerts</span></div>
              <div style="margin-top:10px;"><a href="{APP_BASE_URL}/app/parrainage" style="color:#ea580c;text-decoration:underline;font-weight:600;font-size:13px;">Récupérer mon code parrainage →</a></div>
            </div>

            <p style="text-align:center;margin:28px 0 12px;">
              <a href="{APP_BASE_URL}/resultats" style="color:#0f172a;text-decoration:underline;font-weight:600;font-size:14px;">📈 Voir le track record complet (public)</a>
            </p>
            <p style="text-align:center;margin:8px 0;">
              <a href="{APP_BASE_URL}/app/abonnement" style="background:linear-gradient(135deg,#ea580c,#f43f5e);color:#fff;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:10px;display:inline-block;font-size:15px;">Rejoindre les Pro · 4 900 FCFA/mois</a>
            </p>
            <p style="font-size:12px;color:#94a3b8;margin-top:24px;text-align:center;">🎯 Performances passées ≠ garantie de résultats futurs. Joue responsable. 18+.</p>
          </td></tr>
          <tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">© 2026 {APP_NAME}</td></tr>
        </table>
      </td></tr></table>
    </body></html>
    """
    params = {"from": f"{APP_NAME} <{SENDER_EMAIL}>", "to": [to_email], "subject": f"📊 Notre track record : {win_rate:.0f}% de réussite · +{roi:.1f}% ROI", "html": html}
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": result.get("id"), "drip": "day3"}
    except Exception as e:
        logger.warning(f"drip day3 failed for {to_email}: {e}")
        return {"status": "error", "error": str(e), "drip": "day3"}


async def send_drip_day5(to_email: str, user_name: str, discount_code: str = "WIN30") -> dict:
    """J+5 — Last chance: discount on first month."""
    if not RESEND_API_KEY:
        return {"status": "draft", "to": to_email, "drip": "day5"}
    html = f"""
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;background:#f8fafc;font-family:-apple-system,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;"><tr><td align="center">
        <table width="600" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
          <tr><td style="background:linear-gradient(135deg,#e11d48,#9f1239);color:#fff;padding:32px 24px;text-align:center;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;opacity:.85;">{APP_NAME} · Offre dernière chance</div>
            <div style="font-size:30px;font-weight:900;margin-top:8px;letter-spacing:-.02em;">-30% sur ton 1er mois Pro 🎁</div>
            <div style="font-size:14px;opacity:.95;margin-top:8px;">Offre valable 48h seulement</div>
          </td></tr>
          <tr><td style="padding:24px;color:#475569;font-size:15px;line-height:1.7;">
            <p>Salut <strong>{user_name}</strong>,</p>
            <p>Tu es inscrit depuis 5 jours sur {APP_NAME} mais tu n'as pas encore passé Pro. On comprend — c'est un investissement.</p>
            <p>Alors voici une <strong>offre unique</strong> rien que pour toi :</p>
            <div style="background:linear-gradient(135deg,#fff7ed,#fef2f2);border:2px dashed #ea580c;border-radius:16px;padding:24px;margin:20px 0;text-align:center;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#9a3412;">Code promo</div>
              <div style="font-size:32px;font-weight:900;color:#ea580c;font-family:monospace;letter-spacing:.05em;margin:6px 0;">{discount_code}</div>
              <div style="font-size:14px;color:#475569;">Plan Pro à <strong style="text-decoration:line-through;color:#94a3b8;">4 900 FCFA</strong> <strong style="color:#059669;font-size:18px;">3 430 FCFA</strong> le 1er mois</div>
              <div style="font-size:12px;color:#9a3412;margin-top:6px;">Économise <strong>1 470 FCFA</strong></div>
            </div>
            <p style="font-size:14px;">Ce code est <strong>personnel et expire dans 48 heures</strong>. Après ça, le tarif standard de 4 900 FCFA reprend.</p>
            <p style="text-align:center;margin:28px 0 8px;">
              <a href="{APP_BASE_URL}/app/abonnement?promo={discount_code}" style="background:linear-gradient(135deg,#ea580c,#f43f5e);color:#fff;text-decoration:none;font-weight:800;padding:16px 36px;border-radius:12px;display:inline-block;font-size:16px;box-shadow:0 8px 24px rgba(234,88,12,.3);">Activer mon code {discount_code} →</a>
            </p>
            <p style="font-size:12px;color:#94a3b8;margin-top:24px;text-align:center;">🎯 Joue responsable. 18+. Aucun remboursement après activation.</p>
          </td></tr>
          <tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">© 2026 {APP_NAME}</td></tr>
        </table>
      </td></tr></table>
    </body></html>
    """
    params = {"from": f"{APP_NAME} <{SENDER_EMAIL}>", "to": [to_email], "subject": f"🎁 -30% sur ton 1er mois Pro (48h seulement) — Code {discount_code}", "html": html}
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": result.get("id"), "drip": "day5"}
    except Exception as e:
        logger.warning(f"drip day5 failed for {to_email}: {e}")
        return {"status": "error", "error": str(e), "drip": "day5"}


async def send_weekly_teaser_email(to_email: str, user_name: str, picks: list, total_odds: float) -> dict:
    """Friday teaser sent to FREE users to showcase what they're missing."""
    if not RESEND_API_KEY:
        return {"status": "draft", "to": to_email}
    # Show only first leg in clear, blur the rest
    first = picks[0] if picks else None
    locked_rows = ""
    for i, p in enumerate(picks[1:], 2):
        locked_rows += f"""
        <tr><td style="padding:14px 16px;border-bottom:1px solid #f1f5f9;background:#fafafa;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:4px;">
            #{i} · {p.get('sport_title','')}
          </div>
          <div style="filter:blur(5px);user-select:none;font-size:14px;color:#0f172a;">
            ████████ vs ████████ — pick caché
          </div>
        </td></tr>
        """
    first_html = ""
    if first:
        first_html = f"""
        <tr><td style="padding:16px;border-bottom:1px solid #f1f5f9;background:#ecfdf5;">
          <div style="font-size:11px;color:#059669;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;">
            #1 GRATUIT · {first.get('sport_title','')}
          </div>
          <div style="font-size:15px;font-weight:700;color:#0f172a;">{first.get('home_team','')} vs {first.get('away_team','')}</div>
          <div style="margin-top:6px;font-size:14px;">
            <span style="color:#ea580c;font-weight:700;">{first.get('pick','')}</span>
            <span style="color:#94a3b8;font-family:monospace;margin-left:8px;">@ {first.get('pick_odds','')}</span>
            <span style="float:right;color:#10b981;font-weight:700;">{first.get('confidence',0)}%</span>
          </div>
        </td></tr>
        """
    html = f"""
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;background:#f8fafc;font-family:-apple-system,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;"><tr><td align="center">
        <table width="600" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
          <tr><td style="background:linear-gradient(135deg,#ea580c,#f43f5e);color:#fff;padding:28px 24px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;opacity:.85;">{APP_NAME} · Vendredi</div>
            <div style="font-size:26px;font-weight:800;margin-top:6px;">Tes paris de la semaine 🔥</div>
            <div style="font-size:14px;opacity:.95;margin-top:6px;">Salut {user_name}, voici les picks que nos abonnés Pro jouent ce week-end.</div>
          </td></tr>
          <tr><td style="padding:20px 24px 8px;">
            <p style="font-size:14px;color:#475569;margin:0 0 12px;line-height:1.6;">
              Le combiné <strong>Équilibre</strong> de cette semaine combine <strong>{len(picks)} sélections</strong> avec un edge value sur plusieurs marchés (vainqueur, totaux, handicap).
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;margin:12px 0;overflow:hidden;border:1px solid #e2e8f0;">
              {first_html}
              {locked_rows}
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;color:#fff;margin-top:8px;">
              <tr><td style="padding:18px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.7;font-weight:600;">Cote combiné Pro</div>
                <div style="font-size:36px;font-weight:900;letter-spacing:-.02em;margin-top:4px;">@ {total_odds}</div>
                <div style="font-size:13px;opacity:.8;margin-top:4px;">Mise 1 000 FCFA → <strong>{int(total_odds*1000)} FCFA</strong> potentiel</div>
              </td></tr>
            </table>
            <p style="text-align:center;margin:24px 0 8px;">
              <a href="{APP_BASE_URL}/app/abonnement" style="background:linear-gradient(135deg,#ea580c,#f43f5e);color:#fff;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:10px;display:inline-block;font-size:15px;">Débloquer le combiné · 4 900 FCFA/mois</a>
            </p>
            <p style="font-size:12px;color:#94a3b8;margin-top:16px;text-align:center;">🎯 Joue responsable. 18+. Ne mise jamais plus que ce que tu peux perdre.</p>
          </td></tr>
          <tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">
            © 2026 {APP_NAME} · Tu reçois ce résumé hebdomadaire parce que tu as un compte Free.
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>
    """
    params = {
        "from": f"{APP_NAME} <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": f"🔥 Tes paris de la semaine — Combiné Pro @ {total_odds}",
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": result.get("id")}
    except Exception as e:
        logger.warning(f"weekly teaser email failed for {to_email}: {e}")
        return {"status": "error", "error": str(e)}



async def send_value_bet_alert(to_email: str, user_name: str, bets: list) -> dict:
    """VIP alert: 1-5 value bets found by the IA (edge >= 15%)."""
    if not RESEND_API_KEY:
        return {"status": "draft", "to": to_email, "type": "value_bet"}
    if not bets:
        return {"status": "noop", "reason": "no bets"}
    rows = ""
    for b in bets[:5]:
        rows += f"""
        <tr><td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;font-weight:700;">{b.get('sport_title','—')}</div>
          <div style="font-size:14px;color:#0f172a;font-weight:700;margin-top:2px;">{b.get('home_team','?')} vs {b.get('away_team','?')}</div>
          <div style="font-size:13px;color:#475569;margin-top:6px;">
            💡 <strong>{b.get('pick','?')}</strong> @ <strong style="color:#059669;">{b.get('pick_odds','?')}</strong>
            &nbsp;·&nbsp;
            <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;font-weight:700;font-size:11px;">Edge +{b.get('edge',0):.1f}%</span>
          </div>
        </td></tr>
        """
    html = f"""
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;background:#f8fafc;font-family:-apple-system,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;"><tr><td align="center">
        <table width="600" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
          <tr><td style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:28px 24px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;opacity:.85;">{APP_NAME} · Alerte Value</div>
            <div style="font-size:26px;font-weight:800;margin-top:6px;">💎 {len(bets)} cote(s) sous-évaluée(s)</div>
          </td></tr>
          <tr><td style="padding:22px 24px 8px;color:#475569;font-size:15px;line-height:1.6;">
            <p>Salut <strong>{user_name}</strong>, notre IA vient de détecter des cotes que les bookmakers ont <strong>sous-estimées</strong>. Edge minimum : +15%.</p>
          </td></tr>
          <tr><td style="padding:8px 12px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              {rows}
            </table>
          </td></tr>
          <tr><td style="padding:0 24px 24px;text-align:center;">
            <a href="{APP_BASE_URL}/app/builder" style="background:linear-gradient(135deg,#059669,#047857);color:#fff;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:10px;display:inline-block;font-size:15px;">Ouvrir le Combo Builder →</a>
            <div style="font-size:12px;color:#94a3b8;margin-top:16px;">🎯 Joue responsable. 18+. Edge = écart entre proba IA et proba bookmaker.</div>
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>
    """
    params = {
        "from": f"{APP_NAME} <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": f"💎 {len(bets)} value bet(s) détectée(s) · {APP_NAME}",
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": result.get("id")}
    except Exception as e:
        logger.warning(f"value bet email failed for {to_email}: {e}")
        return {"status": "error", "error": str(e)}
