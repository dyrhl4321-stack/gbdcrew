import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeAttendance, parseYmd,
  duplicateNames, verdict, graduatedType, addMonths,
} from "../gbd_members_logic.js";

const today = parseYmd("2026-07-10");
const EMPTY = { attendCount: 0, lastAttendDate: null, recent2mo: 0 };

/* ---- 출석 집계 ---- */

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

/* ---- 동명이인·판정 ---- */

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
