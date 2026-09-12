# MovePlay CV ↔ App Protocol

This file defines the interface between the Python computer-vision system and the Electron/React desktop app.

## Transport

- Protocol: WebSocket
- Host: `localhost`
- Port: `8765`
- Endpoint: `ws://localhost:8765`

The Python CV process acts as the WebSocket server.

The Electron app acts as the WebSocket client.

All messages are JSON.

---

## Message Types

### 1. Gesture Event

Sent when the CV system recognizes the start, continuation, or end of a supported movement.

```json
{
  "type": "gesture",
  "gesture": "jump",
  "phase": "start",
  "confidence": 0.93,
  "timestamp": 1789181342000
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `type` | string | Always `"gesture"` for gesture events |
| `gesture` | string | Name of the detected gesture |
| `phase` | string | `"start"`, `"active"`, or `"end"` |
| `confidence` | number | Confidence score from `0.0` to `1.0` |
| `timestamp` | number | Unix timestamp in milliseconds |

### Supported Gestures

MVP:

```text
jump
crouch
lean-left
lean-right
raise-hand
```

Possible stretch gestures:

```text
swipe-left
swipe-right
punch-left
punch-right
clap
walk
pushup
bicep-curl
```

Do not add new gesture names without updating this file.

---

## Gesture Phase Semantics

### `start`

Sent exactly once when a gesture becomes active.

Example:

```json
{
  "type": "gesture",
  "gesture": "jump",
  "phase": "start",
  "confidence": 0.91,
  "timestamp": 1789181342000
}
```

Typical app behavior:

```text
tap binding  → press and release the mapped key
hold binding → begin holding the mapped key
```

### `active`

Optional.

Sent while a continuous gesture remains active.

Example:

```json
{
  "type": "gesture",
  "gesture": "lean-left",
  "phase": "active",
  "confidence": 0.88,
  "timestamp": 1789181342100
}
```

The app should not repeatedly trigger tap bindings from `active` events.

### `end`

Sent exactly once when the gesture stops being active.

Example:

```json
{
  "type": "gesture",
  "gesture": "lean-left",
  "phase": "end",
  "confidence": 0.90,
  "timestamp": 1789181343500
}
```

Typical app behavior:

```text
tap binding  → no action
hold binding → release the mapped key
```

---

## 2. Status Message

Optional message used to communicate CV system state to the UI.

```json
{
  "type": "status",
  "camera_connected": true,
  "calibrated": true,
  "controller_ready": true,
  "fps": 18.7,
  "timestamp": 1789181342000
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `type` | string | Always `"status"` |
| `camera_connected` | boolean | Whether the webcam is available |
| `calibrated` | boolean | Whether calibration has completed |
| `controller_ready` | boolean | Whether gesture detection is ready |
| `fps` | number | Current CV processing FPS |
| `timestamp` | number | Unix timestamp in milliseconds |

The UI should treat missing optional fields as unknown rather than as `false`.

---

## 3. Calibration Status

Optional message for showing calibration progress in the app.

```json
{
  "type": "calibration",
  "state": "in-progress",
  "progress": 0.65,
  "message": "Stand naturally and remain still.",
  "timestamp": 1789181342000
}
```

### Allowed States

```text
not-started
in-progress
complete
failed
```

Example completion message:

```json
{
  "type": "calibration",
  "state": "complete",
  "progress": 1.0,
  "message": "Calibration complete.",
  "timestamp": 1789181345000
}
```

---

## Video Feed (MJPEG)

Separate from the gesture WebSocket, the Python CV process also runs a tiny
local HTTP server that streams the annotated webcam frames it uses for
gesture detection, so the Electron UI can show a live debug preview.

- Protocol: HTTP
- Host: `localhost`
- Port: `8766`
- Endpoint: `http://localhost:8766/video_feed`
- Content-Type: `multipart/x-mixed-replace; boundary=frame` (MJPEG)
- Resolution: ~480p, ~15 FPS (debugging feature — reliability over quality)

Each frame already has MediaPipe landmarks and clap-detector debug text
(current hand distance, detector state, a brief `CLAP DETECTED` flash)
drawn onto it by Python before encoding, so the Electron app just needs to
render the stream — it does no drawing or camera access of its own.

The Electron app displays this stream with a plain `<img src="http://localhost:8766/video_feed">`
element. If the stream is unavailable or disconnects, the UI shows a
`CAMERA FEED UNAVAILABLE` placeholder instead.

This HTTP stream is independent of the gesture WebSocket on port 8765 — a
disconnect on one does not imply a disconnect on the other, and the app
should track their connection state separately.

---

## App Binding Model

The CV system must not know which keyboard input a gesture is mapped to.

Bindings are owned by the Electron app.

Example:

```json
{
  "gesture": "jump",
  "keys": ["SPACE"],
  "mode": "tap"
}
```

Example hold binding:

```json
{
  "gesture": "lean-left",
  "keys": ["ARROWLEFT"],
  "mode": "hold"
}
```

Example key combination:

```json
{
  "gesture": "raise-hand",
  "keys": ["CTRL", "SHIFT", "J"],
  "mode": "tap"
}
```

### Binding Modes

```text
tap
hold
```

Expected behavior:

```text
gesture start + tap
→ press key(s)
→ release key(s)

gesture start + hold
→ press and hold key(s)

gesture end + hold
→ release key(s)
```

---

## Responsibility Boundary

### Python CV owns

```text
webcam capture
MediaPipe pose detection
landmark normalization
calibration
frame history
motion feature extraction
gesture classification
gesture state machines
confidence scoring
WebSocket event emission
```

The CV system answers:

> What movement did the user perform?

### Electron / React app owns

```text
desktop UI
game profiles
gesture-to-key mappings
tap vs hold configuration
keyboard emulation
virtual gamepad support
saved settings
controller enable/disable state
displaying gesture feedback
```

The app answers:

> What should the computer do when that movement occurs?

---

## Example End-to-End Flow

```text
User jumps
   ↓
MediaPipe detects pose landmarks
   ↓
Gesture engine classifies JUMP
   ↓
Python sends:

{
  "type": "gesture",
  "gesture": "jump",
  "phase": "start",
  "confidence": 0.94,
  "timestamp": ...
}

   ↓
Electron receives event
   ↓
Binding lookup:

jump → SPACE → tap

   ↓
Electron presses SPACE
   ↓
Geometry Dash jumps
```

---

## Development Testing

The app team should be able to work without the CV system by sending fake events.

Example fake jump:

```json
{
  "type": "gesture",
  "gesture": "jump",
  "phase": "start",
  "confidence": 1.0,
  "timestamp": 1789181342000
}
```

The CV team should be able to work without Electron by logging emitted events:

```text
GESTURE jump start 0.91
GESTURE jump end 0.87
GESTURE lean-left start 0.84
GESTURE lean-left end 0.89
```

---

## Error Handling

If the WebSocket connection is lost:

- Electron must release all currently held keys.
- Electron should show the CV connection as disconnected.
- Python should continue attempting to accept a new client connection.
- No stale gesture should remain active after reconnection.

If CV confidence is below the detector threshold, no gesture event should be emitted.

---

## Important Rules

1. CV code must not contain keyboard mappings.
2. App code must not contain MediaPipe classification logic.
3. A gesture `start` event should normally occur only once per gesture activation.
4. Continuous gestures must eventually emit `end`.
5. The app must release all held keys when the controller is disabled or disconnected.
6. Gesture names and message shapes must match this file exactly.
7. Any protocol change should be agreed on by both developers before implementation.
