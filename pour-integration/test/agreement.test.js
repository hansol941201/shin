/**
 * 협약서 발행번호를 기준으로 한 공고 → 낙찰 흐름 검증 (Node 실행)
 *   node pour-integration/test/agreement.test.js
 */
const assert = require("assert");
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

/** 공고 한 건을 새로 만든다 */
function newNotice(store, client) {
  return PourRecords.save({
    client, city: "하남", status: "공고", noticeDate: "2026-01-05",
    categoryItems: [{ group: "도로", name: "보도블럭" }]
  }, store);
}

/* ------------------------------------------------------------------ */

section("1. 처리 단계 (협약서 발행번호 기준)");

test("번호가 비어 있으면 확인 대기", () => {
  const rec = PourRecords.normalize({ status: "공고" });
  assert.strictEqual(PourRecords.agreementStage(rec), "확인 대기");
  assert.strictEqual(PourRecords.hasAgreement(rec), false);
});

test("낙찰인데 번호가 없으면 협약서번호 미입력", () => {
  const rec = PourRecords.normalize({ status: "낙찰" });
  assert.strictEqual(PourRecords.agreementStage(rec), "협약서번호 미입력");
});

test("번호는 있는데 낙찰 정보가 덜 찼으면 추가 입력 필요", () => {
  const rec = PourRecords.normalize({ status: "낙찰", agreementNo: "HS-2026-001" });
  assert.strictEqual(PourRecords.agreementStage(rec), "추가 입력 필요");
  assert.deepStrictEqual(PourRecords.missingAwardFields(rec),
    ["시공사", "시공사 전화번호", "낙찰일", "낙찰금액", "최종 공종"]);
});

test("번호와 낙찰 정보가 모두 있으면 정리 완료", () => {
  const rec = PourRecords.normalize({
    status: "낙찰", agreementNo: "HS-2026-001", contractor: "가나건설",
    contractorPhone: "031-000-0000", awardDate: "2026-02-01", awardAmount: 1000,
    categories: ["보도블럭"]
  });
  assert.strictEqual(PourRecords.agreementStage(rec), "정리 완료");
  assert.deepStrictEqual(PourRecords.missingAwardFields(rec), []);
});

/* ------------------------------------------------------------------ */

section("2. 번호를 넣으면 그 행이 낙찰로 바뀐다");

test("상세 수정에서 번호를 넣으면 공고가 낙찰이 된다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "가나아파트");
  assert.strictEqual(rec.status, "공고");

  const after = PourRecords.update(rec.id, { agreementNo: "HS-2026-001" }, store);
  assert.strictEqual(after.ok, true);
  assert.strictEqual(after.record.status, "낙찰");
  assert.strictEqual(after.record.agreementNo, "HS-2026-001");
});

test("새 행을 만들지 않고 같은 행을 갱신한다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "다라아파트");
  const before = PourRecords.list(store).length;
  const after = PourRecords.update(rec.id, { agreementNo: "HS-2026-002" }, store);
  assert.strictEqual(PourRecords.list(store).length, before);
  assert.strictEqual(after.record.id, rec.id);
});

test("재공고·유찰도 번호가 들어오면 낙찰이 된다", () => {
  ["재공고", "유찰"].forEach((status) => {
    const store = memoryStorage();
    const rec = PourRecords.save({ client: "마바", city: "하남", status }, store);
    const after = PourRecords.update(rec.id, { agreementNo: "HS-9" }, store);
    assert.strictEqual(after.record.status, "낙찰", status);
  });
});

test("타공법 낙찰·공고취소는 번호가 들어와도 상태를 바꾸지 않는다", () => {
  ["타공법 낙찰", "공고취소"].forEach((status) => {
    const store = memoryStorage();
    const rec = PourRecords.save({ client: "사아", city: "하남", status }, store);
    const after = PourRecords.update(rec.id, { agreementNo: "HS-9" }, store);
    assert.strictEqual(after.record.status, status, status);
    assert.strictEqual(after.record.agreementNo, "HS-9", "번호는 저장된다");
  });
});

