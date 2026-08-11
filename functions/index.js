// functions/index.js — 한솔2("v2/index.html") "AI 문구정리" 전용 서버 함수.
//
// 이 파일이 존재하는 이유: 예전에는 v2/index.html이 브라우저에서 OpenAI에 직접
// fetch()했고, 그러려면 OpenAI API 키를 브라우저(localStorage 'work-guide-openai-key')에
// 두어야 했다. 이 함수는 그 호출을 서버로 옮겨, 키가 다시는 브라우저/JS 번들/저장소에
// 존재하지 않도록 한다. 키는 Firebase Secret Manager(defineSecret)에만 있고, 이 함수의
// 실행 환경에서만 잠깐 읽힌다 — 코드 어디에도 하드코딩하지 않는다.
//
// 인증: onCall(콜러블)이 아니라 onRequest + 수동 Firebase ID 토큰 검증을 선택했다.
// 이유는 이 프로젝트가 이미 Firebase Auth를 v2/index.html 안에서 "브라우저 SDK를
// classic <script type=module> 안의 동적 import"로만 쓰고 있고(§firebase-app.js/
// firebase-auth.js CDN import), httpsCallable을 쓰려면 firebase/functions 클라이언트
// SDK를 새로 들여와야 한다. 이미 있는 fetch() 패턴(callOpenAI가 쓰던 것과 동일한 모양)에
// 'Authorization: Bearer <Firebase ID token>' 헤더만 실어 보내는 편이 기존 코드 스타일과
// 가장 가깝고, 새 SDK 의존성도 추가하지 않는다. 대신 이 함수는 반드시 유효한 Firebase ID
// 토큰이 없으면 401로 거절한다 — 공개 인터넷에서 아무나 호출할 수 없다.
//
// 프롬프트 구성 규칙(AI_RULES/PROTECTED_FIELDS/모드별 buildPrompt)은 v2/index.html의
// 기존 클라이언트 코드에서 문구 1자도 바꾸지 않고 그대로 옮겼다(변경 전 커밋 참고).

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

// ─────────────────────────────────────────────────────────────────────────
// 프롬프트 구성 — v2/index.html의 AI_RULES/PROTECTED_FIELDS/buildPrompt()를 그대로 포팅.
// ─────────────────────────────────────────────────────────────────────────
const PROTECTED_FIELDS = '업체명, 아파트명, 전화번호, 담당자 이름, 직급, 날짜, 시간, 금액, 공종, 공법명, 특허번호, 주소, 면적, 요청사항, 회신 여부, 일정';

const AI_RULES = `절대 규칙:
1. 입력에 있는 사실은 절대 삭제하지 마.
2. 입력에 없는 사실을 새로 지어내지 마.
3. 숫자, 날짜, 전화번호, 회사명, 아파트/건물명, 사람 이름은 절대 바꾸지 마.
4. 모르는 정보를 추측해서 채우지 마.
5. 뒤섞인 입력은 읽기 좋은 순서로 재배열해.
6. 진짜 중복된 표현만 자연스럽게 정리해.
7. 오타, 띄어쓰기, 맞춤법을 고쳐.
8. 아래 항목처럼 보이는 값이 입력에 있으면 절대 빠뜨리지 말고 그대로 반영해: ${PROTECTED_FIELDS}.
문체(어투)만 요청된 용도에 맞게 바꾸고, 내용(사실)은 사용자가 적은 그대로 유지해.`;

