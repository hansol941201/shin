/**
 * 화면 위젯: 지역·도시 자동완성, 특허 자동검색+칩, 엑셀형 실적표, 특허별 탭
 *
 * 기존 사이트의 입력칸에 붙여 쓰는 용도라 특정 화면 구조에 의존하지 않는다.
 * 필요한 엘리먼트만 넘기면 된다.
 */
(function (root) {
  "use strict";
  var PourRegion = root.PourRegion, PourPatents = root.PourPatents, PourRecords = root.PourRecords;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ------------------------------------------------- 공통 자동완성 */

  /**
   * 입력창 아래에 추천 목록을 띄우고 방향키·Enter·클릭·터치로 고르게 한다.
   * @param input      대상 input
   * @param getItems   (query) => [{ key, title, sub }]
   * @param onPick     (item) => void
   * @param emptyText  결과가 없을 때 보여줄 문구 (없으면 목록을 닫음)
   */
  function attachSuggest(input, getItems, onPick, emptyText) {
    // emptyText 는 문자열이거나, 그때그때 문구를 정하는 함수일 수 있다.
    var wrap = input.parentNode;
    if (!/pour-field/.test(wrap.className || "")) wrap.className = (wrap.className || "") + " pour-field";
    var list = el("div", "pour-suggest");
    wrap.appendChild(list);

    var items = [], active = -1;

    function close() { list.classList.remove("is-open"); active = -1; }

    function render() {
      list.innerHTML = "";
      if (!items.length) {
        var message = typeof emptyText === "function" ? emptyText() : emptyText;
        if (!message) return close();
        list.appendChild(el("div", "pour-suggest-empty", message));
        list.classList.add("is-open");
        return;
      }
      items.forEach(function (item, i) {
        var row = el("div", "pour-suggest-item" + (i === active ? " is-active" : ""));
        row.appendChild(el("span", null, item.title));
        if (item.sub) {
          row.appendChild(document.createTextNode(" "));
          row.appendChild(el("span", "pour-sub", item.sub));
        }
        // 모바일 터치와 마우스 클릭 모두에서 선택되도록 pointerdown 을 쓴다.
        row.addEventListener("pointerdown", function (e) { e.preventDefault(); pick(i); });
        list.appendChild(row);
      });
      list.classList.add("is-open");
    }

    function pick(i) {
      var item = items[i];
      if (!item) return;
      close();
      onPick(item);
    }

    function refresh() {
      items = getItems(input.value) || [];
      active = items.length ? 0 : -1;
      render();
    }

    input.addEventListener("input", refresh);
    input.addEventListener("focus", function () { if (input.value.trim()) refresh(); });
    input.addEventListener("blur", function () { setTimeout(close, 120); });
    input.addEventListener("keydown", function (e) {
      if (!list.classList.contains("is-open") || !items.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % items.length; render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
      else if (e.key === "Enter") { e.preventDefault(); pick(active); }
      else if (e.key === "Escape") close();
    });

    return { refresh: refresh, close: close, isOpen: function () { return list.classList.contains("is-open"); } };
  }

  /* --------------------------------------------- 지역·도시 입력칸 */

  /**
   * 도시만 입력해도 시·도를 자동 판단한다. 저장은 기존대로 region / city 로 나눈다.
   * @returns { getValue(): {region, city} | null, setValue(region, city), clear() }
   */
  function attachRegionInput(input, options) {
    var opts = options || {};
    var resolved = null;

    function setResolved(entry) {
      resolved = entry ? { region: entry.region, city: entry.city } : null;
      if (opts.onChange) opts.onChange(resolved);
    }

    var suggest = attachSuggest(
      input,
      function (query) {
        return PourRegion.suggest(query, 10).map(function (e) {
          return { key: e.label, title: e.city, sub: e.region, region: e.region, city: e.city };
        });
      },
      function (item) {
        input.value = item.city;
        setResolved(item);
      },
      null
    );

    function report(r) {
      if (r.status === "ambiguous" && opts.onAmbiguous) opts.onAmbiguous(r.candidates);
      setResolved(r.status === "resolved" ? r : null);
    }

    // 입력창을 벗어날 때 확정한다. 여러 시도에 같은 이름이 있으면 선택 목록을 띄운다.
    input.addEventListener("change", function () {
      var r = PourRegion.parse(input.value);
      if (r.status === "resolved") input.value = r.city;
      else if (r.status === "ambiguous" && !opts.onAmbiguous) suggest.refresh();
      report(r);
    });

    input.addEventListener("input", function () {
      report(PourRegion.parse(input.value));
    });

    return {
      getValue: function () { return resolved; },
      setValue: function (region, city) { input.value = city || ""; resolved = region ? { region: region, city: city } : null; },
      clear: function () { input.value = ""; setResolved(null); }
    };
  }

  /* ------------------------------------------ 특허 자동검색 + 칩 */

  /**
   * "특허번호 또는 특허명" 입력칸. 고른 특허는 칩으로 쌓이고 공종이 자동 입력된다.
   * @param config { input, chips, categoryInput, notice, storage, onChange }
   */
  function attachPatentInput(config) {
    var cfg = config || {};
    var selected = [];                 // [{ number, name, category }]
    var manualCategories = [];         // 사용자가 직접 적어 넣은 공종 (자동 계산 때 보존)

    function autoCategories() {
      return PourPatents.categoriesFor(selected.map(function (s) { return s.number; }), cfg.storage);
    }

    function syncCategories() {
      if (!cfg.categoryInput) return;
      var auto = autoCategories();
      var merged = auto.slice();
      manualCategories.forEach(function (c) { if (merged.indexOf(c) < 0) merged.push(c); });
      cfg.categoryInput.value = merged.join(", ");
    }

    // 사용자가 공종을 직접 고치면, 자동 계산에서 나오지 않는 값만 따로 기억한다.
    if (cfg.categoryInput) {
      cfg.categoryInput.addEventListener("change", function () {
        var auto = autoCategories();
        manualCategories = cfg.categoryInput.value.split(/[,\n]/)
          .map(function (s) { return s.trim(); })
          .filter(function (s) { return s && auto.indexOf(s) < 0; });
      });
    }

    function notify() {
      if (cfg.onChange) cfg.onChange(selected.slice());
    }

    function renderChips() {
      if (!cfg.chips) return;
      cfg.chips.innerHTML = "";
      selected.forEach(function (item) {
        var chip = el("span", "pour-chip");
        chip.appendChild(document.createTextNode(PourPatents.formatNumber(item.number) +
          (item.name ? " · " + item.name : "")));
        var remove = el("button", null, "✕");
        remove.type = "button";
        remove.title = "선택 해제";
        remove.addEventListener("click", function () {
          selected = selected.filter(function (s) { return s.number !== item.number; });
          renderChips();
          syncCategories();          // 선택을 취소하면 공종을 다시 계산한다
          notify();
        });
        chip.appendChild(remove);
        cfg.chips.appendChild(chip);
      });
    }

    function add(record) {
      if (!record) return false;
      // 같은 특허가 중복 선택되지 않게 한다
      if (selected.some(function (s) { return s.number === record.number; })) return false;
      selected.push({ number: record.number, name: record.name, category: record.category });
      renderChips();
      syncCategories();
      notify();
      return true;
    }

    function setNotice(message) {
      if (!cfg.notice) return;
      cfg.notice.textContent = message || "";
      cfg.notice.style.display = message ? "" : "none";
    }

    attachSuggest(
      cfg.input,
      function (query) {
        var q = String(query || "").trim();
        if (!q) { setNotice(""); return []; }
        var hits = PourPatents.search(q, 10, cfg.storage);
        setNotice(hits.length ? "" : PourPatents.emptyMessage(cfg.storage));
        return hits.map(function (h) {
          return {
            key: h.number, number: h.number, name: h.name, category: h.category,
            title: PourPatents.formatNumber(h.number),
            sub: [h.name, h.category].filter(Boolean).join(" · ")
          };
        });
      },
      function (item) {
        add(item);
        cfg.input.value = "";
        setNotice("");
      },
      function () { return PourPatents.emptyMessage(cfg.storage); }
    );

    // 번호를 끝까지 직접 입력한 경우에도 우리 특허인지 검증한다.
    cfg.input.addEventListener("change", function () {
      var text = cfg.input.value.trim();
      if (!text) return setNotice("");
      var found = PourPatents.find(text, cfg.storage);
      if (found) { add(found); cfg.input.value = ""; setNotice(""); }
      else setNotice(PourPatents.NOT_FOUND_MESSAGE);
    });

    return {
      getSelected: function () { return selected.slice(); },
      getNumbers: function () { return selected.map(function (s) { return s.number; }); },
      getNames: function () { return selected.map(function (s) { return s.name; }).filter(Boolean); },
      getCategories: function () {
        return cfg.categoryInput
          ? cfg.categoryInput.value.split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean)
          : autoCategories();
      },
      add: add,
      clear: function () {
        selected = []; manualCategories = [];
        renderChips(); syncCategories(); setNotice(""); notify();
      }
    };
  }

  /* ----------------------------------------------------- 실적표 */

  var WRAP_TYPES = { list: true, patent: true };

  /**
   * 엑셀형 표를 그린다. 한 현장은 반드시 한 행으로 유지된다.
   * @param container 표를 넣을 엘리먼트
   * @param records   행 목록
   * @param columns   열 정의 (PourRecords.COLUMNS 등)
   * @param options   { sortKey, sortDir, onSort }
   */
  function renderTable(container, records, columns, options) {
    var opts = options || {};
    container.innerHTML = "";
    container.className = "pour-table-wrap";

    var table = el("table", "pour-table");
    var thead = el("thead");
    var headRow = el("tr");

    columns.forEach(function (col) {
      var th = el("th", null, col.title);
      th.title = col.title;
      if (col.type !== "seq") {
        th.addEventListener("click", function () {
          if (opts.onSort) opts.onSort(col.key);
        });
        if (opts.sortKey === col.key) {
          th.appendChild(el("span", "pour-sort", opts.sortDir === "desc" ? "▼" : "▲"));
        }
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = el("tbody");
    (records || []).forEach(function (rec, i) {
      var tr = el("tr");
      tr.setAttribute("data-record-id", rec.id);
      columns.forEach(function (col) {
        var value = PourRecords.displayValue(rec, col, i);
        var td = el("td");
        if (WRAP_TYPES[col.type]) td.className = "pour-wrap";
        else if (col.type === "number" || col.type === "money") td.className = "pour-num";
        else if (col.type === "seq") td.className = "pour-seq";

        if (col.key === "status") {
          var badge = el("span", "pour-status", value);
          badge.setAttribute("data-status", value);
          td.appendChild(badge);
        } else {
          td.textContent = value;
          if (value) td.title = value;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    if (!records || !records.length) {
      container.appendChild(el("div", "pour-empty", "표시할 자료가 없습니다."));
    }
    return table;
  }

  /* -------------------------------------------------- 특허 탭 */

  var TAB_STATE_KEY = "pour.activePatentTab";

  /**
   * 엑셀 시트처럼 생긴 가로 탭. 이전·다음 버튼과 특허번호 검색을 함께 제공한다.
   * @param container 탭을 넣을 엘리먼트
   * @param tabs      PourRecords.patentTabs() 결과
   * @param options   { active, onSelect, storage }
   */
  function renderPatentTabs(container, tabs, options) {
    var opts = options || {};
    var storage = opts.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    container.innerHTML = "";
    container.className = "pour-tabbar";

    var prev = el("button", "pour-tab-nav", "‹");
    prev.type = "button"; prev.title = "이전 탭";
    var next = el("button", "pour-tab-nav", "›");
    next.type = "button"; next.title = "다음 탭";
    var scroll = el("div", "pour-tabbar-scroll");
    var search = el("input", "pour-tab-search");
    search.type = "search";
    search.placeholder = "특허번호 검색";

    var visible = tabs.slice();
    var active = opts.active || (storage && storage.getItem(TAB_STATE_KEY)) || (tabs[0] && tabs[0].number);
    if (!tabs.some(function (t) { return t.number === active; })) active = tabs[0] && tabs[0].number;

    function select(number) {
      active = number;
      if (storage) { try { storage.setItem(TAB_STATE_KEY, number); } catch (e) {} }   // 새로고침 후에도 유지
      paint();
      if (opts.onSelect) opts.onSelect(number);
    }

    function paint() {
      scroll.innerHTML = "";
      visible.forEach(function (tab) {
        var button = el("button", "pour-tab" + (tab.number === active ? " is-active" : ""), tab.label);
        button.type = "button";
        button.title = tab.label + (tab.name ? " — " + tab.name : "");   // 전체 이름 툴팁
        button.setAttribute("data-number", tab.number);
        button.addEventListener("click", function () { select(tab.number); });
        scroll.appendChild(button);
      });
      var current = scroll.querySelector(".is-active");
      if (current && current.scrollIntoView) {
        current.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }

    function move(step) {
      var index = visible.findIndex(function (t) { return t.number === active; });
      var at = Math.min(Math.max(index + step, 0), visible.length - 1);
      if (visible[at]) select(visible[at].number);
    }

    prev.addEventListener("click", function () { move(-1); });
    next.addEventListener("click", function () { move(1); });
    search.addEventListener("input", function () {
      var q = search.value.replace(/[^0-9]/g, "");
      visible = q ? tabs.filter(function (t) { return t.number.indexOf(q) >= 0; }) : tabs.slice();
      paint();
    });

    container.appendChild(prev);
    container.appendChild(scroll);
    container.appendChild(next);
    container.appendChild(search);
    paint();

    return {
      getActive: function () { return active; },
      select: select
    };
  }

  root.PourUI = {
    attachSuggest: attachSuggest,
    attachRegionInput: attachRegionInput,
    attachPatentInput: attachPatentInput,
    renderTable: renderTable,
    renderPatentTabs: renderPatentTabs,
    TAB_STATE_KEY: TAB_STATE_KEY
  };
})(typeof self !== "undefined" ? self : this);
