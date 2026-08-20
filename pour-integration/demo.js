/* 시연 화면 동작. 실제 사이트에 붙일 때는 이 파일의 흐름만 참고하면 된다. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var storage = window.localStorage;

  /* 상태 */
  var sort = { key: null, dir: "asc" };
  var patentSort = { key: null, dir: "asc" };
  var activeTab = null;
  var editingId = null;

  /* ------------------------------------------------------ 입력 위젯 */

  var regionField = PourUI.attachRegionInput($("cityInput"), {
    onChange: function (value) {
      $("regionResolved").textContent = value
        ? "지역 " + value.region + " / 도시 " + value.city
        : " ";
    }
  });

  var patentField = PourUI.attachPatentInput({
    input: $("patentSearch"),
    chips: $("patentChips"),
    categoryInput: $("categoryInput"),
    notice: $("patentNotice"),
    storage: storage
  });

  PourRecords.STATUSES.forEach(function (s) {
    $("statusInput").appendChild(new Option(s, s));
    $("awardStatus").appendChild(new Option(s, s));
  });
  $("awardStatus").value = "낙찰";
  PourRecords.QUALITY_OPTIONS.forEach(function (q) {
    $("qualityOptions").appendChild(new Option(q, q));
  });
  ["전체"].concat(PourRecords.STATUSES).forEach(function (s) {
    $("filterStatus").appendChild(new Option(s, s));
  });

  /* -------------------------------------------------- 엑셀 읽어오기 */

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
      var sheet = wb.worksheets[0];
      var rows = [];
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

  function showUpload(result) {
    var stats = $("uploadStats"), errors = $("uploadErrors"), msg = $("uploadMsg");
    stats.innerHTML = ""; errors.innerHTML = ""; msg.textContent = ""; msg.className = "msg";

    if (!result.ok) {
      msg.textContent = result.message;
      msg.className = "msg error";
      return;
    }
    [["정상 등록", result.inserted], ["갱신", result.updated],
     ["중복", result.duplicated], ["오류", result.errors.length]].forEach(function (pair) {
      var box = document.createElement("div");
      box.innerHTML = "<b>" + pair[1] + "건</b>" + pair[0];
      stats.appendChild(box);
    });
    result.errors.forEach(function (e) {
      var li = document.createElement("li");
      li.textContent = e.row + "행 — " + e.reason;
      errors.appendChild(li);
    });
    msg.textContent = "현재 등록된 POUR 특허 " + result.total + "건";
    msg.className = "msg ok";
    refreshAll();
  }

  $("patentFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    if (/\.csv$/i.test(file.name)) {
      reader.onload = function () { showUpload(PourPatents.load(rowsFromCsv(reader.result), storage)); };
      reader.readAsText(file, "utf-8");
    } else if (/\.xlsx$/i.test(file.name)) {
      reader.onload = function () {
        rowsFromWorkbook(reader.result)
          .then(function (rows) { showUpload(PourPatents.load(rows, storage)); })
          .catch(function (err) { showUpload({ ok: false, message: err.message }); });
      };
      reader.readAsArrayBuffer(file);
    } else {
      showUpload({ ok: false, message: ".xls 형식은 읽을 수 없습니다. .xlsx 또는 .csv 로 저장해서 올려주세요." });
    }
  });

  $("loadSampleBtn").addEventListener("click", function () {
    showUpload(PourPatents.load([
      ["POUR 특허번호", "특허·공법명", "공종 분류", "구분", "비고"],
      ["특허 제10-1935719호", "POUR공법", "재도장", "", ""],
      ["10-2425081", "POUR 슬라브공법", "슬라브", "", ""],
      ["2535699", "POUR 에폭시공법", "에폭시", "", ""],
      ["제10-2562854호", "POUR 균열보수공법", "재도장", "", ""],
      ["2699417", "DO 특수공법", "옥상 방수", "DO", ""],
      ["23456", "POUR 시험공법", "보통", "", ""]
    ], storage));
  });

  /* -------------------------------------------------- 특허 목록 표시 */

  function renderPatentList() {
    var query = $("patentListSearch").value.trim();
    var all = PourPatents.list(storage);
    var rows = query ? PourPatents.search(query, 100, storage).map(function (h) {
      return PourPatents.find(h.number, storage);
    }) : all;

    var wrap = $("patentListWrap");
    wrap.innerHTML = "";
    if (!rows.length) { wrap.innerHTML = '<div class="pour-empty">등록된 특허가 없습니다.</div>'; return; }

    var table = document.createElement("table");
    table.className = "pour-table";
    table.innerHTML = "<thead><tr><th>특허번호</th><th>특허명·공법명</th><th>공종</th><th>구분</th><th>비고</th></tr></thead>";
    var tbody = document.createElement("tbody");
    rows.forEach(function (rec) {
      var tr = document.createElement("tr");
      [PourPatents.formatNumber(rec.number), rec.name, rec.category, rec.prefix || "", rec.remark || ""]
        .forEach(function (v) {
          var td = document.createElement("td");
          td.textContent = v;
          tr.appendChild(td);
        });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var box = document.createElement("div");
    box.className = "pour-table-wrap";
    box.style.maxHeight = "260px";
    box.appendChild(table);
    wrap.appendChild(box);
  }
  $("patentListSearch").addEventListener("input", renderPatentList);

  /* ---------------------------------------------------- 공고 등록 */

  function readForm() {
    var region = regionField.getValue();
    return {
      region: region ? region.region : "",
      city: region ? region.city : $("cityInput").value.trim(),
      noticePatentText: $("noticePatentText").value.trim(),
      patentNumbers: patentField.getNumbers(),
      patentNames: patentField.getNames(),
      categories: $("categoryInput").value,
      client: $("clientInput").value.trim(),
      projectNames: $("projectNames").value,
      phone: $("phoneInput").value.trim(),
      households: $("householdsInput").value,
      quality: $("qualityInput").value.trim(),
      status: $("statusInput").value,
      noticeDate: $("noticeDate").value,
      bidDate: $("bidDate").value,
      contractor: $("contractorInput").value.trim(),
      agreementNo: $("agreementNo").value.trim(),
      scope: $("scopeInput").value.trim(),
      address: $("addressInput").value.trim(),
      remark: $("remarkInput").value.trim()
    };
  }

  $("saveBtn").addEventListener("click", function () {
    var data = readForm();
    var msg = $("saveMsg");
    if (!data.city) { msg.textContent = "지역·도시를 입력해 주세요."; msg.className = "msg error"; return; }
    if (!data.region) {
      var parsed = PourRegion.parse($("cityInput").value);
      if (parsed.status === "ambiguous") {
        msg.textContent = "여러 지역에 같은 이름이 있습니다. 목록에서 선택해 주세요: " +
          parsed.candidates.map(function (c) { return c.label; }).join(", ");
      } else {
        msg.textContent = "지역을 확인하지 못했습니다. 시·군·구 이름을 확인해 주세요.";
      }
      msg.className = "msg error";
      return;
    }
    // 특허번호가 없어도 등록을 막지 않는다
    var saved = PourRecords.save(data, storage);
    msg.textContent = "등록했습니다: " + PourRegion.format(saved.region, saved.city) + " " + (saved.client || "");
    msg.className = "msg ok";
    resetForm();
    refreshAll();
  });

  function resetForm() {
    ["noticePatentText", "categoryInput", "clientInput", "projectNames", "phoneInput",
     "householdsInput", "qualityInput", "noticeDate", "bidDate", "contractorInput",
     "agreementNo", "scopeInput", "addressInput", "remarkInput"].forEach(function (id) { $(id).value = ""; });
    regionField.clear();
    patentField.clear();
    $("statusInput").value = "공고";
  }
  $("resetFormBtn").addEventListener("click", function () { resetForm(); $("saveMsg").textContent = ""; });

  /* ---------------------------------------------------- 낙찰 처리 */

  $("awardBtn").addEventListener("click", function () {
    var msg = $("awardMsg");
    var id = $("awardTarget").value;
    if (!id) { msg.textContent = "대상 현장을 선택해 주세요."; msg.className = "msg error"; return; }

    var payload = {
      contractor: $("awardContractor").value.trim(),
      awardDate: $("awardDate").value,
      awardAmount: $("awardAmount").value,
      quality: $("awardQuality").value.trim(),
      status: $("awardStatus").value,
      remark: $("awardRemark").value.trim()
    };

    var result = PourRecords.award(id, payload, storage);
    if (!result.ok && result.needsConfirm) {
      // 차단이 아니라 확인용 경고
      if (window.confirm(result.message)) {
        payload.confirmedWithoutPatent = true;
        result = PourRecords.award(id, payload, storage);
      } else {
        msg.textContent = "낙찰 저장을 취소했습니다.";
        msg.className = "msg";
        return;
      }
    }
    if (!result.ok) { msg.textContent = result.message; msg.className = "msg error"; return; }

    msg.textContent = "낙찰 처리했습니다. (같은 행을 갱신)";
    msg.className = "msg ok";
    ["awardContractor", "awardDate", "awardAmount", "awardQuality", "awardRemark"]
      .forEach(function (id) { $(id).value = ""; });
    refreshAll();
  });

  /* ------------------------------------------------------ 수정 창 */

  var EDIT_FIELDS = [
    { key: "status", label: "상태", type: "select", options: PourRecords.STATUSES },
    { key: "client", label: "아파트·단지명" },
    { key: "projectNames", label: "공사명 (줄바꿈으로 여러 건)", type: "textarea" },
    { key: "categories", label: "공종 (쉼표 또는 줄바꿈)" },
    { key: "region", label: "지역" },
    { key: "city", label: "도시" },
    { key: "phone", label: "전화번호" },
    { key: "households", label: "세대수" },
    { key: "noticeDate", label: "공고일", type: "date" },
    { key: "bidDate", label: "개찰일", type: "date" },
    { key: "awardDate", label: "낙찰일", type: "date" },
    { key: "bidType", label: "입찰 종류" },
    { key: "contractor", label: "시공사" },
    { key: "expectedAmount", label: "예상금액" },
    { key: "awardAmount", label: "낙찰금액" },
    { key: "noticePatentText", label: "공고문 특허·공법 원문" },
    { key: "agreementNo", label: "협약서 발행번호" },
    { key: "patentNames", label: "확정된 특허명·공법명" },
    { key: "scope", label: "공사 범위" },
    { key: "address", label: "주소" },
    { key: "quality", label: "공사 품질" },
    { key: "remark", label: "비고" }
  ];

  var editPatentField = null;

  function openEdit(id) {
    var record = PourRecords.list(storage).filter(function (r) { return r.id === id; })[0];
    if (!record) return;
    editingId = id;

    $("editTitle").textContent = "자료 수정 — " + (record.client || "이름 없음") +
      " (" + PourRegion.format(record.region, record.city) + ")";

    var box = $("editFields");
    box.innerHTML = "";
    EDIT_FIELDS.forEach(function (field) {
      var value = record[field.key];
      if (Array.isArray(value)) value = value.join("\n");
      var wrap = document.createElement("div");
      var label = document.createElement("label");
      label.textContent = field.label;
      wrap.appendChild(label);

      var input;
      if (field.type === "select") {
        input = document.createElement("select");
        field.options.forEach(function (o) { input.appendChild(new Option(o, o)); });
      } else if (field.type === "textarea") {
        input = document.createElement("textarea");
        input.rows = 2;
      } else {
        input = document.createElement("input");
        input.type = field.type || "text";
      }
      input.id = "edit-" + field.key;
      input.value = value == null ? "" : value;
      wrap.appendChild(input);
      box.appendChild(wrap);
    });

    // 특허번호는 자동검색 위젯으로 다시 붙인다
    $("editPatentSearch").value = "";
    $("editPatentChips").innerHTML = "";
    $("editConfirmed").checked = !!record.patentConfirmed;
    editPatentField = PourUI.attachPatentInput({
      input: $("editPatentSearch"),
      chips: $("editPatentChips"),
      categoryInput: $("edit-categories"),
      notice: $("editPatentNotice"),
      storage: storage
    });
    record.patentNumbers.forEach(function (n) {
      var found = PourPatents.find(n, storage);
      editPatentField.add(found || { number: n, name: "", category: "" });
    });

    var history = $("editHistory");
    history.innerHTML = record.history.length
      ? "<b>수정 이력</b>" + record.history.map(function (h) {
          return "<div>" + h.at + " · " + h.action + " (" + h.statusBefore + " → " + h.statusAfter + ")<br>" +
            h.changes.map(function (c) {
              return "&nbsp;&nbsp;· " + c.label + ": " + (c.before || "(빈값)") + " → " + (c.after || "(빈값)");
            }).join("<br>") + "</div>";
        }).join("")
      : "<b>수정 이력</b><div>아직 수정 내역이 없습니다.</div>";

    $("editMsg").textContent = "";
    $("editBack").style.display = "flex";
  }

  $("editCancel").addEventListener("click", function () {
    $("editBack").style.display = "none";
    editingId = null;
  });

  $("editSave").addEventListener("click", function () {
    if (!editingId) return;
    var changes = {};
    EDIT_FIELDS.forEach(function (field) {
      changes[field.key] = $("edit-" + field.key).value;
    });
    changes.patentNumbers = editPatentField.getNumbers();
    changes.patentConfirmed = $("editConfirmed").checked;

    // 엑셀에 없는 번호를 직접 넣었는지 확인한다
    var unknown = changes.patentNumbers.filter(function (n) { return !PourPatents.find(n, storage); });
    if (unknown.length && !changes.patentConfirmed) {
      $("editMsg").textContent = "업로드된 POUR 특허 자료에서 확인되지 않은 번호입니다: " +
        unknown.map(PourPatents.formatNumber).join(", ") + "\n계속하려면 “직접 확인 완료”를 체크해 주세요.";
      $("editMsg").className = "msg error";
      return;
    }

    var result = PourRecords.update(editingId, changes, storage);
    if (!result.ok) { $("editMsg").textContent = result.message; $("editMsg").className = "msg error"; return; }
    $("editBack").style.display = "none";
    editingId = null;
    refreshAll();          // 새로고침 없이 모든 화면 갱신
  });

  /* ------------------------------------------------- 미기재 알림 */

  function renderMissing() {
    var records = PourRecords.list(storage);
    var missing = PourRecords.missingPatentRecords(records, storage);
    var alert = $("missingAlert");

    if (!missing.length) {
      alert.style.display = "none";
      $("missingSection").style.display = "none";
      return missing;
    }
    alert.style.display = "";
    alert.textContent = PourRecords.missingPatentMessage(missing.length);

    var columns = [
      { key: "client", title: "발주처(아파트명)", type: "text" },
      { key: "region", title: "지역", type: "text" },
      { key: "city", title: "도시", type: "text" },
      { key: "projectNames", title: "공사명", type: "list" },
      { key: "categories", title: "공종", type: "list" },
      { key: "awardDate", title: "낙찰일", type: "date" },
      { key: "contractor", title: "시공사", type: "text" },
      { key: "noticePatentText", title: "공고문 특허·공법 원문", type: "text" },
      { key: "agreementNo", title: "협약서 발행번호", type: "text" },
      { key: "patentNumbers", title: "POUR 적용 특허번호", type: "patent" },
      { key: "remark", title: "비고", type: "text" }
    ];
    PourUI.renderTable($("missingTable"), missing, columns, {});
    addRowButtons($("missingTable"), missing, "특허번호 입력");
    return missing;
  }

  // 표의 각 행 끝에 수정 버튼을 붙인다
  function addRowButtons(container, records, label) {
    var table = container.querySelector("table");
    if (!table) return;
    var th = document.createElement("th");
    th.textContent = "수정";
    table.querySelector("thead tr").appendChild(th);

    Array.prototype.forEach.call(table.querySelectorAll("tbody tr"), function (tr, i) {
      var td = document.createElement("td");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "pour-rowbtn";
      button.textContent = label || "수정";
      button.setAttribute("data-edit-id", records[i].id);
      button.addEventListener("click", function () { openEdit(records[i].id); });
      td.appendChild(button);
      tr.appendChild(td);
    });
  }

  $("missingAlert").addEventListener("click", function () {
    $("missingSection").style.display = "";
    $("missingSection").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("missingClose").addEventListener("click", function (e) {
    e.stopPropagation();
    $("missingSection").style.display = "none";
  });

  /* ------------------------------------------------- 전체 실적표 */

  function renderAll() {
    var records = PourRecords.list(storage);
    if (sort.key) records = PourRecords.sortRecords(records, sort.key, sort.dir);
    PourUI.renderTable($("allTable"), records, PourRecords.COLUMNS, {
      sortKey: sort.key, sortDir: sort.dir,
      onSort: function (key) {
        sort.dir = sort.key === key && sort.dir === "asc" ? "desc" : "asc";
        sort.key = key;
        renderAll();
      }
    });
    addRowButtons($("allTable"), records, "수정");

    var select = $("awardTarget");
    var previous = select.value;
    select.innerHTML = "";
    select.appendChild(new Option("— 선택 —", ""));
    records.forEach(function (r) {
      select.appendChild(new Option(
        (r.client || "이름 없음") + " / " + PourRegion.format(r.region, r.city) + " / " + r.status, r.id));
    });
    select.value = previous;
  }

  /* ------------------------------------------------- 특허별 실적 */

  function renderPatentSection() {
    var records = PourRecords.list(storage);
    var tabs = PourRecords.patentTabs(PourPatents.list(storage), records);

    if (!tabs.length) {
      $("patentTabs").innerHTML = "";
      $("patentSummary").textContent = "등록된 특허가 없습니다. 특허 관리 엑셀을 먼저 올려주세요.";
      $("patentTable").innerHTML = "";
      return;
    }

    var control = PourUI.renderPatentTabs($("patentTabs"), tabs, {
      active: activeTab,
      storage: storage,
      onSelect: function (number) { activeTab = number; renderPatentTable(); }
    });
    activeTab = control.getActive();
    renderPatentTable();
  }

  function fillOptions(select, values) {
    var previous = select.value;
    select.innerHTML = "";
    ["전체"].concat(values).forEach(function (v) { select.appendChild(new Option(v, v)); });
    select.value = values.indexOf(previous) >= 0 || previous === "전체" ? previous : "전체";
  }

  function renderPatentTable() {
    if (!activeTab) return;
    var records = PourRecords.list(storage);
    var tabs = PourRecords.patentTabs(PourPatents.list(storage), records);
    var tab = tabs.filter(function (t) { return t.number === activeTab; })[0];
    var rows = PourRecords.recordsForPatent(activeTab, records);

    fillOptions($("filterRegion"), rows.map(function (r) { return r.region; })
      .filter(function (v, i, a) { return v && a.indexOf(v) === i; }));
    fillOptions($("filterYear"), rows.map(function (r) {
      return String(r.noticeDate || r.awardDate || "").slice(0, 4);
    }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }));

    var filtered = PourRecords.applyFilters(rows, {
      status: $("filterStatus").value,
      region: $("filterRegion").value,
      year: $("filterYear").value,
      keyword: $("filterKeyword").value.trim()
    });
    if (patentSort.key) filtered = PourRecords.sortRecords(filtered, patentSort.key, patentSort.dir);

    var summary = PourRecords.summarize(filtered);
    $("patentSummary").innerHTML = "<strong>" + (tab ? tab.label : "") + "</strong><br>" +
      "전체 " + summary.total + "건 · 낙찰 " + summary.awarded + "건 · 유찰 " + summary.failed + "건 · 총 " +
      summary.households.toLocaleString("ko-KR") + "세대 · 낙찰금액 " +
      PourRecords.formatAmountShort(summary.amount) + " · 적용 지역 " + summary.regions + "곳" +
      (summary.otherMethod ? " · (타공법 낙찰 " + summary.otherMethod + "건 제외)" : "");

    PourUI.renderTable($("patentTable"), filtered, PourRecords.PATENT_TAB_COLUMNS, {
      sortKey: patentSort.key, sortDir: patentSort.dir,
      onSort: function (key) {
        patentSort.dir = patentSort.key === key && patentSort.dir === "asc" ? "desc" : "asc";
        patentSort.key = key;
        renderPatentTable();
      }
    });
    addRowButtons($("patentTable"), filtered, "수정");
  }

  ["filterStatus", "filterRegion", "filterYear"].forEach(function (id) {
    $(id).addEventListener("change", renderPatentTable);
  });
  $("filterKeyword").addEventListener("input", renderPatentTable);

  /* ------------------------------------------------- 내려받기 */

  $("csvBtn").addEventListener("click", function () {
    PourExport.downloadCsv(PourRecords.list(storage), "공사실적.csv");
  });

  $("xlsxBtn").addEventListener("click", function () {
    var wb = PourExport.buildWorkbook(PourRecords.list(storage));
    if (!wb) return alert("엑셀 라이브러리를 불러오지 못했습니다. CSV를 사용해 주세요.");
    PourExport.downloadWorkbook(wb, "공사실적.xlsx");
  });

  $("patentXlsxBtn").addEventListener("click", function () {
    var records = PourRecords.list(storage);
    var tabs = PourRecords.patentTabs(PourPatents.list(storage), records);
    var wb = PourExport.buildPatentWorkbook(tabs, records);
    if (!wb) return alert("엑셀 라이브러리를 불러오지 못했습니다. CSV를 사용해 주세요.");
    PourExport.downloadWorkbook(wb, "특허별-실적.xlsx");
  });

  /* ------------------------------------------------------ 갱신 */

  function refreshAll() {
    renderMissing();
    renderPatentList();
    renderAll();
    renderPatentSection();
  }

  window.PourDemo = { refreshAll: refreshAll, openEdit: openEdit };
  refreshAll();
})();
