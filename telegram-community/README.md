# WinPulse · Community manager Telegram

Service séparé de WinPulse, connecté uniquement à ses routes publiques. Il prépare une image PNG et un texte en français pour chaque brouillon. Il ne publie rien dans le canal tant que la publication est désactivée ou que le brouillon n'a pas été approuvé.

| Heure de Paris | Brouillon | Données |
| --- | --- | --- |
| 08:30 | Bilan des matchs de la veille | Track Record : gagnés, perdus, annulés, en attente |
| 12:00 | Pronostic gratuit | Sélection publique, match à venir, cote, marché et horaire |
| 18:00 | Actualité sportive | Actualité récente du blog, titre et source |
| Sur demande | Promotion ou rappel | Texte soumis par le propriétaire |

Les brouillons se préparent jusqu'à trois heures à l'avance. Si les données sont absentes, l'agent n'invente pas de publication. Le visuel WinPulse est généré à partir d'un modèle graphique ; aucune image de sportif ou d'éditeur n'est récupérée. Gemini est facultatif et ne produit qu'une courte accroche : pas de données de compte, d'historique de conversation, ni de chiffres envoyés au modèle. Une panne du modèle ne bloque pas le brouillon.

## Connecter le bot

1. Sur Telegram, dans [@BotFather](https://t.me/BotFather), crée un bot dédié avec /newbot.
2. Ajoute le bot au canal WinPulse (le site pointe actuellement vers [@wnplus](https://t.me/wnplus)) comme administrateur avec le droit de publier. Pour accueillir les membres et répondre aux commandes dans un espace de discussion, ajoute-le aussi au **groupe** lié au canal. Le canal reste réservé aux publications ; /start sert de bienvenue en privé. Le bot ne contacte pas les membres spontanément en privé.
3. Sur Railway, crée un **service séparé** depuis ce dépôt, avec `/telegram-community` comme dossier racine. Ajoute un volume persistant monté sur `/data`, laisse une seule réplique, crée un domaine HTTPS pour le webhook et vérifie `/health`. Le service WinPulse existant n'a pas à changer.
4. Ajoute les variables dans ce nouveau service. Ne partage pas les valeurs privées dans le chat ou sur GitHub.

| Variable | Valeur |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Jeton de @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Valeur aléatoire de 32 caractères ou plus : lettres, chiffres, tirets ou underscores |
| `TELEGRAM_CHANNEL_ID` | @wnplus, ou identifiant numérique si le canal est privé |
| `TELEGRAM_BOT_USERNAME` | Nom du bot, sans @ |
| `TELEGRAM_ADMIN_IDS` | Identifiants des propriétaires, séparés par des virgules |
| `TELEGRAM_GROUP_ID` | Identifiant du groupe de discussion, facultatif |
| `TELEGRAM_CHANNEL_PUBLISH` | `false` pour les tests privés ; `true` pour autoriser la publication de brouillons validés |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Facultatifs, pour l'accroche |
| `COMMUNITY_DB` | Facultatif, `/data/community.sqlite3` par défaut |

5. Dans le terminal du service où les variables sont injectées, exécute `python setup_webhook.py https://DOMAINE/telegram/webhook` pour contrôler le bot et ses permissions, puis relance avec `--register` pour enregistrer le webhook. La commande n'envoie aucun message. Ne l'utilise pas sur un bot déjà connecté à une autre application sans déplacer intentionnellement son webhook.
6. Si ton identifiant est inconnu, envoie `/id` au bot en privé après le raccordement, puis renseigne `TELEGRAM_ADMIN_IDS`. Teste `/start`, `/pro` et `/drafts` sans activer le canal.
7. En privé, utilise `/preview ID` pour voir l'image, `/approve ID` pour autoriser son envoi à l'heure prévue, et `/cancel ID` pour annuler avant la prise en charge. `/promo TEXTE` et `/rappel TEXTE` créent un brouillon, sans publication immédiate. Publie sur un canal de test avant d'activer le canal principal.

Si Telegram ne confirme pas l'envoi, l'état devient `review` (ou `sending` après un arrêt brutal). Vérifie le canal avant de créer une nouvelle publication : le service ne renvoie pas automatiquement un envoi incertain. Les réponses aux FAQ passent par des commandes Telegram ; la modération des échanges libres et les réponses avec accès au compte ne sont pas incluses.

Tests locaux (sans jeton ni appels Telegram) :

```sh
cd telegram-community
python -m unittest -v
```

## Conversation privée

Écrire **pronostics du jour**, **résultats**, **actualités** ou **abonnement** suffit désormais.
La demande de pronostics montre toutes les sélections gratuites encore à venir proposées par l'API publique, dans l'ordre des horaires. Un match déjà commencé, verrouillé ou indisponible n'est pas présenté. Le nombre annoncé correspond aux cartes envoyées ; les choix ne sont pas des combinés. Le brouillon quotidien automatique reste une sélection de mise en avant.

Pour le propriétaire défini dans TELEGRAM_ADMIN_IDS, chaque réponse est un aperçu privé.
**Publier les pronostics** ou **publier les résultats** valide exactement le dernier ensemble présenté dans cette conversation privée. Les brouillons non consultés ne sont pas approuvés par ces phrases.
Une consultation, « bonjour » ou une phrase non reconnue n'autorise jamais une publication.
Les anciennes commandes /preview et /approve restent compatibles.

Les nouvelles cartes séparent les équipes, la compétition, l'heure et le bloc du choix. Le bilan utilise quatre statuts clairement nommés.


Avec `TELEGRAM_GROUP_ANIMATION=true`, le bot accueille les nouveaux membres, ouvre une discussion à 12 h 30 et propose un sondage à 20 h (heure de Paris). Les publications de pronostics conservent leur validation. Le groupe de discussion lié au canal est détecté automatiquement ; sinon un administrateur WinPulse peut saisir `/lier@WNPulseAssistantBot` dans le groupe, après y avoir ajouté le bot.
