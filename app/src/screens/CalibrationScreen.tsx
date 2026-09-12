import { memo, useEffect } from "react";
import Header from "../components/Header";
import ProgressRing from "../components/ProgressRing";
import ResizableVideoFeed from "../components/ResizableVideoFeed";
import StatusBadge from "../components/StatusBadge";
import { GESTURE_LABELS, GESTURE_LIST } from "../data/gestures";
import { useGestureSocket, type GestureSocket } from "../services/gestureSocket";
import type { Profile } from "../types/profile";
import "./CalibrationScreen.css";

interface CalibrationScreenProps {
  profile: Profile;
  socket: GestureSocket;
  onBack: () => void;
  onReady: () => void;
}

// Readiness gate straight from protocol.md's state snapshot fields - no new
// fields invented. Auto-advances to the controller screen once every
// condition holds.
function CalibrationScreen({ profile, socket, onBack, onReady }: CalibrationScreenProps) {
  const { connected, snapshot, activeGestures } = useGestureSocket(socket);
  const orderedActive = GESTURE_LIST.filter((g) => activeGestures.has(g));

  const ready =
    !!snapshot &&
    snapshot.camera_connected &&
    snapshot.tracking &&
    snapshot.calibration.state === "complete" &&
    snapshot.controller_ready;

  useEffect(() => {
    if (ready) onReady();
  }, [ready, onReady]);

  return (
    <div className="screen calibration-screen">
      <Header title={profile.name} onBack={onBack} backLabel="Home" />
      <div className="row" style={{ justifyContent: "center" }}>
        <StatusBadge connected={connected} />
      </div>

      {!connected ? (
        <div className="card calibration-disconnected">
          <h2>CV DISCONNECTED</h2>
          <p className="text-muted">Start the CV service to continue.</p>
        </div>
      ) : (
        <div className="calibration-layout">
          <div className="card calibration-video-card">
            <ResizableVideoFeed>
              <div className="calibration-ring-overlay">
                <ProgressRing
                  progress={snapshot?.calibration.progress ?? 0}
                  complete={snapshot?.calibration.state === "complete"}
                />
              </div>
            </ResizableVideoFeed>
            <p className="calibration-message">
              {snapshot?.calibration.message ?? "Step back so your full body is visible"}
            </p>
            <p className="text-muted">Drag the bottom-right corner to resize.</p>
          </div>

          <div className="card">
            <h2>Active Movements</h2>
            {orderedActive.length === 0 && <p className="text-muted">No movement detected.</p>}
            <div className="stack">
              {orderedActive.map((gesture) => (
                <div key={gesture} className="active-movement-row">
                  <span>{GESTURE_LABELS[gesture]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(CalibrationScreen);
