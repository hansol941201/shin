/**
 * /pour 화면
 *
 * 기존 app/page.tsx 를 그대로 두고 새 주소로 먼저 붙여 확인한 뒤,
 * 문제가 없으면 app/page.tsx 에서 <PourApp /> 를 렌더하도록 바꾸세요.
 */
import PourApp from "@/components/pour/PourApp";
import "./pour.css";

export const metadata = {
  title: "POUR 공사실적 관리"
};

export default function PourPage() {
  return <PourApp apiBase="/api" />;
}
