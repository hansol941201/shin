/**
 * POUR 특허 / 타사 특허 분리와 다특허 처리 검증
 *   node pour-integration/test/multipatent.test.js
 */
const assert = require("assert");
const PourPatents = require("../pour-patents.js");
const PourRecords = require("../pour-records.js");
const PourExport = require("../pour-export.js");

function memoryStorage() {
  const map = {};
  return { getItem: k => (k in map ? map[k] : null), setItem: (k, v) => { map[k] = String(v); } };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); failed++; }
}
function section(t) { console.log("\n" + t); }

const patentStore = memoryStorage();
PourPatents.load([
  ["특허번호", "특허명", "공종"],
  ["1935719", "POUR공법", "재도장"],
  ["2425081", "POUR 슬라브공법", "슬라브"],
  ["2535699", "POUR 에폭시공법", "에폭시"]
], patentStore);
PourRecords.usePatentStorage(patentStore);

const P = PourRecords.POUR, T = PourRecords.THIRD_PARTY;

/* ------------------------------------------------------------------ */
section("1. POUR 특허와 타사 특허 분리 저장");

const mixed = PourRecords.normalize({
  client: "혼합현장",
  patentItems: [
    { kind: P, number: "제10-1935719호", name: "POUR공법", category: "재도장" },
    { kind: T, number: "10-2091977", name: "균열보수 공법", company: "타사명", category: "재도장", remark: "공고문 기재 특허" }
  ]
});

test("POUR 번호와 타사 번호가 서로 다른 필드에 저장", () => {
  assert.deepStrictEqual(mixed.patentNumbers, ["1935719"]);
  assert.deepStrictEqual(mixed.thirdPatentNumbers, ["2091977"]);
});

test("특허 항목마다 요청한 데이터가 저장됨", () => {
  const third = mixed.patentItems.find(i => i.kind === T);
  assert.ok(third.id, "고유 ID");
  assert.strictEqual(third.kind, "THIRD_PARTY");
  assert.strictEqual(third.number, "2091977", "정규화된 번호");
  assert.strictEqual(third.display, "제10-2091977호", "표시용 번호");
  assert.strictEqual(third.name, "균열보수 공법");
  assert.strictEqual(third.company, "타사명");
  assert.strictEqual(third.category, "재도장");
  assert.strictEqual(third.remark, "공고문 기재 특허");
  assert.ok(third.createdAt && third.updatedAt, "등록일·수정일");
});

test("타사 번호도 여러 표기를 같은 번호로 인식", () => {
  ["제10-2091977호", "10-2091977", "2091977"].forEach(v => {
    const r = PourRecords.normalize({ patentItems: [{ kind: T, number: v }] });
    assert.strictEqual(r.thirdPatentNumbers[0], "2091977", v);
  });
});

test("POUR 자동검색 결과에 타사 특허가 절대 섞이지 않음", () => {
  // 타사 번호로 검색해도 우리 특허 자료에는 없으므로 추천되지 않는다
  assert.strictEqual(PourPatents.search("2091977", 10, patentStore).length, 0);
  assert.strictEqual(PourPatents.find("2091977", patentStore), null);
});

/* ------------------------------------------------------------------ */
section("2. 특허 개수 제한 없음 · 중복 방지");

test("POUR 3개 · 타사 4개 이상 저장 가능", () => {
  const many = PourRecords.normalize({
    patentItems: [
      { kind: P, number: "1935719" }, { kind: P, number: "2425081" }, { kind: P, number: "2535699" },
      { kind: T, number: "2091977" }, { kind: T, number: "2474761" },
      { kind: T, number: "1234567" }, { kind: T, number: "7654321" }
    ]
  });
  assert.strictEqual(many.patentNumbers.length, 3);
  assert.strictEqual(many.thirdPatentNumbers.length, 4);
});

test("같은 구분 안에서 같은 번호는 한 번만 저장", () => {
  const dup = PourRecords.normalize({
    patentItems: [{ kind: P, number: "1935719" }, { kind: P, number: "제10-1935719호" }]
  });
  assert.strictEqual(dup.patentNumbers.length, 1);
});

test("POUR와 타사에 같은 번호가 있으면 경고 대상", () => {
  const clash = PourRecords.normalize({
    patentItems: [{ kind: P, number: "1935719" }, { kind: T, number: "1935719" }]
  });
  assert.deepStrictEqual(PourRecords.conflictingPatents(clash), ["1935719"]);
  assert.ok(PourRecords.CONFLICT_MESSAGE.includes("특허 구분을 확인해 주세요"));
});

