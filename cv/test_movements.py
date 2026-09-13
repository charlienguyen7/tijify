"""Deterministic movement/calibration regressions; no camera or ML packages needed."""
import math
import unittest
from types import SimpleNamespace

from movement_classifiers.crouch_detector import CrouchDetector
from movement_classifiers.jump_detector import JumpDetector
from pose_features import MovementFeatures, PoseCalibration, PoseSample, read_pose


def features(drop=0, feet=(0, 0), bend=0, speed=0):
    return MovementFeatures(drop, feet, bend, speed, 0.95)


def sample(scale=1, roll=0, drop=0, lift=0, bend=0, torso_ratio=1):
    points = [(320, 100)] * 33
    for a, b, y in ((11, 12, 180), (23, 24, 280), (25, 26, 355),
                    (27, 28, 425), (29, 30, 430), (31, 32, 430)):
        points[a], points[b] = (290, y), (350, y)
    for i in (11, 12, 23, 24):
        x, y = points[i]
        points[i] = (x, y + 150 * drop)
    for i in (11, 12):
        x, y = points[i]
        points[i] = (x, y - 100 * (torso_ratio - 1))
    for i in (27, 28, 29, 30, 31, 32):
        x, y = points[i]
        points[i] = (x, y - 150 * lift)
    c, s = math.cos(roll), math.sin(roll)
    transformed = tuple((320 + scale * ((x - 320) * c - (y - 250) * s),
                         250 + scale * ((x - 320) * s + (y - 250) * c)) for x, y in points)
    world = [(0, 0, 0)] * 33
    world[11], world[12] = (-0.2, -0.5, 0), (0.2, -0.5, 0)
    return PoseSample(transformed, tuple(world), (175 - bend, 175 - bend), 0.95)


def calibrated(**kwargs):
    calibration = PoseCalibration()
    for i in range(32):
        calibration.update(sample(**kwargs), i * 0.1)
    return calibration


class CalibrationTests(unittest.TestCase):
    def test_normalizes_distance_and_camera_roll(self):
        for scale, roll in ((0.6, -0.3), (1, 0), (1.3, 0.4)):
            c = calibrated(scale=scale, roll=roll)
            self.assertIsNotNone(c.baseline)
            # Fresh measurement with no smoothing history.
            c._filtered = c._last_time = None
            f = c.update(sample(scale=scale, roll=roll, drop=0.3, bend=35), 3.3)
            self.assertAlmostEqual(f.hip_drop, 0.3)
            self.assertAlmostEqual(f.knee_bend, 35)

    def test_requires_stable_upright_pose(self):
        c = PoseCalibration()
        for i in range(50):
            c.update(sample(bend=40), i * 0.1)
        self.assertIsNone(c.baseline)
        for i in range(50):
            c.update(sample(drop=0.1 * (i % 2)), 5 + i * 0.1)
        self.assertIsNone(c.baseline)

    def test_personal_torso_proportions_do_not_change_crouch_measurement(self):
        for torso_ratio in (0.7, 1.3):
            c = calibrated(torso_ratio=torso_ratio)
            c._filtered = c._last_time = None
            f = c.update(sample(torso_ratio=torso_ratio, drop=0.3, bend=35), 3.3)
            self.assertAlmostEqual(f.hip_drop, 0.3)
            self.assertAlmostEqual(f.knee_bend, 35)

    def test_calibrated_pose_sequence_triggers_jump(self):
        for scale, roll in ((0.6, -0.3), (1.2, 0.3)):
            c = calibrated(scale=scale, roll=roll)
            d = JumpDetector()
            for i in range(10):
                now = 3.2 + i * 0.04
                d.update(c.update(sample(scale=scale, roll=roll), now), now)
            phases = []
            for i in range(1, 6):
                now = 3.56 + i * 0.04
                f = c.update(sample(scale=scale, roll=roll, drop=-i * 0.04, lift=i * 0.04), now)
                phases.append(d.update(f, now).phase)
            self.assertEqual(phases.count("start"), 1)

    def test_loss_and_distance_change_recalibrate(self):
        c = calibrated()
        # Ratio band widened to (0.65, 1.35) so a small step no longer drops
        # calibration - 1.5 is still well outside it, so this still proves a
        # real distance change (not just drift) recalibrates.
        self.assertIsNone(c.update(sample(torso_ratio=1.5), 3.4))
        self.assertIsNone(c.baseline)
        c = calibrated()
        c.update(None, 4)
        c.update(None, 6.1)
        self.assertIsNone(c.baseline)

    def test_rejects_occluded_or_cropped_required_points(self):
        points = [SimpleNamespace(x=0.5, y=0.5, z=0, visibility=0.99, presence=0.99) for _ in range(33)]
        result = SimpleNamespace(pose_landmarks=[points], pose_world_landmarks=[points])
        points[27].visibility = 0.2
        self.assertIsNone(read_pose(result, 640, 480)[0])
        points[27].visibility, points[27].y = 0.99, 1.1
        self.assertIsNone(read_pose(result, 640, 480)[0])


