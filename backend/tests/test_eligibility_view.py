import ast,copy,re,sys,unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta
from typing import Dict
sys.path.insert(0,str(Path(__file__).parents[1]))
from montante_service import MontanteService
ROOT=Path(__file__).parents[1]

def load(path,names,ns):
 tree=ast.parse((ROOT/path).read_text())
 exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names],type_ignores=[]),'eligibility-check','exec'),ns)
 return ns
class Eligibility(unittest.TestCase):
 def setUp(self):self.now=datetime.now(timezone.utc)
 def test_full_snapshot_retains_all_candidates_as_historical(self):
  ns=load('server.py',{'_montante_candidate_snapshot'},{'_parse_iso':lambda v:datetime.fromisoformat(v) if v else None})
  rows=[{'event_id':str(i),'match_id':str(i),'pick':'A','start_time':(self.now+timedelta(hours=1)).isoformat()} for i in range(55)]
  report=ns['_montante_candidate_snapshot']({'eligible_events':rows,'montante_id':'old','day':8,'captured_at':self.now.isoformat()},{'id':'new','current_picks':[]},self.now)
  self.assertEqual(len(report['items']),55);self.assertTrue(report['complete']);self.assertFalse(report['same_cycle'])
  self.assertTrue(all(r['historical'] for r in report['items']))
 def test_legacy_contenders_are_explicitly_partial_and_deduplicated(self):
  ns=load('server.py',{'_montante_candidate_snapshot'},{'_parse_iso':lambda v:datetime.fromisoformat(v) if v else None})
  report=ns['_montante_candidate_snapshot']({'contenders':[{'match_id':'a','pick':'A'},{'match_id':'a','pick':'B'}]}, {},self.now)
  self.assertEqual(len(report['items']),1);self.assertFalse(report['complete'])
 def book(self,age=0,explicit_old=False):
  stamp=(self.now-timedelta(minutes=age)).isoformat()
  rows=[{'name':'Home','price':1.4},{'name':'Away','price':8.},{'name':'Draw','price':8.}]
  if explicit_old:
   for row in rows:row['_quote_updated_at']=(self.now-timedelta(hours=4)).isoformat()
  return {'key':'a','markets':[{'key':'h2h','last_update':stamp,'outcomes':rows}]}
 def test_fresh_market_timestamp_cannot_refresh_old_individual_quotes(self):
  service=MontanteService()
  self.assertIsNone(service._book_h2h(self.book(explicit_old=True),'home','away',self.now))
  self.assertIsNotNone(service._book_h2h(self.book(),'home','away',self.now))
 def test_stale_sources_have_specific_diagnostic(self):
  service=MontanteService()
  match={'home_team':'Home','away_team':'Away','_bookmakers':[{**self.book(age=180),'key':str(i)} for i in range(3)]}
  market={'market':'h2h','pick_raw':'Home','pick':'Home'}
  self.assertIsNone(service._evidence(match,market,self.now+timedelta(hours=1)))
  self.assertEqual(service.last_diagnostic['rejections']['stale_or_undated_sources'],1)
 def test_fresh_market_with_stale_outcome_does_not_qualify(self):
  service=MontanteService()
  match={'home_team':'Home','away_team':'Away','_bookmakers':[{**self.book(explicit_old=True),'key':str(i)} for i in range(3)]}
  self.assertIsNone(service._evidence(match,{'market':'h2h','pick_raw':'Home'},self.now+timedelta(hours=1)))
 def test_refresh_preserves_unrelated_events_and_quote_timestamps(self):
  source=(ROOT/'odds_service.py').read_text()
  fn=source[source.index('async def refresh_montante_quote_window'):]
  self.assertIn('else:merged.append(row)',fn)
  self.assertIn('jobs[:2]',fn);self.assertIn('category="odds"',fn)
  self.assertNotIn('delete_',fn)
 def test_analysis_copy_removes_old_quotes_without_touching_catalogue(self):
  service=MontanteService()
  old=self.book(age=180);old['key']='old'
  rows=[{'id':'a','bookmakers':[old,self.book()]}];before=copy.deepcopy(rows)
  result=service.fresh_analysis_matches(rows)
  self.assertEqual(rows,before);self.assertEqual(len(result),1)
  self.assertEqual([b['key'] for b in result[0]['bookmakers']],['a'])
 def test_empty_quote_match_is_kept_in_analysis_copy(self):
  result=MontanteService().fresh_analysis_matches([{'id':'a','bookmakers':[self.book(age=180)]}])
  self.assertEqual(result[0]['id'],'a');self.assertEqual(result[0]['bookmakers'],[])
 def test_candidate_routes_remain_admin_only(self):
  tree=ast.parse((ROOT/'server.py').read_text())
  for name in ('montante_candidates','refresh_montante_candidate_quotes'):
   node=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name==name)
   self.assertIn('_require_admin(payload)',ast.unparse(node))

