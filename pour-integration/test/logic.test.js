/**
 * 로직 검증 (Node 실행). 브라우저 없이 확인할 수 있는 항목을 모두 다룬다.
 *   node pour-integration/test/logic.test.js
 */
const assert = require("assert");
const path = require("path");
const fs = require("fs");

const PourRegion  = require("../pour-region.js");
const PourPatents = require("../pour-patents.js");
const PourRecords = require("../pour-records.js");
const PourExport  = require("../pour-export.js");

// localStorage 대체 (Node 에서 모듈을 그대로 쓰기 위한 최소 구현)
function memoryStorage() {
  const map = {};
  return { getItem: k => (k in map ? map[k] : null), setItem: (k, v) => { map[k] = String(v); } };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); failed++; }
}
function section(title) { console.log("\n" + title); }

/* ------------------------------------------------------------------ */

section("1. 도시 입력 → 지역 자동 분류");

test("하남 입력 시 지역 경기 / 도시 하남으로 분리", () => {
  const r = PourRegion.parse("하남");
  assert.strictEqual(r.status, "resolved");
  assert.strictEqual(r.region, "경기");
  assert.strictEqual(r.city, "하남");
});

test("금산 입력 시 지역 충남 / 도시 금산으로 분리", () => {
  const r = PourRegion.parse("금산");
  assert.strictEqual(r.region, "충남");
  assert.strictEqual(r.city, "금산");
});

test("평택·양산·강남·해운대도 정확히 분리", () => {
  assert.deepStrictEqual(["경기", "평택"], [PourRegion.parse("평택").region, PourRegion.parse("평택").city]);
  assert.deepStrictEqual(["경남", "양산"], [PourRegion.parse("양산시").region, PourRegion.parse("양산시").city]);
  assert.deepStrictEqual(["서울", "강남"], [PourRegion.parse("강남구").region, PourRegion.parse("강남구").city]);
  assert.deepStrictEqual(["부산", "해운대"], [PourRegion.parse("해운대").region, PourRegion.parse("해운대").city]);
});

test("중구 입력 시 임의 확정 없이 선택 목록 반환", () => {
  const r = PourRegion.parse("중구");
  assert.strictEqual(r.status, "ambiguous");
  const labels = r.candidates.map(c => c.label);
  ["서울 중구", "부산 중구", "대구 중구", "대전 중구", "울산 중구"].forEach(l =>
    assert.ok(labels.includes(l), l + " 누락"));
});

test("시도를 함께 적으면 바로 확정", () => {
  const r = PourRegion.parse("서울 강남");
  assert.strictEqual(r.status, "resolved");
  assert.strictEqual(r.region, "서울");
});

/* ------------------------------------------------------------------ */

section("2. 특허번호 정규화와 표시 형식");

test("여러 표기가 모두 같은 번호로 정규화", () => {
  ["특허 제10-1935719호", "10-1935719", "1935719", "제10-1935719 호"].forEach(s =>
    assert.strictEqual(PourPatents.normalizeNumber(s), "1935719", s));
});

test("표시 형식은 제10-번호호", () => {
  assert.strictEqual(PourPatents.formatNumber("1935719"), "제10-1935719호");
  assert.strictEqual(PourPatents.formatNumber("2425081"), "제10-2425081호");
});

test("탭 이름 생성 (구분 있으면 앞에 표시)", () => {
  assert.strictEqual(PourPatents.tabLabel({ number: "2562854" }), "특허 제10-2562854호");
  assert.strictEqual(PourPatents.tabLabel({ number: "2699417", prefix: "DO" }), "(DO)특허 제10-2699417호");
});

/* ------------------------------------------------------------------ */

section("3. 특허 엑셀 업로드");

