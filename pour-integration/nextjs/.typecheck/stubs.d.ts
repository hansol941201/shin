/**
 * 이 파일은 **이식물만 따로 타입 검사할 때** 쓰는 임시 선언입니다.
 * 실제 프로젝트에는 next / react 가 이미 있으므로 옮기지 마세요.
 */
declare module "next/server" {
  export const NextResponse: {
    json(body: unknown, init?: { status?: number; headers?: Record<string, string> }): Response;
  };
}

declare module "*.css";