/* ------------------------------------------------------------------ */
section("3. 다특허 자동 판정과 배지");

const cases = [
  { name: "POUR 1 + 타사 0", pour: 1, third: 0, multi: false, badge: null },
  { name: "POUR 2 + 타사 0", pour: 2, third: 0, multi: true, badge: "pour", color: "파란색" },
  { name: "POUR 1 + 타사 1", pour: 1, third: 1, multi: true, badge: "mixed", color: "보라색" },
  { name: "POUR 1 + 타사 3", pour: 1, third: 3, multi: true, badge: "mixed", color: "보라색" },
  { name: "POUR 0 + 타사 3", pour: 0, third: 3, multi: true, badge: "third", color: "회색" }
];

const POOL_P = ["1935719", "2425081", "2535699"];
const POOL_T = ["2091977", "2474761", "1234567", "7654321"];

cases.forEach(c => {
  test(c.name + " → " + (c.multi ? "다특허" : "단일특허"), () => {
    const items = POOL_P.slice(0, c.pour).map(n => ({ kind: P, number: n }))
      .concat(POOL_T.slice(0, c.third).map(n => ({ kind: T, number: n })));
    const stats = PourRecords.patentStats(PourRecords.normalize({ patentItems: items }), patentStore);
    assert.strictEqual(stats.isMulti, c.multi);
    assert.strictEqual(stats.totalCount, c.pour + c.third);
    assert.strictEqual(stats.detail, "POUR " + c.pour + "개 · 타사 " + c.third + "개");
    if (c.badge) {
      assert.strictEqual(stats.badge, c.badge);
      assert.strictEqual(stats.badgeColor, c.color);
    }
  });
});

test("POUR 1 + 타사 3 이면 '다특허 · 총 4개'", () => {
  const items = [{ kind: P, number: "1935719" }]
    .concat(POOL_T.slice(0, 3).map(n => ({ kind: T, number: n })));
  const stats = PourRecords.patentStats(PourRecords.normalize({ patentItems: items }), patentStore);
  assert.strictEqual(stats.label, "다특허 · 총 4개");
  assert.strictEqual(stats.detail, "POUR 1개 · 타사 3개");
});

test("공고문 다특허 체크 + 번호 부족 → '다특허 번호 확인 필요' (주황색)", () => {
  const stats = PourRecords.patentStats(
    PourRecords.normalize({ noticeMultiFlag: true, patentItems: [] }), patentStore);
  assert.strictEqual(stats.label, "다특허 번호 확인 필요");
  assert.strictEqual(stats.status, "다특허 번호 확인 필요");
  assert.strictEqual(stats.badgeColor, "주황색");
});

test("엑셀에 없는 POUR 번호는 자동 확정하지 않고 검토 대상", () => {
  const stats = PourRecords.patentStats(
    PourRecords.normalize({ patentItems: [{ kind: P, number: "8888888" }] }), patentStore);
  assert.strictEqual(stats.status, "POUR 특허 검토 필요");
  assert.deepStrictEqual(stats.unverified, ["8888888"]);
});

/* ------------------------------------------------------------------ */
section("4. 알림 규칙");

const store = memoryStorage();
const awarded = base => Object.assign({
  categories: ["재도장"], contractor: "가나건설", contractorPhone: "031-000-1111",
  awardDate: "2026-05-01", awardAmount: 1000, status: "낙찰"
}, base);

const thirdOnly = PourRecords.save(awarded({
  client: "타사만입력", patentItems: [{ kind: T, number: "2091977", company: "타사명" }]
}), store);
PourRecords.save(awarded({ client: "POUR확정", patentItems: [{ kind: P, number: "1935719" }] }), store);
PourRecords.save(awarded({ client: "타공법", status: "타공법 낙찰", patentItems: [] }), store);
PourRecords.save({ client: "다특허미확인", status: "공고", noticeMultiFlag: true, patentItems: [] }, store);

test("타사 번호만 입력해도 POUR 미기재 알림이 해제되지 않음", () => {
  const missing = PourRecords.missingPatentRecords(PourRecords.list(store), patentStore);
  assert.ok(missing.some(r => r.client === "타사만입력"), "타사만 입력한 낙찰이 빠짐");
});

