import { GESTURE_LABELS } from "../data/gestures";
import type { Binding } from "../types/profile";
import KeyCaptureButton from "./KeyCaptureButton";

interface BindingRowProps {
  binding: Binding;
  duplicateOf: string[]; // labels of other movements sharing this key, if any
  onKeyChange: (key: string) => void;
  onRemove: () => void;
}

export default function BindingRow({ binding, duplicateOf, onKeyChange, onRemove }: BindingRowProps) {
  return (
    <div className="binding-row">
      <span className="binding-row-label">{GESTURE_LABELS[binding.gesture]}</span>
      <KeyCaptureButton value={binding.key} onCapture={onKeyChange} />
      <button className="btn btn-secondary binding-row-remove" onClick={onRemove}>
        Remove
      </button>
      {duplicateOf.length > 0 && (
        <div className="binding-row-warning">
          {binding.key} is already mapped to {duplicateOf.join(", ")}.
        </div>
      )}
    </div>
  );
}
