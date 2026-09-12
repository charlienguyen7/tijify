/**
 * System-level keyboard injection for Windows.
 *
 * We deliberately avoid native-addon keyboard libraries (e.g. robotjs) here:
 * they require node-gyp/native compilation against the exact Electron ABI,
 * which is a common source of "works on my machine" build failures during a
 * time-boxed hackathon.
 *
 * The original implementation shelled out to PowerShell's SendKeys for every
 * single keypress, spawning a fresh process and re-JIT-compiling via Add-Type
 * each time (~150-400ms/call) - and SendKeys.SendWait has no down/up
 * primitive at all, so it could never support "hold" (needed for crouch,
 * lean, turn, walk, run). Instead we spawn ONE persistent PowerShell process
 * (keyInjector.ps1) at app startup that compiles a small user32.dll
 * SendInput P/Invoke wrapper a single time, then reads "DOWN <vk>"/"UP <vk>"
 * commands from its stdin for the app's lifetime - still no compiled native
 * module (Add-Type JITs C# at runtime, no .node binary, no Electron-ABI
 * rebuild risk), still entirely within the Electron main process, but now
 * with true hold/release and sub-10ms per command after the one-time
 * ~200-400ms warm-up (hidden behind the splash screen).
 *
 * Caveat: like SendKeys before it, SendInput delivers to whichever window
 * currently has OS focus - the user must click into the game window first.
 * Games reading raw scan codes/DirectInput instead of VK-level messages may
 * not respond; this is not expected to affect the standard keyboard-driven
 * presets this app ships with.
 */

import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

const VK_MAP: Record<string, number> = {
  SPACE: 0x20,
  ENTER: 0x0d,
  ESCAPE: 0x1b,
  TAB: 0x09,
  BACKSPACE: 0x08,
  DELETE: 0x2e,
  ARROWLEFT: 0x25,
  ARROWUP: 0x26,
  ARROWRIGHT: 0x27,
  ARROWDOWN: 0x28,
  CTRL: 0x11,
  SHIFT: 0x10,
  ALT: 0x12,
};
for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  VK_MAP[letter] = letter.charCodeAt(0); // VK codes for A-Z equal their ASCII codes.
}
for (const digit of "0123456789") {
  VK_MAP[digit] = digit.charCodeAt(0); // VK codes for 0-9 equal their ASCII codes.
}

const TAP_RELEASE_DELAY_MS = 40;
const INJECTOR_SCRIPT_PATH = path.join(__dirname, "..", "electron", "keyInjector.ps1");

export class InputController {
  private static proc: ChildProcessWithoutNullStreams | null = null;
  private static heldKeys = new Set<string>();

  /** Spawn and warm up the injector process ahead of time (call during app startup). */
  static warmUp(): void {
    this.ensureProcess();
  }

  /** Press-and-release the given key once. */
  static tap(key: string): void {
    const vk = VK_MAP[key.toUpperCase()];
    if (vk === undefined) {
      console.warn("[inputController] unrecognized key", key);
      return;
    }
    this.send(`DOWN ${vk}`);
    setTimeout(() => this.send(`UP ${vk}`), TAP_RELEASE_DELAY_MS);
  }

  /** Press and hold the given key until release() is called. No-op if already held. */
  static hold(key: string): void {
    const normalized = key.toUpperCase();
    if (this.heldKeys.has(normalized)) return;
    const vk = VK_MAP[normalized];
    if (vk === undefined) {
      console.warn("[inputController] unrecognized key", key);
      return;
    }
    this.heldKeys.add(normalized);
    this.send(`DOWN ${vk}`);
  }

  /** Release a key previously held via hold(). No-op if not currently held. */
  static release(key: string): void {
    const normalized = key.toUpperCase();
    if (!this.heldKeys.has(normalized)) return;
    const vk = VK_MAP[normalized];
    this.heldKeys.delete(normalized);
    if (vk === undefined) return;
    this.send(`UP ${vk}`);
  }

  /** Release every currently-held key. Call on Stop, ESC, disconnect, or app quit. */
  static releaseAll(): void {
    for (const key of this.heldKeys) {
      const vk = VK_MAP[key];
      if (vk !== undefined) this.send(`UP ${vk}`);
    }
    this.heldKeys.clear();
  }

  /** Release all keys and terminate the injector process. Call on app quit. */
  static shutdown(): void {
    this.releaseAll();
    this.proc?.kill();
    this.proc = null;
  }

  private static ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.proc && !this.proc.killed) return this.proc;
    const proc = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", INJECTOR_SCRIPT_PATH],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
    );
    proc.stderr.on("data", (chunk) => console.error("[inputController]", chunk.toString()));
    proc.on("exit", (code) => {
      console.warn("[inputController] key injector exited", code);
      if (this.proc === proc) {
        this.proc = null;
        this.heldKeys.clear(); // Physical keys may still be down; best effort only.
      }
    });
    this.proc = proc;
    return proc;
  }

  private static send(command: string): void {
    const proc = this.ensureProcess();
    proc.stdin.write(command + "\n");
  }
}
