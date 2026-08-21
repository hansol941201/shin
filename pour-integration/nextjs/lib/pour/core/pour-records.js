/**
 * 공사실적 자료 모델 · 실적표 열 정의 · 특허별 집계
 *
 * 한 현장은 반드시 하나의 행으로 유지한다. 공고로 등록한 뒤 낙찰로 바뀌어도
 * 새 행을 만들지 않고 같은 행(id)을 갱신한다.
 */
(function (root, factory) {
  var node = typeof require === "function" && typeof module === "object";
  var patents = node ? require("./pour-patents.js") : root.PourPatents;
  var categories = node ? require("./pour-categories.js") : root.PourCategories;
  var api = factory(patents, categories);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PourRecords = api;
})(typeof self !== "undefined" ? self : this, function (PourPatents, PourCategories) {
  "use strict";

  var STORAGE_KEY = "pour.records.v1";

  var STATUSES = ["공고", "낙찰", "유찰", "공고취소", "재공고", "타공법 낙찰"];

  var BID_TYPES = ["서류접수", "전자입찰"];
  var BID_TYPE_UNKNOWN = "확인 필요";

  // 기존에 자유롭게 적혀 있던 입찰종류 값을 두 버튼 중 하나로 옮긴다.
  // 어느 쪽인지 알 수 없는 값은 지우지 않고 "확인 필요"로 남긴다.
  var BID_TYPE_MAP = {
    "전자입찰": "전자입찰", "전자입찰(최저가)": "전자입찰", "전자입찰(적격)": "전자입찰",
    "K-APT 전자입찰": "전자입찰", "KAPT 전자입찰": "전자입찰",
    "서류접수": "서류접수", "방문접수": "서류접수", "우편접수": "서류접수",
    "직접접수": "서류접수", "현장접수": "서류접수"
  };

  function normalizeBidType(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    if (BID_TYPES.indexOf(raw) >= 0) return raw;
    var key = raw.replace(/\s+/g, "");
    var found = "";
    Object.keys(BID_TYPE_MAP).forEach(function (k) {
      if (!found && k.replace(/\s+/g, "") === key) found = BID_TYPE_MAP[k];
    });
    if (found) return found;
    if (/전자/.test(raw)) return "전자입찰";
    if (/접수/.test(raw)) return "서류접수";
    return BID_TYPE_UNKNOWN;                 // 원본은 bidTypeRaw 에 그대로 남는다
  }

  /* --------------------------------------------- 협약서 발행번호 규칙

     협약서 발행번호는 낙찰 결과를 정리했다는 표시다.
       · 번호가 들어오면 그 행을 낙찰로 바꾼다 (새 행을 만들지 않는다)
       · 번호만 먼저 넣고 나머지 낙찰 정보는 나중에 채울 수 있다
       · 아직 비어 있는 낙찰 정보는 "추가 입력 필요" 알림에 모인다
       · 낙찰인데 번호가 없는 옛 자료는 "협약서번호 미입력" 알림에 모인다
  */

  /** 협약서 발행번호가 들어오면 낙찰로 바꿀 수 있는 상태 */
  var AGREEMENT_PROMOTES = ["공고", "재공고", "유찰"];

  /**
   * 엑셀에서 옮겨 온 행인지.
   *
   * 연도별 실적 List 에는 협약서 발행번호가 아예 없다. 이 행들까지 알림에 넣으면
   * 알림이 1,900건이 넘어 정작 봐야 할 것이 묻힌다. 그래서 "협약서번호 미입력"
   * 알림은 프로그램에서 새로 등록·전환한 건만 대상으로 한다.
   * (번호를 지어내지 않는다. 상세 수정 화면에서 직접 넣는 길은 그대로 열어 둔다.)
   */
  var IMPORT_SOURCE = "import";
  var IMPORT_ID_PREFIX = "rec-imp-";

  function isImported(record) {
    if (!record) return false;
    if (record.source === IMPORT_SOURCE) return true;
    return String(record.id || "").indexOf(IMPORT_ID_PREFIX) === 0;   // 옛 자료용 대비책
  }

  /** 번호를 지웠을 때 되돌릴지 물어보는 문구 */
  var AGREEMENT_CLEARED_MESSAGE =
    "협약서 발행번호를 지웠습니다. 상태를 \"공고\"로 되돌릴까요?\n" +
    "되돌리지 않으면 낙찰 상태로 남고 \"협약서번호 미입력\" 알림에 표시됩니다.";

  /** 낙찰 결과로 채워야 할 항목 */
  var AWARD_REQUIRED = [
    { key: "contractor", label: "시공사" },
    { key: "contractorPhone", label: "시공사 전화번호" },
    { key: "awardDate", label: "낙찰일" },
    { key: "awardAmount", label: "낙찰금액" },
    { key: "categories", label: "최종 공종" }
  ];

  function isFilled(record, key) {
    var v = record ? record[key] : null;
    if (Array.isArray(v)) return v.length > 0;
    return !(v == null || String(v).trim() === "");
  }

  /** 협약서 발행번호가 적혀 있는지 */
  function hasAgreement(record) {
    return isFilled(record, "agreementNo");
  }

  /** 낙찰인데 아직 비어 있는 항목 이름 */
  function missingAwardFields(record) {
    if (!record || record.status !== "낙찰") return [];
    return AWARD_REQUIRED.filter(function (f) { return !isFilled(record, f.key); })
      .map(function (f) { return f.label; });
  }

  /**
   * 협약서 발행번호를 기준으로 본 처리 단계.
   *   확인 대기 — 아직 번호가 없다 (낙찰 결과를 정리하지 않았다)
   *   추가 입력 필요 — 번호는 있지만 낙찰 정보가 덜 찼다
   *   정리 완료 — 번호와 낙찰 정보가 모두 있다
   *   협약서번호 미입력 — 낙찰인데 번호가 없다
   */
  function agreementStage(record) {
    if (!record) return "";
    if (record.status === "낙찰") {
      if (!hasAgreement(record)) return "협약서번호 미입력";
      return missingAwardFields(record).length ? "추가 입력 필요" : "정리 완료";
    }
    return hasAgreement(record) ? "정리 완료" : "확인 대기";
  }

  /** 공고일 ≤ 서류 마감일 ≤ 개찰일 인지 확인한다. 빈 값은 검사하지 않는다. */
  function validateDates(record) {
    var r = record || {};
    var pairs = [
      ["noticeDate", "documentDueDate", "서류 마감일은 공고일보다 빠를 수 없습니다."],
      ["documentDueDate", "bidDate", "개찰일은 서류 마감일보다 빠를 수 없습니다."],
      ["noticeDate", "bidDate", "개찰일은 공고일보다 빠를 수 없습니다."]
    ];
    var errors = [];
    pairs.forEach(function (pair) {
      var a = r[pair[0]], b = r[pair[1]];
      if (a && b && String(a) > String(b)) errors.push({ field: pair[1], message: pair[2] });
    });
    return { ok: !errors.length, errors: errors };
  }
  // 실적 List 엑셀은 최상/상/중/하 표기를 쓴다. 원본 표기를 바꾸지 않고 그대로 고를 수 있게 함께 둔다.
  var QUALITY_OPTIONS = ["우수", "양호", "보통", "최상", "상", "중", "하", "확인 필요"];

  /* --------------------------------------------------------- 열 정의 */

  // 화면 실적표와 내려받는 엑셀·CSV가 같은 순서를 쓰도록 한곳에서 정의한다.
  var COLUMNS = [
    { key: "categories",     title: "공종",              type: "list",   width: 14 },
    { key: "region",         title: "지역",              type: "text",   width: 8 },
    { key: "city",           title: "도시",              type: "text",   width: 10 },
    { key: "patentNumbers",  title: "POUR 특허번호",     type: "patent", width: 18 },
    { key: "client",         title: "발주처(아파트명)",  type: "text",   width: 24 },
    { key: "projectNames",   title: "공사명",            type: "list",   width: 34 },
    { key: "phone",          title: "발주처 전화번호",   type: "phone",  width: 16 },
    { key: "households",     title: "세대수",            type: "number", width: 9 },
    { key: "quality",        title: "공사 품질",         type: "text",   width: 10 },
    { key: "contractor",     title: "시공사",            type: "text",   width: 16 },
    { key: "contractorPhone", title: "시공사 전화번호",   type: "phone",  width: 16 },
    { key: "status",         title: "상태",              type: "text",   width: 11 },
    { key: "noticeDate",     title: "공고일",            type: "date",   width: 12 },
    { key: "documentDueDate", title: "서류 마감일",      type: "date",   width: 12 },
    { key: "bidDate",        title: "개찰일",            type: "date",   width: 12 },
    { key: "awardDate",      title: "낙찰일",            type: "date",   width: 12 },
    { key: "awardAmount",    title: "낙찰금액",          type: "money",  width: 14 },
    { key: "agreementNo",    title: "협약서 발행번호",   type: "text",   width: 16 },
    { key: "patentNames",    title: "POUR 특허명·공법명", type: "list",  width: 22 },
    { key: "scopes",         title: "공사 범위",         type: "list",   width: 20 },
    { key: "address",        title: "주소",              type: "text",   width: 28 },
    { key: "remark",         title: "비고",              type: "text",   width: 18 },
    // 연도별 실적 List 에서 옮겨 온 연도. 요청한 1~22번 열 순서를 흔들지 않도록 뒤에 둔다.
    { key: "year",           title: "연도",              type: "text",   width: 7 },
    // 공종 대분류. 세부 공종(공종 열)은 그대로 두고 대분류만 따로 보여 준다.
    { key: "categoryGroups", title: "공종 대분류",       type: "list",   width: 12 },
    { key: "categoryItems",  title: "공종 (대분류·세부)", type: "categoryPairs", width: 20 },
    { key: "__agreementStage", title: "처리 단계",         type: "agreementStage", width: 14 },
    // POUR 특허와 타사 특허는 절대 같은 열에 섞지 않는다
    { key: "thirdPatentNumbers", title: "타사 특허번호",         type: "thirdNumbers",   width: 18 },
    { key: "__thirdNames",       title: "타사 특허명·공법명",     type: "thirdNames",     width: 22 },
    { key: "__thirdCompanies",   title: "타사 특허 보유 회사",    type: "thirdCompanies", width: 18 },
    { key: "__patentKind",       title: "특허 구분",             type: "patentKind",     width: 12 },
    { key: "__pourCount",        title: "POUR 특허 개수",        type: "statNumber",     width: 12 },
    { key: "__thirdCount",       title: "타사 특허 개수",        type: "statNumber",     width: 12 },
    { key: "__totalCount",       title: "전체 특허 개수",        type: "statNumber",     width: 12 },
    { key: "__multi",            title: "다특허 여부",           type: "multiLabel",     width: 16 },
    { key: "__patentStatus",     title: "특허 확인 상태",        type: "patentStatus",   width: 18 }
  ];

  // 메인 화면 엑셀형 목록의 기본 열 순서
  var MAIN_COLUMNS = [
    { key: "__seq",          title: "No.",              type: "seq",          width: 6,  pin: true },
    { key: "status",         title: "상태",             type: "text",         width: 11, pin: true },
    { key: "year",           title: "연도",             type: "text",         width: 7 },
    { key: "noticeDate",     title: "공고일",           type: "date",         width: 12 },
    { key: "documentDueDate", title: "서류 마감일",     type: "date",         width: 12 },
    { key: "bidDate",        title: "개찰일",           type: "date",         width: 12 },
    { key: "region",         title: "지역",             type: "text",         width: 8 },
    { key: "city",           title: "도시",             type: "text",         width: 10 },
    { key: "client",         title: "발주처(아파트명)", type: "text",         width: 24, pin: true },
    { key: "projectNames",   title: "공사명",           type: "list",         width: 32 },
    { key: "categoryGroups", title: "공종 대분류",      type: "list",         width: 11 },
    { key: "categories",     title: "공종",             type: "list",         width: 14 },
    { key: "patentNumbers",  title: "POUR 특허번호",    type: "patent",       width: 18 },
    { key: "thirdPatentNumbers", title: "타사 특허번호", type: "thirdNumbers", width: 18 },
    { key: "phone",          title: "전화번호",         type: "phone",        width: 15 },
    { key: "households",     title: "세대수",           type: "number",       width: 9 },
    { key: "bidType",        title: "입찰종류",         type: "text",         width: 11 },
    { key: "contractor",     title: "시공사",           type: "text",         width: 16 },
    { key: "contractorPhone", title: "시공사 전화번호", type: "phone",        width: 16 },
    { key: "awardDate",      title: "낙찰일",           type: "date",         width: 12 },
    { key: "awardAmount",    title: "낙찰금액",         type: "money",        width: 14 },
    { key: "agreementNo",    title: "협약서 발행번호",  type: "text",         width: 16 },
    { key: "__agreementStage", title: "처리 단계",       type: "agreementStage", width: 13 },
    { key: "quality",        title: "공사 품질",        type: "text",         width: 10 },
    { key: "remark",         title: "비고",             type: "text",         width: 18 }
  ];

  // 특허별 실적 탭의 표. 순번이 맨 앞에 오고 핵심 열을 먼저 보여준다.
  var PATENT_TAB_COLUMNS = [
    { key: "__seq",         title: "순번",             type: "seq",    width: 6 },
    { key: "region",        title: "지역",             type: "text",   width: 8 },
    { key: "city",          title: "도시",             type: "text",   width: 10 },
    { key: "patentNumbers", title: "특허번호",         type: "patent", width: 18 },
    { key: "client",        title: "발주처(아파트명)", type: "text",   width: 24 },
    { key: "projectNames",  title: "공사명",           type: "list",   width: 34 },
    { key: "phone",         title: "발주처 전화번호",  type: "phone",  width: 16 },
    { key: "households",    title: "세대수",           type: "number", width: 9 },
    { key: "categoryGroups", title: "공종 대분류",      type: "list",   width: 11 },
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
    var categoryItems = buildCategoryItems(r);
    var categoryNames = PourCategories.namesOf(categoryItems);
    var items = buildPatentItems(r);
    var pourItems = items.filter(function (it) { return it.kind === POUR; });
    var thirdItems = items.filter(function (it) { return it.kind === THIRD; });
    return {
      id: r.id || createId(),
      // 공종은 두 가지로 함께 남긴다.
      //   categories     — 지금까지 써 온 세부 공종 이름 목록 (열·엑셀이 그대로 쓴다)
      //   categoryItems  — 대분류를 함께 담은 항목 목록 (같은 이름이 여러 대분류에 있어서 필요하다)
      // 항목이 없는 옛 자료는 이름에서 옮겨 오되 확실할 때만 분류하고 나머지는 기타로 둔다.
      categories: categoryNames,
      categoryItems: categoryItems,
      categoryGroups: PourCategories.groupNamesOf(categoryItems),
      region: String(r.region || "").trim(),
      city: String(r.city || "").trim(),
      patentItems: items,
      patentNumbers: pourItems.map(function (it) { return it.number; }),
      patentNames: pourItems.map(function (it) { return it.name; }).filter(Boolean),
      thirdPatentNumbers: thirdItems.map(function (it) { return it.number; }),
      noticeMultiFlag: r.noticeMultiFlag === true,
      noticePatentText: String(r.noticePatentText || "").trim(),
      agreementNoOnly: String(r.agreementNoOnly || "").trim(),
      bidType: normalizeBidType(r.bidType),
      bidTypeRaw: String(r.bidTypeRaw || r.bidType || "").trim(),   // 원본 표기 보존
      documentDueDate: String(r.documentDueDate || "").trim(),
      isRenotice: r.isRenotice === true,
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
      contractorPhone: String(r.contractorPhone == null ? "" : r.contractorPhone).trim(),
      contractorContactName: String(r.contractorContactName || "").trim(),
      contractorMobile: String(r.contractorMobile == null ? "" : r.contractorMobile).trim(),
      contractorAddress: String(r.contractorAddress || "").trim(),
      contractorBusinessNo: String(r.contractorBusinessNo == null ? "" : r.contractorBusinessNo).trim(),
      contractorNote: String(r.contractorNote || "").trim(),
      resultEnteredAt: String(r.resultEnteredAt || "").trim(),
      updatedAt: String(r.updatedAt || "").trim(),
      isRebid: r.isRebid === true || r.isRenotice === true,
      rebidRound: r.rebidRound == null || r.rebidRound === "" ? "" : Number(r.rebidRound),
      rebidReason: String(r.rebidReason || "").trim(),
      previousFailDate: String(r.previousFailDate || "").trim(),
      originalProjectId: String(r.originalProjectId || r.originalNoticeId || "").trim(),
      previousProjectId: String(r.previousProjectId || "").trim(),
      status: STATUSES.indexOf(r.status) >= 0 ? r.status : "공고",
      // 어디서 들어온 자료인지 (엑셀 이전분은 "import"). 알림 대상을 가르는 데만 쓴다.
      source: String(r.source || "").trim(),
      year: String(r.year || "").trim(),
      noticeDate: String(r.noticeDate || "").trim(),
      bidDate: String(r.bidDate || "").trim(),
      awardDate: String(r.awardDate || "").trim(),
      awardAmount: toNumber(r.awardAmount),
      agreementNo: String(r.agreementNo || "").trim(),
      scopes: toList(r.scopes != null ? r.scopes : r.scope),
      scope: toList(r.scopes != null ? r.scopes : r.scope).join("\n"),
      address: String(r.address || "").trim(),
      remark: String(r.remark || "").trim()
    };
  }

  /**
   * 공종 항목을 만든다.
   * categoryItems 가 있으면 그대로 쓰고(빈 배열도 "모두 지웠다"는 뜻),
   * 없으면 기존 categories 이름에서 옮겨 온다. 어느 쪽이든 이름은 바꾸지 않는다.
   */
  function buildCategoryItems(r) {
    if (Array.isArray(r.categoryItems)) return PourCategories.normalizeItems(r.categoryItems);
    return PourCategories.itemsFromNames(r.categories);
  }

  var POUR = "POUR", THIRD = "THIRD_PARTY";

  var itemSeq = 0;
  function itemId() { itemSeq++; return "pat-" + Date.now().toString(36) + "-" + itemSeq.toString(36); }

  /** 특허 한 건. POUR 특허와 타사 특허를 같은 모양으로 담되 kind 로 구분한다. */
  function normalizePatentItem(input, kind) {
    var it = input || {};
    var number = PourPatents.normalizeNumber(it.number != null ? it.number : it);
    if (!number) return null;
    return {
      id: it.id || itemId(),
      recordId: it.recordId || "",
      kind: it.kind === THIRD || kind === THIRD ? THIRD : POUR,
      number: number,
      display: PourPatents.formatNumber(number),
      name: String(it.name || "").trim(),
      method: String(it.method || "").trim(),
      company: String(it.company || "").trim(),
      category: String(it.category || "").trim(),
      remark: String(it.remark || "").trim(),
      createdAt: it.createdAt || nowStamp(),
      updatedAt: nowStamp()
    };
  }

  /**
   * 입력에서 특허 항목 목록을 만든다.
   * patentItems 가 있으면 그대로 쓰고, 없으면 기존 patentNumbers/patentNames 를 POUR 특허로 옮긴다.
   * (기존 자료를 지우지 않고 새 구조로 옮기기 위한 경로)
   */
  function buildPatentItems(r) {
    var out = [], seen = {};

    function push(item) {
      if (!item) return;
      var key = item.kind + ":" + item.number;
      if (seen[key]) return;            // 같은 구분 안에서 같은 번호는 한 번만
      seen[key] = true;
      out.push(item);
    }

    // 빈 배열도 "특허를 모두 지웠다"는 뜻이므로 그대로 받아들인다.
    // 항목 자체가 없을 때(옛 자료)만 기존 번호에서 옮겨 온다.
    if (Array.isArray(r.patentItems)) {
      r.patentItems.forEach(function (it) { push(normalizePatentItem(it)); });
    } else {
      var names = toList(r.patentNames);
      toList(r.patentNumbers).forEach(function (n, i) {
        push(normalizePatentItem({ number: n, name: names[i] || "" }, POUR));
      });
      toList(r.thirdPatentNumbers).forEach(function (n) {
        push(normalizePatentItem({ number: n }, THIRD));
      });
    }
    return out;
  }

  function nowStamp() {
    var d = new Date();
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
           " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  // 수정 이력에 남길 항목 이름
  var FIELD_LABELS = {
    categories: "공종", categoryItems: "공종(대분류·세부)", region: "지역", city: "도시",
    patentNumbers: "POUR 적용 특허번호", patentNames: "특허명·공법명",
    noticePatentText: "공고문 특허·공법 원문", client: "발주처(아파트명)",
    projectNames: "공사명", phone: "전화번호", households: "세대수",
    quality: "공사 품질", contractor: "시공사", status: "상태",
    year: "연도", noticeDate: "공고일", documentDueDate: "서류 마감일", bidDate: "개찰일", awardDate: "낙찰일",
    isRenotice: "재공고 건",
    awardAmount: "낙찰금액", expectedAmount: "예상금액", bidType: "입찰 종류",
    agreementNo: "협약서 발행번호", scope: "공사 범위", address: "주소",
    remark: "비고", patentConfirmed: "특허번호 직접 확인",
    contractorPhone: "시공사 전화번호", contractorContactName: "시공사 담당자명",
    contractorMobile: "담당자 휴대전화", contractorAddress: "시공사 주소",
    contractorBusinessNo: "사업자등록번호", contractorNote: "시공사 비고",
    thirdPatentNumbers: "타사 특허번호", noticeMultiFlag: "공고문 다특허 기재"
  };

  var idSeq = 0;
  function createId() {
    idSeq++;
    return "rec-" + Date.now().toString(36) + "-" + idSeq.toString(36);
  }

  // 특허 확인 상태를 계산할 때 참고할 특허 자료 저장소 (Node 테스트에서 갈아끼울 수 있게 둔다)
  var patentStorageRef = null;
  function usePatentStorage(storage) { patentStorageRef = storage || null; }

  function itemsOfKind(record, kind) {
    return ((record && record.patentItems) || []).filter(function (it) { return it.kind === kind; });
  }

  /** 화면 표시용 문자열. 여러 값은 줄바꿈으로 잇는다 (쉼표로 길게 붙이지 않는다). */
  function displayValue(record, column, index) {
    var stats;
    switch (column.type) {
      case "thirdNumbers":
        return itemsOfKind(record, THIRD).map(function (it) { return it.display; }).join("\n");
      case "thirdNames":
        return itemsOfKind(record, THIRD)
          .map(function (it) { return it.name || it.method; }).filter(Boolean).join("\n");
      case "thirdCompanies":
        return itemsOfKind(record, THIRD)
          .map(function (it) { return it.company; }).filter(Boolean).join("\n");
      case "patentKind": {
        var pour = itemsOfKind(record, POUR).length, third = itemsOfKind(record, THIRD).length;
        if (pour && third) return "POUR·타사";
        if (pour) return "POUR";
        if (third) return "타사";
        return "";
      }
      case "statNumber":
        stats = patentStats(record, patentStorageRef);
        return String(column.key === "__pourCount" ? stats.pourCount
          : column.key === "__thirdCount" ? stats.thirdCount : stats.totalCount);
      case "multiLabel":
        stats = patentStats(record, patentStorageRef);
        return stats.label ? stats.label + (stats.isMulti ? " (" + stats.detail + ")" : "") : "";
      case "patentStatus":
        return patentStats(record, patentStorageRef).status;
      case "categoryPairs":
        return PourCategories.labelsOf(record.categoryItems).join("\n");
      case "agreementStage":
        return agreementStage(record);
    }
    switch (column.type) {
      case "seq":    return String((index || 0) + 1);
      case "patent": return (record.patentNumbers || []).map(PourPatents.formatNumber).join("\n");
      case "list":   return (record[column.key] || []).join("\n");
      case "number": return record[column.key] === "" || record[column.key] == null
                       ? "" : Number(record[column.key]).toLocaleString("ko-KR");
      case "money":  return record[column.key] === "" || record[column.key] == null
                       ? "" : Number(record[column.key]).toLocaleString("ko-KR");
      case "phone":  return String(record[column.key] == null ? "" : record[column.key]);
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
      case "statNumber": return Number(displayValue(record, column, index));
      case "phone":  return String(record[column.key] == null ? "" : record[column.key]);
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
   * 여러 건을 한 번에 넣는다. (엑셀에서 옮겨 올 때 씀)
   * id 가 같으면 그 행을 갱신하고, 없으면 뒤에 붙인다. 기존 행은 지우지 않는다.
   * 저장은 마지막에 한 번만 하므로 수천 건이어도 빠르다.
   */
  function saveMany(inputs, storage) {
    var all = list(storage);
    var at = {};
    all.forEach(function (r, i) { at[r.id] = i; });
    var saved = [];
    (inputs || []).forEach(function (input) {
      var record = normalize(input);
      if (at[record.id] != null) all[at[record.id]] = record;
      else { at[record.id] = all.length; all.push(record); }
      saved.push(record);
    });
    writeAll(all, storage);
    return saved;
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
    // 최종 공종: 항목(대분류+세부)을 넘겼으면 거기서 이름을 뽑고,
    // 이름만 넘겼으면 그 이름을 쓴다. 둘 다 없으면 원래 값을 그대로 둔다.
    var categories = data.categoryItems != null ? PourCategories.namesOf(data.categoryItems)
      : data.categories != null ? toList(data.categories)
      : target.categories;

    var contractorPhone = String(
      data.contractorPhone != null ? data.contractorPhone : target.contractorPhone).trim();
    var agreementNo = String(
      data.agreementNo != null ? data.agreementNo : target.agreementNo).trim();

    // 협약서 발행번호가 있으면 그것만으로 낙찰 정리를 시작할 수 있다.
    // 나머지 낙찰 정보는 나중에 채우고, 그동안 "추가 입력 필요" 알림에 남는다.
    var fields = {};
    if (!agreementNo) {
      if (!contractor) { missing.push("시공사명"); fields.contractor = "시공사명을 입력해 주세요."; }
      if (!contractorPhone) {
        missing.push("시공사 전화번호");
        fields.contractorPhone = "시공사 전화번호를 입력해 주세요.";
      }
      if (!awardDate) { missing.push("낙찰일"); fields.awardDate = "낙찰일을 입력해 주세요."; }
      if (awardAmount === "" || awardAmount == null) {
        missing.push("낙찰금액");
        fields.awardAmount = "낙찰금액을 입력해 주세요.";
      }
      if (!categories.length) {
        missing.push("최종 공종");
        fields.categories = "최종 공종을 입력해 주세요.";
      }
      if (missing.length) {
        return {
          ok: false, fields: fields,
          message: "협약서 발행번호를 넣으면 나머지는 나중에 채울 수 있습니다.\n" +
            "번호가 아직 없다면 시공사명, 시공사 전화번호, 낙찰일, 낙찰금액, 최종 공종을 입력해 주세요."
        };
      }
    }

    // POUR 적용 특허번호는 없어도 저장을 막지 않는다. 확인만 받는다.
    // 특허 항목을 함께 넘겼다면 그쪽이 최신이므로 거기서 POUR 번호를 다시 뽑는다.
    var patentNumbers;
    if (data.patentItems != null) {
      patentNumbers = data.patentItems
        .filter(function (it) { return it && it.kind !== THIRD; })
        .map(function (it) { return PourPatents.normalizeNumber(it.number); })
        .filter(Boolean);
    } else if (data.patentNumbers != null) {
      patentNumbers = toList(data.patentNumbers).map(PourPatents.normalizeNumber).filter(Boolean);
    } else {
      patentNumbers = target.patentNumbers;
    }
    if (!patentNumbers.length && !data.confirmedWithoutPatent) {
      return {
        ok: false,
        needsConfirm: true,
        reason: "missingPatent",
        message: "POUR 적용 특허번호가 아직 확인되지 않았습니다. 미기재 상태로 낙찰 저장할까요?"
      };
    }

    var merged = target;
    merged.status = data.status && STATUSES.indexOf(data.status) >= 0 ? data.status : "낙찰";
    merged.awardDate = awardDate;
    merged.contractor = contractor;
    merged.contractorPhone = contractorPhone;
    ["contractorContactName", "contractorMobile", "contractorAddress",
     "contractorBusinessNo", "contractorNote", "scope", "agreementNo"].forEach(function (key) {
      if (data[key] != null) merged[key] = String(data[key]).trim();
    });
    if (data.thirdPatentNumbers != null || data.patentItems != null) {
      merged.patentItems = data.patentItems != null ? data.patentItems : merged.patentItems;
      if (data.thirdPatentNumbers != null) merged.thirdPatentNumbers = data.thirdPatentNumbers;
    }
    merged.resultEnteredAt = nowStamp();       // 결과 입력일
    merged.updatedAt = nowStamp();             // 최종 수정일
    merged.awardAmount = awardAmount;
    // 공종: 항목(대분류+세부)을 함께 넘겼으면 그쪽을 쓰고,
    // 이름만 넘겼으면 그 이름으로 항목을 다시 만든다 (확실하지 않은 것은 기타로 간다)
    merged.categories = categories;
    if (data.categoryItems != null) merged.categoryItems = data.categoryItems;
    else if (data.categories != null) delete merged.categoryItems;
    merged.patentNumbers = patentNumbers;
    if (data.patentItems != null) merged.patentItems = data.patentItems;
    else if (data.patentNumbers != null || data.thirdPatentNumbers != null) {
      delete merged.patentItems;                 // 번호로 다시 구성한다
      merged.patentNumbers = patentNumbers;
      if (data.thirdPatentNumbers != null) merged.thirdPatentNumbers = data.thirdPatentNumbers;
    }
    if (data.noticeMultiFlag != null) merged.noticeMultiFlag = data.noticeMultiFlag;
    if (data.patentNames != null) merged.patentNames = toList(data.patentNames);
    if (data.quality != null) merged.quality = String(data.quality).trim();
    if (data.remark != null) merged.remark = String(data.remark).trim();
    merged.agreementNo = agreementNo;      // 협약서 발행번호 (핵심 처리 기준)

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
    var incoming = changes || {};
    Object.keys(incoming).forEach(function (k) {
      if (k === "id" || k === "createdAt" || k === "history") return;   // 보존 항목
      draft[k] = incoming[k];
    });

    // 특허 항목 없이 번호만 넘겼다면 그 번호로 항목을 다시 만든다
    if (incoming.patentItems == null &&
        (incoming.patentNumbers != null || incoming.thirdPatentNumbers != null)) {
      delete draft.patentItems;
    }

    // 공종도 마찬가지. 대분류 없이 이름만 넘겼다면 그 이름으로 항목을 다시 만든다
    // (확실하지 않은 것은 임의로 옮기지 않고 기타로 간다)
    if (incoming.categoryItems == null && incoming.categories != null) {
      delete draft.categoryItems;
    }

    /* ---- 협약서 발행번호 ---- */
    if (incoming.agreementNo != null) {
      var hadNo = hasAgreement(before);
      var hasNo = String(incoming.agreementNo).trim() !== "";

      // 번호가 새로 들어오면 그 행을 낙찰로 바꾼다 (새 행을 만들지 않는다)
      if (!hadNo && hasNo && AGREEMENT_PROMOTES.indexOf(draft.status) >= 0) {
        draft.status = "낙찰";
        draft.resultEnteredAt = nowStamp();
      }

      // 번호를 지웠을 때는 과거 번호를 되살리지 않는다.
      // 상태를 공고로 되돌릴지는 쓰는 사람에게 물어본다.
      if (hadNo && !hasNo && before.status === "낙찰") {
        if (incoming.agreementCleared == null) {
          return {
            ok: false,
            needsConfirm: true,
            reason: "agreementCleared",
            message: AGREEMENT_CLEARED_MESSAGE
          };
        }
        if (incoming.agreementCleared === "notice") draft.status = "공고";
      }
    }
    delete draft.agreementCleared;

    var after = normalize(draft);
    after.id = before.id;
    after.createdAt = before.createdAt;
    after.updatedAt = nowStamp();
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

  /* ------------------------------------------- 다특허 · 특허 구분 */

  var BADGE_COLORS = {
    pour: "파란색",       // POUR 특허만 여러 개
    mixed: "보라색",      // POUR와 타사 혼합
    third: "회색",        // 타사 특허만 여러 개
    unknown: "주황색"     // 번호 미확인 다특허
  };

  /**
   * 한 현장의 특허 구성을 계산한다. 다특허 여부는 개수로 자동 판단한다.
   * (사용자가 매번 직접 입력하지 않는다)
   */
  function patentStats(record, patentStorage) {
    var items = (record && record.patentItems) || [];
    var pour = items.filter(function (it) { return it.kind === POUR; });
    var third = items.filter(function (it) { return it.kind === THIRD; });
    var total = pour.length + third.length;
    var noticeMulti = !!(record && record.noticeMultiFlag);
    var isMulti = total >= 2;

    var badge = "unknown";
    if (isMulti) {
      if (pour.length && third.length) badge = "mixed";
      else if (pour.length) badge = "pour";
      else badge = "third";
    } else if (noticeMulti) badge = "unknown";

    // 확인 상태
    var status;
    var unverified = pour.filter(function (it) { return !PourPatents.find(it.number, patentStorage); });
    if (noticeMulti && total < 2) status = "다특허 번호 확인 필요";
    else if (!pour.length) status = "POUR 특허번호 미기재";
    else if (unverified.length && !(record && record.patentConfirmed)) status = "POUR 특허 검토 필요";
    else status = "확정";

    var label;
    if (isMulti) label = "다특허 · 총 " + total + "개";
    else if (noticeMulti) label = "다특허 번호 확인 필요";
    else if (total === 1) label = "단일특허";
    else label = "";

    return {
      pourCount: pour.length,
      thirdCount: third.length,
      totalCount: total,
      isMulti: isMulti,
      noticeMultiFlag: noticeMulti,
      badge: badge,
      badgeColor: BADGE_COLORS[badge],
      label: label,
      detail: "POUR " + pour.length + "개 · 타사 " + third.length + "개",
      status: status,
      unverified: unverified.map(function (it) { return it.number; })
    };
  }

  /** POUR 특허와 타사 특허에 같은 번호가 들어갔는지 확인한다. */
  function conflictingPatents(record) {
    var items = (record && record.patentItems) || [];
    var pour = {}, clash = [];
    items.forEach(function (it) { if (it.kind === POUR) pour[it.number] = true; });
    items.forEach(function (it) {
      if (it.kind === THIRD && pour[it.number]) clash.push(it.number);
    });
    return clash;
  }

  var CONFLICT_MESSAGE =
    "동일한 특허번호가 POUR 특허와 타사 특허에 모두 등록되어 있습니다. 특허 구분을 확인해 주세요.";

  /* --------------------------------------------- 알림 묶음 */

  /**
   * 상단 알림 묶음. 타사 특허만 입력했다고 POUR 미기재 알림이 풀리지 않는다.
   * (POUR 항목만 보고 판단하기 때문)
   */
  function alerts(records, patentStorage) {
    var missing = [], multiUnknown = [], needsCheck = [];
    var needsMore = [], noAgreement = [];

    (records || []).forEach(function (rec) {
      var stats = patentStats(rec, patentStorage);
      if (rec.status === "낙찰" && !isPatentResolved(rec, patentStorage)) missing.push(rec);
      if (stats.noticeMultiFlag && stats.totalCount < 2) multiUnknown.push(rec);
      if (conflictingPatents(rec).length ||
          (stats.status === "POUR 특허 검토 필요")) needsCheck.push(rec);

      // 협약서 발행번호를 기준으로 본 처리 단계.
      // 엑셀에서 옮겨 온 행은 애초에 번호가 없으므로 미입력 알림에서 뺀다.
      var stage = agreementStage(rec);
      if (stage === "추가 입력 필요") needsMore.push(rec);
      if (stage === "협약서번호 미입력" && !isImported(rec)) noAgreement.push(rec);
    });

    var out = [];
    if (needsMore.length) {
      out.push({ key: "awardIncomplete",
                 label: "낙찰 정보 추가 입력 필요 " + needsMore.length + "건",
                 count: needsMore.length, records: needsMore });
    }
    if (noAgreement.length) {
      out.push({ key: "noAgreement",
                 label: "협약서번호 미입력 " + noAgreement.length + "건",
                 count: noAgreement.length, records: noAgreement });
    }
    if (missing.length) {
      out.push({ key: "missingPour", label: "POUR 특허번호 미기재 낙찰 " + missing.length + "건",
                 count: missing.length, records: missing });
    }
    if (multiUnknown.length) {
      out.push({ key: "multiUnknown", label: "다특허 번호 확인 필요 " + multiUnknown.length + "건",
                 count: multiUnknown.length, records: multiUnknown });
    }
    if (needsCheck.length) {
      out.push({ key: "kindCheck", label: "POUR·타사 특허 구분 확인 필요 " + needsCheck.length + "건",
                 count: needsCheck.length, records: needsCheck });
    }
    return out;
  }

  /* ------------------------------------------------ 자료 이전 */

  var MIGRATION_KEY = "pour.records.migration.v1";

  /**
   * 기존 자료를 새 특허 구조로 옮긴다. 원본을 지우지 않고 스냅샷을 남겨 되돌릴 수 있다.
   * 업로드된 POUR 특허 자료와 맞지 않는 번호는 자동 확정하지 않고 검토 대상으로 표시한다.
   */
  function migratePatentItems(storage, patentStorage) {
    var s = store(storage);
    var all = list(storage);
    var snapshot = [], moved = 0, review = [];

    all.forEach(function (rec) {
      snapshot.push({ id: rec.id, patentNumbers: rec.patentNumbers.slice(), patentNames: rec.patentNames.slice() });
      if (!rec.patentItems.length) return;
      moved += rec.patentItems.filter(function (it) { return it.kind === POUR; }).length;
      rec.patentItems.forEach(function (it) {
        if (it.kind !== POUR) return;
        if (!PourPatents.find(it.number, patentStorage)) {
          review.push({ id: rec.id, client: rec.client, number: it.number });
        }
      });
    });

    writeAll(all, storage);
    if (s) {
      try { s.setItem(MIGRATION_KEY, JSON.stringify({ at: nowStamp(), snapshot: snapshot })); } catch (e) {}
    }
    return { records: all.length, movedPourPatents: moved, needsReview: review, reversible: !!s };
  }

  /** 이전 직전 상태로 되돌린다. */
  function rollbackMigration(storage) {
    var s = store(storage);
    if (!s) return { ok: false, message: "저장소를 사용할 수 없습니다." };
    var raw = s.getItem(MIGRATION_KEY);
    if (!raw) return { ok: false, message: "되돌릴 이전 기록이 없습니다." };
    var saved = JSON.parse(raw);
    var all = list(storage);
    var byId = {};
    saved.snapshot.forEach(function (row) { byId[row.id] = row; });
    all.forEach(function (rec, i) {
      var row = byId[rec.id];
      if (!row) return;
      // 특허 항목을 지우고 원래 번호로 되돌린다 (빈 배열이 아니라 키 자체를 없앤다)
      var restored = Object.assign({}, rec, {
        patentNumbers: row.patentNumbers, patentNames: row.patentNames
      });
      delete restored.patentItems;
      all[i] = normalize(restored);
    });
    writeAll(all, storage);
    return { ok: true, restored: saved.snapshot.length, at: saved.at };
  }

  function missingPatentMessage(count) {
    return "⚠ 특허번호 미기재 " + count + "건 — 확인이 필요한 낙찰 현장이 있습니다.";
  }

  /* --------------------------------------------------------- 재공고 */

  /**
   * 재공고를 만든다. 원본 공고는 지우지 않고 유찰로 두고, 재공고는 별도 행으로 만들어 연결한다.
   * 차수는 같은 원본에 딸린 재공고 수로 자동 계산한다.
   */
  function createRebid(originalId, changes, storage) {
    var all = list(storage);
    var origin = null;
    for (var i = 0; i < all.length; i++) { if (all[i].id === originalId) { origin = all[i]; break; } }
    if (!origin) return { ok: false, message: "원본 공고를 찾지 못했습니다." };

    // 원본을 따라 올라가 최초 공고를 찾는다 (재공고의 재공고도 같은 원본에 묶인다)
    var rootId = origin.originalProjectId || origin.id;
    var round = 1;
    all.forEach(function (rec) {
      if (rec.originalProjectId === rootId && rec.rebidRound) {
        round = Math.max(round, Number(rec.rebidRound) + 1);
      }
    });

    var draft = {};
    // 단지명·공사명·공종·지역·도시·전화번호·세대수·특허·공사범위를 가져온다 (수정 가능)
    ["client", "projectNames", "categories", "region", "city", "phone", "households",
     "patentItems", "noticeMultiFlag", "noticePatentText", "scopes", "address",
     "agreementNo", "quality"].forEach(function (key) { draft[key] = origin[key]; });

    Object.keys(changes || {}).forEach(function (key) { draft[key] = changes[key]; });

    draft.id = createId();
    draft.status = "재공고";
    draft.isRebid = true;
    draft.rebidRound = round;
    draft.originalProjectId = rootId;
    draft.previousProjectId = origin.id;
    draft.previousFailDate = String((changes || {}).previousFailDate || origin.bidDate || "").trim();
    draft.contractor = "";
    draft.contractorPhone = "";
    draft.awardDate = "";
    draft.awardAmount = "";

    var rebid = normalize(draft);
    all.push(rebid);

    // 원본은 유찰로 남긴다 (이미 다른 상태면 건드리지 않는다)
    for (var j = 0; j < all.length; j++) {
      if (all[j].id !== origin.id) continue;
      if (all[j].status === "공고" || all[j].status === "재공고") {
        var before = JSON.parse(JSON.stringify(all[j]));
        all[j].status = "유찰";
        all[j].history = before.history.concat(buildHistory(before, all[j], "재공고 등록으로 유찰 처리"));
      }
    }

    writeAll(all, storage);
    return { ok: true, record: rebid, round: round, originalId: rootId };
  }

  /** 상태 필터 탭에 표시할 건수. */
  function statusCounts(records) {
    var all = records || [];
    var count = function (fn) { return all.filter(fn).length; };
    return {
      "전체": all.length,
      "낙찰": count(function (r) { return r.status === "낙찰"; }),
      "공고": count(function (r) { return r.status === "공고"; }),
      "재공고(유찰)": count(function (r) { return r.status === "재공고" || r.status === "유찰"; })
    };
  }

  function matchesStatusTab(record, tab) {
    if (!tab || tab === "전체") return true;
    if (tab === "재공고(유찰)") return record.status === "재공고" || record.status === "유찰";
    return record.status === tab;
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

  /**
   * 숫자만 입력했을 때 보기 좋게 하이픈을 넣어 준다. 저장된 원문은 바꾸지 않는다.
   * 02-1234-5678 / 031-123-4567 / 010-1234-5678 / 1588-0000 형태를 지원한다.
   */
  function formatPhone(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw || /[^0-9]/.test(raw)) return raw;      // 이미 하이픈 등이 있으면 그대로 둔다
    var d = raw;
    if (/^02/.test(d)) {
      if (d.length === 9) return d.slice(0, 2) + "-" + d.slice(2, 5) + "-" + d.slice(5);
      if (d.length === 10) return d.slice(0, 2) + "-" + d.slice(2, 6) + "-" + d.slice(6);
    }
    if (/^1[5-9]\d{2}/.test(d) && d.length === 8) return d.slice(0, 4) + "-" + d.slice(4);
    if (d.length === 10) return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
    if (d.length === 11) return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
    return raw;
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
        var y = rec.year || String(rec.noticeDate || rec.awardDate || "").slice(0, 4);
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
    BID_TYPES: BID_TYPES,
    BID_TYPE_UNKNOWN: BID_TYPE_UNKNOWN,
    normalizeBidType: normalizeBidType,
    validateDates: validateDates,
    QUALITY_OPTIONS: QUALITY_OPTIONS,
    AGREEMENT_PROMOTES: AGREEMENT_PROMOTES,
    AWARD_REQUIRED: AWARD_REQUIRED,
    IMPORT_SOURCE: IMPORT_SOURCE,
    isImported: isImported,
    hasAgreement: hasAgreement,
    missingAwardFields: missingAwardFields,
    agreementStage: agreementStage,
    AGREEMENT_CLEARED_MESSAGE: AGREEMENT_CLEARED_MESSAGE,
    COLUMNS: COLUMNS,
    MAIN_COLUMNS: MAIN_COLUMNS,
    PATENT_TAB_COLUMNS: PATENT_TAB_COLUMNS,
    normalize: normalize,
    createId: createId,
    displayValue: displayValue,
    exportValue: exportValue,
    usePatentStorage: usePatentStorage,
    list: list,
    save: save,
    saveMany: saveMany,
    award: award,
    patentTabs: patentTabs,
    createRebid: createRebid,
    statusCounts: statusCounts,
    matchesStatusTab: matchesStatusTab,
    recordsForPatent: recordsForPatent,
    summarize: summarize,
    summaryText: summaryText,
    formatAmountShort: formatAmountShort,
    formatPhone: formatPhone,
    applyFilters: applyFilters,
    sortRecords: sortRecords,
    update: update,
    buildHistory: buildHistory,
    isPatentResolved: isPatentResolved,
    missingPatentRecords: missingPatentRecords,
    missingPatentMessage: missingPatentMessage,
    POUR: POUR,
    THIRD_PARTY: THIRD,
    normalizePatentItem: normalizePatentItem,
    patentStats: patentStats,
    conflictingPatents: conflictingPatents,
    CONFLICT_MESSAGE: CONFLICT_MESSAGE,
    alerts: alerts,
    migratePatentItems: migratePatentItems,
    rollbackMigration: rollbackMigration,
    FIELD_LABELS: FIELD_LABELS,
    clear: function (storage) { writeAll([], storage); }
  };
});
