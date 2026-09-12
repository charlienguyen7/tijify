import { useEffect, useRef, useState } from "react";
import "./KeyComboEditor.css";

// Converts a physical KeyboardEvent.code into the display names used
// throughout bindings (SPACE, ENTER, A, ARROWLEFT, ...).
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

interface KeyComboEditorProps {
  keys: string[];
  onChange: (keys: string[]) => void;
}

// A binding's keys are pressed/released together as one combo. Click
// "+ Add Key(s)", then press and hold every key in the combo (together or in
// quick succession) and release them - whatever was down gets added as a
// batch the moment everything's released. A single press-and-release still
// works exactly the same as before (adds that one key immediately).
export default function KeyComboEditor({ keys, onChange }: KeyComboEditorProps) {
  const [capturing, setCapturing] = useState(false);
  // Refs so the listeners (set up once per capture session) always see the
  // latest committed keys/onChange without needing to be torn down and
  // rebuilt mid-session every time a key is captured.
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!capturing) return;
    const captured = new Set<string>(); // every distinct key seen this session
    const held = new Set<string>(); // physical codes still down, to detect "all released"

    const finish = () => {
      if (captured.size > 0) {
        const merged = [...keysRef.current];
        for (const key of captured) if (!merged.includes(key)) merged.push(key);
        onChangeRef.current(merged);
      }
      setCapturing(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      captured.add(normalizeKeyCode(e.code));
      held.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      held.delete(e.code);
      if (held.size === 0) finish();
    };
    // Losing OS focus mid-combo (e.g. Alt-Tab) would otherwise leave capture
    // stuck forever waiting for keyups that will never arrive.
    const onBlur = () => finish();

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onBlur);
    };
  }, [capturing]);

  return (
    <div className="key-combo">
      {keys.map((key) => (
        <span key={key} className="key-chip">
          {key}
          <button
            type="button"
            className="key-chip-remove"
            onClick={() => onChange(keys.filter((k) => k !== key))}
            aria-label={`Remove ${key}`}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        className={`key-field key-combo-add ${capturing ? "capturing" : ""}`}
        onClick={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
      >
        {capturing ? "Press keys, then release..." : "+"}
      </button>
    </div>
  );
}
