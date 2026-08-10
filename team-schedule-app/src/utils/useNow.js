import { useEffect, useState } from 'react';

// 30초 간격으로 갱신되는 현재 시각. 현재시간 빨간선 표시용.
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
