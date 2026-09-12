import { createBinding } from "./gestures";
import type { Binding } from "../types/profile";

export interface Preset {
  id: string;
  name: string;
  description: string;
  bindings: Binding[];
}

// Placeholder default mappings — all remain fully editable on the binding screen.
export const PRESETS: Preset[] = [
  {
    id: "preset-geometry-dash",
    name: "Geometry Dash",
    description: "One button to jump over spikes and blocks.",
    bindings: [createBinding("jump", "SPACE")],
  },
  {
    id: "preset-tetris",
    name: "Tetris",
    description: "Lean to shift pieces, crouch to drop, jump to rotate.",
    bindings: [
      createBinding("lean-left", "ARROWLEFT"),
      createBinding("lean-right", "ARROWRIGHT"),
      createBinding("crouch", "ARROWDOWN"),
      createBinding("jump", "ARROWUP"),
    ],
  },
  {
    id: "preset-chrome-dino",
    name: "Chrome Dino",
    description: "Jump over cacti, crouch under pterodactyls.",
    bindings: [createBinding("jump", "SPACE"), createBinding("crouch", "ARROWDOWN")],
  },
  {
    id: "preset-fireboy-watergirl",
    name: "Fireboy & Watergirl",
    description: "Lean to move, jump to hop over obstacles.",
    bindings: [
      createBinding("lean-left", "A"),
      createBinding("lean-right", "D"),
      createBinding("jump", "W"),
    ],
  },
];

export const CUSTOM_PRESET: Preset = {
  id: "preset-other",
  name: "Other",
  description: "Set up your own movement-to-key mapping from scratch.",
  bindings: [],
};
