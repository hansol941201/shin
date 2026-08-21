/**
 * API(D1) 저장소로 동작하는지 브라우저에서 검증한다.
 *   node pour-integration/test/api-store.test.js
 *
 * localStorage 를 운영 저장소로 쓰지 않는다는 것을 확인하는 것이 목적이다.
 * 실제 서버 대신 요청을 가로채 메모리 D1 역할을 하는 가짜 서버를 쓴다.
 */
const { chromium } = require("playwright");
const path = require("path");
const assert = require("assert");
const EXCEL_ROWS = require("./fixtures-patent-excel.json");

const PAGE_URL = "file://" + path.join(__dirname, "..", "app.html");

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log("  ✓ " + name); passed++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); failed++; }
}
function section(t) { console.log("\n" + t); }

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", e => consoleErrors.push("PAGEERROR: " + e.message));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push("CONSOLE: " + m.text()); });
  page.on("dialog", d => d.accept());

  // 서버(D1) 역할을 하는 저장소
  const server = { records: [], patents: [] };
  const calls = [];

  await page.route("**/api/*", async route => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split("/").pop();
    calls.push(request.method() + " " + name);
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(server[name] || [])
      });
    }
    if (request.method() === "PUT") {
      server[name] = JSON.parse(request.postData() || "[]");
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({ status: 405, body: "" });
  });

  await page.addInitScript(() => { window.POUR_API_BASE = "/api"; });
  await page.goto(PAGE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.PourApp && window.PourApp.usingApi === true);

  /* -------------------------------------------------------------- */
  section("1. 서버에서 읽어오기");

  await test("화면을 열면 서버에서 자료를 읽어온다", async () => {
    assert.ok(calls.includes("GET records"), calls.join(" / "));
    assert.ok(calls.includes("GET patents"), calls.join(" / "));
    assert.strictEqual(await page.evaluate(() => window.PourApp.usingApi), true);
  });

  await test("특허 자료를 올리면 서버에 저장된다", async () => {
    await page.evaluate(rows => {
      window.PourPatents.load(rows, window.PourApp.storage);
      window.PourApp.refresh();
    }, EXCEL_ROWS);
    await page.evaluate(() => window.PourApp.storage.flush());
    assert.strictEqual(server.patents.length, 50, "서버 특허 " + server.patents.length + "건");
  });

  /* -------------------------------------------------------------- */
  section("2. 화면에서 등록한 자료가 서버로 저장");

  await test("새 공고를 등록하면 서버에 PUT 된다", async () => {
    await page.click("#btnNewNotice");
    await page.waitForSelector("#noticePanel.is-open");
    await page.fill("#fCity", "하남");
    await page.dispatchEvent("#fCity", "change");
    await page.fill("#fClient", "API 저장 확인 단지");
    await page.fill("#fNoticeDate", "2026-03-02");
    await page.fill("#fPhone", "031-000-1111");
    await page.fill("#patentEditor .pour-kind-search", "1935719");
    await page.waitForSelector("#patentEditor .pour-suggest.is-open");
    await page.press("#patentEditor .pour-kind-search", "Enter");
    await page.click("#panelSave");
    await page.evaluate(() => window.PourApp.storage.flush());

    assert.ok(calls.includes("PUT records"), calls.join(" / "));
    assert.strictEqual(server.records.length, 1, "서버 공고 " + server.records.length + "건");
    assert.strictEqual(server.records[0].client, "API 저장 확인 단지");
    assert.deepStrictEqual(server.records[0].patentNumbers, ["1935719"]);
  });

  await test("운영 자료가 localStorage 에 저장되지 않는다", async () => {
    const local = await page.evaluate(() => ({
      records: localStorage.getItem("pour.records.v1"),
      patents: localStorage.getItem("pour.patents.v1"),
      keys: Object.keys(localStorage)
    }));
    assert.strictEqual(local.records, null, "공고 자료가 localStorage 에 있음");
    assert.strictEqual(local.patents, null, "특허 자료가 localStorage 에 있음");
    // 화면 상태(선택한 특허 탭 등)는 남을 수 있다
    local.keys.forEach(k => assert.ok(!k.startsWith("pour.records") && !k.startsWith("pour.patents"), k));
  });

  /* -------------------------------------------------------------- */
  section("3. 새로고침 후 유지");

  await test("새로고침해도 서버 자료로 다시 그려진다", async () => {
    await page.reload();
    await page.waitForFunction(() => window.PourApp && window.PourApp.usingApi === true);
    await page.waitForSelector("#recordsGrid .grid tbody tr");
    const rows = await page.$$eval("#recordsGrid .grid tbody tr", els => els.length);
    assert.strictEqual(rows, 1);
    const heads = await page.$$eval("#recordsGrid .grid thead th",
      els => els.map(e => e.textContent.replace(/[▲▼▣]/g, "").trim()));
    const cells = await page.$$eval("#recordsGrid .grid tbody tr:first-child td",
      els => els.map(e => e.textContent));
    assert.strictEqual(cells[heads.indexOf("발주처(아파트명)")], "API 저장 확인 단지");
    assert.strictEqual(cells[heads.indexOf("POUR 특허번호")], "제10-1935719호");
    assert.strictEqual(cells[heads.indexOf("전화번호")], "031-000-1111");
  });

  await test("특허 자료도 서버에서 다시 읽어온다", async () => {
    await page.click(".nav-item[data-view='settings']");
    const rows = await page.$$eval("#patentListGrid tbody tr", els => els.length);
    assert.strictEqual(rows, 50);
    await page.click(".nav-item[data-view='records']");
  });

  /* -------------------------------------------------------------- */
  section("4. 낙찰 저장과 특허번호 지우기");

  await test("낙찰로 바꾸면 같은 행이 서버에서 갱신된다", async () => {
    await page.click("#recordsGrid .grid tbody tr:first-child");
    await page.click("#btnToAward");
    await page.waitForSelector("#awardPanel.is-open");
    await page.fill("#aw-contractor", "코지건설㈜");
    await page.fill("#aw-contractorPhone", "0316473158");
    await page.dispatchEvent("#aw-contractorPhone", "blur");
    await page.fill("#aw-awardDate", "2026-05-10");
    await page.fill("#aw-awardAmount", "1250000000");
    await page.fill("#aw-categories", "균열보수");
    await page.click("#awardSave");
    await page.evaluate(() => window.PourApp.storage.flush());

    assert.strictEqual(server.records.length, 1, "새 행이 생김: " + server.records.length);
    assert.strictEqual(server.records[0].status, "낙찰");
    assert.strictEqual(server.records[0].contractor, "코지건설㈜");
    assert.strictEqual(server.records[0].contractorPhone, "031-647-3158", "하이픈 자동 적용");
    assert.strictEqual(server.records[0].phone, "031-000-1111", "발주처 전화번호가 덮어써짐");
  });

  await test("낙찰 중 특허를 지우면 빈 값으로 저장되고 미기재 알림에 뜬다", async () => {
    await page.click("#recordsGrid .grid tbody tr:first-child");
    await page.click("#btnDetail");
    await page.waitForSelector("#noticePanel.is-open");
    await page.click("#patentEditor .pour-item-row:first-child .pour-item-del");
    await page.click("#panelSave");
    await page.evaluate(() => window.PourApp.storage.flush());

    assert.deepStrictEqual(server.records[0].patentNumbers, [], "이전 번호가 남음");
    await page.waitForSelector("#alert-missingPour");
    const alertText = await page.textContent("#alert-missingPour");
    assert.ok(alertText.includes("POUR 특허번호 미기재 낙찰 1건"), alertText);
  });

  await test("새로고침해도 미기재 알림이 그대로", async () => {
    await page.reload();
    await page.waitForFunction(() => window.PourApp && window.PourApp.usingApi === true);
    await page.waitForSelector("#alert-missingPour");
    const alertText = await page.textContent("#alert-missingPour");
    assert.ok(alertText.includes("미기재 낙찰 1건"), alertText);
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
