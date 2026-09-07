/**
 * [테스트 전용] PDF 첨부 이메일 1건을 실제로 보내는 것만 확인하는 최소 서버 함수.
 *
 * - 이 함수는 "메일 발송" 그 자체 외에는 아무 일도 하지 않는다.
 *   (기존 pour-contract 프로젝트의 DB/Firestore/다른 함수와 전혀 무관)
 * - 하이웍스 계정/비밀번호는 이 파일에 절대 적지 않는다. 배포할 때 환경변수로만 넣는다.
 * - 반드시 "기존 pour-contract가 쓰는 진짜 프로젝트"가 아니라
 *   새로 만든 테스트 전용 Firebase/Google Cloud 프로젝트에 배포해서 먼저 테스트한다.
 *
 * 배포 방법 (초보자용, 터미널 명령 없이 웹 화면으로):
 *   TEST_GUIDE.md 문서를 참고.
 *
 * 환경변수 (배포 화면에서 입력):
 *   HIWORKS_USER = 발송용 계정 아이디 (예: netformb2b@netformrnd.com)
 *   HIWORKS_PASS = 하이웍스 "메일 전용 비밀번호" (로그인 비밀번호 아님)
 */
const nodemailer = require('nodemailer');
const cors = require('cors')({ origin: true });

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 첨부 15MB 제한

function buildTransport() {
  const user = process.env.HIWORKS_USER;
  const pass = process.env.HIWORKS_PASS;
  if (!user || !pass) {
    throw new Error('서버 환경변수 HIWORKS_USER / HIWORKS_PASS 가 설정되지 않았습니다');
  }
  // 하이웍스 관리자 페이지 "POP3/SMTP 설정"에서 확인한 값
  return nodemailer.createTransport({
    host: 'smtps.hiworks.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

/**
 * Cloud Functions (2세대, Node.js 런타임) HTTP 함수.
 * functions-framework 규격: exports.<함수명> = (req, res) => {...}
 */
exports.sendTestEmail = (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'POST만 허용됩니다' });
    }

    const { to, subject, text, filename, pdfBase64 } = req.body || {};

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ ok: false, error: '수신 이메일이 올바르지 않습니다' });
    }
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return res.status(400).json({ ok: false, error: 'PDF 데이터가 없습니다' });
    }

    const buffer = Buffer.from(pdfBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) {
      return res.status(400).json({ ok: false, error: '첨부 파일 크기가 올바르지 않습니다' });
    }

    try {
      const transporter = buildTransport();
      const info = await transporter.sendMail({
        from: process.env.HIWORKS_USER,
        to,
        subject: subject || '[테스트] 협약서',
        text: text || '테스트 발송입니다.',
        attachments: [
          { filename: filename || 'test.pdf', content: buffer, contentType: 'application/pdf' },
        ],
      });
      return res.status(200).json({ ok: true, messageId: info.messageId });
    } catch (err) {
      console.error('[sendTestEmail]', err);
      return res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });
};
