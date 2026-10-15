"""Public educational blog and administrator CRUD; no AI or paid API required.

Dates are UTC ISO strings, matching the API's existing Mongo convention.
Seeds are inserted once, never overwrite edits and never revive deleted posts.
"""
import math
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from urllib.parse import urlsplit

CATEGORIES = {"Guides", "Méthode", "Probabilités", "Résultats", "Actualités", "Mercato", "Déclarations"}
NEWS_CATEGORIES = {"Actualités", "Mercato", "Déclarations"}
SPORTS = {"", "Football", "Basketball", "Tennis", "Rugby", "Hockey", "Athlétisme", "Sports mécaniques", "Autres sports"}

class BlogConflictError(Exception):
    pass


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def slugify(value):
    value = value.replace("’", "-").replace("'", "-")
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")[:120].rstrip("-")


def safe_cover(value):
    if not isinstance(value, str):
        raise ValueError("L’image doit être une URL ou un chemin relatif.")
    value = value.strip()
    if not value:
        return ""
    if len(value) > 1000 or re.search(r"[\s\\\x00-\x1f]", value):
        raise ValueError("URL d’image invalide.")
    if value.startswith("/") and not value.startswith("//"):
        return value
    parsed = urlsplit(value)
    if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password:
        return value
    raise ValueError("Utilise une image HTTPS ou un chemin commençant par /.")


def validate_post(data):
    cleaned = {}
    for key, minimum, maximum in (("title", 8, 160), ("excerpt", 20, 360), ("content", 80, 40000)):
        value = data.get(key)
        if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
            raise ValueError(f"{key} doit contenir entre {minimum} et {maximum} caractères.")
        cleaned[key] = value.strip()
    slug = data.get("slug") or slugify(cleaned["title"])
    if not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or len(slug) > 120:
        raise ValueError("Le lien doit contenir uniquement des lettres minuscules, chiffres et tirets.")
    cleaned["slug"] = slug
    cleaned["cover"] = safe_cover(data.get("cover", ""))
    category = data.get("category", "Guides")
    if category not in CATEGORIES:
        raise ValueError("Catégorie inconnue.")
    cleaned["category"] = category
    tags = data.get("tags", [])
    if not isinstance(tags, list) or len(tags) > 6 or any(not isinstance(t, str) or not 1 <= len(t.strip()) <= 40 for t in tags):
        raise ValueError("Ajoute au maximum six tags de 1 à 40 caractères.")
    cleaned["tags"] = list(dict.fromkeys(t.strip() for t in tags))
    status = data.get("status", "draft")
    if status not in {"draft", "published"}:
        raise ValueError("Le statut doit être draft ou published.")
    cleaned["status"] = status
    sport = data.get("sport", "")
    if sport not in SPORTS:
        raise ValueError("Sport inconnu.")
    cleaned["sport"] = sport
    source = data.get("source_url", "")
    if not isinstance(source, str):
        raise ValueError("Le lien de la source doit être une URL HTTPS.")
    source = safe_cover(source)
    if source and not source.startswith("https://"):
        raise ValueError("Le lien de la source doit être une URL HTTPS.")
    cleaned["source_url"] = source
    name = data.get("source_name", "")
    if not isinstance(name, str) or len(name.strip()) > 120:
        raise ValueError("Le nom de la source doit contenir au maximum 120 caractères.")
    cleaned["source_name"] = name.strip()
    information_date = data.get("information_date", "")
    if not isinstance(information_date, str):
        raise ValueError("La date de l’information est invalide.")
    if information_date:
        try:
            parsed_date = datetime.strptime(information_date, "%Y-%m-%d")
            if parsed_date.strftime("%Y-%m-%d") != information_date:
                raise ValueError()
        except ValueError:
            raise ValueError("La date de l’information doit être au format AAAA-MM-JJ.")
    cleaned["information_date"] = information_date
    if category in NEWS_CATEGORIES and status == "published" and not (source and cleaned["source_name"] and information_date):
        raise ValueError("Pour publier une actualité, un mercato ou une déclaration, indique la source, son lien et la date de l’information.")
    cleaned["read_min"] = max(1, math.ceil(len(re.findall(r"\S+", cleaned["content"])) / 200))
    return cleaned


def public_filter():
    return {"status": "published", "published_at": {"$ne": None, "$lte": now_iso()}}


