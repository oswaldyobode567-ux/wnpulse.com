"""Offline regression checks: no credentials or provider calls."""
import ast, asyncio, copy, re, sys, unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional
sys.path.insert(0, str(Path(__file__).parents[1]))
from montante_service import MontanteService
SOURCE=(Path(__file__).parents[1]/'server.py').read_text()

def load(names, ns):
    nodes=[n for n in ast.parse(SOURCE).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'server-regression','exec'),ns)
    return ns
class Cursor:
    def __init__(self,rows): self.rows=rows
    def limit(self,n): return self
    async def to_list(self,**kwargs): return self.rows
class History:
    def __init__(self,linked,rows): self.linked=linked; self.rows=rows; self.writes=[]
    def find(self,query): return Cursor(self.rows)
    async def find_one(self,query): return self.linked
    async def update_one(self,query,update): self.writes.append(query); self.linked.update(update['$set'])
class Regression(unittest.IsolatedAsyncioTestCase):
    async def test_same_event_score_regrades_actual_pick_not_other_winner(self):
        start=datetime.now(timezone.utc).isoformat()
        linked={'_id':'target','match_id':'event','result':'pending','commence_time':start,'pick':'Away'}
        rows=[{'commence_time':start,'final_score':'2-0','pick':'Home','result':'won'}]
        h=History(linked,rows)
        async def get(p): return linked
        ns={'Dict':Dict,'Optional':Optional,'datetime':datetime,'timezone':timezone,'re':re,
            '_montante_linked_prediction_doc':get,'_parse_iso':datetime.fromisoformat,
            '_evaluate_pick_result':lambda p,h,a:'lost' if p['pick']=='Away' and h>a else 'won',
            'db':type('DB',(),{'predictions_history':h})()}
        load({'_montante_resolve_from_event_score'},ns)
        result=await ns['_montante_resolve_from_event_score']({})
        self.assertEqual(result['result'],'lost'); self.assertEqual(h.writes[0]['result'],'pending')
    async def test_conflicting_final_scores_do_not_settle(self):
        start=datetime.now(timezone.utc).isoformat()
        linked={'_id':'target','match_id':'event','result':'pending','commence_time':start}
        h=History(linked,[{'commence_time':start,'final_score':'2-0'},{'commence_time':start,'final_score':'0-2'}])
        async def get(p): return linked
        ns={'Dict':Dict,'Optional':Optional,'datetime':datetime,'timezone':timezone,'re':re,
            '_montante_linked_prediction_doc':get,'_parse_iso':datetime.fromisoformat,
            'db':type('DB',(),{'predictions_history':h})()}
        load({'_montante_resolve_from_event_score'},ns)
        self.assertIsNone(await ns['_montante_resolve_from_event_score']({}));self.assertFalse(h.writes)
    async def test_result_task_is_detached_and_coalesced(self):
        event=asyncio.Event()
        async def work(): await event.wait()
        ns={'asyncio':asyncio,'_montante_result_task':None,'_scheduled_montante_result_sync':work}
        load({'_queue_montante_results'},ns)
        self.assertTrue(ns['_queue_montante_results']());self.assertFalse(ns['_queue_montante_results']())
        event.set();await ns['_montante_result_task']
    def test_eligible_list_is_not_truncated_to_pair_search_pool(self):
        service=MontanteService()
        # Exercise aggregation separately from market evidence, which has its own tests.
        service._extract_markets=lambda m:[m]
        service._normalize=lambda m,p:m
        service._qualifies=lambda m:True
        rows=[{'event_id':str(i),'home_team':f'Home {i}','away_team':f'Away {i}',
            'selection_score':80+i/100,'expected_return':.1,'model_probability':.8,
            'legacy_selection_score':80,'start_time':'2026-11-10T12:00:00Z'} for i in range(55)]
        self.assertEqual(len(service.select_daily_picks(rows)),2)
        self.assertEqual(len(service.last_eligible),55)
    def test_preview_does_not_publish_and_is_admin_only(self):
        tree=ast.parse(SOURCE)
        endpoint=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='montante_candidates')
        self.assertIn('_require_admin(payload)',ast.unparse(endpoint))
        choose=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='_montante_choose_pair')
        self.assertIn('selector = copy.copy(montante_selector)',ast.unparse(choose))
        self.assertIn('selection_unchanged',ast.unparse(choose))
if __name__=='__main__': unittest.main()
