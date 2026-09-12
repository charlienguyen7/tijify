interface MascotProps {
  size?: number;
  className?: string;
}

// Decorative placeholder mascot until the real Tiji character exists.
export default function Mascot({ size = 96, className }: MascotProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <line x1="34" y1="18" x2="26" y2="4" stroke="#7fb8e8" strokeWidth="3" strokeLinecap="round" />
      <line x1="62" y1="18" x2="70" y2="4" stroke="#7fb8e8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="26" cy="4" r="3.5" fill="#ffd6e8" />
      <circle cx="70" cy="4" r="3.5" fill="#ffd6e8" />
      <rect x="14" y="16" width="68" height="56" rx="24" fill="#eaf4ff" stroke="#7fb8e8" strokeWidth="3" />
      <circle cx="36" cy="44" r="5" fill="#2c3e50" />
      <circle cx="60" cy="44" r="5" fill="#2c3e50" />
      <path d="M36 58 Q48 66 60 58" stroke="#2c3e50" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="30" y="78" width="12" height="14" rx="5" fill="#7fb8e8" />
      <rect x="54" y="78" width="12" height="14" rx="5" fill="#7fb8e8" />
    </svg>
  );
}
