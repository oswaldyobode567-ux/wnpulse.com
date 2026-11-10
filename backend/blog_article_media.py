"""Cover selection for press reviews. Never fetch arbitrary publisher URLs."""
import os
import re
import unicodedata
from urllib.parse import unquote, urlsplit

# Existing WinPulse crest provider. Match whole, unambiguous aliases in a headline.
CLUBS = {
    "football": (
        ("Villarreal", 533, ("villarreal",)), ("Getafe", 546, ("getafe",)),
        ("Le Havre", 111, ("le havre",)), ("Lorient", 97, ("lorient",)),
        ("Brest", 106, ("brest", "stade brestois")), ("Lyon", 80, ("lyon", "olympique lyonnais")),
        ("Çorum", None, ("corum",)), ("Fenerbahçe", 611, ("fenerbahce",)),
        ("Celta Vigo", 538, ("celta vigo", "celta")), ("Levante", 539, ("levante",)),
        ("Fribourg", 160, ("fribourg", "freiburg")), ("Union Berlin", 182, ("union berlin",)),
        ("Lille", 79, ("losc", "lille")), ("Aston Villa", 66, ("aston villa",)),
        ("PSG", 85, ("paris saint germain", "psg")), ("Marseille", 81, ("olympique de marseille", "marseille")),
        ("Real Madrid", 541, ("real madrid",)), ("FC Barcelone", 529, ("fc barcelone", "barcelone", "barca")),
        ("Liverpool", 40, ("liverpool",)), ("Arsenal", 42, ("arsenal",)),
        ("Manchester City", 50, ("manchester city",)), ("Manchester United", 33, ("manchester united",)),
    ),
    "basketball": (
        ("Toronto Raptors", None, ("raptors",)), ("Milwaukee Bucks", None, ("bucks",)),
    ),
}

def _plain(text):
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode().lower()
    return " ".join(re.findall(r"[a-z0-9]+", text))

def article_subjects(title, sport):
    text = _plain(title)
    found = []
    for name, team_id, aliases in CLUBS.get(_plain(sport), ()):
        offsets = [m.start() for alias in aliases if (m := re.search(r"\b"+re.escape(alias)+r"\b", text))]
        if offsets:
            sport_path = "basketball/" if _plain(sport) == "basketball" else ""
            found.append((min(offsets), {"name": name, "logo": f"https://media.api-sports.io/{sport_path}teams/{team_id}.png" if team_id else ""}))
    return [item for _, item in sorted(found, key=lambda row: row[0])[:2]]

def approved_source_photo(publisher, value):
    """Only opt in domains with an explicit agreement for image display.
    Configuration: BLOG_APPROVED_IMAGE_HOSTS=publisher.example=cdn.example|other.example
    """
    if not isinstance(value, str) or not value or len(value) > 1000 or re.search(r"[\s\\\x00-\x1f]", value):
        return ""
    hosts = set()
    for entry in os.getenv("BLOG_APPROVED_IMAGE_HOSTS", "").lower().split(","):
        source, sep, images = entry.strip().partition("=")
        if sep and source.strip() == publisher:
            hosts.update(host.strip() for host in images.split("|") if host.strip())
    try:
        url = urlsplit(value)
        if (url.scheme != "https" or not url.hostname or url.hostname not in hosts
                or url.username or url.password or url.port not in (443, None)):
            return ""
        path = unquote(url.path).lower()
        if not re.search(r"\.(?:jpe?g|png|webp|avif)$", path) or re.search(
            r"(?:^|[/_.-])(?:logo|favicon|default|placeholder|sprite|social[-_]?default)(?:[/_.-]|$)", path
        ):
            return ""
        return url._replace(fragment="").geturl()
    except ValueError:
        return ""

# These are archives tied to the named teams/venues, not photos of the new fixture.
ARCHIVES = {
    ("Villarreal", "Getafe"): ("villarreal", "Archives : Villarreal – Majorque, janvier 2025", "FotosLaLiga", "Villarreal_CF_vs_RCD_Mallorca_-_LALIGA.jpg", "4.0"),
    ("Le Havre", "Lorient"): ("le-havre", "Archives : stade Océane du Havre, 2018", "Philippe Alès", "Stade_Oc%C3%A9ane_2018_04.jpg", "4.0"),
    ("Brest", "Lyon"): ("brest-lyon", "Archives : Brest – Lyon, août 2011", "El Funcionario", "Stade_Francis-Le_Bl%C3%A9.JPG", "3.0"),
}
ARTICLE_PHOTO_KEYS = frozenset(photo[0] for photo in ARCHIVES.values())

def archive_photo(subjects):
    photo = ARCHIVES.get(tuple(subject["name"] for subject in subjects))
    if not photo:
        return None
    key, caption, author, source, license_version = photo
    return {"url": f"/api/blog/photos/{key}.webp", "caption": caption, "author": author,
            "source": f"https://commons.wikimedia.org/wiki/File:{source}",
            "license": f"CC BY-SA {license_version}",
            "license_url": f"https://creativecommons.org/licenses/by-sa/{license_version}/"}
