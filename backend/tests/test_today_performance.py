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
