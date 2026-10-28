import {readBindings,type Bindings,type ControlAction} from './Bindings';
export interface Actions {
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  glance: number;
  interact: boolean;
  pause: boolean;
  reminder: boolean;
  atlas: boolean;
  back: boolean;
  declineOffer: boolean;
  atlasPage: number;
  atlasMoveX: number;
  atlasMoveY: number;
  clearMarker: boolean;
  information: boolean;
  requestFares: boolean;
  radioNext: boolean;
  refreshFares: boolean;
  shiftGear: boolean;
  lookX: number;
  lookY: number;
  mouseX: number;
  mouseY: number;
  resetLook: boolean;
  atlasZoom: number;
  atlasZoomStep: number;
  atlasPanX: number;
  atlasPanY: number;
}
const blockedKeys = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Enter",
  "Tab",
  "Delete",
  "Backspace",
  "Equal", "Minus", "NumpadAdd", "NumpadSubtract", "Home",
]);
const deadzone = (value: number) =>
  Math.abs(value) < 0.16
    ? 0
    : (Math.sign(value) * (Math.abs(value) - 0.16)) / 0.84;

/** Poll once per rendered frame; consume edge actions once per simulation update. */
export class Input {
  context:'driving'|'atlas'|'menu'='driving';
  currentPad:Gamepad|undefined;
  drivingReleased=true;
  /** Fixed fare-board controls still held from the context that opened it. */
  menuHeld=false;
  // Presentation menu input must retain its source; keyboard Enter always drives.
  settingsInput={move:0,confirm:false,keyboardConfirm:false};
  private previousSettingsConfirm=false;
  private previousKeyboardConfirm=false;
  private queuedAtlasZoomStep = 0;
  private mouseCaptured = false;
  private mouseX = 0;
  private mouseY = 0;
  private previousResetLook = false;
  private queuedResetLook = false;
  private keys = new Set<string>();
  private previousInteract = false;
  private previousPause = false;
  private queuedInteract = false;
  private queuedPause = false;
  private previousReminder = false;
  private queuedReminder = false;
  private queuedAtlas = false;
  private queuedBack = false;
  private queuedAtlasPage = 0;
  private previousAtlas = false;
  private previousBack = false;
  private queuedDeclineOffer = false;
  private previousDeclineOffer = false;
  private previousAtlasPage = 0;
  private previousShiftGear = false;
  private queuedShiftGear = false;
  private previousInformation = false;
  private queuedInformation = false;
  private previousRequestFares = false;
  private queuedRequestFares = false;
  private previousRadioNext = false;
  private queuedRadioNext = false;
  private previousRefreshFares = false;
  private queuedRefreshFares = false;
  private previousClearMarker = false;
  private queuedClearMarker = false;
  device = "Keyboard";
  gamepadBlocked = false;
  controllerDisconnected = false;
  controllerStatus = "Connect a controller and press any button. Keyboard works immediately.";
  private hadController = false;

  constructor(readonly bindings:Bindings=readBindings()) {
    window.addEventListener("keydown", (event) => {
      if (blockedKeys.has(event.code) || (this.context==='driving' && Object.values(this.bindings).some(b=>b.keys.includes(event.code)))) event.preventDefault();
      const matches=(action:ControlAction,fallback:string[])=>this.context==='driving'?this.bindings[action].keys.includes(event.code):fallback.includes(event.code);
      // Preserve quick taps that begin and end between render frames.
      if (!this.keys.has(event.code) && !event.repeat) {
        if (matches("interact",["Enter"]))
          this.queuedInteract = true;
        if (event.code === "Escape" || event.code === "KeyP")
          this.queuedPause = true;
        if (matches("information",["KeyF"])) this.queuedInformation = true;
        if (this.context==='driving'&&this.bindings.requestFares.keys.includes(event.code)) this.queuedRequestFares = true;
        if (this.context==='driving'&&this.bindings.radioNext.keys.includes(event.code)) this.queuedRadioNext = true;
        if (this.context==='menu'&&event.code==='KeyN') this.queuedRefreshFares = true;
        if (matches("shiftGear",["KeyR"])) this.queuedShiftGear = true;
        if (matches("resetLook",["KeyC","Home"])) this.queuedResetLook = true;
        if (event.code === "Equal" || event.code === "NumpadAdd") this.queuedAtlasZoomStep = 1;
        if (event.code === "Minus" || event.code === "NumpadSubtract") this.queuedAtlasZoomStep = -1;
        if (matches("atlas",["KeyT"])) this.queuedAtlas = true;
        if (event.code === "Escape" || (this.context==='menu'&&event.code==='Backspace')) this.queuedBack = true;
        if (this.context==='menu'&&event.code==='Backspace') this.queuedDeclineOffer = true;
        if (event.code === "Delete" || event.code === "Backspace") this.queuedClearMarker = true;
        if (event.code === "KeyQ") this.queuedAtlasPage = -1;
        if (event.code === "KeyE") this.queuedAtlasPage = 1;
        if (matches("reminder",["Tab","KeyM"]))
          this.queuedReminder = true;
      }
      this.keys.add(event.code);
    });
    window.addEventListener("mousemove", (event) => {
      if(this.mouseCaptured) {this.mouseX+=event.movementX;this.mouseY+=event.movementY;}
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.queuedInteract = false;
      this.queuedPause = false;
      this.queuedReminder = false;
      this.queuedAtlas = false;
      this.queuedBack = false;
      this.queuedDeclineOffer = false;
      this.queuedAtlasPage = 0;
      this.queuedClearMarker = false;
      this.queuedInformation = false;
      this.queuedRequestFares = false;
      this.queuedRadioNext = false;
      this.queuedRefreshFares = false;
      this.queuedResetLook = false;
      this.queuedShiftGear = false;
      this.queuedAtlasZoomStep = 0;
      this.setMouseCaptured(false);
    });
  }

