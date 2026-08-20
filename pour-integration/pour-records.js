/**
 * 공사실적 자료 모델 · 실적표 열 정의 · 특허별 집계
 *
 * 한 현장은 반드시 하나의 행으로 유지한다. 공고로 등록한 뒤 낙찰로 바뀌어도
 * 새 행을 만들지 않고 같은 행(id)을 갱신한다.
 */
(function (root, factory) {
  var patents = typeof require === "function" && typeof module === "object"
    ? require("./pour-patents.js")
    : root.PourPatents;
  var api = factory(patents);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PourRecords = api;
})(typeof self !== "undefined" ? self : this, function (PourPatents) {
  "use strict";

  var STORAGE_KEY = "pour.records.v1";

  var STATUSES = ["공고", "낙찰", "유찰", "공고취소", "재공고", "타공법 낙찰"];
  var QUALITY_OPTIONS = ["우수", "양호", "보통", "확인 필요"];

  /* --------------------------------------------------------- 열 정의 */

  // 화면 실적표와 내려받는 엑셀·CSV가 같은 순서를 쓰도록 한곳에서 정의한다.
  var COLUMNS = [
    { key: "categories",     title: "공종",              type: "list",   width: 14 },
    { key: "region",         title: "지역",              type: "text",   width: 8 },
    { key: "city",           title: "도시",              type: "text",   width: 10 },
    { key: "patentNumbers",  title: "특허번호",          type: "patent", width: 18 },
    { key: "client",         title: "발주처(아파트명)",  type: "text",   width: 24 },
    { key: "projectNames",   title: "공사명",            type: "list",   width: 34 },
    { key: "phone",          title: "전화번호",          type: "phone",  width: 15 },
    { key: "households",     title: "세대수",            type: "number", width: 9 },
    { key: "quality",        title: "공사 품질",         type: "text",   width: 10 },
    { key: "contractor",     title: "시공사",            type: "text",   width: 16 },
    { key: "status",         title: "상태",              type: "text",   width: 11 },
    { key: "noticeDate",     title: "공고일",            type: "date",   width: 12 },
    { key: "bidDate",        title: "개찰일",            type: "date",   width: 12 },
    { key: "awardDate",      title: "낙찰일",            type: "date",   width: 12 },
    { key: "awardAmount",    title: "낙찰금액",          type: "money",  width: 14 },
    { key: "agreementNo",    title: "협약서 발행번호",   type: "text",   width: 16 },
    { key: "patentNames",    title: "특허명·공법명",     type: "list",   width: 22 },
    { key: "scope",          title: "공사 범위",         type: "text",   width: 20 },
    { key: "address",        title: "주소",              type: "text",   width: 28 },
    { key: "remark",         title: "비고",              type: "text",   width: 18 }
  ];

  // 특허별 실적 탭의 표. 순번이 맨 앞에 오고 핵심 열을 먼저 보여준다.
  var PATENT_TAB_COLUMNS = [
    { key: "__seq",         title: "순번",             type: "seq",    width: 6 },
    { key: "region",        title: "지역",             type: "text",   width: 8 },
    { key: "city",          title: "도시",             type: "text",   width: 10 },
    { key: "patentNumbers", title: "특허번호",         type: "patent", width: 18 },
    { key: "client",        title: "발주처(아파트명)", type: "text",   width: 24 },
    { key: "projectNames",  title: "공사명",           type: "list",   width: 34 },
    { key: "phone",         title: "전화번호",         type: "phone",  width: 15 },
    { key: "households",    title: "세대수",           type: "number", width: 9 },
    { key: "categories",    title: "공종",             type: "list",   width: 14 },
    { key: "status",        title: "상태",             type: "text",   width: 11 },
    { key: "noticeDate",    title: "공고일",           type: "date",   width: 12 },
    { key: "bidDate",       title: "개찰일",           type: "date",   width: 12 },
    { key: "awardDate",     title: "낙찰일",           type: "date",   width: 12 },
    { key: "contractor",    title: "시공사",           type: "text",   width: 16 },
    { key: "awardAmount",   title: "낙찰금액",         type: "money",  width: 14 },
    { key: "quality",       title: "공사 품질",        type: "text",   width: 10 },
    { key: "remark",        title: "비고",             type: "text",   width: 18 }
  ];

  /* --------------------------------------------------------- 값 변환 */

  function toList(value) {
    if (value == null || value === "") return [];
    if (Array.isArray(value)) {
      return value.map(function (v) { return String(v).trim(); }).filter(Boolean);
    }
    return String(value).split(/\r?\n|,/).map(function (v) { return v.trim(); }).filter(Boolean);
  }

  function toNumber(value) {
    if (value == null || value === "") return "";
    var n = Number(String(value).replace(/[^0-9.-]/g, ""));
    return isFinite(n) ? n : "";
  }

  function normalize(input) {
    var r = input || {};
    return {
      id: r.id || createId(),
      categories: toList(r.categories),
      region: String(r.region || "").trim(),
      city: String(r.city || "").trim(),
      patentNumbers: toList(r.patentNumbers).map(PourPatents.normalizeNumber).filter(Boolean),
      patentNames: toList(r.patentNames),
      noticePatentText: String(r.noticePatentText || "").trim(),
      agreementNoOnly: String(r.agreementNoOnly || "").trim(),
      bidType: String(r.bidType || "").trim(),
      expectedAmount: toNumber(r.expectedAmount),
      patentConfirmed: r.patentConfirmed === true,
      createdAt: r.createdAt || nowStamp(),
      history: Array.isArray(r.history) ? r.history.slice() : [],
      client: String(r.client || "").trim(),
      projectNames: toList(r.projectNames),
      phone: String(r.phone == null ? "" : r.phone).trim(),   // 앞자리 0이 사라지지 않도록 문자열 유지
      households: toNumber(r.households),
      quality: String(r.quality || "").trim(),
      contractor: String(r.contractor || "").trim(),
      status: STATUSES.indexOf(r.status) >= 0 ? r.status : "공고",
      noticeDate: String(r.noticeDate || "").trim(),
      bidDate: String(r.bidDate || "").trim(),
      awardDate: String(r.awardDate || "").trim(),
      awardAmount: toNumber(r.awardAmount),
      agreementNo: String(r.agreementNo || "").trim(),
      scope: String(r.scope || "").trim(),
      address: String(r.address || "").trim(),
      remark: String(r.remark || "").trim()
    };
  }

  function nowStamp() {
    var d = new Date();
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
           " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  // 수정 이력에 남길 항목 이름
  var FIELD_LABELS = {
    categories: "공종", region: "지역", city: "도시",
    patentNumbers: "POUR 적용 특허번호", patentNames: "특허명·공법명",
    noticePatentText: "공고문 특허·공법 원문", client: "발주처(아파트명)",
    projectNames: "공사명", phone: "전화번호", households: "세대수",
    quality: "공사 품질", contractor: "시공사", status: "상태",
    noticeDate: "공고일", bidDate: "개찰일", awardDate: "낙찰일",
    awardAmount: "낙찰금액", expectedAmount: "예상금액", bidType: "입찰 종류",
    agreementNo: "협약서 발행번호", scope: "공사 범위", address: "주소",
    remark: "비고", patentConfirmed: "특허번호 직접 확인"
  };

  var idSeq = 0;
  function createId() {
    idSeq++;
    return "rec-" + Date.now().toString(36) + "-" + idSeq.toString(36);
  }

  /** 화면 표시용 문자열. 여러 값은 줄바꿈으로 잇는다 (쉼표로 길게 붙이지 않는다). */
  function displayValue(record, column, index) {
    switch (column.type) {
      case "seq":    return String((index || 0) + 1);
      case "patent": return (record.patentNumbers || []).map(PourPatents.formatNumber).join("\n");
      case "list":   return (record[column.key] || []).join("\n");
      case "number": return record[column.key] === "" || record[column.key] == null
                       ? "" : Number(record[column.key]).toLocaleString("ko-KR");
      case "money":  return record[column.key] === "" || record[column.key] == null
                       ? "" : Number(record[column.key]).toLocaleString("ko-KR");
      case "phone":  return String(record.phone || "");
      default:       return String(record[column.key] == null ? "" : record[column.key]);
    }
  }

  /** 엑셀 내보내기용 값. 세대수·금액은 숫자로, 전화번호는 문자열로 넘긴다. */
  function exportValue(record, column, index) {
    switch (column.type) {
      case "seq":    return (index || 0) + 1;
      case "number":
      case "money":  return record[column.key] === "" || record[column.key] == null
                       ? null : Number(record[column.key]);
      case "phone":  return String(record.phone || "");
      default:       return displayValue(record, column, index);
    }
  }

  /* --------------------------------------------------------- 저장소 */

  function store(storage) {
    return storage || (typeof localStorage !== "undefined" ? localStorage : null);
  }

  function list(storage) {
    var s = store(storage);
    if (!s) return [];
    try {
      var raw = s.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalize) : [];
    } catch (e) { return []; }
  }

  function writeAll(records, storage) {
    var s = store(storage);
    if (!s) return records;
    try { s.setItem(STORAGE_KEY, JSON.stringify(records)); } catch (e) {}
    return records;
  }

  /** 새 공고를 등록하거나 기존 현장을 갱신한다. id가 같으면 언제나 같은 행을 고친다. */
  function save(input, storage) {
    var record = normalize(input);
    var all = list(storage);
    var at = -1;
    for (var i = 0; i < all.length; i++) { if (all[i].id === record.id) { at = i; break; } }
    if (at >= 0) all[at] = record; else all.push(record);
    writeAll(all, storage);
    return record;
  }

  /**
   * 공고를 낙찰로 바꾼다. 새 행을 만들지 않고 같은 행을 갱신한다.
   * 시공사는 낙찰 처리 시 반드시 있어야 한다.
   */
  function award(id, payload, storage) {
    var all = list(storage);
    var at = -1;
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) { at = i; break; } }
    if (at < 0) return { ok: false, message: "해당 현장을 찾지 못했습니다." };

    var data = payload || {};
    var target = all[at];

    // 낙찰 필수 항목: 낙찰일 · 시공사 · 낙찰금액 · 최종 공종
    var missing = [];
    var contractor = String(data.contractor != null ? data.contractor : target.contractor).trim();
    var awardDate = String(data.awardDate != null ? data.awardDate : target.awardDate).trim();
    var awardAmount = data.awardAmount != null && data.awardAmount !== ""
      ? toNumber(data.awardAmount) : target.awardAmount;
    var categories = data.categories != null ? toList(data.categories) : target.categories;

    if (!contractor) missing.push("시공사");
    if (!awardDate) missing.push("낙찰일");
    if (awardAmount === "" || awardAmount == null) missing.push("낙찰금액");
    if (!categories.length) missing.push("최종 공종");
    if (missing.length) {
      return { ok: false, message: "낙찰 저장에 다음 항목이 필요합니다: " + missing.join(", ") };
    }

    // POUR 적용 특허번호는 없어도 저장을 막지 않는다. 확인만 받는다.
    var patentNumbers = data.patentNumbers != null
      ? toList(data.patentNumbers).map(PourPatents.normalizeNumber).filter(Boolean)
      : target.patentNumbers;
    if (!patentNumbers.length && !data.confirmedWithoutPatent) {
      return {
        ok: false,
        needsConfirm: true,
        message: "POUR 적용 특허번호가 아직 확인되지 않았습니다. 미기재 상태로 낙찰 저장할까요?"
      };
    }

    var merged = target;
    merged.status = data.status && STATUSES.indexOf(data.status) >= 0 ? data.status : "낙찰";
    merged.awardDate = awardDate;
    merged.contractor = contractor;
    merged.awardAmount = awardAmount;
    merged.categories = categories;
    merged.patentNumbers = patentNumbers;
    if (data.patentNames != null) merged.patentNames = toList(data.patentNames);
    if (data.quality != null) merged.quality = String(data.quality).trim();
    if (data.remark != null) merged.remark = String(data.remark).trim();
    if (data.agreementNo != null) merged.agreementNo = String(data.agreementNo).trim();

    var before = JSON.parse(JSON.stringify(target));
    var after = normalize(merged);
    after.history = before.history.concat(buildHistory(before, after, "낙찰 처리"));
    all[at] = after;
    writeAll(all, storage);
    return { ok: true, record: after };
  }

  /* ------------------------------------------------- 수정 · 이력 */

  function sameValue(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      return (a || []).join("|") === (b || []).join("|");
    }
    return String(a == null ? "" : a) === String(b == null ? "" : b);
  }

  function displayFor(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value === true) return "예";
    if (value === false) return "아니오";
    return String(value == null ? "" : value);
  }

  /** 수정 전후를 비교해 이력 항목을 만든다. */
  function buildHistory(before, after, action) {
    var changes = [];
    Object.keys(FIELD_LABELS).forEach(function (field) {
      if (sameValue(before[field], after[field])) return;
      changes.push({
        field: field,
        label: FIELD_LABELS[field],
        before: displayFor(before[field]),
        after: displayFor(after[field])
      });
    });
    if (!changes.length) return [];

    var addedPatent = changes.some(function (c) {
      return c.field === "patentNumbers" && !before.patentNumbers.length && after.patentNumbers.length;
    });

    return [{
      at: nowStamp(),
      action: addedPatent ? "POUR 적용 특허번호 추가" : (action || "자료 수정"),
      statusBefore: before.status,
      statusAfter: after.status,
      changes: changes
    }];
  }

  /**
   * 어느 화면에서 고치든 같은 고유 ID의 자료를 갱신한다. 새 행을 만들지 않는다.
   * 최초 등록일과 기존 이력은 지우지 않는다.
   */
  function update(id, changes, storage) {
    var all = list(storage);
    var at = -1;
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) { at = i; break; } }
    if (at < 0) return { ok: false, message: "해당 자료를 찾지 못했습니다." };

    var before = all[at];
    var draft = {};
    Object.keys(before).forEach(function (k) { draft[k] = before[k]; });
    Object.keys(changes || {}).forEach(function (k) {
      if (k === "id" || k === "createdAt" || k === "history") return;   // 보존 항목
      draft[k] = changes[k];
    });

    var after = normalize(draft);
    after.id = before.id;
    after.createdAt = before.createdAt;
    after.history = before.history.concat(buildHistory(before, after, "자료 수정"));

    all[at] = after;
    writeAll(all, storage);
    return { ok: true, record: after };
  }

  /* --------------------------------------- 특허번호 미기재 알림 */

  /**
   * POUR 적용 특허번호가 확정된 자료인지 판단한다.
   * 업로드된 특허 자료와 일치하거나, 관리자가 직접 확인 완료로 저장한 경우만 인정한다.
   */
  function isPatentResolved(record, patentStorage) {
    if (!record || !record.patentNumbers || !record.patentNumbers.length) return false;
    if (record.patentConfirmed) return true;
    return record.patentNumbers.every(function (n) {
      return !!PourPatents.find(n, patentStorage);
    });
  }

  /**
   * 상단 알림 대상: 상태가 "낙찰" 이면서 POUR 적용 특허번호가 비어 있는 자료.
   * 공고·유찰·공고취소·재공고·타공법 낙찰은 대상이 아니다.
   */
  function missingPatentRecords(records, patentStorage) {
    return (records || []).filter(function (rec) {
      if (rec.status !== "낙찰") return false;
      return !isPatentResolved(rec, patentStorage);
    });
  }

  function missingPatentMessage(count) {
    return "⚠ 특허번호 미기재 " + count + "건 — 확인이 필요한 낙찰 현장이 있습니다.";
  }

  /* ----------------------------------------------------- 특허별 실적 */

  /**
   * 특허 탭 목록. 등록된 특허와 실제 공사 자료에 쓰인 특허를 합쳐 자동 생성한다.
   * 비활성 특허라도 공사 자료와 연결돼 있으면 탭을 남긴다.
   */
  function patentTabs(patentList, records) {
    var tabs = [], seen = {};
    var used = {};
    (records || []).forEach(function (rec) {
      (rec.patentNumbers || []).forEach(function (n) { used[n] = true; });
    });

    (patentList || []).forEach(function (p) {
      if (p.active === false && !used[p.number]) return;   // 비활성이고 쓰인 적 없으면 숨김
      if (seen[p.number]) return;
      seen[p.number] = true;
      tabs.push({
        number: p.number,
        label: PourPatents.tabLabel(p),
        name: p.name || "",
        category: p.category || "",
        active: p.active !== false,
        linked: !!used[p.number]
      });
    });

    // 특허 자료에는 없지만 공사 자료에 쓰인 번호도 탭으로 남긴다.
    Object.keys(used).forEach(function (n) {
      if (seen[n]) return;
      seen[n] = true;
      tabs.push({
        number: n, label: PourPatents.tabLabel({ number: n }),
        name: "", category: "", active: true, linked: true, unregistered: true
      });
    });

    return tabs;
  }

  /** 해당 특허가 적용된 현장만 고른다. 같은 현장이 두 번 나오지 않도록 id로 걸러낸다. */
  function recordsForPatent(number, records, options) {
    var target = PourPatents.normalizeNumber(number);
    var opts = options || {};
    var seen = {}, out = [];
    (records || []).forEach(function (rec) {
      if ((rec.patentNumbers || []).indexOf(target) < 0) return;
      if (seen[rec.id]) return;                                  // 중복 표시 방지
      if (opts.status && opts.status !== "전체" && rec.status !== opts.status) return;
      seen[rec.id] = true;
      out.push(rec);
    });
    return out;
  }

  /**
   * 특허 탭 상단 요약. "타공법 낙찰"은 POUR 실적이 아니므로 낙찰 집계에서 뺀다.
   */
  function summarize(records) {
    var total = 0, awarded = 0, failed = 0, otherMethod = 0;
    var households = 0, amount = 0, regions = {};
    (records || []).forEach(function (rec) {
      total++;
      if (rec.status === "낙찰") {
        awarded++;
        if (rec.awardAmount !== "" && rec.awardAmount != null) amount += Number(rec.awardAmount);
      } else if (rec.status === "유찰") failed++;
      else if (rec.status === "타공법 낙찰") otherMethod++;
      if (rec.households !== "" && rec.households != null) households += Number(rec.households);
      if (rec.region) regions[rec.region] = true;
    });
    return {
      total: total, awarded: awarded, failed: failed, otherMethod: otherMethod,
      households: households, amount: amount, regions: Object.keys(regions).length
    };
  }

  /** "320억원" 처럼 읽기 쉬운 금액 표기. */
  function formatAmountShort(amount) {
    var n = Number(amount || 0);
    if (!n) return "0원";
    if (n >= 100000000) {
      var eok = n / 100000000;
      return (eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR") + "억원";
    }
    if (n >= 10000) return Math.round(n / 10000).toLocaleString("ko-KR") + "만원";
    return n.toLocaleString("ko-KR") + "원";
  }

  function summaryText(tabLabel, summary) {
    return tabLabel + "  전체 " + summary.total + "건 · 낙찰 " + summary.awarded + "건 · 총 " +
      summary.households.toLocaleString("ko-KR") + "세대 · 낙찰금액 " + formatAmountShort(summary.amount);
  }

  /* --------------------------------------------------- 필터 · 정렬 */

  function applyFilters(records, filters) {
    var f = filters || {};
    return (records || []).filter(function (rec) {
      if (f.status && f.status !== "전체" && rec.status !== f.status) return false;
      if (f.region && f.region !== "전체" && rec.region !== f.region) return false;
      if (f.city && f.city !== "전체" && rec.city !== f.city) return false;
      if (f.year && f.year !== "전체") {
        var y = String(rec.noticeDate || rec.awardDate || "").slice(0, 4);
        if (y !== String(f.year)) return false;
      }
      if (f.keyword) {
        var hay = [rec.client, rec.city, rec.region, rec.contractor, rec.remark]
          .concat(rec.projectNames || [], rec.categories || [], rec.patentNames || [],
                  (rec.patentNumbers || []).map(PourPatents.formatNumber))
          .join(" ").toUpperCase();
        if (hay.indexOf(String(f.keyword).toUpperCase()) < 0) return false;
      }
      return true;
    });
  }

  function sortRecords(records, columnKey, direction) {
    var dir = direction === "desc" ? -1 : 1;
    var column = null;
    COLUMNS.concat(PATENT_TAB_COLUMNS).forEach(function (c) { if (c.key === columnKey) column = column || c; });
    if (!column) return (records || []).slice();

    return (records || []).slice().sort(function (a, b) {
      var va, vb;
      if (column.type === "number" || column.type === "money") {
        va = a[columnKey] === "" || a[columnKey] == null ? -Infinity : Number(a[columnKey]);
        vb = b[columnKey] === "" || b[columnKey] == null ? -Infinity : Number(b[columnKey]);
        return (va - vb) * dir;
      }
      va = displayValue(a, column, 0);
      vb = displayValue(b, column, 0);
      return va.localeCompare(vb, "ko") * dir;
    });
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    STATUSES: STATUSES,
    QUALITY_OPTIONS: QUALITY_OPTIONS,
    COLUMNS: COLUMNS,
    PATENT_TAB_COLUMNS: PATENT_TAB_COLUMNS,
    normalize: normalize,
    createId: createId,
    displayValue: displayValue,
    exportValue: exportValue,
    list: list,
    save: save,
    award: award,
    patentTabs: patentTabs,
    recordsForPatent: recordsForPatent,
    summarize: summarize,
    summaryText: summaryText,
    formatAmountShort: formatAmountShort,
    applyFilters: applyFilters,
    sortRecords: sortRecords,
    update: update,
    buildHistory: buildHistory,
    isPatentResolved: isPatentResolved,
    missingPatentRecords: missingPatentRecords,
    missingPatentMessage: missingPatentMessage,
    FIELD_LABELS: FIELD_LABELS,
    clear: function (storage) { writeAll([], storage); }
  };
});
