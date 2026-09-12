import math
import unittest
from dataclasses import replace

from test_movements import features, sample, calibrated
from movement_classifiers.foot_detector import FootDetector, FootContact
from movement_classifiers.gait_detector import GaitDetector
from movement_classifiers.lean_detector import LeanDetector
from movement_classifiers.orientation_detector import OrientationDetector
from movement_classifiers.stomp_detector import StompDetector
from movement_engine import MovementEngine


def f(**kwargs):
    return replace(features(), **kwargs)


class DirectionTests(unittest.TestCase):
    def test_directions_debounce_switch_and_loss(self):
        for detector, key, magnitude in ((LeanDetector(), "lean", 0.3),
                                         (OrientationDetector(), "yaw", 40)):
            right = f(**{key: magnitude})
            left = f(**{key: -magnitude})
            self.assertEqual(detector.update(right, 0), [])
            events = detector.update(right, 0.2)
            self.assertEqual(events[0].phase, "start")
            self.assertTrue(events[0].gesture.endswith("right"))
            detector.update(left, 0.3)
            events = detector.update(left, 0.5)
            self.assertEqual([e.phase for e in events], ["end", "start"])
            self.assertTrue(events[1].gesture.endswith("left"))
            self.assertEqual(detector.update(None, 0.6)[0].phase, "end")
            self.assertEqual(detector.update(None, 0.7), [])

    def test_neutral_releases_orientation(self):
        d = OrientationDetector()
        d.update(f(yaw=40), 0)
        d.update(f(yaw=40), 0.2)
        self.assertEqual(d.update(f(yaw=20), 0.3)[0].phase, "active")
        d.update(f(), 0.4)
        self.assertEqual(d.update(f(), 0.6)[0].phase, "end")

    def test_turning_preserves_calibration_and_lean_uses_horizontal_axis(self):
        c = calibrated()
        base = c.baseline
        # Anatomical right is camera-left for a person facing the camera.
        world = list(base.world)
        world[11], world[12] = (0.2, -0.5, 0), (-0.2, -0.5, 0)
        c.baseline = replace(base, world=tuple(world))
        for angle in (-45, 45):
            theta = math.radians(angle)
            right = (-math.cos(theta), 0, math.sin(theta))
            leaning = tuple(0.18 * v for v in right)
            world[11] = tuple(leaning[i] - 0.2 * right[i] + (0, -0.5, 0)[i] for i in range(3))
            world[12] = tuple(leaning[i] + 0.2 * right[i] + (0, -0.5, 0)[i] for i in range(3))
            c._last_time = c._filtered = None
            result = c.update(replace(sample(), world=tuple(world)), 3.5)
            self.assertIsNotNone(c.baseline)
            self.assertAlmostEqual(result.yaw, angle)
            self.assertGreater(result.lean, 0.25)


class FootTests(unittest.TestCase):
    def test_each_stomp_starts_once_and_ends(self):
        for index, foot in enumerate(("left", "right")):
            tracker, detector = FootDetector(), StompDetector(foot)
            tracker.update(f(), 0)
            lifts, speeds = [0.0, 0.0], [0.0, 0.0]
            lifts[index] = 0.25
            tracker.update(f(foot_lift=tuple(lifts)), 0.1)
            lifts[index], speeds[index] = 0.02, -1.4
            data = f(foot_lift=tuple(lifts), foot_speed=tuple(speeds))
            contacts = tracker.update(data, 0.3)
            self.assertEqual(len(contacts), 1)
            self.assertEqual(detector.update(data, 0.3, contacts).phase, "start")
            self.assertEqual(detector.update(data, 0.4).phase, "active")
            self.assertEqual(detector.update(data, 0.5).phase, "end")
            self.assertIsNone(detector.update(data, 0.6).phase)

    def test_jump_landing_and_gentle_step_are_not_stomps(self):
        tracker = FootDetector()
        tracker.update(f(), 0)
        tracker.update(f(foot_lift=(0.25, 0.25)), 0.1)
        contacts = tracker.update(f(foot_speed=(-2, -2)), 0.3)
        self.assertEqual(len(contacts), 2)
        for foot in ("left", "right"):
            self.assertIsNone(StompDetector(foot).update(f(), 0.3, contacts).phase)
        gentle = [FootContact("left", 0.3, 0.3, 0.2, True)]
        self.assertIsNone(StompDetector("left").update(f(), 0.3, gentle).phase)

    def test_reacquisition_does_not_create_contact(self):
        tracker = FootDetector()
        tracker.update(f(), 0)
        tracker.update(f(foot_lift=(0.3, 0)), 0.1)
        tracker.update(None, 0.2)
        self.assertEqual(tracker.update(f(foot_speed=(-2, 0)), 0.3), [])


class GaitTests(unittest.TestCase):
    def test_walk_run_and_stop(self):
        for interval, expected in ((0.6, "walk"), (0.3, "run")):
            d = GaitDetector()
            for i in range(3):
                foot = "left" if i % 2 == 0 else "right"
                now = i * interval
                events = d.update(f(), now, [FootContact(foot, now, 0.15, 0.6, True)])
            self.assertEqual([(e.gesture, e.phase) for e in events], [(expected, "start")])
            self.assertEqual(d.update(f(), now + 1.3)[0].phase, "end")
            self.assertEqual(d.update(f(), now + 1.4), [])

    def test_repeated_same_foot_does_not_walk(self):
        d = GaitDetector()
        for i in range(8):
            now = i * 0.3
            self.assertEqual(d.update(f(), now, [FootContact("left", now, 0.3, 1.4, True)]), [])

    def test_switch_ends_old_mode_first(self):
        d = GaitDetector()
        for i, now in enumerate((0, 0.6, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7)):
            events = d.update(f(), now, [FootContact("left" if i % 2 == 0 else "right", now, 0.2, 1, True)])
            if len(events) == 2:
                self.assertEqual([(e.gesture, e.phase) for e in events], [("walk", "end"), ("run", "start")])
                return
        self.fail("Did not switch to run")


class OverlapTests(unittest.TestCase):
    def test_turn_lean_and_jump_overlap_then_loss_ends_all(self):
        engine = MovementEngine()
        pose = f(yaw=40, lean=-0.3)
        for now in (0, 0.1, 0.25):
            engine.update(pose, now)
        airborne = replace(pose, hip_drop=-0.15, foot_lift=(0.15, 0.15), upward_speed=1)
        engine.update(airborne, 0.30)
        events = engine.update(airborne, 0.36)
        active = {e.gesture for e in events if e.active}
        self.assertEqual(active, {"jump", "lean-left", "turn-right"})
        ended = engine.update(None, 0.4)
        self.assertEqual({e.gesture for e in ended if e.phase == "end"}, active)
        self.assertEqual(engine.update(None, 0.5), [])

    def test_walk_and_stomp_overlap(self):
        engine = MovementEngine()
        engine.update(f(), 0)
        for step in range(3):
            index = step % 2
            start = step * 0.6 + 0.1
            lifts, speeds = [0.0, 0.0], [0.0, 0.0]
            lifts[index] = 0.25
            engine.update(f(foot_lift=tuple(lifts)), start)
            lifts[index], speeds[index] = 0.01, -1.4
            events = engine.update(f(foot_lift=tuple(lifts), foot_speed=tuple(speeds)), start + 0.2)
            engine.update(f(), start + 0.4)
        self.assertTrue({"walk", "stomp-left"}.issubset({e.gesture for e in events if e.active}))


if __name__ == "__main__":
    unittest.main()