def serialize_post(doc, full=False, admin=False):
    keys = ("slug", "title", "excerpt", "cover", "category", "sport", "tags", "published_at", "updated_at", "read_min", "author", "source_url", "source_name", "information_date", "kind", "auto_generated", "source_date_kind", "source_seen_at", "collector")
    result = {key: doc.get(key) for key in keys}
    result["id"] = str(doc["_id"])
    if full:
        result["content"] = doc.get("content", "")
        result["body"] = result["content"]  # Compatibility with simple existing readers.
    if admin:
        result.update(status=doc.get("status"), revision=doc.get("revision", 1))
    return result


async def list_posts(db, limit=50, admin=False, category=None, sport=None):
    query = {"status": {"$ne": "deleted"}} if admin else public_filter()
    if category:
        if category not in CATEGORIES:
            raise ValueError("Catégorie inconnue.")
        query["category"] = category
    if sport:
        if sport not in SPORTS:
            raise ValueError("Sport inconnu.")
        query["sport"] = sport
    projection = None if admin else {"content": 0}
    cursor = db.blog_posts.find(query, projection).sort([("published_at", -1), ("created_at", -1), ("_id", 1)])
    docs = await cursor.limit(limit).to_list(length=limit)
    count = await db.blog_posts.count_documents(query)
    return {"posts": [serialize_post(doc, full=admin, admin=admin) for doc in docs], "count": count}


async def get_post(db, slug):
    doc = await db.blog_posts.find_one({**public_filter(), "slug": slug})
    if not doc:
        raise LookupError("Cet article n’est pas disponible.")
    return {"post": serialize_post(doc, full=True)}


async def save_post(db, data, author_id, post_id=None):
    cleaned = validate_post(data)
    now = now_iso()
    if post_id is None:
        doc = {"_id": str(uuid.uuid4()), **cleaned, "author": "WinPulse", "created_by": author_id,
               "created_at": now, "updated_at": now, "published_at": now if cleaned["status"] == "published" else None,
               "revision": 1}
        await db.blog_posts.insert_one(doc)
    else:
        revision = data.get("revision")
        if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
            raise ValueError("Une version valide est nécessaire pour modifier l’article.")
        previous = await db.blog_posts.find_one({"_id": post_id, "status": {"$ne": "deleted"}})
        if not previous:
            raise LookupError("Article introuvable.")
        # A published date is assigned only when publishing (or re-publishing).
        published = previous.get("published_at")
        if cleaned["status"] == "published" and previous.get("status") != "published":
            published = now
        update = {**cleaned, "updated_at": now, "updated_by": author_id, "published_at": published}
        result = await db.blog_posts.update_one(
            {"_id": post_id, "revision": revision, "status": {"$ne": "deleted"}},
            {"$set": update, "$inc": {"revision": 1}})
        if not result.matched_count:
            raise BlogConflictError("L’article a changé. Recharge la liste avant de le modifier.")
        doc = {**previous, **update, "revision": revision + 1}
    return {"post": serialize_post(doc, full=True, admin=True)}


async def delete_post(db, post_id, revision, author_id):
    result = await db.blog_posts.update_one(
        {"_id": post_id, "revision": revision, "status": {"$ne": "deleted"}},
        {"$set": {"status": "deleted", "updated_at": now_iso(), "updated_by": author_id}, "$inc": {"revision": 1}})
    if not result.matched_count:
        raise BlogConflictError("L’article a changé ou a été supprimé. Recharge la liste.")
    return {"ok": True}


