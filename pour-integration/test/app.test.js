/**
 * 새 엑셀형 화면(app.html) 브라우저 검증
 *   node pour-integration/test/app.test.js
 */
const { chromium } = require("playwright");
const path = require("path");
const assert = require("assert");

const PAGE_URL = "file://" + path.join(__dirname, "..", "app.html");
const EXCEL_ROWS = require("./fixtures-patent-excel.json");

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); failed++; }
}
function section(t) { console.log("\n" + t); }

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", e => consoleErrors.push("PAGEERROR: " + e.message));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push("CONSOLE: " + m.text()); });

  let lastDialog = null;
  page.on("dialog", async d => { lastDialog = d.message(); await d.accept(); });

  // file:// 은 저장소를 공유하므로 이전 테스트 자료를 지우고 시작한다
  await page.goto(PAGE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const PATENT_SEARCH = "#patentEditor .pour-kind-search";
  const PATENT_ITEMS = "#patentEditor .pour-item-row";
  const THIRD_TAB = "#patentEditor .pour-kind-tab:nth-child(2)";

  async function isOpen(selector) {
    return (await page.$(selector + ".is-open")) !== null;
  }

  async function openNewNotice() {
    await page.click("#btnNewNotice");
    await page.waitForSelector("#noticePanel.is-open");
    await page.evaluate(() => { document.getElementById("moreBox").open = true; });
  }
  async function fillBasics(city, client, date) {
    await page.fill("#fCity", city);
    await page.dispatchEvent("#fCity", "change");
    await page.fill("#fClient", client);
    await page.fill("#fNoticeDate", date || "2026-03-02");
  }
  async function addPourPatent(query) {
    await page.fill(PATENT_SEARCH, query);
    await page.waitForSelector("#patentEditor .pour-suggest.is-open");
    await page.press(PATENT_SEARCH, "Enter");
  }

  /* -------------------------------------------------------------- */
  section("1. 첫 화면 구성");

  await test("상단 메뉴·작업 버튼·상태 탭·엑셀형 표가 한 화면에 있음", async () => {
    const menus = await page.$$eval(".nav-item", els => els.map(e => e.textContent.trim()));
    assert.deepStrictEqual(menus, ["공고·실적", "특허별 실적", "가져오기·내보내기", "통계·분석", "설정"]);
    const brand = await page.textContent(".brand");
    assert.ok(brand.includes("NETFORM"), brand);
    assert.ok(brand.includes("POUR 공사실적 관리"), brand);
    assert.strictEqual(await page.isVisible("#recordsGrid"), true);
    assert.strictEqual(await page.$$eval("#statusTabs .status-tab", els => els.length), 4);
  });

  await test("긴 입력폼이 첫 화면에 펼쳐져 있지 않음", async () => {
    assert.strictEqual(await isOpen("#noticePanel"), false, "공고 입력 패널이 열려 있음");
  });

  await test("표 열 순서가 요청한 21개와 동일", async () => {
    const heads = await page.$$eval("#recordsGrid .grid thead th", els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    assert.deepStrictEqual(heads, [
      "No.", "상태", "공고일", "서류 마감일", "개찰일", "지역", "도시", "발주처(아파트명)",
      "공사명", "공종", "POUR 특허번호", "타사 특허번호", "전화번호", "세대수", "입찰종류",
      "시공사", "시공사 전화번호", "낙찰일", "낙찰금액", "공사 품질", "비고"
    ]);
  });

  await test("표 머리글 고정 · 주요 식별 열 고정 · 가로 스크롤", async () => {
    const th = await page.$eval("#recordsGrid .grid thead th", el => getComputedStyle(el).position);
    assert.strictEqual(th, "sticky");
    const pinned = await page.$eval("#recordsGrid .grid thead th.is-pinned", el => getComputedStyle(el).position);
    assert.strictEqual(pinned, "sticky");
    const overflow = await page.$eval("#recordsGrid", el => getComputedStyle(el).overflow);
    assert.ok(overflow.includes("auto"), overflow);
  });

  await test("글자 크기가 기준(표 13px·기본 14px) 이상", async () => {
    const body = await page.$eval("body", el => parseFloat(getComputedStyle(el).fontSize));
    const cell = await page.$eval("#recordsGrid .grid thead th", el => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(body >= 14, "본문 " + body + "px");
    assert.ok(cell >= 13, "표 " + cell + "px");
  });

  await test("네이비 포인트 컬러 적용", async () => {
    const header = await page.$eval(".app-header", el => getComputedStyle(el).backgroundColor);
    assert.strictEqual(header, "rgb(23, 33, 59)", header);
    const btn = await page.$eval("#btnNewNotice", el => getComputedStyle(el).backgroundColor);
    assert.strictEqual(btn, "rgb(23, 33, 59)", btn);
  });

  /* -------------------------------------------------------------- */
  section("2. 엑셀 가져오기 미리보기");

  await test("가져오기 자료 종류를 고를 수 있음", async () => {
    await page.click(".nav-item[data-view='io']");
    const kinds = await page.$$eval("#importKind option", els => els.map(e => e.textContent));
    assert.deepStrictEqual(kinds, ["POUR 특허 관리 자료", "공고·실적 자료"]);
  });

  await test("가져오기 전에 등록·갱신·중복·오류 건수를 미리 보여줌", async () => {
    await page.click("#btnSampleImport");
    await page.waitForSelector("#importPreview .preview-stats");
    const stats = await page.textContent("#importPreview .preview-stats");
    assert.ok(stats.includes("새로 등록될 행"), stats);
    assert.ok(stats.includes("갱신될 행"), stats);
    assert.ok(stats.includes("중복 행"), stats);
    assert.ok(stats.includes("오류 행"), stats);
    const errors = await page.textContent("#importPreview .preview-errors");
    assert.ok(errors.includes("특허번호"), errors);
  });

  await test("첨부 엑셀 원본 50건을 등록", async () => {
    await page.evaluate(rows => {
      window.PourPatents.load(rows, window.localStorage);
      window.PourApp.refresh();
    }, EXCEL_ROWS);
    await page.click(".nav-item[data-view='settings']");
    const rowCount = await page.$$eval("#patentListGrid tbody tr", els => els.length);
    assert.strictEqual(rowCount, 50, "등록 " + rowCount + "건");
    await page.click(".nav-item[data-view='records']");
  });

  /* -------------------------------------------------------------- */
  section("3. 새 공고 등록 패널");

  await test("＋ 새 공고를 누르면 오른쪽 패널이 열리고 목록은 뒤에 남음", async () => {
    await openNewNotice();
    assert.strictEqual(await isOpen("#noticePanel"), true);
    assert.strictEqual(await page.isVisible("#recordsGrid"), true, "뒤 목록이 사라짐");
    const title = await page.textContent("#panelTitle");
    assert.strictEqual(title.trim(), "새 공고 등록");
    const rebid = await page.textContent(".rebid-check");
    assert.ok(rebid.includes("재공고 건"), rebid);
  });

  await test("닫았다 다시 열 수 있음", async () => {
    await page.click("#panelClose");
    assert.strictEqual(await isOpen("#noticePanel"), false);
    await openNewNotice();
    assert.strictEqual(await isOpen("#noticePanel"), true);
  });

  await test("예상금액 입력칸이 없음", async () => {
    assert.strictEqual(await page.$("#fExpectedAmount"), null);
    const body = await page.textContent("#noticePanel");
    assert.ok(!body.includes("예상금액"), "예상금액 문구가 남아 있음");
  });

  await test("POUR 특허 드롭다운 — 빈 칸을 누르면 등록된 특허 목록", async () => {
    await page.click(PATENT_SEARCH);
    await page.waitForSelector("#patentEditor .pour-suggest.is-open");
    const items = await page.$$eval("#patentEditor .pour-suggest-item", els => els.map(e => e.textContent));
    assert.ok(items.length > 0, "목록이 비어 있음");
    assert.ok(items[0].startsWith("제10-"), items[0]);
  });

  await test("193 입력 → 제10-1935719호 추천", async () => {
    await page.fill(PATENT_SEARCH, "193");
    await page.waitForSelector("#patentEditor .pour-suggest.is-open");
    const first = await page.textContent("#patentEditor .pour-suggest-item");
    assert.ok(first.includes("제10-1935719호"), first);
  });

  await test("23 입력 → 23으로 시작하는 특허 추천", async () => {
    await page.fill(PATENT_SEARCH, "23");
    const first = await page.textContent("#patentEditor .pour-suggest-item");
    assert.ok(/제10-23\d+호/.test(first), first);
  });

  await test("공종 이름으로도 검색", async () => {
    await page.fill(PATENT_SEARCH, "에폭시");
    const items = await page.$$eval("#patentEditor .pour-suggest-item", els => els.map(e => e.textContent));
    assert.ok(items.length > 0, "결과 없음");
    assert.ok(items.some(t => t.includes("에폭시")), items[0]);
  });

  await test("특허를 고르면 공종이 자동 입력됨", async () => {
    await page.fill(PATENT_SEARCH, "");
    await addPourPatent("1935719");
    assert.strictEqual(await page.inputValue("#fCategories"), "균열보수, 균열보수 및 재도장");
  });

  await test("특허를 더 고르면 공종이 합쳐지고 중복 제거", async () => {
    await addPourPatent("2784426");                    // 공종: 균열보수 및 재도장 (중복)
    const value = await page.inputValue("#fCategories");
    const parts = value.split(", ");
    assert.strictEqual(parts.length, new Set(parts).size, "중복이 남음: " + value);
    assert.ok(parts.includes("균열보수"), value);
  });

  await test("특허를 지우면 공종이 다시 계산됨", async () => {
    await page.click(PATENT_ITEMS + ":last-child .pour-item-del");
    assert.strictEqual(await page.inputValue("#fCategories"), "균열보수, 균열보수 및 재도장");
  });

  await test("타사 특허를 별도 탭에서 여러 개 추가", async () => {
    await page.click(THIRD_TAB);
    for (const [num, name, company] of [
      ["10-2091977", "균열보수 공법", "타사명"],
      ["제10-2474761호", "방수 공법", "다른회사"],
      ["1234567", "도장 공법", "세번째회사"]
    ]) {
      await page.fill("#patentEditor .pour-third-number", num);
      await page.fill("#patentEditor .pour-third-name", name);
      await page.fill("#patentEditor .pour-third-company", company);
      await page.click("#patentEditor .pour-add-btn");
    }
    const rows = await page.$$eval("#patentEditor .pour-item-row", els => els.length);
    assert.strictEqual(rows, 3);
    const tabText = await page.textContent(THIRD_TAB);
    assert.ok(tabText.includes("(3)"), tabText);
  });

  await test("다특허 배지가 자동으로 표시", async () => {
    const badge = await page.$eval("#patentEditor .pour-multi-badge", el => ({
      text: el.textContent, kind: el.dataset.badge
    }));
    assert.ok(badge.text.includes("다특허 · 총 4개"), badge.text);
    assert.ok(badge.text.includes("POUR 1개 · 타사 3개"), badge.text);
    assert.strictEqual(badge.kind, "mixed");
  });

  await test("전화번호·세대수·서류 마감일·개찰일 없이 등록", async () => {
    await fillBasics("평택", "평택비전지웰푸르지오", "2026-03-02");
    await page.fill("#fProjects", "외벽·지하주차장 바닥 균열보수 및 도장공사\n옥상 방수공사");
    await page.click("#bidGroup [data-bid='전자입찰']");
    await page.click("#panelSave");
    assert.strictEqual(await isOpen("#noticePanel"), false, "저장 후 패널이 닫히지 않음");

    const heads = await page.$$eval("#recordsGrid .grid thead th", els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const cells = await page.$$eval("#recordsGrid .grid tbody tr:first-child td", els => els.map(e => e.textContent));
    assert.strictEqual(cells[heads.indexOf("발주처(아파트명)")], "평택비전지웰푸르지오");
    assert.strictEqual(cells[heads.indexOf("전화번호")], "", "빈 값이 0 등으로 바뀜");
    assert.strictEqual(cells[heads.indexOf("세대수")], "");
    assert.strictEqual(cells[heads.indexOf("서류 마감일")], "");
    assert.strictEqual(cells[heads.indexOf("입찰종류")], "전자입찰");
    assert.strictEqual(cells[heads.indexOf("지역")], "경기");
    assert.strictEqual(cells[heads.indexOf("도시")], "평택");
  });

  await test("POUR 특허와 타사 특허가 다른 열에 표시", async () => {
    const heads = await page.$$eval("#recordsGrid .grid thead th", els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const cells = await page.$$eval("#recordsGrid .grid tbody tr:first-child td", els => els.map(e => e.textContent));
    assert.strictEqual(cells[heads.indexOf("POUR 특허번호")], "제10-1935719호");
    assert.strictEqual(cells[heads.indexOf("타사 특허번호")],
      "제10-2091977호\n제10-2474761호\n제10-1234567호");
  });

  await test("상태 배지와 다특허 배지가 표에 표시", async () => {
    const badge = await page.$eval("#recordsGrid .grid tbody tr:first-child .status-badge", el => ({
      text: el.textContent, status: el.dataset.status
    }));
    assert.strictEqual(badge.text, "공고");
    assert.strictEqual(badge.status, "공고");
    const multi = await page.$eval("#recordsGrid .grid tbody tr:first-child .multi-badge", el => el.textContent);
    assert.ok(multi.includes("다특허"), multi);
  });

  /* -------------------------------------------------------------- */
  section("4. 표 기능");

  // 자료를 몇 건 더 넣는다
  for (const [city, client, date, households] of [
    ["하남", "하남미사강변", "2026-01-11", "1240"],
    ["금산", "금산주공", "2026-02-05", "430"],
    ["양산", "양산센트럴", "2026-04-01", "880"]
  ]) {
    await openNewNotice();
    await fillBasics(city, client, date);
    await page.fill("#fHouseholds", households);
    await page.fill("#fPhone", "031-000-" + households);
    await addPourPatent("2425081");
    await page.click("#panelSave");
  }

  await test("열 제목을 눌러 오름·내림차순 정렬", async () => {
    const heads = await page.$$eval("#recordsGrid .grid thead th", els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const at = heads.indexOf("세대수") + 1;
    await page.click(`#recordsGrid .grid thead th:nth-child(${at}) .grid-th-label`);
    let first = await page.$eval(`#recordsGrid .grid tbody tr:first-child td:nth-child(${at})`, e => e.textContent);
    assert.strictEqual(first, "", "빈 값이 먼저 와야 함(오름차순)");
    await page.click(`#recordsGrid .grid thead th:nth-child(${at}) .grid-th-label`);
    first = await page.$eval(`#recordsGrid .grid tbody tr:first-child td:nth-child(${at})`, e => e.textContent);
    assert.strictEqual(first, "1,240", "내림차순 + 천 단위 쉼표");
  });

  await test("열 필터", async () => {
    await page.click("#btnFilterRow");
    await page.waitForSelector("#recordsGrid .grid-filter-row");
    await page.fill('[data-filter="city"]', "하남");
    const rows = await page.$$eval("#recordsGrid .grid tbody tr td:nth-child(7)", els => els.map(e => e.textContent));
    assert.deepStrictEqual(rows, ["하남"]);
    await page.click("#btnClearFilter");
  });

  await test("통합검색 (아파트명·시공사·특허번호·공종)", async () => {
    await page.fill("#gridSearch", "금산주공");
    let rows = await page.$$eval("#recordsGrid .grid tbody tr", els => els.length);
    assert.strictEqual(rows, 1);
    await page.fill("#gridSearch", "2425081");
    rows = await page.$$eval("#recordsGrid .grid tbody tr", els => els.length);
    assert.strictEqual(rows, 3, "특허번호 검색 결과 " + rows);
    await page.fill("#gridSearch", "");
  });

  await test("행을 한 번 누르면 선택되고 네이비 테두리로 표시", async () => {
    await page.click("#recordsGrid .grid tbody tr:first-child");
    const shadow = await page.$eval("#recordsGrid .grid tbody tr.is-selected td", el => getComputedStyle(el).boxShadow);
    assert.ok(shadow.includes("23, 33, 59"), shadow);
    assert.strictEqual(await page.isEnabled("#btnDetail"), true);
  });

  await test("두 번 누르면 상세 수정창이 열림", async () => {
    await page.dblclick("#recordsGrid .grid tbody tr:first-child");
    await page.waitForSelector("#noticePanel.is-open");
    const title = await page.textContent("#panelTitle");
    assert.ok(title.includes("자료 수정"), title);
    await page.click("#panelClose");
  });

  await test("상태 탭에 실제 건수가 표시되고 눌러서 걸러짐", async () => {
    const tabs = await page.$$eval("#statusTabs .status-tab", els => els.map(e => e.textContent.trim()));
    assert.ok(tabs[0].startsWith("전체 4"), tabs.join(" | "));
    assert.ok(tabs[2].startsWith("공고 4"), tabs.join(" | "));
    await page.click('.status-tab[data-status-tab="낙찰"]');
    const rows = await page.$$eval("#recordsGrid .grid tbody tr", els => els.length);
    assert.strictEqual(rows, 0);
    await page.click('.status-tab[data-status-tab="전체"]');
  });

  /* -------------------------------------------------------------- */
  section("5. 공고 → 낙찰");

  async function selectRowByClient(name) {
    const heads = await page.$$eval("#recordsGrid .grid thead th",
      els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const at = await page.$$eval(
      `#recordsGrid .grid tbody tr td:nth-child(${heads.indexOf("발주처(아파트명)") + 1})`,
      els => els.map(e => e.textContent), heads);
    const index = at.indexOf(name);
    assert.ok(index >= 0, name + " 행을 찾지 못함");
    await page.click(`#recordsGrid .grid tbody tr:nth-child(${index + 1})`);
    return index;
  }

  await test("공고 행을 선택하면 「낙찰로 변경」이 활성화", async () => {
    await selectRowByClient("평택비전지웰푸르지오");
    assert.strictEqual(await page.isEnabled("#btnToAward"), true);
  });

  await test("낙찰 상세정보 창에 기존 공고 요약이 보임", async () => {
    await page.click("#btnToAward");
    await page.waitForSelector("#awardPanel.is-open");
    const summary = await page.textContent("#awardSummary");
    assert.ok(summary.includes("현재 상태: 공고"), summary);
    assert.ok(summary.includes("공고일"), summary);
  });

  await test("시공사명·전화번호·낙찰일·금액·공종이 없으면 항목별로 안내", async () => {
    await page.click("#awardSave");
    for (const key of ["contractor", "contractorPhone", "awardDate", "awardAmount"]) {
      assert.strictEqual(await page.isVisible("#aw-error-" + key), true, key + " 안내 없음");
    }
    assert.strictEqual(await page.isEnabled("#awardSave"), true);
  });

  await test("시공사 전화번호는 앞자리 0을 유지하고 발주처 전화번호와 분리 저장", async () => {
    await page.fill("#aw-contractor", "코지건설㈜");
    await page.fill("#aw-contractorPhone", "0316473158");
    await page.dispatchEvent("#aw-contractorPhone", "blur");
    assert.strictEqual(await page.inputValue("#aw-contractorPhone"), "031-647-3158");
    await page.fill("#aw-awardDate", "2026-05-10");
    await page.fill("#aw-awardAmount", "1250000000");
    await page.click("#awardSave");
    assert.strictEqual(await isOpen("#awardPanel"), false, "창이 닫히지 않음");

    const heads = await page.$$eval("#recordsGrid .grid thead th", els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const rows = await page.$$eval("#recordsGrid .grid tbody tr", els => els.map(e =>
      Array.prototype.map.call(e.querySelectorAll("td"), td => td.textContent)));
    const target = rows.find(r => r[heads.indexOf("발주처(아파트명)")] === "평택비전지웰푸르지오");
    assert.strictEqual(target[heads.indexOf("상태")].trim().startsWith("낙찰"), true, target[heads.indexOf("상태")]);
    assert.strictEqual(target[heads.indexOf("시공사")], "코지건설㈜");
    assert.strictEqual(target[heads.indexOf("시공사 전화번호")], "031-647-3158");
    assert.strictEqual(target[heads.indexOf("전화번호")], "", "발주처 전화번호에 시공사 번호가 들어감");
  });

  await test("낙찰로 바꿔도 새 행이 생기지 않음", async () => {
    const rows = await page.$$eval("#recordsGrid .grid tbody tr", els => els.length);
    assert.strictEqual(rows, 4);
  });

  /* -------------------------------------------------------------- */
  section("6. 특허번호 미기재 알림");

  await test("특허 없는 낙찰은 확인 후 저장되고 상단 알림에 표시", async () => {
    const heads = await page.$$eval("#recordsGrid .grid thead th", els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const index = await page.$$eval(`#recordsGrid .grid tbody tr td:nth-child(${heads.indexOf("발주처(아파트명)") + 1})`,
      els => els.findIndex(e => e.textContent === "금산주공"));
    await page.click(`#recordsGrid .grid tbody tr:nth-child(${index + 1})`);
    await page.click("#btnToAward");
    await page.waitForSelector("#awardPanel.is-open");
    // 이 현장에 붙은 POUR 특허를 지운다
    await page.click("#awardPatentEditor .pour-item-row:first-child .pour-item-del");
    await page.fill("#aw-contractor", "가나건설");
    await page.fill("#aw-contractorPhone", "041-555-0001");
    await page.fill("#aw-awardDate", "2026-06-01");
    await page.fill("#aw-awardAmount", "800000000");
    await page.fill("#aw-categories", "재도장");
    lastDialog = null;
    await page.click("#awardSave");
    assert.ok(lastDialog && lastDialog.includes("미기재 상태로 낙찰 저장할까요"), String(lastDialog));
    await page.waitForSelector("#alert-missingPour");
    const alertText = await page.textContent("#alert-missingPour");
    assert.ok(alertText.includes("POUR 특허번호 미기재 낙찰 1건"), alertText);
  });

  await test("알림을 누르면 해당 낙찰만 표시", async () => {
    await page.click("#alert-missingPour");
    const rows = await page.$$eval("#recordsGrid .grid tbody tr", els => els.length);
    assert.strictEqual(rows, 1);
    const heads = await page.$$eval("#recordsGrid .grid thead th", els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const client = await page.$eval(`#recordsGrid .grid tbody tr:first-child td:nth-child(${heads.indexOf("발주처(아파트명)") + 1})`,
      e => e.textContent);
    assert.strictEqual(client, "금산주공");
  });

  await test("나중에 POUR 특허번호를 넣으면 알림이 사라짐", async () => {
    await page.dblclick("#recordsGrid .grid tbody tr:first-child");
    await page.waitForSelector("#noticePanel.is-open");
    await page.evaluate(() => { document.getElementById("moreBox").open = true; });
    await addPourPatent("1935719");
    await page.click("#panelSave");
    assert.strictEqual(await page.$("#alert-missingPour"), null, "알림이 남아 있음");
  });

  /* -------------------------------------------------------------- */
  section("7. 특허별 실적");

  await test("특허번호별 탭이 자동 생성되고 하위 탭이 있음", async () => {
    await page.click(".nav-item[data-view='patents']");
    const sub = await page.$$eval("#patentViewTabs .status-tab", els => els.map(e => e.textContent.trim()));
    assert.deepStrictEqual(sub, ["POUR 특허별 실적", "타사 특허별 현황", "다특허 현황"]);
    const tabs = await page.$$eval(".sheet-tab", els => els.map(e => e.textContent));
    assert.strictEqual(tabs.length, 50, "탭 " + tabs.length + "개");
    assert.ok(tabs.some(t => t === "특허 제10-1935719호"), tabs.slice(0, 3).join(" | "));
  });

  await test("특허 탭을 누르면 그 특허의 현장만 표시", async () => {
    await page.click('.sheet-tab[data-number="2425081"]');
    const heads = await page.$$eval("#patentGrid thead th", els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const clients = await page.$$eval(`#patentGrid tbody tr td:nth-child(${heads.indexOf("발주처(아파트명)") + 1})`,
      els => els.map(e => e.textContent));
    // 금산주공은 낙찰 단계에서 이 특허를 뺐으므로 하남·양산 두 곳만 남는다
    assert.deepStrictEqual(clients.sort(), ["양산센트럴", "하남미사강변"], clients.join(" | "));
    assert.ok(!clients.includes("평택비전지웰푸르지오"), "다른 특허 현장이 섞임");
  });

  await test("집계가 표시됨", async () => {
    const summary = await page.textContent("#patentSummary");
    assert.ok(summary.includes("특허 제10-2425081호"), summary);
    assert.ok(/전체 \d+건/.test(summary), summary);
  });

  await test("타사 특허별 현황 · 다특허 현황", async () => {
    await page.click("#patentViewTabs [data-pview='third']");
    assert.strictEqual(await page.isVisible("#thirdGrid"), true);
    assert.strictEqual(await page.isVisible("#patentGrid"), false);
    const third = await page.textContent("#thirdGrid");
    assert.ok(third.includes("제10-2091977호"), "타사 특허가 안 보임");

    await page.click("#patentViewTabs [data-pview='multi']");
    assert.strictEqual(await page.isVisible("#multiGrid"), true);
    const heads = await page.$$eval("#multiGrid thead th", els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const totals = await page.$$eval(`#multiGrid tbody tr td:nth-child(${heads.indexOf("전체 특허 개수") + 1})`,
      els => els.map(e => Number(e.textContent)));
    assert.ok(totals.length > 0, "다특허 현장이 없음");
    assert.ok(totals.every(t => t >= 2), totals.join(","));
    await page.click("#patentViewTabs [data-pview='pour']");
  });

  /* -------------------------------------------------------------- */
  section("8. 내보내기");

  await test("현재 필터 결과·특허별 워크시트 내보내기", async () => {
    await page.click(".nav-item[data-view='records']");
    await page.fill("#gridSearch", "하남");
    await page.click(".nav-item[data-view='io']");

    await page.click('[data-export="현재필터"]');
    const msg = await page.textContent("#exportMsg");
    assert.ok(msg.includes("1건을 내보냈습니다"), msg);

    await page.click('[data-export="특허별"]');
    const msg2 = await page.textContent("#exportMsg");
    assert.ok(msg2.includes("워크시트로 내보냈습니다"), msg2);

    // 실제로 특허번호별 워크시트가 만들어지는지 확인한다
    const sheets = await page.evaluate(() => {
      const records = window.PourRecords.list(localStorage);
      const tabs = window.PourRecords.patentTabs(window.PourPatents.list(localStorage), records);
      const wb = window.PourExport.buildPatentWorkbook(tabs, records);
      return wb.worksheets.map(w => w.name);
    });
    assert.strictEqual(sheets.length, 50, "워크시트 " + sheets.length + "장");
    assert.ok(sheets.includes("특허 제10-1935719호"), sheets.slice(0, 3).join(" | "));

    await page.click(".nav-item[data-view='records']");
    await page.fill("#gridSearch", "");
  });

  /* -------------------------------------------------------------- */
  section("9. 통계 · 새로고침 · 반응형");

  await test("통계 화면", async () => {
    await page.click(".nav-item[data-view='stats']");
    const cards = await page.$$eval(".stat-card", els => els.map(e => e.textContent));
    assert.ok(cards.length >= 6, "카드 " + cards.length + "개");
    assert.ok(cards.some(c => c.includes("등록 POUR 특허")), cards.join(" | "));
    await page.click(".nav-item[data-view='records']");
  });

  await test("새로고침 후에도 모든 자료가 유지", async () => {
    const before = await page.$$eval("#recordsGrid .grid tbody tr", els => els.length);
    await page.reload();
    await page.waitForSelector("#recordsGrid .grid tbody tr");
    const after = await page.$$eval("#recordsGrid .grid tbody tr", els => els.length);
    assert.strictEqual(after, before);
    await page.click(".nav-item[data-view='settings']");
    const patents = await page.$$eval("#patentListGrid tbody tr", els => els.length);
    assert.strictEqual(patents, 50, "특허 자료가 사라짐");
    await page.click(".nav-item[data-view='records']");
  });

  await test("태블릿 — 입력창 2열", async () => {
    await page.setViewportSize({ width: 900, height: 1000 });
    await openNewNotice();
    const tops = await page.$$eval("#rowRegion > div", els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    assert.strictEqual(new Set(tops).size, 2, tops.join(","));
    await page.click("#panelClose");
  });

  await test("모바일 — 햄버거 메뉴 · 입력창 1열 · 표 가로 스크롤", async () => {
    await page.setViewportSize({ width: 420, height: 900 });
    assert.strictEqual(await page.isVisible("#navToggle"), true, "햄버거 버튼이 없음");
    assert.strictEqual(await page.isVisible("#appNav"), false, "메뉴가 접히지 않음");
    await page.click("#navToggle");
    assert.strictEqual(await page.isVisible("#appNav"), true);
    await page.click("#navToggle");

    await openNewNotice();
    const tops = await page.$$eval("#rowRegion > div", els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    assert.strictEqual(new Set(tops).size, 4, "1열이 아님");
    await page.click("#panelClose");

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, "본문이 가로로 " + overflow + "px 넘침");
    await page.setViewportSize({ width: 1600, height: 1000 });
  });

  await test("콘솔 오류 없음", async () => {
    assert.deepStrictEqual(consoleErrors, []);
  });

  await browser.close();
  console.log("\n" + "=".repeat(52));
  console.log(`  통과 ${passed} · 실패 ${failed}`);
  console.log("=".repeat(52));
  process.exit(failed ? 1 : 0);
})();
