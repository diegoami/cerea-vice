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
    assert.equal(await page.locator('#gear').innerText(),'D');
    await button(1,1);
    await page.waitForFunction(()=>document.querySelector('#gear').textContent==='R');
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#gear').innerText(),'R','Holding the gear button must not toggle repeatedly');
    await button(1,0);
    await button(7,.6);
    await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>3);
    await button(1,1); await button(1,0);
    assert.equal(await page.locator('#gear').innerText(),'R','Moving shifts are rejected');
    await button(7,0);await button(6,1);
    await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)===0);
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#gear').innerText(),'R');
    assert.equal(Number(await page.locator('#speed').innerText()),0,'Holding LT never drives in the opposite direction');
    await button(6,0);
    await page.waitForFunction(()=>document.querySelector('#stop-state').textContent==='P · LEGAL STOP');
    await button(1,1);await button(1,0);
    await page.waitForFunction(()=>document.querySelector('#gear').textContent==='D');
    const initialHint=await page.locator('#hint').innerText();
    await button(0,1); await button(0,0);
    assert.equal(await page.locator('#hint').innerText(),initialHint,'A no longer asks for information while driving');
    await button(8,1);
    await button(8,0);
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
    await page.getByRole('button',{name:'Overview',exact:true}).click();
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
    assert.equal(await page.locator('#gear').innerText(),'D','Closing the atlas with B must not shift gear');
    await button(7,0.7);
    await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) > 8);
    await button(3,1); await button(3,0);
    assert.equal(await page.locator('.atlas-book').isVisible(), false, 'Atlas is unavailable while moving');
    assert.match(await page.locator('#hint').innerText(), /complete stop before opening the atlas/);
    await button(8,1); await button(8,0);
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
    await page.getByRole('heading',{name:'Drive a taxi in Cerea.'}).waitFor();
    await mkdir('test-results',{recursive:true});
    await page.screenshot({path:'test-results/cerea-briefing.png'});
    assert.equal(await page.locator('[data-key=resolution]').inputValue(),'retro-fine');
    await page.getByRole('button',{name:'Start the engine'}).click();
    await page.waitForFunction(()=>document.querySelector('#stop-state').textContent==='P · LEGAL STOP');
    assert.equal(await page.locator('#location').count(),0,'The dashboard must not reveal the current street without asking');
    assert.equal(await page.locator('.car-badge').innerText(),'CEREA / 1986');
    assert.match(await page.locator('#objective-title').innerText(),/Collect Elena/);
    assert.match(await page.locator('#taxi-status').innerText(),/€0.00 earned/);
    assert.match(await page.locator('#timer').innerText(),/^07:/);
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#objective-title').textContent.includes('Ufficio Postale'));
    assert.match(await page.locator('#hint').innerText(),/Elena boarded/);
    assert.match(await page.locator('#taxi-status').innerText(),/speed bonus/);
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
    assert.equal(await page.locator('#viewport').evaluate(canvas=>canvas.height),540,'The main Cerea scenario exercises the chosen default');
    const readingTimer=await page.locator('#timer').innerText();
    await page.keyboard.press('f');
    await page.locator('.atlas-information:not([hidden])').waitFor();
    assert.equal(await page.locator('.atlas-map').isVisible(),true);
    assert.match(await page.locator('#atlas-information-text').innerText(),/Via Venticinque Aprile/);
    assert.match(await page.locator('#atlas-marker-status').innerText(),/Last information received/);
    const pinBeforeLookup=await page.locator('.atlas-pin').getAttribute('transform');
    await page.screenshot({path:'test-results/cerea-atlas.png'});
    const manualPoint=await page.locator('.atlas-map').evaluate(map=>{const p=new DOMPoint(220,250).matrixTransform(map.getScreenCTM());return {x:p.x,y:p.y};});
    await page.mouse.click(manualPoint.x,manualPoint.y);
    await page.waitForFunction(()=>document.querySelector('#atlas-marker-status').textContent.includes('Your estimated position'));
    await page.keyboard.press('e');
    await page.getByRole('row',{name:/Biblioteca di Cerea Viale della Vittoria/}).waitFor({state:'attached'});
    await page.keyboard.down('ArrowDown');
    await page.waitForFunction(()=>document.querySelector('.atlas-index').scrollTop>0);
    await page.keyboard.up('ArrowDown');
    await page.getByRole('button',{name:/Ask for information/}).click();
    await page.waitForFunction(()=>document.querySelector('#atlas-marker-status').textContent.includes('Last information received'));
    assert.equal(await page.getByRole('heading',{name:'Places and parking'}).isVisible(),true);
    assert.equal(await page.locator('#timer').innerText(),readingTimer);
    await page.evaluate(()=>{window.lookPad.axes[3]=.8;});
    await page.waitForFunction(()=>document.querySelector('[data-atlas-street][aria-pressed="true"]'));
    await page.evaluate(()=>{window.lookPad.axes[3]=0;window.lookPad.buttons[0].value=1;});
    await page.locator('.atlas-map').waitFor();
    await page.evaluate(()=>{window.lookPad.buttons[0].value=0;});
    assert.equal(await page.locator('#atlas-zoom-level').innerText(),'500%','Controller street lookup opens a detail view');
    assert.equal(await page.locator('.atlas-pin').getAttribute('transform'),pinBeforeLookup,'Looking up a street does not move the position marker');
    await page.keyboard.press('e');
    await page.getByRole('button',{name:'Via Cordioli',exact:true}).click();
    await page.locator('.atlas-map').waitFor();
    assert.equal(await page.locator('#atlas-zoom-level').innerText(),'500%');
    const cordioli=page.locator('.atlas-map [data-street="Via Cordioli"]');
    assert.ok(await cordioli.evaluate(label=>parseFloat(getComputedStyle(label).fontSize)*label.ownerSVGElement.getScreenCTM().a>=16));
    const marker=await page.locator('.atlas-pin').getAttribute('transform');
    const beforeDrag=await page.locator('.atlas-map').getAttribute('viewBox');
    const mapBox=await page.locator('.atlas-map').boundingBox();
    await page.mouse.move(mapBox.x+mapBox.width/2,mapBox.y+mapBox.height/2);
    await page.mouse.down();await page.mouse.move(mapBox.x+mapBox.width/2+60,mapBox.y+mapBox.height/2+35,{steps:5});await page.mouse.up();
    assert.notEqual(await page.locator('.atlas-map').getAttribute('viewBox'),beforeDrag);
    assert.equal(await page.locator('.atlas-pin').getAttribute('transform'),marker,'Dragging pans without placing a new marker');
    await page.screenshot({path:'test-results/atlas-cordioli-detail.png'});
    await page.getByRole('button',{name:'Overview',exact:true}).click();
    assert.equal(await page.locator('#atlas-zoom-level').innerText(),'100%');
    await page.mouse.move(mapBox.x+mapBox.width/2,mapBox.y+mapBox.height/2);
    await page.mouse.wheel(0,-500);
    await page.waitForFunction(()=>parseInt(document.querySelector('#atlas-zoom-level').textContent)>100);
    await page.keyboard.press('Home');
    await page.waitForFunction(()=>document.querySelector('#atlas-zoom-level').textContent==='100%');
    await page.keyboard.press('=');
    await page.waitForFunction(()=>document.querySelector('#atlas-zoom-level').textContent==='150%');
    const beforePan=await page.locator('.atlas-map').getAttribute('viewBox');
    await page.evaluate(()=>{window.lookPad.axes[2]=.8;window.lookPad.buttons[7].value=.6;});
    await page.waitForFunction(before=>document.querySelector('.atlas-map').getAttribute('viewBox')!==before,beforePan);
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.querySelector('#overlay').hidden);
    await page.waitForTimeout(300);
    assert.equal(Number(await page.locator('#speed').innerText()),0,'Closing while holding atlas zoom does not accelerate the car');
    await page.evaluate(()=>{window.lookPad.axes[2]=0;window.lookPad.buttons[7].value=0;});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
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