function buildPrompt(type, text) {
  if (type === 'kakao') {
    return `아래는 업무 중 편하게 적은 메모입니다. 이 메모를 카카오톡으로 보낼 업무 메시지로 정리해줘.
- 캐주얼하지만 예의 바른 톤으로, 짧고 자연스럽게, 모바일에서 읽기 편하도록 필요하면 줄바꿈해줘.
- 메모 내용상 고객/거래처에게 보내는 건지 내부 동료에게 보내는 건지 유추할 수 있으면 그에 맞게, 애매하면 무난하고 정중한 비즈니스 톤으로 작성해.
- 입력에 없는 직함/호칭을 새로 만들어내지 마.

${AI_RULES}

메모:
"""
${text}
"""

다른 설명 없이 정리된 메시지 문구만 출력해.`;
  }
  if (type === 'mail') {
    return `아래는 업무 중 편하게 적은 메모입니다. 이 메모를 바탕으로 업무 이메일의 제목과 본문을 작성해줘.
- 제목은 핵심 업무 내용을 간결하게 요약해.
- 본문은 "안녕하세요."로 시작하고, 메모 내용을 자연스러운 이메일 문장으로 풀어 쓰고, "확인 부탁드립니다." "감사합니다." 등으로 자연스럽게 마무리해도 좋아(형식은 유연하게).
- 반드시 아래 형식 그대로 출력해(다른 설명 금지):
제목: (제목 내용)
본문:
(본문 내용)

${AI_RULES}

메모:
"""
${text}
"""`;
  }
  // report (보고용, 기본값)
  return `아래는 업무 중 편하게 적은 메모입니다. 이 메모를 사내 업무보고용 문구로 정리해줘.
- 모든 사실을 보존하면서 읽기 좋은 순서로 재배열해.
- 중복 표현은 제거하고, 오타/맞춤법을 고치고, 불필요한 군더더기는 빼줘.
- 사내 메신저에 바로 붙여넣을 수 있는 정중하고 간결한 보고체 문장으로 작성해.

${AI_RULES}

메모:
"""
${text}
"""

다른 설명 없이 정리된 보고 문구만 출력해.`;
}

const POUR_PREFIX = '[POUR공법]';

// 메일용 결과 파싱: "제목: ...\n본문:\n..." 형식을 분리한다. (v2/index.html에서 그대로 포팅)
function parseMailResult(raw) {
  const m = raw.match(/제목\s*[:：]\s*([^\n]*)\n+본문\s*[:：]\s*([\s\S]*)/);
  let subject, body;
  if (m) {
    subject = m[1].trim();
    body = m[2].trim();
  } else {
    const lines = raw.split('\n');
    subject = (lines[0] || '').trim();
    body = lines.slice(1).join('\n').trim();
  }
  return { subject, body };
}

// [POUR공법] 접두사를 정확히 1회만 붙인다(이미 붙어있으면 중복 방지). (그대로 포팅)
function applyPourPrefix(subject) {
  const s = (subject || '').trim();
  if (s.indexOf(POUR_PREFIX) === 0) return s;
  return POUR_PREFIX + ' ' + s;
}

// ─────────────────────────────────────────────────────────────────────────
// CORS — GitHub Pages 정적 호스팅에서 호출하므로 별도 서버 오리진이 없다. 이 함수는
// 자격 증명이 필요 없는 공개 리소스가 아니라 Authorization 헤더로만 인증하므로
// Access-Control-Allow-Credentials는 쓰지 않는다(쿠키 기반이 아님).
// ─────────────────────────────────────────────────────────────────────────
function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// 클라이언트에 안전하게 노출 가능한 카테고리만 골라 매핑한다 — OpenAI 원문 메시지/스택은
// 절대 그대로 내보내지 않는다(로그에는 남긴다).
function classifyOpenAiError(status, errType, errCode) {
  if (status === 401) return { httpStatus: 401, kind: 'http', message: '인증 오류' };
  if (status === 429 && (errCode === 'insufficient_quota' || errType === 'insufficient_quota')) {
    return { httpStatus: 429, kind: 'http', message: '사용량 초과' };
  }
  if (status === 429) return { httpStatus: 429, kind: 'http', message: 'rate limit' };
  if (status >= 500) return { httpStatus: 502, kind: 'http', message: '서버 오류' };
  return { httpStatus: status || 502, kind: 'http', message: '서버 오류' };
}

