/**
 * 공고·낙찰 수정 기능과 특허번호 미기재 알림 검증
 *   node pour-integration/test/edit.test.js
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

const patentStore = memoryStorage();
PourPatents.load([
  ["특허번호", "특허명", "공종"],
  ["1935719", "POUR공법", "재도장"],
  ["2425081", "POUR 슬라브공법", "슬라브"],
  ["2562854", "POUR 균열보수공법", "재도장"]
], patentStore);

const store = memoryStorage();

/* ------------------------------------------------------------------ */
section("1. 특허번호 없이 등록 · 저장");

const noPatent = PourRecords.save({
  region: "경기", city: "하남", client: "하남미사강변",
  projectNames: ["외벽 도장공사"], categories: ["재도장"],
  noticePatentText: "POUR공법",           // 공법명만 적힌 공고문
  phone: "031-000-1111", households: 500,
  status: "공고", noticeDate: "2026-05-02"
}, store);

test("특허번호 없이 공고 등록 가능", () => {
  assert.ok(noPatent.id);
  assert.deepStrictEqual(noPatent.patentNumbers, []);
  assert.strictEqual(noPatent.noticePatentText, "POUR공법");
});

test("공고문에 POUR공법이 적혀도 적용 특허번호로 간주하지 않음", () => {
  assert.strictEqual(PourRecords.isPatentResolved(noPatent, patentStore), false);
});

test("공고 자료는 미기재 알림에 포함되지 않음", () => {
  const targets = PourRecords.missingPatentRecords(PourRecords.list(store), patentStore);
  assert.strictEqual(targets.length, 0);
});

test("특허번호 없이 낙찰 저장하면 차단이 아니라 확인 경고", () => {
  const res = PourRecords.award(noPatent.id, {
    contractor: "가나건설", contractorPhone: "031-000-1111", awardDate: "2026-06-01",
    awardAmount: 800000000, categories: ["재도장"]
  }, store);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.needsConfirm, true, "확인 경고 플래그");
  assert.ok(res.message.includes("미기재 상태로 낙찰 저장할까요"), res.message);
});

test("확인하면 특허번호 없이 낙찰 저장 가능", () => {
  const res = PourRecords.award(noPatent.id, {
    contractor: "가나건설", contractorPhone: "031-000-1111", awardDate: "2026-06-01",
    awardAmount: 800000000, categories: ["재도장"],
    confirmedWithoutPatent: true
  }, store);
  assert.strictEqual(res.ok, true, res.message);
  assert.strictEqual(res.record.status, "낙찰");
  assert.strictEqual(PourRecords.list(store).length, 1, "새 행이 생기면 안 됨");
});

test("낙찰 필수 항목(낙찰일·시공사·낙찰금액·최종 공종)은 그대로 필수", () => {
  const tmp = PourRecords.save({ region: "경기", city: "하남", client: "임시", status: "공고" }, store);
  const res = PourRecords.award(tmp.id, { contractor: "", confirmedWithoutPatent: true }, store);
  assert.strictEqual(res.ok, false);
  ["시공사명", "시공사 전화번호", "낙찰일", "낙찰금액", "최종 공종"].forEach(f =>
    assert.ok(res.message.includes(f), f + " 안내 없음: " + res.message));
});

/* ------------------------------------------------------------------ */
section("1-2. 낙찰 저장 중 특허번호를 지운 경우");

