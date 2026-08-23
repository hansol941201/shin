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

  /**
   * 개별 특허 한 건의 구분. 현장 전체의 구분과는 다른 것이다.
   *   POUR   — 우리 특허
   *   타사   — 다른 회사 특허
   *   미분류 — 처음 보는 번호. 업체를 아직 확인하지 못했다 (추정하지 않는다)
   */
  var PATENT_TYPES = ["POUR", "타사", "미분류"];
  var TYPE_POUR = "POUR", TYPE_THIRD = "타사", TYPE_UNKNOWN = "미분류";

  /**
   * 저장된 마스터 한 건을 오늘의 모양으로 맞춘다.
   *
   * patentType 이 없는 옛 자료는 POUR 로 본다. 이 저장소는 지금까지
   * "POUR 특허 목록" 으로만 쓰여 왔고(find() 가 곧 POUR 확인이었다),
   * 미분류로 돌리면 이미 확인된 특허가 갑자기 미확인으로 보이기 때문이다.
   * 추정이 아니라 기존 쓰임을 그대로 이어받는 것이다.
   */
  function normalizeMaster(rec) {
    var r = rec || {};
    var type = String(r.patentType || "").trim();
    if (PATENT_TYPES.indexOf(type) < 0) type = TYPE_POUR;
    return {
      number: r.number,
      name: String(r.name || "").trim(),
      categories: Array.isArray(r.categories) ? r.categories : (r.category ? [r.category] : []),
      category: String(r.category || "").trim(),
      remark: String(r.remark || "").trim(),
      prefix: String(r.prefix || "").trim(),
      active: r.active !== false,
      company: String(r.company || "").trim(),
      // 아래 넷이 이번에 더해진 칸이다
      patentType: type,
      methodName: String(r.methodName || "").trim(),
      firstSeenAt: r.firstSeenAt || r.createdAt || "",
      lastSeenAt: r.lastSeenAt || r.updatedAt || ""
    };
  }

  function today() {
    var d = new Date();
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  }

  var COLUMN_ALIASES = {
    number: ["특허번호", "POUR특허번호", "특허", "특허번호_", "등록번호", "특허등록번호"],
    name:   ["특허명", "공법명", "특허공법명", "명칭", "기술명", "특허명공법명"],
    category: ["공종", "공종분류", "분류", "적용공종"],
    prefix: ["구분", "특허구분", "약칭", "특허약칭", "표시명", "태그"],
    company: ["특허권자", "권리자", "회사명", "보유회사", "소유자", "출원인"],
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

    var records = [], seen = {}, duplicated = 0, lastCategory = "";
    for (var r = headerIndex + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var rowNo = r + 1; // 엑셀 행 번호(1부터)
      var rawNumber = row[columns.number];
      var name = String(row[columns.name] == null ? "" : row[columns.name]).trim();
      var category = String(row[columns.category] == null ? "" : row[columns.category]).trim();
      // 공종 열이 병합 셀이면 그룹의 첫 줄에만 값이 있으므로 아래로 이어받는다
      if (category) lastCategory = category; else category = lastCategory;
      var remark = columns.remark != null ? String(row[columns.remark] == null ? "" : row[columns.remark]).trim() : "";
      var prefix = columns.prefix != null ? String(row[columns.prefix] == null ? "" : row[columns.prefix]).trim() : "";
      var company = columns.company != null ? String(row[columns.company] == null ? "" : row[columns.company]).trim() : "";
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
      // 같은 특허가 여러 공종에 걸쳐 있으면 행이 나뉘어 있다. 공종을 합치고 행은 하나로 유지한다.
      if (seen[number]) {
        var exist = records[seen[number].at];
        if (category && exist.categories.indexOf(category) < 0) exist.categories.push(category);
        else duplicated++;
        exist.category = exist.categories.join(", ");
        if (!exist.name && name) exist.name = name;
        if (!exist.company && company) exist.company = company;
        continue;
      }
      seen[number] = { at: records.length };

      records.push({
        number: number, name: name,
        categories: category ? [category] : [],
        category: category,
        remark: remark, prefix: prefix, active: active, company: company
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
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeMaster);
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
        current.push(normalizeMaster(rec));
        inserted++;
      } else {
        var before = current[at];
        var changed = before.name !== rec.name || before.category !== rec.category ||
                      before.remark !== rec.remark || before.prefix !== rec.prefix ||
                      before.active !== rec.active;
        // 엑셀에 없는 칸(구분·공법명·확인일)은 업로드가 지우지 않는다
        var next = normalizeMaster(rec);
        if (!rec.patentType) next.patentType = before.patentType;
        if (!next.methodName) next.methodName = before.methodName;
        next.firstSeenAt = before.firstSeenAt || next.firstSeenAt;
        next.lastSeenAt = before.lastSeenAt || next.lastSeenAt;
        if (!next.company) next.company = before.company;
        current[at] = next;
        if (changed) updated++;
      }
    });

    writeStore(current, storage);
    return { inserted: inserted, updated: updated, total: current.length };
  }

  /**
   * 현장에서 본 특허번호를 마스터에 이어 붙인다.
   *
   *   · 이미 있으면  → 마지막 확인일만 새로 찍는다 (업체명·공법명은 건드리지 않는다)
   *   · 처음 보면    → 번호만 담고 "미분류" 로 등록한다 (업체명을 추정하지 않는다)
   *
   * 현장 쪽 자료는 이 함수가 손대지 않는다. 마스터에만 쌓인다.
   *
   * @param items  특허 항목 배열 또는 번호 배열
   * @param storage 저장소
   * @param seenAt 확인일 (기본: 오늘)
   * @returns {{registered:number, touched:number, total:number}}
   */
  /**
   * 구분이 POUR 인 것만 돌려준다.
   *
   * 마스터에는 이제 타사·미분류 특허도 함께 쌓인다. POUR 특허를 고르거나
   * POUR 특허별 실적을 볼 때 그것들이 섞여 들어오면 안 되므로, 그런 자리에서는
   * 이 함수를 쓴다. (모든 특허가 필요하면 list() 를 그대로 쓰면 된다)
   */
  function listPour(storage) {
    return readStore(storage).filter(function (r) { return r.patentType === TYPE_POUR; });
  }

  function noteSeen(items, storage, seenAt) {
    var when = seenAt || today();
    var current = readStore(storage);
    var byNumber = {};
    current.forEach(function (rec, i) { byNumber[rec.number] = i; });

    var registered = 0, touched = 0;
    (items || []).forEach(function (item) {
      if (!item) return;
      var raw = item.number != null ? item.number : item;
      var number = normalizeNumber(raw);
      if (!number) return;

      var at = byNumber[number];
      if (at == null) {
        byNumber[number] = current.length;
        current.push(normalizeMaster({
          number: number,
          // 업체명·공법명은 비워 둔다. 확인되기 전까지 지어내지 않는다.
          patentType: TYPE_UNKNOWN,
          firstSeenAt: when,
          lastSeenAt: when
        }));
        registered++;
        return;
      }
      var rec = current[at];
      if (!rec.firstSeenAt) rec.firstSeenAt = when;
      if (rec.lastSeenAt !== when) { rec.lastSeenAt = when; touched++; }
    });

    writeStore(current, storage);
    return { registered: registered, touched: touched, total: current.length };
  }

  /**
   * 특허번호 한 건의 구분을 알아낸다. 현장 전체의 구분과 혼동하지 말 것.
   *
   * 마스터에 확실한 구분(POUR·타사)이 있으면 그 값을 쓴다. 마스터가 아직
   * 미분류이거나 등재 전이면, 그 현장에서 사람이 고른 값(fallbackKind)을 쓴다.
   *
   * @param number       특허번호
   * @param storage      저장소
   * @param fallbackKind "POUR" | "THIRD_PARTY" (현장 항목의 kind)
   */
  function typeOf(number, storage, fallbackKind) {
    var n = normalizeNumber(number);
    var master = n ? find(n, storage) : null;
    if (master && master.patentType && master.patentType !== TYPE_UNKNOWN) {
      return master.patentType;
    }
    if (fallbackKind === "POUR") return TYPE_POUR;
    if (fallbackKind) return TYPE_THIRD;
    return master ? master.patentType : TYPE_UNKNOWN;
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
  var NO_RESULT_MESSAGE = "일치하는 POUR 특허가 없습니다.";
  var NEED_UPLOAD_MESSAGE = "먼저 POUR 특허 엑셀을 업로드해 주세요.";

  /** 드롭다운에 무엇을 보여줄지 정한다. 자료 자체가 없을 때와 결과가 없을 때를 구분한다. */
  function emptyMessage(storage) {
    return readStore(storage).length ? NO_RESULT_MESSAGE : NEED_UPLOAD_MESSAGE;
  }

  /**
   * 숫자와 한글 모두로 검색한다.
   *   "193"   → 193으로 시작하는 특허번호 우선
   *   "POUR"  → 특허명·공법명에 POUR 이 포함된 특허
   *   "재도장" → 공종이 재도장인 특허
   * @returns 최대 limit 개의 { number, name, category, label }
   */
  var OUR_KEYWORDS = ["POUR", "POUR공법", "우리특허", "우리 특허"];

  function search(query, limit, storage) {
    var q = String(query == null ? "" : query).trim();
    if (!q) return [];
    var max = limit || 10;
    // POUR 특허를 고르는 자리다. 자동으로 쌓인 타사·미분류는 여기 나오지 않는다.
    var records = listPour(storage);
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
      // 등록된 특허는 모두 우리(POUR) 특허이므로 "POUR"는 우리 특허 전체를 뜻하는 검색어로 본다.
      // (실제 특허 자료의 특허명은 국문 기술명이라 "POUR" 글자가 들어 있지 않다)
      if (score < 0 && OUR_KEYWORDS.indexOf(text) >= 0) score = 7;
      if (score < 0 && /[^0-9\s-]/.test(q)) {
        var name = String(rec.name || "").toUpperCase();
        var category = String(rec.category || "").toUpperCase();
        var categoryList = (rec.categories || []).map(function (c) { return String(c).toUpperCase(); });
        if (name.indexOf(text) === 0) score = 2;
        else if (category === text || categoryList.indexOf(text) >= 0) score = 3;
        else if (name.indexOf(text) > 0) score = 5;
        else if (category.indexOf(text) >= 0) score = 6;
        else if (String(rec.company || "").toUpperCase().indexOf(text) >= 0) score = 6;
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

  /** 입력칸이 비어 있을 때 보여줄 전체 목록 (최근 등록 순서대로 최대 limit개). */
  function browse(limit, storage) {
    // search() 와 같은 자리에서 쓰인다. POUR 특허만 보여 준다.
    return listPour(storage).slice(0, limit || 10).map(function (rec) {
      return {
        number: rec.number, name: rec.name, category: rec.category,
        label: [formatNumber(rec.number), rec.name, rec.category].filter(Boolean).join(" · ")
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
      if (!rec) return;
      var source = (rec.categories && rec.categories.length) ? rec.categories.join(",") : rec.category;
      if (!source) return;
      String(source).split(/[,/\n]/).forEach(function (part) {
        var c = part.trim();
        if (c && !seen[c]) { seen[c] = true; out.push(c); }
      });
    });
    return out;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    NOT_FOUND_MESSAGE: NOT_FOUND_MESSAGE,
    NO_RESULT_MESSAGE: NO_RESULT_MESSAGE,
    NEED_UPLOAD_MESSAGE: NEED_UPLOAD_MESSAGE,
    emptyMessage: emptyMessage,
    normalizeNumber: normalizeNumber,
    formatNumber: formatNumber,
    tabLabel: tabLabel,
    detectColumns: detectColumns,
    parseRows: parseRows,
    load: load,
    search: search,
    browse: browse,
    find: find,
    noteSeen: noteSeen,
    listPour: listPour,
    typeOf: typeOf,
    PATENT_TYPES: PATENT_TYPES,
    TYPE_POUR: TYPE_POUR,
    TYPE_THIRD: TYPE_THIRD,
    TYPE_UNKNOWN: TYPE_UNKNOWN,
    categoriesFor: categoriesFor,
    list: readStore,
    clear: function (storage) { writeStore([], storage); }
  };
});