const patentStore = memoryStorage();
const EXCEL_ROWS = [
  ["POUR 특허번호", "특허·공법명", "공종 분류", "구분", "비고"],
  ["특허 제10-1935719호", "POUR공법", "재도장", "", ""],
  ["10-2425081", "POUR 슬라브공법", "슬라브", "", ""],
  ["2535699", "POUR 에폭시공법", "에폭시", "", ""],
  ["제10-2699417호", "DO 특수공법", "옥상 방수", "DO", ""],
  ["2562854", "POUR 균열보수공법", "재도장", "", ""],
  ["23456", "POUR 시험공법", "보통", "", ""],
  ["잘못된값", "이름만 있음", "재도장", "", ""],
  ["10-1935719", "POUR공법", "재도장", "", "같은 파일 안 중복"]
];

test("열 이름이 달라도 자동 인식하고 건수를 집계", () => {
  const r = PourPatents.load(EXCEL_ROWS, patentStore);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.inserted, 6, "등록 건수");
  assert.strictEqual(r.duplicated, 1, "중복 건수");
  assert.strictEqual(r.errors.length, 1, "오류 건수");
  assert.ok(r.errors[0].reason.includes("특허번호"), "오류 사유에 열 이름 포함");
});

test("같은 번호를 다시 올리면 새로 만들지 않고 갱신", () => {
  const before = PourPatents.list(patentStore).length;
  const r = PourPatents.load([
    ["특허번호", "특허명", "공종"],
    ["1935719", "POUR공법(개정)", "재도장, 옥상 방수"]
  ], patentStore);
  assert.strictEqual(r.inserted, 0);
  assert.strictEqual(r.updated, 1);
  assert.strictEqual(PourPatents.list(patentStore).length, before, "행이 늘어나면 안 됨");
  assert.strictEqual(PourPatents.find("1935719", patentStore).name, "POUR공법(개정)");
});

test("필수 열이 없으면 한국어로 어떤 열이 필요한지 안내", () => {
  const r = PourPatents.load([["현장명", "주소"], ["가나아파트", "서울"]], memoryStorage());
  assert.strictEqual(r.ok, false);
  assert.ok(r.message.includes("특허번호"), "특허번호 안내");
  assert.ok(r.message.includes("공종"), "공종 안내");
  assert.ok(r.message.includes("특허명"), "특허명 안내");
});

/* ------------------------------------------------------------------ */

section("4. 특허 자동검색");

test("숫자 일부(193) 입력 시 시작 일치 특허 추천", () => {
  const hits = PourPatents.search("193", 10, patentStore);
  assert.ok(hits.length > 0, "결과 없음");
  assert.strictEqual(hits[0].number, "1935719");
  assert.ok(hits[0].label.includes("제10-1935719호"));
});

test("숫자 23 입력 시 23으로 시작하는 특허 추천", () => {
  const hits = PourPatents.search("23", 10, patentStore);
  assert.strictEqual(hits[0].number, "23456", "시작 일치가 먼저 와야 함");
});

test("POUR 입력 시 특허명·공법명이 먼저 오고, 우리 특허 전체가 나옴", () => {
  const hits = PourPatents.search("POUR", 10, patentStore);
  assert.ok(hits.length >= 4, "결과 " + hits.length + "건");
  // 이름에 POUR 이 들어간 특허가 앞에 온다
  assert.ok(hits[0].name.toUpperCase().includes("POUR"), hits[0].name);
  // 결과는 모두 등록된 우리 특허여야 한다
  hits.forEach(h => assert.ok(PourPatents.find(h.number, patentStore), "우리 특허가 아님: " + h.number));
});

test("재도장 입력 시 공종으로 검색", () => {
  const hits = PourPatents.search("재도장", 10, patentStore);
  assert.ok(hits.length >= 2);
  assert.ok(hits.every(h => h.category.includes("재도장")));
});

test("최대 10개까지만 반환", () => {
  assert.ok(PourPatents.search("2", 10, patentStore).length <= 10);
});

test("등록되지 않은 번호는 찾지 못하고 안내 문구 제공", () => {
  assert.strictEqual(PourPatents.find("9999999", patentStore), null);
  assert.ok(PourPatents.NOT_FOUND_MESSAGE.includes("우리 특허인지 확인"));
});

