import { useState } from "react";
import { GESTURE_LABELS } from "../data/gestures";
import type { GestureName } from "../types/gesture";

interface AddMovementMenuProps {
  availableGestures: GestureName[];
  onAdd: (gesture: GestureName) => void;
}

// "+ Add Movement" -> dropdown of movements not yet mapped in this profile.
export default function AddMovementMenu({ availableGestures, onAdd }: AddMovementMenuProps) {
  const [open, setOpen] = useState(false);

  if (availableGestures.length === 0) {
    return <p className="text-muted">All movements are mapped.</p>;
  }

  return (
    <div className="add-movement-menu">
      <button className="btn btn-secondary" onClick={() => setOpen((o) => !o)}>
        + Add Movement
      </button>
      {open && (
        <div className="add-movement-dropdown card">
          {availableGestures.map((gesture) => (
            <button
              key={gesture}
              className="add-movement-option"
              onClick={() => {
                onAdd(gesture);
                setOpen(false);
              }}
            >
              {GESTURE_LABELS[gesture]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
