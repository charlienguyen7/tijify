import { useEffect, useState } from "react";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";
import { HOME_INSTRUCTIONS } from "../data/instructions";
import { CUSTOM_PRESET, PRESETS, type Preset } from "../data/presets";
import { deleteProfile, loadProfiles } from "../services/profileStorage";
import type { Profile } from "../types/profile";
import "./HomeScreen.css";

interface HomeScreenProps {
  connected: boolean;
  onOpenPreset: (preset: Preset) => void;
  onOpenProfile: (profile: Profile) => void;
}

export default function HomeScreen({ connected, onOpenPreset, onOpenProfile }: HomeScreenProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    setProfiles(loadProfiles());
  }, []);

  const handleDelete = (id: string) => {
    deleteProfile(id);
    setProfiles(loadProfiles());
  };

  return (
    <div className="screen home-screen">
      <Header title="Tiji" />
      <div className="row" style={{ justifyContent: "center" }}>
        <StatusBadge connected={connected} />
      </div>

      <div className="card">
        <h2>Instructions</h2>
        <ol className="home-instructions">
          {HOME_INSTRUCTIONS.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </div>

      <div className="card">
        <h2>Choose your game</h2>
        <div className="preset-grid">
          {PRESETS.map((preset) => (
            <button key={preset.id} className="preset-card" onClick={() => onOpenPreset(preset)}>
              <strong>{preset.name}</strong>
            </button>
          ))}
          <button className="preset-card preset-card-custom" onClick={() => onOpenPreset(CUSTOM_PRESET)}>
            <strong>Set up your own</strong>
          </button>
        </div>
      </div>

      {profiles.length > 0 && (
        <div className="card">
          <h2>Your saved profiles</h2>
          <div className="stack">
            {profiles.map((profile) => (
              <div key={profile.id} className="saved-profile-row">
                <button className="saved-profile-open" onClick={() => onOpenProfile(profile)}>
                  {profile.name}
                </button>
                <button className="btn btn-danger" onClick={() => handleDelete(profile.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