test("선택한 특허들의 공종을 중복 없이 계산", () => {
  const cats = PourPatents.categoriesFor(["1935719", "2425081", "2562854"], patentStore);
  assert.deepStrictEqual(cats, ["재도장", "옥상 방수", "슬라브"]);
});

/* ------------------------------------------------------------------ */

section("5. 실적 자료 (한 현장 = 한 행)");

const recordStore = memoryStorage();

const site1 = PourRecords.save({
  categories: ["슬라브", "재도장", "에폭시"],
  region: "경기", city: "평택",
  patentNumbers: ["제10-1935719호", "10-2425081", "2535699"],
  patentNames: ["POUR공법", "POUR 슬라브공법", "POUR 에폭시공법"],
  noticePatentText: "POUR공법 (특허 제10-1935719호)",
  client: "평택비전지웰푸르지오",
  projectNames: ["외벽·지하주차장 바닥 균열보수 및 도장공사", "옥상 방수공사"],
  phone: "031-647-3158", households: 717,
  status: "공고", noticeDate: "2026-03-02", bidDate: "2026-03-20"
}, recordStore);

const site2 = PourRecords.save({
  categories: ["재도장"], region: "경기", city: "하남",
  patentNumbers: ["1935719"], patentNames: ["POUR공법"],
  client: "하남미사강변도시", projectNames: ["외벽 재도장공사"],
  phone: "031-000-1234", households: 1240,
  status: "공고", noticeDate: "2026-02-11"
}, recordStore);

const site3 = PourRecords.save({
  categories: ["재도장"], region: "충남", city: "금산",
  patentNumbers: ["1935719"], patentNames: ["POUR공법"],
  client: "금산주공", projectNames: ["외벽 도장공사"],
  phone: "041-555-0001", households: 430,
  status: "타공법 낙찰", noticeDate: "2026-01-05", contractor: "타사건설"
}, recordStore);

test("여러 공종·특허번호·공사명이 한 셀 안에서 줄바꿈", () => {
  const col = k => PourRecords.COLUMNS.find(c => c.key === k);
  assert.strictEqual(PourRecords.displayValue(site1, col("categories"), 0), "슬라브\n재도장\n에폭시");
  assert.strictEqual(PourRecords.displayValue(site1, col("patentNumbers"), 0),
    "제10-1935719호\n제10-2425081호\n제10-2535699호");
  assert.strictEqual(PourRecords.displayValue(site1, col("projectNames"), 0),
    "외벽·지하주차장 바닥 균열보수 및 도장공사\n옥상 방수공사");
});

test("한 현장은 한 행으로 유지", () => {
  assert.strictEqual(PourRecords.list(recordStore).length, 3);
});

test("공고 상태에서는 시공사가 비어 있음", () => {
  assert.strictEqual(PourRecords.list(recordStore).find(r => r.id === site1.id).contractor, "");
});

test("낙찰로 바꿔도 새 행이 생기지 않고 같은 행이 갱신", () => {
  const before = PourRecords.list(recordStore).length;
  const res = PourRecords.award(site1.id, {
    contractor: "코지건설㈜", contractorPhone: "031-647-3158", awardDate: "2026-04-10",
    awardAmount: 1250000000, quality: "우수", remark: "낙찰 확정"
  }, recordStore);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(PourRecords.list(recordStore).length, before, "행 수가 늘면 안 됨");
  const after = PourRecords.list(recordStore).find(r => r.id === site1.id);
  assert.strictEqual(after.status, "낙찰");
  assert.strictEqual(after.contractor, "코지건설㈜");
  assert.strictEqual(after.awardAmount, 1250000000);
  assert.strictEqual(after.quality, "우수");
});

test("시공사명·시공사 전화번호가 없으면 낙찰 저장 거부", () => {
  const res = PourRecords.award(site2.id, { contractor: "  " }, recordStore);
  assert.strictEqual(res.ok, false);
  assert.ok(res.message.includes("시공사명"), res.message);
  assert.ok(res.fields.contractor, "시공사명 개별 안내");
  assert.ok(res.fields.contractorPhone, "시공사 전화번호 개별 안내");
});

