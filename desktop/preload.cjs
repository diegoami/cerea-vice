// Sandboxed preload: a narrow radio API. No paths go in; display titles and ids come out.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cereaMusic', {
  library: () => ipcRenderer.invoke('music:library'),
  chooseFolder: () => ipcRenderer.invoke('music:choose'),
});
