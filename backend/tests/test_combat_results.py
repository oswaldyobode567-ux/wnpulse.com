import ast,copy,re,unicodedata,unittest
from pathlib import Path
from datetime import datetime,timedelta,timezone

def load():
 tree=ast.parse((Path(__file__).parents[1]/'odds_service.py').read_text())
 names={'_combat_name','is_combat_prediction','_parse_ufc_results','evaluate_combat_result'}
 ns={'re':re,'unicodedata':unicodedata}
 def date(v):
  try:return datetime.fromisoformat(str(v).replace('Z','+00:00'))
  except ValueError:return None
 ns['_result_dt']=date
 exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'combat-tests','exec'),ns)
 return ns
class Combat(unittest.TestCase):
 def setUp(self):
  self.ns=load();self.now=datetime.now(timezone.utc);self.start=(self.now-timedelta(hours=4)).isoformat()
  self.bout={'id':'bout','date':self.start,'status':{'type':{'completed':True,'state':'post'}},'competitors':[{'athlete':{'displayName':'José Souza'},'winner':True},{'athlete':{'displayName':'Jonny Parsons'},'winner':False}]}
  self.payload={'events':[{'id':'event','competitions':[self.bout]}]}
  self.pred={'sport_key':'mma_mixed_martial_arts','market':'h2h','pick':'Jose Souza','home_team':'Jonny Parsons','away_team':'Jose Souza','commence_time':self.start}
 def parse(self):return self.ns['_parse_ufc_results'](self.payload,self.now)
 def grade(self):return self.ns['evaluate_combat_result'](self.pred,self.parse())
 def test_final_winner_accent_and_reversed_order(self):self.assertEqual(self.grade()['result'],'won')
 def test_losing_pick(self):self.pred['pick']='Jonny Parsons';self.assertEqual(self.grade()['result'],'lost')
 def test_no_fictional_score(self):self.assertNotIn('final_score',self.grade());self.assertNotIn('scores',self.parse()[0])
 def test_live_winner_flag_not_enough(self):self.bout['status']['type']['completed']=False;self.assertEqual(self.parse(),[])
 def test_future_bout_not_settled(self):self.bout['date']=(self.now+timedelta(hours=1)).isoformat();self.assertEqual(self.parse(),[])
 def test_draw_no_winner_not_guessed(self):self.bout['competitors'][0]['winner']=False;self.assertEqual(self.parse(),[])
 def test_conflicting_winners_not_guessed(self):self.bout['competitors'][1]['winner']=True;self.assertEqual(self.parse(),[])
 def test_different_opponent_not_matched(self):self.pred['home_team']='Different Opponent';self.assertIsNone(self.grade())
 def test_other_date_not_matched(self):self.pred['commence_time']=(self.now-timedelta(days=7)).isoformat();self.assertIsNone(self.grade())
 def test_round_total_not_settled_using_winner(self):self.pred.update(market='totals',pick='Over',pick_point=2.5);self.assertIsNone(self.grade())
 def test_numeric_other_sport_excluded(self):self.pred['sport_key']='soccer_epl';self.assertIsNone(self.grade())
 def test_conflicting_final_sources_remain_pending(self):
  rows=self.parse();other=copy.deepcopy(rows[0]);other['winner']='Jonny Parsons';rows.append(other)
  self.assertIsNone(self.ns['evaluate_combat_result'](self.pred,rows))
if __name__=='__main__':unittest.main()
