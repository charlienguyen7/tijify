"""Tijify CV service.

Webcam -> MediaPipe pose -> overlapping movements -> WebSocket events
                                                  -> annotated MJPEG video

Run with: python main.py
Stop with: Q in the preview or terminal, close the preview, or Ctrl+C

Uses the MediaPipe Tasks API. The pose model downloads to ./models/
on first run. Stand upright and still for the initial three-second calibration.
"""

from __future__ import annotations

import os
import argparse
import textwrap
import math
import sys
import time
import urllib.request
from contextlib import ExitStack
from collections import deque

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

import video_server
import websocket_server
from movement_engine import MovementEngine
from pose_features import PoseCalibration, read_pose
from current_state import build_state

CAPTURE_WIDTH = 640
CAPTURE_HEIGHT = 480
PREVIEW_WINDOW = "Tijify - Movement Detection"

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
POSE_MODEL_PATH = os.path.join(MODEL_DIR, "pose_landmarker_full.task")
POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_full/float16/1/pose_landmarker_full.task"
)


def ensure_model(path=POSE_MODEL_PATH, url=POSE_MODEL_URL) -> None:
    if os.path.exists(path):
        return
    os.makedirs(MODEL_DIR, exist_ok=True)
    print(f"[main] downloading landmark model to {path} ...")
    temporary = path + ".download"
    urllib.request.urlretrieve(url, temporary)
    os.replace(temporary, path)
    print("[main] model download complete")


def quit_requested() -> bool:
    """Poll the focused terminal without blocking webcam processing.

    Windows accepts q immediately; other terminals accept q followed by Enter.
    """
    if os.name == "nt":
        import msvcrt
        while msvcrt.kbhit():
            key = msvcrt.getwch()
            if key in ("\x00", "\xe0"):
                msvcrt.getwch()  # Consume the second code of a special key.
            elif key.lower() == "q":
                return True
        return False
    import select
    if sys.stdin.isatty() and select.select([sys.stdin], [], [], 0)[0]:
        return sys.stdin.readline().strip().lower() == "q"
    return False


def show_preview(frame) -> bool:
    """Display the local frame and return True when the user requests exit."""
    cv2.imshow(PREVIEW_WINDOW, frame)
    key = cv2.waitKey(1) & 0xFF
    return key in (ord("q"), ord("Q")) or cv2.getWindowProperty(PREVIEW_WINDOW, cv2.WND_PROP_VISIBLE) < 1


def draw_pose_landmarks(frame, landmarks, calibration):
    height, width = frame.shape[:2]
    if landmarks:
        points = [(int(p.x * width), int(p.y * height))
                  if math.isfinite(p.x) and math.isfinite(p.y) and 0 <= p.x <= 1 and 0 <= p.y <= 1
                  else None for p in landmarks]
        for connection in vision.PoseLandmarksConnections.POSE_LANDMARKS:
            a, b = connection.start, connection.end
            if points[a] is not None and points[b] is not None and min(landmarks[a].visibility or 0, landmarks[b].visibility or 0) >= 0.65:
                cv2.line(frame, points[a], points[b], (255, 200, 0), 2)
        for p, point in zip(landmarks, points):
            if point is not None and (p.visibility or 0) >= 0.65:
                cv2.circle(frame, point, 3, (0, 255, 0), -1)
    if calibration.baseline:
        # Show the stored standing foot reference, not an inferred 3D floor plane.
        for point in calibration.baseline.feet:
            x, y = map(int, point)
            cv2.line(frame, (x - 15, y), (x + 15, y), (0, 255, 255), 2)


