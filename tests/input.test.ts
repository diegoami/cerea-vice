import { test } from "node:test";
import assert from "node:assert/strict";
import { Input } from "../src/input/Input";

test("a preview that blocks gamepad access still accepts keyboard input", () => {
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    value: target,
    configurable: true,
  });
  let attempts = 0;
  Object.defineProperty(globalThis, "navigator", {
    value: {
      getGamepads: () => {
        attempts++;
        throw new DOMException(
          "Gamepad access is disallowed by permissions policy",
          "SecurityError",
        );
      },
    },
    configurable: true,
  });
  const input = new Input();
  const key = new Event("keydown");
  Object.defineProperty(key, "code", { value: "KeyW" });
  target.dispatchEvent(key);
  assert.equal(input.poll().throttle, 1);
  assert.equal(input.gamepadBlocked, true);
  assert.equal(input.device, "Keyboard");
  assert.equal(input.poll().throttle, 1);
  assert.equal(attempts, 1, "Do not repeat a denied API call every frame");
});

test("keyboard and standard controller produce the same actions, with edge-triggered interaction and pause", () => {
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    value: target,
    configurable: true,
  });
  let connected = false;
  const buttons = Array.from({ length: 17 }, () => ({
    value: 0,
    pressed: false,
    touched: false,
  }));
  const pad = {
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons,
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { getGamepads: () => [connected ? pad : null] },
    configurable: true,
  });
  const key = (type: string, code: string) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "code", { value: code });
    target.dispatchEvent(event);
  };
  const input = new Input();
  key("keydown", "KeyW");
  key("keydown", "KeyD");
  key("keydown", "KeyF");
  const keyboard = input.poll();
  assert.equal(keyboard.throttle, 1);
  assert.equal(keyboard.steer, 1);
  assert.equal(keyboard.interact, true);
  assert.equal(input.poll().interact, false);
  target.dispatchEvent(new Event("blur"));
  assert.equal(input.poll().throttle, 0);
  connected = true;
  pad.axes[0] = 1;
  pad.axes[1] = -1;
  buttons[7].value = 1;
  buttons[0].value = 1;
  // F also requests information in the atlas; A places a manual estimate there.
  assert.deepEqual(input.poll(), {...keyboard, information: false});
  pad.axes[1] = 0;
  assert.equal(input.device, "Controller");
  assert.match(input.controllerStatus, /Controller connected/);
  assert.equal(input.controllerDisconnected, false);
  assert.equal(input.poll().interact, false);
  buttons[7].value = 0;
  buttons[0].value = 0;
  buttons[6].value = 0.6;
  buttons[2].value = 1;
  buttons[4].value = 1;
  buttons[9].value = 1;
  const brake = input.poll();
  assert.equal(brake.brake, 0.6);
  assert.equal(brake.handbrake, true);
  assert.equal(brake.glance, -1);
  assert.equal(brake.pause, true);
  assert.equal(input.poll().pause, false);
  buttons[4].value = 0;
  buttons[5].value = 1;
  pad.axes[0] = 0.1;
  assert.equal(input.poll().glance, 1);
  assert.equal(input.poll().steer, 0);
  connected = false;
  assert.equal(input.poll().brake, 0);
  assert.equal(input.controllerDisconnected, true);
  input.poll();
  assert.equal(input.controllerDisconnected, false, "Disconnect is reported once");
  assert.equal(input.device, "Keyboard");
  key("keydown", "KeyF");
  key("keyup", "KeyF");
  assert.equal(
    input.poll().interact,
    true,
    "A quick tap survives until the next frame",
  );
  assert.equal(input.poll().interact, false);
  key("keydown", "Tab");
  key("keyup", "Tab");
  assert.equal(input.poll().reminder, true);
  assert.equal(input.poll().reminder, false);
  key("keydown", "KeyM");
  assert.equal(input.poll().reminder, true);
  assert.equal(input.poll().reminder, false);
  key("keyup", "KeyM");
  input.poll();
  connected = true;
  buttons[12].value = 1;
  assert.equal(input.poll().reminder, true);
  assert.equal(input.poll().reminder, false);
  buttons[12].value = 0;
  assert.equal(input.poll().reminder, false);
});

