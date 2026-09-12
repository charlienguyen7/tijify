import { useEffect } from "react";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";
import VideoFeed from "../components/VideoFeed";
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
export default function CalibrationScreen({ profile, socket, onBack, onReady }: CalibrationScreenProps) {
  const { connected, snapshot } = useGestureSocket(socket);

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
        <div className="card calibration-card">
          <VideoFeed />
          <p className="calibration-message">
            {snapshot?.calibration.message ?? "Step back so your full body is visible"}
          </p>
          <div className="calibration-progress-track">
            <div
              className="calibration-progress-fill"
              style={{ width: `${Math.round((snapshot?.calibration.progress ?? 0) * 100)}%` }}
            />
          </div>
          <p className="text-muted">
            Calibration: {Math.round((snapshot?.calibration.progress ?? 0) * 100)}%
          </p>
        </div>
      )}
    </div>
  );
}
