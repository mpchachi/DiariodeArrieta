interface ScoreRingProps {
  score: number;
  size?: number;
  delta?: number;
}

function getColor(score: number): string {
  if (score >= 70) return '#3F774D';
  if (score >= 40) return '#B27923';
  return '#AF3D36';
}

export function ScoreRing({ score, size = 56, delta }: ScoreRingProps) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = getColor(score);

  return (
    <div className="inline-flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-clay-border"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${progress} ${circumference}`}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-display font-extrabold tabular-nums leading-none"
          style={{ fontSize: size * 0.36, color }}
        >
          {Math.round(score)}
        </span>
      </div>
      {delta !== undefined && delta !== 0 && (
        <div className={`flex items-center gap-0.5 mt-1 text-[10px] font-bold tabular-nums ${delta > 0 ? 'text-ok' : 'text-alert'}`}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {delta > 0 ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M19 12l-7 7-7-7" />}
          </svg>
          {Math.abs(delta).toFixed(1)}
        </div>
      )}
    </div>
  );
}
