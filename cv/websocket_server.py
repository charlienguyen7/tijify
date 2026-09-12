"""Tiny WebSocket server that broadcasts gesture events to the Electron app.

Runs its own asyncio event loop in a background thread so the main (webcam
capture) thread can stay simple, synchronous OpenCV code. Call
`start_in_background_thread()` once, then use `broadcast_gesture_threadsafe(...)`
from any other thread to push an event out to all connected clients.

Protocol: see shared/protocol.md. Emits gesture events and full state snapshots.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time

import websockets

HOST = "localhost"
PORT = 8765


class GestureServer:
    def __init__(self) -> None:
        self._clients: set[websockets.WebSocketServerProtocol] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._latest_state: dict | None = None

    async def _handler(self, websocket) -> None:
        self._clients.add(websocket)
        try:
            if self._latest_state is not None:
                await websocket.send(json.dumps(self._latest_state))
            async for _ in websocket:
                pass  # this server is send-only; ignore anything the client sends
        finally:
            self._clients.discard(websocket)

    async def _broadcast(self, message: dict) -> None:
        if not self._clients:
            return
        payload = json.dumps(message)
        dead = []
        for client in list(self._clients):
            try:
                await client.send(payload)
            except websockets.ConnectionClosed:
                dead.append(client)
        for client in dead:
            self._clients.discard(client)

    async def _publish_state(self, message: dict) -> None:
        self._latest_state = message
        await self._broadcast(message)

    def broadcast_state_threadsafe(self, message: dict):
        """Cache even with no clients; replay the latest snapshot on connection."""
        if self._loop is not None:
            return asyncio.run_coroutine_threadsafe(self._publish_state(message), self._loop)
        return None

    async def _serve_forever(self) -> None:
        async with websockets.serve(self._handler, HOST, PORT):
            print(f"[websocket_server] listening on ws://{HOST}:{PORT}")
            await asyncio.Future()  # run until cancelled

    def start_in_background_thread(self) -> None:
        def run_loop() -> None:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self._loop = loop
            loop.run_until_complete(self._serve_forever())

        thread = threading.Thread(target=run_loop, daemon=True)
        thread.start()

        # Wait briefly for the loop to be assigned before returning.
        while self._loop is None:
            time.sleep(0.01)

    def broadcast_gesture_threadsafe(self, gesture: str, phase: str, confidence: float = 1.0) -> None:
        """Called from the main (webcam) thread to send a gesture event."""
        if self._loop is None:
            return
        message = {
            "type": "gesture",
            "gesture": gesture,
            "phase": phase,
            "confidence": confidence,
            "timestamp": int(time.time() * 1000),
        }
        asyncio.run_coroutine_threadsafe(self._broadcast(message), self._loop)
