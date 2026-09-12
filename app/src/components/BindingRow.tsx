import { GESTURE_LABELS } from "../data/gestures";
import type { Binding } from "../types/profile";
import KeyComboEditor from "./KeyComboEditor";

interface BindingRowProps {
  binding: Binding;
  duplicateOf: string[]; // labels of other movements sharing at least one key, if any
  onKeysChange: (keys: string[]) => void;
  onRemove: () => void;
}

export default function BindingRow({ binding, duplicateOf, onKeysChange, onRemove }: BindingRowProps) {
  return (
    <div className="binding-row">
      <span className="binding-row-label">{GESTURE_LABELS[binding.gesture]}</span>
      <KeyComboEditor keys={binding.keys} onChange={onKeysChange} />
      <button className="btn btn-secondary binding-row-remove" onClick={onRemove}>
        Remove
      </button>
      {duplicateOf.length > 0 && (
        <div className="binding-row-warning">
          {binding.keys.join("+")} overlaps with {duplicateOf.join(", ")}.
        </div>
      )}
    </div>
  );
}
