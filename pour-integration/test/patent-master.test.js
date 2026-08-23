/**
 * 특허 마스터 + 현장별 특허 기록 검증 (Node 실행)
 *   node pour-integration/test/patent-master.test.js
 *
 * 두 가지를 나누어 확인한다.
 *   · 개별 특허 한 건의 구분 (POUR / 타사 / 미분류)
 *   · 현장 전체의 구분 (POUR / 타사 / 다특허(PD) / 다특허)
 * 현장 구분이 개별 특허의 구분을 덮어쓰지 않는 것이 핵심이다.
 */
const assert = require("assert");
const PourPatents = require("../pour-patents.js");
const PourRecords = require("../pour-records.js");

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

/** POUR 특허 하나와 타사 특허 하나가 든 마스터를 만든다 */
function seedMaster(store) {
  PourPatents.load([
    ["특허번호", "특허명", "공종", "특허권자"],
    ["10-1935719", "POUR공법", "재도장", "㈜넷폼알앤디"],
    ["10-2694890", "DO공법", "재도장", "DO공법"]
  ], store);
  const list = PourPatents.list(store).map(r =>
    r.company === "DO공법" ? Object.assign({}, r, { patentType: "타사" }) : r);
  store.setItem(PourPatents.STORAGE_KEY, JSON.stringify(list));
}

function site(store, client, items) {
  return PourRecords.save({
    client, city: "하남", status: "공고", noticeDate: "2026-01-05", patentItems: items
  }, store);
}

/* ------------------------------------------------------------------ */

section("1. 특허 마스터 (번호마다 한 건)");

test("처음 보는 번호는 미분류로 등록되고 업체명은 비워 둔다", () => {
  const store = memoryStorage();
  PourPatents.noteSeen(["10-7777777"], store, "2026-08-23");
  const rec = PourPatents.find("10-7777777", store);
  assert.strictEqual(rec.patentType, "미분류");
  assert.strictEqual(rec.company, "", "업체명을 지어내면 안 된다");
  assert.strictEqual(rec.methodName, "");
  assert.strictEqual(rec.firstSeenAt, "2026-08-23");
  assert.strictEqual(rec.lastSeenAt, "2026-08-23");
});

test("같은 번호가 여러 현장에 나와도 마스터에는 한 건만 남는다", () => {
  const store = memoryStorage();
  PourPatents.noteSeen(["10-7777777"], store, "2026-01-05");
  PourPatents.noteSeen(["10-7777777"], store, "2026-05-20");
  PourPatents.noteSeen(["10-7777777"], store, "2026-08-23");
  assert.strictEqual(PourPatents.list(store).length, 1);
});

test("다시 볼 때 최초 확인일은 그대로, 마지막 확인일만 바뀐다", () => {
  const store = memoryStorage();
  PourPatents.noteSeen(["10-7777777"], store, "2026-01-05");
  PourPatents.noteSeen(["10-7777777"], store, "2026-08-23");
  const rec = PourPatents.find("10-7777777", store);
  assert.strictEqual(rec.firstSeenAt, "2026-01-05");
  assert.strictEqual(rec.lastSeenAt, "2026-08-23");
});

test("이미 확인된 업체명·공법명을 자동 등록이 지우지 않는다", () => {
  const store = memoryStorage();
  seedMaster(store);
  PourPatents.noteSeen(["10-1935719"], store, "2026-08-23");
  const rec = PourPatents.find("10-1935719", store);
  assert.strictEqual(rec.company, "㈜넷폼알앤디");
  assert.strictEqual(rec.patentType, "POUR");
});

test("구분이 없는 옛 자료는 POUR 로 읽힌다 (기존 쓰임 그대로)", () => {
  const store = memoryStorage();
  store.setItem(PourPatents.STORAGE_KEY, JSON.stringify([{ number: "1935719", name: "POUR공법" }]));
  assert.strictEqual(PourPatents.find("10-1935719", store).patentType, "POUR");
});

