import { useCallback, useEffect, useRef, useState } from "react";
import Modal, { type ModalConfig } from "./components/Modal";
import type { Preset } from "./data/presets";
import { GestureSocket, useGestureConnection, useGestureSnapshot } from "./services/gestureSocket";
import BindingScreen from "./screens/BindingScreen";
import CalibrationScreen from "./screens/CalibrationScreen";
import ControllerScreen from "./screens/ControllerScreen";
import HomeScreen from "./screens/HomeScreen";
import SplashScreen from "./screens/SplashScreen";
import type { Profile } from "./types/profile";

type Screen =
  | { name: "home" }
  | { name: "binding"; profile: Profile }
  | { name: "calibration"; profile: Profile }
  | { name: "controller"; profile: Profile };

function draftProfileFromPreset(preset: Preset): Profile {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: preset.name,
    presetId: preset.id,
    bindings: preset.bindings.map((b) => ({ ...b })),
    createdAt: now,
    updatedAt: now,
  };
}

export default function App() {
  const socketRef = useRef<GestureSocket | null>(null);
  if (!socketRef.current) {
    socketRef.current = new GestureSocket();
    socketRef.current.connect();
  }
  const socket = socketRef.current;
  // App only ever reads `connected` and `snapshot` (for the redirect effect
  // below) - never `activeGestures` - so it subscribes to just those two
  // instead of the combined useGestureSocket, which would otherwise also
  // re-render this (and everything under it) on every raw gesture event.
  const connected = useGestureConnection(socket);
  const snapshot = useGestureSnapshot(socket);

  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [splashPhase, setSplashPhase] = useState<"idle" | "launching" | "done">("idle");
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const openModal = useCallback((config: ModalConfig) => setModal(config), []);
  const closeModal = useCallback(() => setModal(null), []);

  // While actively playing, if the CV service loses calibration (it only
  // resets this after ~2s of sustained tracking loss, per
  // cv/pose_features.py - not on a single dropped frame), drop back to the
  // calibration screen so the player knows to reposition. CalibrationScreen
  // already returns to "controller" on its own once ready again.
  useEffect(() => {
    if (screen.name !== "controller") return;
    if (snapshot && snapshot.calibration.state === "complete") return;
    setScreen({ name: "calibration", profile: screen.profile });
  }, [screen, snapshot]);

  // Stable identities so the memoized screens below (React.memo) actually
  // skip re-rendering when App re-renders for unrelated reasons - an inline
  // arrow prop would defeat that on every single App render.
  const goHome = useCallback(() => setScreen({ name: "home" }), []);
  const openBinding = useCallback(
    (preset: Preset) => setScreen({ name: "binding", profile: draftProfileFromPreset(preset) }),
    []
  );
  const openProfile = useCallback((profile: Profile) => setScreen({ name: "binding", profile }), []);
  const startCalibration = useCallback((profile: Profile) => setScreen({ name: "calibration", profile }), []);
  const handleLaunch = useCallback(() => setSplashPhase("launching"), []);
  const handleSplashDone = useCallback(() => setSplashPhase("done"), []);

  let body: React.ReactNode;
  switch (screen.name) {
    case "home":
      body = (
        <div className={`home-reveal${splashPhase !== "idle" ? " home-reveal-visible" : ""}`}>
          <HomeScreen connected={connected} onOpenPreset={openBinding} onOpenProfile={openProfile} />
        </div>
      );
      break;
    case "binding":
      body = (
        <BindingScreen
          profile={screen.profile}
          connected={connected}
          onBack={goHome}
          onStart={startCalibration}
          openModal={openModal}
          closeModal={closeModal}
        />
      );
      break;
    case "calibration":
      body = (
        <CalibrationScreen
          profile={screen.profile}
          socket={socket}
          onBack={goHome}
          onReady={() => setScreen({ name: "controller", profile: screen.profile })}
        />
      );
      break;
    case "controller":
      body = (
        <ControllerScreen
          profile={screen.profile}
          socket={socket}
          onStop={() => setScreen({ name: "binding", profile: screen.profile })}
          onBackToHome={goHome}
        />
      );
      break;
  }

  return (
    <div className="app">
      {body}
      {splashPhase !== "done" && (
        <SplashScreen launching={splashPhase === "launching"} onLaunch={handleLaunch} onDone={handleSplashDone} />
      )}
      <Modal
        open={modal !== null}
        title={modal?.title ?? ""}
        body={modal?.body}
        buttons={modal?.buttons ?? []}
        onDismiss={closeModal}
      />
    </div>
  );
}
