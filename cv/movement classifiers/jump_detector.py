"""Jump requires recent grounding, both feet lifting, and upward hip motion."""
from movement import MovementResult
from pose_features import MovementFeatures


class JumpDetector:
    def __init__(self):
        self.active = False
        self._ground_since = None
        self._last_ground = None
        self._armed = False
        self._started = None
        self._candidate_since = None
        self._landing_since = None

    def update(self, features: MovementFeatures | None, now: float):
        if features is None:
            was_active = self.active
            self.__init__()
            return MovementResult("jump", "end" if was_active else None, False, 0.0)
        f = features
        grounded = max(abs(v) for v in f.foot_lift) < 0.035
        phase = None
        if self.active:
            if grounded:
                if self._landing_since is None:
                    self._landing_since = now
            else:
                self._landing_since = None
            if (self._landing_since is not None and now - self._landing_since >= 0.08) or now - self._started > 2.0:
                self.active = False
                self._armed = False
                self._ground_since = None
                phase = "end"
            else:
                phase = "active"
        else:
            if grounded:
                if self._ground_since is None:
                    self._ground_since = now
                self._last_ground = now
                if now - self._ground_since >= 0.20:
                    self._armed = True
            else:
                self._ground_since = None
            takeoff = (self._armed and self._last_ground is not None and now - self._last_ground < 0.45
                       and min(f.foot_lift) > 0.055 and f.hip_drop < -0.06 and f.upward_speed > 0.25)
            if takeoff:
                if self._candidate_since is None:
                    self._candidate_since = now
                if now - self._candidate_since >= 0.035:
                    self.active = True
                    self._armed = False
                    self._started = now
                    self._landing_since = None
                    phase = "start"
            else:
                self._candidate_since = None
        return MovementResult("jump", phase, self.active, f.confidence)