test("atlas controls preserve quick taps and trigger once when held on keyboard and controller", () => {
  const target = new EventTarget();
  const pad = { connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0 })) };
  Object.defineProperty(globalThis, "window", { value: target, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [pad] }, configurable: true });
  const input = new Input();
  const key = (type: string, code: string) => {
    const event = new Event(type);
    Object.defineProperty(event, "code", { value: code });
    target.dispatchEvent(event);
  };
  key("keydown", "KeyT"); key("keyup", "KeyT");
  assert.equal(input.poll().atlas, true);
  assert.equal(input.poll().atlas, false);
  pad.buttons[3].value = 1;
  assert.equal(input.poll().atlas, true);
  assert.equal(input.poll().atlas, false);
  pad.buttons[3].value = 0; input.poll();
  pad.buttons[5].value = 1;
  assert.equal(input.poll().atlasPage, 1);
  assert.equal(input.poll().atlasPage, 0);
  pad.buttons[5].value = 0; input.poll();
  key("keydown", "KeyQ"); key("keyup", "KeyQ");
  assert.equal(input.poll().atlasPage, -1);
  assert.equal(input.poll().atlasPage, 0);
  pad.buttons[1].value = 1;
  assert.equal(input.poll().back, true);
  assert.equal(input.poll().back, false);
  pad.buttons[15].value = 1;
  const right = input.poll();
  assert.equal(right.atlasMoveX, 1);
  assert.equal(right.atlasPage, 0, "D-pad moves the cursor rather than changing pages");
  key("keydown", "Delete"); key("keyup", "Delete");
  assert.equal(input.poll().clearMarker, true);
  assert.equal(input.poll().clearMarker, false);
  target.dispatchEvent(new Event("blur"));
  pad.buttons[1].value = 0;
  key("keydown", "KeyT");
  target.dispatchEvent(new Event("blur"));
  assert.equal(input.poll().atlas, false, "Blur clears a queued atlas request");
});

test('atlas information has its own keyboard/controller edge and cannot place a manual estimate',()=>{
  const target=new EventTarget();
  const pad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0}))};
  Object.defineProperty(globalThis,'window',{value:target,configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[pad]},configurable:true});
  const input=new Input();
  const key=(type:string,code:string)=>{const event=new Event(type);Object.defineProperty(event,'code',{value:code});target.dispatchEvent(event);};
  key('keydown','KeyF');key('keyup','KeyF');
  assert.equal(input.poll().information,true);assert.equal(input.poll().information,false);
  pad.buttons[8].value=1;
  const ask=input.poll();assert.equal(ask.information,true);assert.equal(ask.interact,false);
  assert.equal(input.poll().information,false);
  pad.buttons[8].value=0;input.poll();
  pad.buttons[0].value=1;
  const mark=input.poll();assert.equal(mark.interact,true);assert.equal(mark.information,false);
  key('keydown','KeyF');target.dispatchEvent(new Event('blur'));
  assert.equal(input.poll().information,false);
});

test('right-stick axes and captured mouse movement control view independently of driving and information',()=>{
  const target=new EventTarget();
  const pad={connected:true,mapping:'standard',axes:[0,0,1,-.5],buttons:Array.from({length:17},()=>({value:0}))};
  Object.defineProperty(globalThis,'window',{value:target,configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[pad]},configurable:true});
  const input=new Input();const look=input.poll();
  assert.equal(look.lookX,1);assert.ok(look.lookY<0);assert.equal(look.steer,0);assert.equal(look.throttle,0);
  pad.buttons[11].value=1;const centred=input.poll();assert.equal(centred.resetLook,true);assert.equal(centred.information,false);
  assert.equal(input.poll().resetLook,false);
  const move=()=>{const event=new Event('mousemove');Object.defineProperties(event,{movementX:{value:80},movementY:{value:-20}});target.dispatchEvent(event);};
  move();assert.equal(input.poll().mouseX,0);
  input.setMouseCaptured(true);move();const mouse=input.poll();assert.equal(mouse.mouseX,80);assert.equal(mouse.mouseY,-20);assert.equal(input.poll().mouseX,0);
  move();target.dispatchEvent(new Event('blur'));assert.equal(input.poll().mouseX,0);
});