test("POUR 특허가 확정된 낙찰과 타공법 낙찰은 알림 제외", () => {
  const missing = PourRecords.missingPatentRecords(PourRecords.list(store), patentStore)
    .map(r => r.client);
  assert.ok(!missing.includes("POUR확정"));
  assert.ok(!missing.includes("타공법"));
});

test("알림이 종류별로 나뉘어 표시", () => {
  const groups = PourRecords.alerts(PourRecords.list(store), patentStore);
  const byKey = {};
  groups.forEach(g => { byKey[g.key] = g; });
  assert.ok(byKey.missingPour, "POUR 미기재 알림 없음");
  assert.ok(byKey.missingPour.label.includes("POUR 특허번호 미기재 낙찰"), byKey.missingPour.label);
  assert.ok(byKey.multiUnknown, "다특허 확인 알림 없음");
  assert.ok(byKey.multiUnknown.label.includes("다특허 번호 확인 필요"), byKey.multiUnknown.label);
});

test("타공법 낙찰로 바꾸면 POUR 미기재 알림에서 빠짐", () => {
  PourRecords.update(thirdOnly.id, { status: "타공법 낙찰" }, store);
  const missing = PourRecords.missingPatentRecords(PourRecords.list(store), patentStore);
  assert.ok(!missing.some(r => r.id === thirdOnly.id));
});

/* ------------------------------------------------------------------ */
section("5. 특허별 실적 · 현황 분리");

const store2 = memoryStorage();
PourRecords.save({
  client: "혼합현장", region: "경기", city: "평택", status: "낙찰",
  categories: ["재도장"], contractor: "가나", contractorPhone: "031-1", awardDate: "2026-05-01", awardAmount: 5000,
  patentItems: [
    { kind: P, number: "1935719", name: "POUR공법" },
    { kind: T, number: "2091977", name: "균열보수 공법", company: "타사명" }
  ]
}, store2);
PourRecords.save({
  client: "타사만현장", region: "충남", city: "금산", status: "낙찰",
  categories: ["재도장"], contractor: "나다", contractorPhone: "041-1", awardDate: "2026-05-02", awardAmount: 7000,
  patentItems: [{ kind: T, number: "2091977", name: "균열보수 공법", company: "타사명" }]
}, store2);

test("POUR 특허별 실적 탭에 타사 특허가 포함되지 않음", () => {
  const records = PourRecords.list(store2);
  const tabs = PourRecords.patentTabs(PourPatents.list(patentStore), records);
  assert.ok(!tabs.some(t => t.number === "2091977"), "타사 특허가 POUR 탭에 나타남");
  const rows = PourRecords.recordsForPatent("1935719", records);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].client, "혼합현장");
});

test("POUR 낙찰 집계에 타사 전용 현장이 들어가지 않음", () => {
  const records = PourRecords.list(store2);
  const summary = PourRecords.summarize(PourRecords.recordsForPatent("1935719", records));
  assert.strictEqual(summary.awarded, 1);
  assert.strictEqual(summary.amount, 5000, "타사 전용 현장 금액이 합산됨");
});

/* ------------------------------------------------------------------ */
section("6. 자료 이전 (기존 특허번호 → 새 구조)");

test("기존 patentNumbers 자료가 POUR 특허 항목으로 옮겨짐", () => {
  const legacy = memoryStorage();
  legacy.setItem(PourRecords.STORAGE_KEY, JSON.stringify([
    { id: "old-1", client: "옛자료", patentNumbers: ["1935719", "8888888"], patentNames: ["POUR공법", ""] }
  ]));
  const result = PourRecords.migratePatentItems(legacy, patentStore);
  assert.strictEqual(result.records, 1);
  assert.strictEqual(result.movedPourPatents, 2);
  const moved = PourRecords.list(legacy)[0];
  assert.strictEqual(moved.patentItems.length, 2);
  assert.ok(moved.patentItems.every(i => i.kind === "POUR"));
  assert.deepStrictEqual(moved.patentNumbers, ["1935719", "8888888"], "기존 번호가 사라지면 안 됨");
});

