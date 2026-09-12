import type { GestureName } from "../types/gesture";
import type { Binding } from "../types/profile";

export const GESTURE_LIST: GestureName[] = [
  "jump",
  "crouch",
  "lean-left",
  "lean-right",
  "turn-left",
  "turn-right",
  "walk",
  "run",
  "stomp-left",
  "stomp-right",
];

export const GESTURE_LABELS: Record<GestureName, string> = {
  jump: "Jump",
  crouch: "Crouch",
  "lean-left": "Lean Left",
  "lean-right": "Lean Right",
  "turn-left": "Turn Left",
  "turn-right": "Turn Right",
  walk: "Walk",
  run: "Run",
  "stomp-left": "Stomp Left",
  "stomp-right": "Stomp Right",
};

// Single source of truth for tap-vs-hold. Tap gestures fire once on
// "start" and ignore "end"; hold gestures press on "start" and release
// on "end". Edit here to change any gesture's behavior app-wide.
export const GESTURE_MODE: Record<GestureName, Binding["mode"]> = {
  jump: "tap",
  "stomp-left": "tap",
  "stomp-right": "tap",
  crouch: "hold",
  "lean-left": "hold",
  "lean-right": "hold",
  "turn-left": "hold",
  "turn-right": "hold",
  walk: "hold",
  run: "hold",
};

export function createBinding(gesture: GestureName, keys: string[] = []): Binding {
  return { gesture, keys, mode: GESTURE_MODE[gesture] };
}
