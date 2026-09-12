"""Anatomical lateral torso lean, relative to the neutral calibrated stance."""
from movement_classifiers.direction_detector import DirectionDetector


class LeanDetector(DirectionDetector):
    def __init__(self):
        super().__init__("lean", "lean", enter=0.22, leave=0.12)
