import ast, math, os, unittest
from pathlib import Path
from unittest.mock import patch

def load():
    tree=ast.parse((Path(__file__).parents[1]/"prediction_engine.py").read_text())
    names={"_hybrid_number","_primary_config","_absolute_win_probability","_choose_primary","_primary_order","_describe_primary_policy"}
    nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
    ns={"MIN_ODDS":1.15,"PRIMARY_POLICY_VERSION":"test","_market_sort_key":lambda c:float(c.get("wp_score",0))}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),"primary-extract","exec"),ns)
    return ns

def candidate(odds, probability, **extra):
    return {"pick":"test", "pick_odds":odds,"estimated_win_probability":probability,
            "num_books":5,"analysis_quality":"strong","stability_score":90,**extra}

class PrimaryTests(unittest.TestCase):
    def setUp(self):self.ns=load()
    def test_default_floor_120(self):
        with patch.dict(os.environ,{},clear=True):self.assertEqual(self.ns["_primary_config"]()[0],1.20)
    def test_120_is_not_rejected_for_more_expensive_pick(self):
        low=candidate(1.20,85);high=candidate(1.50,70)
        with patch.dict(os.environ,{},clear=True):self.assertIs(self.ns["_choose_primary"]([high,low]),low)
    def test_high_odds_can_win_when_probability_higher(self):
        high=candidate(2.00,78);low=candidate(1.20,69)
        self.assertIs(self.ns["_choose_primary"]([low,high]),high)
    def test_lowest_odds_receive_no_bonus(self):
        low=candidate(1.15,66);other=candidate(1.70,75)
        self.assertIs(self.ns["_choose_primary"]([low,other]),other)
    def test_conditional_refund_not_compared_to_absolute_as_83(self):
        conditional=candidate(1.3,None,model_probability=83,probability_basis="conditional_on_no_push")
        known=candidate(1.5,72)
        self.assertIs(self.ns["_choose_primary"]([conditional,known]),known)
    def test_known_refund_converts_to_absolute(self):
        conditional=candidate(1.3,None,model_probability=83,probability_basis="conditional_on_no_push",push_probability=20)
        self.assertAlmostEqual(self.ns["_absolute_win_probability"](conditional),66.4)
    def test_stale_not_selected_over_current(self):
        stale=candidate(1.2,92,quote_status="stale");fresh=candidate(1.6,72,quote_status="fresh")
        self.assertIs(self.ns["_choose_primary"]([stale,fresh]),fresh)
    def test_no_threshold_pass_still_keeps_candidate(self):
        row=candidate(1.5,49)
        self.assertIs(self.ns["_choose_primary"]([row]),row)
        result=self.ns["_describe_primary_policy"](row)
        self.assertTrue(result["primary_selection"]["fallback_used"])
        self.assertFalse(result["primary_selection"]["guaranteed_win"])
    def test_close_probabilities_prefer_evidence(self):
        weak=candidate(1.2,80,num_books=1,analysis_quality="limited")
        strong=candidate(1.4,79)
        self.assertIs(self.ns["_choose_primary"]([weak,strong]),strong)

class RuntimePolicyTests(unittest.IsolatedAsyncioTestCase):
    async def test_health_reports_configured_policy_without_credentials(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        from datetime import datetime, timezone
        tree=ast.parse((Path(__file__).parents[1]/"server.py").read_text())
        fn=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=="public_health")
        fn.decorator_list=[]
        ns={"db":SimpleNamespace(command=AsyncMock(return_value={"ok":1})),
            "datetime":datetime,"timezone":timezone,
            "_optional_prediction_engine":SimpleNamespace(PRIMARY_POLICY_VERSION="policy120",_primary_config=lambda:(1.20,60.))}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),"health-extract","exec"),ns)
        response=await ns["public_health"]()
        self.assertTrue(response["ok"])
        self.assertEqual(response["prediction_policy"]["preferred_min_odds"],1.20)
        self.assertEqual(set(response),{"ok","service","time","prediction_policy"})
        ns["db"].command.side_effect=RuntimeError("database offline")
        self.assertFalse((await ns["public_health"]())["ok"])
