/**
 * 브라우저 동작 검증 (Playwright + Chromium)
 *   node pour-integration/test/browser.test.js
 */
const { chromium } = require("playwright");
const path = require("path");
const assert = require("assert");

const PAGE_URL = "file://" + path.join(__dirname, "..", "demo.html");

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
    assert.strictEqual((await page.textContent("#regionResolved")).trim(), "지역 경기 / 도시 하남");
  });

  await test("금산 입력 → 충남 금산", async () => {
    await page.fill("#cityInput", "금산");
    await page.dispatchEvent("#cityInput", "change");
    assert.strictEqual((await page.textContent("#regionResolved")).trim(), "지역 충남 / 도시 금산");
  });

  await test("중구 입력 시 선택 목록이 뜨고 고르면 확정", async () => {
    await page.click("#cityInput", { clickCount: 3 });
    await page.fill("#cityInput", "중구");
    await page.dispatchEvent("#cityInput", "change");
    await page.waitForSelector(".pour-suggest.is-open", { timeout: 2000 });
    const items = await page.$$eval("#cityInput ~ .pour-suggest .pour-suggest-item",
      els => els.map(e => e.textContent));
    assert.ok(items.length >= 5, "후보 " + items.length + "개");
    assert.ok(items.some(t => t.includes("부산")), items.join(" | "));
    // 부산 중구를 고른다
    const index = items.findIndex(t => t.includes("부산"));
    await page.$$eval("#cityInput ~ .pour-suggest .pour-suggest-item",
      (els, i) => els[i].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), index);
    assert.strictEqual((await page.textContent("#regionResolved")).trim(), "지역 부산 / 도시 중구");
  });

  /* -------------------------------------------------------------- */
  section("3. 특허 자동검색과 공종 자동 입력");

  await test("193 입력 시 제10-1935719호 추천", async () => {
    await page.fill("#patentSearch", "193");
    await page.waitForSelector("#patentSearch ~ .pour-suggest.is-open", { timeout: 2000 });
    const text = await page.textContent("#patentSearch ~ .pour-suggest.is-open");
    assert.ok(text.includes("제10-1935719호"), text);
  });

  await test("POUR 입력 시 특허명으로 검색", async () => {
    await page.fill("#patentSearch", "POUR");
    const items = await page.$$eval("#patentSearch ~ .pour-suggest.is-open .pour-suggest-item",
      els => els.map(e => e.textContent));
    assert.ok(items.length >= 4, "결과 " + items.length + "건");
    assert.ok(items.every(t => t.includes("POUR")), items.join(" | "));
  });

  await test("방향키와 Enter로 선택 → 칩 추가 · 공종 자동 입력", async () => {
    await page.fill("#patentSearch", "1935719");
    await page.waitForSelector("#patentSearch ~ .pour-suggest.is-open");
    await page.press("#patentSearch", "Enter");
    const chips = await page.textContent("#patentChips");
    assert.ok(chips.includes("제10-1935719호"), chips);
    assert.strictEqual(await page.inputValue("#categoryInput"), "재도장");
  });

  await test("특허를 더 고르면 공종이 중복 없이 합쳐짐", async () => {
    await page.fill("#patentSearch", "2425081");
    await page.waitForSelector("#patentSearch ~ .pour-suggest.is-open");
    await page.press("#patentSearch", "Enter");
    await page.fill("#patentSearch", "2562854");        // 공종이 다시 재도장 (중복)
    await page.waitForSelector("#patentSearch ~ .pour-suggest.is-open");
    await page.press("#patentSearch", "Enter");
    assert.strictEqual(await page.inputValue("#categoryInput"), "재도장, 슬라브");
  });

  await test("같은 특허는 중복 선택되지 않음", async () => {
    const before = await page.$$eval("#patentChips .pour-chip", els => els.length);
    await page.fill("#patentSearch", "1935719");
    await page.waitForSelector("#patentSearch ~ .pour-suggest.is-open");
    await page.press("#patentSearch", "Enter");
    const after = await page.$$eval("#patentChips .pour-chip", els => els.length);
    assert.strictEqual(after, before, "중복 추가됨");
  });

  await test("칩을 지우면 공종이 다시 계산됨", async () => {
    await page.click("#patentChips .pour-chip:nth-child(2) button");   // 슬라브 특허 제거
    assert.strictEqual(await page.inputValue("#categoryInput"), "재도장");
    await page.click("#patentChips .pour-chip:nth-child(2) button");
    await page.click("#patentChips .pour-chip:nth-child(1) button");
    assert.strictEqual(await page.inputValue("#categoryInput"), "");
  });

  await test("등록되지 않은 번호는 안내 문구 표시", async () => {
    await page.fill("#patentSearch", "9999999");
    await page.dispatchEvent("#patentSearch", "change");
    const notice = await page.textContent("#patentNotice");
    assert.ok(notice.includes("우리 특허인지 확인"), notice);
    await page.fill("#patentSearch", "");
  });

  /* -------------------------------------------------------------- */
  section("4. 공고 등록과 실적표");

  async function registerSite(city, client, patents, extra) {
    await page.click("#resetFormBtn");
    await page.fill("#cityInput", city);
    await page.dispatchEvent("#cityInput", "change");
    await page.fill("#clientInput", client);
    for (const p of patents || []) {
      await page.fill("#patentSearch", p);
      await page.waitForSelector("#patentSearch ~ .pour-suggest.is-open");
      await page.press("#patentSearch", "Enter");
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
    assert.deepStrictEqual(heads.slice(0, 20), [
      "공종", "지역", "도시", "특허번호", "발주처(아파트명)", "공사명", "전화번호", "세대수",
      "공사 품질", "시공사", "상태", "공고일", "개찰일", "낙찰일", "낙찰금액",
      "협약서 발행번호", "특허명·공법명", "공사 범위", "주소", "비고"
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
    assert.strictEqual(await page.isVisible("#missingAlert"), false);
  });

  await test("특허번호 없이 낙찰 저장 시 확인 경고 후 저장", async () => {
    await page.selectOption("#awardTarget", { label: "금산주공 / 충남 금산 / 공고" });
    await page.fill("#awardContractor", "가나건설");
    await page.fill("#awardDate", "2026-05-10");
    await page.fill("#awardAmount", "800000000");
    lastDialog = null;
    await page.click("#awardBtn");
    assert.ok(lastDialog && lastDialog.includes("미기재 상태로 낙찰 저장할까요"), String(lastDialog));
    const msg = await page.textContent("#awardMsg");
    assert.ok(msg.includes("낙찰 처리했습니다"), msg);
  });

  await test("해당 건이 상단 알림에 표시", async () => {
    assert.strictEqual(await page.isVisible("#missingAlert"), true);
    const text = await page.textContent("#missingAlert");
    assert.ok(text.includes("특허번호 미기재 1건"), text);
  });

  await test("알림 배경이 경고색(주황·노랑 계열)", async () => {
    const bg = await page.$eval("#missingAlert", el => getComputedStyle(el).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    assert.ok(r > 240 && g > 200 && b < 240 && r > b, "경고색이 아님: " + bg);
  });

  await test("알림 클릭 시 미기재 목록 표시", async () => {
    await page.click("#missingAlert");
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
    const text = await page.textContent("#missingAlert");
    assert.ok(text.includes("1건"), "알림 건수가 늘어남: " + text);
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
    await page.fill("#editPatentSearch", "8888888");
    await page.dispatchEvent("#editPatentSearch", "change");
    const notice = await page.textContent("#editPatentNotice");
    assert.ok(notice.includes("우리 특허인지 확인"), notice);
  });

  await test("검색해서 고른 특허로 저장하면 알림에서 사라짐", async () => {
    await page.fill("#editPatentSearch", "193");
    await page.waitForSelector("#editPatentSearch ~ .pour-suggest.is-open");
    await page.press("#editPatentSearch", "Enter");
    const chips = await page.textContent("#editPatentChips");
    assert.ok(chips.includes("제10-1935719호"), chips);
    await page.click("#editSave");
    assert.strictEqual(await page.isVisible("#editBack"), false);
    assert.strictEqual(await page.isVisible("#missingAlert"), false, "알림이 남아 있음");
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
      "순번", "지역", "도시", "특허번호", "발주처(아파트명)", "공사명", "전화번호", "세대수"
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

  await test("전체 목록의 수정 버튼으로 모든 항목 수정", async () => {
    const id = await page.$eval("#allTable tbody tr:first-child button[data-edit-id]", el => el.dataset.editId);
    await page.click(`#allTable button[data-edit-id="${id}"]`);
    await page.fill("#edit-client", "이름을 바꾼 단지");
    await page.fill("#edit-bidType", "제한경쟁");
    await page.fill("#edit-expectedAmount", "500000000");
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
  section("9. 새로고침 후에도 유지");

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
