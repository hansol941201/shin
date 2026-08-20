/**
 * 첨부해 주신 실제 POUR 특허 관리 엑셀로 검증한다.
 *   node pour-integration/test/real-excel.test.js
 *
 * fixtures-patent-excel.json 은 원본 엑셀(POUR공법_공종별 분류 시트)을
 * 셀 그대로 2차원 배열로 옮긴 파일이다.
 */
const assert = require("assert");
const PourPatents = require("../pour-patents.js");
const PourRecords = require("../pour-records.js");
const rows = require("./fixtures-patent-excel.json");

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

const store = memoryStorage();
const result = PourPatents.load(rows, store);

section("1. 원본 엑셀 인식");

test("제목 줄을 건너뛰고 2행 머리글을 찾음", () => {
  const columns = PourPatents.detectColumns(rows[1]);
  assert.strictEqual(rows[1][0], "공종");
  assert.strictEqual(columns.category, 0, "공종 열");
  assert.strictEqual(columns.number, 1, "특허번호 열");
  assert.strictEqual(columns.name, 2, "특허명 열");
  assert.strictEqual(columns.company, 3, "특허권자 열");
  assert.strictEqual(columns.remark, 8, "비고 열");
});

test("오류·빈칸 없이 전부 등록", () => {
  assert.strictEqual(result.ok, true, result.message);
  assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors.slice(0, 3)));
  assert.strictEqual(result.inserted, 50, "등록 건수");
  assert.strictEqual(result.total, 50);
});

test("'제 10-2119347호' 처럼 띄어쓴 표기도 정규화", () => {
  assert.strictEqual(PourPatents.normalizeNumber("제 10-2119347호"), "2119347");
  assert.ok(PourPatents.find("2119347", store), "등록되지 않음");
  assert.strictEqual(PourPatents.formatNumber("2119347"), "제10-2119347호");
});

section("2. 병합된 공종 열 처리");

test("공종이 그룹 첫 줄에만 있어도 아래 행이 이어받음", () => {
  // 4행(제10-1923102호)은 공종 칸이 비어 있고 3행의 '슁글'을 이어받아야 한다
  assert.strictEqual(rows[3][0], "", "원본에서 공종 칸이 비어 있어야 함");
  const rec = PourPatents.find("1923102", store);
  assert.ok(rec, "등록되지 않음");
  assert.ok(rec.categories.indexOf("슁글") >= 0, "공종: " + rec.category);
});

test("같은 특허가 여러 공종에 걸치면 공종을 합쳐 한 건으로 보관", () => {
  const rec = PourPatents.find("2425081", store);
  assert.deepStrictEqual(rec.categories,
    ["듀얼", "우레탄", "폴리우레아", "탄성강화보강 (바탕면)", "에폭시", "엠보라이닝"]);
  assert.strictEqual(result.duplicated, 0, "공종만 다른 행을 중복으로 세면 안 됨");
});

test("공종 23종이 모두 살아 있음", () => {
  const set = {};
  PourPatents.list(store).forEach(r => (r.categories || []).forEach(c => { set[c] = true; }));
  assert.strictEqual(Object.keys(set).length, 23, Object.keys(set).join(", "));
});

section("3. 자동검색");

test("193 입력 → 제10-1935719호 추천", () => {
  const hits = PourPatents.search("193", 10, store);
  assert.strictEqual(hits[0].number, "1935719", hits.map(h => h.number).join(","));
  assert.ok(hits[0].label.startsWith("제10-1935719호"), hits[0].label);
});

test("23 입력 → 23으로 시작하는 특허 추천", () => {
  const hits = PourPatents.search("23", 10, store);
  assert.ok(hits.length > 0);
  assert.ok(hits[0].number.indexOf("23") === 0, hits[0].number);
});

test("POUR 입력 → 우리 특허 추천 (특허명에 POUR 글자가 없어도)", () => {
  const hits = PourPatents.search("POUR", 10, store);
  assert.strictEqual(hits.length, 10, "결과 " + hits.length + "건");
});

test("공종 이름으로 검색", () => {
  ["재도장", "에폭시", "균열보수", "슁글"].forEach(q => {
    const hits = PourPatents.search(q, 10, store);
    assert.ok(hits.length > 0, q + " 결과 없음");
  });
});

test("특허명 일부로 검색", () => {
  const hits = PourPatents.search("후레싱", 10, store);
  assert.ok(hits.length > 0, "결과 없음");
  assert.ok(hits.every(h => h.name.indexOf("후레싱") >= 0), hits.map(h => h.name).join(" | "));
});

test("특허권자로도 찾을 수 있음", () => {
  assert.ok(PourPatents.search("넷폼", 5, store).length > 0);
});

test("빈 입력칸에서는 등록된 목록을 보여줌", () => {
  const list = PourPatents.browse(10, store);
  assert.strictEqual(list.length, 10);
  assert.ok(list[0].label.indexOf("제10-") === 0, list[0].label);
});

test("등록되지 않은 번호는 안내 문구", () => {
  assert.strictEqual(PourPatents.search("9999999", 10, store).length, 0);
  assert.strictEqual(PourPatents.emptyMessage(store), "일치하는 POUR 특허가 없습니다.");
  assert.strictEqual(PourPatents.emptyMessage(memoryStorage()), "먼저 POUR 특허 엑셀을 업로드해 주세요.");
});

section("4. 공종 자동 입력");

test("특허 하나를 고르면 연결된 공종이 모두 들어감", () => {
  assert.deepStrictEqual(PourPatents.categoriesFor(["1935719"], store),
    ["균열보수", "균열보수 및 재도장"]);
});

test("여러 특허를 고르면 공종을 합치고 중복 제거", () => {
  const cats = PourPatents.categoriesFor(["1935719", "2425081", "2535699"], store);
  assert.strictEqual(cats.length, new Set(cats).size, "중복이 남음: " + cats.join(", "));
  ["균열보수", "듀얼", "에폭시", "엠보라이닝"].forEach(c =>
    assert.ok(cats.indexOf(c) >= 0, c + " 누락"));
});

test("특허를 빼면 공종이 다시 계산됨", () => {
  const before = PourPatents.categoriesFor(["1935719", "2425081"], store);
  const after = PourPatents.categoriesFor(["1935719"], store);
  assert.ok(after.length < before.length, "재계산되지 않음");
  assert.deepStrictEqual(after, ["균열보수", "균열보수 및 재도장"]);
});

section("5. 재업로드");

test("같은 파일을 다시 올려도 건수가 늘지 않고 갱신으로 처리", () => {
  const again = PourPatents.load(rows, store);
  assert.strictEqual(again.inserted, 0, "새로 만든 건수");
  assert.strictEqual(again.total, 50, "총 건수가 늘어남");
  assert.strictEqual(PourPatents.list(store).length, 50);
});

section("6. 특허별 실적 탭");

test("등록된 50개 특허마다 탭이 생성", () => {
  const tabs = PourRecords.patentTabs(PourPatents.list(store), []);
  assert.strictEqual(tabs.length, 50);
  assert.ok(tabs.some(t => t.label === "특허 제10-1935719호"), tabs[0].label);
  assert.ok(tabs.some(t => t.label === "특허 제10-2562854호"));
});

console.log("\n" + "=".repeat(52));
console.log(`  통과 ${passed} · 실패 ${failed}`);
console.log("=".repeat(52));
if (failed) process.exit(1);
