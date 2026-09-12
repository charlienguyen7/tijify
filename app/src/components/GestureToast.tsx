import { useEffect, useState } from "react";
import { GESTURE_LABELS } from "../data/gestures";
import type { GestureEvent } from "../types/gesture";
import "./GestureToast.css";

const TOAST_DURATION_MS = 900;

interface GestureToastProps {
  lastStart: GestureEvent | null;
}

// Small transient "X detected!" flash over the camera feed on each gesture
// start, layered on top of the persistent active-movements panel (not a
// replacement for it).
export default function GestureToast({ lastStart }: GestureToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastStart) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [lastStart]);

  if (!visible || !lastStart) return null;
  return <div className="gesture-toast">{GESTURE_LABELS[lastStart.gesture]} detected!</div>;
}
