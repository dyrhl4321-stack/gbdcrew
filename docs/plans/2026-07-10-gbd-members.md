# 근방단 회원 명부 `gbd_members.html` 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영진이 한 화면에서 회원 명부를 관리하고, 가입일·출석 기록에 근거한 퇴출 판정을 자동으로 본다.

**Architecture:** 판정 로직은 Firebase 를 모르는 순수 함수로 분리해 `gbd_members_logic.js` 에 둔다. `gbd_members.html` 은 Firestore 에서 읽어 그 함수에 넘기고 결과를 그린다. 초기 명부는 엑셀에서 뽑아 `gbd_members_seed.js` 상수로 박는다. `index.html` 은 건드리지 않는다.

**Tech Stack:** 순수 ES 모듈 + Firebase 10.12.0 ESM CDN + `node:test` (로직 테스트). 빌드 도구 없음. GitHub Pages 정적 배포.

## Global Constraints

- 설계서: `docs/specs/2026-07-10-gbd-members-design.md`. 모든 규칙의 근거는 여기다.
- Firebase 프로젝트 `gbdcrewcheck-2af48`, SDK `10.12.0`, ESM CDN (`index.html:490` 과 동일).
- 관리자 비번 `5252`. `index.html` 과 같은 방식의 클라이언트 게이트.
- 새 컬렉션 `gbd_members`. **문서 id = 실명.**
- 출석 = `status[i].attend === true` 또는 `status[i].late === true`. 취소·불참·미체크는 출석이 아니다.
- "최근 2개월" = **캘린더 월**. 이번 달 + 지난 달.
- 병아리(`type:"new"`)는 **첫 출석 시 `type:"old"` 로 졸업**하고 `joinDate` 는 남긴다.
- `status:"removed"` 는 숨김이며 삭제가 아니다.
- 날짜는 전부 `YYYY-MM-DD` 문자열. `new Date("2026-07-10")` 는 UTC 자정으로 파싱되므로 비교에는 반드시 `parseYmd()` 를 쓴다.
- 파일은 저장소 루트(`Desktop/근방단/출첵어플/`)에 둔다. GitHub Pages 가 루트를 서빙한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `gbd_members_logic.js` | 순수 함수. 출석 집계·동명이인 탐지·판정. Firebase/DOM 모름 |
| `gbd_members_seed.js` | 엑셀에서 뽑은 121명 상수 (`export const SEED`) |
| `gbd_members.html` | 화면. Firestore 읽기/쓰기, 렌더, 필터, CRUD, 시딩 버튼 |
| `scripts/build_members_seed.py` | 엑셀 → `gbd_members_seed.js` 생성기. 한 번 돌리고 결과를 커밋 |
| `tests/gbd_members_logic.test.mjs` | 로직 테스트 (`node --test`) |

---

### Task 1: 판정 로직 — 출석 집계

**Files:**
- Create: `gbd_members_logic.js`
- Test: `tests/gbd_members_logic.test.mjs`

**Interfaces:**
- Produces: `parseYmd(s) -> Date`, `computeAttendance(meetings, today) -> Record<string, {attendCount, lastAttendDate, recent2mo}>`
  - `meetings`: `[{date:"2026-06-07", members:["김현수"], status:[{attend,late,cancel,absent}]}]`
  - `today`: `Date`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/gbd_members_logic.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAttendance, parseYmd } from "../gbd_members_logic.js";

const today = parseYmd("2026-07-10");

test("지각은 출석으로 센다", () => {
  const meetings = [
    { date: "2026-07-01", members: ["김현수"], status: [{ late: true }] },
  ];
  const a = computeAttendance(meetings, today);
  assert.equal(a["김현수"].attendCount, 1);
});

test("불참·취소·미체크는 출석이 아니다", () => {
  const meetings = [
    { date: "2026-07-01", members: ["A", "B", "C"], status: [{ absent: true }, { cancel: true }, {}] },
  ];
  const a = computeAttendance(meetings, today);
  assert.equal(a["A"].attendCount, 0);
  assert.equal(a["B"].attendCount, 0);
  assert.equal(a["C"].attendCount, 0);
});

test("미래 모임은 세지 않는다", () => {
  const meetings = [{ date: "2026-08-01", members: ["김현수"], status: [{ attend: true }] }];
  assert.equal(computeAttendance(meetings, today)["김현수"].attendCount, 0);
});

