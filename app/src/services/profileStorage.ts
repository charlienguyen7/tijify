import type { Profile } from "../types/profile";

const PROFILES_KEY = "tijify.profiles";
const LAST_PROFILE_KEY = "tijify.lastProfileId";

export function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(profiles: Profile[]): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // localStorage unavailable (e.g. private/sandboxed context) — fail soft.
  }
}

export function saveProfile(profile: Profile): Profile {
  const profiles = loadProfiles();
  const now = Date.now();
  const existingIndex = profiles.findIndex((p) => p.id === profile.id);
  const saved: Profile = {
    ...profile,
    createdAt: existingIndex >= 0 ? profiles[existingIndex].createdAt : profile.createdAt || now,
    updatedAt: now,
  };
  if (existingIndex >= 0) {
    profiles[existingIndex] = saved;
  } else {
    profiles.push(saved);
  }
  persist(profiles);
  return saved;
}

export function deleteProfile(id: string): void {
  persist(loadProfiles().filter((p) => p.id !== id));
}

export function getProfile(id: string): Profile | undefined {
  return loadProfiles().find((p) => p.id === id);
}

export function isProfileSaved(id: string): boolean {
  return loadProfiles().some((p) => p.id === id);
}

export function getLastProfileId(): string | null {
  try {
    return localStorage.getItem(LAST_PROFILE_KEY);
  } catch {
    return null;
  }
}

export function setLastProfileId(id: string): void {
  try {
    localStorage.setItem(LAST_PROFILE_KEY, id);
  } catch {
    // ignore
  }
}