test("공사 품질은 값이 없으면 빈칸 (임의 생성 금지)", () => {
  const col = PourRecords.COLUMNS.find(c => c.key === "quality");
  assert.strictEqual(PourRecords.displayValue(site2, col, 0), "");
});

test("세대수는 천 단위 쉼표, 전화번호는 앞자리 0 유지", () => {
  const cols = PourRecords.PATENT_TAB_COLUMNS;
  const households = cols.find(c => c.key === "households");
  const phone = cols.find(c => c.key === "phone");
  assert.strictEqual(PourRecords.displayValue(site2, households, 0), "1,240");
  assert.strictEqual(PourRecords.displayValue(site3, phone, 0), "041-555-0001");
  assert.strictEqual(PourRecords.exportValue(site3, phone, 0), "041-555-0001");
  assert.strictEqual(PourRecords.exportValue(site2, households, 0), 1240);
});

/* ------------------------------------------------------------------ */

section("6. 특허별 실적 탭");

const allRecords = PourRecords.list(recordStore);
const tabs = PourRecords.patentTabs(PourPatents.list(patentStore), allRecords);

test("등록된 특허마다 탭이 자동 생성", () => {
  const labels = tabs.map(t => t.label);
  ["특허 제10-1935719호", "특허 제10-2425081호", "특허 제10-2535699호",
   "(DO)특허 제10-2699417호", "특허 제10-2562854호"].forEach(l =>
    assert.ok(labels.includes(l), l + " 탭 없음"));
});

test("특허가 3개인 현장은 세 탭에 각각 표시", () => {
  ["1935719", "2425081", "2535699"].forEach(n => {
    const rows = PourRecords.recordsForPatent(n, allRecords);
    assert.ok(rows.some(r => r.id === site1.id), n + " 탭에 평택 현장 없음");
  });
});

test("같은 탭 안에서 동일 현장이 중복되지 않음", () => {
  const doubled = allRecords.concat(allRecords);       // 같은 현장을 두 번 넣어도
  const rows = PourRecords.recordsForPatent("1935719", doubled);
  const ids = rows.map(r => r.id);
  assert.strictEqual(ids.length, new Set(ids).size, "중복 행 발생");
});

test("특허 탭 클릭 시 해당 특허 현장만 표시", () => {
  const rows = PourRecords.recordsForPatent("2425081", allRecords);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].client, "평택비전지웰푸르지오");
});

test("집계: 타공법 낙찰은 낙찰 실적에서 제외", () => {
  const rows = PourRecords.recordsForPatent("1935719", allRecords);
  const s = PourRecords.summarize(rows);
  assert.strictEqual(s.total, 3, "전체 건수");
  assert.strictEqual(s.awarded, 1, "낙찰 건수 (타공법 낙찰 제외)");
  assert.strictEqual(s.otherMethod, 1, "타공법 낙찰 건수는 따로 보관");
  assert.strictEqual(s.households, 717 + 1240 + 430);
  assert.strictEqual(s.amount, 1250000000, "타공법 낙찰 금액은 합산 제외");
  assert.strictEqual(s.regions, 2, "적용 지역 수");
});

test("요약 문구 형식", () => {
  const rows = PourRecords.recordsForPatent("1935719", allRecords);
  const text = PourRecords.summaryText("특허 제10-1935719호", PourRecords.summarize(rows));
  assert.ok(text.includes("전체 3건"), text);
  assert.ok(text.includes("낙찰 1건"), text);
  assert.ok(text.includes("2,387세대"), text);
  assert.ok(text.includes("12.5억원"), text);
});

