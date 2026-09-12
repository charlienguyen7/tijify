"""Track grounded -> lifted -> landed cycles per anatomical foot."""
from dataclasses import dataclass


@dataclass
class FootContact:
    foot: str
    timestamp: float
    height: float
    downward_speed: float
    isolated: bool


class FootDetector:
    def __init__(self):
        self._grounded = [False, False]
        self._lifted = [False, False]
        self._peak = [0.0, 0.0]
        self._since = [0.0, 0.0]
        self._descent = [None, None]
        self._isolated = [True, True]

    def update(self, features, now, jumping=False):
        if features is None:
            self.__init__()
            return []
        contacts = []
        for i, foot in enumerate(("left", "right")):
            lift = features.foot_lift[i]
            grounded = abs(lift) < 0.035
            if not self._lifted[i]:
                if grounded:
                    self._grounded[i] = True
                elif lift > 0.075 and self._grounded[i]:
                    self._lifted[i] = True
                    self._grounded[i] = False
                    self._peak[i] = lift
                    self._since[i] = now
                    self._isolated[i] = not jumping and features.foot_lift[1 - i] < 0.055
                    self._descent[i] = None
            if self._lifted[i]:
                self._peak[i] = max(self._peak[i], lift)
                if jumping or features.foot_lift[1 - i] > 0.055:
                    self._isolated[i] = False
                if features.foot_speed[i] < -0.65:
                    self._descent[i] = (now, -features.foot_speed[i])
                if grounded or now - self._since[i] > 2.0:
                    descent = self._descent[i]
                    speed = descent[1] if descent and now - descent[0] < 0.15 else 0.0
                    if grounded and now - self._since[i] <= 2.0:
                        contacts.append(FootContact(foot, now, self._peak[i], speed, self._isolated[i]))
                    self._lifted[i] = False
                    self._grounded[i] = grounded
        return contacts
