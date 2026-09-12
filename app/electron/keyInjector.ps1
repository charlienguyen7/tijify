<#
  Persistent key-injection worker for Tijify.

  Spawned once by the Electron main process and kept alive for the app's
  lifetime. Compiles a small SendInput P/Invoke wrapper a single time (the
  slow part - JIT via Add-Type), then services "DOWN <vk>" / "UP <vk>"
  commands read from stdin, one per line, for as long as the process lives.
  This replaces spawning a fresh powershell.exe + Add-Type + SendKeys.SendWait
  on every single keypress, which had no hold/release concept at all and
  paid a 150-400ms process-spawn/JIT cost per call.
#>

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace Tijify {
    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public InputUnion u;
    }

    public static class KeyboardInjector {
        public const uint INPUT_KEYBOARD = 1;
        public const uint KEYEVENTF_KEYUP = 0x0002;

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        public static void SendKey(ushort vk, bool keyUp) {
            INPUT[] inputs = new INPUT[1];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].u.ki.wVk = vk;
            inputs[0].u.ki.wScan = 0;
            inputs[0].u.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
            inputs[0].u.ki.time = 0;
            inputs[0].u.ki.dwExtraInfo = IntPtr.Zero;
            SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }
    }
}
"@

Write-Output 'READY'

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $line = $line.Trim()
    if ($line.Length -eq 0) { continue }

    $parts = $line.Split(' ')
    if ($parts.Length -lt 2) { continue }

    $vk = [uint16]0
    if (-not [uint16]::TryParse($parts[1], [ref]$vk)) { continue }

    switch ($parts[0].ToUpperInvariant()) {
        'DOWN' { [Tijify.KeyboardInjector]::SendKey($vk, $false) }
        'UP'   { [Tijify.KeyboardInjector]::SendKey($vk, $true) }
    }
}