class QuoteWindow(unittest.IsolatedAsyncioTestCase):
 async def test_two_sports_merge_without_reducing_cache_or_rejuvenating_old_line(self):
  import asyncio
  from types import SimpleNamespace
  now=datetime.now(timezone.utc);old=(now-timedelta(hours=4)).isoformat();fresh=now.isoformat()
  matches=[{'id':str(i),'sport_key':'soccer_'+letter,'home_team':'Home '+letter,'away_team':'Away '+letter,
    'commence_time':(now+timedelta(hours=2)).isoformat(),'bookmakers':[{'key':'book','markets':[{'key':'totals','last_update':old,'outcomes':[{'name':'Under','point':3.5,'price':1.2}]}]}]} for i,letter in enumerate('abc')]
  class Collection:
   def __init__(self,value):self.value=value
   async def find_one(self,query):return copy.deepcopy(self.value)
   async def update_one(self,query,update,**kwargs):self.value.update(copy.deepcopy(update['$set']));return SimpleNamespace(modified_count=1)
  db=SimpleNamespace(odds_cache=Collection({'_id':'all_matches','updated_at':old,'data':matches}),scores_cache=Collection({}))
  calls=[]
  class Client:
   def __init__(self,**kwargs):pass
   async def __aenter__(self):return self
   async def __aexit__(self,*args):pass
  async def get(database,client,url,**kwargs):
   calls.append(kwargs);row=copy.deepcopy(matches[len(calls)-1]);row['bookmakers']=[{'key':'book','markets':[{'key':'totals','last_update':fresh,'outcomes':[{'name':'Under','point':2.5,'price':1.5}]}]}]
   return SimpleNamespace(raise_for_status=lambda:None,json=lambda:[row])
  ns={'asyncio':asyncio,'datetime':datetime,'timezone':timezone,'timedelta':timedelta,'re':re,'copy':copy,
    'httpx':SimpleNamespace(AsyncClient=Client),'_result_dt':lambda v:datetime.fromisoformat(v) if v else None,
    '_budgeted_primary_get':get,'ODDS_API_BASE':'https://provider.test','ODDS_API_KEY':'test-only',
    '_EXTRA_MARKET_CANONICAL':{},'PrimaryBudgetError':type('PrimaryBudgetError',(Exception,),{})}
  load('odds_service.py',{'refresh_montante_quote_window','_merge_market_quotes'},ns)
  report=await ns['refresh_montante_quote_window'](db)
  self.assertEqual(len(calls),2);self.assertEqual(report['updated_events'],2)
  self.assertEqual(len(db.odds_cache.value['data']),3)
  self.assertEqual(db.odds_cache.value['updated_at'],old)
  self.assertEqual(db.odds_cache.value['data'][2],matches[2])
  rows=db.odds_cache.value['data'][0]['bookmakers'][0]['markets'][0]['outcomes']
  self.assertEqual(next(r for r in rows if r['point']==3.5)['_quote_updated_at'],old)
  self.assertEqual(next(r for r in rows if r['point']==2.5)['_quote_updated_at'],fresh)
  self.assertTrue(all(c['category']=='odds' and c['params']['regions']=='eu' for c in calls))

if __name__=='__main__':unittest.main()
