import { memo, useEffect, useState } from "react";
import Header from "../components/Header";
import ResizableVideoFeed from "../components/ResizableVideoFeed";
import StatusBadge from "../components/StatusBadge";
import { HOME_INSTRUCTIONS } from "../data/instructions";
import { CUSTOM_PRESET, PRESETS, type Preset } from "../data/presets";
import { useBackgroundPreference } from "../services/backgroundPreference";
import { deleteProfile, loadProfiles } from "../services/profileStorage";
import type { Profile } from "../types/profile";
import "./HomeScreen.css";

interface HomeScreenProps {
  connected: boolean;
  onOpenPreset: (preset: Preset) => void;
  onOpenProfile: (profile: Profile) => void;
}

function HomeScreen({ connected, onOpenPreset, onOpenProfile }: HomeScreenProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const { preset: background, cycle: cycleBackground } = useBackgroundPreference();

  useEffect(() => {
    setProfiles(loadProfiles());
  }, []);

  const handleDelete = (id: string) => {
    deleteProfile(id);
    setProfiles(loadProfiles());
  };

  return (
    <div className="screen home-screen">
      {/* Hidden filter def (0x0, not rendered itself) that .home-screen
          .header-title references via `filter: url(#title-wobble)` - a
          real pixel displacement of the glyph shapes (like After Effects'
          Displace effect), not just a CSS transform wobble, which can only
          move the whole text box rigidly. The animated feTurbulence
          baseFrequency is what makes the noise pattern slowly morph over
          time instead of sitting static. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="title-wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.01 0.02" numOctaves="2" seed="3" result="noise">
            <animate
              attributeName="baseFrequency"
              dur="6s"
              values="0.008 0.016;0.013 0.021;0.008 0.016"
              calcMode="spline"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
              keyTimes="0;0.5;1"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="20" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Applied to each card's ::before (HomeScreen.css), not the card
            itself - that pseudo-element carries only the background/shadow
            behind the real content, so the block's outline ripples while
            the text and buttons on top stay sharp and legible. Lower
            baseFrequency than the title's filter for bigger, slower waves
            that suit a large rectangle instead of small letterforms. */}
        <filter id="card-wobble" x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="2" seed="7" result="noise">
            <animate
              attributeName="baseFrequency"
              dur="14s"
              values="0.004 0.007;0.008 0.011;0.004 0.007"
              calcMode="spline"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
              keyTimes="0;0.5;1"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="23" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <Header
        title="tiji"
        right={
          <button
            className="bg-picker-btn"
            onClick={cycleBackground}
            title={`Background: ${background.label} (click to change)`}
            aria-label="Change background"
          >
            🎨 {background.label}
          </button>
        }
      />

      <div className="home-layout">
        <div className="card home-video-card">
          <div className="home-card-header">
            <h2>Live Camera</h2>
            <StatusBadge connected={connected} />
          </div>
          <ResizableVideoFeed />
          <p className="text-muted">Drag the bottom-right corner to resize.</p>
        </div>

        <div className="home-content">
          <div className="card">
            <h2>Instructions</h2>
            <ol className="home-instructions">
              {HOME_INSTRUCTIONS.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </div>

          <div className="card">
            <h2>Choose your preset</h2>
            <div className="preset-grid">
              {PRESETS.map((preset) => (
                <button key={preset.id} className="preset-card" onClick={() => onOpenPreset(preset)}>
                  <strong>{preset.name}</strong>
                </button>
              ))}
              <button
                className="preset-card preset-card-custom"
                onClick={() => onOpenPreset(CUSTOM_PRESET)}
                aria-label="Set up your own"
              >
                <strong>+</strong>
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
      </div>
    </div>
  );
}

export default memo(HomeScreen);
