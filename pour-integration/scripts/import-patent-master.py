#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
월말실적 엑셀에서 특허 마스터와 현장별 특허 기록을 뽑는다.

  python3 pour-integration/scripts/import-patent-master.py <월말실적.xlsx>

읽는 시트
  「특허(N)」          특허 마스터  — 특허번호 / 업체명 / 공법명 / 발명의 명칭
  「26년 피벗용(쿼리)」 현장별 기록  — 단지명 / 특허번호 / 업체명 / 공종 / 지역 / 공고일

만드는 것
  test/fixtures-patent-master.json   특허 마스터 (번호마다 한 건)
  nextjs/drizzle/seed-patent-master.sql  같은 내용의 UPSERT SQL

원칙
  · 업체명·공법명을 추정하지 않는다. 엑셀에 없으면 비워 두고 "미분류" 로 남긴다
  · 같은 특허번호는 한 건으로 합친다 (중복 생성 금지)
  · 개별 특허의 구분과 현장 전체의 구분을 섞지 않는다
    - 엑셀의 "구분" 열(타사·다특허·POUR·다특허(PD)·DO·CNC)은 그 현장의 구분이다
    - 개별 특허의 구분은 업체명이 POUR 업체인지로만 정하고, 모르면 미분류로 둔다
  · DELETE / DROP / 표 교체를 쓰지 않는다
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

BASE = Path(__file__).resolve().parent.parent

# POUR 자사 특허를 가진 업체. 이 목록에 있는 것만 POUR 로 본다.
# (엑셀에 적힌 업체명 그대로. 여기 없는 업체는 추정하지 않고 타사/미분류로 둔다)
POUR_COMPANIES = {"㈜넷폼알앤디", "넷폼알앤디", "(주)넷폼알앤디"}

TYPE_POUR, TYPE_THIRD, TYPE_UNKNOWN = "POUR", "타사", "미분류"


def norm_number(raw):
    """
    특허번호에서 숫자만 남긴다. pour-patents.js 의 normalizeNumber 와 같은 규칙이라야
    앱이 쓰는 번호와 어긋나지 않는다.

      9자리  10-1935719     → 앞 두 자리(권리구분)를 뗀다
      13자리 10-2017-0012345 → 마찬가지
      그 밖  그대로 둔다

    「특허(N)」 시트 1열에는 공법명 글자도 섞여 있어("아크릴 2중주입공법"),
    숫자가 몇 개 안 나오는 것은 특허번호로 보지 않는다.
    """
    digits = re.sub(r"\D", "", str(raw or ""))
    if not digits:
        return ""
    if len(digits) in (9, 13) and (digits.startswith("10") or digits.startswith("20")):
        digits = digits[2:]
    # 등록번호는 7자리다. 그보다 짧으면 특허번호가 아니라 글자에서 딸려 나온 숫자다.
    if len(digits) < 7:
        return ""
    return digits


def text(v):
    return str(v).strip() if v is not None else ""


def patent_type_for(company):
    """개별 특허 한 건의 구분. 업체명을 모르면 미분류로 둔다 (추정하지 않는다)."""
    if not company:
        return TYPE_UNKNOWN
    return TYPE_POUR if company in POUR_COMPANIES else TYPE_THIRD


def read_master(wb):
    """「특허(N)」 시트 → 특허번호마다 한 건."""
    if "특허(N)" not in wb.sheetnames:
        return {}
    ws = wb["특허(N)"]
    # 제목 줄 찾기 (앞쪽 몇 줄 안에 "특허번호" 가 있다)
    header = None
    for r in range(1, min(ws.max_row, 10) + 1):
        if text(ws.cell(r, 1).value) == "특허번호":
            header = r
            break
    if header is None:
        return {}

    out = {}
    for r in range(header + 1, ws.max_row + 1):
        number = norm_number(ws.cell(r, 1).value)
        if not number:
            continue
        company = text(ws.cell(r, 3).value)
        method = text(ws.cell(r, 4).value)
        name = text(ws.cell(r, 5).value)     # 발명의 명칭
        if number in out:
            # 같은 번호가 여러 줄이면 비어 있는 칸만 채운다
            rec = out[number]
            if not rec["company"] and company:
                rec["company"] = company
                rec["patentType"] = patent_type_for(company)
            if not rec["methodName"] and method:
                rec["methodName"] = method
            if not rec["name"] and name:
                rec["name"] = name
            continue
        out[number] = {
            "number": number,
            "name": name,
            "company": company,
            "methodName": method,
            "patentType": patent_type_for(company),
            "categories": [],
            "category": "",
            "remark": "",
            "prefix": "",
            "active": True,
            "firstSeenAt": "",
            "lastSeenAt": "",
        }
    return out


