"""Camera-relative standing calibration and shared, body-normalized features.

World landmarks are hip-relative: use them for joint angles, never jump height.
Image landmarks preserve motion relative to the calibrated floor/standing pose.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import math
from statistics import median

REQUIRED = (11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32)
CALIBRATION_SECONDS = 3.0
MIN_SAMPLES = 20


def subtract(a, b):
    return tuple(x - y for x, y in zip(a, b))


def length(v):
    return math.sqrt(sum(x * x for x in v))


def unit(v):
    return tuple(x / max(length(v), 1e-8) for x in v)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def midpoint(a, b):
    return tuple((x + y) / 2 for x, y in zip(a, b))


def knee_angle(points, hip, knee, ankle):
    a, b = subtract(points[hip], points[knee]), subtract(points[ankle], points[knee])
    if min(length(a), length(b)) < 1e-6:
        return 0.0
    return math.degrees(math.acos(max(-1.0, min(1.0, dot(unit(a), unit(b))))))


@dataclass
class PoseSample:
    points: tuple
    world: tuple
    knees: tuple[float, float]
    confidence: float

    @property
    def hips(self):
        return midpoint(self.points[23], self.points[24])

    @property
    def shoulders(self):
        return midpoint(self.points[11], self.points[12])

    @property
    def feet(self):
        return (midpoint(self.points[29], self.points[31]),
                midpoint(self.points[30], self.points[32]))

    @property
    def torso(self):
        return length(subtract(self.shoulders, self.hips))


def read_pose(result, width: int, height: int) -> tuple[PoseSample | None, str]:
    if not result.pose_landmarks or not result.pose_world_landmarks:
        return None, "No body tracked - show full body"
    landmarks, world = result.pose_landmarks[0], result.pose_world_landmarks[0]
    if len(landmarks) != 33 or len(world) != 33:
        return None, "Incomplete pose"
    for i in REQUIRED:
        p, w = landmarks[i], world[i]
        if not all(math.isfinite(v) for v in (p.x, p.y, p.z, w.x, w.y, w.z)):
            return None, "Invalid pose coordinates"
        if not (0.015 < p.x < 0.985 and 0.015 < p.y < 0.985):
            return None, "Step back - shoulders through feet must fit"
    confidence = min(min(p.visibility or 0, p.presence or 0) for p in (landmarks[i] for i in REQUIRED))
    # Lowered from 0.65: this gates every single frame, so ordinary movement
    # (a step, a lean) briefly dips landmark visibility/presence and the
    # whole frame got discarded as "weak" - compounding with the
    # calibration-drift checks below to drop tracking more readily than the
    # actual pose quality warranted.
    if not math.isfinite(confidence) or confidence < 0.5:
        return None, "Tracking weak - show both legs and feet"
    # Pixel coordinates account for image aspect ratio before projection.
    points = tuple((p.x * width, p.y * height) for p in landmarks)
    worlds = tuple((p.x, p.y, p.z) for p in world)
    return PoseSample(points, worlds,
                      (knee_angle(worlds, 23, 25, 27), knee_angle(worlds, 24, 26, 28)),
                      confidence), "Tracking OK"


@dataclass
class MovementFeatures:
    hip_drop: float
    foot_lift: tuple[float, float]
    knee_bend: float
    upward_speed: float
    confidence: float
    lean: float = 0.0  # Positive toward the person's anatomical right.
    yaw: float = 0.0  # Degrees right of the calibrated facing direction.
    foot_speed: tuple[float, float] = (0.0, 0.0)  # Upward leg lengths/second.


class PoseCalibration:
    def __init__(self):
        self.reset()

    def reset(self):
        self.baseline: PoseSample | None = None
        self.samples = deque()
        self.progress = 0.0
        self.message = "Stand straight and still, full body visible"
        self._last_time = None
        self._filtered = None
        self._lost_since = None

    def update(self, sample: PoseSample | None, now: float, reason="Tracking lost"):
        if sample is None:
            self.samples.clear()
            self.progress = 0.0
            self._last_time = self._filtered = None
            if self._lost_since is None:
                self._lost_since = now
            if now - self._lost_since >= 2.0:
                self.reset()
                self._lost_since = now
            self.message = reason
            return None
        self._lost_since = None
        if self.baseline is None:
            self._collect(sample, now)
            return None

        base = self.baseline
        # Turning is now an intentional movement, not a calibration failure.
        sideways = abs(dot(subtract(midpoint(*sample.feet), midpoint(*base.feet)), self.right)) / self.scale
        # Widened from (0.78, 1.22) / 0.40: those reset the whole calibration
        # (dropping every movement event until recalibrated) for even a
        # small step off the original spot. This still catches someone
        # actually walking away or repositioning, just not a half-step's
        # worth of ordinary drift.
        if not 0.65 < sample.torso / base.torso < 1.35 or sideways > 0.65:
            self.reset()
            self.message = "View/position changed - stand still to recalibrate"
            return None

        drop = -dot(subtract(sample.hips, base.hips), self.up) / self.scale
        feet = tuple(dot(subtract(p, b), self.up) / self.scale for p, b in zip(sample.feet, base.feet))
        bend = sum(b - k for b, k in zip(base.knees, sample.knees)) / 2
        def body_direction(pose):
            shoulder = unit(subtract(pose.world[12], pose.world[11]))
            vertical = unit(subtract(midpoint(base.world[11], base.world[12]),
                                     midpoint(base.world[23], base.world[24])))
            lateral = unit(tuple(s - dot(shoulder, vertical) * v for s, v in zip(shoulder, vertical)))
            torso = unit(subtract(midpoint(pose.world[11], pose.world[12]),
                                  midpoint(pose.world[23], pose.world[24])))
            return dot(torso, lateral), math.degrees(math.atan2(shoulder[2], -shoulder[0]))

        lean, yaw = body_direction(sample)
        base_lean, base_yaw = body_direction(base)
        yaw = (yaw - base_yaw + 180) % 360 - 180
        raw = (drop, *feet, bend, lean - base_lean, yaw)
        dt = now - self._last_time if self._last_time is not None else 0
        previous = self._filtered
        if previous is not None:
            # Interpolate across the angular wrap via the shortest path.
            raw = (*raw[:5], previous[5] + (yaw - previous[5] + 180) % 360 - 180)
        alpha = 1 - math.exp(-dt / 0.045) if dt > 0 else 1.0
        filtered = tuple(a + alpha * (b - a) for a, b in zip(previous, raw)) if previous is not None else raw
        speed = (previous[0] - filtered[0]) / dt if previous is not None and 0 < dt < 0.25 else 0.0
        foot_speed = tuple((filtered[i] - previous[i]) / dt for i in (1, 2)) if previous is not None and 0 < dt < 0.25 else (0.0, 0.0)
        self._filtered, self._last_time = filtered, now
        self.message = "Calibrated - stay in this spot"
        return MovementFeatures(filtered[0], (filtered[1], filtered[2]), filtered[3], speed,
                                sample.confidence, filtered[4], (filtered[5] + 180) % 360 - 180, foot_speed)

    def _collect(self, sample, now):
        feet = midpoint(*sample.feet)
        scale = length(subtract(sample.hips, feet))
        if min(sample.knees) < 155 or scale < 65 or sample.torso < 35:
            self.samples.clear()
            self.progress = 0.0
            self.message = "Stand upright; move camera to show both legs clearly"
            return
        if self.samples:
            first = self.samples[0][1]
            motion = max(length(subtract(sample.points[i], first.points[i])) / scale
                         for i in REQUIRED)
            if motion > 0.045 or now - self.samples[-1][0] > 0.25:
                self.samples.clear()
        self.samples.append((now, sample))
        self.progress = min(1.0, (now - self.samples[0][0]) / CALIBRATION_SECONDS)
        self.message = f"Calibrating {self.progress:.0%} - stand straight and still"
        if self.progress < 1 or len(self.samples) < MIN_SAMPLES:
            return
        samples = [s for _, s in self.samples]
        points = tuple(tuple(median(s.points[i][j] for s in samples) for j in range(2)) for i in range(33))
        world = tuple(tuple(median(s.world[i][j] for s in samples) for j in range(3)) for i in range(33))
        self.baseline = PoseSample(points, world,
                                   tuple(median(s.knees[i] for s in samples) for i in range(2)),
                                   min(s.confidence for s in samples))
        base = self.baseline
        self.up = unit(subtract(base.shoulders, midpoint(*base.feet)))
        self.right = (-self.up[1], self.up[0])
        self.scale = dot(subtract(base.hips, midpoint(*base.feet)), self.up)
        if self.scale < 65:
            self.reset()
            self.message = "Unsuitable camera angle - show upright full body"
            return
        self.samples.clear()
        self.message = "Calibration complete"
