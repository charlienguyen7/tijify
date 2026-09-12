"""Tijify CV service.

Webcam -> MediaPipe HandLandmarker -> clap detection -> WebSocket gesture events
                                                       -> annotated MJPEG video feed

Run with: python main.py
Stop with: Ctrl+C

Uses the MediaPipe Tasks API (mediapipe>=1.0 dropped the old `mp.solutions`
API), which needs a small model file. It is downloaded automatically into
./models/hand_landmarker.task on first run if not already present.
"""

from __future__ import annotations

import os
import time
import urllib.request

import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

import video_server
import websocket_server
from clap_detector import ClapDetector, STATE_CLAP

CAPTURE_WIDTH = 640
CAPTURE_HEIGHT = 480

WRIST = 0  # landmark index for the wrist, per MediaPipe's hand landmark topology

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "hand_landmarker.task")
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/latest/hand_landmarker.task"
)


def ensure_model() -> None:
    if os.path.exists(MODEL_PATH):
        return
    os.makedirs(MODEL_DIR, exist_ok=True)
    print(f"[main] downloading hand landmark model to {MODEL_PATH} ...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("[main] model download complete")


def wrist_distance(hands_landmarks) -> float | None:
    """Straight-line distance between the two wrists, in normalized image units."""
    if len(hands_landmarks) < 2:
        return None
    a = hands_landmarks[0][WRIST]
    b = hands_landmarks[1][WRIST]
    dx = a.x - b.x
    dy = a.y - b.y
    return (dx * dx + dy * dy) ** 0.5


def draw_hand_landmarks(frame, hands_landmarks) -> None:
    height, width = frame.shape[:2]
    for landmarks in hands_landmarks:
        points = [(int(lm.x * width), int(lm.y * height)) for lm in landmarks]
        for connection in vision.HandLandmarksConnections.HAND_CONNECTIONS:
            cv2.line(frame, points[connection.start], points[connection.end], (255, 255, 255), 2)
        for x, y in points:
            cv2.circle(frame, (x, y), 3, (0, 255, 0), -1)


def draw_overlay(frame, distance: float | None, state: str) -> None:
    lines = [
        f"Hand distance: {distance:.2f}" if distance is not None else "Hand distance: --",
        f"Detector: {state}",
    ]
    y = 30
    for line in lines:
        cv2.putText(frame, line, (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(frame, line, (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 1, cv2.LINE_AA)
        y += 30

    if state == STATE_CLAP:
        cv2.putText(
            frame, "CLAP DETECTED", (10, y + 10),
            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 3, cv2.LINE_AA,
        )


def main() -> None:
    ensure_model()

    gesture_server = websocket_server.GestureServer()
    gesture_server.start_in_background_thread()

    frame_buffer = video_server.FrameBuffer()
    video_server.start_in_background_thread(frame_buffer)

    detector = ClapDetector()

    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAPTURE_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAPTURE_HEIGHT)

    if not cap.isOpened():
        print("[main] ERROR: could not open webcam")
        return

    landmarker = vision.HandLandmarker.create_from_options(
        vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=0.6,
            min_tracking_confidence=0.5,
        )
    )

    print("[main] Tijify CV service running. Press Ctrl+C in this terminal to stop.")

    start_time = time.monotonic()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                continue

            frame = cv2.flip(frame, 1)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int((time.monotonic() - start_time) * 1000)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            hands_landmarks = result.hand_landmarks or []
            draw_hand_landmarks(frame, hands_landmarks)

            hand_count = len(hands_landmarks)
            distance_in = wrist_distance(hands_landmarks) if hand_count >= 2 else None
            clap_result = detector.update(hand_count, distance_in)
            result_state = clap_result.state

            if clap_result.phase == "start":
                print("CLAP DETECTED")
            if clap_result.phase is not None:
                gesture_server.broadcast_gesture_threadsafe("clap", clap_result.phase)

            draw_overlay(frame, clap_result.distance, result_state)

            ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ok:
                frame_buffer.update(jpeg.tobytes())

    except KeyboardInterrupt:
        print("[main] shutting down")
    finally:
        cap.release()
        landmarker.close()


if __name__ == "__main__":
    main()
