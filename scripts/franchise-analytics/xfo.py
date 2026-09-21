"""Spreadsheet formula, independent of forecasts. @spec spec://modules/franchises/FEAT-005-franchise-analytics#xfo"""
import math

POSITIONS={'GK':'gk','DEF':'d','MID':'m','FWD':'s','Вр':'gk','Зщ':'d','Пз':'m','Нп':'s','1':'gk','2':'d','3':'m','4':'s'}

def defense_points(position,minutes,xga):
 if minutes<60 or position=='s':return 0.0
 if xga is None or not math.isfinite(xga) or xga<0:return None
 p0=math.exp(-xga)
 if position=='m':return p0
 return p0*(4-xga**2/2-xga**3/6-2*xga**4/24)

def from_components(position,xg,xa,time_points,cards,recoveries_saves,xga,minutes,doubles=0):
 position=POSITIONS.get(str(position),position)
 if position not in ['gk','d','m','s']:return None
 vals=[xg,xa,time_points,cards,recoveries_saves,minutes,doubles]
 if any(v is None or not math.isfinite(v) for v in vals):return None
 if xg<0 or xa<0 or minutes<0:return None
 defense=defense_points(position,minutes,xga)
 if defense is None:return None
 return xg*{'gk':6,'d':6,'m':5,'s':4}[position]+3*xa+time_points+cards+recoveries_saves+defense+doubles

def match_xfo(stat,position,xga,excel_missing=False):
 position=POSITIONS.get(str(position),position);minutes=stat.get('minutes')
 if minutes is None:return None
 if minutes==0:return 0.0
 xg=stat.get('xg');xa=stat.get('xa')
 # Workbook IFERROR convention, explicitly enabled by the caller. Require a rich
 # match (opponent xG present) before filling player event components with zero.
 fill=excel_missing and xga is not None
 if fill:xg=0.0 if xg is None else xg;xa=0.0 if xa is None else xa
 # Explicit zero attempts allow a zero; an absent attempts field does not.
 if xg is None and stat.get('shots')==0:xg=0.0
 if xa is None and stat.get('key_passes')==0:xa=0.0
 saves=stat.get('saves') if position=='gk' else stat.get('recoveries')
 if saves is None and fill:saves=0
 if saves is None:return None
 time_points=1+int(minutes>=60)+int(minutes>=90 and position in ['m','s'])
 return from_components(position,xg,xa,time_points,-(stat.get('yellow_cards') or 0)-3*(stat.get('red_cards') or 0),saves//3,xga,minutes)
def h2h_score(value, captain=False, individual=False):
 """H2H already doubles the displayed captain score; dash is a recorded DNP."""
 if value in ('—','–','-'):return 0.0
 try:score=float(str(value).replace(',','.'))
 except (ValueError,TypeError):return None
 if not math.isfinite(score):return None
 return score/2 if captain and individual else score

def compare_xi(players,finished):
 """Compare the same eleven base scores, undoing H2H's captain multiplier."""
 if not finished or len(players)!=11 or sum(bool(p.get('is_cap')) for p in players)!=1:return None,None
 expected=[p.get('xfo') for p in players]
 actual=[h2h_score(p.get('score'),p.get('is_cap',False),individual=True) for p in players]
 if any(v is None or not math.isfinite(v) for v in expected):return None,None
 return sum(expected),sum(actual) if all(v is not None for v in actual) else None
