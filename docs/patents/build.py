# -*- coding: utf-8 -*-
"""POUR 특허 리스트.xlsx -> 단일 HTML 대장."""
import html, re, os, datetime, openpyxl

import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'POUR 특허 리스트.xlsx')
TPL = os.path.join(HERE, 'template.html')
OUT = os.path.join(HERE, 'index.html')


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
    for m in ws.merged_cells.ranges:          # 병합 셀 값을 아래 행으로 전개
        if m.min_row == 1:                    # 시트 표제 병합은 제외
            continue
        v = grid[m.min_row - 1][m.min_col - 1]
        for r in range(m.min_row - 1, m.max_row):
            for c in range(m.min_col - 1, m.max_col):
                if not grid[r][c]:
                    grid[r][c] = v
    sheets[ws.title] = grid

# 공종이 기재된 시트들. 전체·POUR 시트에는 공종 열이 없어 여기서 끌어다 붙인다.
GONGJONG_SRC = [('POUR공법_공종별 분류', '공종'), ('CNC공법', '구분'), ('DO공법', '구분'),
                ('DETEX공법', '비고'), ('(주)석민이앤씨', '구분')]
# 공종 열이 이미 있거나(공종별 분류) 공종 개념이 없는(상표) 시트는 제외
NO_GONGJONG = {'POUR공법_공종별 분류', '넷폼알앤디 상표등록증 외'}


def pkey(num, name):
    """특허번호를 우선 키로 쓰고, 번호가 없는 출원 건은 특허명으로 맞춘다."""
    n = re.sub(r'[\s제호]', '', num or '')
    if re.match(r'^\d+-\d+$', n):
        return n
    return 'T:' + re.sub(r'\s', '', name) if name else ''


GONGJONG = {}
for _sheet, _col in GONGJONG_SRC:
    _grid = sheets[_sheet]
    _cols = _grid[1]
    _i, _j, _t = _cols.index(_col), _cols.index('특허번호'), _cols.index('특허명')
    for _row in _grid[2:]:
        _row = (list(_row) + [''] * len(_cols))[:len(_cols)]
        _k, _v = pkey(_row[_j], _row[_t]), _row[_i].strip()
        if not _k or not _v or _v == '제외':
            continue
        GONGJONG.setdefault(_k, [])
        if _v not in GONGJONG[_k]:
            GONGJONG[_k].append(_v)


CFG = [
    ('전체 특허 리스트', '전체',
     '이필선·이승우 명의의 초기 등록분부터 2026년 최신 출원까지, 넷폼알앤디·석민이앤씨·스퀘어씨엠이 보유한 모든 특허를 등록일 순으로 담았습니다. 비고란이 해당 특허가 속한 공법을 나타냅니다.'),
    ('POUR공법', 'POUR공법',
     'POUR공법을 이루는 특허군입니다. 크랙 보수, 유기계 방수층, 후레싱 마감, 친환경 도장장치가 축을 이룹니다.'),
    ('POUR공법_공종별 분류', 'POUR 공종별',
     '하나의 특허가 여러 공종에 걸쳐 쓰입니다. 슁글·금속기와·듀얼·PVC·우레탄 등 공종별로 근거 특허를 묶었습니다.'),
    ('CNC공법', 'CNC공법',
     '2025년에 집중 출원·등록된 CNC공법 특허군입니다. 특허마다 적용 공종이 구분란에 지정되어 있습니다.'),
    ('DO공법', 'DO공법',
     '허지은 명의 등록분과 넷폼알앤디·스퀘어씨엠 명의 출원분으로 구성됩니다. 마지막 두 건은 아직 심사 단계입니다.'),
    ('DETEX공법', 'DETEX공법',
     '2025년 출원된 DETEX공법 특허군으로, 아홉 건 모두 등록을 마쳤습니다. 비고란이 적용 공종입니다.'),
    ('올리뉴공법', '올리뉴공법',
     '실내 벽체·천장·바닥 마감을 다루는 2026년 출원 건입니다. 등록 전 심사 단계라 특허번호는 아직 부여되지 않았습니다.'),
    ('(주)석민이앤씨', '석민이앤씨',
     '㈜석민이앤씨 명의로 보유 중인 특허입니다. 원본 시트의 표제가 "올리뉴공법"으로 잘못 적혀 있으나 내용은 석민이앤씨 건입니다.'),
    ('넷폼알앤디 상표등록증 외', '상표·디자인',
     '특허 외 지식재산권입니다. POUR공법·POUR솔루션·POUR스토어·CNC·DO·DETEX 상표와 디자인·실용신안 등록증을 함께 담았습니다.'),
]

MONO = {'NO.', '특허번호', '출원번호', '출원일', '등록일', '대리인', '비고'}
NARROW = {'NO.', '출원일', '등록일', '구분', '분류', '대리인', '브랜드'}
esc = lambda s: html.escape(s or '')


def status_of(d):
    note = (d.get('비고', '') + ' ' + d.get('구분', '')).strip()
    if '소멸' in note:
        return 'expired', '소멸'
    if d.get('등록일', '').strip():
        return 'reg', '등록'
    return 'pend', '출원·심사중'


tabs, panels = [], []
stats = {'total': 0, 'reg': 0, 'pend': 0, 'ip': 0}