  setMouseCaptured(captured: boolean) {
    this.mouseCaptured=captured;
    this.mouseX=0;this.mouseY=0;
  }

  poll(): Actions {
    const down = (...codes: string[]) =>
      codes.some((code) => this.keys.has(code));
    let pads: (Gamepad | null)[] = [];
    if (!this.gamepadBlocked) {
      try {
        pads = Array.from(navigator.getGamepads?.() ?? []);
      } catch {
        // Embedded previews may forbid gamepad access via Permissions Policy.
        // Keep keyboard input and the render loop working in that context.
        this.gamepadBlocked = true;
      }
    }
    // Nonstandard mappings differ by browser/device. Only the W3C standard layout is promised.
    const pad = Array.from(pads).find(
      (p) => p?.connected && p.mapping === "standard",
    );
    this.currentPad=pad??undefined;
    this.controllerDisconnected = this.hadController && !pad;
    this.hadController = Boolean(pad);
    this.controllerStatus = pad
      ? "Controller connected · Left stick: steer · RT: accelerate · A / Cross: confirm · View / Select: information."
      : this.gamepadBlocked
        ? "Controller access restricted. Open in a new browser tab or use the desktop app."
        : pads.some((p) => p?.connected)
          ? "Controller detected with an unsupported mapping. Use a standard controller or keyboard."
          : "Connect a controller and press any button. Keyboard works immediately.";
    const button = (index: number) => pad?.buttons[index]?.value ?? 0;
    this.device = pad ? "Controller" : "Keyboard";
    const controllerConfirm=button(0)>.5;
    this.settingsInput={
      move:Number(button(13)>.5)-Number(button(12)>.5)||deadzone(pad?.axes[1]??0),
      confirm:controllerConfirm&&!this.previousSettingsConfirm,
      keyboardConfirm:this.queuedInteract||(down("Enter")&&!this.previousKeyboardConfirm),
    };
    this.previousSettingsConfirm=controllerConfirm;
    this.previousKeyboardConfirm=down("Enter");
    const boundDown=(action:ControlAction)=>down(...this.bindings[action].keys);
    const boundButton=(action:ControlAction)=>this.bindings[action].button===null?0:button(this.bindings[action].button!);
    this.drivingReleased=!Object.entries(this.bindings).some(([action,b])=>b.keys.some(k=>this.keys.has(k))||boundButton(action as ControlAction)>.1);
    const active=(action:ControlAction,keys:string[],index:number)=>this.context==='driving'?(boundDown(action)||boundButton(action)>.5):(down(...keys)||button(index)>.5);
    const interact = active('interact',["Enter"],0);
    const pause = down("Escape", "KeyP") || button(9) > 0.5;
    const reminder = active('reminder',['Tab','KeyM'],12);
    const atlas = active('atlas',['KeyT'],3);
    const back = down('Escape') || (this.context==='menu'&&down('Backspace')) || button(1) > 0.5;
    const declineOffer = down('Backspace')||button(1)>.5;
    const atlasPage = Number(down("KeyE") || button(5) > 0.5)
      - Number(down("KeyQ") || button(4) > 0.5);
    const information = active('information',['KeyF'],8);
    // Raw states ignore context, so a press held while a screen changes is never a new edge.
    const requestFares = boundDown('requestFares')||boundButton('requestFares')>.5;
    const radioNext = boundDown('radioNext')||boundButton('radioNext')>.5;
    const refreshFares = down('KeyN')||button(3)>.5;
    this.menuHeld=down('Enter','Backspace','KeyN','ArrowUp','ArrowDown','KeyW','KeyS')||[0,1,3,12,13].some(i=>button(i)>.5)||Math.abs(pad?.axes[1]??0)>.5;
    const shiftGear = active('shiftGear',['KeyR'],1);
    const resetLook = active('resetLook',['KeyC','Home'],11);
    const clearMarker = down("Delete", "Backspace") || button(2) > 0.5;
    const keyboardSteer =
      Number(down("KeyD", "ArrowRight")) - Number(down("KeyA", "ArrowLeft"));
    const actions: Actions = {
      steer: (this.context==='driving'?Number(boundDown('steerRight'))-Number(boundDown('steerLeft')):keyboardSteer) || deadzone(pad?.axes[0] ?? 0),
      throttle: this.context==='driving'?Math.max(Number(boundDown('throttle')),boundButton('throttle')):Math.max(Number(down('KeyW','ArrowUp')),button(7)),
      brake: this.context==='driving'?Math.max(Number(boundDown('brake')),boundButton('brake')):Math.max(Number(down('KeyS','ArrowDown')),button(6)),
      handbrake: active('handbrake',['Space'],2),
      glance: Number(active('glanceRight',['KeyE'],5))-Number(active('glanceLeft',['KeyQ'],4)),
      interact: this.queuedInteract || (interact && !this.previousInteract),
      pause: this.queuedPause || (pause && !this.previousPause),
      reminder: this.queuedReminder || (reminder && !this.previousReminder),
      atlas: this.queuedAtlas || (atlas && !this.previousAtlas),
      back: this.queuedBack || (back && !this.previousBack),
      declineOffer: this.context==='menu'&&(this.queuedDeclineOffer || (declineOffer && !this.previousDeclineOffer)),
      atlasPage: this.queuedAtlasPage || (atlasPage !== this.previousAtlasPage ? atlasPage : 0),
      atlasMoveX: keyboardSteer || (Number(button(15) > 0.5) - Number(button(14) > 0.5)) || deadzone(pad?.axes[0] ?? 0),
      atlasMoveY: (Number(down("KeyS", "ArrowDown")) - Number(down("KeyW", "ArrowUp")))
        || (Number(button(13) > 0.5) - Number(button(12) > 0.5)) || deadzone(pad?.axes[1] ?? 0),
      clearMarker: this.queuedClearMarker || (clearMarker && !this.previousClearMarker),
      information: this.queuedInformation || (information && !this.previousInformation),
      requestFares: this.context==='driving'&&(this.queuedRequestFares || (requestFares && !this.previousRequestFares)),
      radioNext: this.context==='driving'&&(this.queuedRadioNext || (radioNext && !this.previousRadioNext)),
      refreshFares: this.context==='menu'&&(this.queuedRefreshFares || (refreshFares && !this.previousRefreshFares)),
      shiftGear: this.queuedShiftGear || (shiftGear && !this.previousShiftGear),
      lookX: deadzone(pad?.axes[2] ?? 0),
      lookY: deadzone(pad?.axes[3] ?? 0),
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      resetLook: this.queuedResetLook || (resetLook && !this.previousResetLook),
      atlasZoom: button(7)-button(6),
      atlasZoomStep: this.queuedAtlasZoomStep,
      atlasPanX: Number(down("KeyL"))-Number(down("KeyJ")) || deadzone(pad?.axes[2]??0),
      atlasPanY: Number(down("KeyK"))-Number(down("KeyI")) || deadzone(pad?.axes[3]??0),
    };
    this.queuedAtlasZoomStep=0;
    this.mouseX=0;this.mouseY=0;
    this.previousResetLook=resetLook;
    this.queuedResetLook=false;
    this.previousShiftGear=shiftGear;
    this.queuedShiftGear=false;
    this.previousInformation = information;
    this.queuedInformation = false;
    this.previousRequestFares = requestFares;
    this.queuedRequestFares = false;
    this.previousRadioNext = radioNext;
    this.queuedRadioNext = false;
    this.previousRefreshFares = refreshFares;
    this.queuedRefreshFares = false;
    this.previousClearMarker = clearMarker;
    this.queuedClearMarker = false;
    this.previousAtlas = atlas;
    this.previousBack = back;
    this.previousDeclineOffer=declineOffer;
    this.queuedDeclineOffer=false;
    this.previousAtlasPage = atlasPage;
    this.queuedAtlas = false;
    this.queuedBack = false;
    this.queuedAtlasPage = 0;
    this.previousInteract = interact;
    this.previousPause = pause;
    this.queuedInteract = false;
    this.queuedPause = false;
    this.previousReminder = reminder;
    this.queuedReminder = false;
    return actions;
  }
}
