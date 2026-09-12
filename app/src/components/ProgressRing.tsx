import "./ProgressRing.css";

interface ProgressRingProps {
  progress: number; // 0 to 1
  size?: number;
  strokeWidth?: number;
  complete?: boolean;
}

// Large circular progress indicator, sized to be readable from across a room
// - used for calibration so someone stepping back from the screen can still
// tell how far along they are without reading small text.
export default function ProgressRing({ progress, size = 220, strokeWidth = 16, complete = false }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clamped);

  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Solid dark backing disc so the ring reads clearly against any
            video content behind it, not just a dark backdrop. */}
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} className="progress-ring-backing" />
        <circle cx={size / 2} cy={size / 2} r={radius} className="progress-ring-track" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={`progress-ring-fill ${complete ? "progress-ring-fill-complete" : ""}`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="progress-ring-label">{complete ? "✓" : `${Math.round(clamped * 100)}%`}</div>
    </div>
  );
}
