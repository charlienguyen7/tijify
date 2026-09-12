import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from current_state import build_state
from movement import MovementResult
from pose_features import PoseCalibration


class StateTests(unittest.TestCase):
    def test_snapshot_overlaps_and_clears_on_loss(self):
        calibration = PoseCalibration()
        calibration.baseline = object()
        events = [MovementResult("turn-right", "active", True, 0.9),
                  MovementResult("jump", "start", True, 0.9),
                  MovementResult("crouch", "end", False, 0.9)]
        state = build_state(calibration, events, camera_connected=True, tracking=True, fps=24)
        self.assertEqual(state["active_gestures"], ["jump", "turn-right"])
        self.assertEqual(state["state"], "active")
        self.assertTrue(state["controller_ready"])
        json.dumps(state, allow_nan=False)
        lost = build_state(calibration, events, camera_connected=True, tracking=False)
        self.assertEqual(lost["active_gestures"], [])
        self.assertEqual(lost["state"], "tracking-lost")
        self.assertFalse(lost["controller_ready"])

    def test_neutral_calibrating_and_shutdown(self):
        c = PoseCalibration()
        self.assertEqual(build_state(c, camera_connected=True, tracking=True)["state"], "calibrating")
        c.baseline = object()
        self.assertEqual(build_state(c, camera_connected=True, tracking=True)["state"], "neutral")
        self.assertEqual(build_state(c, camera_connected=False, tracking=False)["state"], "camera-unavailable")
        self.assertEqual(build_state(c, camera_connected=False, tracking=False, stopped=True)["state"], "stopped")


class ReplayTests(unittest.IsolatedAsyncioTestCase):
    async def test_cache_without_clients_replayed_on_connect(self):
        # Exercise server cache/handler logic without requiring socket dependencies.
        spec = importlib.util.spec_from_file_location("state_server_test", Path(__file__).with_name("websocket_server.py"))
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"websockets": SimpleNamespace(ConnectionClosed=ConnectionError)}):
            spec.loader.exec_module(module)
        server = module.GestureServer()
        state = build_state(PoseCalibration(), camera_connected=False, tracking=False)
        await server._publish_state(state)

        class Client:
            def __init__(self):
                self.messages = []

            async def send(self, message):
                self.messages.append(json.loads(message))

            def __aiter__(self):
                return self

            async def __anext__(self):
                raise StopAsyncIteration

        client = Client()
        await server._handler(client)
        self.assertEqual(client.messages, [state])
        self.assertFalse(server._clients)


if __name__ == "__main__":
    unittest.main()