def draw_overlay(frame, fps, movement, calibration, features):
    lines = [
        f"FPS: {fps:.1f}",
        *textwrap.wrap(f"Movement: {movement}", width=65),
        calibration.message,
        "Press Q in this window or terminal to quit",
    ]
    if features:
        lines.append(f"Hip drop: {features.hip_drop:.2f} | Knee bend: {features.knee_bend:.0f} deg")
        lines.append(f"Lean: {features.lean:+.2f} | Turn: {features.yaw:+.0f} deg (right +)")
    y = 24
    for line in lines:
        cv2.putText(frame, line, (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(frame, line, (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
        y += 24


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrated overlapping body movement detection")
    parser.add_argument("--camera", type=int, default=1,
                        help="Camera index (default: 1 for an external webcam; try 0 or 2 if needed)")
    args = parser.parse_args()
    ensure_model()

    gesture_server = websocket_server.GestureServer()
    gesture_server.start_in_background_thread()

    frame_buffer = video_server.FrameBuffer()
    video_server.start_in_background_thread(frame_buffer)

    calibration = PoseCalibration()
    engine = MovementEngine()
    gesture_server.broadcast_state_threadsafe(build_state(calibration, camera_connected=False, tracking=False))

    print(f"[main] Opening camera index {args.camera}")
    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAPTURE_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAPTURE_HEIGHT)

    if not cap.isOpened():
        print(f"[main] ERROR: could not open camera {args.camera}. Try --camera 0 or --camera 2.")
        cap.release()
        return

    resources = ExitStack()
    resources.callback(cap.release)
    resources.callback(cv2.destroyAllWindows)
    try:
        cv2.namedWindow(PREVIEW_WINDOW, cv2.WINDOW_AUTOSIZE)
        pose_landmarker = resources.enter_context(vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=POSE_MODEL_PATH),
                running_mode=vision.RunningMode.VIDEO,
                num_poses=1,
                min_pose_detection_confidence=0.65,
                min_pose_presence_confidence=0.65,
                min_tracking_confidence=0.6,
            )
        ))
    except BaseException:
        resources.close()
        raise

    print("[main] Tijify CV service running. Press Q in the preview or terminal to stop (or Ctrl+C).")

    start_time = time.monotonic()
    last_timestamp = -1
    frame_times = deque(maxlen=30)
    print("[main] Face the camera and stand still for 3 seconds with both feet visible.")
    print("[main] Leave the frame for 2 seconds and return to recalibrate.")
    try:
        while not quit_requested():
            ok, frame = cap.read()
            if not ok:
                now = time.monotonic()
                calibration.update(None, now, "Camera frame unavailable")
                for event in engine.update(None, now):
                    if event.phase:
                        gesture_server.broadcast_gesture_threadsafe(event.gesture, event.phase, event.confidence)
                gesture_server.broadcast_state_threadsafe(build_state(calibration, camera_connected=False, tracking=False))
                # Replace the preview instead of leaving a stale active label on screen.
                missing = np.zeros((CAPTURE_HEIGHT, CAPTURE_WIDTH, 3), dtype=np.uint8)
                draw_overlay(missing, 0, "TRACKING LOST", calibration, None)
                encoded, jpeg = cv2.imencode(".jpg", missing)
                if encoded:
                    frame_buffer.update(jpeg.tobytes())
                frame_times.clear()
                if show_preview(missing):
                    break
                time.sleep(0.05)
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            now = time.monotonic()
            timestamp_ms = max(last_timestamp + 1, int((now - start_time) * 1000))
            last_timestamp = timestamp_ms
            pose_result = pose_landmarker.detect_for_video(mp_image, timestamp_ms)
            sample, reason = read_pose(pose_result, frame.shape[1], frame.shape[0])
            features = calibration.update(sample, now, reason)
            events = engine.update(features, now)
            for event in events:
                gesture_server.broadcast_gesture_threadsafe(event.gesture, event.phase, event.confidence)
                if event.phase != "active":
                    print(f"GESTURE {event.gesture} {event.phase} {event.confidence:.2f}")
            draw_pose_landmarks(frame, pose_result.pose_landmarks[0] if pose_result.pose_landmarks else [], calibration)

            # Infer on the original image to preserve anatomical left/right;
            # mirror only the finished skeleton preview, before drawing text.
            frame = cv2.flip(frame, 1)
            active = [event.gesture.upper() for event in events if event.active]
            movement = " + ".join(active) if active else "NEUTRAL"
            if features is None:
                movement = "CALIBRATING" if sample else "TRACKING LOST"
            frame_times.append(time.monotonic())
            fps = ((len(frame_times) - 1) / (frame_times[-1] - frame_times[0])
                   if len(frame_times) > 1 and frame_times[-1] > frame_times[0] else 0)
            draw_overlay(frame, fps, movement, calibration, features)
            gesture_server.broadcast_state_threadsafe(build_state(
                calibration, events, camera_connected=True, tracking=sample is not None, fps=fps))

            ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ok:
                frame_buffer.update(jpeg.tobytes())
            if show_preview(frame):
                break

    except KeyboardInterrupt:
        print("[main] shutting down")
    finally:
        for event in engine.update(None, time.monotonic()):
            if event.phase:
                gesture_server.broadcast_gesture_threadsafe(event.gesture, event.phase, event.confidence)
        pending = gesture_server.broadcast_state_threadsafe(build_state(
            calibration, camera_connected=False, tracking=False, stopped=True))
        if pending is not None:
            try:
                pending.result(timeout=1.0)
            except Exception as exc:
                print(f"[main] Could not send shutdown state: {exc}")
        resources.close()


if __name__ == "__main__":
    main()
