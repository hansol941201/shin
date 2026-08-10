import React from 'react';

// 왼쪽 시간축: 1시간 단위 라벨만 표시 (09시 ~ 18시)
export default function TimeAxis({ settings }) {
  const { hourLabelStart, hourLabelEnd, workStartMin, workEndMin } = settings;
  const total = workEndMin - workStartMin;
  const hours = [];
  for (let h = hourLabelStart; h <= hourLabelEnd; h++) hours.push(h);

  return (
    <div className="time-axis">
      {hours.map((h, i) => {
        const min = h * 60;
        const pct = ((min - workStartMin) / total) * 100;
        const isFirst = i === 0;
        const isLast = i === hours.length - 1;
        return (
          <div
            key={h}
            className="time-axis-label"
            style={{
              top: `${pct}%`,
              transform: isFirst ? 'translateY(0)' : isLast ? 'translateY(-100%)' : 'translateY(-50%)',
            }}
          >
            {h}시
          </div>
        );
      })}
    </div>
  );
}
