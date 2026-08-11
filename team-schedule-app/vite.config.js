import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// __APP_PROJECT_ROOT__: 이 vite.config.js가 실제로 "실행된" Node 프로세스의
// cwd를 빌드/실행 시점에 문자열로 박아 넣는다. 브라우저 JS는 원래 실제
// 디스크 경로를 알 방법이 없으므로, "지금 화면에 떠 있는 이 앱이 정확히
// 어느 로컬 폴더의 소스에서 실행됐는가"를 증명하려면 이렇게 서버(Node) 쪽
// 값을 빌드타임에 클라이언트로 넘겨주는 수밖에 없다. 이 값이 실제
// team-schedule-app 폴더 경로와 다르면, .env.local을 아무리 올바른 곳에
// 둬도 "이 브라우저가 보고 있는 서버"는 다른 폴더에서 뜬 것이라는 뜻이다.
const APP_PROJECT_ROOT = process.cwd();

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_PROJECT_ROOT__: JSON.stringify(APP_PROJECT_ROOT),
  },
  server: {
    host: true,
    port: 5173,
    // Google OAuth의 "승인된 자바스크립트 원본"이 포트까지 포함해 등록되므로
    // 5173이 사용 중이면 다른 포트로 자동 전환하지 말고 그대로 실패한다.
    strictPort: true,
  },
});