for idx, (sheet, label, blurb) in enumerate(CFG):
    grid = sheets[sheet]
    cols = list(grid[1])
    while cols and not cols[-1]:
        cols.pop()

    body = []
    for row in grid[2:]:
        row = (list(row) + [''] * len(cols))[:len(cols)]
        # NO./공종만 채워진 빈 행은 버린다
        if not any(v for c, v in zip(cols, row) if c not in ('NO.', '공종') and v):
            continue
        # 전체 시트의 A열 병합값(DO, ALL RENEW)은 일련번호가 아니라 공법 표시다
        if 'NO.' in cols:
            i = cols.index('NO.')
            n = row[i].rstrip('.')
            if n and not n.isdigit():
                j = cols.index('비고') if '비고' in cols else None
                if j is not None and not row[j]:
                    row[j] = {'ALL RENEW': '올리뉴공법'}.get(n, n + '공법')
                row[i] = ''
        body.append(row)

    gcol = '공종' if '공종' in cols else None
    show = [c for c in cols if c != gcol]
    add_gongjong = sheet not in NO_GONGJONG

    rows_html, last_group, groups = [], None, 0
    tally = {'reg': 0, 'pend': 0, 'expired': 0}
    for row in body:
        d = dict(zip(cols, row))
        skey, slabel = status_of(d)
        tally[skey] += 1
        if gcol and d.get(gcol) != last_group:
            last_group = d.get(gcol)
            groups += 1
            rows_html.append(
                '<tr class="grouprow" data-group="1"><th colspan="%d" scope="colgroup">'
                '<span class="gname">%s</span></th></tr>'
                % (len(show) + 1 + add_gongjong, esc(last_group)))
        cells = ['<td class="c-status"><span class="pill p-%s">%s</span></td>' % (skey, esc(slabel))]
        tags = GONGJONG.get(pkey(d.get('특허번호', ''), d.get('특허명', '')), []) if add_gongjong else []
        if add_gongjong:
            cells.append('<td class="c-gongjong%s" data-label="공종">%s</td>' % (
                '' if tags else ' empty',
                ''.join('<span class="tag">%s</span>' % esc(t) for t in tags) if tags else '&mdash;'))
        for c in show:
            v = d.get(c, '')
            cl = [x for x in ('mono' if c in MONO else '', 'narrow' if c in NARROW else '',
                              'c-name' if c in ('특허명',) else '', '' if v else 'empty') if x]
            cells.append('<td%s data-label="%s">%s</td>' % (
                ' class="%s"' % ' '.join(cl) if cl else '', esc(c), esc(v) if v else '&mdash;'))
        blob = ' '.join([v for v in row if v] + tags).lower()
        rows_html.append('<tr data-s="%s" data-q="%s">%s</tr>' % (skey, esc(blob), ''.join(cells)))

    if sheet == '전체 특허 리스트':
        stats['total'] = len(body)
        stats['reg'] = tally['reg']
        stats['pend'] = tally['pend']
    if sheet == '넷폼알앤디 상표등록증 외':
        stats['ip'] = len(body)

    tid = 'p%d' % idx
    tabs.append('    <button class="tab" role="tab" id="t-%s" aria-controls="%s" '
                'aria-selected="false" tabindex="-1">%s<span class="tcount">%d</span></button>'
                % (tid, tid, esc(label), len(body)))

    thead = ('<th scope="col" class="c-status">상태</th>'
             + ('<th scope="col" class="c-gongjong">공종</th>' if add_gongjong else '')) + ''.join(
        '<th scope="col"%s>%s</th>' % (' class="narrow"' if c in NARROW else '', esc(c)) for c in show)

    meta = []
    if tally['reg']:
        meta.append('등록 %d건' % tally['reg'])
    if tally['pend']:
        meta.append('출원·심사중 %d건' % tally['pend'])
    if tally['expired']:
        meta.append('소멸 %d건' % tally['expired'])
    if gcol:
        meta.append('%d개 공종' % groups)

    panels.append(
        '<section class="panel" id="%s" role="tabpanel" aria-labelledby="t-%s" hidden>\n'
        '<div class="panelhead"><h2>%s</h2><p class="blurb">%s</p><p class="pmeta">%s</p></div>\n'
        '<div class="tablewrap"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>\n'
        '<p class="noresult" hidden>검색어와 맞는 항목이 없습니다. 특허명·발명자·출원번호로 다시 찾아보세요.</p>\n'
        '</section>' % (tid, tid, esc(sheet), esc(blurb), esc(' · '.join(meta)), thead, ''.join(rows_html)))

updated = max(v for g in sheets.values() for r in g for v in r
              if re.fullmatch(r'20\d\d-\d\d-\d\d', v or ''))

out = open(TPL).read()
for k, v in (('__TABS__', '\n'.join(tabs)), ('__PANELS__', '\n\n'.join(panels)),
             ('__TOTAL__', str(stats['total'])), ('__REG__', str(stats['reg'])),
             ('__PEND__', str(stats['pend'])), ('__IP__', str(stats['ip'])),
             ('__UPDATED__', updated)):
    out = out.replace(k, v)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w').write(out)
print('stats', stats, '| updated', updated, '| bytes', len(out))
