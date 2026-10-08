interface BodyIconProps {
  side: 'left' | 'right';
  size?: number;
}

export function BodyIcon({ side, size = 24 }: BodyIconProps) {
  const affectedOpacity = 1;
  const normalOpacity = 0.25;
  const leftOp = side === 'left' ? affectedOpacity : normalOpacity;
  const rightOp = side === 'right' ? affectedOpacity : normalOpacity;

  return (
    <svg width={size} height={size} viewBox="0 0 24 32" fill="none">
      {/* Head */}
      <circle cx="12" cy="4" r="3" fill="#75716B" opacity="0.4" />
      {/* Left side */}
      <path
        d="M12 8 L12 20 M12 10 L6 14 M12 20 L8 28"
        stroke="#AE643C"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={leftOp}
      />
      {/* Right side */}
      <path
        d="M12 10 L18 14 M12 20 L16 28"
        stroke="#AE643C"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={rightOp}
      />
    </svg>
  );
}
