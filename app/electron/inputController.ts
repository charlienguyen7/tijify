/**
 * System-level keyboard injection for Windows.
 *
 * We deliberately avoid native-addon keyboard libraries (e.g. robotjs) here:
 * they require node-gyp/native compilation against the exact Electron ABI,
 * which is a common source of "works on my machine" build failures during a
 * time-boxed hackathon. Instead we shell out to PowerShell's built-in
 * System.Windows.Forms.SendKeys, which ships with Windows and needs no native
 * module at all. It sends keys to whichever window currently has OS focus
 * (e.g. Notepad), exactly like a native keyboard driver would.
 *
 * Only key names present in KEY_MAP are ever sent, so this is safe against
 * injection even though the value flows into a shell command string.
 */

import { execFileSync } from "node:child_process";

const MODIFIER_PREFIXES: Record<string, string> = {
  CTRL: "^",
  SHIFT: "+",
  ALT: "%",
};

// SendKeys tokens for each supported non-modifier key. Extend as needed.
const KEY_MAP: Record<string, string> = {
  SPACE: " ",
  ENTER: "{ENTER}",
  ESCAPE: "{ESC}",
  TAB: "{TAB}",
  BACKSPACE: "{BACKSPACE}",
  DELETE: "{DEL}",
  ARROWLEFT: "{LEFT}",
  ARROWRIGHT: "{RIGHT}",
  ARROWUP: "{UP}",
  ARROWDOWN: "{DOWN}",
};
for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  KEY_MAP[letter] = letter.toLowerCase();
}
for (const digit of "0123456789") {
  KEY_MAP[digit] = digit;
}

function buildSendKeysString(keys: string[]): string | null {
  const modifierPrefix = keys
    .map((k) => MODIFIER_PREFIXES[k.toUpperCase()])
    .filter(Boolean)
    .join("");

  const baseKeys = keys
    .map((k) => k.toUpperCase())
    .filter((k) => !(k in MODIFIER_PREFIXES))
    .map((k) => KEY_MAP[k])
    .filter((token): token is string => Boolean(token));

  if (baseKeys.length === 0) return null;

  const baseString = baseKeys.length > 1 ? `(${baseKeys.join("")})` : baseKeys[0];
  return modifierPrefix + baseString;
}

export class InputController {
  /** Press-and-release the given key combination exactly once. */
  static tap(keys: string[]): void {
    const sendKeysString = buildSendKeysString(keys);
    if (!sendKeysString) {
      console.warn("[inputController] no recognized keys in", keys);
      return;
    }

    const escaped = sendKeysString.replace(/'/g, "''");
    const psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`;

    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", psCommand],
      { stdio: "ignore" }
    );
  }
}
