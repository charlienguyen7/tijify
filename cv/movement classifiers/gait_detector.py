"""Walking/running in place from alternating foot contacts and cadence.

This is a control heuristic: cadence alone does not prove biomechanical running.
"""
from collections import deque
from movement import MovementResult


class GaitDetector:
    def __init__(self):
        self.contacts = deque(maxlen=6)
        self.mode = None

    def update(self, features, now, contacts=(), jumping=False):
        old = self.mode
        if features is None or jumping:
            self.contacts.clear()
            self.mode = None
        else:
            # Simultaneous contacts are a landing, not two alternating steps.
            if len(contacts) == 1:
                contact = contacts[0]
                if self.contacts and (contact.foot == self.contacts[-1].foot
                                      or not 0.16 <= now - self.contacts[-1].timestamp <= 1.2):
                    self.contacts.clear()
                    self.mode = None
                self.contacts.append(contact)
            if self.contacts and now - self.contacts[-1].timestamp > 1.2:
                self.contacts.clear()
                self.mode = None
            if len(self.contacts) >= 3:
                cadence = (len(self.contacts) - 1) / (self.contacts[-1].timestamp - self.contacts[0].timestamp)
                threshold = 2.1 if self.mode == "run" else 2.6
                self.mode = "run" if cadence >= threshold else "walk"
        confidence = features.confidence if features else 0.0
        events = []
        if old and old != self.mode:
            events.append(MovementResult(old, "end", False, confidence))
        if self.mode:
            events.append(MovementResult(self.mode, "active" if old == self.mode else "start", True, confidence))
        return events
