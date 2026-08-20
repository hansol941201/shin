/**
 * POUR 특허 자료 (엑셀 업로드 · 정규화 · 검색)
 *
 * 특허번호는 숫자만 남겨 저장하고, 화면에는 "제10-1935719호" 형식으로 보여준다.
 * 특허번호와 공종의 연결 관계는 오직 업로드한 엑셀에서만 온다 (하드코딩 금지).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PourPatents = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STORAGE_KEY = "pour.patents.v1";

  /* ---------------------------------------------------------- 번호 정규화 */

  /**
   * "특허 제10-1935719호", "10-1935719", "1935719" → 모두 "1935719"
   * 등록번호 앞의 권리구분 코드(10 특허 / 20 실용신안)는 떼어낸다.
   */
  function normalizeNumber(raw) {
    var digits = String(raw == null ? "" : raw).replace(/[^0-9]/g, "");
    if (!digits) return "";
    // 10-1935719(9자리) 또는 20-0123456 형태에서 앞 2자리 권리구분 코드 제거
    if (digits.length === 9 && (digits.indexOf("10") === 0 || digits.indexOf("20") === 0)) {
      return digits.slice(2);
    }
    // 출원번호 10-2017-0012345(13자리)도 동일하게 권리구분 코드만 제거
    if (digits.length === 13 && (digits.indexOf("10") === 0 || digits.indexOf("20") === 0)) {
      return digits.slice(2);
    }
    return digits;
  }

  /** 실적표·엑셀 표시용 형식. "1935719" → "제10-1935719호" */
  function formatNumber(number) {
    var n = normalizeNumber(number);
    return n ? "제10-" + n + "호" : "";
  }

  /** 특허별 실적 탭에 표시할 이름. "(DO)특허 제10-2699417호" / "특허 제10-2562854호" */
  function tabLabel(record) {
    var rec = typeof record === "object" && record ? record : { number: record };
    var base = "특허 " + formatNumber(rec.number);
    return rec.prefix ? "(" + rec.prefix + ")" + base : base;
  }

  // "N", "아니오", "미사용", "false", "0" 등을 비활성으로 본다.
  function parseActive(value) {
    var v = String(value == null ? "" : value).trim().toUpperCase();
    if (!v) return true;
    return ["N", "NO", "FALSE", "0", "아니오", "미사용", "비활성", "숨김", "X"].indexOf(v) < 0;
  }

  /** 앞자리 0을 뗀 비교용 키. "0123456" 과 "123456" 을 같이 찾기 위한 보조 색인. */
  function loose(number) {
    return String(number || "").replace(/^0+/, "");
  }

  /* ------------------------------------------------------- 엑셀 열 인식 */

  var COLUMN_ALIASES = {
    number: ["특허번호", "POUR특허번호", "특허", "특허번호_", "등록번호", "특허등록번호"],
    name:   ["특허명", "공법명", "특허공법명", "명칭", "기술명", "특허명공법명"],
    category: ["공종", "공종분류", "분류", "적용공종"],
    prefix: ["구분", "특허구분", "약칭", "특허약칭", "표시명", "태그"],
    active: ["사용여부", "활성", "사용", "표시여부"],
    remark: ["비고", "메모", "참고"]
  };

  var COLUMN_LABELS = {
    number: "특허번호 (또는 POUR 특허번호, 특허, 특허 번호)",
    name: "특허명 (또는 공법명, 특허·공법명, 명칭, 기술명)",
    category: "공종 (또는 공종 분류, 분류, 적용 공종)"
  };

  // 열 이름 비교용 정규화: 공백, 가운뎃점, 마침표, 괄호 등을 무시한다.
  function normalizeHeader(text) {
    return String(text == null ? "" : text)
      .replace(/[\s·.,_\-()[\]{}/]/g, "")
      .toUpperCase();
  }

  function detectColumns(headerRow) {
    var found = {};
    var normalized = (headerRow || []).map(normalizeHeader);
    Object.keys(COLUMN_ALIASES).forEach(function (field) {
      var aliases = COLUMN_ALIASES[field].map(normalizeHeader);
      for (var i = 0; i < normalized.length; i++) {
        if (!normalized[i]) continue;
        if (aliases.indexOf(normalized[i]) >= 0) { found[field] = i; return; }
      }
      // 완전 일치가 없으면 포함 관계로 한 번 더 (예: "POUR 특허번호 (등록)")
      for (var j = 0; j < normalized.length; j++) {
        if (!normalized[j]) continue;
        for (var k = 0; k < aliases.length; k++) {
          if (normalized[j].indexOf(aliases[k]) >= 0) { found[field] = j; return; }
        }
      }
    });
    return found;
  }

  /**
   * 엑셀/CSV 를 읽어 특허 목록으로 바꾼다.
   * @param rows 첫 줄이 열 제목인 2차원 배열
   * @returns {{ok:boolean, message?:string, records?:Array, errors:Array}}
   */
  function parseRows(rows) {
    var errors = [];
    if (!rows || !rows.length) {
      return { ok: false, message: "엑셀에서 읽을 내용이 없습니다. 파일을 다시 확인해 주세요.", errors: errors };
    }

    // 제목 줄이 첫 줄이 아닐 수 있으므로 앞쪽 몇 줄에서 찾는다.
    var headerIndex = -1, columns = null;
    for (var i = 0; i < Math.min(rows.length, 10); i++) {
      var found = detectColumns(rows[i]);
      if (found.number != null && found.category != null) { headerIndex = i; columns = found; break; }
    }

    if (!columns) {
      return {
        ok: false,
        errors: errors,
        message: "엑셀에서 필요한 열을 찾지 못했습니다. 다음 열이 있어야 합니다.\n" +
                 "· " + COLUMN_LABELS.number + "\n" +
                 "· " + COLUMN_LABELS.name + "\n" +
                 "· " + COLUMN_LABELS.category
      };
    }

    var missing = [];
    if (columns.name == null) missing.push(COLUMN_LABELS.name);
    if (missing.length) {
      return {
        ok: false,
        errors: errors,
        message: "엑셀에서 다음 열을 찾지 못했습니다.\n· " + missing.join("\n· ")
      };
    }

    var records = [], seen = {}, duplicated = 0;
    for (var r = headerIndex + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var rowNo = r + 1; // 엑셀 행 번호(1부터)
      var rawNumber = row[columns.number];
      var name = String(row[columns.name] == null ? "" : row[columns.name]).trim();
      var category = String(row[columns.category] == null ? "" : row[columns.category]).trim();
      var remark = columns.remark != null ? String(row[columns.remark] == null ? "" : row[columns.remark]).trim() : "";
      var prefix = columns.prefix != null ? String(row[columns.prefix] == null ? "" : row[columns.prefix]).trim() : "";
      var active = columns.active != null ? parseActive(row[columns.active]) : true;

      var isBlank = !String(rawNumber == null ? "" : rawNumber).trim() && !name && !category;
      if (isBlank) continue; // 빈 줄은 조용히 건너뛴다

      var number = normalizeNumber(rawNumber);
      if (!number) {
        errors.push({ row: rowNo, reason: "특허번호에서 숫자를 찾지 못했습니다: \"" + String(rawNumber == null ? "" : rawNumber) + "\"" });
        continue;
      }
      if (!category) {
        errors.push({ row: rowNo, reason: "공종이 비어 있습니다 (특허번호 " + formatNumber(number) + ")" });
        continue;
      }
      if (seen[number]) { duplicated++; continue; } // 같은 파일 안의 중복
      seen[number] = true;

      records.push({
        number: number, name: name, category: category,
        remark: remark, prefix: prefix, active: active
      });
    }

    return { ok: true, records: records, errors: errors, duplicated: duplicated };
  }

  /* ----------------------------------------------------------- 저장소 */

  function readStore(storage) {
    var s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return [];
    try {
      var raw = s.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeStore(records, storage) {
    var s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return;
    try { s.setItem(STORAGE_KEY, JSON.stringify(records)); } catch (e) {}
  }

  /**
   * 업로드 결과를 저장소에 반영한다. 같은 특허번호는 새로 만들지 않고 갱신한다.
   * @returns {{inserted:number, updated:number, duplicated:number, errors:Array, total:number}}
   */
  function upsert(records, storage) {
    var current = readStore(storage);
    var byNumber = {};
    current.forEach(function (rec, i) { byNumber[rec.number] = i; });

    var inserted = 0, updated = 0;
    records.forEach(function (rec) {
      var at = byNumber[rec.number];
      if (at == null) {
        byNumber[rec.number] = current.length;
        current.push(rec);
        inserted++;
      } else {
        var before = current[at];
        var changed = before.name !== rec.name || before.category !== rec.category ||
                      before.remark !== rec.remark || before.prefix !== rec.prefix ||
                      before.active !== rec.active;
        current[at] = rec;
        if (changed) updated++;
      }
    });

    writeStore(current, storage);
    return { inserted: inserted, updated: updated, total: current.length };
  }

  /** 엑셀 한 건을 통째로 처리한다 (파싱 + 저장). */
  function load(rows, storage) {
    var parsed = parseRows(rows);
    if (!parsed.ok) return { ok: false, message: parsed.message, errors: parsed.errors || [] };
    var stats = upsert(parsed.records, storage);
    return {
      ok: true,
      inserted: stats.inserted,
      updated: stats.updated,
      duplicated: parsed.duplicated,
      errors: parsed.errors,
      total: stats.total
    };
  }

  /* ------------------------------------------------------------- 검색 */

  var NOT_FOUND_MESSAGE = "업로드된 POUR 특허 자료에서 일치 항목을 찾지 못했습니다. 우리 특허인지 확인해 주세요.";

  /**
   * 숫자와 한글 모두로 검색한다.
   *   "193"   → 193으로 시작하는 특허번호 우선
   *   "POUR"  → 특허명·공법명에 POUR 이 포함된 특허
   *   "재도장" → 공종이 재도장인 특허
   * @returns 최대 limit 개의 { number, name, category, label }
   */
  function search(query, limit, storage) {
    var q = String(query == null ? "" : query).trim();
    if (!q) return [];
    var max = limit || 10;
    var records = readStore(storage);
    var digits = q.replace(/[^0-9]/g, "");
    var text = q.toUpperCase();
    var scored = [];

    records.forEach(function (rec) {
      var score = -1;
      var num = rec.number, lnum = loose(num);

      if (digits) {
        var ldigits = loose(digits);
        if (num === digits || lnum === ldigits) score = 0;
        else if (num.indexOf(digits) === 0 || lnum.indexOf(ldigits) === 0) score = 1;   // 시작 일치 우선
        else if (num.indexOf(digits) > 0) score = 4;                                    // 그다음 포함
      }
      if (score < 0 && /[^0-9\s-]/.test(q)) {
        var name = String(rec.name || "").toUpperCase();
        var category = String(rec.category || "").toUpperCase();
        if (name.indexOf(text) === 0) score = 2;
        else if (category === text) score = 3;
        else if (name.indexOf(text) > 0) score = 5;
        else if (category.indexOf(text) >= 0) score = 6;
      }
      if (score >= 0) scored.push({ rec: rec, score: score });
    });

    scored.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return a.rec.number.localeCompare(b.rec.number, "ko");
    });

    return scored.slice(0, max).map(function (s) {
      return {
        number: s.rec.number,
        name: s.rec.name,
        category: s.rec.category,
        label: [formatNumber(s.rec.number), s.rec.name, s.rec.category].filter(Boolean).join(" · ")
      };
    });
  }

  /** 저장된 특허인지 확인한다. 직접 끝까지 입력한 번호도 검증한다. */
  function find(number, storage) {
    var n = normalizeNumber(number);
    if (!n) return null;
    var records = readStore(storage);
    for (var i = 0; i < records.length; i++) {
      if (records[i].number === n || loose(records[i].number) === loose(n)) return records[i];
    }
    return null;
  }

  /** 선택된 특허번호들에서 공종을 중복 없이 뽑는다. */
  function categoriesFor(numbers, storage) {
    var out = [], seen = {};
    (numbers || []).forEach(function (n) {
      var rec = find(n, storage);
      if (!rec || !rec.category) return;
      rec.category.split(/[,/\n]/).forEach(function (part) {
        var c = part.trim();
        if (c && !seen[c]) { seen[c] = true; out.push(c); }
      });
    });
    return out;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    NOT_FOUND_MESSAGE: NOT_FOUND_MESSAGE,
    normalizeNumber: normalizeNumber,
    formatNumber: formatNumber,
    tabLabel: tabLabel,
    detectColumns: detectColumns,
    parseRows: parseRows,
    load: load,
    search: search,
    find: find,
    categoriesFor: categoriesFor,
    list: readStore,
    clear: function (storage) { writeStore([], storage); }
  };
});
