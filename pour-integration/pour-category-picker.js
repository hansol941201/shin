/**
 * 공종 고르기 — 대분류를 먼저 고르고 그 안의 세부 공종을 여러 개 고른다.
 *
 *   var picker = PourCategoryPicker.create(container, { onChange: fn });
 *   picker.setValue(record);      // 또는 항목 배열 / 이름 배열
 *   picker.getValue();            // [{ group, name }, ...]
 *
 * 규칙
 *   · 대분류를 고르면 그 대분류의 세부 공종만 보인다
 *   · 세부 공종은 여러 개 고를 수 있고, 다시 누르면 해제된다
 *   · 같은 이름이 여러 대분류에 있어도 고른 대분류 기준으로 저장한다
 *   · 기타를 고르면 직접 적는 칸이 나온다
 *   · 분류표에 없는 옛 자료는 기타로 보이되 이름은 그대로 남는다
 */
(function (root, factory) {
  var node = typeof require === "function" && typeof module === "object";
  var categories = node ? require("./pour-categories.js") : root.PourCategories;
  var api = factory(categories);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PourCategoryPicker = api;
})(typeof self !== "undefined" ? self : this, function (PourCategories) {
  "use strict";

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function create(container, options) {
    var opts = options || {};
    var items = [];                                  // [{ group, name }]
    var openGroup = PourCategories.GROUP_KEYS[0];

    container.innerHTML = "";
    container.classList.add("cat-picker");

    var groupRow = el("div", "cat-groups");
    var itemRow = el("div", "cat-items");
    var customRow = el("div", "cat-custom");
    var chipRow = el("div", "cat-chips");
    var emptyMsg = el("div", "cat-empty", "고른 공종이 없습니다. 위에서 대분류를 먼저 고르세요.");

    var customInput = document.createElement("input");
    customInput.type = "text";
    customInput.className = "cat-custom-input";
    customInput.placeholder = "공종명을 직접 입력";
    var customBtn = el("button", "cat-custom-btn", "＋ 추가");
    customBtn.type = "button";
    customRow.appendChild(customInput);
    customRow.appendChild(customBtn);

    container.appendChild(groupRow);
    container.appendChild(itemRow);
    container.appendChild(customRow);
    container.appendChild(chipRow);
    container.appendChild(emptyMsg);

    /* ------------------------------------------------------- 상태 */

    function has(group, name) {
      return items.some(function (it) { return it.group === group && it.name === name; });
    }

    function toggle(group, name) {
      var at = -1;
      items.forEach(function (it, i) {
        if (it.group === group && it.name === name) at = i;
      });
      if (at >= 0) items.splice(at, 1);
      else items.push({ group: group, name: name });
      changed();
    }

    function changed() {
      items = PourCategories.normalizeItems(items);
      render();
      if (typeof opts.onChange === "function") opts.onChange(getValue());
    }

    /* ------------------------------------------------------- 그리기 */

    function renderGroups() {
      groupRow.innerHTML = "";
      PourCategories.GROUP_KEYS.forEach(function (group) {
        var count = items.filter(function (it) { return it.group === group; }).length;
        var btn = el("button", "cat-group" + (group === openGroup ? " is-open" : ""));
        btn.type = "button";
        btn.appendChild(document.createTextNode(group));
        if (count) btn.appendChild(el("span", "cat-group-count", String(count)));
        btn.addEventListener("click", function () {
          openGroup = group;
          render();
        });
        groupRow.appendChild(btn);
      });
    }

    function renderItems() {
      itemRow.innerHTML = "";
      var list = PourCategories.itemsOf(openGroup);
      if (openGroup === PourCategories.OTHER) {
        // 기타는 미리 정한 세부 공종이 없다. 이미 고른 것만 보여 준다.
        list = items.filter(function (it) { return it.group === PourCategories.OTHER; })
          .map(function (it) { return it.name; });
      }
      if (!list.length) {
        itemRow.appendChild(el("span", "cat-hint",
          openGroup === PourCategories.OTHER
            ? "아래 칸에 공종명을 직접 적어 추가하세요."
            : "이 대분류에는 세부 공종이 없습니다."));
        return;
      }
      list.forEach(function (name) {
        var on = has(openGroup, name);
        var btn = el("button", "cat-item" + (on ? " is-on" : ""), name);
        btn.type = "button";
        btn.setAttribute("data-group", openGroup);
        btn.setAttribute("data-item", name);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.addEventListener("click", function () { toggle(openGroup, name); });
        itemRow.appendChild(btn);
      });
    }

    function renderChips() {
      chipRow.innerHTML = "";
      items.forEach(function (it) {
        var chip = el("span", "cat-chip");
        chip.appendChild(el("span", "cat-chip-group", it.group));
        chip.appendChild(el("span", "cat-chip-name", it.name));
        var x = el("button", "cat-chip-x", "×");
        x.type = "button";
        x.title = it.group + " " + it.name + " 빼기";
        x.addEventListener("click", function () { toggle(it.group, it.name); });
        chip.appendChild(x);
        chipRow.appendChild(chip);
      });
      emptyMsg.style.display = items.length ? "none" : "";
    }

    function render() {
      renderGroups();
      renderItems();
      customRow.style.display = openGroup === PourCategories.OTHER ? "" : "none";
      renderChips();
    }

    function addCustom() {
      var name = customInput.value.trim();
      if (!name) return;
      if (!has(PourCategories.OTHER, name)) items.push({ group: PourCategories.OTHER, name: name });
      customInput.value = "";
      changed();
    }
    customBtn.addEventListener("click", addCustom);
    customInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); addCustom(); }
    });

    /* ------------------------------------------------------- 바깥 창구 */

    function setValue(value) {
      var source = value && !Array.isArray(value)
        ? (Array.isArray(value.categoryItems) ? value.categoryItems : value.categories)
        : value;
      items = PourCategories.normalizeItems(source);
      // 고른 것이 있으면 그 대분류를 먼저 펼쳐 준다
      openGroup = items.length ? items[0].group : PourCategories.GROUP_KEYS[0];
      render();
    }

    function getValue() {
      return PourCategories.normalizeItems(items);
    }

    function getNames() {
      return PourCategories.namesOf(items);
    }

    /** 특허 선택 등으로 자동 입력할 때. 확실하지 않은 이름은 기타로 간다. */
    function setFromNames(names) {
      items = PourCategories.itemsFromNames(names);
      openGroup = items.length ? items[0].group : PourCategories.GROUP_KEYS[0];
      render();
      if (typeof opts.onChange === "function") opts.onChange(getValue());
    }

    function clear() {
      items = [];
      openGroup = PourCategories.GROUP_KEYS[0];
      render();
    }

    render();
    return {
      setValue: setValue,
      setFromNames: setFromNames,
      getValue: getValue,
      getNames: getNames,
      clear: clear,
      openGroup: function () { return openGroup; }
    };
  }

  return { create: create };
});