/* ------------------------------------------------------------------ */

section("2. 개별 특허의 구분");

test("현장 하나에 든 특허가 각각 제 구분을 지킨다", () => {
  const store = memoryStorage();
  seedMaster(store);
  const rec = site(store, "조치원자이", [
    { number: "10-1935719", kind: "POUR" },
    { number: "10-2694890", kind: "THIRD_PARTY" }
  ]);
  const rows = PourRecords.patentBreakdown(rec, store);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].type, "POUR");
  assert.strictEqual(rows[0].company, "㈜넷폼알앤디");
  assert.strictEqual(rows[1].type, "타사", "다특허(PD) 현장이어도 타사 특허는 타사로 남는다");
  assert.strictEqual(rows[1].company, "DO공법");
});

test("현장 구분이 개별 특허의 구분을 덮어쓰지 않는다", () => {
  const store = memoryStorage();
  seedMaster(store);
  const rec = site(store, "오남신동아파밀리에", [
    { number: "10-1935719", kind: "POUR" },
    { number: "10-2694890", kind: "THIRD_PARTY" }
  ]);
  assert.strictEqual(PourRecords.sitePatentClass(rec, store), "다특허(PD)");
  // 현장은 PD 지만 특허 두 건의 구분은 그대로다
  const types = PourRecords.patentBreakdown(rec, store).map(p => p.type);
  assert.deepStrictEqual(types, ["POUR", "타사"]);
  // 마스터의 값도 바뀌지 않았다
  assert.strictEqual(PourPatents.find("10-2694890", store).patentType, "타사");
});

/* ------------------------------------------------------------------ */

section("3. 현장 전체의 구분");

test("POUR 특허만 있으면 POUR", () => {
  const store = memoryStorage();
  seedMaster(store);
  const rec = site(store, "단일", [{ number: "10-1935719", kind: "POUR" }]);
  assert.strictEqual(PourRecords.sitePatentClass(rec, store), "POUR");
});

test("타사 특허만 있으면 타사", () => {
  const store = memoryStorage();
  seedMaster(store);
  const rec = site(store, "단일타사", [{ number: "10-2694890", kind: "THIRD_PARTY" }]);
  assert.strictEqual(PourRecords.sitePatentClass(rec, store), "타사");
});

test("특허가 여럿이고 POUR 가 하나라도 있으면 다특허(PD)", () => {
  const store = memoryStorage();
  seedMaster(store);
  const rec = site(store, "섞임", [
    { number: "10-1935719", kind: "POUR" },
    { number: "10-2694890", kind: "THIRD_PARTY" }
  ]);
  assert.strictEqual(PourRecords.sitePatentClass(rec, store), "다특허(PD)");
});

test("특허가 여럿인데 POUR 가 하나도 없으면 다특허", () => {
  const store = memoryStorage();
  seedMaster(store);
  const rec = site(store, "타사둘", [
    { number: "10-2694890", kind: "THIRD_PARTY" },
    { number: "10-9999999", kind: "THIRD_PARTY" }
  ]);
  assert.strictEqual(PourRecords.sitePatentClass(rec, store), "다특허");
});

test("특허가 없으면 빈 값 (아직 확인 전)", () => {
  const store = memoryStorage();
  const rec = site(store, "없음", []);
  assert.strictEqual(PourRecords.sitePatentClass(rec, store), "");
});

/* ------------------------------------------------------------------ */

section("4. 집계 대상 (POUR = POUR + 다특허(PD))");

test("POUR 실적에는 POUR 와 다특허(PD) 가 들어간다", () => {
  const store = memoryStorage();
  seedMaster(store);
  const pour = site(store, "POUR단일", [{ number: "10-1935719", kind: "POUR" }]);
  const pd = site(store, "PD", [
    { number: "10-1935719", kind: "POUR" }, { number: "10-2694890", kind: "THIRD_PARTY" }]);
  assert.ok(PourRecords.isPourSite(pour, store));
  assert.ok(PourRecords.isPourSite(pd, store), "다특허(PD)는 POUR 실적에 포함되어야 한다");
});

