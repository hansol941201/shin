#!/usr/bin/env python3
"""
app.html 과 딸린 파일들을 한 파일로 합쳐 미리보기용 HTML 을 만든다.

    python3 pour-integration/scripts/build-preview.py
    python3 pour-integration/scripts/build-preview.py --with-records   (실제 실적 포함)

결과: pour-integration/preview.html (예시 자료)
      pour-integration/preview-records.html (--with-records · 저장소에 올리지 않는다)
외부 파일을 참조하지 않으므로 브라우저로 바로 열거나 어디든 올릴 수 있다.
자료(특허 50건 + 연도별 실적 List 엑셀에서 옮겨 온 실적)가 들어 있어 빈 화면으로 열리지 않는다.

엑셀 라이브러리(ExcelJS)는 넣지 않는다 — 미리보기에서는 파일 내려받기가 막혀 있다.
"""
import hashlib
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

SCRIPTS = [
    "regions.data.js", "pour-region.js", "pour-patents.js", "pour-records.js",
    "pour-export.js", "pour-ui.js", "pour-patent-editor.js", "pour-grid.js", "pour-store.js",
]

# 공개 미리보기에 쓰는 예시 자료.
# 실제 발주처 이름과 관리사무소 전화번호는 절대 넣지 않는다 (공개 주소이기 때문).
SAMPLE_SITES = [
    dict(client="가나예시아파트", region="경기", city="평택", phone="031-000-0001",
         households=717, projectNames=["외벽·지하주차장 바닥 균열보수 및 도장공사", "옥상 방수공사"],
         noticeDate="2026-03-02", documentDueDate="2026-03-14", bidDate="2026-03-20",
         bidType="전자입찰", status="공고", scopes=["외벽", "옥상"],
         patents=[("POUR", "1935719"), ("POUR", "2425081"), ("POUR", "2535699")]),
    dict(client="하남미사강변도시", region="경기", city="하남", phone="031-790-1234",
         households=1240, projectNames=["외벽 재도장공사"], noticeDate="2026-01-11",
         bidDate="2026-01-25", bidType="서류접수", status="낙찰", contractor="코지건설㈜",
         contractorPhone="031-000-0002", awardDate="2026-02-05", awardAmount=1250000000,
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


def sample_records(with_records: bool = False) -> str:
    """
    기본은 예시 현장이다.
    --with-records 를 주면 연도별 실적 List 엑셀에서 옮겨 온 실제 실적을 쓴다.
    (scripts/import-records.py 가 만든 test/fixtures-records.json)

    실제 실적에는 발주처 이름과 관리사무소 전화번호가 들어 있어 저장소에 올리지 않는다.
    그래서 공개용 docs/index.html 은 언제나 예시 자료로만 만든다.
    """
    imported = BASE / "test" / "fixtures-records.json"
    if with_records:
        if not imported.exists():
            raise SystemExit(
                "test/fixtures-records.json 이 없습니다.\n"
                "  python3 pour-integration/scripts/import-records.py <실적List.xlsx> 를 먼저 실행하세요.")
        return json.dumps(json.loads(imported.read_text(encoding="utf-8")), ensure_ascii=False)

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


def build(with_records: bool = False) -> Path:
    html = read("app.html")

    css = read("pour-integration.css") + "\n" + read("app.css")

    js = "\n".join(f"/* ===== {n} ===== */\n{safe(read(n))}" for n in SCRIPTS)

    excel = json.dumps(
        json.loads((BASE / "test" / "fixtures-patent-excel.json").read_text(encoding="utf-8")),
        ensure_ascii=False)

    rows_json = sample_records(with_records)
    seed_version = hashlib.sha1(rows_json.encode("utf-8")).hexdigest()[:12]

    seed = f"""
/* ===== 미리보기 자료 (자료가 바뀌었을 때만 다시 넣는다) ===== */
(function () {{
  var SEED_KEY = "pour.preview.seed";
  var SEED_VERSION = "{seed_version}";
  if (localStorage.getItem(SEED_KEY) === SEED_VERSION) return;
  PourPatents.load({excel}, localStorage);
  var rows = {rows_json};
  rows.forEach(function (r) {{
    if (!r.categories || !r.categories.length) {{
      r.categories = PourPatents.categoriesFor(
        (r.patentItems || [])
          .filter(function (i) {{ return i.kind === "POUR"; }})
          .map(function (i) {{ return i.number; }}), localStorage);
    }}
  }});
  // id 가 같은 행만 갱신하므로 이 브라우저에서 직접 입력한 자료는 그대로 남는다
  PourRecords.saveMany(rows, localStorage);   // 한 번에 저장한다 (수천 건이어도 빠르다)
  localStorage.setItem(SEED_KEY, SEED_VERSION);
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
    미리보기입니다 — 자료가 들어 있고, 입력한 자료는 이 브라우저에만 남습니다.
    엑셀 내려받기는 미리보기에서 동작하지 않습니다.
  </div>
</div>
<main class="app-main">''')

    out = BASE / ("preview-records.html" if with_records else "preview.html")
    out.write_text(html, encoding="utf-8")

    # 실제 실적이 들어간 파일은 공개용으로 만들지 않는다
    if with_records:
        return out

    # GitHub Pages 로 올릴 때는 문서 골격이 필요하다 (아티팩트는 자동으로 감싸 준다)
    page = ("<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n"
            "<meta charset=\"UTF-8\" />\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n"
            + html.split('<div class="pour-scope">')[0]
            + "</head>\n<body>\n<div class=\"pour-scope\">"
            + html.split('<div class="pour-scope">', 1)[1]
            + "\n</body>\n</html>\n")
    docs = BASE.parent / "docs" / "index.html"
    docs.parent.mkdir(exist_ok=True)
    docs.write_text(page, encoding="utf-8")

    return out


if __name__ == "__main__":
    import sys
    with_records = "--with-records" in sys.argv
    path = build(with_records)
    print(f"{path.relative_to(BASE.parent)} 생성 — {round(path.stat().st_size / 1024)} KB")
    if with_records:
        print("실제 실적이 들어 있습니다. 저장소에 올리거나 공개하지 마세요.")
    else:
        print("docs/index.html 생성 — GitHub Pages 용 (예시 자료)")
