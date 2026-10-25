import { AtlasNotes } from "../navigation/AtlasNotes";
import { atlasReference, atlasMarkup, type AtlasPage } from "./Atlas";
import type { Car } from "../driving/Car";
import type { Mission } from "../mission/Mission";
import type { Parking } from "../navigation/Parking";
import { selectDistrict, availableDistricts } from "../world/load";
import { district, areaAt, type Point } from "../world/district";
import { bearing, compass, nearestRoad } from "../navigation/Navigation";

export type Screen = "briefing" | "running" | "paused" | "result" | "atlas";
export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

export class Hud {
  private overlay: HTMLElement;
  private atlasPage: AtlasPage = "map";
  private readonly atlasNotes = new AtlasNotes();
  private currentScreen: Screen | undefined;
  private speed: HTMLElement;
  private compassTrack: HTMLElement;
  private compassValue: HTMLElement;
  private timer: HTMLElement;
  private stopState: HTMLElement;
  private location: HTMLElement;
  private prompt: HTMLElement;
  private wheel: HTMLElement;
  private device: HTMLElement;
  private hint: HTMLElement;
  private hintLabel: HTMLElement;

  constructor(root: HTMLElement, onAction: () => void) {
    const ui = document.createElement("div");
    ui.id = "hud";
    ui.innerHTML = `
      <div class="vignette" aria-hidden="true"></div>
      <header class="topbar">
        <div class="district-tag"><span class="live-dot"></span> ${district.name.toUpperCase()} <small>${district.id === "cerea" ? "REAL STREETS / MODERN MAP" : "FICTIONAL PROTOTYPE"}</small></div>
        <div class="compass-panel" aria-label="Compass">
          <div class="compass-window"><div class="compass-track">${Array.from({ length: 3 }, () => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((s) => `<span>${s}</span>`).join("")).join("")}</div></div>
          <div class="compass-notch"></div><strong id="heading">E · 090°</strong>
        </div>
        <div class="deadline"><span>TIME TO ARRIVE</span><strong id="timer">03:00</strong></div>
      </header>
      <section class="objective"><span class="eyebrow">01 / THE DRIVE</span><h2>Find ${district.mission.name}</h2><p>${district.mission.objective}</p></section>
      <div class="windshield-frame" aria-hidden="true"></div>
      <div class="navigation-message"><div class="hint-header"><span class="live-dot"></span><span id="hint-label">LOCAL DIRECTIONS</span><span>NO SIGNAL REQUIRED</span></div><p id="hint" role="status">${district.mission.hint}</p></div>
      <div class="interaction" id="prompt"></div>
      <footer class="dashboard">
        <div class="dashboard-left"><div class="speed-line"><strong id="speed">00</strong><span>KM/H<br><b id="gear">N</b></span></div><div class="stop-state" id="stop-state">SETTLING</div></div>
        <div class="dashboard-center"><div class="wheel" aria-hidden="true"><div class="wheel-spoke"></div><div class="wheel-hub">CV</div></div><span class="car-label">CEREA / 1986</span></div>
        <div class="dashboard-right"><span class="eyebrow">CURRENT ROAD</span><strong id="location">Harbor Road</strong><div class="dash-detail"><span id="device">Keyboard</span><span>ESC / START &nbsp; PAUSE</span></div></div>
      </footer>
      ${district.id === "cerea" ? `<div class="map-credit">${district.attribution} · openstreetmap.org/copyright</div>` : ""}
      <div id="overlay" class="overlay"></div>
    `;
    root.append(ui);
    const find = (id: string) => ui.querySelector<HTMLElement>(id)!;
    this.overlay = find("#overlay");
    this.speed = find("#speed");
    this.compassTrack = find(".compass-track");
    this.compassValue = find("#heading");
    this.timer = find("#timer");
    this.stopState = find("#stop-state");
    this.location = find("#location");
    this.prompt = find("#prompt");
    this.wheel = find(".wheel");
    this.device = find("#device");
    this.hint = find("#hint");
    this.hintLabel = find("#hint-label");
    this.overlay.addEventListener("click", (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!button) {
        const map = (e.target as Element).closest<SVGSVGElement>(".atlas-map");
        if (!map || this.currentScreen !== "atlas") return;
        const matrix = map.getScreenCTM();
        if (!matrix) return;
        const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
        if (Math.abs(point.x) > 120 || Math.abs(point.y) > 120) return;
        this.atlasNotes.pointAt({ x: point.x, z: point.y });
        this.placeAtlasMarker();
        return;
      }
      if (button.dataset.district) {
        selectDistrict(button.dataset.district);
      } else if (button.dataset.atlasPage) {
        this.setAtlasPage(button.dataset.atlasPage as AtlasPage);
      } else if (button.hasAttribute("data-atlas-place")) this.placeAtlasMarker();
      else if (button.hasAttribute("data-atlas-remove")) this.removeAtlasMarker();
      else onAction();
    });
  }

  private setAtlasPage(page: AtlasPage) {
    if (this.currentScreen !== "atlas" || this.atlasPage === page) return;
    this.atlasPage = page;
    this.overlay.innerHTML = atlasMarkup(page);
    this.updateAtlasNotes();
    this.overlay.querySelector<HTMLButtonElement>(`[data-atlas-page="${page}"]`)?.focus();
  }

  private updateAtlasNotes() {
    const { cursor, marker } = this.atlasNotes;
    this.overlay.querySelector(".atlas-cursor")?.setAttribute("transform", `translate(${cursor.x} ${cursor.z})`);
    const pin = this.overlay.querySelector<SVGGElement>(".atlas-pin");
    if (pin) {
      pin.style.display = marker ? "" : "none";
      if (marker) pin.setAttribute("transform", `translate(${marker.x} ${marker.z})`);
    }
    const status = this.overlay.querySelector("#atlas-marker-status");
    if (status) {
      const text = !marker ? "No position marked." : this.atlasNotes.source === "estimate"
        ? `Your estimated position · ${atlasReference(marker)}`
        : `${this.atlasNotes.source === "confirmed" ? "Last information received" : "Starting position"}: ${this.atlasNotes.label} · ${atlasReference(marker)}`;
      if (status.textContent !== text) status.textContent = text;
    }
    const mapPage = this.atlasPage === "map";
    const placeButton = this.overlay.querySelector<HTMLButtonElement>("[data-atlas-place]");
    const removeButton = this.overlay.querySelector<HTMLButtonElement>("[data-atlas-remove]");
    if (placeButton) placeButton.disabled = !mapPage;
    if (removeButton) removeButton.disabled = !marker;
  }

  resetAtlasNotes() {
    this.atlasNotes.reset();
  }

  confirmAtlasPosition(position: Point, parkingName?: string) {
    const label = parkingName ?? `${nearestRoad(position).edge.name}, ${areaAt(position)}`;
    this.atlasNotes.confirm(position, label);
  }

  moveAtlasCursor(dt: number, x: number, z: number) {
    if (this.currentScreen === "atlas" && this.atlasPage === "map" && this.atlasNotes.move(dt, x, z)) this.updateAtlasNotes();
  }

  placeAtlasMarker() {
    if (this.currentScreen !== "atlas" || this.atlasPage !== "map") return;
    this.atlasNotes.place();
    this.updateAtlasNotes();
  }

  removeAtlasMarker() {
    if (this.currentScreen !== "atlas") return;
    this.atlasNotes.remove();
    this.updateAtlasNotes();
  }

  turnAtlasPage(direction: number) {
    this.setAtlasPage(direction < 0 ? "map" : "index");
  }

  setHint(message: string) {
    this.hintLabel.textContent = "LOCAL DIRECTIONS";
    this.hint.textContent = message;
  }

  remindMission(mission: Mission) {
    this.hintLabel.textContent = "MISSION REMINDER";
    this.hint.textContent = `${mission.objective} ${mission.remaining > 0 ? `Time remaining: ${formatTime(mission.remaining)}.` : "The deadline has passed; finish the drive for a late-arrival result."}`;
  }

  show(screen: Screen, mission: Mission, car: Car, parking: Parking) {
    if (screen === this.currentScreen) return;
    this.currentScreen = screen;
    this.overlay.classList.toggle("atlas-open", screen === "atlas");
    this.overlay.hidden = screen === "running";
    if (screen === "running") return;
    if (screen === "atlas") {
      this.atlasPage = "map";
      this.overlay.innerHTML = atlasMarkup(this.atlasPage);
      this.updateAtlasNotes();
      this.overlay.querySelector<HTMLButtonElement>("[data-atlas-close]")?.focus();
      return;
    }
    const controls = `<div class="control-table">
      <div class="control-heading"><span>ACTION</span><span>CONTROLLER</span><span>KEYBOARD</span></div>
      <div><span>Steer</span><b>Left stick</b><b>A D / ← →</b></div>
      <div><span>Accelerate</span><b>RT</b><b>W / ↑</b></div>
      <div><span>Brake / reverse</span><b>LT</b><b>S / ↓</b></div>
      <div><span>Handbrake</span><b>X / Square</b><b>Space</b></div>
      <div><span>Glance</span><b>LB / RB</b><b>Q / E</b></div>
      <div><span>Ask for directions</span><b>A / Cross</b><b>F / Enter</b></div>
      <div><span>Atlas (while stopped)</span><b>Y / Triangle</b><b>T</b></div>
      <div><span>Mission reminder</span><b>D-pad up</b><b>Tab / M</b></div>
      <div><span>Pause</span><b>Start</b><b>Esc / P</b></div>
    </div>`;
    if (screen === "briefing") {
      this.overlay.innerHTML = `<section class="briefing modal" aria-labelledby="screen-title">
        <div class="briefing-main"><span class="eyebrow accent">CEREA VICE &nbsp; / &nbsp; A DRIVING EXPERIMENT</span>
          <h1 id="screen-title">A place.<br>A deadline.<br><em>Your own way.</em></h1>
          <p class="intro">No familiar streets. Just a compass, a few signs, and the road ahead.</p>
          <button type="button">Start the engine <span aria-hidden="true">&gt;</span></button><span class="button-note">A / ENTER TO BEGIN · ${Math.round(district.mission.duration/60)} MINUTE DRIVE</span>
        </div>
        <div class="briefing-side"><span class="eyebrow">${district.name.toUpperCase()}</span><h2>Find ${district.mission.name}.</h2><p>${district.mission.hint}</p><div class="district-switch" aria-label="Choose district">${availableDistricts.map((map)=>`<button type="button" data-district="${map.id}" aria-pressed="${map.id===district.id}">${map.name}</button>`).join("")}</div><small class="controller-note">LB / RB or Q / E: change district before starting.</small><small class="controller-note">${district.attribution}</small>
          <div class="briefing-tip"><b>Lost? Pull over.</b><p>Come to a full stop anywhere. Press Y / T for the atlas, or A / F for a local direction hint. Marked P bays are legal stopping places.</p></div>
          ${controls}<small class="controller-note" id="controller-status" role="status"></small>
        </div>
      </section>`;
    } else if (screen === "paused") {
      this.overlay.innerHTML = `<section class="pause modal" aria-labelledby="screen-title"><span class="eyebrow accent">ENGINE IDLING / TIMER PAUSED</span><h1 id="screen-title">Take a breather.</h1><p>The district will be here when you’re ready.</p>${controls}<small class="controller-note" id="controller-status" role="status"></small><button type="button">Back to the road <span aria-hidden="true">&gt;</span></button><span class="button-note">A / ENTER / START TO RESUME</span></section>`;
    } else {
      const success = mission.state === "success";
      this.overlay.innerHTML = `<section class="result modal" aria-labelledby="screen-title">
        <span class="eyebrow accent">DRIVE COMPLETE / ${district.mission.name.toUpperCase()}</span>
        <h1 id="screen-title">${success ? "Found your way." : "A little behind."}</h1>
        <p>${success ? "You reached the destination before the deadline." : "You arrived after the deadline. The way here is a little more familiar now."}</p>
        <div class="result-stats">
          <div><strong>${formatTime(mission.elapsed)}</strong><span>DRIVING TIME</span></div>
          <div><strong>${parking.unsafeStops}</strong><span>UNSAFE STOPS</span></div>
          <div><strong>${car.collisions}</strong><span>COLLISIONS</span></div>
          <div><strong>${mission.directionRequestCount}</strong><span>DIRECTION REQUESTS</span></div>
          <div><strong>${mission.directionRequests.legal}</strong><span>LEGAL REQUESTS</span></div>
          <div><strong>${mission.directionRequests.unsafe}</strong><span>UNSAFE REQUESTS</span></div>
        </div>
        <p class="result-footnote">Same district. Same destination. Try a different way.</p>
        <button type="button">Take another drive <span aria-hidden="true">&gt;</span></button>
        <span class="button-note">A / ENTER TO RESTART</span>
      </section>`;
    }
  }

  update(
    car: Car,
    mission: Mission,
    parking: Parking,
    device: string,
    gamepadBlocked = false,
    controllerStatus = "",
  ) {
    const controllerNote = this.overlay.querySelector("#controller-status");
    if (controllerNote && controllerNote.textContent !== controllerStatus) controllerNote.textContent = controllerStatus;
    const degrees = bearing(car.heading);
    this.compassTrack.style.transform = `translateX(${-416 - (degrees / 45) * 52 - 26}px)`;
    this.compassValue.textContent = `${compass(car.heading)} · ${Math.round(degrees).toString().padStart(3, "0")}°`;
    this.speed.textContent = Math.round(Math.abs(car.speed) * 3.6)
      .toString()
      .padStart(2, "0");
    document.querySelector("#gear")!.textContent =
      car.speed < -0.1 ? "R" : car.speed > 0.1 ? "D" : "N";
    this.timer.textContent =
      mission.state === "overdue" || mission.state === "late"
        ? "LATE"
        : formatTime(mission.remaining);
    this.timer.classList.toggle("urgent", mission.remaining < 30);
    this.stopState.textContent = parking.stopped
      ? parking.zone
        ? "P · LEGAL STOP"
        : "STOPPED · UNSAFE"
      : car.speed === 0
        ? "SETTLING"
        : "ON THE MOVE";
    this.stopState.classList.toggle("unsafe", parking.stopped && !parking.zone);
    this.location.textContent = nearestRoad(car).edge.name;
    this.device.textContent =
      device === "Controller"
        ? "● Controller connected"
        : gamepadBlocked
          ? "Keyboard · controller restricted"
          : "Keyboard controls";
    this.device.title = gamepadBlocked
      ? "Open the preview in a new browser tab to use a controller."
      : "";
    this.wheel.style.transform = `rotate(${car.steering * 65}deg)`;
    this.prompt.innerHTML = parking.stopped
      ? `<kbd>${device === "Controller" ? "A" : "F"}</kbd> Ask for directions &nbsp; <kbd>${device === "Controller" ? "Y" : "T"}</kbd> Atlas <span>· ${parking.zone ?? "unsafe stopping place"}</span>`
      : "Stop fully for the atlas or directions";
  }
}
