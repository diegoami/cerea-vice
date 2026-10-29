import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetPath } from './assets.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { readChoice, scanFolder, trackResponse, writeChoice } from './music.mjs';

// Portable Windows launches and the WSL launcher share durable player data.
if(process.platform==='win32'&&!app.commandLine.hasSwitch('user-data-dir')){
  const profile=path.join(process.env.LOCALAPPDATA??app.getPath('appData'),'CereaVice','profile');
  mkdirSync(profile,{recursive:true});
  app.setPath('userData',profile);
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'cerea', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  // Local radio tracks only, by main-process ids; streamed so audio can seek.
  { scheme: 'cerea-music', privileges: { standard: true, secure: true, stream: true } },
]);

// The player's music folder: chosen only through the native dialog, never by a renderer path.
const music = { table: new Map(), root: undefined, library: undefined };
async function musicLibrary(folder) {
  const { library, table, root } = await scanFolder(folder);
  music.table = table; music.root = root; music.library = library;
  return library;
}

// Districts come from the bundled registry; an unlisted --district is ignored rather than passed on.
function listedDistricts() {
  try { return JSON.parse(readFileSync(path.join(app.getAppPath(), 'dist', 'maps', 'towns.json'), 'utf8')).towns.map(town => town.id); }
  catch { return []; }
}
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
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      // Electron's default, stated so a controller-only start (no browser gesture) never mutes the engine.
      autoplayPolicy: 'no-user-gesture-required',
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
  const selected = listedDistricts().includes(requestedDistrict) ? `#district=${requestedDistrict}` : '';
  const parameters=new URLSearchParams();if(app.commandLine.hasSwitch('profile'))parameters.set('profile','1');if(app.commandLine.hasSwitch('tile-lab'))parameters.set('tile-lab','1');
  window.loadURL(`cerea://game/${parameters.size?'?'+parameters:''}${selected}`);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Game', submenu: [{ role: 'togglefullscreen' }, { type: 'separator' }, { role: 'quit' }] },
  ]));
  const gameOrigin = value => { try { const url = new URL(value); return url.protocol === 'cerea:' && url.host === 'game'; } catch { return false; } };
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin) => permission === 'pointerLock' && gameOrigin(origin) && Boolean(contents && gameOrigin(contents.getURL())));
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(permission === 'pointerLock' && gameOrigin(contents.getURL())));
  const fromGame = event => event.senderFrame === event.sender.mainFrame && gameOrigin(event.senderFrame?.url ?? '');
  ipcMain.handle('music:library', async event => {
    if (!fromGame(event)) throw new Error('Not available');
    return musicLibrary(await readChoice(app.getPath('userData')));
  });
  ipcMain.handle('music:choose', async event => {
    if (!fromGame(event)) throw new Error('Not available');
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: 'Choose a music folder for the radio', properties: ['openDirectory'] });
    // Cancelling must not rescan: a rescan issues fresh track ids the renderer has not seen.
    if (result.canceled || !result.filePaths[0]) return { cancelled: true, ...(music.library ?? await musicLibrary(await readChoice(app.getPath('userData')))) };
    try { await writeChoice(app.getPath('userData'), result.filePaths[0]); } catch { /* Still usable for this session. */ }
    return musicLibrary(result.filePaths[0]);
  });
  protocol.handle('cerea-music', async (request) => {
    try { return await trackResponse(request, music.table, music.root); }
    catch { return new Response('Not found', { status: 404 }); }
  });
  protocol.handle('cerea', async (request) => {
    try {
      const file = assetPath(request.url, path.join(app.getAppPath(), 'dist'));
      if (!file || request.method !== 'GET') return new Response('Not found', { status: 404 });
      const response = await net.fetch(pathToFileURL(file).href);
      response.headers.set('Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src cerea-music:; object-src 'none'; base-uri 'none'; frame-src 'none'");
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
