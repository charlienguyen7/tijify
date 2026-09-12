import { useEffect, useState } from "react";

// Ported from the original App.tsx: converts a physical KeyboardEvent.code
// into the same display names used throughout bindings (SPACE, ENTER, A,
// ARROWLEFT, ...).
export function normalizeKeyCode(code: string): string {
  if (code === "Space") return "SPACE";
  if (code === "Enter" || code === "NumpadEnter") return "ENTER";
  if (code === "Escape") return "ESCAPE";
  if (code === "Tab") return "TAB";
  if (code === "Backspace") return "BACKSPACE";
  if (code === "Delete") return "DELETE";
  if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Control")) return "CTRL";
  if (code.startsWith("Shift")) return "SHIFT";
  if (code.startsWith("Alt")) return "ALT";
  return code.toUpperCase();
}

interface KeyCaptureButtonProps {
  value: string | null;
  onCapture: (key: string) => void;
}

// Click -> "Press a key..." -> physically press a key -> captured & normalized.
// Never falls through to typing into a text field, so it can't accidentally
// trigger game input while the user is just binding a key.
export default function KeyCaptureButton({ value, onCapture }: KeyCaptureButtonProps) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onCapture(normalizeKeyCode(e.code));
      setCapturing(false);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [capturing, onCapture]);

  return (
    <button
      type="button"
      className={`key-field ${capturing ? "capturing" : ""}`}
      onClick={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
    >
      {capturing ? "Press a key..." : value ?? "—"}
    </button>
  );
}
