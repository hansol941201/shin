/**
 * 실적 내려받기 (CSV · 엑셀)
 *
 * 화면 표와 내려받는 파일이 반드시 같은 열 순서를 쓰도록 pour-records.js 의
 * 열 정의를 그대로 사용한다.
 *
 * 엑셀(.xlsx)은 ExcelJS 가 있을 때만 만든다. 없으면 CSV 로 안내한다.
 *   브라우저: <script src=".../exceljs.min.js"></script> 로 window.ExcelJS 준비
 *   Node    : require("exceljs")
 */
(function (root, factory) {
  var isNode = typeof require === "function" && typeof module === "object";
  var records = isNode ? require("./pour-records.js") : root.PourRecords;
  var patents = isNode ? require("./pour-patents.js") : root.PourPatents;
  var api = factory(records, patents, isNode);
  if (isNode) module.exports = api;
  else root.PourExport = api;
})(typeof self !== "undefined" ? self : this, function (PourRecords, PourPatents, isNode) {
  "use strict";

  function getExcelJS() {
    if (!isNode && typeof self !== "undefined" && self.ExcelJS) return self.ExcelJS;
    if (isNode) { try { return require("exceljs"); } catch (e) { return null; } }
    return null;
  }

  /* ------------------------------------------------------------- CSV */

  function csvCell(value) {
    var s = value == null ? "" : String(value);
    // 줄바꿈·쉼표·따옴표가 들어간 셀은 따옴표로 감싼다 (여러 줄 공사명 유지)
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /** 화면 표와 동일한 열 순서의 CSV 문자열. 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다. */
  function toCsv(records, columns) {
    var cols = columns || PourRecords.COLUMNS;
    var lines = [cols.map(function (c) { return csvCell(c.title); }).join(",")];
    (records || []).forEach(function (rec, i) {
      lines.push(cols.map(function (c) {
        return csvCell(PourRecords.displayValue(rec, c, i));
      }).join(","));
    });
    return "﻿" + lines.join("\r\n");
  }

  /* ------------------------------------------------- 워크시트 이름 */

  // 엑셀 시트 이름 제한: 31자, : \ / ? * [ ] 금지, 중복 불가
  function sheetName(label, used) {
    var name = String(label || "시트").replace(/[:\\/?*[\]]/g, "-").trim().slice(0, 31) || "시트";
    if (!used) return name;
    var base = name, n = 2;
    while (used[name]) {
      var suffix = "(" + n + ")";
      name = base.slice(0, 31 - suffix.length) + suffix;
      n++;
    }
    used[name] = true;
    return name;
  }

  /* ----------------------------------------------------------- 엑셀 */

  function styleSheet(sheet, cols) {
    sheet.columns = cols.map(function (c) {
      return { header: c.title, key: c.key, width: c.width || 14 };
    });

    var header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    header.height = 22;

    sheet.views = [{ state: "frozen", ySplit: 1 }];               // 첫 행 고정
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  }

  function writeRows(sheet, cols, records) {
    (records || []).forEach(function (rec, i) {
      var values = {};
      cols.forEach(function (c) { values[c.key] = PourRecords.exportValue(rec, c, i); });
      var row = sheet.addRow(values);

      cols.forEach(function (c, ci) {
        var cell = row.getCell(ci + 1);
        cell.alignment = {
          vertical: "middle",
          wrapText: true,                                          // 여러 줄 공사명 줄바꿈 유지
          horizontal: c.type === "number" || c.type === "money" || c.type === "seq" ? "right" : "left"
        };
        if (c.type === "number" || c.type === "money") cell.numFmt = "#,##0";
        if (c.type === "phone") cell.numFmt = "@";                 // 전화번호 앞자리 0 유지
      });
    });

    // 모든 셀에 경계선
    sheet.eachRow(function (row) {
      row.eachCell(function (cell) {
        cell.border = {
          top: { style: "thin", color: { argb: "FFBFBFBF" } },
          left: { style: "thin", color: { argb: "FFBFBFBF" } },
          bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
          right: { style: "thin", color: { argb: "FFBFBFBF" } }
        };
      });
    });
  }

  /** 전체 실적 한 장짜리 엑셀. */
  function buildWorkbook(records, columns) {
    var ExcelJS = getExcelJS();
    if (!ExcelJS) return null;
    var cols = columns || PourRecords.COLUMNS;
    var wb = new ExcelJS.Workbook();
    var sheet = wb.addWorksheet("전체 실적");
    styleSheet(sheet, cols);
    writeRows(sheet, cols, records);
    return wb;
  }

  /**
   * 특허별 실적 엑셀. 특허번호마다 워크시트를 따로 만들고,
   * 각 시트에는 그 특허가 적용된 현장만 담는다.
   */
  function buildPatentWorkbook(tabs, allRecords, columns) {
    var ExcelJS = getExcelJS();
    if (!ExcelJS) return null;
    var cols = columns || PourRecords.PATENT_TAB_COLUMNS;
    var wb = new ExcelJS.Workbook();
    var used = {};

    (tabs || []).forEach(function (tab) {
      var rows = PourRecords.recordsForPatent(tab.number, allRecords);
      var sheet = wb.addWorksheet(sheetName(tab.label, used));
      styleSheet(sheet, cols);
      writeRows(sheet, cols, rows);
    });

    if (!wb.worksheets.length) wb.addWorksheet("특허 없음");
    return wb;
  }

  /* --------------------------------------------------------- 내려받기 */

  function download(blob, filename) {
    if (isNode || typeof document === "undefined") return;
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadCsv(records, filename, columns) {
    var blob = new Blob([toCsv(records, columns)], { type: "text/csv;charset=utf-8;" });
    download(blob, filename || "공사실적.csv");
  }

  function downloadWorkbook(workbook, filename) {
    if (!workbook) return Promise.resolve(false);
    return workbook.xlsx.writeBuffer().then(function (buffer) {
      download(new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }), filename || "공사실적.xlsx");
      return true;
    });
  }

  return {
    toCsv: toCsv,
    sheetName: sheetName,
    buildWorkbook: buildWorkbook,
    buildPatentWorkbook: buildPatentWorkbook,
    downloadCsv: downloadCsv,
    downloadWorkbook: downloadWorkbook,
    hasExcelSupport: function () { return !!getExcelJS(); }
  };
});