test("결과 입력일이 함께 기록된다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "자차아파트");
  const after = PourRecords.update(rec.id, { agreementNo: "HS-3" }, store);
  assert.ok(after.record.resultEnteredAt, "결과 입력일이 비어 있음");
});

/* ------------------------------------------------------------------ */

section("3. 번호만 먼저 넣고 나머지는 나중에");

test("낙찰 전환에서 번호만 넣어도 저장된다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "카타아파트");
  const result = PourRecords.award(rec.id, {
    agreementNo: "HS-2026-010", confirmedWithoutPatent: true
  }, store);
  assert.strictEqual(result.ok, true, result.message);
  assert.strictEqual(result.record.status, "낙찰");
  assert.strictEqual(PourRecords.agreementStage(result.record), "추가 입력 필요");
});

test("나머지를 나중에 채우면 정리 완료가 된다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "파하아파트");
  PourRecords.award(rec.id, { agreementNo: "HS-2026-011", confirmedWithoutPatent: true }, store);
  const done = PourRecords.award(rec.id, {
    contractor: "가나건설", contractorPhone: "031-000-1111",
    awardDate: "2026-03-01", awardAmount: 500000000,
    categoryItems: [{ group: "주차장", name: "에폭시" }],
    quality: "우수", confirmedWithoutPatent: true
  }, store);
  assert.strictEqual(done.ok, true, done.message);
  assert.strictEqual(done.record.agreementNo, "HS-2026-011", "번호가 사라지면 안 됨");
  assert.strictEqual(PourRecords.agreementStage(done.record), "정리 완료");
  assert.strictEqual(done.record.quality, "우수");
});

test("번호도 낙찰 정보도 없으면 저장을 막고 무엇이 필요한지 알려 준다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "빈값아파트");
  const result = PourRecords.award(rec.id, { confirmedWithoutPatent: true }, store);
  assert.strictEqual(result.ok, false);
  assert.ok(result.message.includes("협약서 발행번호"), result.message);
  assert.ok(result.fields.contractor, "개별 안내 없음");
});

test("낙찰 전환에서도 새 행이 생기지 않는다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "행수아파트");
  const before = PourRecords.list(store).length;
  PourRecords.award(rec.id, { agreementNo: "HS-2026-012", confirmedWithoutPatent: true }, store);
  assert.strictEqual(PourRecords.list(store).length, before);
});

/* ------------------------------------------------------------------ */

section("4. 번호를 지웠을 때");

test("되돌릴지 먼저 물어본다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "삭제시험아파트");
  PourRecords.update(rec.id, { agreementNo: "HS-2026-020" }, store);

  const asked = PourRecords.update(rec.id, { agreementNo: "" }, store);
  assert.strictEqual(asked.ok, false);
  assert.strictEqual(asked.needsConfirm, true);
  assert.strictEqual(asked.reason, "agreementCleared");
  assert.ok(asked.message.includes("공고"), asked.message);
});

test("공고로 되돌리기를 고르면 상태가 공고가 되고 번호는 비어 있다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "되돌림아파트");
  PourRecords.update(rec.id, { agreementNo: "HS-2026-021" }, store);
  const after = PourRecords.update(rec.id,
    { agreementNo: "", agreementCleared: "notice" }, store);
  assert.strictEqual(after.ok, true);
  assert.strictEqual(after.record.status, "공고");
  assert.strictEqual(after.record.agreementNo, "", "지운 번호가 되살아났다");
});

test("낙찰을 유지하기를 고르면 협약서번호 미입력 알림으로 간다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "유지아파트");
  PourRecords.update(rec.id, { agreementNo: "HS-2026-022" }, store);
  const after = PourRecords.update(rec.id,
    { agreementNo: "", agreementCleared: "keep" }, store);
  assert.strictEqual(after.record.status, "낙찰");
  assert.strictEqual(after.record.agreementNo, "");
  assert.strictEqual(PourRecords.agreementStage(after.record), "협약서번호 미입력");
});

