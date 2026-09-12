import "./Header.css";

interface HeaderProps {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
}

// Reused across Home/Binding/Controller: optional back button, title, and a
// slot on the right (defaults to the placeholder gear icon).
export default function Header({ title, onBack, backLabel = "Back", right }: HeaderProps) {
  return (
    <div className="header-bar">
      <div className="header-left">
        {onBack && (
          <button className="btn btn-secondary header-back" onClick={onBack}>
            &lt; {backLabel}
          </button>
        )}
      </div>
      <h1 className="header-title">{title}</h1>
      <div className="header-right">
        {right ?? (
          <button className="header-gear" title="Settings (coming soon)" disabled aria-label="Settings">
            ⚙
          </button>
        )}
      </div>
    </div>
  );
}
