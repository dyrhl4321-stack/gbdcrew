# 회원 명부 전체 편집 + 벙 출석 반영 설계

> `gbd_members.html` 확장. 원 설계: `docs/specs/2026-07-10-gbd-members-design.md`.
> 판정 로직: `gbd_members_logic.js`. **`index.html` 은 건드리지 않는다.**

## 문제

- 벙(오프 모임)은 출첵앱을 거치지 않아 `gbd_meetings`/`gbd_archive` 에 남지 않는다. 그래서 벙만 나온 회원은 `computeAttendance` 상 출석 0회로 잡혀 **퇴출 대상**으로 뜬다.
- 퇴출 판정은 화면의 `마지막 출석` 이 아니라 `recent2mo`(최근 2개 캘린더 월 출석 횟수)로 결정된다. 따라서 표시용 날짜만 고쳐서는 판정이 바뀌지 않는다.
- 초기 시딩값(출생·지역·가입일·구분)에 오류가 있어도 지금은 닉네임만 인라인 수정 가능하다. 나머지는 제외 후 재추가뿐이라 불편하다.

## 목표

운영진이 회원 명부의 **모든 칸을 표에서 직접 수정**하고, **벙 출석을 기록하면 그것이 퇴출·병아리 졸업 판정에 그대로 반영**된다.

## 규칙

### 벙 출석 (`bungDate`)

- 회원 문서에 `bungDate` 한 칸 추가. "가장 최근 벙 참석일" 하나(`YYYY-MM-DD`), 없으면 `null`.
- 판정 시 벙 날짜를 **출석 1회로 얹는다**(앱 집계 `computeAttendance` 는 그대로 두고, 얹기만):
  - `attendCount + 1` → 병아리면 자동 졸업(`graduatedType` 이 `attendCount>0` 을 보므로 자동)
  - `lastAttendDate` = 앱 마지막 출석과 벙 날짜 중 **더 최근** 날짜
  - 벙 날짜가 **이번 달 또는 지난 달**(캘린더 월)이면 `recent2mo + 1` → 기존 회원 퇴출에서 빠짐
  - **미래 날짜는 무시**(아직 안 일어난 벙). 앱 집계가 미래 모임을 안 세는 것과 동일한 원칙.
- 벙 날짜가 캘린더 2개월을 벗어나면 자동으로 `recent2mo` 기여가 사라져 다시 퇴출 후보가 된다(재참석 필요). 별도 삭제 불필요.

### 전체 인라인 편집

표의 각 칸을 즉시 저장되는 입력으로 바꾼다. 저장 후 그 줄의 판정·색을 다시 계산한다.

| 칸 | 컨트롤 | 저장 필드 | 비고 |
|---|---|---|---|
| 이름(실명) | text | 문서 id | **리네임**: 새 id 로 복사→옛 문서 삭제. 확인창 필수 |
| 닉네임 | text | `nickname` | 기존 |
| 출생 | number | `birth` | 빈값이면 `null` |
| 지역 | text | `region` | |
| 구분 | select(병아리/기존) | `type` = `new`/`old` | 자동 졸업과 별개로 수동 지정 가능 |
| 가입일 | date | `joinDate` | 빈값이면 `null` |
| 벙 출석일 | date | `bungDate` | 신규 |

- **이름 리네임**은 파괴적(문서 id 변경 + 과거 앱 출석이 옛 이름에 남음)이라 `confirm()` 으로 경고하고, 취소 시 값을 되돌린다. 모임 문서까지의 소급 수정은 범위 밖 — 필요하면 `bungDate` 로 보정한다.
- 구분=병아리인데 가입일이 비면 판정이 기존대로 `"가입일 없음 — 수동 확인"`(ambiguous)으로 스스로 표시한다. 강제 검증하지 않는다.

## 구현

### `gbd_members_logic.js` (순수·테스트)

```
applyManualAttendance(att, bungDate, today) -> att'
```
- `att`: `{attendCount, lastAttendDate, recent2mo}` (computeAttendance 결과 한 명분)
- `bungDate`: `"YYYY-MM-DD"` 또는 falsy
- 반환: 새 객체(입력 불변). bungDate 가 없거나 미래면 원본 값을 그대로 복사해 반환.
- 내부에서 기존 `recentMonths(today)` 재사용.

`computeAttendance`, `verdict`, `graduatedType`, `duplicateNames`, `parseYmd` 는 변경 없음.

### `gbd_members.html`

- import 에 `getDoc`, `deleteDoc` 추가(리네임용).
- 렌더에서 `att = applyManualAttendance(state.attendance[name]||EMPTY, m.bungDate, today)` 로 병합한 뒤 그 `att` 로 `verdict`/`graduatedType` 호출. `출석`·`마지막 출석`·`최근 2개월` 열도 병합값 표시.
- 표에 `벙 출석일` 열 추가(`마지막 출석` 옆).
- 편집 이벤트: `#rows` 위임으로 `data-edit="필드"` 입력의 `change` → `updateDoc` 후 `load()`(리렌더). 이름은 `data-rename` 으로 분리해 확인창+리네임 절차.
- `upsert`/`addMember` 에 `bungDate:null` 기본 포함.

## 테스트 (`node --test`)

`applyManualAttendance`:
1. bungDate 없으면 원본과 동일(불변).
2. 미래 bungDate 는 무시.
3. 최근 2개월 안 벙 → attendCount+1, recent2mo+1.
4. 2개월 밖 벙 → attendCount+1, recent2mo 그대로.
5. lastAttendDate 는 앱 날짜와 벙 날짜 중 더 최근.
6. 병아리+벙(최근) → `verdict` 가 kick 아님(졸업 후 recent2mo≥1). (통합 확인)

## 범위 밖 (YAGNI)

- 벙 참석 이력 다건 관리(최신 1개면 판정 충분).
- 모임 문서 소급 리네임.
- 이름 변경 시 과거 출석 자동 이전.
