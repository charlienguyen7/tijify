export type GestureName =
  | "jump"
  | "crouch"
  | "lean-left"
  | "lean-right"
  | "turn-left"
  | "turn-right"
  | "walk"
  | "run"
  | "stomp-left"
  | "stomp-right";

export type CvState =
  | "active"
  | "neutral"
  | "calibrating"
  | "tracking-lost"
  | "camera-unavailable"
  | "stopped";

export interface CalibrationInfo {
  state: "in-progress" | "complete";
  progress: number;
  message: string;
}

export interface StateSnapshot {
  type: "state";
  state: CvState;
  active_gestures: GestureName[];
  camera_connected: boolean;
  tracking: boolean;
  controller_ready: boolean;
  calibration: CalibrationInfo;
  fps: number;
  timestamp: number;
}

export interface GestureEvent {
  type: "gesture";
  gesture: GestureName;
  phase: "start" | "active" | "end";
  confidence: number;
  timestamp: number;
}