test("과거 번호를 자동으로 되살리지 않는다", () => {
  const store = memoryStorage();
  const rec = newNotice(store, "복원금지아파트");
  PourRecords.update(rec.id, { agreementNo: "HS-OLD" }, store);
  PourRecords.update(rec.id, { agreementNo: "", agreementCleared: "keep" }, store);
  // 다른 항목만 고쳐도 옛 번호가 돌아오면 안 된다
  const later = PourRecords.update(rec.id, { remark: "메모" }, store);
  assert.strictEqual(later.record.agreementNo, "");
});

/* ------------------------------------------------------------------ */

section("5. 알림");

test("추가 입력 필요·협약서번호 미입력이 각각 모인다", () => {
  const store = memoryStorage();
  const patents = memoryStorage();

  // 번호만 넣은 건 → 추가 입력 필요
  const a = newNotice(store, "알림가");
  PourRecords.update(a.id, { agreementNo: "HS-A" }, store);

  // 낙찰인데 번호 없음 → 협약서번호 미입력
  PourRecords.save({
    client: "알림나", city: "하남", status: "낙찰", patentConfirmed: true,
    patentNumbers: ["1935719"], contractor: "가", contractorPhone: "1",
    awardDate: "2026-01-01", awardAmount: 1, categories: ["보도블럭"]
  }, store);

  // 모두 갖춘 건 → 어느 알림에도 없다
  PourRecords.save({
    client: "알림다", city: "하남", status: "낙찰", agreementNo: "HS-C",
    patentConfirmed: true, patentNumbers: ["1935719"], contractor: "가",
    contractorPhone: "1", awardDate: "2026-01-01", awardAmount: 1, categories: ["보도블럭"]
  }, store);

  const all = PourRecords.list(store);
  const found = {};
  PourRecords.alerts(all, patents).forEach((x) => { found[x.key] = x; });

  assert.ok(found.awardIncomplete, "추가 입력 필요 알림 없음");
  assert.strictEqual(found.awardIncomplete.count, 1);
  assert.deepStrictEqual(found.awardIncomplete.records.map(r => r.client), ["알림가"]);

  assert.ok(found.noAgreement, "협약서번호 미입력 알림 없음");
  assert.strictEqual(found.noAgreement.count, 1);
  assert.deepStrictEqual(found.noAgreement.records.map(r => r.client), ["알림나"]);
});

test("엑셀에서 옮겨 온 행은 협약서번호 미입력 알림에서 뺀다", () => {
  const store = memoryStorage();
  // 엑셀 이전분 — 번호가 아예 없다
  PourRecords.save({
    id: "rec-imp-0001", source: "import", client: "엑셀이전아파트", city: "하남",
    status: "낙찰", patentConfirmed: true, patentNumbers: ["1935719"]
  }, store);
  // 프로그램에서 등록한 건
  PourRecords.save({
    id: "rec-app-1", client: "앱등록아파트", city: "하남",
    status: "낙찰", patentConfirmed: true, patentNumbers: ["1935719"]
  }, store);

  const found = {};
  PourRecords.alerts(PourRecords.list(store), memoryStorage())
    .forEach((x) => { found[x.key] = x; });
  assert.ok(found.noAgreement, "알림 자체가 없음");
  assert.deepStrictEqual(found.noAgreement.records.map(r => r.client), ["앱등록아파트"]);
});

test("id 가 rec-imp- 로 시작하면 source 가 없어도 이전분으로 본다", () => {
  const legacy = PourRecords.normalize({ id: "rec-imp-9999", status: "낙찰" });
  assert.strictEqual(PourRecords.isImported(legacy), true);
  const made = PourRecords.normalize({ id: "rec-abc", status: "낙찰" });
  assert.strictEqual(PourRecords.isImported(made), false);
});

