import { useEffect, useRef, useState } from "react";
import GestureToast from "../components/GestureToast";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";
import VideoFeed from "../components/VideoFeed";
import { GESTURE_LABELS, GESTURE_LIST } from "../data/gestures";
import { useGestureSocket, type GestureSocket } from "../services/gestureSocket";
import type { GestureEvent } from "../types/gesture";
import type { Binding, Profile } from "../types/profile";
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
      if (!binding || binding.keys.length === 0) return;
      if (binding.mode === "tap") {
        if (event.phase === "start") binding.keys.forEach((key) => void window.tijify.tap(key));
      } else if (event.phase === "start") {
        binding.keys.forEach((key) => void window.tijify.hold(key));
      } else if (event.phase === "end") {
        binding.keys.forEach((key) => void window.tijify.release(key));
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

export default function ControllerScreen({ profile, socket, onStop, onBackToHome }: ControllerScreenProps) {
  const { connected, activeGestures } = useGestureSocket(socket);
  // Readiness gate removed: gestures now drive keyboard output as soon as
  // they're detected, regardless of the CV service's own reported
  // tracking/calibration state.
  const enabled = true;
  const lastStart = useInputEffect(socket, profile.bindings, enabled);

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
    new Set(orderedActive.flatMap((g) => profile.bindings.find((b) => b.gesture === g)?.keys ?? []))
  );

  return (
    <div className="screen controller-screen">
      <Header title={profile.name} onBack={handleBackToHome} backLabel="Home" />
      <div className="row" style={{ justifyContent: "center" }}>
        <StatusBadge connected={connected} />
      </div>

      <div className="controller-layout">
        <div className="card controller-video-card">
          <VideoFeed>
            <GestureToast lastStart={lastStart} />
          </VideoFeed>
        </div>

        <div className="controller-bottom-row">
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
                    <span className={binding?.keys.length ? "active-movement-key" : "text-muted"}>
                      {binding?.keys.length ? binding.keys.join(" + ") : "UNBOUND"}
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
        </div>

        <button className="btn btn-danger" onClick={handleStop}>
          Stop
        </button>
      </div>
    </div>
  );
}
