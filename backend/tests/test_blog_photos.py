import ast
import asyncio
import re
import unittest
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).parents[1]


class BlogPhotos(unittest.IsolatedAsyncioTestCase):
    def functions(self, file, names, **ns):
        tree = ast.parse((ROOT/file).read_text())
        functions = [node for node in tree.body if getattr(node, "name", None) in names]
        exec(compile(ast.Module(body=functions, type_ignores=[]), "blog-test", "exec"), ns)
        return ns

    def test_matching_archives_replace_generic_cover_but_keep_editorial_cover(self):
        media = self.functions("blog_article_media.py", {"_plain", "article_subjects", "archive_photo",
            "approved_source_photo"}, re=re, unicodedata=unicodedata, urlsplit=urlsplit,
            CLUBS={"football": (("Villarreal", 533, ("villarreal",)), ("Getafe", 546, ("getafe",)))},
            ARCHIVES={("Villarreal", "Getafe"): ("villarreal", "Archives", "Author", "Source.jpg", "4.0")})
        ns = self.functions("blog_seed.py", {"serialize_post", "safe_cover"}, urlsplit=urlsplit, re=re,
            canonical_source_url=lambda _: None, article_subjects=media["article_subjects"],
            approved_source_photo=media["approved_source_photo"], archive_photo=media["archive_photo"])
        serialize = ns["serialize_post"]
        base = {"_id":"a", "sport":"Football", "kind":"news_link", "cover":"/api/blog/covers/football.svg"}
        archive = serialize({**base, "title":"Live Villarreal – Getafe"})
        self.assertEqual(archive["cover"], "/api/blog/photos/villarreal.webp")
        self.assertEqual(archive["cover_kind"], "archive_photo")
        self.assertEqual([s["name"] for s in archive["cover_subjects"]], ["Villarreal", "Getafe"])
        self.assertEqual(archive["cover_credit"]["caption"], "Archives")
        self.assertEqual(serialize({**base, "title":"Un autre club"})["cover"], "")
        self.assertEqual(serialize({**base, "title":"Villarreal – Getafe", "cover":"https://example.test/photo.jpg"})["cover"],
            "https://example.test/photo.jpg")
        self.assertEqual(serialize(base, admin=True)["cover"], "")
        for key in ("villarreal", "le-havre", "brest-lyon"):
            file = (ROOT/"blog_photos"/f"{key}.webp").read_bytes()
            self.assertEqual((file[:4], file[8:12]), (b"RIFF", b"WEBP"))

    def test_publisher_photo_requires_permission_and_filters_logos(self):
        from unittest.mock import patch
        import os
        from urllib.parse import unquote
        approve = self.functions("blog_article_media.py", {"approved_source_photo"},
            os=os, re=re, urlsplit=urlsplit, unquote=unquote)["approved_source_photo"]
        with patch.dict(os.environ, {"BLOG_APPROVED_IMAGE_HOSTS":"media.test=photos.media.test"}):
            self.assertEqual(approve("media.test", "https://photos.media.test/article.jpg#fragment"),
                "https://photos.media.test/article.jpg")
            self.assertEqual(approve("unapproved.test", "https://photos.media.test/article.jpg"), "")
            self.assertEqual(approve("media.test", "https://photos.media.test/logo.jpg"), "")
            self.assertEqual(approve("media.test", "https://photos.media.test.evil.test/article.jpg"), "")

    async def test_related_query_excludes_current_and_unpublished(self):
        class Collection:
            async def find_one(self, query):
                return {"_id":"a", "slug":"current", "sport":"Football"}
            def find(self, query, projection):
                self.query = query
                return self
            def sort(self, *args): return self
            def limit(self, n): return self
            async def to_list(self, length):
                return [{"_id":"b","slug":"related","sport":"Football"}]
        db = type("DB", (), {"blog_posts": Collection()})()
        ns = self.functions("blog_seed.py", {"get_post"}, asyncio=asyncio,
            public_filter=lambda: {"status":"published"}, serialize_post=lambda doc, **kw: doc)
        data = await ns["get_post"](db, "current")
        self.assertEqual(data["related"][0]["slug"], "related")
        self.assertEqual(db.blog_posts.query, {"status":"published","slug":{"$ne":"current"},"sport":"Football"})
