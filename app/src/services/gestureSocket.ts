import { useEffect, useState } from "react";
import type { GestureEvent, GestureName, StateSnapshot } from "../types/gesture";

const GESTURE_WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY_MS = 2000;
const STALE_CHECK_INTERVAL_MS = 500;
const STALE_THRESHOLD_MS = 2000;

type Unsubscribe = () => void;
type Listener<T> = (payload: T) => void;

/**
 * Owns the single WebSocket connection to the Python CV service and
 * republishes it as two independent subscription streams: display state
 * (connection/snapshot/active-gestures, for rendering) and raw gesture
 * start/active/end events (for driving keyboard output). Keeping these
 * separate mirrors the protocol's rule that snapshots are for display/
 * reconciliation only and must never re-trigger tap bindings.
 */
export class GestureSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private cancelled = false;
  private lastStateTimestamp = 0;
  private activeGestures = new Set<GestureName>();

  private connectionListeners = new Set<Listener<boolean>>();
  private snapshotListeners = new Set<Listener<StateSnapshot | null>>();
  private gestureListeners = new Set<Listener<GestureEvent>>();

  connect(): void {
    this.cancelled = false;
    this.staleTimer = setInterval(() => {
      if (this.lastStateTimestamp && Date.now() - this.lastStateTimestamp > STALE_THRESHOLD_MS) {
        this.activeGestures.clear();
        this.lastStateTimestamp = 0;
        this.snapshotListeners.forEach((cb) => cb(null));
      }
    }, STALE_CHECK_INTERVAL_MS);
    this.openSocket();
  }

  disconnect(): void {
    this.cancelled = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.socket?.close();
    this.socket = null;
  }

  onConnectionChange(cb: Listener<boolean>): Unsubscribe {
    this.connectionListeners.add(cb);
    return () => this.connectionListeners.delete(cb);
  }

  onSnapshot(cb: Listener<StateSnapshot | null>): Unsubscribe {
    this.snapshotListeners.add(cb);
    return () => this.snapshotListeners.delete(cb);
  }

  onGestureEvent(cb: Listener<GestureEvent>): Unsubscribe {
    this.gestureListeners.add(cb);
    return () => this.gestureListeners.delete(cb);
  }

  getActiveGestures(): ReadonlySet<GestureName> {
    return this.activeGestures;
  }

  private openSocket(): void {
    const socket = new WebSocket(GESTURE_WS_URL);
    this.socket = socket;

    socket.onopen = () => this.connectionListeners.forEach((cb) => cb(true));

    socket.onclose = () => {
      this.connectionListeners.forEach((cb) => cb(false));
      this.activeGestures.clear();
      this.lastStateTimestamp = 0;
      this.snapshotListeners.forEach((cb) => cb(null));
      if (!this.cancelled) {
        this.reconnectTimer = setTimeout(() => this.openSocket(), RECONNECT_DELAY_MS);
      }
    };

    socket.onerror = () => socket.close();

    socket.onmessage = (event) => {
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!data || typeof data !== "object") return;
      const message = data as Record<string, unknown>;

      if (message.type === "state" && Array.isArray(message.active_gestures)) {
        const timestamp = message.timestamp;
        if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_THRESHOLD_MS) {
          this.activeGestures.clear();
          this.lastStateTimestamp = 0;
          this.snapshotListeners.forEach((cb) => cb(null));
          return;
        }
        this.lastStateTimestamp = timestamp;
        this.activeGestures = new Set(
          message.active_gestures.filter((g): g is GestureName => typeof g === "string")
        );
        this.snapshotListeners.forEach((cb) => cb(message as unknown as StateSnapshot));
        return; // Snapshots update display only, never trigger tap bindings.
      }

      if (message.type !== "gesture" || typeof message.gesture !== "string") return;
      this.dispatchGestureEvent(message as unknown as GestureEvent);
    };
  }

  private dispatchGestureEvent(event: GestureEvent): void {
    if (event.phase === "start") {
      this.activeGestures.add(event.gesture);
    } else if (event.phase === "end") {
      this.activeGestures.delete(event.gesture);
    }
    this.gestureListeners.forEach((cb) => cb(event));
  }

  /**
   * Dev-only: inject a fake gesture start/end pair through the exact same
   * dispatch path a real CV event takes, bypassing the WebSocket entirely.
   * Lets you verify the binding -> tap/hold/release -> SendInput chain
   * without needing to physically perform the movement in front of the
   * camera.
   */
  debugInjectGesture(gesture: GestureName, holdMs = 200): void {
    const now = Date.now();
    this.dispatchGestureEvent({ type: "gesture", gesture, phase: "start", confidence: 1, timestamp: now });
    setTimeout(() => {
      this.dispatchGestureEvent({ type: "gesture", gesture, phase: "end", confidence: 1, timestamp: Date.now() });
    }, holdMs);
  }
}

export interface GestureSocketState {
  connected: boolean;
  snapshot: StateSnapshot | null;
  activeGestures: ReadonlySet<GestureName>;
}

/** Thin React binding: turns a shared GestureSocket's subscriptions into render state. */
export function useGestureSocket(socket: GestureSocket): GestureSocketState {
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [activeGestures, setActiveGestures] = useState<ReadonlySet<GestureName>>(new Set());

  useEffect(() => {
    const unsubConnection = socket.onConnectionChange(setConnected);
    const unsubSnapshot = socket.onSnapshot((snap) => {
      setSnapshot(snap);
      setActiveGestures(new Set(socket.getActiveGestures()));
    });
    const unsubGesture = socket.onGestureEvent(() => {
      setActiveGestures(new Set(socket.getActiveGestures()));
    });
    return () => {
      unsubConnection();
      unsubSnapshot();
      unsubGesture();
    };
  }, [socket]);

  return { connected, snapshot, activeGestures };
}
