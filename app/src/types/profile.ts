import type { GestureName } from "./gesture";

export interface Binding {
  gesture: GestureName;
  // Every key here is pressed/released together as one combo (e.g. ["W", "D"]).
  // Empty = unbound.
  keys: string[];
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
