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
    assert.deepStrictEqual(menus, ["공고·실적", "특허별 실적", "가져오기·내보내기", "설정"]);
    const brand = await page.textContent(".brand");
    assert.ok(brand.includes("NETFORM"), brand);
    assert.ok(brand.includes("POUR 공사실적 관리"), brand);
    assert.strictEqual(await page.isVisible("#recordsGrid"), true);
    assert.strictEqual(await page.$$eval("#statusTabs .status-tab", els => els.length), 4);
  });

  await test("긴 입력폼이 첫 화면에 펼쳐져 있지 않음", async () => {
    assert.strictEqual(await isOpen("#noticePanel"), false, "공고 입력 패널이 열려 있음");
  });

  await test("표 열 순서가 요청한 21개 + 연도·공종 대분류·협약서·처리 단계와 동일", async () => {
    const heads = await page.$$eval("#recordsGrid .grid thead th", els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    assert.deepStrictEqual(heads, [
      "No.", "상태", "연도", "공고일", "서류 마감일", "개찰일", "지역", "도시", "발주처(아파트명)",
      "공사명", "공종 대분류", "공종", "POUR 특허번호", "타사 특허번호", "전화번호", "세대수", "입찰종류",
      "시공사", "시공사 전화번호", "낙찰일", "낙찰금액",
      "협약서 발행번호", "처리 단계", "공사 품질", "비고"
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

  await test("새 공고 패널에 공사 품질·상태·시공사·비고 입력칸이 없음", async () => {
    for (const id of ["#fQuality", "#fStatus", "#fContractor", "#fRemark"]) {
      assert.strictEqual(await page.isVisible(id), false, id + " 가 보임");
    }
    // 보이는 글자만 확인한다 (자료를 지운 것이 아니라 감춘 것이므로 DOM 에는 남아 있다)
    const shown = await page.$eval("#noticePanel", el => el.innerText);
    assert.ok(!shown.includes("공사 품질"), "공사 품질 문구가 보임");
    assert.ok(!shown.includes("비고"), "비고 문구가 보임");
  });

  await test("새 공고 패널에 특허·협약 정보 영역이 없고 특허 입력은 그대로 있음", async () => {
    assert.strictEqual(await page.isVisible("#patentAgreementBox"), false);
    assert.strictEqual(await page.isVisible("#fNoticePatent"), false);
    assert.strictEqual(await page.isVisible("#fAgreement"), false);
    const shown = await page.$eval("#noticePanel", el => el.innerText);
    assert.ok(!shown.includes("협약서 발행번호"), "협약서 발행번호 문구가 보임");
    assert.ok(!shown.includes("공고문 특허·공법 원문"), "공고문 원문 문구가 보임");
    // POUR·타사 특허 입력은 유지된다
    assert.strictEqual(await page.isVisible("#patentEditor"), true);
    assert.strictEqual(await page.isVisible(PATENT_SEARCH), true);
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

  /** 선택 요약에서 "대분류 · 세부, 세부" 를 읽어 항목 목록으로 되돌린다 */
  async function chosenCategories() {
    const parts = await page.$$eval("#categoryPicker .cat-summary-part", els => els.map(e => ({
      group: e.querySelector(".cat-summary-group").textContent,
      names: e.querySelector(".cat-summary-names").textContent
    })));
    return parts.flatMap(p => p.names.split(", ").map(name => ({ group: p.group, name })));
  }

  await test("특허를 고르면 공종이 자동 입력됨", async () => {
    await page.fill(PATENT_SEARCH, "");
    await addPourPatent("1935719");
    const chosen = await chosenCategories();
    assert.deepStrictEqual(chosen.map(c => c.name), ["균열보수", "균열보수 및 재도장"]);
  });

  await test("자동 분류가 확실하지 않은 공종은 임의로 정하지 않고 기타로", async () => {
    const chosen = await chosenCategories();
    // 균열보수 = 재도장·주차장 두 곳, "균열보수 및 재도장" = 분류표에 없음 → 둘 다 기타
    assert.ok(chosen.every(c => c.group === "기타"), JSON.stringify(chosen));
  });

  await test("특허를 더 고르면 공종이 합쳐지고 중복 제거", async () => {
    await addPourPatent("2784426");                    // 공종: 균열보수 및 재도장 (중복)
    const chosen = await chosenCategories();
    const keys = chosen.map(c => c.group + "|" + c.name);
    assert.strictEqual(keys.length, new Set(keys).size, "중복이 남음: " + keys.join(","));
    assert.ok(chosen.some(c => c.name === "균열보수"), keys.join(","));
  });

  await test("특허를 지우면 공종이 다시 계산됨", async () => {
    await page.click(PATENT_ITEMS + ":last-child .pour-item-del");
    const chosen = await chosenCategories();
    assert.deepStrictEqual(chosen.map(c => c.name), ["균열보수", "균열보수 및 재도장"]);
  });

  await test("대분류를 고르면 그 대분류의 세부 공종만 보인다", async () => {
    const expected = {
      "옥상방수": ["PVC", "금속기와", "박공지붕", "방수", "복합시트", "슬라브", "싱글", "우레탄"],
      "재도장": ["균열보수", "재도장"],
      "주차장": ["균열보수", "배면차수", "아스콘", "에폭시", "우레탄", "재도장"],
      "도로": ["보도블럭", "아스콘", "에폭시"]
    };
    for (const [group, items] of Object.entries(expected)) {
      await page.click(`#categoryPicker .cat-group:text-is("${group}")`);
      const shown = await page.$$eval("#categoryPicker .cat-item",
        els => els.map(e => e.getAttribute("data-item")));
      assert.deepStrictEqual(shown, items, group);
    }
  });

  await test("세부 공종을 여러 개 고르고 다시 눌러 해제", async () => {
    await page.click('#categoryPicker .cat-group:text-is("옥상방수")');
    await page.click('#categoryPicker .cat-item[data-item="싱글"]');
    await page.click('#categoryPicker .cat-item[data-item="슬라브"]');
    let chosen = await chosenCategories();
    assert.ok(chosen.some(c => c.group === "옥상방수" && c.name === "싱글"));
    assert.ok(chosen.some(c => c.group === "옥상방수" && c.name === "슬라브"));

    await page.click('#categoryPicker .cat-item[data-item="슬라브"]');   // 다시 눌러 해제
    chosen = await chosenCategories();
    assert.ok(!chosen.some(c => c.name === "슬라브"), JSON.stringify(chosen));
  });

  await test("같은 세부 공종을 두 대분류에서 고르면 각각 남는다", async () => {
    await page.click('#categoryPicker .cat-group:text-is("옥상방수")');
    await page.click('#categoryPicker .cat-item[data-item="우레탄"]');
    await page.click('#categoryPicker .cat-group:text-is("주차장")');
    await page.click('#categoryPicker .cat-item[data-item="우레탄"]');
    const chosen = await chosenCategories();
    assert.ok(chosen.some(c => c.group === "옥상방수" && c.name === "우레탄"));
    assert.ok(chosen.some(c => c.group === "주차장" && c.name === "우레탄"));
  });

  await test("기타를 고르면 직접입력 칸이 나온다", async () => {
    await page.click('#categoryPicker .cat-group:text-is("도로")');
    assert.strictEqual(await page.isVisible("#categoryPicker .cat-custom"), false);
    await page.click('#categoryPicker .cat-group:text-is("기타")');
    assert.strictEqual(await page.isVisible("#categoryPicker .cat-custom"), true);
    await page.fill("#categoryPicker .cat-custom-input", "특수 코팅");
    await page.click("#categoryPicker .cat-custom-btn");
    const chosen = await chosenCategories();
    assert.ok(chosen.some(c => c.group === "기타" && c.name === "특수 코팅"), JSON.stringify(chosen));
  });

  await test("자유 입력 공종 칸은 사라졌다", async () => {
    assert.strictEqual(await page.$("#fCategories"), null);
  });

  await test("제목과 선택 요약이 보인다", async () => {
    assert.strictEqual(await page.textContent("#categoryPicker .cat-title > *:not(.cat-title-hint)")
      .catch(() => null) ?? (await page.$eval("#categoryPicker .cat-title",
        el => el.childNodes[0].textContent.trim())), "공종 선택");
    const summary = await page.$eval("#categoryPicker .cat-summary", el => el.innerText);
    assert.ok(summary.startsWith("선택됨"), summary);
  });

  await test("고른 대분류 탭은 네이비, 나머지는 흰 바탕", async () => {
    await page.click('#categoryPicker .cat-group[data-group="주차장"]');
    const open = await page.$eval('#categoryPicker .cat-group[data-group="주차장"]',
      el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
    assert.deepStrictEqual(open, ["rgb(23, 33, 59)", "rgb(255, 255, 255)"], open.join(" / "));
    const closed = await page.$eval('#categoryPicker .cat-group[data-group="도로"]',
      el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopColor]);
    assert.deepStrictEqual(closed, ["rgb(255, 255, 255)", "rgb(203, 210, 220)"], closed.join(" / "));
  });

  await test("고른 배지는 체크 표시와 네이비 바탕", async () => {
    await page.click('#categoryPicker .cat-group[data-group="도로"]');
    await page.click('#categoryPicker .cat-item[data-item="보도블럭"]');
    const badge = await page.$eval('#categoryPicker .cat-item[data-item="보도블럭"]', el => ({
      bg: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color,
      check: el.querySelector(".cat-item-check").textContent,
      pressed: el.getAttribute("aria-pressed")
    }));
    assert.strictEqual(badge.bg, "rgb(23, 33, 59)");
    assert.strictEqual(badge.color, "rgb(255, 255, 255)");
    assert.strictEqual(badge.check, "✓");
    assert.strictEqual(badge.pressed, "true");
    await page.click('#categoryPicker .cat-item[data-item="보도블럭"]');   // 되돌리기
  });

  await test("특허로 자동 지정된 공종에는 특허 자동 표시", async () => {
    // 앞선 시험에서 제10-1935719호가 골라져 있다 → 공종이 자동으로 들어와 있다
    await page.click('#categoryPicker .cat-group[data-group="기타"]');
    const marks = await page.$$eval("#categoryPicker .cat-item", els => els.map(e => ({
      name: e.getAttribute("data-item"),
      auto: e.querySelector(".cat-item-auto") ? e.querySelector(".cat-item-auto").textContent : null
    })));
    const auto = marks.filter(m => m.name.startsWith("균열보수"));
    assert.strictEqual(auto.length, 2, JSON.stringify(marks));
    assert.ok(auto.every(m => m.auto === "특허 자동"), JSON.stringify(marks));
    // 직접 적어 넣은 것에는 붙지 않는다
    assert.ok(marks.filter(m => m.name === "특수 코팅").every(m => m.auto === null),
      JSON.stringify(marks));
  });

  await test("직접 적어 넣은 공종에는 특허 자동 표시가 없다", async () => {
    await page.fill("#categoryPicker .cat-custom-input", "손으로 적은 공종");
    await page.click("#categoryPicker .cat-custom-btn");
    const mark = await page.$eval('#categoryPicker .cat-item[data-item="손으로 적은 공종"]',
      el => !!el.querySelector(".cat-item-auto"));
    assert.strictEqual(mark, false);
    await page.click('#categoryPicker .cat-item[data-item="손으로 적은 공종"]');   // 되돌리기
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
    const rows = await page.$$eval("#recordsGrid .grid tbody tr td:nth-child(8)", els => els.map(e => e.textContent));
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
    // 새 공고에서 감춘 항목은 상세 수정에서는 다시 보인다 (자료를 지운 것이 아니다)
    for (const id of ["#fQuality", "#fStatus", "#fContractor", "#fRemark",
                      "#fNoticePatent", "#fAgreement"]) {
      assert.strictEqual(await page.isVisible(id), true, id + " 가 수정 화면에서 안 보임");
    }
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
    // 업무 확인 카드는 이름과 건수를 나눠 보여 준다. 원래 문구는 title 에 남는다.
    const card = await page.$eval("#alert-missingPour", (el) => ({
      title: el.getAttribute("title"),
      name: el.querySelector(".alert-card-name").textContent,
      count: el.querySelector(".alert-card-count").textContent
    }));
    assert.strictEqual(card.title, "POUR 특허번호 미기재 낙찰 1건", JSON.stringify(card));
    assert.strictEqual(card.name, "POUR 특허번호 미기재 낙찰", JSON.stringify(card));
    assert.strictEqual(card.count, "1건", JSON.stringify(card));
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
  section("9. 새로고침 · 반응형");

  await test("통계·분석 메뉴·버튼·화면이 없다", async () => {
    assert.strictEqual(await page.$(".nav-item[data-view='stats']"), null, "메뉴가 남음");
    assert.strictEqual(await page.$("#btnStats"), null, "버튼이 남음");
    assert.strictEqual(await page.$("#view-stats"), null, "화면이 남음");
    assert.strictEqual(await page.$(".stat-card"), null, "통계 카드가 남음");
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

  await test("자료를 다시 열어도 저장된 공종이 특허 공종으로 바뀌지 않는다", async () => {
    // 특허를 고른 뒤 공종은 사람이 따로 정해 저장한다
    await openNewNotice();
    await fillBasics("김포", "공종보존시험아파트", "2026-07-01");
    await addPourPatent("1935719");                       // 공종이 자동으로 들어온다
    await page.click('#categoryPicker .cat-group[data-group="도로"]');
    await page.click('#categoryPicker .cat-item[data-item="보도블럭"]');
    await page.click('#categoryPicker .cat-group[data-group="기타"]');
    for (const name of ["균열보수", "균열보수 및 재도장"]) {
      const badge = `#categoryPicker .cat-item[data-item="${name}"]`;
      if (await page.$(badge)) await page.click(badge);   // 자동으로 들어온 것은 뺀다
    }
    const before = await chosenCategories();
    assert.deepStrictEqual(before, [{ group: "도로", name: "보도블럭" }], JSON.stringify(before));
    await page.click("#panelSave");
    await page.waitForTimeout(200);

    // 다시 열었을 때 특허에서 뽑은 공종이 저장값을 덮으면 안 된다
    await page.fill("#gridSearch", "공종보존시험아파트");
    await page.waitForTimeout(200);
    await page.dblclick("#recordsGrid .grid tbody tr:first-child");
    await page.waitForSelector("#noticePanel.is-open");
    await page.waitForTimeout(200);
    const after = await chosenCategories();
    assert.deepStrictEqual(after, before, "저장된 공종이 바뀌었다: " + JSON.stringify(after));
    await page.click("#panelClose");
    await page.fill("#gridSearch", "");
  });

  await test("낙찰 전환에 협약서 발행번호 칸이 있고 번호만으로 저장된다", async () => {
    await openNewNotice();
    await fillBasics("하남", "협약시험아파트", "2026-09-01");
    await page.click("#panelSave");
    await page.waitForTimeout(200);

    await page.fill("#gridSearch", "협약시험아파트");
    await page.waitForTimeout(200);
    await page.click("#recordsGrid .grid tbody tr:first-child");
    await page.click("#btnToAward");
    await page.waitForSelector("#awardPanel.is-open");
    await page.waitForTimeout(300);

    assert.strictEqual(await page.isVisible("#aw-agreementNo"), true, "협약서 발행번호 칸이 없음");
    // 협약서 발행번호만 넣고 나머지는 비워 둔 채 저장한다
    await page.fill("#aw-agreementNo", "HS-2026-777");
    lastDialog = null;
    await page.click("#awardSave");
    await page.waitForTimeout(400);
    assert.strictEqual(await page.isVisible("#awardPanel.is-open"), false,
      "저장되지 않고 패널이 열린 채로 남음");

    const heads = await page.$$eval("#recordsGrid .grid thead th",
      els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const row = await page.$$eval("#recordsGrid .grid tbody tr:first-child td",
      els => els.map(e => e.innerText.trim()));
    assert.strictEqual(row[heads.indexOf("상태")], "낙찰", row.join(" | "));
    assert.strictEqual(row[heads.indexOf("협약서 발행번호")], "HS-2026-777");
    assert.strictEqual(row[heads.indexOf("처리 단계")], "추가 입력 필요");
  });

  await test("빠진 낙찰 정보가 추가 입력 필요 알림에 표시된다", async () => {
    await page.fill("#gridSearch", "");
    await page.waitForTimeout(200);
    const labels = await page.$$eval("#alertBar .alert-card", els => els.map(e => e.innerText.replace(/\n/g, " ")));
    assert.ok(labels.some(t => t.includes("낙찰 정보 추가 입력 필요")), labels.join(" | "));
    await page.click("#alert-awardIncomplete");
    await page.waitForTimeout(200);
    const clients = await page.$$eval("#recordsGrid .grid tbody tr", els => els.length);
    assert.ok(clients >= 1, "알림을 눌러도 걸러지지 않음");
    await page.click("#btnRefresh");
    await page.waitForTimeout(200);
  });

  await test("낙찰이어도 정보가 덜 차 있으면 이어서 보완할 수 있다", async () => {
    await page.fill("#gridSearch", "협약시험아파트");
    await page.waitForTimeout(250);
    await page.click("#recordsGrid .grid tbody tr:first-child");
    assert.strictEqual(await page.isEnabled("#btnToAward"), true, "보완 버튼이 잠겨 있음");
    assert.strictEqual((await page.textContent("#btnToAward")).trim(), "낙찰 정보 보완");

    await page.click("#btnToAward");
    await page.waitForSelector("#awardPanel.is-open");
    await page.waitForTimeout(300);
    const guide = await page.textContent("#awardMsg");
    assert.ok(guide.includes("아직 비어 있는 항목"), guide);

    await page.fill("#aw-contractor", "가나건설");
    await page.fill("#aw-contractorPhone", "0311112222");
    await page.fill("#aw-awardDate", "2026-10-01");
    await page.fill("#aw-awardAmount", "500000000");
    await page.fill("#aw-categories", "보도블럭");
    await page.click("#awardSave");
    await page.waitForTimeout(400);

    const heads = await page.$$eval("#recordsGrid .grid thead th",
      els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const row = await page.$$eval("#recordsGrid .grid tbody tr:first-child td",
      els => els.map(e => e.innerText.trim()));
    assert.strictEqual(row[heads.indexOf("처리 단계")], "정리 완료", row.join(" | "));
    assert.strictEqual(row[heads.indexOf("협약서 발행번호")], "HS-2026-777", "번호가 사라짐");
  });

  await test("협약서 발행번호를 지우면 되돌릴지 물어본다", async () => {
    await page.dblclick("#recordsGrid .grid tbody tr:first-child");
    await page.waitForSelector("#noticePanel.is-open");
    await page.waitForTimeout(300);
    await page.fill("#fAgreement", "");
    lastDialog = null;
    await page.click("#panelSave");          // 확인창은 위쪽 dialog 처리기가 수락한다
    await page.waitForTimeout(400);
    assert.ok(lastDialog && lastDialog.includes("공고"), String(lastDialog));

    const heads = await page.$$eval("#recordsGrid .grid thead th",
      els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const row = await page.$$eval("#recordsGrid .grid tbody tr:first-child td",
      els => els.map(e => e.innerText.trim()));
    assert.strictEqual(row[heads.indexOf("상태")], "공고", "되돌리기를 골랐는데 낙찰로 남음");
    assert.strictEqual(row[heads.indexOf("협약서 발행번호")], "", "지운 번호가 되살아남");
    await page.fill("#gridSearch", "");
    await page.waitForTimeout(200);
  });

  await test("공고일이 없는 옛 자료도 상세 수정으로 협약서 발행번호를 넣을 수 있다", async () => {
    // 엑셀에서 옮겨 온 자료에는 공고일이 없다. 필수 검사에 걸려 저장이 막히면 안 된다.
    await page.evaluate(() => {
      const PourRecords = window.PourRecords;
      PourRecords.save({
        id: "rec-imp-9001", source: "import", client: "옛자료수정시험",
        city: "하남", status: "낙찰", noticeDate: "",
        patentNumbers: ["1935719"], patentConfirmed: true
      }, localStorage);
    });
    await page.click("#btnRefresh");
    await page.fill("#gridSearch", "옛자료수정시험");
    await page.waitForTimeout(250);

    const heads = await page.$$eval("#recordsGrid .grid thead th",
      els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    let row = await page.$$eval("#recordsGrid .grid tbody tr:first-child td",
      els => els.map(e => e.innerText.trim()));
    assert.strictEqual(row[heads.indexOf("처리 단계")], "협약서번호 미입력", row.join(" | "));

    await page.dblclick("#recordsGrid .grid tbody tr:first-child");
    await page.waitForSelector("#noticePanel.is-open");
    await page.waitForTimeout(250);
    await page.fill("#fAgreement", "HS-OLD-001");
    await page.click("#panelSave");
    await page.waitForTimeout(350);
    assert.strictEqual(await page.isVisible("#noticePanel.is-open"), false, "저장이 막힘");

    row = await page.$$eval("#recordsGrid .grid tbody tr:first-child td",
      els => els.map(e => e.innerText.trim()));
    assert.strictEqual(row[heads.indexOf("협약서 발행번호")], "HS-OLD-001", row.join(" | "));
    assert.strictEqual(row[heads.indexOf("처리 단계")], "추가 입력 필요");
    await page.fill("#gridSearch", "");
    await page.waitForTimeout(200);
  });

  await test("엑셀 이전분은 협약서번호 미입력 알림에 올라오지 않는다", async () => {
    // 위 시험에서 이전분 한 건은 번호가 채워졌다. 번호 없는 이전분을 하나 더 만든다.
    await page.evaluate(() => {
      window.PourRecords.save({
        id: "rec-imp-9002", source: "import", client: "이전분알림시험",
        city: "하남", status: "낙찰", patentNumbers: ["1935719"], patentConfirmed: true
      }, localStorage);
    });
    await page.click("#btnRefresh");
    await page.waitForTimeout(300);
    const labels = await page.$$eval("#alertBar .alert-card", els => els.map(e => e.innerText.replace(/\n/g, " ")));
    const chip = labels.filter(t => t.includes("협약서번호 미입력"))[0];
    if (chip) {
      // 알림이 있다면 이전분은 그 안에 없어야 한다
      await page.click("#alert-noAgreement");
      await page.waitForTimeout(250);
      const clients = await page.$$eval("#recordsGrid .grid tbody tr td:nth-child(9)",
        els => els.map(e => e.textContent.trim()));
      assert.ok(!clients.includes("이전분알림시험"), clients.join(", "));
      await page.click("#btnRefresh");
      await page.waitForTimeout(200);
    }
  });

  await test("알림이 업무 확인 카드로 보이고 누르면 그대로 걸러진다", async () => {
    const cards = await page.$$eval("#alertBar .alert-card", els => els.map((e) => ({
      tag: e.querySelector(".alert-card-tag").textContent,
      name: e.querySelector(".alert-card-name").textContent,
      note: e.querySelector(".alert-card-note").textContent,
      count: e.querySelector(".alert-card-count").textContent,
      id: e.id
    })));
    assert.ok(cards.length > 0, "알림 카드가 없다");
    cards.forEach((c) => {
      assert.strictEqual(c.tag, "중요 확인", JSON.stringify(c));
      assert.strictEqual(c.note, "확인 필요", JSON.stringify(c));
      assert.ok(/^[\d,]+건$/.test(c.count), "건수 표기: " + c.count);
      assert.ok(!/\d+건$/.test(c.name), "이름에 건수가 남음: " + c.name);
    });
    // 건수는 카드 안에서 가장 큰 글자여야 한다
    const sizes = await page.$eval("#alertBar .alert-card", (el) => ({
      count: parseFloat(getComputedStyle(el.querySelector(".alert-card-count")).fontSize),
      name: parseFloat(getComputedStyle(el.querySelector(".alert-card-name")).fontSize)
    }));
    assert.ok(sizes.count > sizes.name, JSON.stringify(sizes));

    // 누르면 예전처럼 그 자료만 걸러진다
    await page.click("#" + cards[0].id);
    await page.waitForTimeout(250);
    const note = await page.textContent("#gridCount");
    assert.ok(note.includes("만 표시 중"), note);
    await page.click("#btnRefresh");
    await page.waitForTimeout(200);
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
