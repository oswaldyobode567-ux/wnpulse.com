"""Run within the service environment. Registers a webhook, never sends a post."""
import argparse
import asyncio
import sys
from urllib.parse import urlsplit

import httpx

from app import CHANNEL, SECRET, TOKEN, VALID_CHANNEL, VALID_SECRET, VALID_TOKEN

async def configure(url, register):
    parsed=urlsplit(url)
    if (parsed.scheme!="https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.path!="/telegram/webhook" or parsed.query or parsed.fragment):
        raise ValueError("Utilise l’URL HTTPS complète se terminant par /telegram/webhook.")
    if not (VALID_TOKEN and VALID_SECRET and VALID_CHANNEL):
        raise ValueError("Renseigne le jeton, le secret du webhook et l’identifiant du canal.")
    async with httpx.AsyncClient(timeout=12,follow_redirects=False) as client:
        async def call(method, **payload):
            resp=await client.post(f"https://api.telegram.org/bot{TOKEN}/{method}",json=payload)
            data=resp.json()
            if data.get("ok") is not True:
                raise ValueError(f"Telegram a refusé {method}. Vérifie le jeton, le canal ou les droits du bot.")
            return data["result"]
        me=await call("getMe")
        member=await call("getChatMember",chat_id=CHANNEL,user_id=me["id"])
        if member.get("status")!="administrator" or member.get("can_post_messages") is not True:
            raise ValueError("Ajoute le bot au canal comme administrateur autorisé à publier.")
        print(f"Bot @{me['username']} : droit de publier vérifié.")
        if register:
            await call("setWebhook",url=url,secret_token=SECRET,allowed_updates=["message"],max_connections=5)
            print("Webhook enregistré. Aucune publication envoyée.")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--register",action="store_true")
    args=parser.parse_args()
    try:
        asyncio.run(configure(args.url,args.register))
    except ValueError:
        # Do not expose request URLs: they contain the bot token.
        print("Échec de configuration. Vérifie l’URL, les variables et les permissions Telegram.",file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Impossible de joindre Telegram.",file=sys.stderr)
        sys.exit(1)
