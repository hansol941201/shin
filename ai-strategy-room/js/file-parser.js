/**
 * file-parser.js
 * 첨부 자료를 텍스트로 변환하는 모듈.
 * 지금 버전은 TXT/CSV를 실제로 파싱한다. XLSX/PDF/DOCX는 확장 가능한 구조로만
 * 등록해두고, 아직 파싱 로직이 없으면 사용자에게 명확한 한국어 메시지를 보여준다.
 *
 * 확장 방법: PARSERS 객체에 확장자별 처리 함수를 추가하면 된다.
 *   PARSERS['xlsx'] = async (file) => { ... return '텍스트'; };
 */

const PARSERS = {
  txt: parseTxt,
  csv: parseCsv,
  // 확장 예정 (아직 미구현) — 값이 null이면 "지원 예정" 메시지를 보여준다.
  xlsx: null,
  pdf: null,
  docx: null
};

async function parseTxt(file) {
  return await file.text();
}

async function parseCsv(file) {
  const raw = await file.text();
  // 아주 단순한 CSV → 사람이 읽기 좋은 표 형태 텍스트로 변환 (따옴표로 감싼 콤마는 고려하지 않는 기본 파서)
  const rows = raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(','));
  if (!rows.length) return '';

  const header = rows[0];
  const body = rows.slice(1);
  const lines = [`[표 데이터] 열: ${header.join(' | ')}`];
  body.forEach((row, i) => {
    const cells = header.map((h, idx) => `${h.trim()}=${(row[idx] || '').trim()}`).join(', ');
    lines.push(`행 ${i + 1}: ${cells}`);
  });
  return lines.join('\n');
}

function getExtension(fileName) {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * 첨부된 File 객체 목록을 받아 { fileName, ok, text, message } 배열로 변환한다.
 */
async function parseFiles(fileList) {
  const results = [];
  for (const file of fileList) {
    const ext = getExtension(file.name);
    const parser = PARSERS[ext];
    if (parser === undefined) {
      results.push({
        fileName: file.name,
        ok: false,
        text: '',
        message: `"${ext || '알 수 없음'}" 형식은 아직 지원하지 않습니다. TXT, CSV 파일을 이용해주세요.`
      });
      continue;
    }
    if (parser === null) {
      results.push({
        fileName: file.name,
        ok: false,
        text: '',
        message: `"${ext.toUpperCase()}" 파일 분석 기능은 준비 중입니다. 지금은 TXT, CSV만 실제로 분석됩니다.`
      });
      continue;
    }
    try {
      const text = await parser(file);
      results.push({ fileName: file.name, ok: true, text, message: '' });
    } catch (err) {
      results.push({
        fileName: file.name,
        ok: false,
        text: '',
        message: `"${file.name}" 파일을 읽는 중 오류가 발생했습니다. 파일이 손상되지 않았는지 확인해주세요.`
      });
    }
  }
  return results;
}
