/**
 * 공종 분류표 검증 (Node 실행)
 *   node pour-integration/test/categories.test.js
 */
const assert = require("assert");
const PourCategories = require("../pour-categories.js");
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

/* ------------------------------------------------------------------ */

section("1. 분류표");

test("대분류 다섯 개가 요청한 순서대로", () => {
  assert.deepStrictEqual(PourCategories.GROUP_KEYS,
    ["옥상방수", "재도장", "주차장", "도로", "기타"]);
});

test("옥상방수 세부 공종", () => {
  assert.deepStrictEqual(PourCategories.itemsOf("옥상방수"),
    ["PVC", "금속기와", "박공지붕", "방수", "복합시트", "슬라브", "싱글", "우레탄"]);
});

test("재도장 세부 공종", () => {
  assert.deepStrictEqual(PourCategories.itemsOf("재도장"), ["균열보수", "재도장"]);
});

test("주차장 세부 공종", () => {
  assert.deepStrictEqual(PourCategories.itemsOf("주차장"),
    ["균열보수", "배면차수", "아스콘", "에폭시", "우레탄", "재도장"]);
});

test("도로 세부 공종", () => {
  assert.deepStrictEqual(PourCategories.itemsOf("도로"), ["보도블럭", "아스콘", "에폭시"]);
});

test("기타는 미리 정한 세부 공종이 없다 (직접 입력)", () => {
  assert.deepStrictEqual(PourCategories.itemsOf("기타"), []);
});

/* ------------------------------------------------------------------ */

section("2. 같은 세부 공종이 여러 대분류에 있을 때");

test("우레탄은 옥상방수와 주차장 두 곳에 있다", () => {
  assert.deepStrictEqual(PourCategories.groupsOf("우레탄"), ["옥상방수", "주차장"]);
});

test("고른 대분류 기준으로 저장된다", () => {
  assert.deepStrictEqual(PourCategories.normalizeItem({ group: "주차장", name: "우레탄" }),
    { group: "주차장", name: "우레탄" });
  assert.deepStrictEqual(PourCategories.normalizeItem({ group: "옥상방수", name: "우레탄" }),
    { group: "옥상방수", name: "우레탄" });
});

test("같은 이름이라도 대분류가 다르면 서로 다른 항목", () => {
  const items = PourCategories.normalizeItems([
    { group: "옥상방수", name: "우레탄" }, { group: "주차장", name: "우레탄" }
  ]);
  assert.strictEqual(items.length, 2);
});

test("같은 (대분류, 세부 공종) 짝은 한 번만 남는다", () => {
  const items = PourCategories.normalizeItems([
    { group: "주차장", name: "우레탄" }, { group: "주차장", name: "우레탄" }
  ]);
  assert.strictEqual(items.length, 1);
});

test("공종 열에는 세부 공종 이름만, 중복 없이 들어간다", () => {
  assert.deepStrictEqual(PourCategories.namesOf([
    { group: "옥상방수", name: "우레탄" }, { group: "주차장", name: "우레탄" },
    { group: "도로", name: "보도블럭" }
  ]), ["우레탄", "보도블럭"]);
});

/* ------------------------------------------------------------------ */

section("3. 자동 분류 — 확실할 때만");

test("한 대분류에만 있는 이름은 그 대분류로", () => {
  assert.deepStrictEqual(PourCategories.classify("싱글"), { group: "옥상방수", name: "싱글" });
  assert.deepStrictEqual(PourCategories.classify("배면차수"), { group: "주차장", name: "배면차수" });
  assert.deepStrictEqual(PourCategories.classify("보도블럭"), { group: "도로", name: "보도블럭" });
});

test("여러 대분류에 있는 이름은 임의로 정하지 않고 기타로", () => {
  ["우레탄", "아스콘", "에폭시", "균열보수", "재도장"].forEach((name) => {
    assert.strictEqual(PourCategories.classify(name).group, "기타", name);
    assert.strictEqual(PourCategories.classify(name).name, name, name + " 이름 보존");
  });
});

test("분류표에 없는 이름도 기타로 두고 이름은 그대로", () => {
  assert.deepStrictEqual(PourCategories.classify("탄성강화 파우더"),
    { group: "기타", name: "탄성강화 파우더" });
});

test("고른 대분류에 없는 이름은 옮기지 않고 기타로", () => {
  assert.deepStrictEqual(PourCategories.normalizeItem({ group: "도로", name: "슬라브" }),
    { group: "기타", name: "슬라브" });
});

test("모르는 대분류 이름을 넘겨도 기타로 받아 준다", () => {
  assert.deepStrictEqual(PourCategories.normalizeItem({ group: "없는분류", name: "슬라브" }),
    { group: "기타", name: "슬라브" });
});

test("기타에는 어떤 이름이든 직접 넣을 수 있다", () => {
  assert.deepStrictEqual(PourCategories.normalizeItem({ group: "기타", name: "특수 코팅" }),
    { group: "기타", name: "특수 코팅" });
});

