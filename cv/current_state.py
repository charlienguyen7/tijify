"""Complete current-state snapshot for the desktop app (see shared/protocol.md)."""
import time


def build_state(calibration, events=(), *, camera_connected, tracking, fps=0.0, stopped=False):
    ready = camera_connected and tracking and calibration.baseline is not None and not stopped
    active = sorted({e.gesture for e in events if e.active}) if ready else []
    state = "stopped" if stopped else "camera-unavailable" if not camera_connected else "tracking-lost" if not tracking else "calibrating" if not ready else "active" if active else "neutral"
    return {
        "type": "state",
        "state": state,
        "active_gestures": active,
        "camera_connected": camera_connected,
        "tracking": tracking,
        "controller_ready": ready,
        "calibration": {
            "state": "complete" if calibration.baseline is not None else "in-progress",
            "progress": 1.0 if calibration.baseline is not None else calibration.progress,
            "message": calibration.message,
        },
        "fps": round(fps, 1),
        "timestamp": int(time.time() * 1000),
    }