test("상태 필터 (기본 전체)", () => {
  const rows = PourRecords.recordsForPatent("1935719", allRecords);
  assert.strictEqual(PourRecords.applyFilters(rows, { status: "전체" }).length, 3);
  assert.strictEqual(PourRecords.applyFilters(rows, { status: "낙찰" }).length, 1);
  assert.strictEqual(PourRecords.applyFilters(rows, { status: "타공법 낙찰" }).length, 1);
  assert.strictEqual(PourRecords.applyFilters(rows, { region: "충남" }).length, 1);
  assert.strictEqual(PourRecords.applyFilters(rows, { year: "2026" }).length, 3);
});

test("열 제목 정렬", () => {
  const rows = PourRecords.recordsForPatent("1935719", allRecords);
  const asc = PourRecords.sortRecords(rows, "households", "asc").map(r => r.households);
  const desc = PourRecords.sortRecords(rows, "households", "desc").map(r => r.households);
  assert.deepStrictEqual(asc, [430, 717, 1240]);
  assert.deepStrictEqual(desc, [1240, 717, 430]);
});

/* ------------------------------------------------------------------ */

section("7. 실적표 열 순서");

test("전체 실적표 열 순서 (요청한 20개 + 서류 마감일·시공사 전화번호)", () => {
  assert.deepStrictEqual(PourRecords.COLUMNS.slice(0, 22).map(c => c.title), [
    "공종", "지역", "도시", "POUR 특허번호", "발주처(아파트명)", "공사명", "발주처 전화번호", "세대수",
    "공사 품질", "시공사", "시공사 전화번호", "상태", "공고일", "서류 마감일", "개찰일", "낙찰일",
    "낙찰금액", "협약서 발행번호", "POUR 특허명·공법명", "공사 범위", "주소", "비고"
  ]);
});

test("연도 열은 요청한 22개 뒤에 붙는다 (앞선 열 순서를 흔들지 않는다)", () => {
  assert.strictEqual(PourRecords.COLUMNS[22].title, "연도");
  assert.strictEqual(PourRecords.MAIN_COLUMNS[2].title, "연도");
});

test("특허 탭 표는 순번부터 세대수까지 핵심 열이 앞에", () => {
  assert.deepStrictEqual(PourRecords.PATENT_TAB_COLUMNS.slice(0, 8).map(c => c.title), [
    "순번", "지역", "도시", "특허번호", "발주처(아파트명)", "공사명", "발주처 전화번호", "세대수"
  ]);
});