SEED_POSTS = [
    {
        "slug": "comprendre-un-pronostic-winpulse", "category": "Méthode",
        "title": "Ton premier pronostic WinPulse : les informations à regarder",
        "excerpt": "Match, marché, cote, confiance et explication : découvre comment lire une sélection et comprendre ce qu’elle signifie avant de la suivre.",
        "tags": ["WinPulse", "Pronostics", "Débuter"],
        "content": """## Une sélection, plusieurs informations utiles

Un pronostic ne se résume pas au nom d’une équipe. Pour comprendre une sélection WinPulse, regarde la rencontre, la compétition, son horaire, le marché choisi et la cote associée. Ces éléments décrivent une proposition précise, à un moment précis.

La barre de recherche du tableau de bord permet de retrouver une équipe, un pays ou un championnat sans parcourir toute la liste. Ouvre ensuite la fiche de la rencontre pour consulter le détail disponible.

## Commence par le marché

Le marché indique la condition à remplir. Un choix « Vainqueur » et un choix « Plus de 2,5 buts » sur la même rencontre ne décrivent pas le même scénario.

- Vainqueur : l’issue proposée dépend du marché et de ses règles de règlement.
- Total de buts ou de points : le pronostic porte sur le total, au-dessus ou au-dessous d’une ligne.
- Handicap : une correction est appliquée au score pour déterminer l’issue du pari.

Pour le football, le marché 1X2 concerne généralement le temps réglementaire, avec le nul comme troisième issue. Vérifie toujours les règles du bookmaker : une qualification, une victoire après prolongation et une victoire en 90 minutes peuvent être trois marchés distincts.

## La cote situe le choix dans le marché

La cote affichée est une référence observée chez un bookmaker. Elle peut changer entre la publication du pronostic et la consultation de la fiche. Un raisonnement intéressant à une certaine cote peut l’être moins à une cote plus basse.

L’horaire compte aussi : un pronostic à venir et un résultat déjà terminé ne doivent pas être lus de la même façon. Consulte les résultats dans le Track record, pas dans une ancienne capture de la fiche.

## À quoi sert l’explication ?

L’explication aide à comprendre le choix officiel. Le service explicatif de WinPulse utilise les données disponibles pour commenter une sélection existante ; il ne remplace pas le moteur de pronostics et ne modifie pas sa cote ou sa confiance.

Lorsque les données ne permettent pas de parler de blessures, de forme récente ou de classement, une explication sérieuse doit le reconnaître. Une histoire détaillée sans données vérifiables n’apporte pas une meilleure analyse.

## Le bon réflexe avant de suivre une sélection

Vérifie le match, la date, le marché et la cote actuelle, puis lis l’explication. Les badges et les pourcentages sont des indicateurs à interpréter, jamais la certitude d’un résultat.

[Découvrir les résultats publiés](/resultats)
""",
    },
    {
        "slug": "petite-cote-ne-signifie-pas-victoire", "category": "Probabilités",
        "title": "Petite cote ou grande cote : pourquoi aucune ne suffit à choisir",
        "excerpt": "Une cote basse ne rend pas un résultat certain. Apprends à distinguer le prix du marché, la probabilité estimée et la qualité des données.",
        "tags": ["Cotes", "Probabilités", "Méthode"],
        "content": """## La cote est un prix, pas une promesse

Une petite cote correspond à une issue que le marché considère comme relativement probable. Elle ne dit pas que le match est joué d’avance. Un favori peut perdre et une issue moins attendue peut se produire.

Une grande cote exprime généralement une issue jugée moins probable. Chercher uniquement les grandes cotes augmente l’incertitude ; retenir uniquement les petites cotes ne supprime pas cette incertitude.

## Lire la probabilité implicite

Avec une cote décimale, la probabilité implicite brute se calcule par 100 divisé par la cote. Ainsi, 1,50 correspond à environ 66,7 %, 2,00 à 50 % et 2,50 à 40 %.

Ce sont des exemples mathématiques. Ils ne prouvent pas qu’une sélection du site gagnera avec cette fréquence. La probabilité implicite brute inclut l’effet de la marge du bookmaker ; ce n’est pas une mesure indépendante de la vraie probabilité.

## Pourquoi le contexte compte davantage qu’un seuil de cote

Le marché choisi, le nombre de sources de cotes et leur fraîcheur influencent la lecture d’une sélection. Deux propositions à 1,80 peuvent avoir des qualités très différentes si l’une s’appuie sur plusieurs sources récentes et l’autre sur une donnée ancienne.

Dans la Montante WinPulse, la sélection examine plusieurs marchés et des critères de qualité des données. L’objectif est de ne pas choisir un match uniquement parce que sa cote est basse. Si les critères ne permettent pas de retenir deux rencontres, il est préférable d’attendre plutôt que de compléter automatiquement le ticket.

## Ce qu’il faut comparer

- Le marché exact et les conditions de règlement.
- La cote actuelle, pas seulement celle d’une publication passée.
- La disponibilité des données et les limites de l’explication.
- L’historique complet des résultats sur une période suffisamment longue.

## Une sélection intéressante peut perdre

Le résultat d’un match et la qualité d’une méthode sont deux questions différentes. Un pari gagnant ne valide pas à lui seul une méthode, et un pari perdu ne suffit pas à la rejeter. Pour juger le service, consulte les séries complètes plutôt que les seules meilleures journées.

[Consulter le Track record](/resultats)
""",
    },
    {
        "slug": "cote-confiance-edge-comprendre", "category": "Probabilités",
        "title": "Cote, confiance et edge : trois chiffres, trois significations",
        "excerpt": "Distingue la probabilité implicite d’une cote, l’indicateur de confiance du moteur et l’écart affiché dans les value bets.",
        "tags": ["Confiance", "Value bets", "Débuter"],
        "content": """## La cote décrit le prix proposé

La cote est le prix d’une issue chez un bookmaker. La formule 100 / cote donne sa probabilité implicite brute. Par exemple, une cote de 2,00 correspond à 50 % et une cote de 1,80 à environ 55,6 %.

Sur un marché à plusieurs issues, les probabilités implicites brutes peuvent totaliser plus de 100 %. Cet excédent est lié à la marge. Un consensus issu de plusieurs bookmakers peut chercher à tenir compte de cette marge, mais son résultat reste une estimation de marché.

## La confiance doit être interprétée avec prudence

La confiance affichée par un moteur est un indicateur calculé selon sa méthode. Un affichage « 70 % » ne démontre pas à lui seul que sept pronostics sur dix gagneront réellement.

Pour interpréter un pourcentage comme une fréquence attendue, il faut vérifier la calibration : sur de nombreuses sélections annoncées autour de 70 %, quelle proportion a effectivement gagné ? Cette comparaison doit porter sur des pronostics publiés avant les matchs et sur une période distincte de celle utilisée pour régler la méthode.

## L’edge exprime un écart d’estimation

Un value bet désigne une sélection dont la probabilité estimée est supérieure à la probabilité de référence du marché. Si une estimation est de 60 % et la probabilité implicite brute de 50 %, l’écart est de 10 points de pourcentage.

Attention à l’unité affichée par une plateforme. Dix points de probabilité, un écart relatif de 20 % et un rendement espéré ne sont pas la même mesure. Il faut connaître la formule employée avant de comparer les chiffres.

## Un exemple purement théorique

Pour un pari binaire simple, sans remboursement ni règlement partiel, une probabilité supposée de 60 % à une cote de 2,00 donne un rendement espéré de 0,60 × 2,00 − 1 = 0,20, soit 20 % de la mise. Cet exemple dépend entièrement de la justesse du 60 % supposé.

Il ne décrit ni un rendement mesuré de WinPulse, ni un gain promis. Si la vraie probabilité est plus basse que l’estimation, la conclusion peut changer complètement.

## Ce que les trois chiffres permettent de faire

- La cote permet d’identifier le prix observé.
- La confiance aide à lire le signal du moteur, sous réserve de validation historique.
- L’edge aide à comparer une estimation à une référence définie.

Ces indicateurs deviennent plus utiles lorsqu’on connaît leurs sources, leurs formules et leurs limites. Aucun ne remplace la consultation des résultats réellement enregistrés.
""",
    },
    {
        "slug": "combines-montante-deux-usages", "category": "Guides",
        "title": "Combinés et Montante : comprendre les tickets et leur suivi",
        "excerpt": "Les combinés regroupent des sélections ; la Montante organise leur suivi par étapes. Voici comment lire ces deux onglets sans confondre score et certitude.",
        "tags": ["Combinés", "Montante", "Guides"],
        "content": """## Un combiné rassemble plusieurs conditions

Dans un combiné classique, plusieurs sélections constituent un même ticket. Pour qu’il soit gagnant, les conditions prévues par le bookmaker doivent être remplies. Un seul résultat perdu suffit généralement à faire perdre le ticket ; une sélection annulée peut modifier le règlement selon les règles de l’opérateur.

L’onglet Combinés permet de lire les rencontres, leurs marchés et leurs horaires. Consulte chaque sélection séparément : une cote totale attrayante ne remplace pas l’analyse des conditions qui la composent.

## Deux matchs ne rendent pas le résultat certain

Pour deux événements supposés indépendants, la probabilité que les deux conditions soient remplies est le produit de leurs probabilités. Deux estimations de 70 % donneraient ainsi 49 %, et non 70 %.

Il s’agit d’un calcul théorique fondé sur des probabilités supposées justes. Des événements corrélés, une estimation mal calibrée ou des règles particulières peuvent rendre ce calcul inadapté. Le pourcentage calculé n’est pas un taux de réussite observé.

## La Montante ajoute un suivi par étapes

La Montante WinPulse suit une série et les résultats de ses sélections. Le ticket proposé vise deux rencontres retenues selon les critères du service. Lorsque deux rencontres suffisamment qualifiées ne sont pas disponibles, un état d’attente est préférable à une sélection forcée.

Une étape en cours doit rester lisible jusqu’au règlement de ses matchs. Une nouvelle consultation ne doit pas remplacer discrètement les sélections déjà publiées. Un match annulé, en attente et gagné sont trois états différents.

## Le score de sélection n’est pas une chance de victoire

Un score qui classe des propositions sert à les comparer selon les critères du moteur. Il ne doit pas être lu automatiquement comme une probabilité. Un score de qualité élevé ne permet donc pas d’affirmer qu’un ticket a autant de chances de gagner.

## Comment comparer les deux onglets

- Combinés : lis les sélections du ticket, leurs marchés et leurs horaires.
- Montante : vérifie aussi l’étape active, la série et le statut de règlement.
- Dans les deux cas : consulte les explications et l’historique, pas seulement la cote totale.

L’intérêt d’un suivi clair est de comprendre ce qui a été publié, quand et avec quel résultat. Il ne supprime pas la possibilité d’une perte.
""",
    },
    {
        "slug": "lire-track-record-au-dela-gagnants", "category": "Résultats",
        "title": "Le Track record : regarder au-delà des pronostics gagnants",
        "excerpt": "Une sélection de belles réussites ne raconte pas toute l’histoire. Apprends à lire les gagnés, perdus, annulés et en attente sur une période cohérente.",
        "tags": ["Track record", "Résultats", "Transparence"],
        "content": """## Un aperçu donne envie de découvrir ; un historique permet d’évaluer

Les résultats gagnants mis en avant sur l’accueil sont un aperçu. Ils montrent certaines sélections réussies, mais ne représentent pas à eux seuls l’ensemble des pronostics publiés.

Pour évaluer un service, consulte aussi les pronostics perdus et le nombre de rencontres. Une journée avec trois beaux résultats peut paraître impressionnante ; elle doit être replacée dans le total des sélections de cette journée.

## Les statuts ne sont pas interchangeables

- Gagné : la sélection a été réglée comme gagnante.
- Perdu : la sélection a été réglée comme perdante.
- Annulé : le règlement ne doit pas être compté comme une victoire.
- En attente : le résultat n’est pas encore définitivement enregistré.

Si un score final n’est pas encore synchronisé, il faut attendre sa confirmation. Le statut en attente ne doit jamais être transformé en succès par défaut.

## La période et le nombre de sélections comptent

Comparer une semaine à une journée sans préciser les volumes peut induire en erreur. Observe une période définie, le nombre de paris réglés et la répartition des cotes.

Un taux de réussite calculé comme gagnés / (gagnés + perdus) exclut les annulés et les rencontres en attente. Avec huit gagnés et deux perdus, il serait de 80 %. C’est un exemple fictif : il ne s’agit pas du taux mesuré de WinPulse.

## Un taux élevé ne suffit pas

La fréquence des victoires et les cotes doivent être considérées ensemble. Un service qui gagne souvent à de petites cotes et un service qui gagne moins souvent à de plus grandes cotes n’ont pas le même profil. Une simple liste de réussites ne permet pas de les départager.

Si une plateforme affiche un rendement historique, vérifie sa méthode : montants supposés identiques ou variables, cotes à la publication, frais éventuels et règles de règlement. Sans ces informations, le chiffre manque de contexte.

## Vérifie la chronologie

Un historique utile conserve le pronostic publié avant le début du match, sa cote de référence et le résultat enregistré ensuite. Une modification après la rencontre ne doit pas être présentée comme une prédiction faite à l’avance.

## Fais du Track record ton point de départ

Commence par la période qui t’intéresse, regarde les volumes et tous les statuts, puis ouvre quelques rencontres pour comprendre les marchés sélectionnés. Les résultats passés aident à examiner une méthode ; ils ne garantissent pas les prochains résultats.

[Ouvrir le Track record](/resultats)
""",
    },
]


async def bootstrap_blog(db):
    await db.blog_posts.create_index("slug", unique=True)
    await db.blog_posts.create_index([("status", 1), ("published_at", -1)])
    now = now_iso()
    for seed in SEED_POSTS:
        cleaned = validate_post({**seed, "status": "published"})
        await db.blog_posts.update_one(
            {"_id": "seed:" + seed["slug"]},
            {"$setOnInsert": {**cleaned, "author": "WinPulse", "created_at": now, "updated_at": now,
                              "published_at": now, "revision": 1}}, upsert=True)
