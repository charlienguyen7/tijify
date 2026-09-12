import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { InputController } from "./inputController";

const isDev = process.env.NODE_ENV === "development";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

ipcMain.handle("input:tap", (_event, key: string) => {
  InputController.tap(key);
});
ipcMain.handle("input:hold", (_event, key: string) => {
  InputController.hold(key);
});
ipcMain.handle("input:release", (_event, key: string) => {
  InputController.release(key);
});
ipcMain.handle("input:releaseAll", () => {
  InputController.releaseAll();
});

app.whenReady().then(() => {
  InputController.warmUp(); // Pay the one-time Add-Type JIT cost while the splash screen shows.
  createWindow();
});

app.on("before-quit", () => {
  InputController.shutdown();
});

app.on("window-all-closed", () => {
  InputController.shutdown();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
