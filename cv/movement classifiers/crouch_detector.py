"""Crouch state machine using calibrated leg lengths and 3D knee flexion."""
from movement import MovementResult
from pose_features import MovementFeatures


class CrouchDetector:
    def __init__(self):
        self.active = False
        self._candidate_since = None

    def update(self, features: MovementFeatures | None, now: float, suppressed=False):
        phase = None
        confidence = features.confidence if features else 0.0
        if features is None or suppressed:
            phase = "end" if self.active else None
            self.active = False
            self._candidate_since = None
        else:
            enter = features.hip_drop > 0.18 and features.knee_bend > 20 and max(features.foot_lift) < 0.08
            leave = features.hip_drop < 0.10 or features.knee_bend < 12
            changing = leave if self.active else enter
            if changing:
                if self._candidate_since is None:
                    self._candidate_since = now
                if now - self._candidate_since >= 0.12:
                    self.active = not self.active
                    phase = "start" if self.active else "end"
                    self._candidate_since = None
            else:
                self._candidate_since = None
            if self.active and phase is None:
                phase = "active"
        return MovementResult("crouch", phase, self.active, confidence)