async function callOpenAiServerSide(apiKey, prompt) {
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '너는 건설/시공 업무를 돕는 한국어 비서야. 항상 정중한 존댓말로, 요청받은 형식만 정확히 출력해.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
      }),
    });
  } catch (networkErr) {
    logger.error('[aiRewrite] OpenAI 네트워크 오류', networkErr);
    const e = new Error('network');
    e.kind = 'network';
    throw e;
  }

  if (!res.ok) {
    let errType = '', errCode = '', detail = '';
    try {
      const body = await res.json();
      errType = (body.error && body.error.type) || '';
      errCode = (body.error && body.error.code) || '';
      detail = (body.error && body.error.message) || '';
    } catch (e) { /* ignore */ }
    logger.error('[aiRewrite] OpenAI HTTP 오류', { status: res.status, errType, errCode, detail });
    const classified = classifyOpenAiError(res.status, errType, errCode);
    const e = new Error(classified.message);
    e.kind = 'http';
    e.status = res.status;
    e.errType = errType;
    e.errCode = errCode;
    e.safeMessage = classified.message;
    throw e;
  }

  let data;
  try {
    data = await res.json();
  } catch (parseErr) {
    logger.error('[aiRewrite] OpenAI 응답 JSON 파싱 실패', parseErr);
    const e = new Error('parse');
    e.kind = 'parse';
    throw e;
  }
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) {
    logger.error('[aiRewrite] OpenAI 응답에 content 없음');
    const e = new Error('empty');
    e.kind = 'empty';
    throw e;
  }
  return content.trim();
}

exports.aiRewrite = onRequest({ secrets: [OPENAI_API_KEY], cors: false, region: 'us-central1' }, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: { kind: 'http', message: 'method not allowed' } });
    return;
  }

  // ── 인증: Firebase ID 토큰만 허용한다. OpenAI 키가 아니다. ──
  const authHeader = req.get('Authorization') || '';
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({ error: { kind: 'auth-required', message: '로그인이 필요합니다.' } });
    return;
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(m[1]);
  } catch (err) {
    logger.warn('[aiRewrite] ID 토큰 검증 실패', err && err.message);
    res.status(401).json({ error: { kind: 'auth-required', message: '로그인이 필요합니다.' } });
    return;
  }
  if (!decoded || !decoded.uid) {
    res.status(401).json({ error: { kind: 'auth-required', message: '로그인이 필요합니다.' } });
    return;
  }

  // ── 입력 검증 ──
  const bodyIn = req.body || {};
  const mode = ['report', 'kakao', 'mail'].includes(bodyIn.mode) ? bodyIn.mode : 'report';
  const text = typeof bodyIn.text === 'string' ? bodyIn.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: { kind: 'http', message: '입력이 비어 있습니다.' } });
    return;
  }
  if (text.length > 8000) {
    res.status(400).json({ error: { kind: 'http', message: '입력이 너무 깁니다.' } });
    return;
  }

  try {
    const apiKey = OPENAI_API_KEY.value();
    const prompt = buildPrompt(mode, text);
    const raw = await callOpenAiServerSide(apiKey, prompt);

    if (mode === 'mail') {
      const { subject, body } = parseMailResult(raw);
      res.status(200).json({ subject: applyPourPrefix(subject), body });
    } else {
      res.status(200).json({ text: raw });
    }
  } catch (err) {
    if (err && err.kind === 'network') {
      res.status(502).json({ error: { kind: 'network', message: 'AI 서버에 연결할 수 없습니다.' } });
      return;
    }
    if (err && err.kind === 'http') {
      res.status(err.status && err.status < 500 ? err.status : 502).json({
        error: { kind: 'http', message: err.safeMessage || '서버 오류', errType: err.errType || '', errCode: err.errCode || '' },
      });
      return;
    }
    logger.error('[aiRewrite] 알 수 없는 오류', err);
    res.status(500).json({ error: { kind: 'http', message: '서버 오류' } });
  }
});
