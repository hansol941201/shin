/**
 * POUR 특허 / 타사 특허 입력기 (2탭)
 *
 * POUR 특허는 업로드된 우리 특허 엑셀에서만 고를 수 있고,
 * 타사 특허는 직접 입력한다. 두 자료는 절대 섞이지 않는다.
 */
(function (root) {
  "use strict";
  var PourPatents = root.PourPatents, PourRecords = root.PourRecords, PourUI = root.PourUI;
  var POUR = "POUR", THIRD = "THIRD_PARTY";

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  /**
   * @param container 입력기를 넣을 엘리먼트
   * @param options   { storage, categoryInput, onChange }
   */
  function create(container, options) {
    var opts = options || {};
    var storage = opts.storage;
    var pourItems = [], thirdItems = [], activeTab = POUR, noticeMulti = false;

    container.classList.add("pour-patent-editor");
    container.innerHTML = "";

    var tabbar = el("div", "pour-kind-tabs");
    var pourTab = el("button", "pour-kind-tab is-active");
    var thirdTab = el("button", "pour-kind-tab");
    pourTab.type = thirdTab.type = "button";
    tabbar.appendChild(pourTab);
    tabbar.appendChild(thirdTab);

    var body = el("div", "pour-kind-body");
    var warn = el("div", "pour-notice");
    warn.style.display = "none";
    var badge = el("div", "pour-multi-badge");

    var multiWrap = el("label", "pour-multi-check");
    var multiBox = document.createElement("input");
    multiBox.type = "checkbox";
    multiBox.id = "noticeMultiFlag";
    multiWrap.appendChild(multiBox);
    multiWrap.appendChild(document.createTextNode(" 공고문에 다특허로 기재됨"));
    multiBox.addEventListener("change", function () { noticeMulti = multiBox.checked; refresh(); });

    container.appendChild(tabbar);
    container.appendChild(body);
    container.appendChild(warn);
    container.appendChild(multiWrap);
    container.appendChild(badge);

    pourTab.addEventListener("click", function () { activeTab = POUR; refresh(); });
    thirdTab.addEventListener("click", function () { activeTab = THIRD; refresh(); });

    /* ------------------------------------------------------ 공종 자동 입력 */

    function syncCategories() {
      if (!opts.categoryInput) return;
      var seen = {}, out = [];
      pourItems.forEach(function (it) {
        String(it.category || "").split(/[,/\n]/).forEach(function (part) {
          var c = part.trim();
          if (c && !seen[c]) { seen[c] = true; out.push(c); }
        });
      });
      opts.categoryInput.value = out.join(", ");
    }

    /* ------------------------------------------------------------ 경고 */

    function checkWarnings() {
      var pourNumbers = {};
      pourItems.forEach(function (it) { pourNumbers[it.number] = true; });
      var clash = thirdItems.filter(function (it) { return pourNumbers[it.number]; });
      if (clash.length) {
        warn.textContent = PourRecords.CONFLICT_MESSAGE;
        warn.style.display = "";
        return;
      }
      warn.style.display = "none";
      warn.textContent = "";
    }

    function refreshBadge() {
      var stats = PourRecords.patentStats({
        patentItems: pourItems.concat(thirdItems), noticeMultiFlag: noticeMulti
      }, storage);
      badge.textContent = stats.label ? stats.label + " · " + stats.detail : stats.detail;
      badge.setAttribute("data-badge", stats.badge);
      badge.style.display = stats.totalCount || noticeMulti ? "" : "none";
    }

    /* --------------------------------------------------- POUR 특허 화면 */

    function renderPour() {
      body.innerHTML = "";
      var field = el("div", "pour-field");
      var input = document.createElement("input");
      input.type = "text";
      input.className = "pour-kind-search";
      input.placeholder = "특허번호·특허명·공법명·공종으로 검색 (예: 193, POUR, 재도장)";
      input.autocomplete = "off";
      field.appendChild(input);
      body.appendChild(field);

      PourUI.attachSuggest(
        input,
        function (query) {
          var q = String(query || "").trim();
          // 빈 입력칸을 눌렀을 때는 등록된 POUR 특허 목록을 그대로 보여 준다
          var hits = q ? PourPatents.search(q, 10, storage) : PourPatents.browse(10, storage);
          return hits.map(function (h) {
            return {
              number: h.number, name: h.name, category: h.category,
              title: PourPatents.formatNumber(h.number),
              sub: [h.name, h.category].filter(Boolean).join(" · ")
            };
          });
        },
        function (item) { addPour(item); input.value = ""; },
        function () { return PourPatents.emptyMessage(storage); }
      );

      var add = el("button", "pour-add-btn", "＋ 특허 추가");
      add.type = "button";
      add.addEventListener("click", function () { input.focus(); });
      body.appendChild(add);

      body.appendChild(renderRows(pourItems, POUR));
    }

    function addPour(item) {
      if (!item || !item.number) return false;
      if (pourItems.some(function (p) { return p.number === item.number; })) {
        warn.textContent = "이미 추가된 특허입니다: " + PourPatents.formatNumber(item.number);
        warn.style.display = "";
        return false;
      }
      pourItems.push(PourRecords.normalizePatentItem({
        number: item.number, name: item.name, category: item.category
      }, POUR));
      refresh();
      return true;
    }

    /* --------------------------------------------------- 타사 특허 화면 */

    var THIRD_FIELDS = [
      { key: "number", label: "타사 특허번호", placeholder: "10-2091977" },
      { key: "name", label: "특허명·공법명", placeholder: "균열보수 공법" },
      { key: "company", label: "보유 회사명", placeholder: "타사명" },
      { key: "category", label: "관련 공종", placeholder: "재도장" },
      { key: "remark", label: "비고", placeholder: "공고문 기재 특허" }
    ];

    function renderThird() {
      body.innerHTML = "";
      var form = el("div", "pour-third-form");
      var inputs = {};
      THIRD_FIELDS.forEach(function (f) {
        var wrap = el("div");
        wrap.appendChild(el("label", null, f.label));
        var input = document.createElement("input");
        input.type = "text";
        input.placeholder = f.placeholder;
        input.className = "pour-third-" + f.key;
        wrap.appendChild(input);
        form.appendChild(wrap);
        inputs[f.key] = input;
      });
      body.appendChild(form);

      var add = el("button", "pour-add-btn", "＋ 특허 추가");
      add.type = "button";
      add.addEventListener("click", function () {
        var values = {};
        THIRD_FIELDS.forEach(function (f) { values[f.key] = inputs[f.key].value.trim(); });
        if (!addThird(values)) return;
        THIRD_FIELDS.forEach(function (f) { inputs[f.key].value = ""; });
      });
      body.appendChild(add);

      body.appendChild(renderRows(thirdItems, THIRD));
    }

    function addThird(values) {
      var item = PourRecords.normalizePatentItem(values, THIRD);
      if (!item) {
        warn.textContent = "타사 특허번호를 입력해 주세요.";
        warn.style.display = "";
        return false;
      }
      if (thirdItems.some(function (t) { return t.number === item.number; })) {
        warn.textContent = "이미 추가된 타사 특허입니다: " + item.display;
        warn.style.display = "";
        return false;
      }
      thirdItems.push(item);
      refresh();
      return true;
    }

    /* --------------------------------------------------------- 목록 행 */

    function renderRows(items, kind) {
      var list = el("div", "pour-item-list");
      if (!items.length) {
        list.appendChild(el("div", "pour-item-empty",
          kind === POUR ? "선택된 POUR 특허가 없습니다." : "입력된 타사 특허가 없습니다."));
        return list;
      }
      items.forEach(function (item, index) {
        var row = el("div", "pour-item-row");
        row.setAttribute("data-number", item.number);
        row.appendChild(el("span", "pour-item-no", String(index + 1)));

        var text = [item.display, item.name || item.method, item.company, item.category]
          .filter(Boolean).join(" · ");
        row.appendChild(el("span", "pour-item-text", text));

        var up = el("button", "pour-item-btn", "▲");
        up.type = "button"; up.title = "위로";
        up.disabled = index === 0;
        up.addEventListener("click", function () { move(items, index, -1); });

        var down = el("button", "pour-item-btn", "▼");
        down.type = "button"; down.title = "아래로";
        down.disabled = index === items.length - 1;
        down.addEventListener("click", function () { move(items, index, 1); });

        var remove = el("button", "pour-item-btn pour-item-del", "✕");
        remove.type = "button"; remove.title = "삭제";
        remove.addEventListener("click", function () { items.splice(index, 1); refresh(); });

        row.appendChild(up); row.appendChild(down); row.appendChild(remove);
        list.appendChild(row);
      });
      return list;
    }

    function move(items, index, step) {
      var to = index + step;
      if (to < 0 || to >= items.length) return;
      var tmp = items[index];
      items[index] = items[to];
      items[to] = tmp;
      refresh();
    }

    /* ----------------------------------------------------------- 갱신 */

    function refresh() {
      pourTab.textContent = "POUR 특허(우리 특허) (" + pourItems.length + ")";
      thirdTab.textContent = "타사 특허 (" + thirdItems.length + ")";
      pourTab.className = "pour-kind-tab" + (activeTab === POUR ? " is-active" : "");
      thirdTab.className = "pour-kind-tab" + (activeTab === THIRD ? " is-active" : "");
      multiBox.checked = noticeMulti;

      if (activeTab === POUR) renderPour(); else renderThird();
      checkWarnings();
      syncCategories();
      refreshBadge();
      if (opts.onChange) opts.onChange(getValue());
    }

    function getValue() {
      return {
        patentItems: pourItems.concat(thirdItems),
        noticeMultiFlag: noticeMulti
      };
    }

    function setValue(record) {
      var items = (record && record.patentItems) || [];
      pourItems = items.filter(function (i) { return i.kind === POUR; })
        .map(function (i) { return PourRecords.normalizePatentItem(i, POUR); });
      thirdItems = items.filter(function (i) { return i.kind === THIRD; })
        .map(function (i) { return PourRecords.normalizePatentItem(i, THIRD); });
      noticeMulti = !!(record && record.noticeMultiFlag);
      refresh();
    }

    refresh();

    return {
      getValue: getValue,
      setValue: setValue,
      clear: function () { pourItems = []; thirdItems = []; noticeMulti = false; activeTab = POUR; refresh(); },
      addPour: addPour,
      addThird: addThird,
      showTab: function (kind) { activeTab = kind; refresh(); }
    };
  }

  root.PourPatentEditor = { create: create };
})(typeof self !== "undefined" ? self : this);
