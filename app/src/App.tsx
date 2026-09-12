import { useRef, useState } from "react";
import Modal, { type ModalConfig } from "./components/Modal";
import type { Preset } from "./data/presets";
import { GestureSocket, useGestureSocket } from "./services/gestureSocket";
import BindingScreen from "./screens/BindingScreen";
import CalibrationScreen from "./screens/CalibrationScreen";
import ControllerScreen from "./screens/ControllerScreen";
import HomeScreen from "./screens/HomeScreen";
import SplashScreen from "./screens/SplashScreen";
import type { Profile } from "./types/profile";

type Screen =
  | { name: "splash" }
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
  const { connected } = useGestureSocket(socket);

  const [screen, setScreen] = useState<Screen>({ name: "splash" });
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const openModal = (config: ModalConfig) => setModal(config);
  const closeModal = () => setModal(null);

  let body: React.ReactNode;
  switch (screen.name) {
    case "splash":
      body = <SplashScreen onDone={() => setScreen({ name: "home" })} />;
      break;
    case "home":
      body = (
        <HomeScreen
          connected={connected}
          onOpenPreset={(preset) => setScreen({ name: "binding", profile: draftProfileFromPreset(preset) })}
          onOpenProfile={(profile) => setScreen({ name: "binding", profile })}
        />
      );
      break;
    case "binding":
      body = (
        <BindingScreen
          profile={screen.profile}
          connected={connected}
          onBack={() => setScreen({ name: "home" })}
          onStart={(profile) => setScreen({ name: "calibration", profile })}
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
          onBack={() => setScreen({ name: "home" })}
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
          onBackToHome={() => setScreen({ name: "home" })}
        />
      );
      break;
  }

  return (
    <div className="app">
      {body}
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
