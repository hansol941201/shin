#!/usr/bin/env python3
"""
app.html 과 딸린 파일들을 한 파일로 합쳐 미리보기용 HTML 을 만든다.

    python3 pour-integration/scripts/build-preview.py

결과: pour-integration/preview.html
외부 파일을 참조하지 않으므로 브라우저로 바로 열거나 어디든 올릴 수 있다.
예시 자료(첨부 엑셀의 특허 50건 + 현장 7곳)가 들어 있어 빈 화면으로 열리지 않는다.

엑셀 라이브러리(ExcelJS)는 넣지 않는다 — 미리보기에서는 파일 내려받기가 막혀 있다.
"""
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

SCRIPTS = [
    "regions.data.js", "pour-region.js", "pour-patents.js", "pour-records.js",
    "pour-export.js", "pour-ui.js", "pour-patent-editor.js", "pour-grid.js", "pour-store.js",
]

SAMPLE_SITES = [
    dict(client="평택비전지웰푸르지오", region="경기", city="평택", phone="031-647-3158",
         households=717, projectNames=["외벽·지하주차장 바닥 균열보수 및 도장공사", "옥상 방수공사"],
         noticeDate="2026-03-02", documentDueDate="2026-03-14", bidDate="2026-03-20",
         bidType="전자입찰", status="공고", scopes=["외벽", "옥상"],
         patents=[("POUR", "1935719"), ("POUR", "2425081"), ("POUR", "2535699")]),
    dict(client="하남미사강변도시", region="경기", city="하남", phone="031-790-1234",
         households=1240, projectNames=["외벽 재도장공사"], noticeDate="2026-01-11",
         bidDate="2026-01-25", bidType="서류접수", status="낙찰", contractor="코지건설㈜",
         contractorPhone="031-647-3158", awardDate="2026-02-05", awardAmount=1250000000,
         quality="우수", patents=[("POUR", "2425081"), ("THIRD", "2091977", "균열보수 공법", "타사명")]),
    dict(client="금산주공아파트", region="충남", city="금산", phone="041-555-0001",
         households=430, projectNames=["외벽 도장공사"], noticeDate="2026-02-05",
         bidType="전자입찰", status="낙찰", contractor="가나건설", contractorPhone="041-222-3333",
         awardDate="2026-03-10", awardAmount=800000000, patents=[],
         categories=["균열보수 및 재도장"], noticePatentText="POUR공법"),
    dict(client="양산센트럴자이", region="경남", city="양산", phone="055-123-4567",
         households=880, projectNames=["지하주차장 에폭시 바닥공사"], noticeDate="2026-04-01",
         documentDueDate="2026-04-12", bidDate="2026-04-18", bidType="전자입찰", status="공고",
         patents=[("POUR", "2780472"), ("THIRD", "2474761", "방수 공법", "다른회사"),
                  ("THIRD", "1234567", "도장 공법", "세번째회사")]),
    dict(client="서울강남래미안", region="서울", city="강남", phone="02-1234-5678",
         households=2100, projectNames=["옥상 슁글 교체공사"], noticeDate="2026-05-02",
         bidType="서류접수", status="유찰", patents=[("POUR", "2122691")]),
    dict(client="부산해운대엘시티", region="부산", city="해운대", households=1560,
         projectNames=["금속기와 코팅공사"], noticeDate="2026-06-01", bidType="전자입찰",
         status="재공고", patents=[("POUR", "2119347")], rebidRound=1),
    dict(client="대전유성푸르지오", region="대전", city="유성", phone="042-777-8888",
         households=640, projectNames=["아스콘 도로포장공사"], noticeDate="2026-06-20",
         bidType="서류접수", status="타공법 낙찰", contractor="타사건설",
         contractorPhone="042-111-2222", awardDate="2026-07-10", awardAmount=430000000,
         patents=[], categories=["아스콘 도로포장"]),
]


def read(name: str) -> str:
    return (BASE / name).read_text(encoding="utf-8")


def safe(js: str) -> str:
    """스크립트 블록이 주석 속 </script> 때문에 일찍 끊기지 않게 한다."""
    return js.replace("</script>", "<\\/script>")


def sample_records() -> str:
    rows = []
    for site in SAMPLE_SITES:
        record = {k: v for k, v in site.items() if k != "patents"}
        record["patentItems"] = [
            {"kind": "POUR", "number": p[1]} if p[0] == "POUR"
            else {"kind": "THIRD_PARTY", "number": p[1], "name": p[2], "company": p[3]}
            for p in site["patents"]
        ]
        rows.append(record)
    return json.dumps(rows, ensure_ascii=False)


def build() -> Path:
    html = read("app.html")

    css = read("pour-integration.css") + "\n" + read("app.css")

    js = "\n".join(f"/* ===== {n} ===== */\n{safe(read(n))}" for n in SCRIPTS)

    excel = json.dumps(
        json.loads((BASE / "test" / "fixtures-patent-excel.json").read_text(encoding="utf-8")),
        ensure_ascii=False)

    seed = f"""
/* ===== 미리보기용 예시 자료 (처음 열 때 한 번만) ===== */
(function () {{
  if (localStorage.getItem("pour.records.v1")) return;
  PourPatents.load({excel}, localStorage);
  {sample_records()}.forEach(function (r) {{
    if (!r.categories) {{
      r.categories = PourPatents.categoriesFor(
        (r.patentItems || [])
          .filter(function (i) {{ return i.kind === "POUR"; }})
          .map(function (i) {{ return i.number; }}), localStorage);
    }}
    PourRecords.save(r, localStorage);
  }});
}})();
"""

    html = re.sub(r'<script src="vendor/exceljs\.min\.js"></script>\s*', "", html)
    for name in SCRIPTS:
        html = re.sub(r'<script src="%s"></script>\s*' % re.escape(name), "", html)
    html = html.replace(
        '<script src="app.js"></script>',
        "<script>\n" + js + "\n" + seed + "\n" + safe(read("app.js")) + "\n</script>")

    # 문서 골격은 올리는 쪽에서 감싸므로 본문만 남긴다
    html = re.sub(r"^.*?<body class=\"pour-scope\">", "", html, flags=re.S)
    html = html.replace("</body>", "").replace("</html>", "")
    # 스타일은 head 를 걷어낸 뒤에 붙인다 (head 에 두면 함께 사라진다)
    html = ('<title>POUR 공사실적 관리</title>\n'
            "<style>\nbody{background:#F4F6F8;margin:0;}\n" + css + "\n</style>\n"
            '<div class="pour-scope">' + html + "</div>")

    html = html.replace('<main class="app-main">', '''<div style="padding:8px 16px 0">
  <div class="alert-chip" style="cursor:default;background:#EEF3FB;border-color:#33415F;color:#17213B">
    미리보기입니다 — 예시 자료가 들어 있고, 입력한 자료는 이 브라우저에만 남습니다.
    엑셀 내려받기는 미리보기에서 동작하지 않습니다.
  </div>
</div>
<main class="app-main">''')

    out = BASE / "preview.html"
    out.write_text(html, encoding="utf-8")
    return out


if __name__ == "__main__":
    path = build()
    print(f"{path.relative_to(BASE.parent)} 생성 — {round(path.stat().st_size / 1024)} KB")