test('taxi shift ends at 17:00 with an earnings summary and can restart', {timeout:90000}, async()=>{
  const profile=await mkdtemp(path.join(tmpdir(),'cerea-shift-test-'));
  const electronApp=await _electron.launch({args:[path.resolve('.'),`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
  try{
    const page=await electronApp.firstWindow();
    // Start the test fixture just before 17:00; production still starts at 07:00.
    await page.route('**/maps/cerea.json',async route=>{
      const fs=await import('node:fs/promises');const data=JSON.parse(await fs.readFile('public/maps/cerea.json','utf8'));
      data.taxi.startHour=16.99;
      await route.fulfill({json:data});
    });
    await page.reload();
    await page.getByRole('button',{name:'Start the engine'}).click();
    await page.getByRole('heading',{name:'You earned €0.00.'}).waitFor();
    assert.equal(await page.locator('#timer').innerText(),'17:00');
    await page.screenshot({path:'test-results/taxi-shift-results.png'});
    await page.getByRole('button',{name:'Start another shift'}).click();
    await page.waitForFunction(()=>document.querySelector('#overlay').hidden);
  }finally{await electronApp.close();await rm(profile,{recursive:true,force:true});}
});

test('presentation modes preserve sharp UI, mirrors and controller settings without resuming', {timeout:90000}, async()=>{
 const profile=await mkdtemp(path.join(tmpdir(),'cerea-picture-test-'));
 const app=await _electron.launch({args:[path.resolve('.'),`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'Start the engine'}).waitFor();
  await page.locator('[data-key=detail]').selectOption('true');
  await page.locator('[data-key=resolution]').selectOption('retro');
  await page.locator('[data-key=volume]').selectOption('0');
  await page.locator('[data-key=motion]').selectOption('false');
  await page.getByRole('button',{name:'Start the engine'}).click();
  await page.waitForFunction(()=>document.querySelector('#viewport').height===270);
  await page.locator('.presentation-settings').waitFor({state:'hidden'});
  await page.waitForTimeout(400);
  await page.screenshot({path:'test-results/cerea-retro-270p.png'});
  await page.keyboard.press('p');
  await page.getByRole('button',{name:'Back to the road'}).waitFor();
  const frozen=await page.locator('#timer').innerText();
  await page.evaluate(()=>{
   window.settingsPad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0}))};
   Object.defineProperty(navigator,'getGamepads',{value:()=>[window.settingsPad],configurable:true});
   window.settingsPad.buttons[13].value=1;
  });
  await page.waitForFunction(()=>document.querySelector('[data-key=detail]').classList.contains('controller-selected'));
  await page.evaluate(()=>{window.settingsPad.buttons[13].value=0;window.settingsPad.buttons[0].value=1;});
  await page.waitForFunction(()=>document.querySelector('[data-key=detail]').value==='false');
  await page.evaluate(()=>{window.settingsPad.buttons[0].value=0;});
  assert.equal(await page.locator('#timer').innerText(),frozen,'Changing settings cannot resume simulation');
  assert.equal(await page.getByRole('button',{name:'Back to the road'}).isVisible(),true);
  await page.locator('[data-key=resolution]').selectOption('sharp');
  await page.locator('[data-key=detail]').selectOption('true');
  await page.screenshot({path:'test-results/cerea-settings.png'});
  await page.evaluate(()=>{window.settingsPad.buttons[9].value=1;});
  await page.waitForFunction(()=>document.querySelector('#overlay').hidden);
  await page.evaluate(()=>{window.settingsPad.buttons[9].value=0;});
  assert.ok(await page.locator('#viewport').evaluate(canvas=>canvas.height>=innerHeight));
  await page.screenshot({path:'test-results/cerea-sharp-mirrors.png'});
  for(const [width,height] of [[960,640],[1280,900],[1440,900],[1920,1080]]){
   await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
   await page.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height,{width,height});
   const overlaps=await page.evaluate(()=>{
    const credit=document.querySelector('.map-credit').getBoundingClientRect();
    return ['#prompt','.dash-detail','.dashboard-left','.dashboard-right','.navigation-message'].filter(selector=>{
     const other=document.querySelector(selector).getBoundingClientRect();
     return credit.left<other.right&&credit.right>other.left&&credit.top<other.bottom&&credit.bottom>other.top;
    });
   });
   assert.deepEqual(overlaps,[],`Attribution has clear space at ${width}x${height}`);
  }
  await page.screenshot({path:'test-results/cerea-credit-layout.png'});
  assert.deepEqual(errors,[]);
 }finally{await app.close();await rm(profile,{recursive:true,force:true});}
});


