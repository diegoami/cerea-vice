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
    await page.getByRole('button', {name:'Harbor District',exact:true}).click();
    await page.getByRole('button', {name:'Harbor District',exact:true,pressed:true}).waitFor();
    await page.getByRole('button', { name: 'Start the engine' }).waitFor();
    assert.equal(page.url(), 'cerea://game/#district=harbor');
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
    assert.match(await page.locator('#atlas-marker-status').innerText(), /Last information received: Harbor lay-by/);
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
    const beforeCursor = await page.locator('.atlas-cursor').getAttribute('transform');
    await button(15,1);
    await page.waitForFunction((before) => document.querySelector('.atlas-cursor').getAttribute('transform') !== before, beforeCursor);
    await button(15,0);
    await button(0,1); await button(0,0);
    assert.equal(await page.locator('.atlas-pin').isVisible(), true);
    assert.equal(await page.locator('.atlas-book').isVisible(), true, 'A places a marker without closing the atlas');
    const manualPin = await page.locator('.atlas-pin').getAttribute('transform');
    await button(5,1); await button(5,0);
    await page.getByRole('heading', {name:'Places and parking'}).waitFor();
    assert.equal(await page.getByRole('row', {name:/Blue Hotel East Quay Waterfront D2/}).count(), 1);
    await button(4,1); await button(4,0);
    await page.locator('.atlas-map').waitFor();
    assert.equal(await page.locator('.atlas-pin').getAttribute('transform'), manualPin);
    await button(2,1); await button(2,0);
    assert.equal(await page.locator('.atlas-pin').isVisible(), false);
    const hotelPoint = await page.locator('.atlas-map').evaluate((map) => {
      const point = new DOMPoint(93,-44).matrixTransform(map.getScreenCTM());
      return {x:point.x, y:point.y};
    });
    await page.mouse.click(hotelPoint.x, hotelPoint.y);
    await page.waitForFunction(() => document.querySelector('#atlas-marker-status').textContent.includes('D2'));
    const clickedPin = await page.locator('.atlas-pin').getAttribute('transform');
    await mkdir('test-results', {recursive:true});
    await page.screenshot({path:'test-results/desktop-atlas.png'});
    await button(1,1); await button(1,0);
    await page.waitForFunction(() => document.querySelector('#overlay').hidden);
    await button(7,0.7);
    await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) > 8);
    await button(3,1); await button(3,0);
    assert.equal(await page.locator('.atlas-book').isVisible(), false, 'Atlas is unavailable while moving');
    assert.match(await page.locator('#hint').innerText(), /complete stop before opening the atlas/);
    await button(0,1); await button(0,0);
    assert.match(await page.locator('#hint').innerText(), /complete stop first/);
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
    await page.keyboard.press('e');
    await page.getByRole('heading', {name:'Places and parking'}).waitFor();
    await page.getByRole('button', {name:'01 · District map'}).click();
    await page.locator('.atlas-map').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#overlay').hidden);
    // A hand-placed marker stays where it was left after driving and reopening.
    await page.keyboard.press('t');
    await page.locator('.atlas-map').waitFor();
    assert.equal(await page.locator('.atlas-pin').getAttribute('transform'), clickedPin, 'Parking and rejected moving requests leave the estimate unchanged');
    assert.match(await page.locator('#atlas-marker-status').innerText(), /Your estimated position/);
    const readingTimer=await page.locator('#timer').innerText();
    await button(8,1); await button(8,0);
    await page.locator('.atlas-information:not([hidden])').waitFor();
    assert.equal(await page.locator('.atlas-map').isVisible(),true,'Controller information request keeps the map open');
    assert.notEqual(await page.locator('.atlas-pin').getAttribute('transform'), clickedPin, 'Information replaces the estimate');
    assert.match(await page.locator('#atlas-marker-status').innerText(), /Last information received/);
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#timer').innerText(),readingTimer);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(150);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.atlas-book').isVisible(), true);
    await page.keyboard.press('Delete');
    await page.waitForFunction(() => document.querySelector('.atlas-pin').style.display === 'none');
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

