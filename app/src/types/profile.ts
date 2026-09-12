import type { GestureName } from "./gesture";

export interface Binding {
  gesture: GestureName;
  key: string | null;
  mode: "tap" | "hold";
}

export interface Profile {
  id: string;
  name: string;
  presetId?: string;
  bindings: Binding[];
  createdAt: number;
  updatedAt: number;
}
