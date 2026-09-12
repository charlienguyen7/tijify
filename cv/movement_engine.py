"""Coordinate independent classifiers and return every event for the frame."""
from movement_classifiers.crouch_detector import CrouchDetector
from movement_classifiers.jump_detector import JumpDetector
from movement_classifiers.lean_detector import LeanDetector
from movement_classifiers.orientation_detector import OrientationDetector
from movement_classifiers.foot_detector import FootDetector
from movement_classifiers.gait_detector import GaitDetector
from movement_classifiers.stomp_detector import StompDetector


class MovementEngine:
    def __init__(self):
        self.jump = JumpDetector()
        self.crouch = CrouchDetector()
        self.lean = LeanDetector()
        self.orientation = OrientationDetector()
        self.feet = FootDetector()
        self.gait = GaitDetector()
        self.stomps = (StompDetector("left"), StompDetector("right"))
        self._last_time = None

    def update(self, features, now):
        if self._last_time is not None and now - self._last_time > 0.5:
            features = None  # Never join motion histories across a processing stall.
        self._last_time = now
        jump = self.jump.update(features, now)
        crouch = self.crouch.update(features, now, suppressed=jump.active)
        contacts = self.feet.update(features, now, jumping=jump.active or jump.phase == "end")
        events = [crouch, jump]
        events.extend(self.lean.update(features, now))
        events.extend(self.orientation.update(features, now))
        events.extend(self.gait.update(features, now, contacts, jumping=jump.active))
        events.extend(d.update(features, now, contacts) for d in self.stomps)
        return [e for e in events if e.phase is not None]
