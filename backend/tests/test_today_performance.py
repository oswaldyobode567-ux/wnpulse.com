import ast, asyncio, copy, time, unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

ROOT=Path(__file__).parents[1]
def load(file,names,ns):
    tree=ast.parse((ROOT/file).read_text())
    nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'today-regression','exec'),ns)
    return ns

class TodayCache(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.now=datetime.now(timezone.utc)
        self.future=(self.now+timedelta(hours=2)).isoformat()
        self.matches=[{"id":"a","commence_time":self.future}]
        self.meta={"updated_at":"base","montante_quotes_updated_at":"targeted"}
        self.count=0
        self.gate=asyncio.Event()
        async def find_one(*_):return dict(self.meta)
        async def matches(_):return self.matches
        async def hybrid():pass
        async def build(*_):
            self.count+=1
            await self.gate.wait()
            return {"families":{"all":{"tiers":{"sure":{"legs":[{"commence_time":self.future,"pick":"test"}]}}}}}
        self.ns=load('server.py',{'_quality_today_data','_today_cached_tickets_current'},{
            "asyncio":asyncio,"datetime":datetime,"timezone":timezone,"time":time,"copy":copy,
            "_today_quality_task":None,"_today_quality_cache":{"at":0.,"source":None,"data":None},
            "_discovery_day":lambda now:now.date().isoformat(),"_parse_iso":lambda v:datetime.fromisoformat(v) if v else None,
            "db":SimpleNamespace(odds_cache=SimpleNamespace(find_one=find_one)),
            "fetch_all_matches":matches,"_get_hybrid_registry":hybrid,
            "build_today_combos_by_sport":object(),"_run_analysis":build,"_queue_today_archive":lambda *_:None})
        self.get=self.ns['_quality_today_data']
    async def test_timeout_does_not_cancel_shared_build(self):
        with self.assertRaises(asyncio.TimeoutError):await asyncio.wait_for(self.get(),timeout=.01)
        self.assertEqual(self.count,1)
        self.assertFalse(self.ns['_today_quality_task'].done())
        self.gate.set()
        await asyncio.gather(self.get(),self.get())
        self.assertEqual(self.count,1)
    async def test_cached_response_is_isolated_from_masking_and_targeted_refresh(self):
        self.gate.set()
        first=await self.get()
        first["families"]["all"]["tiers"]["sure"]["legs"].clear()
        second=await self.get()
        self.assertEqual(len(second["families"]["all"]["tiers"]["sure"]["legs"]),1)
        self.assertEqual(self.count,1)
        self.meta["montante_quotes_updated_at"]="new"
        self.ns["_today_quality_cache"]["at"]-=11
        await self.get()
        self.assertEqual(self.count,2)
    async def test_started_ticket_is_never_reused(self):
        self.gate.set();await self.get()
        self.ns["_today_quality_cache"]["data"]["families"]["all"]["tiers"]["sure"]["legs"][0]["commence_time"]=(self.now-timedelta(seconds=1)).isoformat()
        await self.get()
        self.assertEqual(self.count,2)

class TodayReason(unittest.TestCase):
    def test_unqualified_tomorrow_does_not_hide_todays_fixtures(self):
        now=datetime.now(timezone.utc)
        ns=load('prediction_engine.py',{'build_today_combos_by_sport'},{
            'List':list,'Dict':dict,'datetime':datetime,'timezone':timezone,'timedelta':timedelta,
            '_is_upcoming':lambda _:True,'_today_pool':lambda _:[],
            'SPORT_FAMILIES':[('all','Tous'),('soccer','Football')],
            'TODAY_QUALITY_PROFILES':[], 'TODAY_SELECTION_VERSION':'test'})
        rows=[{'sport_key':'soccer_test','commence_time':(now+timedelta(days=i)).isoformat()} for i in (0,1)]
        result=ns['build_today_combos_by_sport'](rows)
        self.assertEqual(result['day_offset'],0)
        self.assertEqual(result['families']['soccer']['availability_reason'],'no_eligible_markets')
        self.assertEqual(result['families']['soccer']['next_fixture_date'], (now+timedelta(hours=25)).date().isoformat())

class CatalogueCache(unittest.IsolatedAsyncioTestCase):
    async def test_compact_catalogue_serves_existing_snapshot_while_refreshing(self):
        now = time.monotonic()
        started = []
        ns = load('server.py', {'_catalogue_snapshot'}, {
            'time': time, 'PREDICTION_CACHE_TTL': 300,
            '_prediction_cache': {'matches': [{'id': 'existing'}], 'timestamp': now - 40},
            '_ensure_prediction_snapshot_task': lambda: started.append(True),
        })
        snapshot, mode = await ns['_catalogue_snapshot'](True)
        self.assertEqual(mode, 'refreshing')
        self.assertEqual(snapshot['matches'], [{'id': 'existing'}])
        self.assertEqual(started, [True])
        self.assertIsNot(snapshot, ns['_prediction_cache'])


class RenewalCohort(unittest.TestCase):
    def test_first_month_requires_completed_grace_and_counts_one_cycle_per_customer(self):
        now = datetime(2026, 11, 10, tzinfo=timezone.utc)
        ns = load('server.py', {'_quality_payment_metrics'}, {
            'timedelta': timedelta, '_quality_time': lambda value: value,
            '_quality_number': float,
        })
        def row(user, ref, ago, duration=30, environment='live'):
            paid = now - timedelta(days=ago)
            return dict(user_id=user, reference=ref, status='approved', approved_at=paid,
                        created_at=paid, payment_environment=environment, amount_fcfa=10500,
                        activation_expires_at=paid + timedelta(days=duration))
        rows = [row('a', 'a1', 55), row('a', 'a2', 27), row('b', 'b1', 40),
                row('c', 'c1', 34), row('test', 'test', 45, environment='sandbox')]
        data = ns['_quality_payment_metrics'](rows, now, 30)
        self.assertEqual((data['first_30d_due'], data['first_30d_renewed']), (2, 1))
        self.assertEqual(data['first_30d_renewal_percent'], 50)


class SubscriptionExample(unittest.IsolatedAsyncioTestCase):
    async def test_only_settled_wins_are_requested_and_frozen_odds_are_public(self):
        async def find_one(query, fields, **kwargs):
            self.assertEqual(query["result"], "won")
            self.assertTrue(query["is_primary_official"])
            self.assertEqual(query["is_combo"], {"$ne": True})
            self.assertEqual(fields["_id"], 0)
            return {"pick": "Choix", "pick_odds": 1.7, "official_snapshot": {
                "pick_odds": 1.8, "user_email": "internal@example.test",
            }}
        tree = ast.parse((ROOT / "server.py").read_text())
        route = next(n for n in tree.body if getattr(n, "name", None) == "subscription_analysis_example")
        route.decorator_list = []
        ns = dict(Response=object, datetime=datetime, timezone=timezone,
                  db=SimpleNamespace(predictions_history=SimpleNamespace(find_one=find_one)))
        exec(compile(ast.Module(body=[route], type_ignores=[]), "preview-regression", "exec"), ns)
        result = await ns["subscription_analysis_example"](SimpleNamespace(headers={}))
        self.assertEqual(result["example"]["result"], "won")
        self.assertEqual(result["example"]["pick_odds"], 1.8)
        self.assertNotIn("official_snapshot", result["example"])
        self.assertNotIn("user_email", result["example"])
