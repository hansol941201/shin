#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pour-integration.css + app.css → nextjs/app/pour/pour.css

한 곳(app.css)만 고치면 Next.js 이식물의 화면도 같이 바뀌도록 옮겨 적는다.
손으로 두 벌을 관리하다 서로 달라지는 것을 막기 위한 스크립트다.

바뀌는 것
  · :root / body  →  .pour-scope
  · 화면 클래스     →  pour- 접두어 (아래 RENAME)
  · 모든 규칙       →  .pour-scope 아래로 넣어 앱 전역 스타일과 부딪히지 않게 한다

사용: python3 pour-integration/scripts/build-nextjs-css.py
"""
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
# 공용 모듈 스타일이 먼저, 화면 스타일이 나중에 온다 (뒤가 앞을 덮는다)
SOURCES = [BASE / "pour-integration.css", BASE / "app.css"]
OUT = BASE / "nextjs" / "app" / "pour" / "pour.css"

# app.css 클래스 → 이식물 클래스 (컴포넌트가 쓰는 이름과 같아야 한다)
RENAME = {
    "app-header": "pour-header", "app-nav": "pour-nav", "app-main": "pour-main",
    "brand": "pour-brand", "brand-name": "pour-brand-name", "brand-sub": "pour-brand-sub",
    "nav-item": "pour-nav-item", "header-right": "pour-header-right",
    "header-search": "pour-header-search", "user-chip": "pour-user-chip",
    "hamburger": "pour-hamburger", "view-title": "pour-view-title",
    "alert-bar": "pour-alert-bar", "alert-chip": "pour-alert-chip",
    "toolbar": "pour-toolbar", "tb-btn": "pour-btn", "spacer": "pour-spacer",
    "status-tabs": "pour-status-tabs", "status-tab": "pour-status-tab",
    "grid-tools": "pour-grid-tools", "grid-search": "pour-grid-search",
    "grid-count": "pour-grid-count", "grid-wrap": "pour-grid-wrap", "grid": "pour-grid",
    "grid-filter-row": "pour-filter-row", "grid-th-label": "pour-th-label",
    "grid-sort": "pour-sort", "grid-filtered": "pour-filtered",
    "grid-resize": "pour-resize", "grid-empty": "pour-grid-empty",
    "status-badge": "pour-status-badge", "multi-badge": "pour-multi-badge",
    "panel-back": "pour-panel-back", "panel": "pour-panel",
    "panel-head": "pour-panel-head", "panel-title": "pour-panel-title",
    "panel-close": "pour-panel-close", "panel-body": "pour-panel-body",
    "panel-foot": "pour-panel-foot", "rebid-check": "pour-rebid-check",
    "rebid-box": "pour-rebid-box", "sub-head": "pour-sub-head",
    "form-row": "pour-form-row", "form-row-1": "pour-form-row-1",
    "form-row-3": "pour-form-row-3", "form-row-4": "pour-form-row-4",
    "form-row-fill": "pour-form-row-fill", "form-msg": "pour-form-msg",
    "field-error": "pour-field-error", "bid-group": "pour-bid-group",
    "bid-btn": "pour-bid-btn", "sheet-tabs": "pour-sheet-tabs",
    "sheet-scroll": "pour-sheet-scroll", "sheet-tab": "pour-sheet-tab",
    "sheet-nav": "pour-sheet-nav", "sheet-search": "pour-sheet-search",
    "summary-bar": "pour-summary-bar", "stat-cards": "pour-stat-cards",
    "stat-card": "pour-stat-card", "preview-stats": "pour-preview-stats",
    "preview-errors": "pour-preview-errors",
}

# 그대로 두는 이름 (다른 클래스 안에서만 쓰이는 보조 이름)
KEEP = {
    "pour-scope", "is-active", "is-open", "is-selected", "is-pinned", "is-clamped",
    "ghost", "cnt", "opt", "req", "lbl", "val", "span-2", "span-all",
    "cell-wrap", "cell-lines", "cell-num", "cell-seq", "edit-only", "view",
}

CLASS = re.compile(r"\.([A-Za-z_][\w-]*)")


def rename_classes(selector: str) -> str:
    def swap(m):
        name = m.group(1)
        if name in KEEP or name.startswith("pour-"):
            return "." + name
        return "." + RENAME.get(name, name)
    return CLASS.sub(swap, selector)


def scope(selector: str) -> str:
    """규칙 하나를 .pour-scope 안으로 넣는다."""
    sel = rename_classes(selector.strip())
    if not sel:
        return sel
    if sel.startswith("@") or sel.startswith("%"):
        return sel
    if sel in (":root", "html", "body", "html,body", ".pour-scope"):
        return ".pour-scope"
    if sel.startswith(".pour-scope"):
        return sel
    if sel in ("*",):
        return ".pour-scope *"
    if sel.startswith(":focus-visible"):
        return ".pour-scope :focus-visible"
    # html,body 처럼 여러 개가 붙은 것은 하나씩 처리한다
    parts = [p.strip() for p in sel.split(",")]
    out = []
    for p in parts:
        if p in ("html", "body", ":root"):
            out.append(".pour-scope")
        elif p.startswith(".pour-scope"):
            out.append(p)
        else:
            out.append(".pour-scope " + p)
    seen, uniq = set(), []
    for p in out:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return ",\n".join(uniq)


# 이식물에는 없는 규칙 (화면 조건이 컴포넌트 쪽 isEdit 로 처리된다)
SKIP_SELECTOR = re.compile(r"#noticePanel")


def convert(css: str) -> str:
    """중괄호를 세어 가며 규칙 하나하나를 .pour-scope 아래로 옮긴다."""
    out = []
    depth = 0
    buffer = ""          # 아직 선택자인지 속성인지 모르는 부분
    i = 0
    while i < len(css):
        ch = css[i]

        if ch == "/" and css[i + 1:i + 2] == "*":            # 주석은 그대로 옮긴다
            end = css.find("*/", i)
            end = len(css) if end < 0 else end + 2
            buffer += css[i:end]
            i = end
            continue

        if ch == "{":
            selector = buffer
            buffer = ""
            # 선택자 앞에 붙은 주석·빈 줄은 그대로 내보내고 선택자만 다룬다
            lead_match = re.match(r"\A(?:\s|/\*.*?\*/)*", selector, flags=re.S)
            lead = lead_match.group(0) if lead_match else ""
            selector = selector[len(lead):]

            if depth == 0 and selector.strip().startswith("@"):
                out.append(lead + selector + "{")        # @media 등은 그대로 두고 안쪽만 바꾼다
            else:
                body = selector.strip()
                if SKIP_SELECTOR.search(body):
                    close = css.find("}", i)             # 규칙 전체를 건너뛴다
                    i = (len(css) if close < 0 else close + 1)
                    continue
                out.append(lead + scope(body) + "{")
            depth += 1
            i += 1
            continue

        if ch == "}":
            out.append(buffer)
            buffer = ""
            out.append("}")
            depth -= 1
            i += 1
            continue

        if depth >= 1 and not (depth == 1 and css[i:].lstrip().startswith("@")):
            # @media 안쪽은 다시 선택자가 나오므로 버퍼에 모은다
            pass
        buffer += ch
        i += 1

    out.append(buffer)
    return "".join(out)


HEAD = """/* ==========================================================================
   POUR 공사실적 관리 — 화면 스타일

   ⚠ 이 파일은 scripts/build-nextjs-css.py 가
      pour-integration.css 와 app.css 에서 만들어 냅니다.
      직접 고치지 말고 원본을 고친 뒤 아래를 실행하세요.

        python3 pour-integration/scripts/build-nextjs-css.py

   app/globals.css 와 부딪히지 않도록 모든 규칙을 .pour-scope 아래에 둡니다.
   ========================================================================== */
"""


def main():
    parts = []
    for src in SOURCES:
        css = src.read_text(encoding="utf-8")
        # 원본 머리말(첫 주석)은 생략한다
        css = re.sub(r"\A/\*.*?\*/\s*", "", css, flags=re.S)
        parts.append("/* ===== %s ===== */\n%s" % (src.name, convert(css)))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(HEAD + "\n".join(parts) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(BASE.parent)} 생성 — {round(OUT.stat().st_size / 1024)} KB")


if __name__ == "__main__":
    main()