class DetectorTests(unittest.TestCase):
    def test_crouch_lifecycle_and_jitter(self):
        d = CrouchDetector()
        self.assertIsNone(d.update(features(0.3, bend=35), 0).phase)
        self.assertEqual(d.update(features(0.3, bend=35), 0.15).phase, "start")
        self.assertEqual(d.update(features(0.15, bend=18), 0.2).phase, "active")
        d.update(features(), 0.3)
        self.assertEqual(d.update(features(), 0.45).phase, "end")
        self.assertIsNone(d.update(features(), 0.6).phase)

    def arm_jump(self):
        d = JumpDetector()
        d.update(features(), 0)
        d.update(features(), 0.25)
        return d

    def test_jump_lifecycle_and_landing(self):
        for step in (1 / 15, 1 / 30, 1 / 60):
            d = self.arm_jump()
            phases = []
            for i in range(1, int(0.15 / step) + 1):
                phases.append(d.update(features(-0.12, (0.10, 0.11), speed=0.9), 0.25 + i * step).phase)
            self.assertEqual(phases.count("start"), 1)
            self.assertEqual(d.update(features(-0.2, (0.2, 0.2)), 0.5).phase, "active")
            d.update(features(), 0.8)
            self.assertEqual(d.update(features(), 0.9).phase, "end")
            self.assertIsNone(d.update(features(), 1.0).phase)

    def test_standing_up_or_one_foot_does_not_jump(self):
        for feet in ((0, 0), (0.2, 0)):
            d = self.arm_jump()
            for t in (0.30, 0.36, 0.42):
                self.assertIsNone(d.update(features(-0.1, feet, speed=1), t).phase)

    def test_loss_ends_once_and_airborne_reacquisition_cannot_start(self):
        d = self.arm_jump()
        airborne = features(-0.15, (0.15, 0.15), speed=1)
        d.update(airborne, 0.30)
        self.assertEqual(d.update(airborne, 0.36).phase, "start")
        self.assertEqual(d.update(None, 0.4).phase, "end")
        self.assertIsNone(d.update(None, 0.5).phase)
        self.assertIsNone(d.update(airborne, 0.6).phase)
        c = CrouchDetector()
        c.update(features(0.3, bend=35), 0)
        c.update(features(0.3, bend=35), 0.2)
        self.assertEqual(c.update(None, 0.3).phase, "end")
        self.assertIsNone(c.update(None, 0.4).phase)

    def test_jump_timeout_and_crouch_suppression(self):
        d = self.arm_jump()
        f = features(-0.15, (0.15, 0.15), speed=1)
        d.update(f, 0.3)
        d.update(f, 0.36)
        self.assertEqual(d.update(f, 2.5).phase, "end")
        c = CrouchDetector()
        c.update(features(0.3, bend=35), 0)
        c.update(features(0.3, bend=35), 0.2)
        self.assertEqual(c.update(features(), 0.3, suppressed=True).phase, "end")


if __name__ == "__main__":
    unittest.main()
