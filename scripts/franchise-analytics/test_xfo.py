"""@spec spec://modules/franchises/FEAT-005-franchise-analytics#xfo"""
import unittest,math,json,pathlib
from xfo import defense_points,from_components,match_xfo,h2h_score

class XfoTest(unittest.TestCase):
 def test_h2h_captain_is_already_doubled(self):
  self.assertEqual(h2h_score('18',True),18)
  self.assertEqual(h2h_score('18',True,individual=True),9)
  self.assertEqual(h2h_score('—'),0)
  self.assertIsNone(h2h_score(None))
 def test_minutes_threshold(self):
  self.assertEqual(defense_points('d',59,1),0)
  self.assertAlmostEqual(defense_points('d',60,1),1.195608183807188)
  self.assertEqual(defense_points('s',90,None),0)
 def test_unknown_not_zero(self):
  self.assertIsNone(match_xfo({'minutes':90,'xg':None,'xa':0,'recoveries':3},'d',1))
  self.assertIsNone(defense_points('d',60,None))
  self.assertEqual(match_xfo({'minutes':0},'d',None),0)
 def test_full_match_bonus_and_cards(self):
  self.assertEqual(match_xfo({'minutes':90,'xg':1,'xa':1,'recoveries':6,'yellow_cards':1},'s',None),11)
 def test_excel_fill_requires_detailed_match(self):
  self.assertAlmostEqual(match_xfo({'minutes':90,'saves':3},'gk',1,excel_missing=True),4.195608183807188)
  self.assertIsNone(match_xfo({'minutes':90,'saves':3},'gk',None,excel_missing=True))
 def test_workbook(self):
  path=pathlib.Path(__file__).with_name('xfo-workbook-fixture.json')
  if not path.exists():self.fail('Missing workbook fixture')
  data=json.loads(path.read_text('utf-8'));mismatches=0
  for r in data['rows']:
   actual=from_components(r['position'],r['xg'],r['xa'],r['time'],r['cards'],r['extra'],r['xga'],60 if r['time']>=2 else 30,r['doubles'])
   self.assertAlmostEqual(actual,r['formula_result'],places=10,msg=r['name'])
   mismatches+=abs(actual-r['cached'])>1e-8
  self.assertEqual(mismatches,72)

if __name__=='__main__':unittest.main()
