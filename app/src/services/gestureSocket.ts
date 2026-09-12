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
  // Current values, so a component that subscribes *after* the connection
  // is already established (e.g. mounting ControllerScreen after Calibration
  // already saw "connected") gets synced immediately instead of only
  // hearing about the *next* change - onConnectionChange/onSnapshot are
  // "subscribe to future events", not "give me the current value".
  private connected = false;
  private latestSnapshot: StateSnapshot | null = null;

  private connectionListeners = new Set<Listener<boolean>>();
  private snapshotListeners = new Set<Listener<StateSnapshot | null>>();
  private gestureListeners = new Set<Listener<GestureEvent>>();

  connect(): void {
    this.cancelled = false;
    this.staleTimer = setInterval(() => {
      if (this.lastStateTimestamp && Date.now() - this.lastStateTimestamp > STALE_THRESHOLD_MS) {
        this.activeGestures.clear();
        this.lastStateTimestamp = 0;
        this.setSnapshot(null);
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

  isConnected(): boolean {
    return this.connected;
  }

  getSnapshot(): StateSnapshot | null {
    return this.latestSnapshot;
  }

  private setConnected(value: boolean): void {
    this.connected = value;
    this.connectionListeners.forEach((cb) => cb(value));
  }

  private setSnapshot(value: StateSnapshot | null): void {
    this.latestSnapshot = value;
    this.snapshotListeners.forEach((cb) => cb(value));
  }

  private openSocket(): void {
    const socket = new WebSocket(GESTURE_WS_URL);
    this.socket = socket;

    socket.onopen = () => this.setConnected(true);

    socket.onclose = () => {
      this.setConnected(false);
      this.activeGestures.clear();
      this.lastStateTimestamp = 0;
      this.setSnapshot(null);
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
          this.setSnapshot(null);
          return;
        }
        this.lastStateTimestamp = timestamp;
        this.activeGestures = new Set(
          message.active_gestures.filter((g): g is GestureName => typeof g === "string")
        );
        this.setSnapshot(message as unknown as StateSnapshot);
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
}

export interface GestureSocketState {
  connected: boolean;
  snapshot: StateSnapshot | null;
  activeGestures: ReadonlySet<GestureName>;
}

const sameGestures = (a: ReadonlySet<GestureName>, b: ReadonlySet<GestureName>): boolean =>
  a.size === b.size && [...a].every((g) => b.has(g));

/**
 * Focused hooks below so each screen only re-renders for the slice it
 * actually reads, rather than every consumer sharing one hook that
 * re-renders on every connection change, snapshot tick (broadcast
 * throttled to ~12Hz, but still frequent), and raw gesture event combined.
 * ControllerScreen, for instance, never reads `snapshot` but previously
 * re-rendered on every snapshot broadcast anyway because the old combined
 * hook's internal setSnapshot lived in its component state.
 */

export function useGestureConnection(socket: GestureSocket): boolean {
  const [connected, setConnected] = useState(() => socket.isConnected());
  useEffect(() => {
    setConnected(socket.isConnected()); // re-sync: socket may have changed state before this effect ran
    return socket.onConnectionChange(setConnected);
  }, [socket]);
  return connected;
}

export function useGestureSnapshot(socket: GestureSocket): StateSnapshot | null {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(() => socket.getSnapshot());
  useEffect(() => {
    setSnapshot(socket.getSnapshot());
    return socket.onSnapshot(setSnapshot);
  }, [socket]);
  return snapshot;
}

export function useActiveGestures(socket: GestureSocket): ReadonlySet<GestureName> {
  const [activeGestures, setActiveGestures] = useState<ReadonlySet<GestureName>>(
    () => new Set(socket.getActiveGestures())
  );
  useEffect(() => {
    // Bail out (return the same reference) when the content hasn't actually
    // changed, so a snapshot tick that doesn't touch active gestures - most
    // of them - doesn't force a re-render.
    const sync = () =>
      setActiveGestures((prev) => {
        const next = socket.getActiveGestures();
        return sameGestures(prev, next) ? prev : new Set(next);
      });
    sync();
    const unsubSnapshot = socket.onSnapshot(sync);
    const unsubGesture = socket.onGestureEvent(sync);
    return () => {
      unsubSnapshot();
      unsubGesture();
    };
  }, [socket]);
  return activeGestures;
}

/** Convenience for screens that genuinely need all three (e.g. CalibrationScreen). */
export function useGestureSocket(socket: GestureSocket): GestureSocketState {
  const connected = useGestureConnection(socket);
  const snapshot = useGestureSnapshot(socket);
  const activeGestures = useActiveGestures(socket);
  return { connected, snapshot, activeGestures };
}
