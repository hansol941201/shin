# -*- coding: utf-8 -*-
"""POUR 특허 리스트.xlsx -> hansol-knowledge/patents.js (window.PATENTS)."""
import json, re, os, sys, datetime, openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'POUR 특허 리스트.xlsx')
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/user/hansol-knowledge/patents.js'


def conv(c):
    if c is None:
        return ''
    if isinstance(c, (datetime.datetime, datetime.date)):
        return c.strftime('%Y-%m-%d')
    return re.sub(r'\s+', ' ', str(c)).strip()


wb = openpyxl.load_workbook(SRC, data_only=True)
sheets = {}
for ws in wb.worksheets:
    grid = [[conv(c) for c in r] for r in ws.iter_rows(values_only=True)]
    for m in ws.merged_cells.ranges:
        if m.min_row == 1:
            continue
        v = grid[m.min_row - 1][m.min_col - 1]
        for r in range(m.min_row - 1, m.max_row):
            for c in range(m.min_col - 1, m.max_col):
                if not grid[r][c]:
                    grid[r][c] = v
    sheets[ws.title] = grid


def pkey(num, name):
    n = re.sub(r'[\s제호]', '', num or '')
    return n if re.match(r'^\d+-\d+$', n) else ('T:' + re.sub(r'\s', '', name) if name else '')


# 공종은 여러 시트에 흩어져 있어 특허번호 기준으로 모은다.
GONGJONG = {}
for sheet, col in [('POUR공법_공종별 분류', '공종'), ('CNC공법', '구분'), ('DO공법', '구분'),
                   ('DETEX공법', '비고'), ('(주)석민이앤씨', '구분')]:
    grid = sheets[sheet]
    cols = grid[1]
    i, j, t = cols.index(col), cols.index('특허번호'), cols.index('특허명')
    for row in grid[2:]:
        row = (list(row) + [''] * len(cols))[:len(cols)]
        k, v = pkey(row[j], row[t]), row[i].strip()
        if k and v and v != '제외':
            GONGJONG.setdefault(k, [])
            if v not in GONGJONG[k]:
                GONGJONG[k].append(v)

items = []

# ── 특허 ──
grid = sheets['전체 특허 리스트']
cols = grid[1]
idx = {c: n for n, c in enumerate(cols) if c}
for row in grid[2:]:
    row = (list(row) + [''] * len(cols))[:len(cols)]
    d = {c: row[n] for c, n in idx.items()}
    if not (d.get('특허명') or d.get('특허번호')):
        continue
    no = d.get('NO.', '').rstrip('.')
    note = d.get('비고', '')
    if no and not no.isdigit():          # A열 병합값(DO, ALL RENEW)은 공법 표시다
        note = note or {'ALL RENEW': '올리뉴공법'}.get(no, no + '공법')
        no = ''
    items.append({
        'kind': '특허',
        'no': no,
        'num': d.get('특허번호', ''),
        'name': d.get('특허명', ''),
        'gongjong': GONGJONG.get(pkey(d.get('특허번호', ''), d.get('특허명', '')), []),
        'gongbeop': note,
        'owner': d.get('특허권자', ''),
        'inventor': d.get('발명자', ''),
        'appNum': d.get('출원번호', ''),
        'appDate': d.get('출원일', ''),
        'regDate': d.get('등록일', ''),
        'agent': d.get('대리인', ''),
    })

# ── 상표 · 디자인 · 실용신안 ──
grid = sheets['넷폼알앤디 상표등록증 외']
cols = grid[1]
idx = {c: n for n, c in enumerate(cols) if c}
for row in grid[2:]:
    row = (list(row) + [''] * len(cols))[:len(cols)]
    d = {c: row[n] for c, n in idx.items()}
    if not (d.get('특허명') or d.get('특허번호')):
        continue
    items.append({
        'kind': d.get('분류', '').replace('등록증', '') or '상표',
        'no': d.get('NO.', ''),
        'num': d.get('특허번호', ''),
        'name': d.get('특허명', ''),
        'gongjong': [],
        'gongbeop': d.get('브랜드', ''),
        'owner': d.get('창작자/상표권자', '') or d.get('디자인권자', ''),
        'inventor': d.get('디자인권자', ''),
        'appNum': d.get('출원번호', ''),
        'appDate': d.get('출원일', ''),
        'regDate': d.get('등록일', ''),
        'agent': d.get('대리인', ''),
    })

for it in items:
    it['status'] = ('소멸' if '소멸' in it['gongbeop']
                    else '등록' if it['regDate'] else '출원·심사중')

body = ',\n'.join('  ' + json.dumps(it, ensure_ascii=False, sort_keys=True) for it in items)
open(OUT, 'w').write(
    '// POUR 특허 리스트.xlsx 에서 생성한 특허·상표·디자인 목록입니다.\n'
    '// 직접 고치지 말고 원본 엑셀을 갱신한 뒤 build_patents_js.py 를 다시 돌리세요.\n'
    'window.PATENTS = [\n%s\n];\n' % body)

hit = sum(1 for i in items if i['gongjong'])
print('%d건 (특허 %d, 그 외 %d) · 공종 매칭 %d건 · %s' % (
    len(items), sum(1 for i in items if i['kind'] == '특허'),
    sum(1 for i in items if i['kind'] != '특허'), hit, OUT))
