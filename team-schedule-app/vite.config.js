import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Google OAuth의 "승인된 자바스크립트 원본"이 포트까지 포함해 등록되므로
    // 5173이 사용 중이면 다른 포트로 자동 전환하지 말고 그대로 실패한다.
    strictPort: true,
  },
});