test('Cerea Centro runs offline with its real-place atlas, controller drive and information marker', {timeout:90000}, async()=>{
  const profile=await mkdtemp(path.join(tmpdir(),'cerea-centro-test-'));
  const errors=[];
  const electronApp=await _electron.launch({args:[path.resolve('.'),`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
  try {
    const page=await electronApp.firstWindow();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
    await page.getByRole('button',{name:'Cerea Centro',exact:true,pressed:true}).waitFor();
    await page.getByRole('heading',{name:'Find Biblioteca di Cerea.'}).waitFor();
    await mkdir('test-results',{recursive:true});
    await page.screenshot({path:'test-results/cerea-briefing.png'});
    await page.getByRole('button',{name:'Start the engine'}).click();
    await page.waitForFunction(()=>document.querySelector('#stop-state').textContent==='P · LEGAL STOP');
    assert.match(await page.locator('#location').innerText(),/Via Venticinque Aprile/);
    const beforeLook=await page.locator('#viewport').screenshot({style:'#hud { visibility:hidden !important; }'});
    const carHeading=await page.locator('#heading').innerText();
    await page.evaluate(()=>{
      window.lookPad={connected:true,mapping:'standard',axes:[0,0,1,0],buttons:Array.from({length:17},()=>({value:0}))};
      Object.defineProperty(navigator,'getGamepads',{value:()=>[window.lookPad],configurable:true});
    });
    await page.waitForTimeout(600);
    await page.evaluate(()=>{window.lookPad.axes[2]=0;});
    assert.notDeepEqual(await page.locator('#viewport').screenshot({style:'#hud { visibility:hidden !important; }'}),beforeLook,'Right-stick input rotates the rendered view');
    assert.equal(await page.locator('#heading').innerText(),carHeading,'Looking does not steer the car');
    await page.keyboard.press('c');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.locator('#viewport').click({position:{x:500,y:250}});
    await page.waitForFunction(()=>document.pointerLockElement?.id==='viewport');
    const beforeMouse=await page.locator('#viewport').screenshot({style:'#hud { visibility:hidden !important; }'});
    await page.mouse.move(950,400);
    await page.waitForTimeout(200);
    assert.notDeepEqual(await page.locator('#viewport').screenshot({style:'#hud { visibility:hidden !important; }'}),beforeMouse,'Captured mouse movement rotates the rendered view');
    assert.equal(await page.locator('#heading').innerText(),carHeading);

    await page.keyboard.press('t');
    await page.getByRole('dialog',{name:'Cerea Centro'}).waitFor();
    assert.equal(await page.evaluate(()=>document.pointerLockElement===null),true,'Opening the atlas releases mouse capture without pausing out of the atlas');
    assert.match(await page.locator('#atlas-marker-status').innerText(),/Starting position: Sosta Municipio/);
    assert.match(await page.locator('.atlas-attribution').innerText(),/OpenStreetMap/);
    assert.match(await page.locator('.atlas-map').innerHTML(),/VIA PARIDE/);
    assert.ok(await page.locator('#viewport').evaluate(canvas=>canvas.width>=Math.min(window.innerWidth,1920)), 'Street names render above the old 960px cap');
    const readingTimer=await page.locator('#timer').innerText();
    await page.keyboard.press('f');
    await page.locator('.atlas-information:not([hidden])').waitFor();
    assert.equal(await page.locator('.atlas-map').isVisible(),true);
    assert.match(await page.locator('#atlas-information-text').innerText(),/Via Venticinque Aprile/);
    assert.match(await page.locator('#atlas-marker-status').innerText(),/Last information received/);
    await page.screenshot({path:'test-results/cerea-atlas.png'});
    const manualPoint=await page.locator('.atlas-map').evaluate(map=>{const p=new DOMPoint(220,250).matrixTransform(map.getScreenCTM());return {x:p.x,y:p.y};});
    await page.mouse.click(manualPoint.x,manualPoint.y);
    await page.waitForFunction(()=>document.querySelector('#atlas-marker-status').textContent.includes('Your estimated position'));
    await page.keyboard.press('e');
    await page.getByRole('row',{name:/Biblioteca di Cerea Viale della Vittoria/}).waitFor();
    await page.getByRole('button',{name:/Ask for information/}).click();
    await page.waitForFunction(()=>document.querySelector('#atlas-marker-status').textContent.includes('Last information received'));
    assert.equal(await page.getByRole('heading',{name:'Places and parking'}).isVisible(),true);
    assert.equal(await page.locator('#timer').innerText(),readingTimer);
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.querySelector('#overlay').hidden);
    await page.locator('#viewport').click({position:{x:500,y:250}});
    await page.waitForFunction(()=>document.pointerLockElement?.id==='viewport');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Back to the road'}).waitFor();
    assert.equal(await page.evaluate(()=>document.pointerLockElement===null),true);
    await page.waitForTimeout(400);
    assert.equal(await page.getByRole('button',{name:'Back to the road'}).isVisible(),true,'Escape must leave the game paused');
    await page.getByRole('button',{name:'Back to the road'}).click();
    await page.waitForFunction(()=>document.querySelector('#overlay').hidden);
    await page.keyboard.down('w');
    await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>12);
    await page.keyboard.up('w');
    await page.keyboard.down('Space');
    await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)===0);
    await page.keyboard.up('Space');
    await page.screenshot({path:'test-results/cerea-driving.png'});
    assert.deepEqual(errors,[]);
  } finally {await electronApp.close();await rm(profile,{recursive:true,force:true});}
});