test('restricted storage and keyboard settings preserve startup and resume controls', {timeout:90000}, async()=>{
 const profile=await mkdtemp(path.join(tmpdir(),'cerea-settings-regression-'));
 const app=await _electron.launch({args:[path.resolve('.'),`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
 try{
  const page=await app.firstWindow();
  await page.getByRole('button',{name:'Start the engine'}).waitFor();
  for(const key of ['ArrowDown','s','ArrowUp','w']){
   if(await page.locator('#overlay').isHidden()){
    await page.keyboard.press('p');await page.getByRole('button',{name:'Back to the road'}).waitFor();
   }
   const scenery=await page.locator('[data-key=detail]').inputValue();
   await page.keyboard.down(key);await page.waitForTimeout(120);await page.keyboard.up(key);
   await page.keyboard.press('Enter');
   await page.locator('#overlay').waitFor({state:'hidden'});
   assert.equal(await page.locator('[data-key=detail]').inputValue(),scenery,'Movement keys cannot arm settings selection');
  }
  for(const resumeKey of ['Enter','Escape']){
   await page.keyboard.press('p');await page.getByRole('button',{name:'Back to the road'}).waitFor();
   await page.locator('[data-key=radio]').selectOption('true');
   await page.locator('[data-key=radio]').focus();
   await page.keyboard.press(resumeKey);
   await page.locator('#overlay').waitFor({state:'hidden'});
  }
  // The property getter itself throws, before a getItem call can be made.
  await page.addInitScript(()=>{
   Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Blocked preview storage','SecurityError');}});
  });
  await page.reload();
  await page.getByRole('button',{name:'Start the engine'}).waitFor();
  assert.equal(await page.locator('[data-key=resolution]').inputValue(),'retro-fine');
  await page.locator('[data-key=volume]').selectOption('0'); // Writes may fail too; keep settings in memory.
  await page.keyboard.press('Enter');await page.locator('#overlay').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#stop-state').textContent==='P · LEGAL STOP');
  assert.equal(await page.locator('.fatal').count(),0);
 }finally{await app.close();await rm(profile,{recursive:true,force:true});}
});

test('Cerea remains playable 25 km from origin with optional timings and a stable atlas marker', {timeout:90000},async()=>{
 const profile=await mkdtemp(path.join(tmpdir(),'cerea-local-frame-'));
 const app=await _electron.launch({args:[path.resolve('.'),'--profile',`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/maps/cerea.json',async route=>{
   const {readFile}=await import('node:fs/promises');const data=JSON.parse(await readFile('public/maps/cerea.json','utf8'));
   function shift(value){if(!value||typeof value!=='object')return;if(typeof value.x==='number'&&typeof value.z==='number'){value.x+=25000;value.z+=25000;}
    if(typeof value.minX==='number'){value.minX+=25000;value.maxX+=25000;value.minZ+=25000;value.maxZ+=25000;}
    for(const child of Object.values(value))if(typeof child==='object')shift(child);
   }
   shift(data);await route.fulfill({json:data});
  });
  await page.reload();await page.getByRole('button',{name:'Start the engine'}).click();
  await page.waitForFunction(()=>document.querySelector('#stop-state').textContent==='P · LEGAL STOP');
  await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#objective-title').textContent.includes('Ufficio Postale'));
  await page.keyboard.press('f');await page.waitForFunction(()=>document.querySelector('#hint').textContent.includes('Via Venticinque Aprile'));
  await page.keyboard.press('t');await page.locator('.atlas-map').waitFor();
  const pin=await page.locator('.atlas-pin').getAttribute('transform');assert.ok(Number(pin.match(/[\d.]+/)[0])>20000);
  await page.keyboard.press('Escape');await page.locator('#overlay').waitFor({state:'hidden'});
  await page.keyboard.down('w');await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>10);await page.keyboard.up('w');
  await page.keyboard.down('Space');await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)===0);await page.keyboard.up('Space');
  await page.waitForFunction(()=>document.querySelector('#stop-state').textContent.includes('STOP'));
  await page.screenshot({path:'test-results/cerea-25km.png'});
  const timings=await page.locator('#performance-stats').innerText();assert.match(timings,/physics-step:/);assert.match(timings,/nearest-road:/);assert.match(timings,/route-search:/);assert.match(timings,/render:/);
  assert.doesNotMatch(timings,/Via |Cordioli|25000/,'Timing diagnostics reveal no location or route');
  await page.keyboard.press('t');await page.locator('.atlas-map').waitFor();assert.equal(await page.locator('.atlas-pin').getAttribute('transform'),pin,'Local rendering never moves atlas knowledge');
  assert.deepEqual(errors,[]);
 }finally{await app.close();await rm(profile,{recursive:true,force:true});}
});

