interface StatusBadgeProps {
  connected: boolean;
}

export default function StatusBadge({ connected }: StatusBadgeProps) {
  return (
    <span className={`pill ${connected ? "pill-ok" : "pill-bad"}`}>
      {connected ? "CV Connected" : "CV Disconnected"}
    </span>
  );
}
