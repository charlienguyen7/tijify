import bgKeycaps from "../assets/background.png";
import bgHacker from "../assets/backgroundhacker.png";
import bgUt from "../assets/backgroundut.png";
import bgRice from "../assets/backgroundrice.png";

export interface BackgroundPreset {
  id: string;
  label: string;
  image: string;
  opacity: number;
  titleColor: string;
}

// Opacity is tuned per image, not shared: the hacker background is mostly
// black, so it needs a much stronger wash than the pale keycap/UT/Rice
// patterns to actually read as its own backdrop instead of washing out to
// a faint grey.
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: "keycaps", label: "Keycaps", image: bgKeycaps, opacity: 0.5, titleColor: "#298956" },
  { id: "hacker", label: "Hacker", image: bgHacker, opacity: 1, titleColor: "#39ff14" },
  { id: "ut", label: "UT Austin", image: bgUt, opacity: 1, titleColor: "#f5f1e8" },
  { id: "rice", label: "Rice", image: bgRice, opacity: 1, titleColor: "#f5f1e8" },
];