def read_sites(wb, master):
    """「26년 피벗용(쿼리)」 시트 → 현장별 특허 기록. 마스터에 없는 번호는 미분류로 더한다."""
    if "26년 피벗용(쿼리)" not in wb.sheetnames:
        return []
    ws = wb["26년 피벗용(쿼리)"]
    rows = []
    for r in range(2, ws.max_row + 1):
        client = text(ws.cell(r, 3).value)
        number = norm_number(ws.cell(r, 6).value)
        if not client or not number:
            continue
        company = text(ws.cell(r, 7).value)
        notice = ws.cell(r, 9).value
        rows.append({
            "client": client,
            "number": number,
            "company": company,
            # 엑셀의 "구분" 은 그 현장의 구분이다. 개별 특허 구분으로 쓰지 않는다.
            "siteClassRaw": text(ws.cell(r, 2).value),
            "categoryGroup": text(ws.cell(r, 4).value),
            "category": text(ws.cell(r, 5).value),
            "projectName": text(ws.cell(r, 8).value),
            "noticeDate": notice.strftime("%Y-%m-%d") if hasattr(notice, "strftime") else "",
            "region": text(ws.cell(r, 11).value),
            "city": text(ws.cell(r, 12).value),
        })
        # 마스터에 없는 번호는 여기서 미분류로 등록한다 (업체명은 엑셀에 있을 때만 담는다)
        if number not in master:
            master[number] = {
                "number": number, "name": "", "company": company,
                "methodName": "", "patentType": patent_type_for(company),
                "categories": [], "category": "", "remark": "", "prefix": "",
                "active": True, "firstSeenAt": "", "lastSeenAt": "",
            }
        elif not master[number]["company"] and company:
            master[number]["company"] = company
            master[number]["patentType"] = patent_type_for(company)
    return rows


def sql_text(v):
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    path = Path(sys.argv[1])
    if not path.exists():
        print(f"파일을 찾지 못했습니다: {path}")
        return 1

    wb = openpyxl.load_workbook(path, data_only=True)
    master = read_master(wb)
    from_master = len(master)
    sites = read_sites(wb, master)

    # 현장에서 처음/마지막으로 본 날을 채운다 (공고일 기준. 없으면 비워 둔다)
    seen = {}
    for row in sites:
        if not row["noticeDate"]:
            continue
        at = seen.setdefault(row["number"], [row["noticeDate"], row["noticeDate"]])
        at[0] = min(at[0], row["noticeDate"])
        at[1] = max(at[1], row["noticeDate"])
    for number, (first, last) in seen.items():
        master[number]["firstSeenAt"] = first
        master[number]["lastSeenAt"] = last

    records = sorted(master.values(), key=lambda r: r["number"])

    out_json = BASE / "test" / "fixtures-patent-master.json"
    out_json.write_text(json.dumps(
        {"master": records, "siteLinks": sites}, ensure_ascii=False, indent=1), encoding="utf-8")

    lines = [
        "-- 특허 마스터 옮겨 심기 (번호 기준 UPSERT · 지우지 않음)",
        "-- import-patent-master.py 가 만든 파일입니다. 손으로 고치지 마세요.",
        "-- 업체명·공법명이 비어 있는 건은 '미분류' 입니다. 값을 지어내지 않았습니다.",
        "",
    ]
    for rec in records:
        lines.append(
            "INSERT INTO pour_patents "
            "(number, display, name, categories, company, prefix, remark, active, "
            "created_at, updated_at, patent_type, method_name, first_seen_at, last_seen_at) VALUES ("
            f"{sql_text(rec['number'])}, {sql_text('제10-' + rec['number'] + '호')}, "
            f"{sql_text(rec['name'])}, NULL, {sql_text(rec['company'])}, NULL, NULL, 1, "
            f"NULL, NULL, {sql_text(rec['patentType'])}, {sql_text(rec['methodName'])}, "
            f"{sql_text(rec['firstSeenAt'])}, {sql_text(rec['lastSeenAt'])})\n"
            "ON CONFLICT(number) DO UPDATE SET\n"
            "  name = COALESCE(NULLIF(excluded.name, ''), pour_patents.name),\n"
            "  company = COALESCE(NULLIF(excluded.company, ''), pour_patents.company),\n"
            "  method_name = COALESCE(NULLIF(excluded.method_name, ''), pour_patents.method_name),\n"
            "  patent_type = CASE WHEN excluded.patent_type = '미분류'\n"
            "                     THEN COALESCE(pour_patents.patent_type, excluded.patent_type)\n"
            "                     ELSE excluded.patent_type END,\n"
            "  first_seen_at = COALESCE(NULLIF(excluded.first_seen_at, ''), pour_patents.first_seen_at),\n"
            "  last_seen_at = COALESCE(NULLIF(excluded.last_seen_at, ''), pour_patents.last_seen_at);"
        )
    (BASE / "nextjs" / "drizzle" / "seed-patent-master.sql").write_text(
        "\n".join(lines) + "\n", encoding="utf-8")

    by_type = {}
    for rec in records:
        by_type[rec["patentType"]] = by_type.get(rec["patentType"], 0) + 1
    site_names = {row["client"] for row in sites}
    multi = {}
    for row in sites:
        multi.setdefault(row["client"], set()).add(row["number"])
    multi_count = sum(1 for v in multi.values() if len(v) > 1)

    print(f"특허 마스터        {len(records)}건 (「특허(N)」 {from_master}건 + 현장에서 새로 본 {len(records) - from_master}건)")
    for t in (TYPE_POUR, TYPE_THIRD, TYPE_UNKNOWN):
        print(f"  {t:<5} {by_type.get(t, 0)}건")
    print(f"현장별 특허 기록   {len(sites)}줄 · 현장 {len(site_names)}곳 · 특허 2개 이상 {multi_count}곳")
    print(f"\n  {out_json.relative_to(BASE.parent)}")
    print(f"  {(BASE / 'nextjs' / 'drizzle' / 'seed-patent-master.sql').relative_to(BASE.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