test("이전분이어도 처리 단계는 사실대로 보여 준다", () => {
  const rec = PourRecords.normalize({ id: "rec-imp-1", source: "import", status: "낙찰" });
  assert.strictEqual(PourRecords.agreementStage(rec), "협약서번호 미입력");
});

test("이전분도 번호를 직접 넣으면 정리가 이어진다", () => {
  const store = memoryStorage();
  const rec = PourRecords.save({
    id: "rec-imp-0002", source: "import", client: "이전분수정", city: "하남",
    status: "낙찰", contractor: "가", contractorPhone: "1",
    awardDate: "2024-01-01", awardAmount: 1, categories: ["보도블럭"]
  }, store);
  assert.strictEqual(PourRecords.agreementStage(rec), "협약서번호 미입력");
  const after = PourRecords.update(rec.id, { agreementNo: "HS-2024-999" }, store);
  assert.strictEqual(after.ok, true);
  assert.strictEqual(after.record.agreementNo, "HS-2024-999");
  assert.strictEqual(PourRecords.agreementStage(after.record), "정리 완료");
  assert.strictEqual(after.record.source, "import", "이전분 표시는 그대로 남는다");
});

test("번호가 없어도 이전분의 번호를 지어내지 않는다", () => {
  const store = memoryStorage();
  const rec = PourRecords.save({
    id: "rec-imp-0003", source: "import", client: "지어내기금지", city: "하남", status: "낙찰"
  }, store);
  assert.strictEqual(rec.agreementNo, "");
  const after = PourRecords.update(rec.id, { remark: "메모" }, store);
  assert.strictEqual(after.record.agreementNo, "", "번호가 저절로 생겼다");
});

test("공고 상태(확인 대기)는 알림에 올라오지 않는다", () => {
  const store = memoryStorage();
  newNotice(store, "확인대기아파트");
  const keys = PourRecords.alerts(PourRecords.list(store), memoryStorage())
    .map((x) => x.key);
  assert.ok(!keys.includes("awardIncomplete"), keys.join(","));
  assert.ok(!keys.includes("noAgreement"), keys.join(","));
});

/* ------------------------------------------------------------------ */

section("6. 기존 자료와 열 보존");

test("협약서 발행번호 열과 값은 그대로 남는다", () => {
  const store = memoryStorage();
  const rec = PourRecords.save({
    client: "옛자료아파트", city: "하남", status: "낙찰", agreementNo: "OLD-2019-001",
    contractor: "옛건설", contractorPhone: "031-1", awardDate: "2019-05-01",
    awardAmount: 100, categories: ["보도블럭"]
  }, store);
  assert.strictEqual(rec.agreementNo, "OLD-2019-001");
  const after = PourRecords.update(rec.id, { remark: "메모만 고침" }, store);
  assert.strictEqual(after.record.agreementNo, "OLD-2019-001");
  assert.strictEqual(after.record.status, "낙찰");
});

test("표에 협약서 발행번호와 처리 단계가 모두 있다", () => {
  const titles = PourRecords.MAIN_COLUMNS.map(c => c.title);
  assert.ok(titles.includes("협약서 발행번호"), titles.join(","));
  assert.ok(titles.includes("처리 단계"), titles.join(","));
  const exportTitles = PourRecords.COLUMNS.map(c => c.title);
  assert.strictEqual(exportTitles[17], "협약서 발행번호", "내보내기 18번 자리 유지");
});

test("처리 단계 열이 계산된 값을 보여 준다", () => {
  const column = PourRecords.MAIN_COLUMNS.filter(c => c.type === "agreementStage")[0];
  const waiting = PourRecords.normalize({ status: "공고" });
  const partial = PourRecords.normalize({ status: "낙찰", agreementNo: "HS-1" });
  assert.strictEqual(PourRecords.displayValue(waiting, column, 0), "확인 대기");
  assert.strictEqual(PourRecords.displayValue(partial, column, 0), "추가 입력 필요");
});

console.log(`\n합계 ${passed + failed}건 · 통과 ${passed} · 실패 ${failed}`);
process.exit(failed ? 1 : 0);
