import { memo, useRef, useState } from "react";
import AddMovementMenu from "../components/AddMovementMenu";
import BindingRow from "../components/BindingRow";
import Header from "../components/Header";
import type { ModalConfig } from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { GESTURE_LABELS, GESTURE_LIST, createBinding } from "../data/gestures";
import { isProfileSaved, saveProfile } from "../services/profileStorage";
import type { GestureName } from "../types/gesture";
import type { Binding, Profile } from "../types/profile";
import "./BindingScreen.css";

interface BindingScreenProps {
  profile: Profile;
  connected: boolean;
  onBack: () => void;
  onStart: (profile: Profile) => void;
  openModal: (config: ModalConfig) => void;
  closeModal: () => void;
}

function BindingScreen({ profile, connected, onBack, onStart, openModal, closeModal }: BindingScreenProps) {
  const [bindings, setBindings] = useState<Binding[]>(() => profile.bindings.map((b) => ({ ...b })));
  const [name, setName] = useState(profile.name);
  // A ref (not state) so the modal's onClick - captured once when the modal
  // opens - always reads what was most recently typed, instead of a stale
  // value frozen at the render where the modal was opened.
  const nameDraftRef = useRef(profile.name);

  const dirty =
    name !== profile.name || JSON.stringify(bindings) !== JSON.stringify(profile.bindings);

  const availableGestures: GestureName[] = GESTURE_LIST.filter(
    (g) => !bindings.some((b) => b.gesture === g)
  );

  const duplicatesFor = (binding: Binding): string[] => {
    if (binding.keys.length === 0) return [];
    return bindings
      .filter((b) => b.gesture !== binding.gesture && b.keys.some((k) => binding.keys.includes(k)))
      .map((b) => GESTURE_LABELS[b.gesture]);
  };

  const handleAdd = (gesture: GestureName) => setBindings((prev) => [...prev, createBinding(gesture)]);
  const handleRemove = (gesture: GestureName) =>
    setBindings((prev) => prev.filter((b) => b.gesture !== gesture));
  const handleKeysChange = (gesture: GestureName, keys: string[]) =>
    setBindings((prev) => prev.map((b) => (b.gesture === gesture ? { ...b, keys } : b)));

  const buildProfile = (finalName: string): Profile => ({
    ...profile,
    name: finalName,
    bindings,
    updatedAt: Date.now(),
  });

  const commitSave = (finalName: string): Profile => saveProfile(buildProfile(finalName));

  const handleSaveClick = () => {
    if (isProfileSaved(profile.id)) {
      const saved = commitSave(name);
      setName(saved.name);
      return;
    }
    nameDraftRef.current = name;
    openModal({
      title: "Name your profile",
      body: (
        <input
          className="key-field"
          style={{ width: "100%" }}
          autoFocus
          defaultValue={name}
          onChange={(e) => (nameDraftRef.current = e.target.value)}
        />
      ),
      buttons: [
        {
          label: "Save",
          variant: "primary",
          onClick: () => {
            const finalName = nameDraftRef.current.trim() || name;
            commitSave(finalName);
            setName(finalName);
            closeModal();
          },
        },
        { label: "Cancel", onClick: closeModal },
      ],
    });
  };

  const handleStartClick = () => {
    openModal({
      title: "Would you like to save this setup?",
      body: "You can save this mapping for next time, or just use it once.",
      buttons: [
        {
          label: "Save & Start",
          variant: "primary",
          onClick: () => {
            const saved = commitSave(name);
            closeModal();
            onStart(saved);
          },
        },
        {
          label: "Start Once",
          onClick: () => {
            closeModal();
            onStart(buildProfile(name));
          },
        },
        { label: "Cancel", onClick: closeModal },
      ],
    });
  };

  const handleBack = () => {
    if (!dirty) {
      onBack();
      return;
    }
    openModal({
      title: "Unsaved changes",
      body: "You have unsaved changes. Leave without saving?",
      buttons: [
        { label: "Stay", onClick: closeModal },
        {
          label: "Leave",
          variant: "danger",
          onClick: () => {
            closeModal();
            onBack();
          },
        },
      ],
    });
  };

  return (
    <div className="screen binding-screen">
      <Header title={name} onBack={handleBack} backLabel="Home" />
      <div className="row" style={{ justifyContent: "center" }}>
        <StatusBadge connected={connected} />
      </div>

      <div className="card binding-list">
        <div className="binding-list-header">
          <span>Movement</span>
          <span>Key(s)</span>
        </div>
        {bindings.length === 0 && <p className="text-muted">No movements mapped yet.</p>}
        {bindings.map((binding) => (
          <BindingRow
            key={binding.gesture}
            binding={binding}
            duplicateOf={duplicatesFor(binding)}
            onKeysChange={(keys) => handleKeysChange(binding.gesture, keys)}
            onRemove={() => handleRemove(binding.gesture)}
          />
        ))}
        <AddMovementMenu availableGestures={availableGestures} onAdd={handleAdd} />
      </div>

      <div className="row binding-actions">
        <button className="btn btn-secondary" onClick={handleSaveClick}>
          Save Profile
        </button>
        <button className="btn btn-primary" onClick={handleStartClick}>
          Start
        </button>
      </div>
    </div>
  );
}

export default memo(BindingScreen);
