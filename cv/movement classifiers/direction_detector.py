"""Debounced mutually exclusive directions within one independent gesture family."""
from movement import MovementResult


class DirectionDetector:
    def __init__(self, prefix, attribute, enter, leave):
        self.prefix, self.attribute = prefix, attribute
        self.enter, self.leave = enter, leave
        self.direction = 0
        self._candidate = 0
        self._since = None

    def update(self, features, now):
        old = self.direction
        confidence = features.confidence if features else 0.0
        if features is None:
            self.direction = self._candidate = 0
            self._since = None
        else:
            value = getattr(features, self.attribute)
            target = 1 if value > self.enter else -1 if value < -self.enter else 0
            if target == 0 and old * value > self.leave:
                target = old
            if target != self._candidate:
                self._candidate, self._since = target, now
            if target != old and self._since is not None and now - self._since >= 0.15:
                self.direction = target
        events = []
        if old and old != self.direction:
            events.append(MovementResult(self._name(old), "end", False, confidence))
        if self.direction:
            events.append(MovementResult(self._name(self.direction),
                                         "active" if old == self.direction else "start", True, confidence))
        return events

    def _name(self, direction):
        return self.prefix + ("-right" if direction > 0 else "-left")
