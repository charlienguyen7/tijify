import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("tijify", {
  tapKey: (keys: string[]) => ipcRenderer.invoke("input:tap", keys),
});
