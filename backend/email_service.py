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
