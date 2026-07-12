# -*- coding: utf-8 -*-
"""유령회원 정리 0709.xlsx → gbd_members_seed.js

정제 규칙 (설계서 '초기 데이터' 참고):
  1. 오늘보다 미래인 가입일은 연도에서 1을 뺀다 (엑셀 입력 실수, 대표 확인)
  2. 시트1(전체) + 시트2(병아리) 를 이름으로 병합. 겹치는 사람의 가입일은 일치한다
  3. 김준성 동명이인 중 1994·송파구(이미 탈퇴)는 버리고 1995·강남구만 남긴다
  4. 가입일이 있으면 type="new", 없으면 "old"
"""
import datetime, json, sys
from pathlib import Path
import openpyxl

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

XLSX = Path(r"C:\Users\won\Desktop\김현수 컴카드\근방단\근방단출석체크\유령회원 정리 0709.xlsx")
OUT = Path(__file__).resolve().parents[1] / "gbd_members_seed.js"
TODAY = datetime.date.today()


def fix_date(v):
    if not isinstance(v, datetime.datetime):
        return None
    d = v.date()
    return d.replace(year=d.year - 1) if d > TODAY else d


def read(ws, off):
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        v = list(r[off:off + 5])
        if not v[0]:
            continue
        out.append({
            "name": str(v[0]).strip(),
            "birth": int(v[1]) if v[1] else None,
            "region": str(v[2]).strip() if v[2] else "",
            "join": fix_date(v[3]),
        })
    return out


wb = openpyxl.load_workbook(XLSX, data_only=True)
s1 = read(wb["시트1"], 1)
s2 = read(wb["시트2"], 0)

drop = lambda rows: [r for r in rows if not (r["name"] == "김준성" and r["birth"] == 1994)]
s1, s2 = drop(s1), drop(s2)

roster = {}
for r in s1:
    roster[r["name"]] = dict(r)
for r in s2:
    if r["name"] in roster:
        roster[r["name"]]["join"] = r["join"]
        if not roster[r["name"]]["region"]:
            roster[r["name"]]["region"] = r["region"]
    else:
        roster[r["name"]] = dict(r)

seed = []
for name in sorted(roster):
    r = roster[name]
    seed.append({
        "name": name,
        "nickname": "",
        "birth": r["birth"],
        "region": r["region"],
        "type": "new" if r["join"] else "old",
        "joinDate": r["join"].isoformat() if r["join"] else None,
    })

body = ",\n".join("  " + json.dumps(m, ensure_ascii=False) for m in seed)
OUT.write_text(
    "/* 엑셀 '유령회원 정리 0709.xlsx' 에서 생성. 손으로 고치지 말 것.\n"
    " * 다시 만들려면: python scripts/build_members_seed.py */\n"
    f"export const SEED = [\n{body}\n];\n",
    encoding="utf-8",
)

new = sum(1 for m in seed if m["type"] == "new")
print(f"{len(seed)}명 (병아리 {new}, 기존 {len(seed) - new}) → {OUT.name}")
