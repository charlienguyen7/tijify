import { useEffect, useState } from "react";
import { BACKGROUND_PRESETS } from "../data/backgrounds";

const STORAGE_KEY = "tijify.backgroundIndex";

function loadIndex(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw !== null ? Number(raw) : 0;
    return Number.isInteger(parsed) && parsed >= 0 && parsed < BACKGROUND_PRESETS.length ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveIndex(index: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(index));
  } catch {
    // localStorage unavailable (e.g. private/sandboxed context) — fail soft.
  }
}

// Applied as custom properties on the document root rather than plumbed
// through App.tsx/props: App.css's global `body::before` (the page
// background) and HomeScreen.css's title-color rule both just read
// `var(--bg-image)` / `var(--bg-opacity)` / `--home-title-color`, so the
// whole feature - state, storage, and the picker control - stays contained
// to HomeScreen without touching any other screen.
function applyPreset(index: number): void {
  const preset = BACKGROUND_PRESETS[index];
  const root = document.documentElement.style;
  root.setProperty("--bg-image", `url(${preset.image})`);
  root.setProperty("--bg-opacity", String(preset.opacity));
  root.setProperty("--home-title-color", preset.titleColor);
}

export function useBackgroundPreference() {
  const [index, setIndex] = useState(loadIndex);

  useEffect(() => {
    applyPreset(index);
    saveIndex(index);
  }, [index]);

  const cycle = () => setIndex((i) => (i + 1) % BACKGROUND_PRESETS.length);

  return { preset: BACKGROUND_PRESETS[index], cycle };
}
