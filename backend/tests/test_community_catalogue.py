import unittest
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Response
from community_catalogue import shortlist, community_shortlist, win_probability

class CommunityCatalogue(unittest.IsolatedAsyncioTestCase):
    def test_rank_official_selections_and_cap_shared(self):
        now=datetime.now(timezone.utc)
        def item(i,confidence,minutes=30,**extra):
            return {"match_id":str(i),"match":{"commence_time":(now+timedelta(minutes=minutes)).isoformat()},
                    "prediction":{"pick":"A","pick_odds":1.4,"confidence":confidence,**extra}}
        rows=[item(i,85-i) for i in range(11)]+[item(i,66) for i in range(11,16)]
        rows.extend([item(17,99,-1),item(18,99,1),item(19,99,selection_available=False)])
        selected=shortlist(rows,now)
        self.assertEqual(len(selected),10)
        self.assertEqual([p["prediction"]["community_profile"] for p in selected],["strong"]*8+["shared"]*2)
        self.assertEqual([p["id"] for p in selected[:8]],list(map(str,range(8))))
        self.assertIsNone(win_probability({"confidence":80,"probability_basis":"conditional_on_no_draw"}))
        self.assertEqual(win_probability({"confidence":80,"probability_basis":"conditional_on_no_draw","push_probability":25}),60)
    async def test_unauthorized_fails_before_loading_snapshot(self):
        with self.assertRaises(HTTPException) as err:
            await community_shortlist(Response(),"")
        self.assertEqual(err.exception.status_code,403)