test("CSV 열 순서가 화면 표와 동일", () => {
  const csv = PourExport.toCsv(allRecords);
  const header = csv.replace(/^﻿/, "").split("\r\n")[0];
  assert.strictEqual(header.split(",")[0], "공종");
  assert.strictEqual(header, PourRecords.COLUMNS.map(c =>
    /[",\r\n]/.test(c.title) ? '"' + c.title + '"' : c.title).join(","));
});

test("CSV 안의 여러 줄 셀은 따옴표로 보호되어 행이 깨지지 않음", () => {
  const csv = PourExport.toCsv([site1]);
  assert.ok(csv.includes('"슬라브\n재도장\n에폭시"'), "공종 줄바꿈 유지");
  assert.ok(csv.includes('"제10-1935719호\n제10-2425081호\n제10-2535699호"'), "특허번호 줄바꿈 유지");
});

/* ------------------------------------------------------------------ */

section("8. 엑셀 내려받기");

test("워크시트 이름은 31자·금지문자 처리", () => {
  assert.strictEqual(PourExport.sheetName("특허 제10-2562854호"), "특허 제10-2562854호");
  assert.strictEqual(PourExport.sheetName("A/B:C*D?E[F]G").indexOf("/"), -1);
  const used = {};
  assert.strictEqual(PourExport.sheetName("같은이름", used), "같은이름");
  assert.strictEqual(PourExport.sheetName("같은이름", used), "같은이름(2)");
  assert.ok(PourExport.sheetName("가".repeat(50), {}).length <= 31);
});

const outDir = path.join(__dirname, "..", "..", "tmp-test-output");
fs.mkdirSync(outDir, { recursive: true });
const xlsxPath = path.join(outDir, "특허별-실적.xlsx");

test("특허마다 별도 워크시트를 만들어 저장", done => {
  const wb = PourExport.buildPatentWorkbook(tabs, allRecords);
  assert.ok(wb, "ExcelJS 없음");
  const names = wb.worksheets.map(w => w.name);
  assert.ok(names.includes("특허 제10-1935719호"));
  assert.ok(names.includes("(DO)특허 제10-2699417호"));
  assert.strictEqual(names.length, tabs.length);
  require("fs"); // 파일 저장은 아래 비동기 단계에서 검증
  module.exports.__wb = wb;
});

/* ------------------------------------------------------------------ */

(async function verifyWorkbookFile() {
  const ExcelJS = require("exceljs");
  const wb = PourExport.buildPatentWorkbook(tabs, allRecords);
  await wb.xlsx.writeFile(xlsxPath);

  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.readFile(xlsxPath);

  section("9. 저장된 엑셀 파일 재확인");

  test("파일이 실제로 만들어짐", () => {
    assert.ok(fs.statSync(xlsxPath).size > 0);
  });

  test("특허번호별 워크시트가 그대로 들어 있음", () => {
    const names = reopened.worksheets.map(w => w.name);
    tabs.forEach(t => assert.ok(names.includes(t.label), t.label + " 시트 없음"));
  });

  const sheet = reopened.getWorksheet("특허 제10-1935719호");

  test("제목 행 굵게 · 가운데 정렬 · 첫 행 고정 · 자동 필터", () => {
    assert.strictEqual(sheet.getRow(1).font.bold, true);
    assert.strictEqual(sheet.getRow(1).alignment.horizontal, "center");
    assert.strictEqual(sheet.views[0].state, "frozen");
    assert.strictEqual(sheet.views[0].ySplit, 1);
    assert.ok(sheet.autoFilter, "자동 필터 없음");
  });

  test("열 순서가 화면 표와 동일", () => {
    const header = sheet.getRow(1).values.slice(1);
    assert.deepStrictEqual(header, PourRecords.PATENT_TAB_COLUMNS.map(c => c.title));
  });

  test("해당 특허의 현장만 들어 있고 중복 없음", () => {
    assert.strictEqual(sheet.rowCount - 1, 3, "행 수");
  });

  test("전화번호는 문자열, 세대수·금액은 숫자", () => {
    const cols = PourRecords.PATENT_TAB_COLUMNS;
    const phoneAt = cols.findIndex(c => c.key === "phone") + 1;
    const houseAt = cols.findIndex(c => c.key === "households") + 1;
    let checked = 0;
    sheet.eachRow((row, i) => {
      if (i === 1) return;
      const phone = row.getCell(phoneAt).value;
      const households = row.getCell(houseAt).value;
      assert.strictEqual(typeof phone, "string", "전화번호가 문자열이 아님: " + phone);
      assert.ok(/^0/.test(phone), "전화번호 앞자리 0이 사라짐: " + phone);
      assert.strictEqual(typeof households, "number", "세대수가 숫자가 아님");
      checked++;
    });
    assert.strictEqual(checked, 3);
  });

  test("여러 줄 공사명은 줄바꿈과 wrapText 유지", () => {
    const at = PourRecords.PATENT_TAB_COLUMNS.findIndex(c => c.key === "projectNames") + 1;
    let found = false;
    sheet.eachRow((row, i) => {
      if (i === 1) return;
      const cell = row.getCell(at);
      if (String(cell.value).includes("\n")) {
        found = true;
        assert.strictEqual(cell.alignment.wrapText, true);
      }
    });
    assert.ok(found, "여러 줄 공사명 셀을 찾지 못함");
  });

  test("셀 경계선 · 열 너비 지정", () => {
    assert.ok(sheet.getRow(2).getCell(2).border.top, "경계선 없음");
    assert.ok(sheet.getColumn(1).width > 0, "열 너비 없음");
  });

  console.log("\n" + "=".repeat(52));
  console.log(`  통과 ${passed} · 실패 ${failed}`);
  console.log("=".repeat(52));
  if (failed) process.exit(1);
})();
