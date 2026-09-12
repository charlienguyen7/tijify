import { useCallback, useEffect, useRef, useState } from "react";

const GESTURE_WS_URL = "ws://localhost:8765";
const VIDEO_FEED_URL = "http://localhost:8766/video_feed";
const RECONNECT_DELAY_MS = 2000;
const VIDEO_RETRY_DELAY_MS = 3000;

interface Binding {
  gesture: string;
  keys: string[];
  mode: "tap" | "hold";
}

const DEFAULT_BINDING: Binding = { gesture: "clap", keys: ["SPACE"], mode: "tap" };

// Normalize a physical KeyboardEvent.code into the same names used for
// bindings (SPACE, ENTER, A, ARROWLEFT, ...), just for display purposes.
function normalizeKeyCode(code: string): string {
  if (code === "Space") return "SPACE";
  if (code === "Enter" || code === "NumpadEnter") return "ENTER";
  if (code === "Escape") return "ESCAPE";
  if (code === "Tab") return "TAB";
  if (code === "Backspace") return "BACKSPACE";
  if (code === "Delete") return "DELETE";
  if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Control")) return "CTRL";
  if (code.startsWith("Shift")) return "SHIFT";
  if (code.startsWith("Alt")) return "ALT";
  return code.toUpperCase();
}

