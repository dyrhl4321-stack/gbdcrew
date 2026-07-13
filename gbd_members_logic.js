/* 근방단 회원 명부 — 순수 판정 로직.
 * Firebase 도 DOM 도 모른다. 그래야 node 로 테스트할 수 있다. */

/** "2026-07-10" → 로컬 자정 Date. new Date(s) 는 UTC 자정이라 하루 밀린다. */
export function parseYmd(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
}

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
    const future = parseYmd(m.date) > t;        // 미래 모임은 등록만 하고 세지 않는다
    const inRecent = months.includes(m.date.slice(0, 7));

    (m.members || []).forEach((name, i) => {
      if (!out[name]) out[name] = { attendCount: 0, lastAttendDate: null, recent2mo: 0 };
      if (future || !isAttend((m.status || [])[i])) return;
      const rec = out[name];
      rec.attendCount++;
      if (inRecent) rec.recent2mo++;
      if (!rec.lastAttendDate || m.date > rec.lastAttendDate) rec.lastAttendDate = m.date;
    });
  }
  return out;
}

/** 벙(오프앱) 출석을 집계 결과에 얹는다. computeAttendance 는 그대로 두고 한 명분 att 만 보정.
 * 벙은 출첵앱을 안 거쳐 모임 문서에 없으므로, 최근 벙 날짜 하나를 "출석 1회"로 더한다.
 * 입력 att 는 변형하지 않고 새 객체를 반환한다. 미래 날짜는 아직 안 일어난 벙이라 무시한다. */
export function applyManualAttendance(att, bungDate, today) {
  const a = { ...(att || { attendCount: 0, lastAttendDate: null, recent2mo: 0 }) };
  if (!bungDate) return a;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (parseYmd(bungDate) > t) return a;                 // 미래 벙은 세지 않는다
  a.attendCount += 1;                                   // 병아리 졸업(attendCount>0)에도 기여
  if (recentMonths(t).includes(bungDate.slice(0, 7))) a.recent2mo += 1;
  if (!a.lastAttendDate || bungDate > a.lastAttendDate) a.lastAttendDate = bungDate;
  return a;
}

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