test('offline outskirts prototype freezes while loading and supports city-to-hamlet taxi, atlas and a hamlet start', {timeout:120000},async()=>{
 const profile=await mkdtemp(path.join(tmpdir(),'cerea-outskirts-test-'));
 const app=await _electron.launch({args:[path.resolve('.'),'--district=cerea-outskirts',`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let release;const gate=new Promise(resolve=>release=resolve);let blocked=true;
  await page.route('**/tiles/*.json',async route=>{if(blocked)await gate;await route.continue();});
  await page.reload();await page.getByRole('button',{name:'Start the engine'}).click();
  await page.locator('#stream-status').waitFor();assert.match(await page.locator('.map-credit').innerText(),/OpenStreetMap/);
  const clock=await page.locator('#timer').innerText();await page.keyboard.down('w');await page.waitForTimeout(2500);await page.keyboard.up('w');
  assert.equal(await page.locator('#timer').innerText(),clock);assert.equal(Number(await page.locator('#speed').innerText()),0);
  blocked=false;release();await page.waitForFunction(()=>document.querySelector('#stop-state').textContent==='P · LEGAL STOP');
  await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#objective-title').textContent.includes('Test Hamlet'));
  await page.keyboard.press('f');await page.keyboard.press('t');await page.locator('.atlas-map').waitFor();
  assert.match(await page.locator('.atlas-map').innerHTML(),/TEST LINK/);assert.match(await page.locator('.atlas-attribution').innerText(),/OpenStreetMap/);
  const pin=await page.locator('.atlas-pin').getAttribute('transform');await page.keyboard.press('Escape');await page.locator('#overlay').waitFor({state:'hidden'});
  await page.screenshot({path:'test-results/C-prototype-city.png'});assert.equal(await page.evaluate(()=>window.tileLabResult===undefined),true,'Normal gameplay has no lab globals');
  // Separate fixture starts at the terminal, proving its offline assets and return fare.
  await page.route('**/cerea-outskirts/manifest.json',async route=>{
   const {readFile}=await import('node:fs/promises');const data=JSON.parse(await readFile('public/maps/cerea-outskirts/manifest.json','utf8'));
   const bay=data.parkingZones.find(p=>p.id==='test-hamlet');data.spawn={x:bay.x,z:bay.z,heading:0,name:bay.name};data.taxi.fares=[{passenger:'Return tester',pickupId:'test-hamlet',destinationId:'municipio'}];await route.fulfill({json:data});
  });
  await page.reload();await page.getByRole('button',{name:'Start the engine'}).click();await page.waitForFunction(()=>document.querySelector('#stop-state').textContent==='P · LEGAL STOP');
  await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#objective-title').textContent.includes('Municipio'));
  await page.keyboard.press('f');await page.keyboard.press('t');await page.locator('.atlas-map').waitFor();const terminalPin=await page.locator('.atlas-pin').getAttribute('transform');assert.notEqual(terminalPin,pin);
  await page.keyboard.press('Escape');await page.locator('#overlay').waitFor({state:'hidden'});await page.keyboard.down('w');await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>3);await page.keyboard.up('w');
  await page.keyboard.down('Space');await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)===0);await page.keyboard.up('Space');await page.waitForFunction(()=>document.querySelector('#stop-state').textContent.includes('STOP'));
  await page.screenshot({path:'test-results/C-prototype-hamlet.png'});
  await page.keyboard.press('t');await page.locator('.atlas-map').waitFor();assert.equal(await page.locator('.atlas-pin').getAttribute('transform'),terminalPin);
  assert.deepEqual(errors,[]);
 }finally{await app.close();await rm(profile,{recursive:true,force:true});}
});
