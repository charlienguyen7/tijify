import { useEffect, useRef, useState } from "react";
import GestureToast from "../components/GestureToast";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";
import VideoFeed from "../components/VideoFeed";
import { GESTURE_LABELS, GESTURE_LIST } from "../data/gestures";
import { useGestureSocket, type GestureSocket } from "../services/gestureSocket";
import type { GestureEvent } from "../types/gesture";
import type { Binding, Profile } from "../types/profile";
import { normalizeKeyCode } from "../components/KeyCaptureButton";
import "./ControllerScreen.css";

interface ControllerScreenProps {
  profile: Profile;
  socket: GestureSocket;
  onStop: () => void; // Stop button / ESC -> back to the binding/configuration screen
  onBackToHome: () => void; // Header back -> Home
}

/** Subscribes to raw gesture events and drives keyboard output via window.tijify. */
function useInputEffect(socket: GestureSocket, bindings: Binding[], enabled: boolean) {
  const [lastStart, setLastStart] = useState<GestureEvent | null>(null);
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    return socket.onGestureEvent((event) => {
      if (event.phase === "start") setLastStart(event);
      if (!enabledRef.current) return;
      const binding = bindingsRef.current.find((b) => b.gesture === event.gesture);
      if (!binding || !binding.key) return;
      if (binding.mode === "tap") {
        if (event.phase === "start") void window.tijify.tap(binding.key);
      } else if (event.phase === "start") {
        void window.tijify.hold(binding.key);
      } else if (event.phase === "end") {
        void window.tijify.release(binding.key);
      }
    });
  }, [socket]);

  // Disabled (not ready / disconnected) or unmounting: release everything.
  useEffect(() => {
    if (!enabled) void window.tijify.releaseAll();
  }, [enabled]);
  useEffect(() => () => void window.tijify.releaseAll(), []);

  return lastStart;
}

/** Legacy debug-only tracker for physical keys held in this window, kept
 *  visually separate from Tijify's own emitted output. */
function usePhysicalKeys(): Set<string> {
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  useEffect(() => {
    const held = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      held.add(normalizeKeyCode(e.code));
      setPressed(new Set(held));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(normalizeKeyCode(e.code));
      setPressed(new Set(held));
    };
    const onBlur = () => {
      held.clear();
      setPressed(new Set());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  return pressed;
}

export default function ControllerScreen({ profile, socket, onStop, onBackToHome }: ControllerScreenProps) {
  const { connected, snapshot, activeGestures } = useGestureSocket(socket);
  const enabled = connected && !!snapshot && snapshot.tracking && snapshot.controller_ready;
  const lastStart = useInputEffect(socket, profile.bindings, enabled);
  const physicalKeys = usePhysicalKeys();

  const handleStop = () => {
    void window.tijify.releaseAll();
    onStop();
  };

  const handleBackToHome = () => {
    void window.tijify.releaseAll();
    onBackToHome();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      e.preventDefault();
      handleStop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orderedActive = GESTURE_LIST.filter((g) => activeGestures.has(g));
  const outputKeys = Array.from(
    new Set(
      orderedActive
        .map((g) => profile.bindings.find((b) => b.gesture === g)?.key)
        .filter((k): k is string => !!k)
    )
  );

  return (
    <div className="screen controller-screen">
      <Header title={profile.name} onBack={handleBackToHome} backLabel="Home" />
      <div className="row" style={{ justifyContent: "center" }}>
        <StatusBadge connected={connected} />
        {!enabled && <span className="pill pill-bad">Controls disabled — not ready</span>}
      </div>
      {!enabled && (
        <p className="text-muted" style={{ textAlign: "center" }}>
          why: connected={String(connected)} snapshot={snapshot ? "yes" : "no"} tracking=
          {String(snapshot?.tracking)} controller_ready={String(snapshot?.controller_ready)} calibration=
          {snapshot?.calibration.state ?? "n/a"} state={snapshot?.state ?? "n/a"}
        </p>
      )}

      <div className="controller-grid">
        <VideoFeed>
          <GestureToast lastStart={lastStart} />
        </VideoFeed>

        <div className="controller-side stack">
          <div className="card">
            <h2>Active Movements</h2>
            {orderedActive.length === 0 && <p className="text-muted">No movement detected.</p>}
            <div className="stack">
              {orderedActive.map((gesture) => {
                const binding = profile.bindings.find((b) => b.gesture === gesture);
                return (
                  <div key={gesture} className="active-movement-row">
                    <span>{GESTURE_LABELS[gesture]}</span>
                    <span className="active-movement-arrow">→</span>
                    <span className={binding?.key ? "active-movement-key" : "text-muted"}>
                      {binding?.key ?? "UNBOUND"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h2>Current Output</h2>
            {outputKeys.length === 0 ? (
              <p className="text-muted">—</p>
            ) : (
              <div className="row">
                {outputKeys.map((key) => (
                  <span key={key} className="pill pill-ok">
                    {key}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card controller-debug">
            <p className="text-muted">Physical keys held in this window (debug only)</p>
            <p className="text-muted">{physicalKeys.size > 0 ? [...physicalKeys].join(" + ") : "—"}</p>
          </div>

          {/* Dev-only: two independent debug actions, deliberately separate.
              "Simulate" drives the real gesture pipeline (respects the
              readiness gate) so you can see it reflected in Active
              Movements/toast. "Force key" calls window.tijify directly,
              bypassing the CV/readiness gate entirely, to test in isolation
              whether the key actually reaches the OS - useful while CV
              connectivity is flaky, since it isolates the injection chain
              from the gesture pipeline. */}
          <div className="card controller-debug">
            <p className="text-muted">
              Debug: click into this box, then use the buttons below - a key that actually reaches the
              OS will type right here, no window-switching needed.
            </p>
            <textarea
              className="debug-textarea"
              placeholder="Click here, then press a debug button below..."
              rows={3}
            />

            <p className="text-muted" style={{ marginTop: 10 }}>
              Simulate movement (goes through the real gate - blocked while CV isn't ready)
            </p>
            <div className="row">
              {profile.bindings.map((binding) => (
                <button
                  key={binding.gesture}
                  className="btn btn-secondary"
                  onMouseDown={(e) => e.preventDefault()} // don't steal focus from the textarea above
                  onClick={() => socket.debugInjectGesture(binding.gesture)}
                >
                  {GESTURE_LABELS[binding.gesture]}
                </button>
              ))}
            </div>

            <p className="text-muted" style={{ marginTop: 10 }}>
              Force key press (bypasses CV entirely)
            </p>
            <div className="row">
              {profile.bindings
                .filter((b) => b.key)
                .map((binding) => (
                  <button
                    key={binding.gesture}
                    className="btn btn-secondary"
                    onMouseDown={(e) => e.preventDefault()} // don't steal focus from the textarea above
                    onClick={() => {
                      if (!binding.key) return;
                      if (binding.mode === "tap") {
                        void window.tijify.tap(binding.key);
                      } else {
                        void window.tijify.hold(binding.key);
                        setTimeout(() => binding.key && void window.tijify.release(binding.key), 400);
                      }
                    }}
                  >
                    {binding.key}
                  </button>
                ))}
            </div>
          </div>

          <button className="btn btn-danger" onClick={handleStop}>
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}
