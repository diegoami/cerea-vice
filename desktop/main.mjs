import { app, BrowserWindow, Menu, net, protocol, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetPath } from './assets.mjs';

protocol.registerSchemesAsPrivileged([
  { scheme: 'cerea', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow() {
  const window = new BrowserWindow({
    title: 'Cerea Vice',
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#131c26',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    const url = new URL(target);
    if (url.protocol !== 'cerea:' || url.host !== 'game' || url.pathname !== '/') event.preventDefault();
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && !input.isAutoRepeat &&
        (input.key === 'F11' || (input.alt && input.key === 'Enter'))) {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
  });
  const requestedDistrict = app.commandLine.getSwitchValue('district');
  const selected = ['cerea','harbor'].includes(requestedDistrict) ? `#district=${requestedDistrict}` : '';
  window.loadURL(`cerea://game/${selected}`);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Game', submenu: [{ role: 'togglefullscreen' }, { type: 'separator' }, { role: 'quit' }] },
  ]));
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  protocol.handle('cerea', async (request) => {
    try {
      const file = assetPath(request.url, path.join(app.getAppPath(), 'dist'));
      if (!file || request.method !== 'GET') return new Response('Not found', { status: 404 });
      const response = await net.fetch(pathToFileURL(file).href);
      response.headers.set('Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'");
      return response;
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
