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

    def test_photos_replace_illustrations_but_keep_editorial_cover(self):
        photos = {"football", "basketball", "tennis"}
        ns = self.functions("blog_seed.py", {"serialize_post", "safe_cover", "slugify", "default_blog_cover"},
                            urlsplit=urlsplit, re=re, unicodedata=unicodedata, BLOG_PHOTO_KEYS=photos,
                            BLOG_COVERS={key: None for key in [*photos, "rugby", "guides"]}, BLOG_COVER_VERSION="test")
        for sport in photos:
            content = ns["serialize_post"]({"_id":"a", "sport":sport.title(), "cover":f"/api/blog/covers/{sport}.svg"})
            self.assertEqual(content["cover"], f"/api/blog/photos/{sport}.webp")
            self.assertEqual(content["cover_kind"], "photo_illustration")
            file = (ROOT/"blog_photos"/f"{sport}.webp").read_bytes()
            self.assertEqual((file[:4], file[8:12]), (b"RIFF", b"WEBP"))
        custom = ns["serialize_post"]({"_id":"a", "sport":"Tennis", "cover":"https://example.test/photo.jpg"})
        self.assertEqual(custom["cover"], "https://example.test/photo.jpg")
        self.assertEqual(custom["photo_fallback"], "/api/blog/photos/tennis.webp")
        rugby = ns["serialize_post"]({"_id":"a", "sport":"Rugby"})
        self.assertIn("rugby.svg", rugby["cover"])

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
