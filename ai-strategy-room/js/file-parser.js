/**
 * file-parser.js
 * 첨부 자료를 처리하는 모듈. 두 가지 방식이 있다:
 *   1) 텍스트 추출(mode:'text') — TXT/CSV는 실제 내용을 텍스트로 뽑아서
 *      프롬프트에 그대로 이어붙인다.
 *   2) 원본 첨부(mode:'attach') — 이미지(PNG/JPG/JPEG/GIF/WEBP)와 PDF는
 *      브라우저에서 텍스트로 변환하지 않는다. 대신 base64로 인코딩해 로컬
 *      서버로 보내면, run.ps1이 임시 파일로 저장한 뒤 그 파일을 claude -p에
 *      직접 첨부해서 Claude가 이미지/문서를 실제로 읽고 분석하게 한다
 *      (무거운 클라이언트 PDF/이미지 파싱 라이브러리를 추가하지 않고,
 *      Claude 자체의 멀티모달 분석 능력을 그대로 활용하는 방식).
 *
 * XLSX/DOCX는 아직 어느 방식으로도 지원하지 않는다(준비 중 메시지만 표시).
 *
 * 확장 방법: TEXT_PARSERS 또는 ATTACH_MIME에 확장자를 추가하면 된다.
 */

const TEXT_PARSERS = {
  txt: parseTxt,
  csv: parseCsv
};

const ATTACH_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf'
};

// 확장 예정(아직 미구현) — 값이 여기 있으면 "지원 예정" 메시지를 보여준다.
const PLANNED_EXT = { xlsx: true, docx: true };

const ATTACH_MAX_BYTES = 8 * 1024 * 1024; // 파일 1개당 최대 8MB(로컬 서버 POST 부담 방지)

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

/** File을 base64 문자열로 읽는다(data URL 접두어는 제거하고 순수 base64만 반환) */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

function getExtension(fileName) {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * 첨부된 File 객체 목록을 받아 다음 형태의 배열로 변환한다:
 *   { fileName, ok, mode: 'text'|'attach', text, attachment: {mimeType, base64}|null, message }
 */
async function parseFiles(fileList) {
  const results = [];
  for (const file of fileList) {
    const ext = getExtension(file.name);

    if (TEXT_PARSERS[ext]) {
      try {
        const text = await TEXT_PARSERS[ext](file);
        results.push({ fileName: file.name, ok: true, mode: 'text', text, attachment: null, message: '' });
      } catch (err) {
        results.push({
          fileName: file.name,
          ok: false,
          mode: 'text',
          text: '',
          attachment: null,
          message: `"${file.name}" 파일을 읽는 중 오류가 발생했습니다. 파일이 손상되지 않았는지 확인해주세요.`
        });
      }
      continue;
    }

    if (ATTACH_MIME[ext]) {
      if (file.size > ATTACH_MAX_BYTES) {
        results.push({
          fileName: file.name,
          ok: false,
          mode: 'attach',
          text: '',
          attachment: null,
          message: `"${file.name}"은(는) 파일 크기가 너무 큽니다(최대 8MB). 더 작은 파일로 첨부해주세요.`
        });
        continue;
      }
      try {
        const base64 = await readFileAsBase64(file);
        results.push({
          fileName: file.name,
          ok: true,
          mode: 'attach',
          text: '',
          attachment: { mimeType: ATTACH_MIME[ext], base64, extension: ext },
          message: ''
        });
      } catch (err) {
        results.push({
          fileName: file.name,
          ok: false,
          mode: 'attach',
          text: '',
          attachment: null,
          message: `"${file.name}" 파일을 읽는 중 오류가 발생했습니다.`
        });
      }
      continue;
    }

    if (PLANNED_EXT[ext]) {
      results.push({
        fileName: file.name,
        ok: false,
        mode: 'text',
        text: '',
        attachment: null,
        message: `"${ext.toUpperCase()}" 파일 분석 기능은 준비 중입니다. 지금은 TXT·CSV(텍스트 분석)와 PNG·JPG·GIF·WEBP·PDF(Claude에게 직접 첨부)만 지원합니다.`
      });
      continue;
    }

    results.push({
      fileName: file.name,
      ok: false,
      mode: 'text',
      text: '',
      attachment: null,
      message: `"${ext || '알 수 없음'}" 형식은 아직 지원하지 않습니다. TXT·CSV·이미지(PNG/JPG/GIF/WEBP)·PDF 파일을 이용해주세요.`
    });
  }
  return results;
}
