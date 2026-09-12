import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("tijify", {
  tap: (key: string) => ipcRenderer.invoke("input:tap", key),
  hold: (key: string) => ipcRenderer.invoke("input:hold", key),
  release: (key: string) => ipcRenderer.invoke("input:release", key),
  releaseAll: () => ipcRenderer.invoke("input:releaseAll"),
});
