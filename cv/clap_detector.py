"""Minimal heuristic clap detector.

Tracks the distance between two hand wrists over time and reports a
start/active/end gesture lifecycle (matching shared/protocol.md) as hands
go separated -> approaching -> together -> separated again. Requires a
fresh separation before a new clap can start, so one clap only ever
triggers one "start".

MediaPipe's palm detector can merge two overlapping hands into a single
detection (or drop one) right as they touch — a known limitation, not a
tuning bug (their own docs note this as a worst case for hand-on-hand
occlusion). A real clap is exactly that worst case. So instead of requiring
an observed close-distance reading while still tracking 2 hands, losing
hand tracking while hands were already close and approaching is itself
treated as the clap.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass

# Distances are in MediaPipe's normalized [0, 1] image coordinates, measured
# wrist-to-wrist. Wrists sit at the base of the hand, so they stay noticeably
# apart even with palms fully pressed together (observed ~0.18 in testing) —
# these thresholds are calibrated around that, not near-zero.
SEPARATED_DISTANCE = 0.40        # hands must reach at least this far apart to "arm" the detector
CLAP_DISTANCE = 0.20             # hands closer than this counts as together (clap start)
CLAP_EXIT_DISTANCE = 0.26        # hands must move out at least this far to count as "end" (hysteresis)
OCCLUSION_START_DISTANCE = 0.30  # if hands were at least this close and closing in when tracking
                                  # drops below 2 hands, treat the drop itself as the clap
MAX_TOGETHER_SECONDS = 2.0       # safety net: force "end" if occlusion never resolves (hands left frame)
HISTORY_LEN = 5                  # frames kept to judge an approaching trend

STATE_NO_HANDS = "NO HANDS"
STATE_ONE_HAND = "ONLY ONE HAND"
STATE_SEPARATED = "HANDS SEPARATED"
STATE_APPROACHING = "HANDS APPROACHING"
STATE_CLAP = "CLAP DETECTED"


@dataclass
class ClapResult:
    distance: float | None
    state: str
    phase: str | None  # "start" | "active" | "end" | None (no gesture event this frame)


class ClapDetector:
    """Feed it hand-tracking state every frame; it tells you when a clap starts/continues/ends."""

    def __init__(self) -> None:
        self._history: deque[float] = deque(maxlen=HISTORY_LEN)
        self._armed = True      # True once hands have been seen fully separated
        self._together = False  # True while a clap is currently in progress
        self._together_since = 0.0

    def update(self, hand_count: int, distance: float | None) -> ClapResult:
        now = time.monotonic()

        if hand_count >= 2 and distance is not None:
            return self._update_two_hands(distance, now)
        return self._update_degraded(hand_count, now)

    def _update_two_hands(self, distance: float, now: float) -> ClapResult:
        self._history.append(distance)

        if distance >= SEPARATED_DISTANCE:
            self._armed = True

        if self._together:
            if distance >= CLAP_EXIT_DISTANCE:
                self._together = False
                return ClapResult(distance, STATE_SEPARATED, "end")
            return ClapResult(distance, STATE_CLAP, "active")

        approaching = len(self._history) >= 2 and self._history[-1] < self._history[0]

        if self._armed and distance < CLAP_DISTANCE and approaching:
            self._armed = False
            self._together = True
            self._together_since = now
            self._history.clear()
            return ClapResult(distance, STATE_CLAP, "start")

        state = STATE_APPROACHING if approaching and distance < SEPARATED_DISTANCE else STATE_SEPARATED
        return ClapResult(distance, state, None)

    def _update_degraded(self, hand_count: int, now: float) -> ClapResult:
        """Fewer than 2 hands tracked: hand-on-hand occlusion (mid-clap) or hands left the frame."""
        if self._together:
            # Already mid-clap: occlusion while hands are together is expected.
            # Give it a moment to resolve before assuming the hands left entirely.
            if now - self._together_since > MAX_TOGETHER_SECONDS:
                self._together = False
                self._history.clear()
                return ClapResult(None, STATE_NO_HANDS, "end")
            return ClapResult(None, STATE_CLAP, "active")

        approaching = len(self._history) >= 2 and self._history[-1] < self._history[0]
        was_close = len(self._history) > 0 and self._history[-1] < OCCLUSION_START_DISTANCE
        self._history.clear()  # can't trust a distance trend across a tracking gap

        if self._armed and approaching and was_close:
            self._armed = False
            self._together = True
            self._together_since = now
            return ClapResult(None, STATE_CLAP, "start")

        state = STATE_ONE_HAND if hand_count == 1 else STATE_NO_HANDS
        return ClapResult(None, state, None)
