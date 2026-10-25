import { AtlasView } from "../navigation/AtlasView";
import { AtlasNotes } from "../navigation/AtlasNotes";
import { atlasFrame, atlasStreetEntries, atlasReference, atlasMarkup, type AtlasPage } from "./Atlas";
import type { Car } from "../driving/Car";
import type { Mission } from "../mission/Mission";
import type { Parking } from "../navigation/Parking";
import { selectDistrict, availableDistricts } from "../world/load";
import { district, areaAt, type Point } from "../world/district";
import { bearing, compass, nearestRoad } from "../navigation/Navigation";

export type Screen = "briefing" | "running" | "paused" | "result" | "atlas";
export const formatMoney=(cents:number)=>`€${(cents/100).toFixed(2)}`;
export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

export class Hud {
  private overlay: HTMLElement;
  private atlasInformation = "";
  private readonly atlasView = new AtlasView();
  private selectedStreet = "";
  private indexStreet = -1;
  private indexSelectDelay = 0;
  private indexSelectDirection = 0;
  private atlasDrag?:{id:number;startX:number;startY:number;lastX:number;lastY:number;moved:boolean};
  private suppressAtlasClick = false;
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

  constructor(root: HTMLElement, onAction: () => void, onInformation: () => void) {
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
      <section class="objective"><span class="eyebrow" id="objective-stage">01 / THE DRIVE</span><h2 id="objective-title">Find ${district.mission.name}</h2><p id="objective-description">${district.mission.objective}</p><div id="taxi-status" hidden></div></section>
      <div class="windshield-frame" aria-hidden="true"></div>
      <div class="navigation-message"><div class="hint-header"><span class="live-dot"></span><span id="hint-label">LOCAL DIRECTIONS</span><span>NO SIGNAL REQUIRED</span></div><p id="hint" role="status">${district.mission.hint}</p></div>
      <div class="interaction" id="prompt"></div>
      <footer class="dashboard">
        <div class="dashboard-left"><div class="speed-line"><strong id="speed">00</strong><span>KM/H<br><b id="gear">D</b></span></div><div class="stop-state" id="stop-state">SETTLING</div></div>
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
        if(this.suppressAtlasClick){this.suppressAtlasClick=false;return;}
        const map = (e.target as Element).closest<SVGSVGElement>(".atlas-map");
        if (!map || this.currentScreen !== "atlas") return;
        const matrix = map.getScreenCTM();
        if (!matrix) return;
        const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
        const frame=atlasFrame();
        if (point.x < frame.minX || point.x > frame.minX+frame.span || point.y < frame.minZ || point.y > frame.minZ+frame.span) return;
        this.atlasNotes.pointAt({ x: point.x, z: point.y });
        this.placeAtlasMarker();
        return;
      }
      if(button.dataset.atlasZoom) {this.zoomAtlas(Math.pow(1.5,Number(button.dataset.atlasZoom)));return;}
      if(button.hasAttribute("data-atlas-overview")){this.resetAtlasView();return;}
      if(button.dataset.atlasStreet){this.focusAtlasStreet(button.dataset.atlasStreet);return;}
      if (button.dataset.district) {
        selectDistrict(button.dataset.district);
      } else if (button.dataset.atlasPage) {
        this.setAtlasPage(button.dataset.atlasPage as AtlasPage);
      } else if (button.hasAttribute("data-atlas-place")) this.placeAtlasMarker();
      else if (button.hasAttribute("data-atlas-remove")) this.removeAtlasMarker();
      else if (button.hasAttribute("data-atlas-information")) onInformation();
      else onAction();
    });
    this.overlay.addEventListener("wheel",event=>{
      const map=(event.target as Element).closest<SVGSVGElement>(".atlas-map");
      if(this.currentScreen!=="atlas"||!map)return;
      event.preventDefault();
      const point=this.mapPoint(map,event.clientX,event.clientY);
      if(point)this.zoomAtlas(Math.exp(-event.deltaY*(event.deltaMode===1?16:1)*.0015),point);
    },{passive:false});
    this.overlay.addEventListener("pointerdown",event=>{
      const map=(event.target as Element).closest<SVGSVGElement>(".atlas-map");
      if(this.currentScreen!=="atlas"||!map||event.button!==0)return;
      this.suppressAtlasClick=false;
      this.atlasDrag={id:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false};
      map.setPointerCapture(event.pointerId);
    });
    this.overlay.addEventListener("pointermove",event=>{
      const drag=this.atlasDrag,map=this.overlay.querySelector<SVGSVGElement>(".atlas-map");
      if(!drag||!map||event.pointerId!==drag.id)return;
      if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)drag.moved=true;
      if(drag.moved){
        const before=this.mapPoint(map,drag.lastX,drag.lastY),after=this.mapPoint(map,event.clientX,event.clientY);
        if(before&&after){this.atlasView.pan(before.x-after.x,before.z-after.z);this.updateAtlasView();}
      }
      drag.lastX=event.clientX;drag.lastY=event.clientY;
    });
    this.overlay.addEventListener("pointerup",event=>{
      if(this.atlasDrag?.id===event.pointerId){this.suppressAtlasClick=this.atlasDrag.moved;this.atlasDrag=undefined;}
    });
    this.overlay.addEventListener("pointercancel",()=>{this.atlasDrag=undefined;this.suppressAtlasClick=false;});
    window.addEventListener("resize",()=>this.updateAtlasView());
  }

  private mapPoint(map:SVGSVGElement,x:number,y:number) {
    const matrix=map.getScreenCTM();if(!matrix)return;
    const p=new DOMPoint(x,y).matrixTransform(matrix.inverse());return {x:p.x,z:p.y};
  }

  private updateAtlasView() {
    if(this.currentScreen!=="atlas"||this.atlasPage!=="map")return;
    const map=this.overlay.querySelector<SVGSVGElement>(".atlas-map");if(!map)return;
    const box=this.atlasView.box;
    const oldCursor=this.atlasNotes.cursor;
    if(oldCursor.x<box.x||oldCursor.x>box.x+box.width||oldCursor.z<box.z||oldCursor.z>box.z+box.height)this.atlasNotes.pointAt(this.atlasView.centre);
    map.setAttribute("viewBox",`${box.x} ${box.z} ${box.width} ${box.height}`);
    const scale=map.getScreenCTM()?.a??1;if(!(scale>0))return;
    const pixels=Math.min(16,8+4*(this.atlasView.zoom-1));
    for(const label of map.querySelectorAll<SVGTextElement>("[data-street]")){
      const selected=label.dataset.street===this.selectedStreet;
      label.style.fontSize=`${(selected?pixels+2:pixels)/scale}px`;
      label.style.paintOrder="stroke";label.style.stroke="#f8f1dd";label.style.strokeWidth=`${3/scale}px`;
      label.style.fill=selected?"#8f342c":"#29443f";
    }
    for(const label of map.querySelectorAll<SVGTextElement>('[data-map-label="place"]')){label.style.fontSize=`${(pixels+1)/scale}px`;label.style.strokeWidth=`${2/scale}px`;}
    for(const label of map.querySelectorAll<SVGTextElement>('[data-map-label="parking"]'))label.style.fontSize=`${(pixels+2)/scale}px`;
    const pin=map.querySelector<SVGGElement>(".atlas-pin"),cursor=map.querySelector<SVGGElement>(".atlas-cursor");
    pin?.querySelector('circle')?.setAttribute('r',`${5/scale}`);
    pin?.querySelector('path')?.setAttribute('d',`M ${-3/scale} ${-3/scale} L ${3/scale} ${3/scale} M ${-3/scale} ${3/scale} L ${3/scale} ${-3/scale}`);
    if(pin)pin.style.strokeWidth=`${1.2/scale}px`;
    cursor?.querySelector('circle')?.setAttribute('r',`${8/scale}`);
    cursor?.querySelector('path')?.setAttribute('d',`M ${-12/scale} 0 H ${-4/scale} M ${4/scale} 0 H ${12/scale} M 0 ${-12/scale} V ${-4/scale} M 0 ${4/scale} V ${12/scale}`);
    cursor?.setAttribute("transform",`translate(${this.atlasNotes.cursor.x} ${this.atlasNotes.cursor.z})`);
    if(cursor)cursor.style.strokeWidth=`${1/scale}px`;
    const output=this.overlay.querySelector('#atlas-zoom-level');if(output)output.textContent=`${Math.round(this.atlasView.zoom*100)}%`;
    for(const [selector,disabled] of [['[data-atlas-zoom="-1"]',this.atlasView.zoom<=1],['[data-atlas-zoom="1"]',this.atlasView.zoom>=8]] as const){const button=this.overlay.querySelector<HTMLButtonElement>(selector);if(button)button.disabled=disabled;}
  }

  private zoomAtlas(factor:number,anchor?:Point) {
    if(this.currentScreen!=="atlas"||this.atlasPage!=="map")return;
    this.atlasView.zoomAt(factor,anchor??this.atlasView.centre);this.updateAtlasView();
  }
  private resetAtlasView(){this.atlasView.reset();this.updateAtlasView();}
  private focusAtlasStreet(name:string){
    const street=atlasStreetEntries().find(street=>street.name===name);if(!street)return;
    this.selectedStreet=name;this.indexStreet=atlasStreetEntries().findIndex(street=>street.name===name);
    this.atlasNotes.pointAt(street);this.atlasView.focus(street,5);
    if(this.atlasPage!=="map")this.setAtlasPage("map");else this.updateAtlasView();
  }

  controlAtlasView(dt:number,zoom:number,step:number,panX:number,panY:number,overview:boolean){
    if(this.currentScreen!=="atlas")return;
    if(this.atlasPage==="index"){
      const direction=Math.abs(panY)>.4?Math.sign(panY):0;this.indexSelectDelay-=dt;
      if(direction&&(direction!==this.indexSelectDirection||this.indexSelectDelay<=0)){
        const entries=atlasStreetEntries();this.indexStreet=this.indexStreet<0?0:Math.max(0,Math.min(entries.length-1,this.indexStreet+direction));
        this.indexSelectDelay=.18;
        for(const button of this.overlay.querySelectorAll<HTMLButtonElement>('[data-atlas-street]')){
          const selected=button.dataset.atlasStreet===entries[this.indexStreet].name;button.setAttribute('aria-pressed',String(selected));
          if(selected){button.focus();button.scrollIntoView({block:'nearest'});}
        }
      }
      this.indexSelectDirection=direction;return;
    }
    if(overview)this.atlasView.reset();
    else {
      if(step)this.atlasView.zoomAt(Math.pow(1.5,step));
      if(Math.abs(zoom)>.08)this.atlasView.zoomAt(Math.exp(zoom*dt*1.25));
      if(panX||panY){const box=this.atlasView.box;this.atlasView.pan(panX*box.width*.55*dt,panY*box.height*.55*dt);}
    }
    if(overview||step||Math.abs(zoom)>.08||panX||panY)this.updateAtlasView();
  }

  private setAtlasPage(page: AtlasPage) {
    if (this.currentScreen !== "atlas" || this.atlasPage === page) return;
    this.atlasDrag=undefined;this.suppressAtlasClick=false;
    this.atlasPage = page;
    this.overlay.innerHTML = atlasMarkup(page);
    this.updateAtlasNotes();
    this.overlay.querySelector<HTMLButtonElement>(`[data-atlas-page="${page}"]`)?.focus();
  }

  setAtlasInformation(message: string) {
    this.atlasInformation = message;
    if(this.currentScreen === "atlas") {
      this.updateAtlasInformation();
      this.updateAtlasNotes();
    }
  }

  private updateAtlasInformation() {
    const panel=this.overlay.querySelector<HTMLElement>(".atlas-information");
    const text=this.overlay.querySelector("#atlas-information-text");
    if(panel)panel.hidden=!this.atlasInformation;
    this.overlay.querySelector(".atlas-book")?.classList.toggle("has-information",Boolean(this.atlasInformation));
    const introduction=this.overlay.querySelector<HTMLElement>(".atlas-introduction");
    if(introduction)introduction.hidden=Boolean(this.atlasInformation);
    if(text)text.textContent=this.atlasInformation;
  }

  private updateAtlasNotes() {
    this.updateAtlasInformation();
    this.updateAtlasView();
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
    this.atlasView.reset();this.selectedStreet="";this.indexStreet=-1;
    this.atlasInformation = "";
  }

  confirmAtlasPosition(position: Point, parkingName?: string) {
    const label = parkingName ?? `${nearestRoad(position).edge.name}, ${areaAt(position)}`;
    this.atlasNotes.confirm(position, label);
    this.atlasView.ensureVisible(position);
  }

  moveAtlasCursor(dt: number, x: number, z: number) {
    if(this.currentScreen!=="atlas")return;
    if(this.atlasPage==="index") { const index=this.overlay.querySelector<HTMLElement>(".atlas-index");if(index)index.scrollTop+=z*dt*300;return; }
    if(this.atlasNotes.move(dt/this.atlasView.zoom,x,z)){this.atlasView.ensureVisible(this.atlasNotes.cursor);this.updateAtlasNotes();}
  }

  placeAtlasMarker() {
    if(this.currentScreen==="atlas"&&this.atlasPage==="index"&&this.indexStreet>=0){this.focusAtlasStreet(atlasStreetEntries()[this.indexStreet].name);return;}
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

  setTaxiMessage(message: string) {
    this.atlasInformation="";
    this.hintLabel.textContent="TAXI RADIO";
    this.hint.textContent=message;
  }

  setHint(message: string) {
    this.hintLabel.textContent = "LOCAL DIRECTIONS";
    this.hint.textContent = message;
  }

  remindMission(mission: Mission) {
    this.hintLabel.textContent = "MISSION REMINDER";
    this.hint.textContent = mission.taxiMode ? `${mission.objective} Shift: ${mission.clockText} / ${mission.shiftLabel.split("–")[1]}. Earned ${formatMoney(mission.earningsCents)} from ${mission.completedFares} fares.` : `${mission.objective} ${mission.remaining > 0 ? `Time remaining: ${formatTime(mission.remaining)}.` : "The deadline has passed; finish the drive for a late-arrival result."}`;
  }

  show(screen: Screen, mission: Mission, car: Car, parking: Parking) {
    if (screen === this.currentScreen) return;
    this.atlasDrag=undefined;this.suppressAtlasClick=false;
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
      ${mission.taxiMode ? `<div><span>Collect / drop off passenger</span><b>A / Cross</b><b>Enter</b></div>` : ""}
      <div><span>Steer</span><b>Left stick</b><b>A D / ← →</b></div>
      <div><span>Accelerate</span><b>RT</b><b>W / ↑</b></div>
      <div><span>Brake only</span><b>LT</b><b>S / ↓</b></div>
      <div><span>Forward / reverse (stopped)</span><b>B / Circle</b><b>R</b></div>
      <div><span>Handbrake</span><b>X / Square</b><b>Space</b></div>
      <div><span>Look around</span><b>Right stick</b><b>Click view + mouse</b></div>
      <div><span>Look forward</span><b>R3</b><b>C</b></div>
      <div><span>Glance</span><b>LB / RB</b><b>Q / E</b></div>
      <div><span>Ask for information (road / atlas)</span><b>View / Select</b><b>F</b></div>
      <div><span>Atlas (while stopped)</span><b>Y / Triangle</b><b>T</b></div>
      <div><span>Mission reminder</span><b>D-pad up</b><b>Tab / M</b></div>
      <div><span>Pause</span><b>Start</b><b>Esc / P</b></div>
    </div>`;
    if (screen === "briefing") {
      this.overlay.innerHTML = `<section class="briefing modal" aria-labelledby="screen-title">
        <div class="briefing-main"><span class="eyebrow accent">CEREA VICE &nbsp; / &nbsp; A DRIVING EXPERIMENT</span>
          <h1 id="screen-title">A place.<br>A deadline.<br><em>Your own way.</em></h1>
          <p class="intro">${mission.taxiMode ? "Collect passengers, learn the streets and see how much you can earn before 17:00." : "No familiar streets. Just a compass, a few signs, and the road ahead."}</p>
          <button type="button">Start the engine <span aria-hidden="true">&gt;</span></button><span class="button-note">${mission.taxiMode ? `A / ENTER TO START · ${mission.shiftLabel} TAXI SHIFT` : `A / ENTER TO BEGIN · ${Math.round(district.mission.duration/60)} MINUTE DRIVE`}</span>
        </div>
        <div class="briefing-side"><span class="eyebrow">${district.name.toUpperCase()}</span><h2>${mission.taxiMode ? "Drive a taxi in Cerea." : `Find ${district.mission.name}.`}</h2><p>${district.mission.hint}</p><div class="district-switch" aria-label="Choose district">${availableDistricts.map((map)=>`<button type="button" data-district="${map.id}" aria-pressed="${map.id===district.id}">${map.name}</button>`).join("")}</div><small class="controller-note">LB / RB or Q / E: change district before starting.</small><small class="controller-note">${district.attribution}</small>
          <div class="briefing-tip">${mission.taxiMode ? `<b>A working day in ${Math.ceil(mission.duration/60)} active minutes.</b><p>Clock: ${mission.shiftLabel}. Stop in the named bay and press A / Enter to collect or drop off a passenger. Faster rides earn more; slow rides still pay a base fare. Pausing or reading the atlas freezes the shift.</p>` : ""}<b>Lost? Pull over.</b><p>Come to a full stop anywhere. Press Y / T for the atlas, or View / F for a local direction hint. Marked P bays are legal stopping places.</p></div>
          ${controls}<small class="controller-note" id="controller-status" role="status"></small>
        </div>
      </section>`;
    } else if (screen === "paused") {
      this.overlay.innerHTML = `<section class="pause modal" aria-labelledby="screen-title"><span class="eyebrow accent">ENGINE IDLING / TIMER PAUSED</span><h1 id="screen-title">Take a breather.</h1><p>The district will be here when you’re ready.</p>${controls}<small class="controller-note" id="controller-status" role="status"></small><button type="button">Back to the road <span aria-hidden="true">&gt;</span></button><span class="button-note">A / ENTER / START TO RESUME</span></section>`;
    } else if(mission.taxiMode) {
      this.overlay.innerHTML=`<section class="result modal" aria-labelledby="screen-title"><span class="eyebrow accent">${mission.clockText} / TAXI SHIFT COMPLETE</span><h1 id="screen-title">You earned ${formatMoney(mission.earningsCents)}.</h1><p>${mission.completedFares} passengers delivered during ${mission.shiftLabel}.</p><div class="result-stats"><div><strong>${formatMoney(mission.earningsCents)}</strong><span>TOTAL FARES</span></div><div><strong>${formatMoney(mission.bonusEarnedCents)}</strong><span>SPEED BONUSES</span></div><div><strong>${mission.completedFares}</strong><span>COMPLETED RIDES</span></div><div><strong>${car.collisions}</strong><span>COLLISIONS</span></div><div><strong>${mission.directionRequestCount}</strong><span>INFORMATION REQUESTS</span></div></div><p>${mission.unfinishedPassenger?"The passenger still aboard at closing time is not counted as a completed fare.":"The shift is over. Try again and use what you remember to earn more."}</p><button type="button">Start another shift <span aria-hidden="true">&gt;</span></button><span class="button-note">A / ENTER TO RESTART AT ${mission.shiftLabel.split("–")[0]}</span></section>`;
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
    const target=mission.target;
    const stage=document.querySelector<HTMLElement>('#objective-stage')!;
    const title=document.querySelector<HTMLElement>('#objective-title')!;
    const description=document.querySelector<HTMLElement>('#objective-description')!;
    const taxiStatus=document.querySelector<HTMLElement>('#taxi-status')!;
    if(mission.taxiMode) {
      stage.textContent=`TAXI / ${mission.taxiStage==='pickup'?'COLLECT PASSENGER':'PASSENGER ABOARD'}`;
      const text=mission.taxiStage==='pickup'?`Collect ${mission.passenger} at ${target.name}`:`${mission.passenger} → ${target.name}`;
      if(title.textContent!==text)title.textContent=text;
      if(description.textContent!==mission.objective)description.textContent=mission.objective;
      taxiStatus.hidden=false;
      taxiStatus.textContent=`${formatMoney(mission.earningsCents)} earned · ${mission.completedFares} fares${mission.taxiStage==='dropoff'?` · base ${formatMoney(mission.baseFareCents)} + speed bonus ${formatMoney(mission.potentialBonusCents)}`:''}`;
      document.querySelector('.deadline > span')!.textContent=`SHIFT ${mission.shiftLabel}`;
    }
    const controllerNote = this.overlay.querySelector("#controller-status");
    if (controllerNote && controllerNote.textContent !== controllerStatus) controllerNote.textContent = controllerStatus;
    const degrees = bearing(car.heading);
    this.compassTrack.style.transform = `translateX(${-416 - (degrees / 45) * 52 - 26}px)`;
    this.compassValue.textContent = `${compass(car.heading)} · ${Math.round(degrees).toString().padStart(3, "0")}°`;
    this.speed.textContent = Math.round(Math.abs(car.speed) * 3.6)
      .toString()
      .padStart(2, "0");
    document.querySelector("#gear")!.textContent =
      car.gear;
    this.timer.textContent = mission.taxiMode ? mission.clockText :
      mission.state === "overdue" || mission.state === "late"
        ? "LATE"
        : formatTime(mission.remaining);
    this.timer.classList.toggle("urgent", mission.remaining < 30);
    this.stopState.textContent = parking.stopped
      ? parking.zone
        ? "P · LEGAL STOP"
        : parking.legal ? "STOPPED · ALLOWED" : "STOPPED · UNSAFE"
      : car.speed === 0
        ? "SETTLING"
        : "ON THE MOVE";
    this.stopState.classList.toggle("unsafe", parking.stopped && !parking.legal);
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
    const serve=mission.canServe(car,parking.stopped)?`<kbd>${device === "Controller" ? "A" : "Enter"}</kbd> ${mission.taxiStage==='pickup'?`Collect ${mission.passenger}`:'Complete fare'} &nbsp; `:'';
    this.prompt.innerHTML = parking.stopped
      ? `${serve}<kbd>${device === "Controller" ? "View" : "F"}</kbd> Ask for information &nbsp; <kbd>${device === "Controller" ? "Y" : "T"}</kbd> Atlas &nbsp; <kbd>${device === "Controller" ? "B" : "R"}</kbd> ${car.gear === "D" ? "Select reverse" : "Select forward"} <span>· ${parking.zone ?? (parking.legal ? "stopping allowed" : "unsafe stopping place")}</span>`
      : "Stop fully for the atlas or directions";
  }
}
