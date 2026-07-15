const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('statusWindow', {
  onUpdate: (callback) => {
    ipcRenderer.on('status-window:update', (_event, state) => callback(state));
  },
});