test("타사 집계에는 타사와 다특허 가 들어가고 다특허(PD)는 빠진다", () => {
  const store = memoryStorage();
  seedMaster(store);
  const third = site(store, "타사단일", [{ number: "10-2694890", kind: "THIRD_PARTY" }]);
  const multi = site(store, "타사둘", [
    { number: "10-2694890", kind: "THIRD_PARTY" }, { number: "10-9999999", kind: "THIRD_PARTY" }]);
  const pd = site(store, "PD", [
    { number: "10-1935719", kind: "POUR" }, { number: "10-2694890", kind: "THIRD_PARTY" }]);
  assert.ok(PourRecords.isThirdSite(third, store));
  assert.ok(PourRecords.isThirdSite(multi, store));
  assert.ok(!PourRecords.isThirdSite(pd, store));
});

test("다특허(PD) 안의 타사 특허는 그 업체 집계에 그대로 잡힌다", () => {
  const store = memoryStorage();
  seedMaster(store);
  const pd = site(store, "조치원자이", [
    { number: "10-1935719", kind: "POUR" }, { number: "10-2694890", kind: "THIRD_PARTY" }]);
  // 업체별 집계는 현장 구분이 아니라 개별 특허를 세어야 한다
  const doRows = PourRecords.patentBreakdown(pd, store)
    .filter(p => p.company === "DO공법" && p.type === "타사");
  assert.strictEqual(doRows.length, 1, "PD 현장이어도 DO공법은 경쟁사 집계에 잡혀야 한다");
});

/* ------------------------------------------------------------------ */

section("5. 현장 ↔ 특허 연결이 끊기지 않는다");

test("현장 등록만으로 특허가 마스터에 쌓이고, 현장 자료는 그대로다", () => {
  const store = memoryStorage();
  seedMaster(store);
  const before = PourRecords.list(store).length;
  const rec = site(store, "새현장", [
    { number: "10-1935719", kind: "POUR" }, { number: "10-8888888", kind: "THIRD_PARTY" }]);
  assert.strictEqual(PourRecords.list(store).length, before + 1, "현장은 한 건만 늘어야 한다");
  assert.strictEqual(rec.patentItems.length, 2);
  // 처음 본 번호가 마스터에 미분류로 들어갔다
  assert.strictEqual(PourPatents.find("10-8888888", store).patentType, "미분류");
});

test("낙찰로 바꿔도 같은 현장 id 에 특허가 그대로 붙어 있다", () => {
  const store = memoryStorage();
  seedMaster(store);
  const rec = site(store, "낙찰현장", [{ number: "10-1935719", kind: "POUR" }]);
  const result = PourRecords.award(rec.id, {
    contractor: "가나건설", awardDate: "2026-03-02", agreementNo: "HS-1",
    patentNumbers: ["10-1935719"]
  }, store);
  assert.ok(result.ok, result.message);
  assert.strictEqual(result.record.id, rec.id);
  assert.strictEqual(PourRecords.patentBreakdown(result.record, store).length, 1);
  assert.strictEqual(PourRecords.sitePatentClass(result.record, store), "POUR");
});

test("미분류가 마스터에 있어도 POUR 검토 필요 표시가 유지된다", () => {
  const store = memoryStorage();
  seedMaster(store);
  const rec = site(store, "검토필요", [{ number: "10-8888888", kind: "POUR" }]);
  // 자동 등록으로 마스터에는 있지만 미분류다
  assert.ok(PourPatents.find("10-8888888", store));
  assert.strictEqual(PourRecords.patentStats(rec, store).status, "POUR 특허 검토 필요");
});

console.log(`\n합계 ${passed + failed}건 · 통과 ${passed} · 실패 ${failed}`);
process.exit(failed ? 1 : 0);