test("마지막 출석일은 가장 최근 날짜", () => {
  const meetings = [
    { date: "2026-05-02", members: ["김현수"], status: [{ attend: true }] },
    { date: "2026-06-20", members: ["김현수"], status: [{ attend: true }] },
  ];
  assert.equal(computeAttendance(meetings, today)["김현수"].lastAttendDate, "2026-06-20");
});

test("recent2mo 는 이번 달과 지난 달만 센다", () => {
  const meetings = [
    { date: "2026-05-31", members: ["김현수"], status: [{ attend: true }] }, // 두 달 전
    { date: "2026-06-01", members: ["김현수"], status: [{ attend: true }] }, // 지난 달
    { date: "2026-07-09", members: ["김현수"], status: [{ attend: true }] }, // 이번 달
  ];
  const a = computeAttendance(meetings, today);
  assert.equal(a["김현수"].attendCount, 3);
  assert.equal(a["김현수"].recent2mo, 2);
});

test("1월엔 지난 달이 작년 12월", () => {
  const jan = parseYmd("2026-01-15");
  const meetings = [{ date: "2025-12-20", members: ["김현수"], status: [{ attend: true }] }];
  assert.equal(computeAttendance(meetings, jan)["김현수"].recent2mo, 1);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd "/c/Users/won/Desktop/근방단/출첵어플" && node --test tests/`
Expected: FAIL — `Cannot find module '../gbd_members_logic.js'`

- [ ] **Step 3: 최소 구현**

`gbd_members_logic.js`:

```js
/* 근방단 회원 명부 — 순수 판정 로직.
 * Firebase 도 DOM 도 모른다. 그래야 node 로 테스트할 수 있다. */

/** "2026-07-10" → 로컬 자정 Date. new Date(s) 는 UTC 자정이라 하루 밀린다. */
export function parseYmd(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const isAttend = (st) => !!(st && (st.attend || st.late));   // 지각도 출석

/** 이번 달과 지난 달의 "YYYY-MM" 두 개. */
function recentMonths(today) {
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const p = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prev = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
  return [cur, prev];
}

export function computeAttendance(meetings, today) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const months = recentMonths(t);
  const out = {};

  for (const m of meetings) {
    if (!m.date) continue;
    const md = parseYmd(m.date);
    if (md > t) continue;                       // 미래 모임은 세지 않는다
    const inRecent = months.includes(m.date.slice(0, 7));

    (m.members || []).forEach((name, i) => {
      if (!out[name]) out[name] = { attendCount: 0, lastAttendDate: null, recent2mo: 0 };
      if (!isAttend((m.status || [])[i])) return;
      const rec = out[name];
      rec.attendCount++;
      if (inRecent) rec.recent2mo++;
      if (!rec.lastAttendDate || m.date > rec.lastAttendDate) rec.lastAttendDate = m.date;
    });
  }
  return out;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/`
Expected: PASS — 6 tests

- [ ] **Step 5: 커밋**

```bash
git add gbd_members_logic.js tests/gbd_members_logic.test.mjs
git commit -m "feat(members): 출석 집계 순수 함수 + 테스트"
```

---

### Task 2: 판정 로직 — 동명이인·퇴출 판정

**Files:**
- Modify: `gbd_members_logic.js`
- Modify: `tests/gbd_members_logic.test.mjs`

**Interfaces:**
- Consumes: `computeAttendance`, `parseYmd`
- Produces:
  - `duplicateNames(members) -> Set<string>`
  - `addMonths(date, n) -> Date`
  - `verdict(member, att, today, dupSet) -> {code, label}`
    - `code` ∈ `"removed" | "ambiguous" | "grace" | "kick" | "ok"`
  - `graduatedType(member, att) -> "new" | "old"`

- [ ] **Step 1: 실패하는 테스트를 쓴다** (기존 파일에 이어붙인다)

```js
import { duplicateNames, verdict, graduatedType, addMonths } from "../gbd_members_logic.js";

const EMPTY = { attendCount: 0, lastAttendDate: null, recent2mo: 0 };

test("동명이인을 찾는다", () => {
  const d = duplicateNames([{ name: "김준성" }, { name: "김준성" }, { name: "김현수" }]);
  assert.deepEqual([...d], ["김준성"]);
});

test("addMonths 는 말일을 넘기지 않는다", () => {
  assert.equal(addMonths(parseYmd("2026-01-31"), 1).getDate(), 28); // 2026-02-28
});

test("제외된 회원이 최우선", () => {
  const m = { name: "A", type: "new", joinDate: "2020-01-01", status: "removed" };
  assert.equal(verdict(m, EMPTY, today, new Set()).code, "removed");
});

test("동명이인은 판정 보류", () => {
  const m = { name: "김준성", type: "old", status: "active" };
  assert.equal(verdict(m, EMPTY, today, new Set(["김준성"])).code, "ambiguous");
});

test("병아리 1개월 미경과는 유예", () => {
  const m = { name: "A", type: "new", joinDate: "2026-06-25", status: "active" };
  const v = verdict(m, EMPTY, today, new Set());
  assert.equal(v.code, "grace");
  assert.match(v.label, /D-15/);
});

test("병아리 1개월 경과 + 출석 0회는 퇴출", () => {
  const m = { name: "A", type: "new", joinDate: "2026-05-01", status: "active" };
  assert.equal(verdict(m, EMPTY, today, new Set()).code, "kick");
});

test("기존 회원은 최근 2개월 출석 0회면 퇴출", () => {
  const m = { name: "A", type: "old", status: "active" };
  assert.equal(verdict(m, EMPTY, today, new Set()).code, "kick");
  const att = { attendCount: 5, lastAttendDate: "2026-06-02", recent2mo: 1 };
  assert.equal(verdict(m, att, today, new Set()).code, "ok");
});

test("병아리는 첫 출석하면 기존으로 졸업", () => {
  const m = { name: "A", type: "new", joinDate: "2026-05-01" };
  assert.equal(graduatedType(m, EMPTY), "new");
  assert.equal(graduatedType(m, { ...EMPTY, attendCount: 1 }), "old");
});

test("졸업한 병아리는 기존 규칙으로 판정된다", () => {
  const m = { name: "A", type: "new", joinDate: "2026-05-01", status: "active" };
  const att = { attendCount: 1, lastAttendDate: "2026-05-02", recent2mo: 0 };
  assert.equal(verdict(m, att, today, new Set()).code, "kick");  // 최근 2개월 0회
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/`
Expected: FAIL — `duplicateNames is not a function`

- [ ] **Step 3: 최소 구현** (`gbd_members_logic.js` 에 이어붙인다)

```js
/** 이름이 두 번 이상 나오는 회원. 출석은 이름으로만 매칭되므로 자동 판정할 수 없다. */
export function duplicateNames(members) {
  const seen = new Map();
  for (const m of members) seen.set(m.name, (seen.get(m.name) || 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}

/** 말일을 넘기지 않는 월 덧셈. 1/31 + 1개월 = 2/28. */
export function addMonths(date, n) {
  const y = date.getFullYear();
  const m = date.getMonth() + n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(date.getDate(), last));
}

/** 병아리가 한 번이라도 출석했으면 기존으로 졸업. joinDate 는 기록으로 남긴다. */
export function graduatedType(member, att) {
  if (member.type === "new" && att && att.attendCount > 0) return "old";
  return member.type;
}

const DAY = 86400000;

/** 위에서부터 먼저 걸리는 것이 답이다. 설계서의 판정표와 순서가 같다. */
export function verdict(member, att, today, dupSet) {
  const a = att || { attendCount: 0, lastAttendDate: null, recent2mo: 0 };

  if (member.status === "removed") return { code: "removed", label: "제외됨" };
  if (dupSet.has(member.name)) return { code: "ambiguous", label: "판정 보류 — 수동 확인" };

  const type = graduatedType(member, a);

  if (type === "new") {
    if (!member.joinDate) return { code: "ambiguous", label: "가입일 없음 — 수동 확인" };
    const due = addMonths(parseYmd(member.joinDate), 1);
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (t < due) {
      const days = Math.ceil((due - t) / DAY);
      return { code: "grace", label: `유예 중 (D-${days})` };
    }
    return { code: "kick", label: "퇴출 대상 — 가입 1개월 무출석" };
  }

  if (a.recent2mo === 0) return { code: "kick", label: "퇴출 대상 — 2개월 무출석" };
  return { code: "ok", label: "정상" };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/`
Expected: PASS — 15 tests

- [ ] **Step 5: 커밋**

```bash
git add gbd_members_logic.js tests/gbd_members_logic.test.mjs
git commit -m "feat(members): 동명이인 탐지 + 퇴출 판정 규칙"
```

---

### Task 3: 엑셀 → 초기 명부 상수

**Files:**
- Create: `scripts/build_members_seed.py`
- Create: `gbd_members_seed.js` (스크립트가 생성)

**Interfaces:**
- Produces: `gbd_members_seed.js` 가 `export const SEED = [{name, nickname, birth, region, type, joinDate}]` 를 내보낸다. `nickname` 은 빈 문자열, `joinDate` 는 기존 회원이면 `null`.

- [ ] **Step 1: 생성기를 쓴다**

`scripts/build_members_seed.py`:

```python
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
```

- [ ] **Step 2: 돌려서 숫자를 확인한다**

Run: `cd "/c/Users/won/Desktop/근방단/출첵어플" && python scripts/build_members_seed.py`
Expected: `121명 (병아리 47, 기존 74) → gbd_members_seed.js`

숫자가 다르면 멈춘다. 설계서의 실측치와 어긋난 것이다.

- [ ] **Step 3: 생성된 파일을 검증한다**

Run:
```bash
node -e "import('./gbd_members_seed.js').then(m=>{
  const s=m.SEED;
  console.log('총', s.length);
  console.log('병아리', s.filter(x=>x.type==='new').length);
  console.log('가입일 없는 병아리', s.filter(x=>x.type==='new'&&!x.joinDate).length);
  console.log('중복 이름', s.length - new Set(s.map(x=>x.name)).size);
  console.log('출생년도 결측', s.filter(x=>!x.birth).length);
})"
```
Expected:
```
총 121
병아리 47
가입일 없는 병아리 0
중복 이름 0
출생년도 결측 0
```

- [ ] **Step 4: 커밋**

```bash
git add scripts/build_members_seed.py gbd_members_seed.js
git commit -m "feat(members): 엑셀에서 초기 명부 121명 생성"
```

---

### Task 4: 화면 골격 — 비번 게이트 + 명부 읽기 + 표

**Files:**
- Create: `gbd_members.html`

**Interfaces:**
- Consumes: `gbd_members_logic.js` 의 `computeAttendance`, `duplicateNames`, `verdict`, `graduatedType`
- Produces: 전역 없음. 모든 상태는 모듈 스코프 `state = { members, attendance, dupSet }`

- [ ] **Step 1: 파일을 만든다**

`gbd_members.html`:

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>근방단 회원 명부</title>
<style>
  :root { --bg:#0f1116; --card:#181b23; --line:#2a2f3d; --txt:#e6e9f0; --dim:#8b93a7;
          --chick:#ffd83d; --kick:#ff5b5b; --ok:#5ac97a; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--txt); font:14px/1.5 system-ui,"Malgun Gothic",sans-serif; }
  header { padding:16px 20px; border-bottom:1px solid var(--line); display:flex; gap:12px; align-items:center; }
  h1 { font-size:18px; margin:0; }
  main { padding:20px; }
  #gate { max-width:320px; margin:80px auto; text-align:center; }
  input, select, button { background:#11141b; color:var(--txt); border:1px solid var(--line);
                          border-radius:6px; padding:7px 10px; font:inherit; }
  button { cursor:pointer; }
  button.primary { background:#3d7eff; border-color:#3d7eff; color:#fff; }
  .sum { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
  .sum div { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px 14px; }
  .sum b { font-size:20px; display:block; }
  .bar { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; align-items:center; }
  .bar button.on { background:#2b3350; }
  table { width:100%; border-collapse:collapse; background:var(--card);
          border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  th, td { padding:9px 10px; border-bottom:1px solid var(--line); text-align:left; white-space:nowrap; }
  th { color:var(--dim); font-weight:600; font-size:12px; }
  tr.kick { background:rgba(255,91,91,.09); }
  tr.removed { opacity:.42; }
  .badge { border-radius:999px; padding:2px 8px; font-size:11px; font-weight:700; }
  .badge.chick { background:var(--chick); color:#3a2c00; }
  .badge.old { background:#2b3350; color:#b7c0d4; }
  .v.kick { color:var(--kick); font-weight:700; }
  .v.ok { color:var(--ok); }
  .v.grace, .v.ambiguous, .v.removed { color:var(--dim); }
  .hint { color:var(--dim); font-size:12px; }
  #orphans { margin-top:18px; }
  #orphans span { display:inline-block; background:#3a2c00; color:var(--chick);
                  border-radius:6px; padding:3px 8px; margin:3px 4px 0 0; }
</style>
</head>
<body>

<div id="gate">
  <h1>근방단 회원 명부</h1>
  <p class="hint">운영진 전용</p>
  <input id="pin" type="password" inputmode="numeric" placeholder="비밀번호" autocomplete="off">
  <button id="enter" class="primary">입장</button>
  <p id="pin-err" class="hint" style="color:#ff5b5b"></p>
</div>

<div id="app" hidden>
  <header>
    <h1>근방단 회원 명부</h1>
    <span id="asof" class="hint"></span>
  </header>
  <main>
    <div class="sum">
      <div><b id="s-total">0</b>전체</div>
      <div><b id="s-chick">0</b>병아리</div>
      <div><b id="s-kick">0</b>퇴출 대상</div>
      <div><b id="s-removed">0</b>제외됨</div>
    </div>

    <div class="bar">
      <button class="flt on" data-f="all">전체</button>
      <button class="flt" data-f="new">🐤 병아리</button>
      <button class="flt" data-f="old">기존</button>
      <button class="flt" data-f="kick">퇴출 대상</button>
      <button class="flt" data-f="removed">제외됨</button>
      <input id="q" placeholder="이름·닉네임 검색" style="margin-left:auto">
      <button id="add">＋ 회원 추가</button>
      <button id="seed">초기 데이터 넣기</button>
    </div>

    <table>
      <thead><tr>
        <th>이름</th><th>닉네임</th><th>출생</th><th>지역</th><th>구분</th>
        <th>가입일</th><th>출석</th><th>마지막 출석</th><th>최근 2개월</th><th>판정</th><th></th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>

    <div id="orphans"></div>
  </main>
</div>

<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, getDocs, setDoc, updateDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { computeAttendance, duplicateNames, verdict, graduatedType } from "./gbd_members_logic.js";
import { SEED } from "./gbd_members_seed.js";

const firebaseConfig = {
  apiKey: "AIzaSyBAdgC1pYJ9bAEWGTO_UoP4C84Q1d_jVtw",
  authDomain: "gbdcrewcheck-2af48.firebaseapp.com",
  projectId: "gbdcrewcheck-2af48",
  storageBucket: "gbdcrewcheck-2af48.firebasestorage.app",
  messagingSenderId: "57726309639",
  appId: "1:57726309639:web:9bb1edc21cb48fdd49a1a2"
};
const db = getFirestore(initializeApp(firebaseConfig));
const $ = (s) => document.querySelector(s);

const state = { members: [], attendance: {}, dupSet: new Set(), filter: "all", q: "" };
const today = new Date();

/* ---------------- 비번 게이트 (index.html 과 같은 방식) ---------------- */
$("#enter").onclick = () => {
  if ($("#pin").value !== "5252") { $("#pin-err").textContent = "비밀번호가 틀렸어요"; $("#pin").value = ""; return; }
  $("#gate").hidden = true; $("#app").hidden = false;
  load();
};
$("#pin").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#enter").click(); });

/* ---------------- 읽기 ---------------- */
async function load() {
  const [memSnap, meetSnap, arcSnap] = await Promise.all([
    getDocs(collection(db, "gbd_members")),
    getDocs(collection(db, "gbd_meetings")),
    getDocs(collection(db, "gbd_archive")),
  ]);
  state.members = memSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const meetings = [...meetSnap.docs, ...arcSnap.docs].map((d) => d.data());
  state.attendance = computeAttendance(meetings, today);
  state.dupSet = duplicateNames(state.members);
  state.meetingNames = new Set(meetings.flatMap((m) => m.members || []));
  $("#asof").textContent = `기준일 ${today.toISOString().slice(0, 10)} · 모임 ${meetings.length}건`;
  render();
}

/* ---------------- 렌더 ---------------- */
function render() {
  const rows = [];
  let nChick = 0, nKick = 0, nRemoved = 0;

  const sorted = [...state.members].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  for (const m of sorted) {
    const att = state.attendance[m.name] || { attendCount: 0, lastAttendDate: null, recent2mo: 0 };
    const v = verdict(m, att, today, state.dupSet);
    const type = graduatedType(m, att);

    if (v.code === "removed") nRemoved++;
    else if (type === "new") nChick++;
    if (v.code === "kick") nKick++;

    if (!passFilter(m, type, v)) continue;
    rows.push(rowHtml(m, att, v, type));
  }

  $("#rows").innerHTML = rows.join("") || `<tr><td colspan="11" class="hint">해당하는 회원이 없습니다.</td></tr>`;
  $("#s-total").textContent = state.members.length;
  $("#s-chick").textContent = nChick;
  $("#s-kick").textContent = nKick;
  $("#s-removed").textContent = nRemoved;
  renderOrphans();
}

function passFilter(m, type, v) {
  const f = state.filter;
  const q = state.q.trim();
  if (q && !(m.name.includes(q) || (m.nickname || "").includes(q))) return false;
  if (f === "all") return v.code !== "removed";
  if (f === "removed") return v.code === "removed";
  if (f === "kick") return v.code === "kick";
  if (f === "new") return v.code !== "removed" && type === "new";
  if (f === "old") return v.code !== "removed" && type === "old";
  return true;
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function rowHtml(m, att, v, type) {
  const badge = type === "new"
    ? `<span class="badge chick">🐤 병아리</span>`
    : `<span class="badge old">기존</span>`;
  const act = m.status === "removed"
    ? `<button data-restore="${esc(m.id)}">복원</button>`
    : `<button data-remove="${esc(m.id)}">제외</button>`;
  return `<tr class="${v.code === "kick" ? "kick" : ""} ${m.status === "removed" ? "removed" : ""}">
    <td>${esc(m.name)}</td>
    <td><input data-nick="${esc(m.id)}" value="${esc(m.nickname)}" size="8"></td>
    <td>${esc(m.birth)}</td><td>${esc(m.region)}</td><td>${badge}</td>
    <td>${esc(m.joinDate) || "—"}</td>
    <td>${att.attendCount}</td>
    <td>${esc(att.lastAttendDate) || "—"}</td>
    <td>${att.recent2mo}</td>
    <td class="v ${v.code}">${esc(v.label)}</td>
    <td>${act}</td>
  </tr>`;
}

function renderOrphans() {
  const known = new Set(state.members.map((m) => m.name));
  const orphans = [...(state.meetingNames || [])].filter((n) => !known.has(n)).sort();
  $("#orphans").innerHTML = orphans.length
    ? `<p class="hint">모임 명단에는 있는데 명부에 없는 이름 ${orphans.length}명 — 클릭하면 추가합니다.</p>` +
      orphans.map((n) => `<span data-orphan="${esc(n)}">${esc(n)}</span>`).join("")
    : `<p class="hint">모든 모임 참석자가 명부에 있습니다.</p>`;
}

/* ---------------- 이벤트 ---------------- */
document.querySelectorAll(".flt").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".flt").forEach((x) => x.classList.remove("on"));
  b.classList.add("on"); state.filter = b.dataset.f; render();
});
$("#q").oninput = (e) => { state.q = e.target.value; render(); };

load.__placeholder = true;   // Task 5 에서 CRUD 를 붙인다
</script>
</body>
</html>
```

- [ ] **Step 2: 로컬에서 열어 확인한다**

Run: `cd "/c/Users/won/Desktop/근방단/출첵어플" && python -m http.server 8899 --bind 127.0.0.1`
브라우저: `http://127.0.0.1:8899/gbd_members.html`

Expected:
- 비번 화면이 뜬다. `1234` 를 넣으면 "비밀번호가 틀렸어요"
- `5252` 를 넣으면 표가 뜬다. `gbd_members` 가 비어 있으므로 "해당하는 회원이 없습니다."
- 아래에 "모임 명단에는 있는데 명부에 없는 이름 N명" 목록이 뜬다 (Firestore 의 실제 참석자)

- [ ] **Step 3: 커밋**

```bash
git add gbd_members.html
git commit -m "feat(members): 명부 화면 골격 — 비번 게이트, 읽기, 표, 명부 밖 이름 경고"
```

---

### Task 5: 시딩 · 제외/복원 · 닉네임 · 추가

**Files:**
- Modify: `gbd_members.html` (`<script type="module">` 끝의 `load.__placeholder` 줄을 아래 코드로 교체)

**Interfaces:**
- Consumes: Task 4 의 `state`, `load()`, `render()`, `db`
- Produces: 없음 (UI 종단)

- [ ] **Step 1: CRUD 를 붙인다**

`load.__placeholder = true;` 줄을 지우고 그 자리에:

```js
/* ---------------- 쓰기 ---------------- */
const now = () => new Date().toISOString();

async function upsert(m) {
  await setDoc(doc(db, "gbd_members", m.name), { ...m, updatedAt: now() }, { merge: true });
}

/* 시딩: 이미 있는 문서는 건드리지 않는다. 덮어쓰기 금지. */
$("#seed").onclick = async () => {
  const have = new Set(state.members.map((m) => m.name));
  const todo = SEED.filter((m) => !have.has(m.name));
  if (!todo.length) { alert("이미 모두 들어 있습니다."); return; }
  if (!confirm(`${todo.length}명을 넣습니다. 기존 문서는 건드리지 않습니다.`)) return;
  for (const m of todo) {
    await setDoc(doc(db, "gbd_members", m.name), { ...m, status: "active", memo: "", createdAt: now(), updatedAt: now() });
  }
  alert(`${todo.length}명 추가 완료`);
  await load();
};

/* 제외 / 복원 — 삭제하지 않는다 */
$("#rows").addEventListener("click", async (e) => {
  const rm = e.target.dataset.remove, rs = e.target.dataset.restore;
  if (rm) {
    if (!confirm(`${rm} 님을 명부에서 제외합니다. 기록은 남습니다.`)) return;
    await updateDoc(doc(db, "gbd_members", rm), { status: "removed", updatedAt: now() });
    await load();
  } else if (rs) {
    await updateDoc(doc(db, "gbd_members", rs), { status: "active", updatedAt: now() });
    await load();
  }
});

/* 닉네임 인라인 저장 */
$("#rows").addEventListener("change", async (e) => {
  const id = e.target.dataset.nick;
  if (!id) return;
  await updateDoc(doc(db, "gbd_members", id), { nickname: e.target.value.trim(), updatedAt: now() });
  const m = state.members.find((x) => x.id === id);
  if (m) m.nickname = e.target.value.trim();
});

/* 회원 추가 */
async function addMember(preName) {
  const name = (preName ?? prompt("실명")) ?.trim();
  if (!name) return;
  if (state.members.some((m) => m.name === name)) { alert("이미 명부에 있습니다."); return; }
  const birth = Number(prompt("출생년도 (예: 1994)") || 0) || null;
  const region = (prompt("지역 (예: 송파구)") || "").trim();
  const joinDate = (prompt("병아리면 가입일 YYYY-MM-DD, 기존 회원이면 비워두세요") || "").trim() || null;
  if (joinDate && !/^\d{4}-\d{2}-\d{2}$/.test(joinDate)) { alert("가입일 형식이 잘못됐습니다."); return; }
  await upsert({ name, nickname: "", birth, region, type: joinDate ? "new" : "old",
                 joinDate, status: "active", memo: "", createdAt: now() });
  await load();
}
$("#add").onclick = () => addMember();
$("#orphans").addEventListener("click", (e) => {
  if (e.target.dataset.orphan) addMember(e.target.dataset.orphan);
});
```

- [ ] **Step 2: 손으로 확인한다**

`http://127.0.0.1:8899/gbd_members.html` 에서 비번 `5252` 입력 후:

| 확인 | 기대 |
|---|---|
| `초기 데이터 넣기` 클릭 | "121명을 넣습니다" 확인창 → 넣은 뒤 표에 121행 |
| 요약 숫자 | 전체 121, 병아리·퇴출 대상은 Firestore 출석에 따라 달라짐 |
| 한 번 더 `초기 데이터 넣기` | "이미 모두 들어 있습니다." (덮어쓰지 않음) |
| `🐤 병아리` 필터 | 노란 배지 행만 |
| `퇴출 대상` 필터 | 빨간 배경 행만 |
| 아무나 `제외` | 표에서 사라지고 `제외됨` 숫자 +1 |
| `제외됨` 필터 → `복원` | 되살아난다 |
| 닉네임 칸에 입력 후 포커스 이동 | 새로고침해도 남아 있다 |
| 명부 밖 이름 클릭 | 추가 프롬프트가 그 이름으로 채워진다 |

- [ ] **Step 3: 엑셀과 대조한다 (설계서의 검증)**

브라우저 콘솔에서:
```js
const s = document.querySelectorAll("#rows tr").length;
console.log("행 수", s);
```
`전체` 필터에서 121행. `퇴출 대상` 필터의 수를 엑셀 기준치(병아리 37명 + 기존 무출석자)와 비교한다.
**크게 어긋나면 이름 매칭이 깨진 것이다.** `명부에 없는 이름` 목록을 먼저 본다.

- [ ] **Step 4: 커밋**

```bash
git add gbd_members.html
git commit -m "feat(members): 시딩·제외/복원·닉네임 저장·회원 추가"
```

---

### Task 6: Firestore 보안 규칙

**Files:**
- Modify: Firebase 콘솔의 Firestore 규칙 (저장소에 `firestore.rules` 사본을 둔다)
- Create: `firestore.rules`

**Interfaces:**
- Consumes: 없음
- Produces: `gbd_members` 컬렉션 읽기/쓰기 허용

- [ ] **Step 1: 현재 규칙을 확인한다**

Firebase 콘솔 → Firestore → 규칙. `gbd_meetings` 가 어떻게 열려 있는지 본다.
**짐작하지 말 것.** 지금 이 앱은 익명 접근이므로 규칙이 이미 열려 있을 가능성이 높다.

- [ ] **Step 2: `gbd_members` 를 같은 수준으로 연다**

`firestore.rules` 에 사본을 남긴다:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /gbd_meetings/{doc} { allow read, write: if true; }
    match /gbd_archive/{doc}  { allow read, write: if true; }
    match /gbd_stats/{doc}    { allow read, write: if true; }
    match /gbd_members/{doc}  { allow read, write: if true; }
  }
}
```

> 비번 5252 는 클라이언트 게이트일 뿐이다. 이 규칙은 기존 컬렉션과 같은 수준이며,
> 보안을 강화하려면 네 컬렉션을 함께 바꿔야 한다. 이번 범위 밖.

- [ ] **Step 3: 콘솔에서 게시하고 화면에서 확인한다**

`gbd_members.html` 에서 `제외` → `복원` 이 오류 없이 동작하면 통과.
콘솔에 `permission-denied` 가 뜨면 규칙이 반영되지 않은 것이다.

- [ ] **Step 4: 커밋**

```bash
git add firestore.rules
git commit -m "chore(members): Firestore 규칙에 gbd_members 추가"
```

---

### Task 7: 배포

**Files:**
- Modify: 없음

- [ ] **Step 1: 전체 테스트를 돌린다**

Run: `node --test tests/`
Expected: PASS — 15 tests

- [ ] **Step 2: 푸시한다**

```bash
git push origin main
```

- [ ] **Step 3: 라이브에서 확인한다**

`https://dyrhl4321-stack.github.io/gbdcrew/gbd_members.html`
비번 입력 → 121명 표. 요약 숫자가 로컬과 같은지 본다.

- [ ] **Step 4: 대표에게 전달**

퇴출 대상 명단을 스크린샷으로 보여주고, 엑셀의 `유령회원` 판단과 어긋나는 사람이 있는지 확인받는다.

---

## Self-Review

**Spec coverage**

| 설계서 요구 | 태스크 |
|---|---|
| `gbd_members` 컬렉션, 문서 id = 실명 | 4, 5 |
| 닉네임 참고용 칸 | 4(표시), 5(저장) |
| `status: removed` 로 숨김, 삭제 안 함 | 5 |
| 출석 = attend 또는 late, 미래 모임 제외 | 1 |
| `recent2mo` = 캘린더 월 2개 | 1 |
| 판정 6단계 우선순위 | 2 |
| 병아리 첫 출석 시 졸업 | 2 |
| 동명이인 판정 보류 | 2 |
| 노란 형광 병아리 배지 | 4 |
| 필터·검색·요약 | 4 |
| 명부에 없는 이름 경고 + 클릭 추가 | 4, 5 |
| 엑셀 시딩 121명, 미래 날짜 보정, 김준성 정리 | 3, 5 |
| 시딩은 덮어쓰지 않음 | 5 |
| 비번 게이트 | 4 |
| index.html 안 건드림 | 전체 |

**Type consistency** — `verdict()` 의 `code` 는 `removed|ambiguous|grace|kick|ok` 다섯 개이며, Task 4 의 CSS 클래스(`.v.kick`, `.v.ok`, `.v.grace`, `.v.ambiguous`, `.v.removed`)와 `passFilter` 가 같은 문자열을 쓴다. `graduatedType()` 은 `"new"|"old"` 만 낸다.

**빠진 것** — 없음. 회원 정보 수정(출생년도·지역·가입일)은 이번 범위에서 닉네임만 인라인 편집하고, 나머지는 제외 후 재추가로 처리한다. 잦은 작업이 아니다 (YAGNI).