export default function App() {
  const [cvConnected, setCvConnected] = useState(false);
  const [cvGesture, setCvGesture] = useState<string | null>(null);
  const [lastGesture, setLastGesture] = useState("--");
  const [binding, setBinding] = useState<Binding>(DEFAULT_BINDING);
  const [lastOutput, setLastOutput] = useState("--");
  const [videoOk, setVideoOk] = useState(true);
  const [videoAttempt, setVideoAttempt] = useState(0);
  const [isEditingBinding, setIsEditingBinding] = useState(false);
  const [bindingInput, setBindingInput] = useState(DEFAULT_BINDING.keys[0]);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  // Current gesture reflects all active CV movements; CV state
  // takes priority, otherwise any physically-held key, otherwise "-".
  const currentGesture = cvGesture ?? (pressedKeys.size > 0 ? [...pressedKeys].join("+") : "-");

  const bindingRef = useRef(binding);
  bindingRef.current = binding;

  const triggerBinding = useCallback(async (activeBinding: Binding) => {
    await window.tijify.tapKey(activeBinding.keys);
    setLastOutput(`${activeBinding.keys.join("+")} PRESSED`);
  }, []);

  const handleGesture = useCallback(
    (gesture: string) => {
      setLastGesture(gesture.toUpperCase());
      const activeBinding = bindingRef.current;
      if (gesture === activeBinding.gesture && activeBinding.mode === "tap") {
        void triggerBinding(activeBinding);
      }
    },
    [triggerBinding]
  );

  // Connect to the Python CV gesture WebSocket, reconnecting on drop.
  useEffect(() => {
    let socket: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const activeGestures = new Set<string>();
    let lastStateTimestamp = 0;
    const staleTimer = setInterval(() => {
      if (lastStateTimestamp && Date.now() - lastStateTimestamp > 2000) {
        activeGestures.clear();
        setCvGesture("STATE UNAVAILABLE");
        lastStateTimestamp = 0;
      }
    }, 500);

    const connect = () => {
      socket = new WebSocket(GESTURE_WS_URL);

      socket.onopen = () => setCvConnected(true);

      socket.onclose = () => {
        setCvConnected(false);
        setCvGesture(null);
        activeGestures.clear();
        lastStateTimestamp = 0;
        if (!cancelled) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => socket.close();

      socket.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!data || typeof data !== "object") return;
        if (data.type === "state" && Array.isArray(data.active_gestures)) {
          activeGestures.clear();
          if (typeof data.timestamp !== "number" || !Number.isFinite(data.timestamp)
              || Date.now() - data.timestamp > 2000) {
            setCvGesture("STATE UNAVAILABLE");
            return;
          }
          lastStateTimestamp = data.timestamp;
          for (const gesture of data.active_gestures) {
            if (typeof gesture === "string") activeGestures.add(gesture);
          }
          const label = [...activeGestures].map((g) => g.toUpperCase()).join(" + ");
          setCvGesture(label || (typeof data.state === "string" ? data.state.toUpperCase() : null));
          return; // Snapshots update display, never trigger tap bindings.
        }
        if (data.type !== "gesture" || typeof data.gesture !== "string") return;

        if (data.phase === "start") {
          activeGestures.add(data.gesture);
          setCvGesture([...activeGestures].map((g) => g.toUpperCase()).join(" + "));
          // Tap bindings only react to "start" — ignore "active"/"end".
          handleGesture(data.gesture);
        } else if (data.phase === "end") {
          activeGestures.delete(data.gesture);
          setCvGesture([...activeGestures].map((g) => g.toUpperCase()).join(" + ") || null);
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      clearInterval(staleTimer);
      socket?.close();
    };
  }, [handleGesture]);

  // If the video feed drops, periodically retry by remounting the <img>.
  useEffect(() => {
    if (videoOk) return;
    const timer = setTimeout(() => setVideoAttempt((n) => n + 1), VIDEO_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [videoOk]);

  // Track physical keys held down (while this window has focus) so they also
  // surface in "Current gesture" alongside CV-detected claps.
  useEffect(() => {
    const held = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      held.add(normalizeKeyCode(e.code));
      setPressedKeys(new Set(held));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(normalizeKeyCode(e.code));
      setPressedKeys(new Set(held));
    };
    const onBlur = () => {
      held.clear();
      setPressedKeys(new Set());
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const startEditingBinding = () => {
    setBindingInput(binding.keys[0]);
    setIsEditingBinding(true);
  };

  const saveBinding = () => {
    const trimmed = bindingInput.trim().toUpperCase();
    if (trimmed) setBinding({ ...binding, keys: [trimmed] });
    setIsEditingBinding(false);
  };

  // --- Development/test-only: simulate a clap without the Python CV service. ---
  const fakeClap = () => {
    setCvGesture("CLAP");
    handleGesture("clap");
    setTimeout(() => setCvGesture(null), 400); // mimics a real start->end pulse
  };
  // --- end development/test-only code ---

  return (
    <div className="app">
      <h1>TIJIFY TEST</h1>

      <p>
        CV: <span className={cvConnected ? "ok" : "bad"}>{cvConnected ? "CONNECTED" : "DISCONNECTED"}</span>
      </p>

      <div className="video-box">
        {videoOk ? (
          <img
            key={videoAttempt}
            className="video-feed"
            src={`${VIDEO_FEED_URL}?attempt=${videoAttempt}`}
            alt="Live camera feed"
            onError={() => setVideoOk(false)}
            onLoad={() => setVideoOk(true)}
          />
        ) : (
          <div className="video-placeholder">CAMERA FEED UNAVAILABLE</div>
        )}
      </div>

      <p>
        Current gesture:
        <br />
        <strong>{currentGesture}</strong>
      </p>

      <p>
        Last gesture:
        <br />
        <strong>{lastGesture}</strong>
      </p>

      <p>
        Binding:
        <br />
        <strong>
          {binding.gesture.toUpperCase()} → {binding.keys.join("+")}
        </strong>
      </p>
      {isEditingBinding ? (
        <div>
          <input
            value={bindingInput}
            onChange={(e) => setBindingInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveBinding()}
            autoFocus
          />
          <button onClick={saveBinding}>Save</button>
          <button onClick={() => setIsEditingBinding(false)}>Cancel</button>
        </div>
      ) : (
        <button onClick={startEditingBinding}>Change Binding</button>
      )}

      <p>
        Last output:
        <br />
        <strong>{lastOutput}</strong>
      </p>

      <hr />
      <p className="dev-label">Development / test only</p>
      <button onClick={fakeClap}>FAKE CLAP</button>
    </div>
  );
}
