/**
 * 브라우저 동작 검증 (Playwright + Chromium)
 *   node pour-integration/test/browser.test.js
 */
const { chromium } = require("playwright");
const path = require("path");
const assert = require("assert");

const PAGE_URL = "file://" + path.join(__dirname, "..", "demo.html");

const POUR_SEARCH = "#patentEditor .pour-kind-search";
const EDIT_SEARCH = "#editPatentEditor .pour-kind-search";
const POUR_ITEMS  = "#patentEditor .pour-item-row";
const EDIT_ITEMS  = "#editPatentEditor .pour-item-row";

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); failed++; }
}
function section(t) { console.log("\n" + t); }

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", e => console.log("      [브라우저 오류] " + e.message));
  await page.goto(PAGE_URL);
  // 특허 입력은 "펼치기" 안에 있으므로 열어둔다
  await page.evaluate(() => { document.getElementById("moreDetails").open = true; });

  // 확인 대화상자는 자동 승인 (낙찰 미기재 확인용 경고)
  let lastDialog = null;
  page.on("dialog", async d => { lastDialog = d.message(); await d.accept(); });

  /* -------------------------------------------------------------- */
  section("1. 특허 엑셀 업로드");

  await page.click("#loadSampleBtn");

  await test("업로드 건수와 등록 목록 표시", async () => {
    const stats = await page.textContent("#uploadStats");
    assert.ok(stats.includes("6건정상 등록"), stats);
    const list = await page.textContent("#patentListWrap");
    assert.ok(list.includes("제10-1935719호"), "등록 목록에 특허 없음");
  });

  await test("특허 목록 검색", async () => {
    await page.fill("#patentListSearch", "재도장");
    const list = await page.textContent("#patentListWrap");
    assert.ok(list.includes("제10-1935719호"));
    assert.ok(!list.includes("제10-2535699호"), "에폭시 특허가 걸러지지 않음");
    await page.fill("#patentListSearch", "");
  });

  /* -------------------------------------------------------------- */
  section("2. 지역·도시 자동 분류");

  await test("하남 입력 → 경기 하남", async () => {
    await page.fill("#cityInput", "하남");
    await page.dispatchEvent("#cityInput", "change");
    assert.strictEqual(await page.inputValue("#regionSelect"), "경기");
    assert.strictEqual(await page.inputValue("#cityInput"), "하남");
  });

  await test("금산 입력 → 충남 금산", async () => {
    await page.fill("#cityInput", "금산");
    await page.dispatchEvent("#cityInput", "change");
    assert.strictEqual(await page.inputValue("#regionSelect"), "충남");
    assert.strictEqual(await page.inputValue("#cityInput"), "금산");
  });

  await test("중구 입력 시 지역 선택칸에 후보가 채워지고 직접 고를 수 있음", async () => {
    await page.click("#cityInput", { clickCount: 3 });
    await page.fill("#cityInput", "중구");
    await page.dispatchEvent("#cityInput", "change");
    const options = await page.$$eval("#regionSelect option", els => els.map(e => e.value));
    ["서울", "부산", "대구", "대전", "울산"].forEach(r =>
      assert.ok(options.includes(r), r + " 후보 없음: " + options.join(",")));
    await page.selectOption("#regionSelect", "부산");
    assert.strictEqual(await page.inputValue("#regionSelect"), "부산");
  });

  /* -------------------------------------------------------------- */
  section("3. 특허 자동검색과 공종 자동 입력");

  await test("193 입력 시 제10-1935719호 추천", async () => {
    await page.fill(POUR_SEARCH, "193");
    await page.waitForSelector("#patentEditor .pour-suggest.is-open", { timeout: 2000 });
    const text = await page.textContent("#patentEditor .pour-suggest.is-open");
    assert.ok(text.includes("제10-1935719호"), text);
  });

  await test("POUR 입력 시 특허명으로 검색", async () => {
    await page.fill(POUR_SEARCH, "POUR");
    const items = await page.$$eval("#patentEditor .pour-suggest.is-open .pour-suggest-item",
      els => els.map(e => e.textContent));
    assert.ok(items.length >= 4, "결과 " + items.length + "건");
    assert.ok(items.every(t => t.includes("POUR")), items.join(" | "));
  });

  await test("방향키와 Enter로 선택 → 칩 추가 · 공종 자동 입력", async () => {
    await page.fill(POUR_SEARCH, "1935719");
    await page.waitForSelector("#patentEditor .pour-suggest.is-open");
    await page.press(POUR_SEARCH, "Enter");
    const chips = await page.textContent("#patentEditor .pour-item-list");
    assert.ok(chips.includes("제10-1935719호"), chips);
    assert.strictEqual(await page.inputValue("#categoryInput"), "재도장");
  });

  await test("특허를 더 고르면 공종이 중복 없이 합쳐짐", async () => {
    await page.fill(POUR_SEARCH, "2425081");
    await page.waitForSelector("#patentEditor .pour-suggest.is-open");
    await page.press(POUR_SEARCH, "Enter");
    await page.fill(POUR_SEARCH, "2562854");        // 공종이 다시 재도장 (중복)
    await page.waitForSelector("#patentEditor .pour-suggest.is-open");
    await page.press(POUR_SEARCH, "Enter");
    assert.strictEqual(await page.inputValue("#categoryInput"), "재도장, 슬라브");
  });

  await test("같은 특허는 중복 선택되지 않음", async () => {
    const before = await page.$$eval(POUR_ITEMS, els => els.length);
    await page.fill(POUR_SEARCH, "1935719");
    await page.waitForSelector("#patentEditor .pour-suggest.is-open");
    await page.press(POUR_SEARCH, "Enter");
    const after = await page.$$eval(POUR_ITEMS, els => els.length);
    assert.strictEqual(after, before, "중복 추가됨");
  });

  await test("특허를 지우면 공종이 다시 계산됨", async () => {
    await page.click(POUR_ITEMS + ":nth-child(2) .pour-item-del");   // 슬라브 특허 제거
    assert.strictEqual(await page.inputValue("#categoryInput"), "재도장");
    while (await page.$$eval(POUR_ITEMS, els => els.length)) {
      await page.click(POUR_ITEMS + ":last-child .pour-item-del");
    }
    assert.strictEqual(await page.inputValue("#categoryInput"), "");
  });

  await test("등록되지 않은 번호는 안내 문구 표시", async () => {
    await page.fill(POUR_SEARCH, "9999999");
    await page.dispatchEvent(POUR_SEARCH, "change");
    const dropdown = await page.textContent("#patentEditor .pour-suggest");
    assert.ok(dropdown.includes("등록된 POUR 특허가 없습니다"), dropdown);
    await page.fill(POUR_SEARCH, "");
  });

  /* -------------------------------------------------------------- */
  section("4. 공고 등록과 실적표");

  async function registerSite(city, client, patents, extra) {
    await page.click("#resetFormBtn");
    await page.evaluate(() => { document.getElementById("moreDetails").open = true; });
    await page.fill("#cityInput", city);
    await page.dispatchEvent("#cityInput", "change");
    await page.fill("#clientInput", client);
    await page.fill("#noticeDate", "2026-03-02");
    for (const p of patents || []) {
      await page.fill(POUR_SEARCH, p);
      await page.waitForSelector("#patentEditor .pour-suggest.is-open");
      await page.press(POUR_SEARCH, "Enter");
    }
    for (const [id, value] of Object.entries(extra || {})) await page.fill(id, value);
    await page.click("#saveBtn");
    const msg = await page.textContent("#saveMsg");
    assert.ok(msg.includes("등록했습니다"), msg);
  }

  await registerSite("평택", "평택비전지웰푸르지오", ["1935719", "2425081", "2535699"], {
    "#projectNames": "외벽·지하주차장 바닥 균열보수 및 도장공사\n옥상 방수공사",
    "#phoneInput": "031-647-3158",
    "#householdsInput": "717",
    "#noticeDate": "2026-03-02",
    "#noticePatentText": "POUR공법 (특허 제10-1935719호)"
  });

  await test("여러 공종·특허번호·공사명이 한 셀에서 줄바꿈", async () => {
    const cells = await page.$$eval("#allTable tbody tr:first-child td", els => els.map(e => e.textContent));
    // 고른 순서(1935719 재도장 → 2425081 슬라브 → 2535699 에폭시)대로 줄바꿈된다
    assert.strictEqual(cells[0], "재도장\n슬라브\n에폭시", JSON.stringify(cells[0]));
    assert.strictEqual(cells[3], "제10-1935719호\n제10-2425081호\n제10-2535699호", JSON.stringify(cells[3]));
    assert.strictEqual(cells[5], "외벽·지하주차장 바닥 균열보수 및 도장공사\n옥상 방수공사", JSON.stringify(cells[5]));
  });

  await test("한 현장은 한 행 · 지역과 도시는 별도 열", async () => {
    const rows = await page.$$eval("#allTable tbody tr", els => els.length);
    assert.strictEqual(rows, 1);
    const cells = await page.$$eval("#allTable tbody tr:first-child td", els => els.map(e => e.textContent));
    assert.strictEqual(cells[1], "경기");
    assert.strictEqual(cells[2], "평택");
    assert.strictEqual(cells[6], "031-647-3158", "전화번호 앞자리 0 유지");
    assert.strictEqual(cells[7], "717");
  });

  await test("열 제목 순서가 요청한 20개와 동일", async () => {
    const heads = await page.$$eval("#allTable thead th", els => els.map(e => e.textContent.replace(/[▲▼]/g, "")));
    assert.deepStrictEqual(heads.slice(0, 22), [
      "공종", "지역", "도시", "POUR 특허번호", "발주처(아파트명)", "공사명", "발주처 전화번호", "세대수",
      "공사 품질", "시공사", "시공사 전화번호", "상태", "공고일", "서류 마감일", "개찰일", "낙찰일",
      "낙찰금액", "협약서 발행번호", "POUR 특허명·공법명", "공사 범위", "주소", "비고"
    ]);
  });

  await test("열 제목 고정과 좌우 스크롤 설정", async () => {
    const style = await page.$eval("#allTable thead th", el => {
      const s = getComputedStyle(el);
      return { position: s.position, top: s.top, weight: s.fontWeight, align: s.textAlign };
    });
    assert.strictEqual(style.position, "sticky");
    assert.strictEqual(style.align, "center");
    assert.ok(Number(style.weight) >= 700, "제목이 굵지 않음");
    const wrap = await page.$eval("#allTable", el => getComputedStyle(el).overflow);
    assert.ok(wrap.includes("auto"), wrap);
  });

  await test("열 제목 클릭으로 정렬", async () => {
    await registerSite("하남", "하남미사강변", ["2562854"], { "#householdsInput": "1240" });
    await page.click("#allTable thead th:nth-child(8)");     // 세대수
    let first = await page.$eval("#allTable tbody tr:first-child td:nth-child(8)", e => e.textContent);
    assert.strictEqual(first, "717");
    await page.click("#allTable thead th:nth-child(8)");
    first = await page.$eval("#allTable tbody tr:first-child td:nth-child(8)", e => e.textContent);
    assert.strictEqual(first, "1,240", "천 단위 쉼표 + 내림차순");
  });

  /* -------------------------------------------------------------- */
  section("5. 특허번호 없이 등록·낙찰과 미기재 알림");

  await test("특허번호 없이 공고 등록 가능", async () => {
    await registerSite("금산", "금산주공", [], {
      "#categoryInput": "재도장",
      "#noticePatentText": "POUR공법",
      "#noticeDate": "2026-04-01"
    });
    const rows = await page.$$eval("#allTable tbody tr", els => els.length);
    assert.strictEqual(rows, 3);
  });

  await test("공고 자료는 상단 알림에 포함되지 않음", async () => {
    assert.strictEqual(await page.isVisible("#alert-missingPour"), false);
  });

  await test("공고 자료에 '낙찰로 변경' 버튼이 표시", async () => {
    const rowIndex = await page.$$eval("#allTable tbody tr td:nth-child(5)",
      els => els.findIndex(e => e.textContent === "금산주공"));
    assert.ok(rowIndex >= 0, "금산주공 행을 찾지 못함");
    const button = await page.$(`#allTable tbody tr:nth-child(${rowIndex + 1}) button[data-award-id]`);
    assert.ok(button, "낙찰로 변경 버튼이 없음");
    assert.strictEqual((await button.textContent()).trim(), "낙찰로 변경");
  });

  await test("버튼을 누르면 낙찰 상세정보 창이 열리고 공고 요약이 보임", async () => {
    const rowIndex = await page.$$eval("#allTable tbody tr td:nth-child(5)",
      els => els.findIndex(e => e.textContent === "금산주공"));
    await page.click(`#allTable tbody tr:nth-child(${rowIndex + 1}) button[data-award-id]`);
    assert.strictEqual(await page.isVisible("#awardBack"), true);
    const summary = await page.textContent("#awardSummary");
    assert.ok(summary.includes("금산주공"), summary);
    assert.ok(summary.includes("충남 금산"), summary);
    assert.ok(summary.includes("POUR공법"), summary);
    assert.ok(summary.includes("현재 상태: 공고"), summary);
  });

  await test("시공사명·전화번호·낙찰일·금액·공종이 없으면 저장 차단", async () => {
    await page.click("#awardSave");
    const message = await page.textContent("#awardMsg");
    assert.ok(message.includes("시공사명, 시공사 전화번호, 낙찰일, 낙찰금액 및 최종 공종"), message);
    for (const key of ["contractor", "contractorPhone", "awardDate", "awardAmount"]) {
      assert.strictEqual(await page.isVisible("#award-error-" + key), true, key + " 개별 안내 없음");
    }
    assert.strictEqual(await page.isEnabled("#awardSave"), true, "저장 버튼이 잠긴 채로 남음");
  });

  await test("전화번호는 숫자만 넣어도 하이픈이 붙고 앞자리 0이 유지", async () => {
    await page.fill("#award-contractorPhone", "0316473158");
    await page.dispatchEvent("#award-contractorPhone", "blur");
    assert.strictEqual(await page.inputValue("#award-contractorPhone"), "031-647-3158");
  });

  await test("낙찰금액에 천 단위 쉼표 표시", async () => {
    await page.fill("#award-awardAmount", "800000000");
    await page.dispatchEvent("#award-awardAmount", "blur");
    assert.strictEqual(await page.inputValue("#award-awardAmount"), "800,000,000");
  });

  await test("특허번호 없이 확인 경고 후 낙찰 저장", async () => {
    await page.fill("#award-contractor", "가나건설");
    await page.fill("#award-awardDate", "2026-05-10");
    await page.fill("#award-categories", "재도장");
    lastDialog = null;
    await page.click("#awardSave");
    assert.ok(lastDialog && lastDialog.includes("미기재 상태로 낙찰 저장할까요"), String(lastDialog));
    assert.strictEqual(await page.isVisible("#awardBack"), false, "창이 닫히지 않음");
  });

  await test("발주처 전화번호와 시공사 전화번호가 다른 열에 저장", async () => {
    const heads = await page.$$eval("#allTable thead th", els => els.map(e => e.textContent.replace(/[▲▼]/g, "")));
    assert.ok(heads.includes("발주처 전화번호"), heads.join(","));
    assert.ok(heads.includes("시공사 전화번호"), heads.join(","));
    const rowIndex = await page.$$eval("#allTable tbody tr td:nth-child(5)",
      els => els.findIndex(e => e.textContent === "금산주공"));
    const cells = await page.$$eval(`#allTable tbody tr:nth-child(${rowIndex + 1}) td`,
      els => els.map(e => e.textContent));
    assert.strictEqual(cells[heads.indexOf("발주처 전화번호")], "");
    assert.strictEqual(cells[heads.indexOf("시공사 전화번호")], "031-647-3158");
    assert.strictEqual(cells[heads.indexOf("시공사")], "가나건설");
  });

  await test("낙찰로 바꿔도 새 행이 생기지 않음", async () => {
    const matches = await page.$$eval("#allTable tbody tr td:nth-child(5)",
      els => els.filter(e => e.textContent === "금산주공").length);
    assert.strictEqual(matches, 1);
  });

  await test("해당 건이 상단 알림에 표시", async () => {
    assert.strictEqual(await page.isVisible("#alert-missingPour"), true);
    const text = await page.textContent("#alert-missingPour");
    assert.ok(text.includes("POUR 특허번호 미기재 낙찰 1건"), text);
  });

  await test("알림 배경이 경고색(주황·노랑 계열)", async () => {
    const bg = await page.$eval("#alert-missingPour", el => getComputedStyle(el).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    assert.ok(r > 240 && g > 200 && b < 240 && r > b, "경고색이 아님: " + bg);
  });

  await test("알림 클릭 시 미기재 목록 표시", async () => {
    await page.click("#alert-missingPour");
    assert.strictEqual(await page.isVisible("#missingSection"), true);
    const heads = await page.$$eval("#missingTable thead th", els => els.map(e => e.textContent));
    assert.deepStrictEqual(heads, [
      "발주처(아파트명)", "지역", "도시", "공사명", "공종", "낙찰일", "시공사",
      "공고문 특허·공법 원문", "협약서 발행번호", "POUR 적용 특허번호", "비고", "수정"
    ]);
    const rows = await page.$$eval("#missingTable tbody tr", els => els.length);
    assert.strictEqual(rows, 1);
  });

  await test("유찰·공고취소·재공고·타공법 낙찰은 알림에서 제외", async () => {
    for (const status of ["유찰", "공고취소", "재공고", "타공법 낙찰"]) {
      await registerSite("평택", "제외확인-" + status, [], { "#categoryInput": "재도장" });
      await page.selectOption("#statusInput", status);
      // 상태를 바꿔 다시 저장하는 대신 수정 창으로 상태 변경
      const id = await page.$eval("#allTable tbody tr:last-child button[data-edit-id]", el => el.dataset.editId);
      await page.click(`button[data-edit-id="${id}"]`);
      await page.selectOption("#edit-status", status);
      await page.click("#editSave");
    }
    const text = await page.textContent("#alert-missingPour");
    assert.ok(text.includes("낙찰 1건"), "알림 건수가 늘어남: " + text);
  });

  /* -------------------------------------------------------------- */
  section("6. 나중에 특허번호 입력");

  await test("미기재 목록에서 특허번호 입력 창 열기", async () => {
    await page.click("#missingTable tbody tr:first-child button");
    assert.strictEqual(await page.isVisible("#editBack"), true);
    const title = await page.textContent("#editTitle");
    assert.ok(title.includes("금산주공"), title);
    assert.strictEqual(await page.inputValue("#edit-noticePatentText"), "POUR공법");
  });

  await test("엑셀에 없는 번호는 경고하고 저장을 보류", async () => {
    await page.fill(EDIT_SEARCH, "8888888");
    await page.dispatchEvent(EDIT_SEARCH, "change");
    const dropdown = await page.textContent("#editPatentEditor .pour-suggest");
    assert.ok(dropdown.includes("등록된 POUR 특허가 없습니다"), dropdown);
  });

  await test("검색해서 고른 특허로 저장하면 알림에서 사라짐", async () => {
    await page.fill(EDIT_SEARCH, "193");
    await page.waitForSelector("#editPatentEditor .pour-suggest.is-open");
    await page.press(EDIT_SEARCH, "Enter");
    const chips = await page.textContent("#editPatentEditor .pour-item-list");
    assert.ok(chips.includes("제10-1935719호"), chips);
    await page.click("#editSave");
    assert.strictEqual(await page.isVisible("#editBack"), false);
    assert.strictEqual(await page.isVisible("#alert-missingPour"), false, "알림이 남아 있음");
  });

  await test("특허 탭에 해당 현장이 즉시 반영", async () => {
    await page.click('.pour-tab[data-number="1935719"]');
    const clients = await page.$$eval("#patentTable tbody tr td:nth-child(5)", els => els.map(e => e.textContent));
    assert.ok(clients.includes("금산주공"), clients.join(" | "));
  });

  /* -------------------------------------------------------------- */
  section("7. 특허별 실적 탭");

  await test("등록된 특허마다 탭 자동 생성", async () => {
    const tabs = await page.$$eval(".pour-tab", els => els.map(e => e.textContent));
    ["특허 제10-1935719호", "특허 제10-2425081호", "특허 제10-2535699호",
     "(DO)특허 제10-2699417호", "특허 제10-2562854호"].forEach(l =>
      assert.ok(tabs.includes(l), l + " 없음"));
  });

  await test("선택한 탭이 강조 표시", async () => {
    const active = await page.$eval(".pour-tab.is-active", el => ({
      text: el.textContent, bg: getComputedStyle(el).backgroundColor
    }));
    assert.strictEqual(active.text, "특허 제10-1935719호");
    assert.notStrictEqual(active.bg, "rgba(0, 0, 0, 0)");
  });

  await test("한 현장에 특허 3개면 세 탭에 각각 표시", async () => {
    for (const n of ["1935719", "2425081", "2535699"]) {
      await page.click(`.pour-tab[data-number="${n}"]`);
      const clients = await page.$$eval("#patentTable tbody tr td:nth-child(5)", els => els.map(e => e.textContent));
      assert.ok(clients.includes("평택비전지웰푸르지오"), n + " 탭에 없음");
    }
  });

  await test("같은 탭에서 같은 현장이 중복되지 않음", async () => {
    await page.click('.pour-tab[data-number="1935719"]');
    const clients = await page.$$eval("#patentTable tbody tr td:nth-child(5)", els => els.map(e => e.textContent));
    assert.strictEqual(clients.length, new Set(clients).size, clients.join(" | "));
  });

  await test("탭 표는 순번부터 세대수까지 핵심 열이 앞에", async () => {
    const heads = await page.$$eval("#patentTable thead th", els => els.map(e => e.textContent.replace(/[▲▼]/g, "")));
    assert.deepStrictEqual(heads.slice(0, 8), [
      "순번", "지역", "도시", "특허번호", "발주처(아파트명)", "공사명", "발주처 전화번호", "세대수"
    ]);
  });

  await test("집계 표시", async () => {
    const summary = await page.textContent("#patentSummary");
    assert.ok(summary.includes("특허 제10-1935719호"), summary);
    assert.ok(/전체 \d+건/.test(summary), summary);
    assert.ok(/낙찰 \d+건/.test(summary), summary);
    assert.ok(/세대/.test(summary), summary);
  });

  await test("상태 필터", async () => {
    await page.selectOption("#filterStatus", "낙찰");
    const statuses = await page.$$eval("#patentTable tbody tr td:nth-child(10)", els => els.map(e => e.textContent));
    assert.ok(statuses.every(s => s === "낙찰"), statuses.join(" | "));
    await page.selectOption("#filterStatus", "전체");
  });

  await test("탭 이동 버튼", async () => {
    const before = await page.$eval(".pour-tab.is-active", el => el.textContent);
    await page.click(".pour-tab-nav:last-of-type");
    const after = await page.$eval(".pour-tab.is-active", el => el.textContent);
    assert.notStrictEqual(before, after);
  });

  await test("탭 검색", async () => {
    await page.fill(".pour-tab-search", "2425");
    const tabs = await page.$$eval(".pour-tab", els => els.map(e => e.textContent));
    assert.deepStrictEqual(tabs, ["특허 제10-2425081호"]);
    await page.fill(".pour-tab-search", "");
  });

  /* -------------------------------------------------------------- */
  section("8. 자료 수정과 이력");

  await test("공고 등록·수정 화면에 예상금액 입력칸이 없음", async () => {
    assert.strictEqual(await page.$("#expectedAmount"), null, "등록 화면에 예상금액이 있음");
    const id = await page.$eval("#allTable tbody tr:first-child button[data-edit-id]", el => el.dataset.editId);
    await page.click(`#allTable button[data-edit-id="${id}"]`);
    assert.strictEqual(await page.$("#edit-expectedAmount"), null, "수정 화면에 예상금액이 있음");
    await page.click("#editCancel");
  });

  await test("안내 상자(지역 자동 입력 · 자동 특허 처리)가 없음", async () => {
    const text = await page.textContent("body");
    assert.ok(!text.includes("지역이 자동으로 채워집니다"), "지역 자동 입력 안내 상자가 남아 있음");
    assert.ok(!text.includes("협약서발행번호를 적용합니다"), "자동 특허 처리 안내 상자가 남아 있음");
  });

  await test("전체 목록의 수정 버튼으로 모든 항목 수정", async () => {
    const id = await page.$eval("#allTable tbody tr:first-child button[data-edit-id]", el => el.dataset.editId);
    await page.click(`#allTable button[data-edit-id="${id}"]`);
    await page.fill("#edit-client", "이름을 바꾼 단지");
    await page.fill("#edit-bidType", "제한경쟁");
    await page.fill("#edit-remark", "수정 확인");
    await page.click("#editSave");
    const text = await page.textContent("#allTable");
    assert.ok(text.includes("이름을 바꾼 단지"), "수정 내용이 표에 없음");
  });

  await test("수정해도 행이 늘지 않음", async () => {
    const rows = await page.$$eval("#allTable tbody tr", els => els.length);
    assert.strictEqual(rows, 7, "행 수 " + rows);
  });

  await test("수정 이력이 남음", async () => {
    const id = await page.$eval("#allTable tbody tr:first-child button[data-edit-id]", el => el.dataset.editId);
    await page.click(`#allTable button[data-edit-id="${id}"]`);
    const history = await page.textContent("#editHistory");
    assert.ok(history.includes("수정 이력"), history);
    assert.ok(history.includes("발주처(아파트명)") || history.includes("비고"), history);
    await page.click("#editCancel");
  });

  /* -------------------------------------------------------------- */
  section("9. POUR / 타사 특허 분리 입력");

  const THIRD_TAB = "#patentEditor .pour-kind-tab:nth-child(2)";
  const POUR_TAB = "#patentEditor .pour-kind-tab:nth-child(1)";

  await test("탭 이름에 현재 입력 개수가 표시", async () => {
    await page.click("#resetFormBtn");
    await page.evaluate(() => { document.getElementById("moreDetails").open = true; });
    assert.strictEqual((await page.textContent(POUR_TAB)).trim(), "POUR 특허(우리 특허) (0)");
    assert.strictEqual((await page.textContent(THIRD_TAB)).trim(), "타사 특허 (0)");
  });

  await test("POUR 특허를 3개 이상 추가", async () => {
    for (const n of ["1935719", "2425081", "2535699"]) {
      await page.fill(POUR_SEARCH, n);
      await page.waitForSelector("#patentEditor .pour-suggest.is-open");
      await page.press(POUR_SEARCH, "Enter");
    }
    assert.strictEqual(await page.$$eval(POUR_ITEMS, els => els.length), 3);
    assert.strictEqual((await page.textContent(POUR_TAB)).trim(), "POUR 특허(우리 특허) (3)");
  });

  async function addThird(number, name, company) {
    await page.click(THIRD_TAB);
    await page.fill("#patentEditor .pour-third-number", number);
    if (name) await page.fill("#patentEditor .pour-third-name", name);
    if (company) await page.fill("#patentEditor .pour-third-company", company);
    await page.click("#patentEditor .pour-add-btn");
  }

  await test("타사 특허를 별도 탭에서 4개 이상 직접 입력", async () => {
    await addThird("10-2091977", "균열보수 공법", "타사명");
    await addThird("제10-2474761호", "방수 공법", "다른회사");
    await addThird("1234567", "도장 공법", "세번째회사");
    await addThird("7654321", "보수 공법", "네번째회사");
    const rows = await page.$$eval("#patentEditor .pour-item-row", els => els.map(e => e.textContent));
    assert.strictEqual(rows.length, 4, rows.join(" | "));
    assert.ok(rows[0].includes("제10-2091977호"), rows[0]);
    assert.ok(rows[0].includes("타사명"), rows[0]);
    assert.strictEqual((await page.textContent(THIRD_TAB)).trim(), "타사 특허 (4)");
  });

  await test("같은 번호를 다시 추가하면 차단하고 경고", async () => {
    await addThird("2091977");
    assert.strictEqual(await page.$$eval("#patentEditor .pour-item-row", els => els.length), 4);
    const warn = await page.textContent("#patentEditor .pour-notice");
    assert.ok(warn.includes("이미 추가된"), warn);
  });

  await test("POUR와 타사에 같은 번호가 있으면 경고", async () => {
    await addThird("1935719");
    const warn = await page.textContent("#patentEditor .pour-notice");
    assert.ok(warn.includes("특허 구분을 확인해 주세요"), warn);
    // 정리
    await page.click("#patentEditor .pour-item-row:last-child .pour-item-del");
  });

  await test("순서 변경과 삭제", async () => {
    const before = await page.$eval("#patentEditor .pour-item-row:first-child", el => el.dataset.number);
    await page.click("#patentEditor .pour-item-row:nth-child(2) .pour-item-btn");   // ▲ 위로
    const after = await page.$eval("#patentEditor .pour-item-row:first-child", el => el.dataset.number);
    assert.notStrictEqual(before, after, "순서가 바뀌지 않음");
    const count = await page.$$eval("#patentEditor .pour-item-row", els => els.length);
    await page.click("#patentEditor .pour-item-row:last-child .pour-item-del");
    assert.strictEqual(await page.$$eval("#patentEditor .pour-item-row", els => els.length), count - 1);
  });

  await test("다특허 배지가 개수와 색상으로 표시", async () => {
    const badge = await page.$eval("#patentEditor .pour-multi-badge", el => ({
      text: el.textContent, kind: el.dataset.badge, bg: getComputedStyle(el).backgroundColor
    }));
    assert.ok(badge.text.includes("다특허 · 총 6개"), badge.text);
    assert.ok(badge.text.includes("POUR 3개 · 타사 3개"), badge.text);
    assert.strictEqual(badge.kind, "mixed", "POUR·타사 혼합은 보라색이어야 함");
  });

  await test("공고문 다특허 체크 + 번호 부족 시 확인 필요 표시", async () => {
    await page.click("#resetFormBtn");
    await page.evaluate(() => { document.getElementById("moreDetails").open = true; });
    await page.check("#noticeMultiFlag");
    const badge = await page.$eval("#patentEditor .pour-multi-badge", el => ({
      text: el.textContent, kind: el.dataset.badge
    }));
    assert.ok(badge.text.includes("다특허 번호 확인 필요"), badge.text);
    assert.strictEqual(badge.kind, "unknown", "번호 미확인은 주황색이어야 함");
  });

  await test("POUR 1개 + 타사 1개면 다특허로 자동 표시", async () => {
    await page.click("#resetFormBtn");
    await page.evaluate(() => { document.getElementById("moreDetails").open = true; });
    await page.fill(POUR_SEARCH, "1935719");
    await page.waitForSelector("#patentEditor .pour-suggest.is-open");
    await page.press(POUR_SEARCH, "Enter");
    await addThird("2091977", "균열보수 공법", "타사명");
    const badge = await page.textContent("#patentEditor .pour-multi-badge");
    assert.ok(badge.includes("다특허 · 총 2개"), badge);
    assert.ok(badge.includes("POUR 1개 · 타사 1개"), badge);
  });

  await test("혼합 현장을 저장하면 목록에서 열이 분리되어 표시", async () => {
    await page.fill("#cityInput", "하남");
    await page.dispatchEvent("#cityInput", "change");
    await page.fill("#clientInput", "혼합특허현장");
    await page.fill("#noticeDate", "2026-03-02");
    await page.click("#saveBtn");
    const heads = await page.$$eval("#allTable thead th", els => els.map(e => e.textContent.replace(/[▲▼]/g, "")));
    ["POUR 특허번호", "타사 특허번호", "타사 특허 보유 회사", "특허 구분",
     "다특허 여부", "특허 확인 상태"].forEach(t => assert.ok(heads.includes(t), t + " 열 없음"));

    const rowIndex = await page.$$eval("#allTable tbody tr td:nth-child(5)",
      (els) => els.findIndex(e => e.textContent === "혼합특허현장"));
    assert.ok(rowIndex >= 0, "저장된 현장을 찾지 못함");
    const cells = await page.$$eval(`#allTable tbody tr:nth-child(${rowIndex + 1}) td`,
      els => els.map(e => e.textContent));
    assert.strictEqual(cells[3], "제10-1935719호", "POUR 특허번호 열");
    assert.strictEqual(cells[heads.indexOf("타사 특허번호")], "제10-2091977호", "타사 특허번호 열");
    assert.strictEqual(cells[heads.indexOf("특허 구분")], "POUR·타사");
  });

  await test("한 현장은 특허가 여러 개여도 한 행", async () => {
    const matches = await page.$$eval("#allTable tbody tr td:nth-child(5)",
      els => els.filter(e => e.textContent === "혼합특허현장").length);
    assert.strictEqual(matches, 1);
  });

  /* -------------------------------------------------------------- */
  section("10. 타사 특허별 현황 · 다특허 현황");

  await test("POUR 특허별 실적 탭에 타사 특허 탭이 생기지 않음", async () => {
    const tabs = await page.$$eval(".pour-tab", els => els.map(e => e.dataset.number));
    assert.ok(!tabs.includes("2091977"), "타사 특허가 POUR 탭에 나타남");
  });

  await test("타사 특허별 현황에 타사 특허 현장 표시", async () => {
    await page.click('#viewTabs [data-view="third"]');
    assert.strictEqual(await page.isVisible("#thirdView"), true);
    assert.strictEqual(await page.isVisible("#patentTable"), false, "POUR 표가 함께 보임");
    const text = await page.textContent("#thirdView");
    assert.ok(text.includes("제10-2091977호"), text.slice(0, 200));
    assert.ok(text.includes("혼합특허현장"));
  });

  await test("타사 특허번호로 걸러보기", async () => {
    await page.selectOption("#thirdFilter", "2091977");
    const rows = await page.$$eval("#thirdView tbody tr", els => els.length);
    assert.ok(rows >= 1, "행 " + rows);
  });

  await test("다특허 현황에는 특허 2개 이상 현장만 표시", async () => {
    await page.click('#viewTabs [data-view="multi"]');
    assert.strictEqual(await page.isVisible("#multiView"), true);
    const heads = await page.$$eval("#multiView thead th", els => els.map(e => e.textContent));
    ["POUR 특허 개수", "타사 특허 개수", "전체 특허 개수", "특허 확인 상태"].forEach(t =>
      assert.ok(heads.includes(t), t + " 열 없음"));
    const totals = await page.$$eval(`#multiView tbody tr td:nth-child(${8})`,
      els => els.map(e => Number(e.textContent)));
    assert.ok(totals.length > 0, "다특허 현장이 없음");
    assert.ok(totals.every(t => t >= 2), "특허 1개 현장이 섞임: " + totals.join(","));
    await page.click('#viewTabs [data-view="pour"]');
  });

  /* -------------------------------------------------------------- */
  section("11. 공고 등록 카드 배치");

  async function columnWidths(selector) {
    return page.$$eval(selector + " > div", els => els.map(e => Math.round(e.getBoundingClientRect().width)));
  }
  async function rowTops(selector) {
    return page.$$eval(selector + " > div", els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  }

  const ROW_REGION = "#rowRegion";
  const ROW_SCHEDULE = "#rowSchedule";

  await test("재공고 체크박스가 '새 공고 등록' 제목 바로 옆에 있음", async () => {
    const box = await page.$eval(".pour-card-title", el => {
      const title = el.querySelector("span").textContent.replace(/^[①②③④⑤]\s*/, "").trim();
      const label = el.querySelector(".pour-renotice");
      const t = el.getBoundingClientRect(), l = label.getBoundingClientRect();
      return { title, sameRow: Math.abs(t.top - l.top) < l.height, text: label.textContent.trim(),
               clickHeight: Math.round(l.height) };
    });
    assert.strictEqual(box.title, "새 공고 등록");
    assert.strictEqual(box.text, "재공고 건");
    assert.ok(box.sameRow, "같은 줄에 있지 않음");
    assert.ok(box.clickHeight >= 24, "클릭 영역이 좁음: " + box.clickHeight);
  });

  await test("PC — 지역·도시·전화번호·세대수가 각각 4분의 1 너비", async () => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    const widths = await columnWidths(ROW_REGION);
    assert.strictEqual(widths.length, 4, "칸 수 " + widths.length);
    const max = Math.max(...widths), min = Math.min(...widths);
    assert.ok(max - min <= 1, "너비가 다름: " + widths.join(", "));
    const tops = await rowTops(ROW_REGION);
    assert.strictEqual(new Set(tops).size, 1, "한 줄에 있지 않음");
  });

  await test("PC — 공고일·서류 마감일·개찰일·입찰종류가 각각 4분의 1 너비", async () => {
    const widths = await columnWidths(ROW_SCHEDULE);
    assert.strictEqual(widths.length, 4);
    const max = Math.max(...widths), min = Math.min(...widths);
    assert.ok(max - min <= 1, "너비가 다름: " + widths.join(", "));
    const tops = await rowTops(ROW_SCHEDULE);
    assert.strictEqual(new Set(tops).size, 1, "한 줄에 있지 않음");
  });

  await test("입찰종류 안에 서류접수·전자입찰 버튼이 나란히", async () => {
    const buttons = await page.$$eval("#bidTypeGroup .pour-bidtype-btn",
      els => els.map(e => ({ text: e.textContent, top: Math.round(e.getBoundingClientRect().top) })));
    assert.deepStrictEqual(buttons.map(b => b.text), ["서류접수", "전자입찰"]);
    assert.strictEqual(new Set(buttons.map(b => b.top)).size, 1, "두 버튼이 다른 줄에 있음");
    await page.click('#bidTypeGroup [data-bid="전자입찰"]');
    assert.ok(await page.$eval('#bidTypeGroup [data-bid="전자입찰"]',
      el => el.classList.contains("is-active")), "선택 표시가 안 됨");
  });

  await test("첫 줄은 아파트·단지명 / 공사명 / 공종 3열", async () => {
    const widths = await columnWidths("#rowBasic");
    assert.strictEqual(widths.length, 3);
    assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, widths.join(", "));
  });

  await test("전화번호·세대수·서류 마감일·개찰일은 선택 항목", async () => {
    for (const id of ["#phoneInput", "#householdsInput", "#documentDueDate", "#bidDate"]) {
      assert.strictEqual(await page.$eval(id, el => el.required), false, id + " 가 필수로 되어 있음");
    }
    const labels = await page.$$eval(".pour-row label", els => els.map(e => e.textContent.replace(/\s+/g, " ").trim()));
    ["전화번호 (선택)", "세대수 (선택)", "서류 마감일 (선택)"].forEach(t =>
      assert.ok(labels.some(l => l.startsWith(t.split(" (")[0]) && l.includes("(선택)")), t + " 라벨 없음"));
    assert.ok(labels.some(l => l.startsWith("공고일") && l.includes("*")), "공고일 필수 표시 없음");
  });

  await test("전화번호·세대수·서류 마감일·개찰일 없이 공고 등록", async () => {
    await page.click("#resetFormBtn");
    await page.fill("#cityInput", "평택");
    await page.dispatchEvent("#cityInput", "change");
    await page.fill("#clientInput", "선택항목없는현장");
    await page.fill("#noticeDate", "2026-06-01");
    await page.click("#saveBtn");
    assert.ok((await page.textContent("#saveMsg")).includes("등록했습니다"));

    const heads = await page.$$eval("#allTable thead th", els => els.map(e => e.textContent.replace(/[▲▼]/g, "")));
    const rowIndex = await page.$$eval("#allTable tbody tr td:nth-child(5)",
      els => els.findIndex(e => e.textContent === "선택항목없는현장"));
    const cells = await page.$$eval(`#allTable tbody tr:nth-child(${rowIndex + 1}) td`,
      els => els.map(e => e.textContent));
    // 빈 값을 0이나 "—" 로 바꾸지 않는다
    assert.strictEqual(cells[heads.indexOf("발주처 전화번호")], "");
    assert.strictEqual(cells[heads.indexOf("세대수")], "");
    assert.strictEqual(cells[heads.indexOf("서류 마감일")], "");
    assert.strictEqual(cells[heads.indexOf("개찰일")], "");
  });

  await test("태블릿 — 2열", async () => {
    await page.setViewportSize({ width: 900, height: 1000 });
    const tops = await rowTops(ROW_REGION);
    assert.strictEqual(new Set(tops).size, 2, "2줄(2열)이 아님: " + tops.join(","));
  });

  await test("모바일 — 1열, 각 칸이 전체 너비", async () => {
    await page.setViewportSize({ width: 420, height: 900 });
    const tops = await rowTops(ROW_REGION);
    assert.strictEqual(new Set(tops).size, 4, "1열이 아님");
    const widths = await columnWidths(ROW_REGION);
    assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, widths.join(","));
  });

  await test("모바일에서 가로 스크롤이 생기지 않음", async () => {
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, "가로로 " + overflow + "px 넘침");
    await page.setViewportSize({ width: 1400, height: 1000 });
  });

  /* -------------------------------------------------------------- */
  section("12. 새로고침 후에도 유지");

  const before = {
    rows: await page.$$eval("#allTable tbody tr", els => els.length),
    patents: await page.$$eval("#patentListWrap tbody tr", els => els.length),
    activeTab: await page.$eval(".pour-tab.is-active", el => el.textContent)
  };

  await page.reload();

  await test("공고 자료와 특허 자료가 그대로 유지", async () => {
    const rows = await page.$$eval("#allTable tbody tr", els => els.length);
    const patents = await page.$$eval("#patentListWrap tbody tr", els => els.length);
    assert.strictEqual(rows, before.rows);
    assert.strictEqual(patents, before.patents);
  });

  await test("선택했던 특허 탭이 유지", async () => {
    const active = await page.$eval(".pour-tab.is-active", el => el.textContent);
    assert.strictEqual(active, before.activeTab);
  });

  await test("수정 내용도 유지", async () => {
    const text = await page.textContent("#allTable");
    assert.ok(text.includes("이름을 바꾼 단지"));
  });

  await page.screenshot({ path: path.join(__dirname, "..", "..", "tmp-test-output", "demo.png"), fullPage: true });

  await browser.close();
  console.log("\n" + "=".repeat(52));
  console.log(`  통과 ${passed} · 실패 ${failed}`);
  console.log("=".repeat(52));
  process.exit(failed ? 1 : 0);
})();
