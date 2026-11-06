import ast,copy,re,unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta

def load():
 tree=ast.parse((Path(__file__).parents[1]/'server.py').read_text())
 names={'_market_analysis_snapshot','_restore_market_analysis','_annotate_alternative_results'}
 nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
 def parse(v):
  try:return datetime.fromisoformat(v.replace('Z','+00:00'))
  except (ValueError,AttributeError):return None
 ns={'copy':copy,'re':re,'_parse_iso':parse,'_evaluate_pick_result':lambda p,h,a:'won' if p['pick']=='Home' and h>a else 'lost'}
 exec(compile(ast.Module(body=nodes,type_ignores=[]),'snapshot-extract','exec'),ns);return ns
class SnapshotTests(unittest.TestCase):
 def setUp(self):
  self.ns=load();self.now=datetime.now(timezone.utc);self.kickoff=self.now+timedelta(hours=1)
  self.p={'commence_time':self.kickoff.isoformat(),'pick':'Official','markets':[{'market':'h2h','pick':'Home','pick_odds':1.4}],'recommendations':[]}
 def test_snapshot_only_before_kickoff(self):
  self.assertIsNotNone(self.ns['_market_analysis_snapshot'](self.p,self.now))
  self.assertIsNone(self.ns['_market_analysis_snapshot'](self.p,self.kickoff))
 def test_restore_after_kickoff_without_changing_official(self):
  snapshot=self.ns['_market_analysis_snapshot'](self.p,self.now)
  result=self.ns['_restore_market_analysis']({'pick':'Official','markets':[]},snapshot,self.kickoff)
  self.assertEqual(result['pick'],'Official');self.assertEqual(len(result['markets']),1)
  self.assertTrue(result['analysis_snapshot']['archived']);self.assertFalse(result['analysis_snapshot']['live_estimate'])
 def test_no_retroactive_snapshot(self):
  snapshot={'captured_at':self.kickoff.isoformat(),'commence_time':self.kickoff.isoformat(),'markets':[{'pick':'Home'}]}
  row={'pick':'Official'};self.ns['_restore_market_analysis'](row,snapshot,self.kickoff)
  self.assertNotIn('markets',row)
 def test_bounded_snapshot_and_no_alias(self):
  self.p['markets']*=201;snapshot=self.ns['_market_analysis_snapshot'](self.p,self.now)
  self.assertEqual(len(snapshot['markets']),200)
  snapshot['markets'][0]['pick']='Changed';self.assertEqual(self.p['markets'][0]['pick'],'Home')
 def test_unconfirmed_score_does_not_grade(self):
  self.p['analysis_snapshot']={'prematch':True}
  self.ns['_annotate_alternative_results'](self.p,{'result':'pending','final_score':'2-0','reconciled_at':'now'})
  self.assertNotIn('result',self.p['markets'][0])
 def test_alternative_result_does_not_change_official(self):
  self.p['analysis_snapshot']={'prematch':True}
  self.ns['_annotate_alternative_results'](self.p,{'result':'lost','final_score':'2-0','reconciled_at':'now'})
  self.assertEqual(self.p['markets'][0]['result'],'won');self.assertEqual(self.p['pick'],'Official')
 def test_no_grade_without_prematch_evidence(self):
  self.ns['_annotate_alternative_results'](self.p,{'result':'won','final_score':'2-0','reconciled_at':'now'})
  self.assertNotIn('result',self.p['markets'][0])
