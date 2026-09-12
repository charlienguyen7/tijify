# Tijify

HackRice 16 Project

A vertical-slice prototype proving one architecture:

```
Webcam -> Python (OpenCV + MediaPipe) -> clap detection
   |
   |-- annotated MJPEG video  -> http://localhost:8766/video_feed -> Electron <img>
   `-- gesture event (JSON)   -> ws://localhost:8765              -> Electron binding/input system
                                                                        |
                                                                        v
                                                              Windows keyboard event (SendKeys)
```

Python owns the webcam, MediaPipe, and clap detection. Electron owns key
bindings and keyboard emulation. See [shared/protocol.md](shared/protocol.md)
for the full message contract between them.

## Windows prerequisites

- **Python 3.10+** (tested with 3.13) — https://www.python.org/downloads/
- **Node.js 18+** — https://nodejs.org/
- A working webcam
- Windows 10/11 (keyboard injection uses `System.Windows.Forms.SendKeys` via
  PowerShell, which ships with Windows — nothing extra to install)

## 1. Install Python dependencies

```powershell
cd cv
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

## 2. Start the Python CV service

```powershell
cd cv
.venv\Scripts\python main.py
```

On first run it downloads a small (~8 MB) MediaPipe hand-landmark model into
`cv/models/` automatically — this needs an internet connection once.

You should see:

```
[video_server] streaming at http://localhost:8766/video_feed
[websocket_server] listening on ws://localhost:8765
[main] Tijify CV service running. Press Ctrl+C in this terminal to stop.
```

No OpenCV debug window opens — the annotated feed is only served over HTTP
for the Electron app to display. Leave this terminal running.

## 3. Install Node dependencies

```powershell
cd app
npm install
```

## 4. Start the Electron app

```powershell
cd app
npm run dev
```

This builds the Electron main process, starts the Vite dev server for the
React UI, and launches the Electron window once the dev server is ready.

## 5. Test with a fake clap (no webcam needed)

With the Electron app running (the Python service does not need to be
running for this), click **[ FAKE CLAP ]** at the bottom of the window. It
is wired to behave exactly like a real clap event: `Last gesture` shows
`CLAP`, the bound key fires, and `Last output` updates. This button is
clearly marked as development/test-only in the UI and in the source
(`app/src/App.tsx`).

## 6. Test with a real clap

1. Make sure the Python CV service (step 2) is running.
2. In the Electron app, `CV:` should read `CONNECTED` and the video box
   should show your live camera feed with hand landmarks drawn on it.
3. Stand so both hands are visible, start with hands apart, then clap.
4. The Python terminal prints `CLAP DETECTED`.
5. The Electron UI updates `Last gesture: CLAP` and presses the bound key
   (`SPACE` by default).

If detection feels too sensitive or not sensitive enough, tune the
thresholds at the top of `cv/clap_detector.py` (`SEPARATED_DISTANCE`,
`CLAP_DISTANCE`, `CLAP_EXIT_DISTANCE`, `OCCLUSION_START_DISTANCE`).

Note: MediaPipe's hand tracker can merge two overlapping hands into a
single detection right as they touch (a known limitation, not a bug in
this app) — a real clap is exactly that case. `clap_detector.py` accounts
for this: losing hand tracking while both hands were already close and
closing in counts as the clap itself, rather than requiring an observed
close-range reading while still tracking both hands.

## 7. Verify keyboard output with Notepad

1. Open Notepad and click into the text area so it has focus.
2. Trigger a clap (real or fake) from the Tijify app.
3. A space character (or whatever key is bound) should appear in Notepad.

Keyboard injection targets whatever window currently has OS focus — for a
real clap, keep Notepad (or a game) focused, not the Tijify window itself.

## Changing the binding

Click **Change Binding**, type a new key name (`SPACE`, `ENTER`, `A`,
`ARROWLEFT`, etc. — see `KEY_MAP` in `app/electron/inputController.ts`), and
press Save.

## Design notes / why these choices

- **Keyboard injection via PowerShell `SendKeys`, not a native module.**
  Libraries like `robotjs` require native compilation against the exact
  Electron ABI, which is a common source of build failures on Windows during
  a time-boxed hackathon. `SendKeys` ships with Windows and needs no native
  module at all. See `app/electron/inputController.ts`.
- **MediaPipe Tasks API, not the old `mp.solutions` API.** `mediapipe>=1.0`
  (the version that supports Python 3.13 on Windows) removed the legacy
  `solutions.hands` API entirely. `cv/main.py` uses the current
  `mediapipe.tasks.python.vision.HandLandmarker` API instead, which needs
  the small model file downloaded on first run (see step 2).
- **MJPEG over a second local HTTP port (8766)**, separate from the gesture
  WebSocket (8765), so the two concerns (what happened vs. what it looks
  like) stay independent, per `shared/protocol.md`.
