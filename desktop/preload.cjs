const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("sole", {
  call: (action, payload) => ipcRenderer.invoke("sole:call", action, payload),
});
