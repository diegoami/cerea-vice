import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright-core';

// On headless Linux use Xvfb with a window manager for the fullscreen check.
test('desktop runs offline and supports a controller-only drive, disconnect and resume', { timeout: 90000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'cerea-desktop-test-'));
  const errors = [];
  const electronApp = await _electron.launch({
    ...(process.env.CEREA_DESKTOP_EXECUTABLE ? { executablePath: process.env.CEREA_DESKTOP_EXECUTABLE } : {}),
    args: [
      ...(process.env.CEREA_DESKTOP_EXECUTABLE ? [] : [path.resolve('.')]),
      `--user-data-dir=${profile}`,
      // Software graphics and no sandbox are test-only flags for headless Linux.
      ...(process.platform === 'linux' ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : []),
    ],
  });
  try {
    const page = await electronApp.firstWindow();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.getByRole('button', { name: 'Start the engine' }).waitFor();
    assert.equal(page.url(), 'cerea://game/');
    assert.equal(await page.evaluate(() => window.isSecureContext), true);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await page.evaluate(() => typeof navigator.getGamepads), 'function');
    assert.equal(await page.locator('#viewport').count(), 1);
    const preferences = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
    assert.equal(preferences.sandbox, true);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.nodeIntegration, false);
    // Inject standard-mapped input at the OS/browser boundary, not into the game.
    await page.evaluate(() => {
      window.testController = { connected: true, mapping: 'standard', axes: [0,0,0,0], buttons: Array.from({length:17}, () => ({ value:0, pressed:false, touched:false })) };
      Object.defineProperty(navigator, 'getGamepads', { value: () => window.testController.connected ? [window.testController] : [] });
    });
    await page.waitForFunction(() => document.querySelector('#controller-status')?.textContent.includes('Controller connected'));
    const button = async (index, value) => {
      await page.evaluate(({index,value}) => { window.testController.buttons[index].value = value; }, {index,value});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    await button(9,1); // Start button can begin the drive without a keyboard.
    await button(9,0);
    await page.waitForFunction(() => document.querySelector('#overlay').hidden);
    await page.waitForFunction(() => document.querySelector('#stop-state').textContent === 'P · LEGAL STOP');
    await button(0,1);
    await button(0,0);
    await page.waitForFunction(() => document.querySelector('#hint').textContent.includes('Harbor Road'));
    // A held atlas button must open once; driving inputs cannot move the car while reading.
    await button(3,1);
    await page.getByRole('dialog', {name:'Harbor District'}).waitFor();
    const atlasTimer = await page.locator('#timer').innerText();
    const atlasHeading = await page.locator('#heading').innerText();
    const map = await page.locator('.atlas-map').innerHTML();
    assert.match(map, /HARBOR ROAD/);
    assert.match(map, /BLUE HOTEL/);
    assert.equal(await page.locator('.atlas-parking').count(), 4);
    await button(7,1);
    await page.evaluate(() => { window.testController.axes[0] = 1; });
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.atlas-book').count(), 1);
    assert.equal(await page.locator('#timer').innerText(), atlasTimer);
    assert.equal(await page.locator('#heading').innerText(), atlasHeading);
    assert.equal(Number(await page.locator('#speed').innerText()), 0);
    await button(7,0);
    await button(3,0);
    await page.evaluate(() => { window.testController.axes[0] = 0; });
    await button(5,1); await button(5,0);
    await page.getByRole('heading', {name:'Places and parking'}).waitFor();
    assert.equal(await page.getByRole('row', {name:/Blue Hotel East Quay Waterfront D2/}).count(), 1);
    await button(4,1); await button(4,0);
    await page.locator('.atlas-map').waitFor();
    await mkdir('test-results', {recursive:true});
    await page.screenshot({path:'test-results/desktop-atlas.png'});
    await button(1,1); await button(1,0);
    await page.waitForFunction(() => document.querySelector('#overlay').hidden);
    await button(7,0.7);
    await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) > 8);
    await button(3,1); await button(3,0);
    assert.equal(await page.locator('.atlas-book').isVisible(), false, 'Atlas is unavailable while moving');
    assert.match(await page.locator('#hint').innerText(), /complete stop before opening the atlas/);
    await page.evaluate(() => { window.testController.axes[0] = -0.6; });
    await page.waitForFunction(() => !document.querySelector('#heading').textContent.includes('090°'));
    await button(7,0);
    await button(2,1);
    await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) === 0);
    await button(2,0);
    // Keyboard and mouse page controls share the same atlas, without resuming on Escape.
    await page.waitForFunction(() => document.querySelector('#stop-state').textContent.includes('STOP'));
    await page.keyboard.press('t');
    await page.locator('.atlas-map').waitFor();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('heading', {name:'Places and parking'}).waitFor();
    await page.getByRole('button', {name:'01 · District map'}).click();
    await page.locator('.atlas-map').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#overlay').hidden);
    // Reopening is allowed before testing disconnect while reading.
    await page.keyboard.press('t');
    await page.locator('.atlas-map').waitFor();
    await button(12,1);
    await button(12,0);
    assert.equal(await page.locator('.atlas-book').count(), 1);
    await page.evaluate(() => { window.testController.connected = false; });
    await page.getByRole('button', { name: 'Back to the road' }).waitFor();
    assert.match(await page.locator('#hint').innerText(), /Controller disconnected/);
    const timer = await page.locator('#timer').innerText();
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#timer').innerText(), timer);
    await page.evaluate(() => { window.testController.connected = true; });
    await page.waitForFunction(() => document.querySelector('#controller-status')?.textContent.includes('Controller connected'));
    assert.equal(await page.locator('#overlay').isVisible(), true);
    await button(0,1);
    await button(0,0);
    await page.waitForFunction(() => document.querySelector('#overlay').hidden);
    await button(12,1); await button(12,0);
    await page.waitForFunction(() => document.querySelector('#hint-label').textContent === 'MISSION REMINDER');
    await button(9,1);
    await button(9,0);
    await page.getByRole('button', { name: 'Back to the road' }).waitFor();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#overlay').hidden);
    // Browser CDP key injection bypasses Electron's native shortcut event.
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.focus();
      const fullscreen = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Fullscreen did not activate')), 5000);
        win.once('enter-full-screen', () => { clearTimeout(timer); resolve(); });
      });
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F11' });
      await fullscreen;
    });
    assert.equal(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), true);
    await mkdir('test-results', {recursive:true});
    await page.screenshot({ path: 'test-results/desktop-driving.png' });
    assert.deepEqual(errors, []);
  } finally {
    await electronApp.close();
    await rm(profile, {recursive:true, force:true});
  }
});
