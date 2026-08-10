import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// 클릭 위치 근처에 뜨는 작은 팝오버 공용 셸.
// 바깥 영역 클릭/ESC 시 닫힌다. 뷰포트를 벗어나지 않도록 위치를 보정한다.
export default function PopoverShell({ anchor, onClose, children, width = 300 }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y, opacity: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    let left = anchor.x + 14;
    let top = anchor.y - 10;

    if (left + rect.width + margin > window.innerWidth) {
      left = anchor.x - rect.width - 14;
    }
    if (left < margin) left = margin;
    if (top + rect.height + margin > window.innerHeight) {
      top = window.innerHeight - rect.height - margin;
    }
    if (top < margin) top = margin;

    setPos({ left, top, opacity: 1 });
  }, [anchor]);

  useEffect(() => {
    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="popover-shell"
      style={{ left: pos.left, top: pos.top, opacity: pos.opacity, width }}
      role="dialog"
    >
      {children}
    </div>
  );
}
