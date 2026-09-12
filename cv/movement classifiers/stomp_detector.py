"""Visual stomp heuristic, not a measurement of floor impact or force."""
from movement import MovementResult


class StompDetector:
    def __init__(self, foot):
        if foot not in ("left", "right"):
            raise ValueError("foot must be left or right")
        self.foot = foot
        self.active = False
        self._until = 0.0

    def update(self, features, now, contacts=()):
        old = self.active
        if features is None or now >= self._until:
            self.active = False
        # A short event lifecycle makes stomps visible without repeating starts.
        if features is not None and not old and any(
                c.foot == self.foot and c.isolated and c.height > 0.18 and c.downward_speed > 0.9
                for c in contacts):
            self.active = True
            self._until = now + 0.18
        phase = "start" if self.active and not old else "end" if old and not self.active else "active" if self.active else None
        return MovementResult("stomp-" + self.foot, phase, self.active, features.confidence if features else 0.0)
