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
  atlasPage: number;
  atlasMoveX: number;
  atlasMoveY: number;
  clearMarker: boolean;
  information: boolean;
  lookX: number;
  lookY: number;
  mouseX: number;
  mouseY: number;
  resetLook: boolean;
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
]);
const deadzone = (value: number) =>
  Math.abs(value) < 0.16
    ? 0
    : (Math.sign(value) * (Math.abs(value) - 0.16)) / 0.84;

/** Poll once per rendered frame; consume edge actions once per simulation update. */
export class Input {
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
  private previousAtlasPage = 0;
  private previousInformation = false;
  private queuedInformation = false;
  private previousClearMarker = false;
  private queuedClearMarker = false;
  device = "Keyboard";
  gamepadBlocked = false;
  controllerDisconnected = false;
  controllerStatus = "Connect a controller and press any button. Keyboard works immediately.";
  private hadController = false;

  constructor() {
    window.addEventListener("keydown", (event) => {
      if (blockedKeys.has(event.code)) event.preventDefault();
      // Preserve quick taps that begin and end between render frames.
      if (!this.keys.has(event.code) && !event.repeat) {
        if (event.code === "KeyF" || event.code === "Enter")
          this.queuedInteract = true;
        if (event.code === "Escape" || event.code === "KeyP")
          this.queuedPause = true;
        if (event.code === "KeyF") this.queuedInformation = true;
        if (event.code === "KeyC") this.queuedResetLook = true;
        if (event.code === "KeyT") this.queuedAtlas = true;
        if (event.code === "Escape") this.queuedBack = true;
        if (event.code === "Delete" || event.code === "Backspace") this.queuedClearMarker = true;
        if (event.code === "KeyQ") this.queuedAtlasPage = -1;
        if (event.code === "KeyE") this.queuedAtlasPage = 1;
        if (event.code === "Tab" || event.code === "KeyM")
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
      this.queuedAtlasPage = 0;
      this.queuedClearMarker = false;
      this.queuedInformation = false;
      this.queuedResetLook = false;
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
    this.controllerDisconnected = this.hadController && !pad;
    this.hadController = Boolean(pad);
    this.controllerStatus = pad
      ? "Controller connected · Left stick: steer · RT: accelerate · A / Cross: start or ask."
      : this.gamepadBlocked
        ? "Controller access restricted. Open in a new browser tab or use the desktop app."
        : pads.some((p) => p?.connected)
          ? "Controller detected with an unsupported mapping. Use a standard controller or keyboard."
          : "Connect a controller and press any button. Keyboard works immediately.";
    const button = (index: number) => pad?.buttons[index]?.value ?? 0;
    this.device = pad ? "Controller" : "Keyboard";
    const interact = down("KeyF", "Enter") || button(0) > 0.5;
    const pause = down("Escape", "KeyP") || button(9) > 0.5;
    const reminder = down("Tab", "KeyM") || button(12) > 0.5;
    const atlas = down("KeyT") || button(3) > 0.5;
    const back = down("Escape") || button(1) > 0.5;
    const atlasPage = Number(down("KeyE") || button(5) > 0.5)
      - Number(down("KeyQ") || button(4) > 0.5);
    const information = down("KeyF") || button(8) > 0.5;
    const resetLook = down("KeyC") || button(11) > 0.5;
    const clearMarker = down("Delete", "Backspace") || button(2) > 0.5;
    const keyboardSteer =
      Number(down("KeyD", "ArrowRight")) - Number(down("KeyA", "ArrowLeft"));
    const actions: Actions = {
      steer: keyboardSteer || deadzone(pad?.axes[0] ?? 0),
      throttle: Math.max(Number(down("KeyW", "ArrowUp")), button(7)),
      brake: Math.max(Number(down("KeyS", "ArrowDown")), button(6)),
      handbrake: down("Space") || button(2) > 0.5,
      glance:
        Number(down("KeyE") || button(5) > 0.5) -
        Number(down("KeyQ") || button(4) > 0.5),
      interact: this.queuedInteract || (interact && !this.previousInteract),
      pause: this.queuedPause || (pause && !this.previousPause),
      reminder: this.queuedReminder || (reminder && !this.previousReminder),
      atlas: this.queuedAtlas || (atlas && !this.previousAtlas),
      back: this.queuedBack || (back && !this.previousBack),
      atlasPage: this.queuedAtlasPage || (atlasPage !== this.previousAtlasPage ? atlasPage : 0),
      atlasMoveX: keyboardSteer || (Number(button(15) > 0.5) - Number(button(14) > 0.5)) || deadzone(pad?.axes[0] ?? 0),
      atlasMoveY: (Number(down("KeyS", "ArrowDown")) - Number(down("KeyW", "ArrowUp")))
        || (Number(button(13) > 0.5) - Number(button(12) > 0.5)) || deadzone(pad?.axes[1] ?? 0),
      clearMarker: this.queuedClearMarker || (clearMarker && !this.previousClearMarker),
      information: this.queuedInformation || (information && !this.previousInformation),
      lookX: deadzone(pad?.axes[2] ?? 0),
      lookY: deadzone(pad?.axes[3] ?? 0),
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      resetLook: this.queuedResetLook || (resetLook && !this.previousResetLook),
    };
    this.mouseX=0;this.mouseY=0;
    this.previousResetLook=resetLook;
    this.queuedResetLook=false;
    this.previousInformation = information;
    this.queuedInformation = false;
    this.previousClearMarker = clearMarker;
    this.queuedClearMarker = false;
    this.previousAtlas = atlas;
    this.previousBack = back;
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