test("특허 항목을 비우면 이전 번호를 쓰지 않고 빈 값으로 저장", () => {
  const s = memoryStorage();
  const rec = PourRecords.save({
    client: "특허지움", status: "공고", categories: ["재도장"],
    patentItems: [{ kind: PourRecords.POUR, number: "1935719" }]
  }, s);
  assert.deepStrictEqual(rec.patentNumbers, ["1935719"], "준비 상태 확인");

  // 낙찰 창에서 특허를 지우고 저장하는 상황
  const warn = PourRecords.award(rec.id, {
    contractor: "가나", contractorPhone: "031-1", awardDate: "2026-06-01",
    awardAmount: 100, categories: ["재도장"], patentItems: []
  }, s);
  assert.strictEqual(warn.ok, false);
  assert.strictEqual(warn.needsConfirm, true, "확인 경고가 떠야 함");

  const saved = PourRecords.award(rec.id, {
    contractor: "가나", contractorPhone: "031-1", awardDate: "2026-06-01",
    awardAmount: 100, categories: ["재도장"], patentItems: [], confirmedWithoutPatent: true
  }, s);
  assert.strictEqual(saved.ok, true, saved.message);
  const after = PourRecords.list(s)[0];
  assert.deepStrictEqual(after.patentNumbers, [], "이전 번호가 남아 있음");
  assert.deepStrictEqual(after.patentItems, [], "특허 항목이 남아 있음");
});

test("특허번호가 빈 낙찰은 반드시 미기재 알림에 포함", () => {
  const s = memoryStorage();
  PourRecords.save({
    client: "빈낙찰", status: "낙찰", categories: ["재도장"],
    contractor: "가나", contractorPhone: "031-1", awardDate: "2026-06-01",
    awardAmount: 100, patentItems: []
  }, s);
  const missing = PourRecords.missingPatentRecords(PourRecords.list(s), patentStore);
  assert.strictEqual(missing.length, 1, "알림에서 빠짐");
  assert.strictEqual(missing[0].client, "빈낙찰");

  const groups = PourRecords.alerts(PourRecords.list(s), patentStore);
  assert.ok(groups.some(g => g.key === "missingPour"), "알림 묶음에 없음");
});

test("타사 특허만 남겨도 미기재 알림에서 빠지지 않음", () => {
  const s = memoryStorage();
  const rec = PourRecords.save({
    client: "타사만남김", status: "공고", categories: ["재도장"],
    patentItems: [{ kind: PourRecords.POUR, number: "1935719" }]
  }, s);
  PourRecords.award(rec.id, {
    contractor: "가나", contractorPhone: "031-1", awardDate: "2026-06-01",
    awardAmount: 100, categories: ["재도장"], confirmedWithoutPatent: true,
    patentItems: [{ kind: PourRecords.THIRD_PARTY, number: "2091977", company: "타사명" }]
  }, s);
  const after = PourRecords.list(s)[0];
  assert.deepStrictEqual(after.patentNumbers, [], "POUR 번호가 남아 있음");
  assert.deepStrictEqual(after.thirdPatentNumbers, ["2091977"]);
  assert.strictEqual(PourRecords.missingPatentRecords(PourRecords.list(s), patentStore).length, 1);
});

/* ------------------------------------------------------------------ */
section("2. 상단 알림 대상 판정");

const store2 = memoryStorage();
const mk = (over) => PourRecords.save(Object.assign({
  region: "경기", city: "하남", client: "테스트", categories: ["재도장"],
  contractor: "가나건설", contractorPhone: "031-000-1111",
  awardDate: "2026-06-01", awardAmount: 1000
}, over), store2);

const awardedNoPatent = mk({ client: "미기재낙찰", status: "낙찰", patentNumbers: [] });
mk({ client: "낙찰-특허있음", status: "낙찰", patentNumbers: ["1935719"] });
mk({ client: "공고", status: "공고", patentNumbers: [] });
mk({ client: "유찰", status: "유찰", patentNumbers: [] });
mk({ client: "공고취소", status: "공고취소", patentNumbers: [] });
mk({ client: "재공고", status: "재공고", patentNumbers: [] });
mk({ client: "타공법", status: "타공법 낙찰", patentNumbers: [] });

test("낙찰이면서 특허번호가 빈 건만 알림 대상", () => {
  const targets = PourRecords.missingPatentRecords(PourRecords.list(store2), patentStore);
  assert.strictEqual(targets.length, 1, "대상 " + targets.map(t => t.client).join(","));
  assert.strictEqual(targets[0].client, "미기재낙찰");
});

