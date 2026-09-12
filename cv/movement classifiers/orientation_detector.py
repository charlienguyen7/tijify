"""Shoulder yaw relative to calibration; independent of locomotion and jumping."""
from movement_classifiers.direction_detector import DirectionDetector


class OrientationDetector(DirectionDetector):
    def __init__(self):
        super().__init__("turn", "yaw", enter=25.0, leave=15.0)