test("엑셀과 일치하지 않는 번호는 자동 확정하지 않고 검토 대상으로 표시", () => {
  const legacy = memoryStorage();
  legacy.setItem(PourRecords.STORAGE_KEY, JSON.stringify([
    { id: "old-2", client: "검토대상", patentNumbers: ["8888888"] }
  ]));
  const result = PourRecords.migratePatentItems(legacy, patentStore);
  assert.strictEqual(result.needsReview.length, 1);
  assert.strictEqual(result.needsReview[0].number, "8888888");
});

test("이전 결과를 되돌릴 수 있음", () => {
  const legacy = memoryStorage();
  legacy.setItem(PourRecords.STORAGE_KEY, JSON.stringify([
    { id: "old-3", client: "되돌리기", patentNumbers: ["1935719"] }
  ]));
  PourRecords.migratePatentItems(legacy, patentStore);
  const back = PourRecords.rollbackMigration(legacy);
  assert.strictEqual(back.ok, true);
  assert.strictEqual(back.restored, 1);
  assert.deepStrictEqual(PourRecords.list(legacy)[0].patentNumbers, ["1935719"]);
});

/* ------------------------------------------------------------------ */
section("7. 목록·엑셀 열 분리");

test("전체 목록에 POUR·타사 분리 열이 있음", () => {
  const titles = PourRecords.COLUMNS.map(c => c.title);
  ["POUR 특허번호", "POUR 특허명·공법명", "타사 특허번호", "타사 특허명·공법명",
   "타사 특허 보유 회사", "특허 구분", "POUR 특허 개수", "타사 특허 개수",
   "전체 특허 개수", "다특허 여부", "특허 확인 상태"].forEach(t =>
    assert.ok(titles.includes(t), t + " 열 없음"));
});

test("여러 번호와 명칭이 한 셀 안에서 줄바꿈", () => {
  const rec = PourRecords.normalize({
    patentItems: [
      { kind: P, number: "1935719", name: "POUR공법" },
      { kind: P, number: "2425081", name: "POUR 슬라브공법" },
      { kind: T, number: "2091977", name: "균열보수 공법", company: "타사명" },
      { kind: T, number: "2474761", name: "방수 공법", company: "다른회사" }
    ]
  });
  const col = t => PourRecords.COLUMNS.find(c => c.title === t);
  assert.strictEqual(PourRecords.displayValue(rec, col("POUR 특허번호"), 0),
    "제10-1935719호\n제10-2425081호");
  assert.strictEqual(PourRecords.displayValue(rec, col("타사 특허번호"), 0),
    "제10-2091977호\n제10-2474761호");
  assert.strictEqual(PourRecords.displayValue(rec, col("타사 특허 보유 회사"), 0), "타사명\n다른회사");
  assert.strictEqual(PourRecords.displayValue(rec, col("특허 구분"), 0), "POUR·타사");
  assert.strictEqual(PourRecords.displayValue(rec, col("다특허 여부"), 0),
    "다특허 · 총 4개 (POUR 2개 · 타사 2개)");
});

test("CSV에도 분리된 열이 그대로 나감", () => {
  const csv = PourExport.toCsv(PourRecords.list(store2));
  const header = csv.replace(/^﻿/, "").split("\r\n")[0];
  assert.ok(header.includes("타사 특허번호"), header);
  assert.ok(header.includes("POUR 특허번호"), header);
  assert.ok(header.indexOf("POUR 특허번호") < header.indexOf("타사 특허번호"), "열 순서");
});

/* ------------------------------------------------------------------ */
section("8. 드롭다운 안내 문구");

test("특허 자료가 없으면 업로드 안내", () => {
  assert.strictEqual(PourPatents.emptyMessage(memoryStorage()),
    "먼저 POUR 특허 엑셀을 업로드해 주세요.");
});

test("자료는 있는데 결과가 없으면 다른 문구", () => {
  assert.strictEqual(PourPatents.emptyMessage(patentStore), "일치하는 POUR 특허가 없습니다.");
});

test("193 · 23 · POUR 검색이 POUR 특허만 반환", () => {
  ["193", "POUR"].forEach(q => {
    const hits = PourPatents.search(q, 10, patentStore);
    assert.ok(hits.length > 0, q + " 결과 없음");
    hits.forEach(h => assert.ok(PourPatents.find(h.number, patentStore), "우리 특허가 아님: " + h.number));
  });
});

console.log("\n" + "=".repeat(52));
console.log(`  통과 ${passed} · 실패 ${failed}`);
console.log("=".repeat(52));
if (failed) process.exit(1);