test("대분류·세부 표기를 다시 읽어들일 수 있다", () => {
  assert.deepStrictEqual(PourCategories.normalizeItem("주차장 > 우레탄"),
    { group: "주차장", name: "우레탄" });
  assert.strictEqual(PourCategories.label({ group: "주차장", name: "우레탄" }), "주차장 > 우레탄");
});

/* ------------------------------------------------------------------ */

section("4. 기존 자료 보존");

test("옛 자료(이름만 있는 목록)는 이름을 그대로 두고 분류만 붙인다", () => {
  const rec = PourRecords.normalize({ categories: ["싱글", "우레탄", "탄성강화 파우더"] });
  assert.deepStrictEqual(rec.categories, ["싱글", "우레탄", "탄성강화 파우더"], "공종 이름이 바뀌면 안 됨");
  assert.deepStrictEqual(rec.categoryItems, [
    { group: "옥상방수", name: "싱글" },
    { group: "기타", name: "우레탄" },
    { group: "기타", name: "탄성강화 파우더" }
  ]);
});

test("대분류 열은 표 순서대로 중복 없이", () => {
  const rec = PourRecords.normalize({
    categoryItems: [
      { group: "주차장", name: "에폭시" }, { group: "옥상방수", name: "싱글" },
      { group: "주차장", name: "우레탄" }
    ]
  });
  assert.deepStrictEqual(rec.categoryGroups, ["옥상방수", "주차장"]);
});

test("공종을 모두 지우면 빈 값으로 저장된다 (옛 값이 되살아나지 않음)", () => {
  const store = memoryStorage();
  const saved = PourRecords.save({
    client: "가나아파트", city: "하남", categories: ["싱글"], status: "공고"
  }, store);
  assert.strictEqual(saved.categories.length, 1);
  const cleared = PourRecords.update(saved.id, { categoryItems: [] }, store);
  assert.strictEqual(cleared.ok, true);
  assert.deepStrictEqual(cleared.record.categories, []);
  assert.deepStrictEqual(cleared.record.categoryItems, []);
});

test("대분류 없이 이름만 고쳐도 항목이 다시 계산된다", () => {
  const store = memoryStorage();
  const saved = PourRecords.save({
    client: "다라아파트", city: "하남",
    categoryItems: [{ group: "주차장", name: "우레탄" }], status: "공고"
  }, store);
  assert.deepStrictEqual(saved.categoryGroups, ["주차장"]);
  const updated = PourRecords.update(saved.id, { categories: ["싱글"] }, store);
  assert.deepStrictEqual(updated.record.categories, ["싱글"]);
  assert.deepStrictEqual(updated.record.categoryItems, [{ group: "옥상방수", name: "싱글" }]);
});

test("낙찰 저장에서 대분류를 함께 넘기면 그대로 지켜진다", () => {
  const store = memoryStorage();
  const saved = PourRecords.save({ client: "마바아파트", city: "하남", status: "공고" }, store);
  const result = PourRecords.award(saved.id, {
    awardDate: "2026-03-01", awardAmount: 1000, contractor: "가나건설",
    contractorPhone: "031-000-0000", confirmedWithoutPatent: true,
    categoryItems: [{ group: "주차장", name: "에폭시" }]
  }, store);
  assert.strictEqual(result.ok, true, result.message);
  assert.deepStrictEqual(result.record.categoryItems, [{ group: "주차장", name: "에폭시" }]);
  assert.deepStrictEqual(result.record.categories, ["에폭시"]);
});

/* ------------------------------------------------------------------ */

section("5. 표에 대분류와 세부 공종이 함께 보인다");

test("화면 목록에 공종 대분류 열이 있다", () => {
  const titles = PourRecords.MAIN_COLUMNS.map(c => c.title);
  assert.ok(titles.includes("공종 대분류"), titles.join(","));
  assert.strictEqual(titles.indexOf("공종 대분류") + 1, titles.indexOf("공종"), "공종 바로 앞");
});

test("내보내기 표는 요청한 22개 순서를 그대로 두고 뒤에 붙인다", () => {
  const titles = PourRecords.COLUMNS.map(c => c.title);
  assert.strictEqual(titles[0], "공종");
  assert.strictEqual(titles[21], "비고");
  assert.ok(titles.includes("공종 대분류"));
  assert.ok(titles.includes("공종 (대분류·세부)"));
  assert.ok(titles.indexOf("공종 대분류") > 21, "22개 뒤에 와야 함");
});

test("대분류·세부 짝 열에 둘 다 보인다", () => {
  const rec = PourRecords.normalize({
    categoryItems: [{ group: "옥상방수", name: "우레탄" }, { group: "주차장", name: "우레탄" }]
  });
  const column = PourRecords.COLUMNS.filter(c => c.type === "categoryPairs")[0];
  assert.strictEqual(PourRecords.displayValue(rec, column, 0), "옥상방수 > 우레탄\n주차장 > 우레탄");
});

console.log(`\n합계 ${passed + failed}건 · 통과 ${passed} · 실패 ${failed}`);
process.exit(failed ? 1 : 0);
