/* POUR 공사실적 관리 — 화면 동작 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  /**
   * 자료 저장소.
   * 운영에서는 localStorage 를 쓰지 않는다. window.POUR_API_BASE 를 지정하면
   * 그 주소의 API(D1)를 바라보고, 지정하지 않으면 화면 확인용 브라우저 저장소를 쓴다.
   *
   *   <script>window.POUR_API_BASE = "/api";</script>
   */
  var usingApi = !!window.POUR_API_BASE;
  var storage = usingApi
    ? PourStore.createApiStore({ baseUrl: window.POUR_API_BASE })
    : PourStore.createLocalStore();
  PourRecords.usePatentStorage(storage);

  var state = { view: "records", statusTab: "전체", search: "", editingId: null, awardingId: null };

  /* ----------------------------------------------------------- 메뉴 */

  function showView(name) {
    state.view = name;
    Array.prototype.forEach.call(document.querySelectorAll(".view"), function (v) {
      v.classList.toggle("is-active", v.id === "view-" + name);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".nav-item"), function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-view") === name);
    });
    $("appNav").classList.remove("is-open");
    if (name === "patents") renderPatentView();
    if (name === "stats") renderStats();
    if (name === "settings") renderPatentList();
  }

  Array.prototype.forEach.call(document.querySelectorAll(".nav-item"), function (b) {
    b.addEventListener("click", function () { showView(b.getAttribute("data-view")); });
  });
  $("navToggle").addEventListener("click", function () { $("appNav").classList.toggle("is-open"); });

  /* -------------------------------------------------- 목록(엑셀형 표) */

  var SEARCH_KEYS = ["client", "region", "city", "phone", "contractor", "contractorPhone", "remark"];

  function matchesSearch(rec, query) {
    if (!query) return true;
    var text = SEARCH_KEYS.map(function (k) { return rec[k]; })
      .concat(rec.projectNames || [], rec.categories || [], rec.patentNames || [],
              (rec.patentNumbers || []).map(PourPatents.formatNumber),
              (rec.thirdPatentNumbers || []).map(PourPatents.formatNumber),
              (rec.patentItems || []).map(function (i) { return i.name + " " + i.company; }))
      .join(" ").toUpperCase();
    return text.indexOf(query.toUpperCase()) >= 0;
  }

  var alertFilterIds = null;   // 알림을 눌렀을 때 그 자료만 보여주기 위한 목록

  function currentRecords() {
    return PourRecords.list(storage).filter(function (rec) {
      if (alertFilterIds && alertFilterIds.indexOf(rec.id) < 0) return false;
      return PourRecords.matchesStatusTab(rec, state.statusTab) && matchesSearch(rec, state.search);
    });
  }

  var grid = PourGrid.create($("recordsGrid"), {
    columns: PourRecords.MAIN_COLUMNS,
    getRecords: currentRecords,
    emptyText: "등록된 공고·실적이 없습니다. 「＋ 새 공고」로 등록해 주세요.",
    onSelect: function (rec) { syncRowButtons(rec); },
    onOpen: function (rec) { openNotice(rec.id); }
  });

  function syncRowButtons(rec) {
    $("btnDetail").disabled = !rec;
    $("btnToAward").disabled = !rec || (rec.status !== "공고" && rec.status !== "재공고");
  }

  $("btnDetail").addEventListener("click", function () {
    var rec = grid.getSelected();
    if (rec) openNotice(rec.id);
  });
  $("btnToAward").addEventListener("click", function () {
    var rec = grid.getSelected();
    if (rec) openAward(rec.id);
  });

  $("gridSearch").addEventListener("input", function () {
    state.search = this.value.trim();
    alertFilterIds = null;
    refresh();
  });
  $("globalSearch").addEventListener("input", function () {
    state.search = this.value.trim();
    $("gridSearch").value = state.search;
    if (state.view !== "records") showView("records");
    refresh();
  });
  $("btnFilterRow").addEventListener("click", function () {
    this.classList.toggle("is-active", grid.toggleFilterRow());
  });
  $("btnClearFilter").addEventListener("click", function () { grid.clearFilters(); updateCount(); });
  $("btnSortReset").addEventListener("click", function () { grid.setSort(null); updateCount(); });
  $("btnRefresh").addEventListener("click", function () { refresh(); });
  $("btnPatentData").addEventListener("click", function () { showView("settings"); });
  $("btnStats").addEventListener("click", function () { showView("stats"); });
  $("btnImport").addEventListener("click", function () { showView("io"); });
  $("btnExport").addEventListener("click", function () { showView("io"); });
  $("btnReport").addEventListener("click", function () {
    var rows = grid.getVisible();
    $("exportMsg").textContent = "현재 화면 기준 보고서 대상 " + rows.length + "건입니다. 아래에서 내보낼 범위를 골라 주세요.";
    $("exportMsg").className = "form-msg ok";
    showView("io");
  });

  function updateCount() {
    $("gridCount").textContent = grid.getVisible().length.toLocaleString("ko-KR") + "건 표시";
  }

  /* -------------------------------------------------------- 상태 탭 */

  function renderStatusTabs() {
    var counts = PourRecords.statusCounts(PourRecords.list(storage));
    var box = $("statusTabs");
    box.innerHTML = "";
    ["전체", "낙찰", "공고", "재공고(유찰)"].forEach(function (name) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "status-tab" + (state.statusTab === name ? " is-active" : "");
      b.setAttribute("data-status-tab", name);
      b.innerHTML = name + ' <span class="cnt">' + counts[name].toLocaleString("ko-KR") + "</span>";
      b.addEventListener("click", function () {
        state.statusTab = name;
        alertFilterIds = null;
        refresh();
      });
      box.appendChild(b);
    });
  }

  /* ---------------------------------------------------------- 알림 */

  function renderAlerts() {
    var groups = PourRecords.alerts(PourRecords.list(storage), storage);
    var bar = $("alertBar");
    bar.innerHTML = "";
    groups.forEach(function (g) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "alert-chip";
      chip.id = "alert-" + g.key;
      chip.textContent = "⚠ " + g.label;
      chip.addEventListener("click", function () {
        // 해당 자료만 보이도록 목록을 걸러 준다
        state.statusTab = "전체";
        state.search = "";
        $("gridSearch").value = "";
        alertFilterIds = g.records.map(function (r) { return r.id; });
        refresh();
        $("gridCount").textContent = g.label + " — " + alertFilterIds.length + "건만 표시 중";
      });
      bar.appendChild(chip);
    });
    if (alertFilterIds && !groups.length) alertFilterIds = null;

  }

  /* -------------------------------------------------- 공고 입력 패널 */

  var regionField, patentEditor, bidType = "", rebidSource = null;

  function setRegionOptions(regions, selected) {
    var select = $("fRegion");
    select.innerHTML = "";
    if (!regions.length) { select.appendChild(new Option("—", "")); return; }
    regions.forEach(function (r) { select.appendChild(new Option(r, r)); });
    select.value = selected && regions.indexOf(selected) >= 0 ? selected : regions[0];
  }

  regionField = PourUI.attachRegionInput($("fCity"), {
    onChange: function (value) {
      if (value) setRegionOptions([value.region], value.region);
      else if (!$("fCity").value.trim()) setRegionOptions([]);
    },
    onAmbiguous: function (candidates) {
      var regions = [];
      candidates.forEach(function (c) { if (regions.indexOf(c.region) < 0) regions.push(c.region); });
      setRegionOptions(regions, $("fRegion").value);
    }
  });

  patentEditor = PourPatentEditor.create($("patentEditor"), {
    storage: storage, categoryInput: $("fCategories")
  });

  PourRecords.STATUSES.forEach(function (s) { $("fStatus").appendChild(new Option(s, s)); });
  PourRecords.QUALITY_OPTIONS.forEach(function (q) { $("qualityList").appendChild(new Option(q, q)); });
  ["전체"].concat(PourRecords.STATUSES).forEach(function (s) {
    $("patentStatusFilter").appendChild(new Option(s, s));
  });

  Array.prototype.forEach.call(document.querySelectorAll("#bidGroup .bid-btn"), function (btn) {
    btn.addEventListener("click", function () {
      bidType = bidType === btn.getAttribute("data-bid") ? "" : btn.getAttribute("data-bid");
      Array.prototype.forEach.call(document.querySelectorAll("#bidGroup .bid-btn"), function (b) {
        b.classList.toggle("is-active", b.getAttribute("data-bid") === bidType);
      });
    });
  });

  function openPanel(panelId, backId) {
    $(backId).classList.add("is-open");
    $(panelId).classList.add("is-open");
    $(panelId).setAttribute("aria-hidden", "false");
  }
  function closePanel(panelId, backId) {
    $(backId).classList.remove("is-open");
    $(panelId).classList.remove("is-open");
    $(panelId).setAttribute("aria-hidden", "true");
  }

  function clearNoticeForm() {
    ["fClient", "fProjects", "fCategories", "fCity", "fPhone", "fHouseholds", "fNoticeDate",
     "fDueDate", "fBidDate", "fNoticePatent", "fAgreement", "fQuality", "fScopes",
     "fAddress", "fRemark", "fContractor", "rebidSearch", "rebidRound", "rebidReason",
     "previousFailDate"].forEach(function (id) { $(id).value = ""; });
    $("fStatus").value = "공고";
    $("isRebid").checked = false;
    $("rebidBox").style.display = "none";
    rebidSource = null;
    bidType = "";
    Array.prototype.forEach.call(document.querySelectorAll("#bidGroup .bid-btn"), function (b) {
      b.classList.remove("is-active");
    });
    setRegionOptions([]);
    regionField.clear();
    patentEditor.clear();
    $("editHistory").innerHTML = "";
    $("panelMsg").textContent = "";
  }

  function openNotice(id) {
    clearNoticeForm();
    state.editingId = id || null;

    // 새 공고에서는 상태·시공사·공사 품질·비고·특허·협약 정보를 감춘다.
    // (자료와 목록 열은 그대로 두고 입력 화면에서만 감추는 것이다)
    $("noticePanel").classList.toggle("is-edit", !!id);

    if (!id) {
      $("panelTitle").textContent = "새 공고 등록";
      $("panelSave").textContent = "공고 등록";
      $("isRebid").parentNode.style.display = "";
      $("fStatus").value = "공고";              // 화면에서 고르지 않고 언제나 공고로 저장
    } else {
      var rec = PourRecords.list(storage).filter(function (r) { return r.id === id; })[0];
      if (!rec) return;
      $("panelTitle").textContent = "자료 수정 — " + (rec.client || "이름 없음");
      $("panelSave").textContent = "수정 저장";
      $("isRebid").parentNode.style.display = "none";

      $("fClient").value = rec.client;
      $("fProjects").value = rec.projectNames.join("\n");
      $("fCategories").value = rec.categories.join(", ");
      $("fCity").value = rec.city;
      setRegionOptions([rec.region].filter(Boolean), rec.region);
      regionField.setValue(rec.region, rec.city);
      $("fPhone").value = rec.phone;
      $("fHouseholds").value = rec.households === "" ? "" : String(rec.households);
      $("fNoticeDate").value = rec.noticeDate;
      $("fDueDate").value = rec.documentDueDate;
      $("fBidDate").value = rec.bidDate;
      $("fNoticePatent").value = rec.noticePatentText;
      $("fAgreement").value = rec.agreementNo;
      $("fQuality").value = rec.quality;
      $("fScopes").value = (rec.scopes || []).join("\n");
      $("fAddress").value = rec.address;
      $("fRemark").value = rec.remark;
      $("fContractor").value = rec.contractor;
      $("fStatus").value = rec.status;
      bidType = rec.bidType;
      Array.prototype.forEach.call(document.querySelectorAll("#bidGroup .bid-btn"), function (b) {
        b.classList.toggle("is-active", b.getAttribute("data-bid") === bidType);
      });
      patentEditor.setValue(rec);

      $("editHistory").innerHTML = rec.history.length
        ? "<b>수정 이력</b>" + rec.history.map(function (h) {
            return "<div>" + h.at + " · " + h.action + " (" + h.statusBefore + " → " + h.statusAfter + ")</div>";
          }).join("")
        : "";
    }
    openPanel("noticePanel", "panelBack");
  }

  $("btnNewNotice").addEventListener("click", function () { openNotice(null); });
  $("panelClose").addEventListener("click", function () { closePanel("noticePanel", "panelBack"); });
  $("panelCancel").addEventListener("click", function () { closePanel("noticePanel", "panelBack"); });
  $("panelBack").addEventListener("click", function () { closePanel("noticePanel", "panelBack"); });

  /* 재공고 */
  $("isRebid").addEventListener("change", function () {
    $("rebidBox").style.display = this.checked ? "" : "none";
    if (this.checked) refreshRebidOptions();
    else { rebidSource = null; $("rebidRound").value = ""; }
  });
  $("rebidSearch").addEventListener("input", refreshRebidOptions);

  function refreshRebidOptions() {
    var q = $("rebidSearch").value.trim().toUpperCase();
    var select = $("rebidTarget");
    select.innerHTML = "";
    select.appendChild(new Option("— 선택 —", ""));
    PourRecords.list(storage).filter(function (r) {
      if (["공고", "재공고", "유찰"].indexOf(r.status) < 0) return false;
      if (!q) return true;
      return [r.client, r.city, r.region].concat(r.projectNames || [])
        .join(" ").toUpperCase().indexOf(q) >= 0;
    }).forEach(function (r) {
      select.appendChild(new Option(
        (r.client || "이름 없음") + " / " + PourRegion.format(r.region, r.city) + " / " + r.status, r.id));
    });
  }

  $("rebidTarget").addEventListener("change", function () {
    rebidSource = this.value || null;
    if (!rebidSource) { $("rebidRound").value = ""; return; }
    var origin = PourRecords.list(storage).filter(function (r) { return r.id === rebidSource; })[0];
    if (!origin) return;
    $("fClient").value = origin.client;
    $("fProjects").value = origin.projectNames.join("\n");
    $("fCategories").value = origin.categories.join(", ");
    $("fCity").value = origin.city;
    setRegionOptions([origin.region].filter(Boolean), origin.region);
    regionField.setValue(origin.region, origin.city);
    $("fPhone").value = origin.phone;
    $("fHouseholds").value = origin.households === "" ? "" : String(origin.households);
    $("fScopes").value = (origin.scopes || []).join("\n");
    $("fNoticePatent").value = origin.noticePatentText;
    $("previousFailDate").value = origin.bidDate || "";
    patentEditor.setValue(origin);

    var rootId = origin.originalProjectId || origin.id;
    var round = 1;
    PourRecords.list(storage).forEach(function (r) {
      if (r.originalProjectId === rootId && r.rebidRound) round = Math.max(round, Number(r.rebidRound) + 1);
    });
    $("rebidRound").value = round + "차";
  });

  function readNoticeForm() {
    var resolved = regionField.getValue();
    var patents = patentEditor.getValue();
    return {
      region: $("fRegion").value || (resolved ? resolved.region : ""),
      city: resolved ? resolved.city : $("fCity").value.trim(),
      client: $("fClient").value.trim(),
      projectNames: $("fProjects").value,
      categories: $("fCategories").value,
      phone: $("fPhone").value.trim(),
      households: $("fHouseholds").value,
      noticeDate: $("fNoticeDate").value,
      documentDueDate: $("fDueDate").value,
      bidDate: $("fBidDate").value,
      bidType: bidType,
      noticePatentText: $("fNoticePatent").value.trim(),
      agreementNo: $("fAgreement").value.trim(),
      quality: $("fQuality").value.trim(),
      scopes: $("fScopes").value,
      address: $("fAddress").value.trim(),
      remark: $("fRemark").value.trim(),
      contractor: $("fContractor").value.trim(),
      // 새 공고는 화면에서 상태를 고르지 않는다. 수정할 때만 고른 값을 쓴다.
      status: state.editingId ? $("fStatus").value : "공고",
      patentItems: patents.patentItems,
      noticeMultiFlag: patents.noticeMultiFlag
    };
  }

  $("panelSave").addEventListener("click", function () {
    var data = readNoticeForm();
    var msg = $("panelMsg");
    msg.className = "form-msg error";

    if (!data.city) { msg.textContent = "도시를 입력해 주세요."; return; }
    if (!data.noticeDate) { msg.textContent = "공고일을 입력해 주세요."; return; }
    var dates = PourRecords.validateDates(data);
    if (!dates.ok) {
      msg.textContent = dates.errors.map(function (e) { return e.message; }).join("\n");
      return;
    }

    if (state.editingId) {
      var updated = PourRecords.update(state.editingId, data, storage);
      if (!updated.ok) { msg.textContent = updated.message; return; }
    } else if ($("isRebid").checked) {
      if (!rebidSource) { msg.textContent = "재공고할 기존 공고를 선택해 주세요."; return; }
      data.rebidReason = $("rebidReason").value.trim();
      data.previousFailDate = $("previousFailDate").value;
      var rebid = PourRecords.createRebid(rebidSource, data, storage);
      if (!rebid.ok) { msg.textContent = rebid.message; return; }
    } else {
      PourRecords.save(data, storage);
    }

    closePanel("noticePanel", "panelBack");
    alertFilterIds = null;
    refresh();
  });

  /* ------------------------------------------------ 낙찰 상세정보 */

  var AWARD_CONTRACTOR_FIELDS = [
    { key: "contractor", label: "시공사명", required: true },
    { key: "contractorPhone", label: "시공사 전화번호", required: true, phone: true },
    { key: "contractorContactName", label: "담당자명" },
    { key: "contractorMobile", label: "담당자 휴대전화", phone: true },
    { key: "contractorAddress", label: "시공사 주소" },
    { key: "contractorBusinessNo", label: "사업자등록번호" },
    { key: "contractorNote", label: "시공사 비고" }
  ];
  var AWARD_INFO_FIELDS = [
    { key: "awardDate", label: "낙찰일", required: true, type: "date" },
    { key: "awardAmount", label: "낙찰금액", required: true, money: true },
    { key: "categories", label: "최종 공종", required: true },
    { key: "status", label: "낙찰 결과 상태", type: "select", options: PourRecords.STATUSES },
    { key: "scopes", label: "최종 공사범위" },
    { key: "quality", label: "공사 품질", datalist: "qualityList" },
    { key: "remark", label: "낙찰 비고" }
  ];
  var awardPatentEditor = null;

  function buildAwardFields(container, fields, record) {
    container.innerHTML = "";
    fields.forEach(function (f) {
      var wrap = document.createElement("div");
      var label = document.createElement("label");
      label.textContent = f.label;
      if (f.required) {
        var star = document.createElement("span");
        star.className = "req";
        star.textContent = " *";
        label.appendChild(star);
      }
      wrap.appendChild(label);

      var input;
      if (f.type === "select") {
        input = document.createElement("select");
        f.options.forEach(function (o) { input.appendChild(new Option(o, o)); });
      } else {
        input = document.createElement("input");
        input.type = f.type || "text";
        if (f.datalist) input.setAttribute("list", f.datalist);
      }
      input.id = "aw-" + f.key;
      var value = record[f.key];
      if (Array.isArray(value)) value = value.join(", ");
      input.value = f.key === "status" ? "낙찰" : (value == null ? "" : value);

      if (f.phone) {
        input.addEventListener("blur", function () { input.value = PourRecords.formatPhone(input.value); });
      }
      if (f.money) {
        input.addEventListener("blur", function () {
          var n = Number(String(input.value).replace(/[^0-9.-]/g, ""));
          if (isFinite(n) && input.value.trim()) input.value = n.toLocaleString("ko-KR");
        });
      }
      wrap.appendChild(input);
      var err = document.createElement("span");
      err.className = "field-error";
      err.id = "aw-error-" + f.key;
      err.style.display = "none";
      wrap.appendChild(err);
      container.appendChild(wrap);
    });
  }

  function openAward(id) {
    var rec = PourRecords.list(storage).filter(function (r) { return r.id === id; })[0];
    if (!rec) return;
    state.awardingId = id;

    $("awardSummary").innerHTML =
      "<strong>" + (rec.client || "이름 없음") + "</strong><br>" +
      "공사명: " + (rec.projectNames.join(" / ") || "—") + "<br>" +
      "지역·도시: " + (PourRegion.format(rec.region, rec.city) || "—") + "<br>" +
      "공고일 " + (rec.noticeDate || "—") + " · 서류 마감일 " + (rec.documentDueDate || "—") +
      " · 개찰일 " + (rec.bidDate || "—") + "<br>" +
      "공고문 특허·공법: " + (rec.noticePatentText || "—") + "<br>" +
      "현재 상태: " + rec.status + (rec.rebidRound ? " (재공고 " + rec.rebidRound + "차)" : "");

    buildAwardFields($("awardContractorFields"), AWARD_CONTRACTOR_FIELDS, rec);
    buildAwardFields($("awardInfoFields"), AWARD_INFO_FIELDS, rec);

    $("awardPatentEditor").innerHTML = "";
    awardPatentEditor = PourPatentEditor.create($("awardPatentEditor"), {
      storage: storage, categoryInput: $("aw-categories")
    });
    awardPatentEditor.setValue(rec);
    if (rec.categories.length) $("aw-categories").value = rec.categories.join(", ");

    $("awardMsg").textContent = "";
    $("awardSave").disabled = false;
    openPanel("awardPanel", "awardBack");
  }

  function closeAward() {
    closePanel("awardPanel", "awardBack");
    state.awardingId = null;
  }
  $("awardClose").addEventListener("click", closeAward);
  $("awardCancel").addEventListener("click", closeAward);
  $("awardBack").addEventListener("click", closeAward);

  $("awardSave").addEventListener("click", function () {
    if (!state.awardingId) return;
    AWARD_CONTRACTOR_FIELDS.concat(AWARD_INFO_FIELDS).forEach(function (f) {
      var box = $("aw-error-" + f.key);
      if (box) { box.textContent = ""; box.style.display = "none"; }
    });

    var payload = { confirmedWithoutPatent: false };
    AWARD_CONTRACTOR_FIELDS.concat(AWARD_INFO_FIELDS).forEach(function (f) {
      payload[f.key] = $("aw-" + f.key).value;
    });
    var patents = awardPatentEditor.getValue();
    payload.patentItems = patents.patentItems;
    payload.noticeMultiFlag = patents.noticeMultiFlag;

    $("awardSave").disabled = true;
    var result = PourRecords.award(state.awardingId, payload, storage);

    if (!result.ok && result.needsConfirm) {
      if (window.confirm(result.message)) {
        payload.confirmedWithoutPatent = true;
        result = PourRecords.award(state.awardingId, payload, storage);
      } else {
        $("awardMsg").textContent = "낙찰 저장을 취소했습니다.";
        $("awardMsg").className = "form-msg";
        $("awardSave").disabled = false;
        return;
      }
    }
    if (!result.ok) {
      Object.keys(result.fields || {}).forEach(function (key) {
        var box = $("aw-error-" + key);
        if (box) { box.textContent = result.fields[key]; box.style.display = ""; }
      });
      $("awardMsg").textContent = result.message;
      $("awardMsg").className = "form-msg error";
      $("awardSave").disabled = false;
      return;
    }
    closeAward();
    alertFilterIds = null;
    refresh();
  });

  /* ------------------------------------------------ 가져오기 미리보기 */

  function rowsFromCsv(text) {
    var rows = [], row = [], cell = "", quoted = false;
    text = String(text).replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function rowsFromWorkbook(buffer) {
    if (!window.ExcelJS) return Promise.reject(new Error("엑셀 라이브러리를 불러오지 못했습니다. CSV로 올려주세요."));
    var wb = new ExcelJS.Workbook();
    return wb.xlsx.load(buffer).then(function () {
      var sheet = wb.worksheets[0], rows = [];
      sheet.eachRow(function (row) {
        var values = [];
        row.eachCell({ includeEmpty: true }, function (cell) {
          var v = cell.value;
          if (v && typeof v === "object") v = v.text != null ? v.text : (v.result != null ? v.result : "");
          values.push(v == null ? "" : String(v));
        });
        rows.push(values);
      });
      return rows;
    });
  }

  function showPreview(rows) {
    var box = $("importPreview");
    var parsed = PourPatents.parseRows(rows);
    if (!parsed.ok) {
      box.innerHTML = '<div class="form-msg error">' + parsed.message.replace(/\n/g, "<br>") + "</div>";
      return;
    }
    var existing = {};
    PourPatents.list(storage).forEach(function (r) { existing[r.number] = true; });
    var fresh = parsed.records.filter(function (r) { return !existing[r.number]; }).length;
    var update = parsed.records.length - fresh;

    box.innerHTML =
      '<div class="preview-stats">' +
        "<div><b>" + fresh + "건</b>새로 등록될 행</div>" +
        "<div><b>" + update + "건</b>갱신될 행</div>" +
        "<div><b>" + parsed.duplicated + "건</b>중복 행</div>" +
        "<div><b>" + parsed.errors.length + "건</b>오류 행</div>" +
      "</div>" +
      (parsed.errors.length
        ? '<ul class="preview-errors">' + parsed.errors.map(function (e) {
            return "<li>" + e.row + "행 — " + e.reason + "</li>";
          }).join("") + "</ul>"
        : "") +
      '<div class="toolbar" style="margin-top:10px">' +
        '<button type="button" class="tb-btn" id="btnConfirmImport">이대로 등록하기</button>' +
      "</div>";

    $("btnConfirmImport").addEventListener("click", function () {
      var result = PourPatents.load(rows, storage);
      box.innerHTML = '<div class="form-msg ok">등록 ' + result.inserted + "건 · 갱신 " + result.updated +
        "건 · 중복 " + result.duplicated + "건 · 오류 " + result.errors.length +
        "건. 현재 등록된 POUR 특허 " + result.total + "건입니다.</div>";
      refresh();
    });
  }

  $("importFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    if (/\.csv$/i.test(file.name)) {
      reader.onload = function () { showPreview(rowsFromCsv(reader.result)); };
      reader.readAsText(file, "utf-8");
    } else {
      reader.onload = function () {
        rowsFromWorkbook(reader.result).then(showPreview).catch(function (err) {
          $("importPreview").innerHTML = '<div class="form-msg error">' + err.message + "</div>";
        });
      };
      reader.readAsArrayBuffer(file);
    }
  });

  $("btnSampleImport").addEventListener("click", function () {
    showPreview([
      ["공종", "특허번호", "특허명", "특허권자", "비고"],
      ["균열보수", "제 10-1935719호", "콘크리트 구조물의 크랙 보수를 위한 보수층", "㈜넷폼알앤디", ""],
      ["", "제 10-2784426호", "콘크리트 구조물의 벽체를 위한 재도장층", "㈜넷폼알앤디", ""],
      ["에폭시", "제 10-2425081호", "표면강화층을 포함하는 유기계 방수층", "㈜넷폼알앤디", ""],
      ["엠보라이닝", "제 10-2425081호", "표면강화층을 포함하는 유기계 방수층", "㈜넷폼알앤디", ""],
      ["아스콘 균열보수", "잘못된값", "번호 없는 행", "", ""]
    ]);
  });

  /* ------------------------------------------------------- 내보내기 */

  Array.prototype.forEach.call(document.querySelectorAll("[data-export]"), function (btn) {
    btn.addEventListener("click", function () {
      var kind = btn.getAttribute("data-export");
      var msg = $("exportMsg");
      msg.className = "form-msg ok";

      if (kind === "특허별") {
        var records = PourRecords.list(storage);
        var tabs = PourRecords.patentTabs(PourPatents.list(storage), records);
        var wb = PourExport.buildPatentWorkbook(tabs, records);
        if (!wb) { msg.textContent = "엑셀 라이브러리를 불러오지 못했습니다."; msg.className = "form-msg error"; return; }
        PourExport.downloadWorkbook(wb, "특허별-실적.xlsx");
        msg.textContent = "특허 " + tabs.length + "건을 각각 워크시트로 내보냈습니다.";
        return;
      }

      var rows;
      if (kind === "현재필터") rows = grid.getVisible();
      else if (kind === "선택") {
        var one = grid.getSelected();
        rows = one ? [one] : [];
      } else {
        rows = PourRecords.list(storage).filter(function (r) {
          return PourRecords.matchesStatusTab(r, kind);
        });
      }
      if (!rows.length) { msg.textContent = "내보낼 자료가 없습니다."; msg.className = "form-msg error"; return; }

      var book = PourExport.buildWorkbook(rows, PourRecords.MAIN_COLUMNS);
      if (!book) { msg.textContent = "엑셀 라이브러리를 불러오지 못했습니다."; msg.className = "form-msg error"; return; }
      PourExport.downloadWorkbook(book, "공사실적-" + kind + ".xlsx");
      msg.textContent = kind + " " + rows.length + "건을 내보냈습니다.";
    });
  });

  /* ---------------------------------------------------- 특허별 실적 */

  var patentView = "pour", activeSheet = null;

  Array.prototype.forEach.call(document.querySelectorAll("#patentViewTabs [data-pview]"), function (tab) {
    tab.addEventListener("click", function () {
      patentView = tab.getAttribute("data-pview");
      Array.prototype.forEach.call(document.querySelectorAll("#patentViewTabs [data-pview]"), function (t) {
        t.classList.toggle("is-active", t === tab);
      });
      renderPatentView();
    });
  });
  ["patentStatusFilter", "patentRegionFilter"].forEach(function (id) {
    $(id).addEventListener("change", renderPatentView);
  });
  $("patentKeyword").addEventListener("input", renderPatentView);

  $("btnPatentExcel").addEventListener("click", function () {
    var records = PourRecords.list(storage);
    var tabs = PourRecords.patentTabs(PourPatents.list(storage), records);
    var wb = PourExport.buildPatentWorkbook(tabs, records);
    if (!wb) return alert("엑셀 라이브러리를 불러오지 못했습니다.");
    PourExport.downloadWorkbook(wb, "특허별-실적.xlsx");
  });

  var THIRD_COLUMNS = [
    { key: "region", title: "지역", type: "text" },
    { key: "city", title: "도시", type: "text" },
    { key: "client", title: "발주처(아파트명)", type: "text" },
    { key: "projectNames", title: "공사명", type: "list" },
    { key: "status", title: "상태", type: "text" },
    { key: "thirdPatentNumbers", title: "타사 특허번호", type: "thirdNumbers" },
    { key: "__thirdNames", title: "타사 특허명·공법명", type: "thirdNames" },
    { key: "__thirdCompanies", title: "보유 회사", type: "thirdCompanies" },
    { key: "patentNumbers", title: "POUR 특허번호", type: "patent" }
  ];
  var MULTI_COLUMNS = [
    { key: "region", title: "지역", type: "text" },
    { key: "city", title: "도시", type: "text" },
    { key: "client", title: "발주처(아파트명)", type: "text" },
    { key: "projectNames", title: "공사명", type: "list" },
    { key: "status", title: "상태", type: "text" },
    { key: "__pourCount", title: "POUR 특허 개수", type: "statNumber" },
    { key: "__thirdCount", title: "타사 특허 개수", type: "statNumber" },
    { key: "__totalCount", title: "전체 특허 개수", type: "statNumber" },
    { key: "patentNumbers", title: "POUR 특허번호", type: "patent" },
    { key: "thirdPatentNumbers", title: "타사 특허번호", type: "thirdNumbers" },
    { key: "__patentStatus", title: "특허 확인 상태", type: "patentStatus" }
  ];

  var patentGrid = PourGrid.create($("patentGrid"), {
    columns: PourRecords.PATENT_TAB_COLUMNS,
    getRecords: function () { return patentRows(); },
    emptyText: "이 특허가 적용된 현장이 없습니다.",
    onOpen: function (rec) { openNotice(rec.id); }
  });
  var thirdGrid = PourGrid.create($("thirdGrid"), {
    columns: THIRD_COLUMNS,
    getRecords: function () {
      return PourRecords.list(storage).filter(function (r) { return r.thirdPatentNumbers.length; });
    },
    emptyText: "타사 특허가 입력된 현장이 없습니다.",
    onOpen: function (rec) { openNotice(rec.id); }
  });
  var multiGrid = PourGrid.create($("multiGrid"), {
    columns: MULTI_COLUMNS,
    getRecords: function () {
      return PourRecords.list(storage).filter(function (r) {
        return PourRecords.patentStats(r, storage).isMulti;
      });
    },
    emptyText: "다특허 현장이 없습니다.",
    onOpen: function (rec) { openNotice(rec.id); }
  });

  function patentRows() {
    if (!activeSheet) return [];
    var rows = PourRecords.recordsForPatent(activeSheet, PourRecords.list(storage));
    return PourRecords.applyFilters(rows, {
      status: $("patentStatusFilter").value,
      region: $("patentRegionFilter").value,
      keyword: $("patentKeyword").value.trim()
    });
  }

  function renderPatentView() {
    var isPour = patentView === "pour";
    $("sheetTabs").style.display = isPour ? "" : "none";
    $("patentSummary").style.display = isPour ? "" : "none";
    $("patentGrid").style.display = isPour ? "" : "none";
    $("thirdGrid").style.display = patentView === "third" ? "" : "none";
    $("multiGrid").style.display = patentView === "multi" ? "" : "none";

    if (patentView === "third") return thirdGrid.render();
    if (patentView === "multi") return multiGrid.render();

    var records = PourRecords.list(storage);
    var tabs = PourRecords.patentTabs(PourPatents.list(storage), records);
    if (!tabs.length) {
      $("sheetTabs").innerHTML = "";
      $("patentSummary").textContent = "등록된 특허가 없습니다. 「가져오기·내보내기」에서 POUR 특허 엑셀을 올려주세요.";
      $("patentGrid").innerHTML = "";
      return;
    }
    if (!activeSheet || !tabs.some(function (t) { return t.number === activeSheet; })) {
      activeSheet = (storage.getItem("pour.activePatentTab") &&
        tabs.some(function (t) { return t.number === storage.getItem("pour.activePatentTab"); }))
        ? storage.getItem("pour.activePatentTab") : tabs[0].number;
    }
    renderSheetTabs(tabs);

    var rows = patentRows();
    var regions = [];
    PourRecords.recordsForPatent(activeSheet, records).forEach(function (r) {
      if (r.region && regions.indexOf(r.region) < 0) regions.push(r.region);
    });
    var regionSelect = $("patentRegionFilter"), previous = regionSelect.value;
    regionSelect.innerHTML = "";
    ["전체"].concat(regions).forEach(function (r) { regionSelect.appendChild(new Option(r, r)); });
    regionSelect.value = regions.indexOf(previous) >= 0 ? previous : "전체";

    var tab = tabs.filter(function (t) { return t.number === activeSheet; })[0];
    var summary = PourRecords.summarize(rows);
    $("patentSummary").innerHTML = "<strong>" + tab.label + "</strong>" +
      (tab.name ? " · " + tab.name : "") + "<br>전체 " + summary.total + "건 · 낙찰 " + summary.awarded +
      "건 · 유찰 " + summary.failed + "건 · 총 " + summary.households.toLocaleString("ko-KR") +
      "세대 · 낙찰금액 " + PourRecords.formatAmountShort(summary.amount) +
      " · 적용 지역 " + summary.regions + "곳";

    patentGrid.render();
  }

  function renderSheetTabs(tabs) {
    var box = $("sheetTabs");
    box.innerHTML = "";
    var prev = document.createElement("button");
    prev.type = "button"; prev.className = "sheet-nav"; prev.textContent = "‹"; prev.title = "이전 탭";
    var next = document.createElement("button");
    next.type = "button"; next.className = "sheet-nav"; next.textContent = "›"; next.title = "다음 탭";
    var scroll = document.createElement("div");
    scroll.className = "sheet-scroll";
    var search = document.createElement("input");
    search.type = "search"; search.className = "sheet-search"; search.placeholder = "특허번호 검색";
    search.id = "sheetSearch";

    var visible = tabs.slice();
    function paint() {
      scroll.innerHTML = "";
      visible.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "sheet-tab" + (t.number === activeSheet ? " is-active" : "");
        b.textContent = t.label;
        b.title = t.label + (t.name ? " — " + t.name : "");
        b.setAttribute("data-number", t.number);
        b.addEventListener("click", function () {
          activeSheet = t.number;
          try { storage.setItem("pour.activePatentTab", t.number); } catch (e) {}
          renderPatentView();
        });
        scroll.appendChild(b);
      });
    }
    function move(step) {
      var i = visible.findIndex(function (t) { return t.number === activeSheet; });
      var at = Math.min(Math.max(i + step, 0), visible.length - 1);
      if (visible[at]) {
        activeSheet = visible[at].number;
        try { storage.setItem("pour.activePatentTab", activeSheet); } catch (e) {}
        renderPatentView();
      }
    }
    prev.addEventListener("click", function () { move(-1); });
    next.addEventListener("click", function () { move(1); });
    search.addEventListener("input", function () {
      var q = search.value.replace(/[^0-9]/g, "");
      visible = q ? tabs.filter(function (t) { return t.number.indexOf(q) >= 0; }) : tabs.slice();
      paint();
    });

    box.appendChild(prev);
    box.appendChild(scroll);
    box.appendChild(next);
    box.appendChild(search);
    paint();
  }

  /* --------------------------------------------------------- 통계 */

  function renderStats() {
    var records = PourRecords.list(storage);
    var counts = PourRecords.statusCounts(records);
    var awarded = records.filter(function (r) { return r.status === "낙찰"; });
    var amount = awarded.reduce(function (sum, r) {
      return sum + (r.awardAmount === "" ? 0 : Number(r.awardAmount));
    }, 0);
    var households = records.reduce(function (sum, r) {
      return sum + (r.households === "" ? 0 : Number(r.households));
    }, 0);

    $("statCards").innerHTML = [
      ["전체 현장", counts["전체"].toLocaleString("ko-KR") + "건"],
      ["낙찰", counts["낙찰"].toLocaleString("ko-KR") + "건"],
      ["공고", counts["공고"].toLocaleString("ko-KR") + "건"],
      ["재공고·유찰", counts["재공고(유찰)"].toLocaleString("ko-KR") + "건"],
      ["총 세대수", households.toLocaleString("ko-KR") + "세대"],
      ["낙찰금액 합계", PourRecords.formatAmountShort(amount)],
      ["등록 POUR 특허", PourPatents.list(storage).length + "건"]
    ].map(function (pair) {
      return '<div class="stat-card"><div class="lbl">' + pair[0] + '</div><div class="val">' + pair[1] + "</div></div>";
    }).join("");

    $("statByCategory").innerHTML = groupTable(records, function (r) { return r.categories; }, "공종");
    $("statByYear").innerHTML = groupTable(records, function (r) {
      return [String(r.noticeDate || r.awardDate || "").slice(0, 4) || "연도 미상"];
    }, "연도");
  }

  function groupTable(records, pick, label) {
    var map = {};
    records.forEach(function (r) {
      (pick(r) || []).forEach(function (key) {
        if (!key) return;
        map[key] = map[key] || { total: 0, awarded: 0 };
        map[key].total++;
        if (r.status === "낙찰") map[key].awarded++;
      });
    });
    var keys = Object.keys(map).sort();
    if (!keys.length) return '<div class="grid-empty">자료가 없습니다.</div>';
    return '<div class="grid-wrap"><table class="grid"><thead><tr><th>' + label +
      "</th><th>전체</th><th>낙찰</th></tr></thead><tbody>" +
      keys.map(function (k) {
        return "<tr><td>" + k + '</td><td class="cell-num">' + map[k].total +
          '</td><td class="cell-num">' + map[k].awarded + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  /* --------------------------------------------------- 특허 목록(설정) */

  function renderPatentList() {
    var q = $("patentListSearch").value.trim();
    var rows = q
      ? PourPatents.search(q, 200, storage).map(function (h) { return PourPatents.find(h.number, storage); })
      : PourPatents.list(storage);
    var box = $("patentListGrid");
    if (!rows.length) {
      box.innerHTML = '<div class="grid-empty">등록된 특허가 없습니다.</div>';
      return;
    }
    box.innerHTML = '<div class="grid-wrap"><table class="grid"><thead><tr>' +
      "<th>특허번호</th><th>특허명·공법명</th><th>공종</th><th>특허권자</th></tr></thead><tbody>" +
      rows.map(function (r) {
        return "<tr><td>" + PourPatents.formatNumber(r.number) + "</td><td>" + (r.name || "") +
          '</td><td class="cell-wrap">' + (r.categories || []).join("\n") + "</td><td>" +
          (r.company || "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  $("patentListSearch").addEventListener("input", renderPatentList);

  /* -------------------------------------------------------- 갱신 */

  function refresh() {
    renderAlerts();
    renderStatusTabs();
    grid.render();
    updateCount();
    syncRowButtons(grid.getSelected());
    if (state.view === "patents") renderPatentView();
    if (state.view === "stats") renderStats();
    if (state.view === "settings") renderPatentList();
  }

  function showStorageError(err) {
    var bar = $("alertBar");
    var chip = document.createElement("div");
    chip.className = "alert-chip";
    chip.style.cursor = "default";
    chip.textContent = "⚠ 서버 저장에 실패했습니다. 자료는 화면에 남아 있으며 다시 시도합니다. (" +
      (err && err.message ? err.message : "원인 미상") + ")";
    bar.insertBefore(chip, bar.firstChild);
  }

  window.PourApp = {
    refresh: refresh, showView: showView, openNotice: openNotice, openAward: openAward,
    grid: grid, state: state, storage: storage, usingApi: usingApi
  };

  if (usingApi) {
    storage.on(function (event) { if (event.type === "error") showStorageError(event.error); });
    // 서버에서 자료를 받아온 뒤 화면을 그린다
    storage.load().then(refresh).catch(function (err) {
      refresh();
      showStorageError(err);
    });
    // 저장이 끝나기 전에 창을 닫으면 알려 준다
    window.addEventListener("beforeunload", function (e) {
      if (!storage.hasPending()) return;
      e.preventDefault();
      e.returnValue = "";
    });
  } else {
    refresh();
  }
})();
