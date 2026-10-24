export interface Actions {
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  glance: number;
  interact: boolean;
  pause: boolean;
  reminder: boolean;
}
const blockedKeys = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Enter",
  "Tab",
]);
const deadzone = (value: number) =>
  Math.abs(value) < 0.16
    ? 0
    : (Math.sign(value) * (Math.abs(value) - 0.16)) / 0.84;

/** Poll once per rendered frame; consume edge actions once per simulation update. */
export class Input {
  private keys = new Set<string>();
  private previousInteract = false;
  private previousPause = false;
  private queuedInteract = false;
  private queuedPause = false;
  private previousReminder = false;
  private queuedReminder = false;
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
        if (event.code === "Tab" || event.code === "KeyM")
          this.queuedReminder = true;
      }
      this.keys.add(event.code);
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.queuedInteract = false;
      this.queuedPause = false;
      this.queuedReminder = false;
    });
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
    };
    this.previousInteract = interact;
    this.previousPause = pause;
    this.queuedInteract = false;
    this.queuedPause = false;
    this.previousReminder = reminder;
    this.queuedReminder = false;
    return actions;
  }
}
