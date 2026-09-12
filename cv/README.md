# Movement detection

Run from the repository root:

```powershell
cv/.venv/Scripts/python cv/main.py --camera 1
```

Install dependencies using `cv/.venv/Scripts/python -m pip install -r cv/requirements.txt`.
The MediaPipe pose model downloads into `cv/models/` on first launch.
The existing app preview (or http://localhost:8766/video_feed) shows pose landmarks,
processing FPS, movement classification, calibration progress,
hip drop and knee bend. Preview delivery remains capped at 15 FPS independently
of the displayed processing FPS.

A local OpenCV window shows the annotated preview. Press **Q in that window**
or close it to stop. Q in the Windows terminal and Ctrl+C also work.
The HTTP/Electron preview remains available but does not capture keys.

Camera index **1** is the default, usually the external webcam when the laptop
camera is index 0. Device ordering varies: use `--camera 0` or `--camera 2` if
the preview shows the wrong camera or cannot open it.

## Calibration and use

1. Fix the camera in place. Leave room above your head for jumping and keep
   shoulders, hips, knees, ankles, heels and toes inside the image.
2. Face the camera and stand naturally upright with straight knees and both feet on the floor.
   Hold still for three seconds until the overlay says calibrated. Arms need
   not remain still, but both legs and feet must be confidently tracked.
3. Crouch by bending your knees and lowering your hips. Jump with both feet.
   The overlay lists every active movement, including simultaneous turns/leans.
4. Leave the frame for at least two seconds and return to recalibrate after
   changing the camera, person or standing location. Large detected changes
   in scale or the center of your foot position also reset calibration automatically.
   Turning intentionally does not reset calibration.

Calibration stores the median of all 33 keypoints, using the reliable torso,
leg and foot points to validate the standing reference. It estimates an image
up direction and foot references, scales image motion by projected standing
leg height, and compares 3D knee angles with the person's own standing angles.
This compensates for camera roll, distance and body size/proportions within a
usable fixed view. Smoothing uses elapsed time, not a fixed frame count.

This is a camera-relative reference, not room reconstruction, a metric floor
plane, or universal camera-angle calibration. Severe top/down views, occluded
legs, very low resolution and large perspective changes can prevent reliable
detection. Use a roughly level front or slight diagonal view with both legs
visible. Moving toward/away from the camera can look like vertical movement;
stay in the calibrated spot. Small jumps may be missed. Thresholds need real
camera testing across people and views; the automated tests use synthetic poses.

## Additional movements and overlaps

Left/right mean your anatomical left/right. Inference uses the unmirrored image;
only the displayed video is mirrored. Face the camera during calibration.

- Lean left/right: lateral torso tilt relative to your calibrated upright axis.
  Enter above 0.22 normalized tilt and exit below 0.12, after 150 ms stability.
- Turn left/right: shoulder yaw relative to calibration. Enter beyond 25 degrees
  and return to neutral within 15 degrees, after 150 ms stability. This measures
  torso direction, not head/gaze direction. Full side/back views may obscure
  required landmarks and end detection; moderate turns work best.
- Walk/run: step in place, alternating feet. Three contacts establish a gait;
  running begins at 2.6 steps/second and returns to walking below 2.1. No contact
  for 1.2 seconds ends the gait. Repeated same-foot lifts do not establish gait.
  This cadence rule approximates running for controls; it does not measure
  forward speed or prove a flight phase.
- Stomp left/right: lift that foot more than 0.18 calibrated leg heights and
  return near the standing floor reference with recent descent speed above
  0.9 leg heights/second. The other foot must stay down throughout the lift.
  Stomps produce an approximately 180 ms event; camera FPS affects accuracy.
  A forceful walking step may also count as a stomp. Jump landings are excluded.

Families run independently: `TURN-RIGHT + JUMP`, `LEAN-LEFT + WALK`, and
`WALK + STOMP-RIGHT` are supported. Left/right within one directional family and
walk/run are exclusive; crouch is suppressed while jumping. Each active gesture
emits its own lifecycle. The preview wraps long combinations onto multiple lines.
The app's bindings/UI may need separate configuration to use the additional names;
see `shared/protocol.md` for their event contract.

## Classifier folder and live app state

All `*_detector.py` files, including the unused clap detector, live in
`cv/movement classifiers/`. `movement_classifiers.py` provides the Python import
name for this folder containing a space, e.g.
`from movement_classifiers.lean_detector import LeanDetector`.
`main.py` uses `movement_engine.py`, which imports the classifiers through that bridge.

The service publishes full `state` snapshots over `ws://localhost:8765` every
processed frame (including neutral, calibration and tracking loss). New clients
receive the latest cached snapshot. The app reads `active_gestures` to display
all simultaneous movements. `shared/protocol.md` defines the schema; it is not
rewritten with live data. Gesture start events remain the trigger for tap bindings.

## Files and events

- `pose_features.py`: tracking validation, standing calibration, normalization.
- `crouch_detector.py`: hip lowering plus knee flexion, with entry/exit debounce.
- `jump_detector.py`: recent grounding, both feet rising and upward hip motion;
  landing detection, timeout, and grounding required before another jump.
- `lean_detector.py` / `orientation_detector.py`: independent lateral directions.
- `direction_detector.py`: shared directional debounce and hysteresis.
- `foot_detector.py`: per-foot lift/landing history.
- `gait_detector.py`: alternating walk/run cadence classification.
- `stomp_detector.py`: instantiated separately for each foot.
- `movement_engine.py`: combines classifiers and resets on tracking loss/stalls.
- `movement.py`: shared detector result.
- `main.py`: camera, MediaPipe models, detector coordination and overlay.

All movements emit the existing `start`/`active`/`end` WebSocket events.
Tracking loss immediately ends active body gestures. Recalibration suppresses
body gesture events. Confidence is the minimum required landmark tracking
confidence, not a trained probability that the classification is correct.
`clap_detector.py` is retained but is not imported or run by `main.py`.
Keyboard bindings remain the desktop app's responsibility.

Run deterministic tests without the camera or MediaPipe installed:

```powershell
python -m unittest discover -s cv -p "test*.py" -v
```