test("유찰·공고취소·재공고·타공법 낙찰은 제외", () => {
  const targets = PourRecords.missingPatentRecords(PourRecords.list(store2), patentStore)
    .map(t => t.status);
  ["유찰", "공고취소", "재공고", "타공법 낙찰", "공고"].forEach(s =>
    assert.ok(!targets.includes(s), s + " 가 알림에 포함됨"));
});

test("알림 문구에 건수 표시", () => {
  assert.strictEqual(PourRecords.missingPatentMessage(3),
    "⚠ 특허번호 미기재 3건 — 확인이 필요한 낙찰 현장이 있습니다.");
});

/* ------------------------------------------------------------------ */
section("3. 특허번호 나중에 입력 · 알림 해제");

test("엑셀에 있는 번호를 넣으면 알림에서 제거", () => {
  const before = PourRecords.missingPatentRecords(PourRecords.list(store2), patentStore).length;
  const res = PourRecords.update(awardedNoPatent.id, {
    patentNumbers: ["제10-1935719호"], patentNames: ["POUR공법"]
  }, store2);
  assert.strictEqual(res.ok, true);
  const after = PourRecords.missingPatentRecords(PourRecords.list(store2), patentStore).length;
  assert.strictEqual(after, before - 1, "알림 건수가 줄지 않음");
});

test("특허번호 입력 후 해당 특허 탭에 현장이 반영", () => {
  const rows = PourRecords.recordsForPatent("1935719", PourRecords.list(store2));
  assert.ok(rows.some(r => r.id === awardedNoPatent.id), "특허 탭에 반영되지 않음");
});

test("엑셀에 없는 번호만 넣으면 알림이 풀리지 않음", () => {
  const s = memoryStorage();
  const rec = PourRecords.save({
    client: "임의번호", status: "낙찰", categories: ["재도장"],
    contractor: "가나", contractorPhone: "031-1", awardDate: "2026-06-01", awardAmount: 100,
    patentNumbers: ["9999999"]
  }, s);
  assert.strictEqual(PourRecords.isPatentResolved(rec, patentStore), false);
  assert.strictEqual(PourRecords.missingPatentRecords(PourRecords.list(s), patentStore).length, 1);
});

test("직접 확인 완료로 저장하면 알림 해제", () => {
  const s = memoryStorage();
  const rec = PourRecords.save({
    client: "직접확인", status: "낙찰", categories: ["재도장"],
    contractor: "가나", contractorPhone: "031-1", awardDate: "2026-06-01", awardAmount: 100,
    patentNumbers: ["9999999"]
  }, s);
  PourRecords.update(rec.id, { patentConfirmed: true }, s);
  assert.strictEqual(PourRecords.missingPatentRecords(PourRecords.list(s), patentStore).length, 0);
});

/* ------------------------------------------------------------------ */
section("4. 자료 수정");

const store3 = memoryStorage();
const target = PourRecords.save({
  region: "경기", city: "하남", client: "수정테스트", categories: ["재도장"],
  projectNames: ["외벽 도장"], phone: "031-1", households: 100,
  status: "공고", noticeDate: "2026-01-01", noticePatentText: "POUR공법"
}, store3);

test("모든 상태의 자료를 수정 가능하고 새 행이 생기지 않음", () => {
  PourRecords.STATUSES.forEach(status => {
    const res = PourRecords.update(target.id, { status: status }, store3);
    assert.strictEqual(res.ok, true, status + " 수정 실패");
    assert.strictEqual(res.record.status, status);
  });
  assert.strictEqual(PourRecords.list(store3).length, 1, "중복 행 발생");
});

