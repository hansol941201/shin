/**
 * PoC: 협약서 PDF를 하이웍스(Hiworks) 메일로 자동 발송하는 Firebase Cloud Function.
 *
 * - 클라이언트(index.html)는 PDF를 base64로 이 함수에 POST 하기만 하고,
 *   실제 SMTP 로그인/발송은 전부 서버(이 함수) 안에서만 일어난다.
 * - 계정/비밀번호는 절대 코드에 적지 말고 Firebase 환경설정(또는 Secret Manager)에 저장한다.
 *
 * 배포 전 준비:
 *   1) 하이웍스 관리자 페이지 > POP3/SMTP 설정에서 "메일 전용 비밀번호 설정"으로
 *      SMTP 발송용 비밀번호를 별도 발급 (OTP 로그인 계정은 로그인 비밀번호로 SMTP 인증 불가)
 *   2) firebase functions:config:set hiworks.user="발송용_아이디@도메인" hiworks.pass="위에서 발급한 메일 전용 비밀번호"
 *   (2세대 함수 + Secret Manager를 쓴다면 config 대신 defineSecret 사용을 권장)
 *
 * 배포:
 *   cd functions && npm install
 *   firebase deploy --only functions:sendContractEmail
 *
 * 배포 후 나오는 함수 URL을 index.html 상단의 EMAIL_API_URL 에 넣는다.
 */
const functions = require('firebase-functions');
const nodemailer = require('nodemailer');
const cors = require('cors')({ origin: true }); // TODO: 운영 시 실제 사이트 도메인으로 제한 권장

// 하이웍스 SMTP 설정 — 하이웍스 관리자 페이지 "POP3/SMTP 설정"에서 확인한 값
//   보내는 메일 서버(SMTP): smtps.hiworks.com, 포트 465 (보안 연결 SSL 필요)
function buildTransport() {
  const cfg = functions.config().hiworks || {};
  const user = cfg.user || process.env.HIWORKS_USER;
  const pass = cfg.pass || process.env.HIWORKS_PASS;
  if (!user || !pass) {
    throw new Error('하이웍스 계정 정보가 설정되지 않았습니다 (functions:config:set hiworks.user / hiworks.pass)');
  }
  return nodemailer.createTransport({
    host: 'smtps.hiworks.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 첨부 15MB 제한 (하이웍스/일반 메일 서버 한도 고려)

exports.sendContractEmail = functions.region('asia-northeast3').https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'POST만 허용됩니다' });
    }

    const { to, subject, filename, pdfBase64, text } = req.body || {};

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
        from: functions.config().hiworks?.user,
        to,
        subject: subject || '협약서 안내',
        text: text || '협약서 PDF를 첨부해 드립니다.',
        attachments: [
          {
            filename: filename || 'contract.pdf',
            content: buffer,
            contentType: 'application/pdf',
          },
        ],
      });
      return res.status(200).json({ ok: true, messageId: info.messageId });
    } catch (err) {
      console.error('[sendContractEmail]', err);
      return res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });
});
