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
 *
 * [발송 알림 기능]
 *   하이웍스가 IMAP을 지원하지 않아 "보낸편지함 저장"이 불가능하다는 게 확인되어,
 *   대신 상대방 발송이 SMTP에 정상 접수된 "직후"에만, 발신 계정 본인
 *   (HIWORKS_USER)의 받은메일함으로 별도의 알림 메일 1건을 추가로 보낸다.
 *   - 알림 메일에는 PDF/첨부파일을 절대 넣지 않는다 (요청 사항)
 *   - 숨은참조(BCC)가 아니라 완전히 별개의 sendMail() 호출이다 (요청 사항)
 *   - 알림 메일 자체는 다시 알림을 만들지 않는다 (재귀 호출 없음 — 코드 구조상 불가능)
 *   - 상대방 발송이 실패/불명확하면 알림을 아예 보내지 않는다
 *   - 상대방 발송 성공 여부와 알림 성공 여부는 응답에서 분리된 필드(ok / notify.ok)로 구분된다
 *   - notifyOnly:true 로 요청하면 상대방에게는 아무것도 보내지 않고 "알림만" 재시도한다
 *     (알림 실패 시 상대방에게 협약서를 다시 보내지 않기 위한 재시도 경로)
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

function nowKST() {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

// 발신자 본인에게 보낼 알림 메일 본문 — 요청하신 항목만 그대로 표시 (과장된 문구 없음)
function buildNotifyBody({ fromEmail, to, projectName, contractorName, subject, text, filename }) {
  return [
    `발신 이메일: ${fromEmail}`,
    `실제 수신 이메일: ${to}`,
    `현장명: ${projectName || ''}`,
    `업체명: ${contractorName || ''}`,
    '',
    `보낸 메일 제목: ${subject || ''}`,
    '보낸 메일 본문:',
    text || '',
    '',
    `첨부 파일명: ${filename || ''}`,
    '',
    `발송 접수 시각(한국시간): ${nowKST()}`,
    '결과: 발송 서버 접수 완료',
    '',
    '※ 이 알림은 수신자의 수신함 도착이나 열람을 확인한 것은 아닙니다.',
  ].join('\n');
}

// 발신 계정 본인에게 보내는 알림 메일 — 절대 첨부 없음, BCC 아님, 재귀 호출 없음
async function sendOwnerNotification(transporter, { to, projectName, contractorName, subject, text, filename }) {
  const ownerEmail = process.env.HIWORKS_USER;
  // 알림 메일 제목은 상대방에게 실제로 보낸 메일 제목과 동일하게 사용
  // (예: "[POUR] 특허 제10-0508729호_한솔_한솔테스트")
  const notifySubject = subject || '[협약서 발송 알림]';
  const notifyBody = buildNotifyBody({ fromEmail: ownerEmail, to, projectName, contractorName, subject, text, filename });

  console.log('[sendTestEmail] 알림 메일 발송 시도', JSON.stringify({ ownerEmail, notifySubject }));

  try {
    const info = await transporter.sendMail({
      from: `"넷폼" <${ownerEmail}>`,
      to: ownerEmail, // 발신 계정 본인 받은메일함으로만 발송
      subject: notifySubject,
      text: notifyBody,
      // attachments 없음 — 요청에 따라 알림 메일에는 어떤 파일도 첨부하지 않음
    });

    // [버그 수정] 기존에는 sendMail()이 예외 없이 끝나면 무조건 ok:true 로 처리했음 —
    // 상대방 발송 쪽과 달리 accepted/rejected를 전혀 확인하지 않아, 하이웍스가 실제로는
    // 이 자기 자신 앞 메일을 거부했더라도 "성공"으로 잘못 보고할 수 있었던 지점.
    // 이제 상대방 발송 검증과 동일한 기준으로 accepted/rejected를 확인한다.
    console.log('[sendTestEmail] 알림 메일 SMTP 응답', JSON.stringify({
      ownerEmail,
      accepted: info.accepted,
      rejected: info.rejected,
      rejectedErrors: info.rejectedErrors || null, // 일부 수신자만 거부됐을 때 nodemailer가 채워주는 상세 에러
      pending: info.pending,
      envelope: info.envelope,
      response: info.response,
      messageId: info.messageId,
    }));
    // [NOTIFY-DEBUG] info 객체 전체를 원본 그대로 남김 — 위 요약에 없는 필드까지 전부 확인하기 위함
    // (accepted/rejected가 정상으로 찍혀도 실제 미도착이면, 이건 SMTP 프로토콜 밖에서
    //  하이웍스가 자체적으로 걸러낸 것이라 이 로그로도 원인을 못 볼 수 있음 — 그 경우
    //  하이웍스 쪽 "배달 추적/로그" 확인이 유일한 방법일 가능성이 높음)
    try{ console.log('[NOTIFY-DEBUG] info 전체', JSON.stringify(info)); }catch(_e){ console.log('[NOTIFY-DEBUG] info (stringify 실패)', info); }

    const hasRejected = Array.isArray(info.rejected) && info.rejected.length > 0;
    const wasAccepted = Array.isArray(info.accepted) && info.accepted.length > 0;

    if (hasRejected || !wasAccepted) {
      console.error('[sendTestEmail] 알림 메일 수신 거부/미수락', info.rejected, info.response);
      return {
        attempted: true, ok: false,
        error: `발신 계정이 알림 메일을 수락하지 않았습니다 (rejected=${JSON.stringify(info.rejected)}, response=${info.response})`,
        accepted: info.accepted, rejected: info.rejected, response: info.response,
      };
    }

    return {
      attempted: true, ok: true,
      messageId: info.messageId, accepted: info.accepted, rejected: info.rejected,
      envelope: info.envelope, response: info.response,
    };
  } catch (notifyErr) {
    console.error('[sendTestEmail] 알림 메일 발송 실패(예외)', notifyErr);
    return { attempted: true, ok: false, error: notifyErr.message || String(notifyErr) };
  }
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

    const { to, subject, text, filename, pdfBase64, projectName, contractorName, notifyOnly } = req.body || {};

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ ok: false, error: '수신 이메일이 올바르지 않습니다' });
    }

    // ── notifyOnly 모드: 상대방에게는 아무것도 보내지 않고, "알림만" 재시도 ──
    // (알림 실패로 협약서를 다시 보내는 일이 없도록 완전히 분리된 경로)
    if (notifyOnly === true) {
      try {
        const transporter = buildTransport();
        const notify = await sendOwnerNotification(transporter, { to, projectName, contractorName, subject, text, filename });
        return res.status(notify.ok ? 200 : 502).json({ notifyOnly: true, notify });
      } catch (err) {
        console.error('[sendTestEmail:notifyOnly]', err);
        return res.status(500).json({ notifyOnly: true, notify: { attempted: true, ok: false, error: err.message || String(err) } });
      }
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

      // ① 상대방에게 협약서 PDF 첨부 메일 발송 (기존 동작 그대로 유지)
      const info = await transporter.sendMail({
        from: `"넷폼" <${process.env.HIWORKS_USER}>`,
        to,
        subject: subject || '[테스트] 협약서',
        text: text || '테스트 발송입니다.',
        attachments: [
          { filename: filename || 'test.pdf', content: buffer, contentType: 'application/pdf' },
        ],
      });

      // [진단용] "SMTP가 접수함(250 OK)"과 "실제 수신함 도착"은 다르다.
      console.log('[sendTestEmail] SMTP 응답', JSON.stringify({
        to,
        accepted: info.accepted,
        rejected: info.rejected,
        pending: info.pending,
        response: info.response,
        messageId: info.messageId,
      }));

      const hasRejected = Array.isArray(info.rejected) && info.rejected.length > 0;
      const wasAccepted = Array.isArray(info.accepted) && info.accepted.length > 0;

      if (hasRejected || !wasAccepted) {
        // 상대방 발송이 실패/불명확 — 이 경우 알림 메일은 절대 보내지 않는다
        console.error('[sendTestEmail] 수신자 거부/미수락', info.rejected, info.response);
        return res.status(502).json({
          ok: false,
          error: `SMTP 서버가 수신자를 수락하지 않았습니다 (rejected=${JSON.stringify(info.rejected)}, response=${info.response})`,
          accepted: info.accepted,
          rejected: info.rejected,
          smtpResponse: info.response,
        });
      }

      // ② 상대방 발송이 "정상 접수" 확정된 경우에만 발신 계정 본인에게 알림 발송 시도
      const notify = await sendOwnerNotification(transporter, { to, projectName, contractorName, subject, text, filename });

      // 상대방 발송 결과(ok)와 알림 결과(notify.ok)는 서로 다른 필드로 분리해서 반환한다.
      // 알림이 실패해도 상대방 발송은 이미 성공했으므로 ok:true는 그대로 유지한다.
      return res.status(200).json({
        ok: true,
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        smtpResponse: info.response,
        notify,
      });
    } catch (err) {
      console.error('[sendTestEmail]', err);
      return res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });
};
