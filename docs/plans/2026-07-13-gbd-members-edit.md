# 회원 명부 전체 편집 + 벙 출석 반영 — 구현 계획

**설계:** `docs/specs/2026-07-13-gbd-members-edit.md`
**Tech:** 순수 ES 모듈 + Firebase 10.12.0 ESM + `node --test`. `index.html` 불변.

## Task 1: `applyManualAttendance` 순수 함수 + 테스트 (TDD)

**Files:** Modify `gbd_members_logic.js`, `tests/gbd_members_logic.test.mjs`

**Interface:** `applyManualAttendance(att, bungDate, today) -> {attendCount,lastAttendDate,recent2mo}` (새 객체)

- [ ] Step 1: 실패 테스트 추가
  - bungDate falsy → 원본과 deepEqual, 그러나 다른 객체(불변)
  - 미래 bungDate → 원본과 동일 값
  - 이번 달 벙 → attendCount+1, recent2mo+1
  - 두 달 밖 벙 → attendCount+1, recent2mo 불변
  - lastAttendDate = max(앱, 벙)
- [ ] Step 2: 실패 확인 `node --test tests/gbd_members_logic.test.mjs`
- [ ] Step 3: 구현 — `recentMonths` 재사용, 미래 가드
- [ ] Step 4: 통과 확인 (기존 15 + 신규 = 전부 PASS)
- [ ] Step 5: 커밋 `feat(members): 벙 출석 수동 반영 순수 함수 + 테스트`

## Task 2: 화면 병합 렌더 + 벙 출석일 열

**Files:** Modify `gbd_members.html`

- [ ] import 에 `getDoc, deleteDoc` 추가
- [ ] `applyManualAttendance` import
- [ ] `render()`: `att` 를 병합값으로 만들어 `verdict`/`graduatedType`/열 표시에 사용
- [ ] `<thead>` 와 `rowHtml` 에 `벙 출석일` 열(`<input type="date" data-edit="bungDate">`) 추가 (`마지막 출석` 옆)
- [ ] 로컬 문법 검사(firebase 스텁 후 `node --check`)
- [ ] 커밋 `feat(members): 벙 출석일 열 + 판정 병합`

## Task 3: 전체 인라인 편집 (출생·지역·구분·가입일) + 이름 리네임

**Files:** Modify `gbd_members.html`

- [ ] `rowHtml`: 출생(number)·지역(text)·구분(select)·가입일(date)·이름(text)을 편집 컨트롤로. `data-edit="필드"` / 이름은 `data-rename`
- [ ] `#rows` `change` 위임: `data-edit` → `updateDoc({[필드]: 정규화값})` 후 `load()`. birth 빈값→null, joinDate 빈값→null
- [ ] 이름 `data-rename` → `renameMember(oldId,newName)`: 빈값·중복 검사, `confirm()` 경고(과거 앱 출석 매칭 안 됨), `getDoc`→`setDoc`(새 id)→`deleteDoc`(옛 id)→`load()`. 취소 시 값 복원
- [ ] `upsert`/`addMember` 기본값에 `bungDate:null`
- [ ] 로컬 문법 검사
- [ ] 커밋 `feat(members): 전 항목 인라인 편집 + 이름 리네임`

## Task 4: 배포 + 확인

- [ ] `node --test tests/gbd_members_logic.test.mjs` 전부 PASS
- [ ] `git push origin main`
- [ ] 라이브 200 확인
- [ ] 대표에게: 벙 출석일 입력→퇴출에서 빠지는지, 각 칸 수정 저장되는지 확인 요청

## Self-Review

- 벙 판정 반영: Task 1(로직)+2(렌더 병합)
- 전체 편집: Task 3
- 이름 리네임 파괴성 경고: Task 3
- index.html 불변: 전체
- 미래 벙 무시·자동 만료: Task 1
