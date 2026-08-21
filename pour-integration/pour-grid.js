/**
 * 엑셀형 표 (정렬 · 열 필터 · 열 너비 조절 · 행 선택 · 열 고정)
 *
 * 업무용 프로그램처럼 많은 자료를 한 화면에서 빠르게 훑어보기 위한 표다.
 */
(function (root) {
  "use strict";
  var PourRecords = root.PourRecords;

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  var WRAP_TYPES = { list: true, patent: true, thirdNumbers: true, thirdNames: true, thirdCompanies: true };

  /**
   * @param container 표를 넣을 엘리먼트
   * @param options   { columns, getRecords, onOpen, onSelect, emptyText }
   */
  function create(container, options) {
    var opts = options || {};
    var columns = opts.columns.slice();
    var sortKey = null, sortDir = "asc";
    var filters = {};              // 열별 필터
    var filterRowOpen = false;
    // 열 제목 정렬과 열 필터를 쓸지. false 면 눌러도 자료 순서를 바꾸지 않는다.
    var sortable = opts.sortable !== false;
    var selectedId = null;
    var widths = {};               // 사용자가 조절한 열 너비

    container.classList.add("grid-wrap");

    function visibleRecords() {
      var rows = (opts.getRecords() || []).filter(function (rec) {
        return columns.every(function (col) {
          var q = (filters[col.key] || "").trim().toUpperCase();
          if (!q) return true;
          return PourRecords.displayValue(rec, col, 0).toUpperCase().indexOf(q) >= 0;
        });
      });
      if (sortKey) {
        var column = null;
        columns.forEach(function (c) { if (c.key === sortKey) column = c; });
        rows = sortBy(rows, column, sortDir);
      }
      return rows;
    }

    function sortBy(rows, column, dir) {
      if (!column) return rows;
      var sign = dir === "desc" ? -1 : 1;
      return rows.slice().sort(function (a, b) {
        if (column.type === "number" || column.type === "money") {
          var na = a[column.key] === "" || a[column.key] == null ? -Infinity : Number(a[column.key]);
          var nb = b[column.key] === "" || b[column.key] == null ? -Infinity : Number(b[column.key]);
          return (na - nb) * sign;
        }
        return PourRecords.displayValue(a, column, 0)
          .localeCompare(PourRecords.displayValue(b, column, 0), "ko") * sign;
      });
    }

    function statusBadge(value) {
      var badge = el("span", "status-badge", value);
      badge.setAttribute("data-status", value);
      return badge;
    }

    function multiBadge(record) {
      var stats = PourRecords.patentStats(record, null);
      if (!stats.isMulti && !stats.noticeMultiFlag) return null;
      var badge = el("span", "multi-badge", stats.label);
      badge.setAttribute("data-badge", stats.badge);
      badge.title = stats.detail;
      return badge;
    }

    function render() {
      container.innerHTML = "";
      var rows = visibleRecords();

      var table = el("table", "grid");
      var thead = el("thead");
      var headRow = el("tr");

      columns.forEach(function (col) {
        var th = el("th");
        if (col.pin) th.className = "is-pinned";
        if (widths[col.key]) th.style.width = widths[col.key] + "px";

        var label = el("span", "grid-th-label", col.title);
        // sortable: false 인 표는 열 제목을 눌러도 정렬하지 않는다 (자료 순서는 그대로 둔다)
        if (sortable) {
          label.title = col.title + " — 눌러서 정렬";
          label.addEventListener("click", function () {
            if (col.type === "seq") return;
            sortDir = sortKey === col.key && sortDir === "asc" ? "desc" : "asc";
            sortKey = col.key;
            render();
          });
        }
        th.appendChild(label);

        if (sortable && sortKey === col.key) {
          th.appendChild(el("span", "grid-sort", sortDir === "desc" ? "▼" : "▲"));
        }
        if (filters[col.key]) th.appendChild(el("span", "grid-filtered", "▣"));

        // 열 너비 조절 손잡이
        if (col.type !== "seq") {
          var handle = el("span", "grid-resize");
          handle.addEventListener("pointerdown", function (e) {
            e.preventDefault();
            e.stopPropagation();
            var startX = e.clientX, startWidth = th.getBoundingClientRect().width;
            function move(ev) {
              var next = Math.max(50, Math.round(startWidth + (ev.clientX - startX)));
              widths[col.key] = next;
              th.style.width = next + "px";
            }
            function up() {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            }
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          });
          th.appendChild(handle);
        }
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);

      if (filterRowOpen && sortable) {
        var filterRow = el("tr", "grid-filter-row");
        columns.forEach(function (col) {
          var td = el("th");
          if (col.pin) td.className = "is-pinned";
          if (col.type !== "seq") {
            var input = document.createElement("input");
            input.type = "search";
            input.value = filters[col.key] || "";
            input.placeholder = "필터";
            input.setAttribute("data-filter", col.key);
            input.addEventListener("input", function () {
              filters[col.key] = input.value;
              var at = input.selectionStart;
              render();
              var again = container.querySelector('[data-filter="' + col.key + '"]');
              if (again) { again.focus(); again.setSelectionRange(at, at); }
            });
            td.appendChild(input);
          }
          filterRow.appendChild(td);
        });
        thead.appendChild(filterRow);
      }
      table.appendChild(thead);

      var tbody = el("tbody");
      rows.forEach(function (rec, i) {
        var tr = el("tr");
        tr.setAttribute("data-record-id", rec.id);
        if (rec.id === selectedId) tr.className = "is-selected";

        columns.forEach(function (col) {
          var td = el("td");
          if (col.pin) td.className = "is-pinned";
          if (WRAP_TYPES[col.type]) td.classList.add("cell-wrap");
          else if (col.type === "number" || col.type === "money") td.classList.add("cell-num");
          else if (col.type === "seq") td.classList.add("cell-seq");

          var value = PourRecords.displayValue(rec, col, i);
          if (col.key === "status") {
            td.appendChild(statusBadge(value));
            var badge = multiBadge(rec);
            if (badge) td.appendChild(badge);
          } else if (WRAP_TYPES[col.type]) {
            // 줄 수가 많으면 행이 지나치게 높아지므로 세 줄까지만 보이고 나머지는 툴팁으로
            var lines = el("span", "cell-lines", value);
            if (String(value).split("\n").length > 3) lines.classList.add("is-clamped");
            td.appendChild(lines);
            if (value) td.title = value;
          } else {
            td.textContent = value;
            if (value) td.title = value;
          }
          tr.appendChild(td);
        });

        tr.addEventListener("click", function () {
          selectedId = rec.id;
          render();
          if (opts.onSelect) opts.onSelect(rec);
        });
        tr.addEventListener("dblclick", function () {
          if (opts.onOpen) opts.onOpen(rec);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);

      if (!rows.length) {
        container.appendChild(el("div", "grid-empty", opts.emptyText || "표시할 자료가 없습니다."));
      }
    }

    return {
      render: render,
      toggleFilterRow: function () {
        if (!sortable) return false;          // 필터 행을 쓰지 않는 표
        filterRowOpen = !filterRowOpen;
        render();
        return filterRowOpen;
      },
      clearFilters: function () { filters = {}; render(); },
      getFilters: function () { return JSON.parse(JSON.stringify(filters)); },
      getSort: function () { return { key: sortKey, dir: sortDir }; },
      setSort: function (key, dir) { sortKey = key; sortDir = dir || "asc"; render(); },
      getSelected: function () {
        return (opts.getRecords() || []).filter(function (r) { return r.id === selectedId; })[0] || null;
      },
      clearSelection: function () { selectedId = null; render(); },
      getVisible: visibleRecords
    };
  }

  root.PourGrid = { create: create };
})(typeof self !== "undefined" ? self : this);
