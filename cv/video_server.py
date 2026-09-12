"""Tiny MJPEG HTTP server so the Electron UI can show the annotated webcam feed.

Python owns the webcam and MediaPipe processing; this module just republishes
whatever the latest annotated JPEG frame is at http://localhost:8766/video_feed
as a multipart/x-mixed-replace stream, which a plain <img> tag can render.
"""

from __future__ import annotations

import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HOST = "localhost"
PORT = 8766
BOUNDARY = "frame"
STREAM_FPS = 15


class FrameBuffer:
    """Thread-safe holder for the single most recent JPEG-encoded frame."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jpeg_bytes: bytes | None = None

    def update(self, jpeg_bytes: bytes) -> None:
        with self._lock:
            self._jpeg_bytes = jpeg_bytes

    def get(self) -> bytes | None:
        with self._lock:
            return self._jpeg_bytes


def _make_handler(frame_buffer: FrameBuffer):
    class MjpegHandler(BaseHTTPRequestHandler):
        # Browsers expect a persistent HTTP/1.1 connection to keep parsing
        # multipart boundaries as an image stream; HTTP/1.0 (the default)
        # makes some clients treat the response as a single static download.
        protocol_version = "HTTP/1.1"

        def log_message(self, *_args) -> None:
            pass  # silence default per-request console spam

        def do_GET(self) -> None:
            if urlparse(self.path).path != "/video_feed":
                self.send_response(404)
                self.end_headers()
                return

            self.send_response(200)
            self.send_header(
                "Content-Type", f"multipart/x-mixed-replace; boundary={BOUNDARY}"
            )
            self.send_header("Cache-Control", "no-cache, private")
            self.send_header("Pragma", "no-cache")
            self.end_headers()

            try:
                while True:
                    jpeg_bytes = frame_buffer.get()
                    if jpeg_bytes is not None:
                        self.wfile.write(f"--{BOUNDARY}\r\n".encode())
                        self.wfile.write(b"Content-Type: image/jpeg\r\n")
                        self.wfile.write(f"Content-Length: {len(jpeg_bytes)}\r\n\r\n".encode())
                        self.wfile.write(jpeg_bytes)
                        self.wfile.write(b"\r\n")
                    time.sleep(1 / STREAM_FPS)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass  # client (Electron <img>) navigated away or closed

    return MjpegHandler


def start_in_background_thread(frame_buffer: FrameBuffer) -> None:
    server = ThreadingHTTPServer((HOST, PORT), _make_handler(frame_buffer))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[video_server] streaming at http://{HOST}:{PORT}/video_feed")