test("요청한 수정 항목이 모두 반영", () => {
  const res = PourRecords.update(target.id, {
    status: "낙찰", client: "새아파트", projectNames: ["공사A", "공사B"],
    categories: ["슬라브", "에폭시"], region: "충남", city: "금산",
    phone: "041-222-3333", households: 900,
    noticeDate: "2026-02-01", bidDate: "2026-02-20", awardDate: "2026-03-05",
    bidType: "전자입찰(적격)", contractor: "새건설", expectedAmount: 500000000,
    awardAmount: 480000000, noticePatentText: "POUR공법 (특허 제10-1935719호)",
    agreementNo: "HS-2026-001", patentNumbers: ["1935719"], patentNames: ["POUR공법"],
    scope: "외벽 전체", address: "충남 금산군 ...", quality: "우수", remark: "비고 수정"
  }, store3);
  assert.strictEqual(res.ok, true);
  const r = res.record;
  assert.strictEqual(r.client, "새아파트");
  assert.deepStrictEqual(r.projectNames, ["공사A", "공사B"]);
  assert.deepStrictEqual(r.categories, ["슬라브", "에폭시"]);
  assert.strictEqual(r.region, "충남");
  assert.strictEqual(r.city, "금산");
  assert.strictEqual(r.phone, "041-222-3333");
  assert.strictEqual(r.households, 900);
  assert.strictEqual(r.bidType, "전자입찰", "기존 표기가 두 종류 중 하나로 변환되어야 함");
  assert.strictEqual(r.bidTypeRaw, "전자입찰(적격)", "원본 표기 보존");
  assert.strictEqual(r.expectedAmount, 500000000);
  assert.strictEqual(r.awardAmount, 480000000);
  assert.strictEqual(r.agreementNo, "HS-2026-001");
  assert.deepStrictEqual(r.patentNumbers, ["1935719"]);
  assert.strictEqual(r.quality, "우수");
  assert.strictEqual(PourRecords.list(store3).length, 1, "중복 행 발생");
});

test("고유 ID와 최초 등록일은 보존", () => {
  const r = PourRecords.list(store3)[0];
  assert.strictEqual(r.id, target.id);
  assert.strictEqual(r.createdAt, target.createdAt);
});

/* ------------------------------------------------------------------ */
section("5. 수정 이력");

test("수정일시·전후 상태·항목·기존값·변경값을 남김", () => {
  const r = PourRecords.list(store3)[0];
  assert.ok(r.history.length >= 2, "이력 " + r.history.length + "건");
  const entry = r.history[r.history.length - 1];
  assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(entry.at), "수정일시 형식: " + entry.at);
  assert.ok(entry.statusBefore, "수정 전 상태");
  assert.ok(entry.statusAfter, "수정 후 상태");
  const client = entry.changes.find(c => c.field === "client");
  assert.ok(client, "변경 항목 기록 없음");
  assert.strictEqual(client.label, "발주처(아파트명)");
  assert.strictEqual(client.before, "수정테스트");
  assert.strictEqual(client.after, "새아파트");
});

test("특허번호를 나중에 넣으면 'POUR 적용 특허번호 추가' 이력", () => {
  const s = memoryStorage();
  const rec = PourRecords.save({
    client: "이력확인", status: "낙찰", categories: ["재도장"],
    contractor: "가나", contractorPhone: "031-1", awardDate: "2026-06-01", awardAmount: 100
  }, s);
  PourRecords.update(rec.id, { patentNumbers: ["1935719"] }, s);
  const entry = PourRecords.list(s)[0].history.slice(-1)[0];
  assert.strictEqual(entry.action, "POUR 적용 특허번호 추가");
});

test("값이 그대로면 이력을 남기지 않음", () => {
  const before = PourRecords.list(store3)[0].history.length;
  PourRecords.update(target.id, { client: "새아파트" }, store3);
  assert.strictEqual(PourRecords.list(store3)[0].history.length, before);
});

/* ------------------------------------------------------------------ */
section("6. 특허 항목 구분 저장");

test("공고문 원문·협약서 번호·적용 특허번호·특허명을 따로 보관", () => {
  const r = PourRecords.list(store3)[0];
  assert.strictEqual(r.noticePatentText, "POUR공법 (특허 제10-1935719호)");
  assert.strictEqual(r.agreementNo, "HS-2026-001");
  assert.deepStrictEqual(r.patentNumbers, ["1935719"]);
  assert.deepStrictEqual(r.patentNames, ["POUR공법"]);
});

console.log("\n" + "=".repeat(52));
console.log(`  통과 ${passed} · 실패 ${failed}`);
console.log("=".repeat(52));
if (failed) process.exit(1);
