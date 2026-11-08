import {goalLabel} from "./GoalLabel";
import { createAtlasView } from "../navigation/AtlasView";
import { createAtlasNotes } from "../navigation/AtlasNotes";
import { createAtlas, pinnedGridLabels, roadTiersVisible, type AtlasPage } from "./Atlas";
import { type Car } from "../driving/Car";
import { type Mission } from "../mission/Mission";
import { type Parking } from "../navigation/Parking";
import { selectDistrict, type TownEntry } from "../world/load";
import { type Point } from "../world/district";
import { createNavigation } from "../navigation/Navigation";
import { District } from "../world/district";
import type {AtlasSnapshot} from '../navigation/AtlasNotes';
import type {AtlasSheet} from '../navigation/AtlasSheets';
export type Screen = "briefing" | "running" | "paused" | "result" | "atlas" | "fares";
export type FareChoice = "select" | "accept" | "refresh" | "close";
export function createHud(context:District,towns:readonly Pick<TownEntry,"id"|"name">[]=[{id:context.district.id,name:context.district.name}]){
const {district,areaAt}=context;
const {AtlasView}=createAtlasView(context);
const {AtlasNotes}=createAtlasNotes(context);
const {atlasFrame,atlasStreetEntries,atlasReference,atlasMarkup,sheets,sheetAt,setAtlasSheet,setAtlasJourney,townModes,setCurrentTown}=createAtlas(context);
const {bearing,compass,nearestRoad}=createNavigation(context);
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const formatMoney=(cents:number)=>`€${(cents/100).toFixed(2)}`;
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
class Hud {
  private overlay: HTMLElement;
  private atlasInformation = "";
  private readonly atlasView = new AtlasView();
  private atlasSheet:AtlasSheet|undefined;
  private selectedStreet = "";
  private indexStreet = -1;
  private indexSelectDelay = 0;
  private indexSelectDirection = 0;
  private atlasDrawingState?:{map:SVGSVGElement;key:string;labels:{node:SVGTextElement;x:number;z:number;angle:number;left:number;right:number;ascent:number;descent:number;kind:string;street:string}[]};
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
  private prompt: HTMLElement;
  private device: HTMLElement;
  private hint: HTMLElement;
  private hintLabel: HTMLElement;
  private soundText='';
  private messageKind:'none'|'taxi'|'requested'='none';
  private messageUntil=0;
  /** Sound level, mute or a blocked audio device, and the radio; shown on every screen. */
  setSound({text,warn}:{text:string;warn:boolean}){if(text===this.soundText)return;this.soundText=text;const element=document.querySelector<HTMLElement>('#sound-state');if(element){element.textContent=text;element.classList.toggle('unsafe',warn);}}
  saveAtlas(){return this.atlasNotes.snapshot();}
  restoreAtlas(value:AtlasSnapshot){this.atlasNotes.restore(value);this.atlasInformation='';this.atlasSheet=undefined;setAtlasSheet();this.atlasView.setSheet();this.currentScreen=undefined;}

  constructor(root: HTMLElement, onAction: () => void, onInformation: () => void, private onFare:(choice:FareChoice,id?:number)=>void=()=>{}) {
    const ui = document.createElement("div");
    ui.id = "hud";ui.dataset.district=district.id;
    ui.innerHTML = `
      <div class="vignette" aria-hidden="true"></div>
      <header class="topbar">
        <section class="destination-panel" aria-label="Current goal">
          <span class="sr-only" id="objective-stage">OBJECTIVE</span>
          <div class="goal-caption" hidden><span aria-hidden="true">↳</span> <span id="goal-caption">DESTINATION</span></div>
          <h2 id="objective-title">No destination</h2>
          <div class="destination-meta"><span id="goal-town"></span><span id="goal-street"></span></div>
          <p class="sr-only" id="objective-description"></p>
        </section>
        <div class="compass-panel" aria-label="Compass">
          <div class="compass-window"><div class="compass-track">${Array.from({ length: 3 }, () => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((s) => `<span>${s}</span>`).join("")).join("")}</div></div>
          <div class="compass-notch"></div><strong id="heading">E · 090°</strong>
        </div>
        <div class="shift-counters">
          <div class="earnings-counter"><span>EARNED</span><strong id="earnings" aria-label="Shift earnings" aria-describedby="taxi-status">€0.00</strong></div>
          <div class="deadline"><span>TIME TO ARRIVE</span><strong id="timer">03:00</strong></div>
          <div id="taxi-status" class="sr-only"></div>
        </div>
      </header>
      <div class="navigation-message" hidden><div class="hint-header"><span class="live-dot"></span><span id="hint-label">LOCAL DIRECTIONS</span></div><p id="hint" role="status">${district.mission.hint}</p></div>
      <div class="interaction" id="prompt"></div>
      <footer class="dashboard">
        <div class="dashboard-left"><div class="speed-line"><strong id="speed">00</strong><span>KM/H<br><b id="gear">D</b></span></div><div class="stop-state" id="stop-state">SETTLING</div></div>
        <div class="dashboard-right"><div class="dash-detail"><span id="device">Keyboard</span></div><div class="dash-detail sound-state" id="sound-state" role="status"></div></div>
      </footer>
      ${district.attribution.includes("OpenStreetMap") ? `<div class="map-credit">${district.attribution} · openstreetmap.org/copyright</div>` : ""}
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
    this.prompt = find("#prompt");
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
        if(sheets.length&&!this.atlasSheet){
          const sheet=sheetAt({x:point.x,z:point.y});
          if(sheet)this.openAtlasSheet(sheet.id);
          else if(townModes){this.atlasNotes.pointAt({x:point.x,z:point.y});this.atlasNotes.place();this.updateAtlasNotes();}
          return;
        }
        const frame=atlasFrame();
        if (point.x < frame.minX || point.x > frame.minX+frame.span || point.y < frame.minZ || point.y > frame.minZ+frame.span) return;
        this.atlasNotes.pointAt({ x: point.x, z: point.y });
        this.placeAtlasMarker();
        return;
      }
      if(button.dataset.atlasSheet){this.openAtlasSheet(button.dataset.atlasSheet,true);return;}
      if(button.dataset.atlasZoom) {this.zoomAtlas(Math.pow(townModes?2:1.5,Number(button.dataset.atlasZoom)));return;}
      // Keyboard and controller reach the fare list through Input; ignore synthetic Enter/Space clicks.
      if((button.dataset.fareOffer||button.dataset.fare)&&e.detail===0)return;
      if(button.dataset.fareOffer){this.onFare('select',Number(button.dataset.fareOffer));return;}
      if(button.dataset.fare){this.onFare(button.dataset.fare as FareChoice);return;}
      if(button.hasAttribute("data-atlas-overview")){this.resetAtlasView();return;}
      if(button.dataset.atlasStreet){this.focusAtlasStreet(button.dataset.atlasStreet);return;}
      if (button.dataset.district) {
        if(button.dataset.district===district.id)this.overlay.querySelector<HTMLButtonElement>('.briefing-main > button')?.focus();
        else selectDistrict(towns,button.dataset.district,true);
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
      if(point)this.zoomAtlas(Math.exp(-event.deltaY*(event.deltaMode===1?16:1)*(townModes ? .004 : .0015)),point);
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
        if(before&&after){
          const changed=this.panAtlas(before.x-after.x,before.z-after.z);
          if(changed){
            this.atlasDrag=drag;
            try{this.overlay.querySelector<SVGSVGElement>('.atlas-map')?.setPointerCapture(event.pointerId);}catch{this.atlasDrag=undefined;this.suppressAtlasClick=true;}
          }
          this.updateAtlasView();
        }
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
    if(townModes){this.updateTownAtlasView();return;}
    const map=this.overlay.querySelector<SVGSVGElement>(".atlas-map");if(!map)return;
    const box=this.atlasView.box;
    const oldCursor=this.atlasNotes.cursor;
    if(oldCursor.x<box.x||oldCursor.x>box.x+box.width||oldCursor.z<box.z||oldCursor.z>box.z+box.height)this.atlasNotes.pointAt(this.atlasView.centre);
    map.setAttribute("viewBox",`${box.x} ${box.z} ${box.width} ${box.height}`);
    const scale=map.getScreenCTM()?.a??1;if(!(scale>0))return;
    // The printed reference under the view centre follows the reader's eye, never the car (#86).
    const viewReference=this.overlay.querySelector('#atlas-view-reference');if(viewReference)viewReference.textContent=atlasReference(this.atlasView.centre);
    if(!(sheets.length>0&&!this.atlasSheet)){
      // Keep the page's grid letters and numbers on screen when the paper edges scroll out of view.
      const {letters,numbers}=pinnedGridLabels(atlasFrame(),box,16/scale);
      for(const label of map.querySelectorAll<SVGTextElement>('[data-grid-letter],[data-grid-number]')){
        const pinned=(label.dataset.gridLetter!==undefined?letters:numbers).find(entry=>entry.index===Number(label.dataset.gridLetter??label.dataset.gridNumber));
        if(!pinned){label.style.display='none';continue;}
        label.style.display='';label.setAttribute('x',`${pinned.x}`);label.setAttribute('y',`${pinned.y}`);label.style.fontSize=`${13/scale}px`;
      }
    }
    const pixels=Math.min(24,14+3*(this.atlasView.zoom-1));
    // Zoomed-out paper shows the major network; smaller streets and then paths appear as the reader zooms (#88).
    const tiers=roadTiersVisible(this.atlasView.zoom);
    for(let tier=1;tier<=3;tier++){const group=map.querySelector<SVGGElement>(`[data-road-tier="${tier}"]`);if(group)group.style.display=tier<=tiers?'':'none';}
    for(const label of map.querySelectorAll<SVGTextElement>("[data-street]")){
      const selected=label.dataset.street===this.selectedStreet;
      if(Number(label.dataset.roadTier??1)>tiers){label.style.display='none';continue;}
      label.style.display='';
      label.style.fontSize=`${(selected?pixels+2:pixels)/scale}px`;
      label.style.paintOrder="stroke";label.style.stroke="#f8f1dd";label.style.strokeWidth=`${3/scale}px`;
      label.style.fill=selected?"#8f342c":"#29443f";
    }
    for(const label of map.querySelectorAll<SVGTextElement>('[data-map-label="place"]')){label.style.fontSize=`${(pixels+1)/scale}px`;label.style.strokeWidth=`${2/scale}px`;}
    for(const label of map.querySelectorAll<SVGTextElement>('[data-map-label="parking"]'))label.style.fontSize=`${(pixels+2)/scale}px`;
    for(const label of map.querySelectorAll<SVGTextElement>('[data-map-label="town"]')){label.style.fontSize=`${14/scale}px`;label.style.strokeWidth=`${3/scale}px`;}
    for(const label of map.querySelectorAll<SVGTextElement>('[data-map-label="quadrant"]'))label.style.fontSize=`${10/scale}px`;
    if(sheets.length&&this.atlasSheet){
      // Reserve paper space for selected streets and landmarks first. A lookup always reveals its name.
      const labels=[...map.querySelectorAll<SVGTextElement>('[data-street], [data-map-label]')];
      const priority=(label:SVGTextElement)=>label.dataset.street===this.selectedStreet?0:label.dataset.mapLabel==='place'?1:label.dataset.street?2:3;
      labels.sort((a,b)=>priority(a)-priority(b));
      const occupied:DOMRect[]=[],viewport=map.getBoundingClientRect(),frame=atlasFrame();
      const matrix=map.getScreenCTM()!;
      const topLeft=new DOMPoint(frame.minX,frame.minZ).matrixTransform(matrix),bottomRight=new DOMPoint(frame.minX+frame.span,frame.minZ+frame.span).matrixTransform(matrix);
      const paper={left:Math.max(viewport.left,topLeft.x),right:Math.min(viewport.right,bottomRight.x),top:Math.max(viewport.top,topLeft.y),bottom:Math.min(viewport.bottom,bottomRight.y)};
      for(const label of labels)if(Number(label.dataset.roadTier??1)<=tiers)label.style.display='';
      for(const label of labels){
        const box=label.getBoundingClientRect();
        const visible=box.width>0&&box.left>=paper.left+3&&box.right<=paper.right-3&&box.top>=paper.top+3&&box.bottom<=paper.bottom-3;
        const collides=occupied.some(other=>box.left<other.right+4&&box.right>other.left-4&&box.top<other.bottom+3&&box.bottom>other.top-3);
        if(!visible||(collides&&priority(label)!==0))label.style.display='none';else occupied.push(box);
      }
    }
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

  /** Project known label extents instead of repeatedly forcing DOM layout for every street. */
  private updateTownAtlasView(){
    const map=this.overlay.querySelector<SVGSVGElement>('.atlas-map');if(!map)return;
    const box=this.atlasView.box;
    const key=[box.x.toFixed(2),box.z.toFixed(2),box.width.toFixed(2),box.height.toFixed(2),this.selectedStreet,innerWidth,innerHeight].join('|');
    let state=this.atlasDrawingState;
    if(state?.map===map&&state.key===key)return;
    if(state?.map!==map){
      const measure=document.createElement('canvas').getContext('2d')!;measure.textAlign='center';measure.textBaseline='alphabetic';
      state={map,key:'',labels:[...map.querySelectorAll<SVGTextElement>('[data-street],[data-map-label]')].map(node=>{
        const kind=node.dataset.mapLabel??'street';measure.font=`${kind==='place'||kind==='town'?'bold ':''}16px Vice, monospace`;
        const metrics=measure.measureText(node.textContent??'');
        return {node,x:Number(node.getAttribute('x')),z:Number(node.getAttribute('y')),angle:Number(node.dataset.angle??0)*Math.PI/180,kind,street:node.dataset.street??'',left:metrics.actualBoundingBoxLeft/16,right:metrics.actualBoundingBoxRight/16,ascent:metrics.actualBoundingBoxAscent/16,descent:metrics.actualBoundingBoxDescent/16};
      })};
    }
    state!.key=key;this.atlasDrawingState=state;
    const cursor=this.atlasNotes.cursor;
    if(cursor.x<box.x||cursor.x>box.x+box.width||cursor.z<box.z||cursor.z>box.z+box.height)this.atlasNotes.pointAt(this.atlasView.centre);
    map.setAttribute('viewBox',`${box.x} ${box.z} ${box.width} ${box.height}`);
    const matrix=map.getScreenCTM();if(!matrix||matrix.a<=0)return;
    const scale=matrix.a,viewport=map.getBoundingClientRect(),frame=atlasFrame();
    const paper={left:Math.max(viewport.left,frame.minX*scale+matrix.e),right:Math.min(viewport.right,(frame.minX+frame.width)*scale+matrix.e),top:Math.max(viewport.top,frame.minZ*scale+matrix.f),bottom:Math.min(viewport.bottom,(frame.minZ+frame.depth)*scale+matrix.f)};
    const priority=(label:NonNullable<typeof state>['labels'][number])=>label.street===this.selectedStreet&&label.street?0:label.kind==='place'?1:label.kind==='town'?1:2;
    const occupied:{left:number;right:number;top:number;bottom:number}[]=[];
    const pixels=Math.min(24,14+3*(this.atlasView.zoom-1));
    for(const label of [...state!.labels].sort((a,b)=>priority(a)-priority(b))){
      const selected=label.street===this.selectedStreet&&Boolean(label.street),font=label.kind==='town'?15:label.kind==='parking'?pixels+2:selected?pixels+2:pixels;
      label.node.style.fontSize=`${font/scale}px`;label.node.style.strokeWidth=`${3/scale}px`;label.node.style.paintOrder='stroke';label.node.style.stroke='#f8f1dd';label.node.style.fill=selected?'#8f342c':'#29443f';
      const c=Math.cos(label.angle),s=Math.sin(label.angle),x=label.x*scale+matrix.e,y=label.z*scale+matrix.f;
      const corners=[[-label.left,-label.ascent],[label.right,-label.ascent],[label.right,label.descent],[-label.left,label.descent]].map(([u,v])=>({x:x+(u*c-v*s)*font,y:y+(u*s+v*c)*font}));
      const bounds={left:Math.min(...corners.map(p=>p.x))-2,right:Math.max(...corners.map(p=>p.x))+2,top:Math.min(...corners.map(p=>p.y))-2,bottom:Math.max(...corners.map(p=>p.y))+2};
      const visible=bounds.left>=paper.left+2&&bounds.right<=paper.right-2&&bounds.top>=paper.top+2&&bounds.bottom<=paper.bottom-2;
      const collides=priority(label)!==0&&occupied.some(o=>bounds.left<o.right+3&&bounds.right>o.left-3&&bounds.top<o.bottom+2&&bounds.bottom>o.top-2);
      const display=visible&&!collides?'':'none';if(label.node.style.display!==display)label.node.style.display=display;
      if(!display)occupied.push(bounds);
    }
    const {letters,numbers}=pinnedGridLabels(frame,box,16/scale);
    for(const node of map.querySelectorAll<SVGTextElement>('[data-grid-letter],[data-grid-number]')){
      const pinned=(node.dataset.gridLetter!==undefined?letters:numbers).find(p=>p.index===Number(node.dataset.gridLetter??node.dataset.gridNumber));
      node.style.display=pinned?'':'none';if(pinned){node.setAttribute('x',`${pinned.x}`);node.setAttribute('y',`${pinned.y}`);node.style.fontSize=`${13/scale}px`;}
    }
    const pin=map.querySelector<SVGGElement>('.atlas-pin'),crosshair=map.querySelector<SVGGElement>('.atlas-cursor');
    pin?.querySelector('circle')?.setAttribute('r',`${5/scale}`);pin?.querySelector('path')?.setAttribute('d',`M ${-3/scale} ${-3/scale} L ${3/scale} ${3/scale} M ${-3/scale} ${3/scale} L ${3/scale} ${-3/scale}`);
    crosshair?.querySelector('circle')?.setAttribute('r',`${8/scale}`);crosshair?.querySelector('path')?.setAttribute('d',`M ${-12/scale} 0 H ${-4/scale} M ${4/scale} 0 H ${12/scale} M 0 ${-12/scale} V ${-4/scale} M 0 ${4/scale} V ${12/scale}`);
    if(pin)pin.style.strokeWidth=`${1.2/scale}px`;if(crosshair)crosshair.style.strokeWidth=`${1/scale}px`;
    const output=this.overlay.querySelector('#atlas-zoom-level');if(output)output.textContent=`${Math.round(this.atlasView.zoom*100)}%`;
    const reference=this.overlay.querySelector('#atlas-view-reference');if(reference)reference.textContent=atlasReference(this.atlasView.centre);
    const out=this.overlay.querySelector<HTMLButtonElement>('[data-atlas-zoom="-1"]'),into=this.overlay.querySelector<HTMLButtonElement>('[data-atlas-zoom="1"]');
    if(out)out.disabled=!this.atlasSheet&&this.atlasView.zoom<=1;if(into)into.disabled=this.atlasView.zoom>=8;
  }

  private zoomAtlas(factor:number,anchor?:Point) {
    if(this.currentScreen!=="atlas"||this.atlasPage!=="map")return;
    if(townModes&&this.atlasSheet&&factor<1&&this.atlasView.zoom<=1.001){this.resetAtlasView();return;}
    this.atlasView.zoomAt(factor,anchor??this.atlasView.centre);if(!this.openZoomedOverview())this.updateAtlasView();
  }
  /** Leaving a town drawing enters the continuous regional map instead of hitting a page wall. */
  private panAtlas(dx:number,dz:number){
    if(townModes&&this.atlasSheet){
      const box=this.atlasView.box,base=this.atlasView.base,next={x:this.atlasView.centre.x+dx,z:this.atlasView.centre.z+dz};
      if(next.x<base.x+box.width/2-.5||next.x>base.x+base.width-box.width/2+.5||next.z<base.z+box.height/2-.5||next.z>base.z+base.height-box.height/2+.5){
        this.openAtlasSheet();
        this.atlasView.focus(next,Math.min(8,Math.max(1,this.atlasView.base.width/box.width,this.atlasView.base.height/box.height)));this.updateAtlasView();return true;
      }
    }
    this.atlasView.pan(dx,dz);return false;
  }
  /** Overviews print no street names: zooming one in to about two pages wide turns to the detail page under the view centre,
   *  at least at 2×, where streets and their names print (#88). */
  private openZoomedOverview(){
    if(!sheets.length||this.atlasSheet)return false;
    const centre={...this.atlasView.centre},width=this.atlasView.box.width,height=this.atlasView.box.height;
    if(townModes){
      const town=sheetAt(centre);if(!town||width>2*Math.max(town.width!,town.depth!))return false;
      this.openAtlasSheet(town.id);this.atlasView.focus(centre,Math.max(1,this.atlasView.base.width/width,this.atlasView.base.height/height));this.updateAtlasView();return true;
    }
    const sheet=sheetAt(centre)??sheets.reduce((a,b)=>Math.hypot(b.minX+b.span/2-centre.x,b.minZ+b.span/2-centre.z)<Math.hypot(a.minX+a.span/2-centre.x,a.minZ+a.span/2-centre.z)?b:a);
    if(width>2*sheet.span)return false;
    this.openAtlasSheet(sheet.id);this.atlasView.focus(centre,Math.max(2,this.atlasView.base.width/width));this.updateAtlasView();
    return true;
  }
  private resetAtlasView(){if(sheets.length)this.openAtlasSheet();else {this.atlasView.reset();this.updateAtlasView();}}
  /** Open a detail page (or the overview). A turn from one detail page to another keeps the reader's zoom. */
  private openAtlasSheet(id?:string,turn=false){
    const from=this.atlasSheet;
    this.atlasSheet=sheets.find(sheet=>sheet.id===id);setAtlasSheet(this.atlasSheet?.id);
    if(turn&&from&&this.atlasSheet)this.atlasView.turnSheet(this.atlasSheet);else this.atlasView.setSheet(this.atlasSheet);this.atlasDrag=undefined;this.suppressAtlasClick=false;
    this.atlasPage='map';this.overlay.innerHTML=atlasMarkup('map');this.updateAtlasNotes();
    this.indexStreet=-1;this.indexSelectDelay=0;this.indexSelectDirection=0;
    this.overlay.querySelector<HTMLButtonElement>('[data-atlas-page="map"]')?.focus({preventScroll:true});
  }
  private focusAtlasStreet(key:string){
    const street=atlasStreetEntries().find(street=>street.key===key);if(!street)return;
    this.selectedStreet=key;
    if(sheets.length)this.openAtlasSheet(street.sheet);
    this.indexStreet=atlasStreetEntries().findIndex(street=>street.key===key);
    this.atlasNotes.pointAt(street);this.atlasView.focus(street,5);
    if(this.atlasPage!=="map")this.setAtlasPage("map");else this.updateAtlasView();
  }

  controlAtlasView(dt:number,zoom:number,step:number,panX:number,panY:number,overview:boolean,indexMoveY=0){
    if(this.currentScreen!=="atlas")return;
    if(this.atlasPage==="index"){
      const movement=panY||indexMoveY;
      const direction=Math.abs(movement)>.4?Math.sign(movement):0;this.indexSelectDelay-=dt;
      if(direction&&(direction!==this.indexSelectDirection||this.indexSelectDelay<=0)){
        const entries=atlasStreetEntries();if(!entries.length)return;
        this.indexStreet=this.indexStreet<0?0:Math.max(0,Math.min(entries.length-1,this.indexStreet+direction));
        this.indexSelectDelay=.18;
        for(const button of this.overlay.querySelectorAll<HTMLButtonElement>('[data-atlas-street]')){
          const selected=button.dataset.atlasStreet===entries[this.indexStreet].key;button.setAttribute('aria-pressed',String(selected));
          if(selected){button.focus();button.scrollIntoView({block:'nearest'});}
        }
      }
      this.indexSelectDirection=direction;return;
    }
    if(townModes){
      if(overview){this.resetAtlasView();return;}
      if(step)this.zoomAtlas(Math.pow(2,step));
      if(Math.abs(zoom)>.08)this.zoomAtlas(Math.exp(zoom*dt*3.5));
      if(panX||panY){const box=this.atlasView.box;this.panAtlas(panX*box.width*.9*dt,panY*box.height*.9*dt);this.updateAtlasView();}
      return;
    }
    if(overview){this.resetAtlasView();return;}
    else {
      if(step)this.atlasView.zoomAt(Math.pow(1.5,step));
      if(Math.abs(zoom)>.08)this.atlasView.zoomAt(Math.exp(zoom*dt*1.25));
      if(panX||panY){const box=this.atlasView.box;this.atlasView.pan(panX*box.width*.55*dt,panY*box.height*.55*dt);}
    }
    if((step||Math.abs(zoom)>.08)&&this.openZoomedOverview())return;
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
    this.atlasInformation = message;this.messageKind='requested';this.messageUntil=Infinity;
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
    if(text)text.textContent=this.atlasInformation;
  }

  private updateAtlasNotes() {
    this.updateAtlasInformation();
    this.updateAtlasView();
    const { cursor, marker } = this.atlasNotes;
    if(townModes&&!this.atlasSheet){const action=this.overlay.querySelector<HTMLButtonElement>('[data-atlas-place]');if(action)action.textContent=sheetAt(cursor)?'Open town':'Mark my position';}
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

  /** After crossing into another region the reader has no marked position until they ask or estimate (#112). */
  forgetAtlasMarker(start?:Point) {
    this.resetAtlasNotes();this.atlasNotes.remove();if(start)this.atlasNotes.pointAt(start);
  }

  resetAtlasNotes() {
    this.atlasNotes.reset();
    this.atlasSheet=undefined;setAtlasSheet();this.atlasView.setSheet();this.selectedStreet="";this.indexStreet=-1;
    this.atlasInformation = "";
  }

  confirmAtlasPosition(position: Point, parkingName?: string) {
    const label = parkingName ?? `${nearestRoad(position).edge.name}, ${areaAt(position)}`;
    this.atlasNotes.confirm(position, label);
    if(sheets.length){
      const sheet=sheetAt(position);
      if(sheet?.id!==this.atlasSheet?.id){
        this.atlasSheet=sheet;setAtlasSheet(sheet?.id);this.atlasView.setSheet(sheet);
        if(this.currentScreen==='atlas'&&(townModes||this.atlasPage==='map')){this.overlay.innerHTML=atlasMarkup(this.atlasPage);this.indexStreet=-1;}
      }
    }
    this.atlasView.ensureVisible(position);
  }

  moveAtlasCursor(dt: number, x: number, z: number) {
    if(this.currentScreen!=="atlas")return;
    if(this.atlasPage==="index")return; // Index arrows select in controlAtlasView, with one repeat timer.
    const pageScale=townModes?Math.max(this.atlasView.base.width,this.atlasView.base.height)/Math.max(this.atlasView.overview.width,this.atlasView.overview.height):this.atlasView.base.width/this.atlasView.overview.width;
    if(this.atlasNotes.move(dt*pageScale/this.atlasView.zoom,x,z)){
      if(townModes){
        const box=this.atlasView.box,c=this.atlasNotes.cursor,mx=box.width*.12,mz=box.height*.12;
        const dx=c.x<box.x+mx?c.x-box.x-mx:c.x>box.x+box.width-mx?c.x-box.x-box.width+mx:0;
        const dz=c.z<box.z+mz?c.z-box.z-mz:c.z>box.z+box.height-mz?c.z-box.z-box.height+mz:0;
        if(dx||dz)this.panAtlas(dx,dz);
      }else this.atlasView.ensureVisible(this.atlasNotes.cursor);
      this.updateAtlasNotes();
    }
  }

  placeAtlasMarker() {
    if(this.currentScreen==="atlas"&&this.atlasPage==="index"&&this.indexStreet>=0){this.focusAtlasStreet(atlasStreetEntries()[this.indexStreet].key);return;}
    if (this.currentScreen !== "atlas" || this.atlasPage !== "map") return;
    if(sheets.length&&!this.atlasSheet){
      const sheet=sheetAt(this.atlasNotes.cursor);if(sheet){this.openAtlasSheet(sheet.id);return;}
      if(!townModes)return;
    }
    this.atlasNotes.place();
    this.updateAtlasNotes();
  }

  removeAtlasMarker() {
    if (this.currentScreen !== "atlas") return;
    this.atlasNotes.remove();
    this.updateAtlasNotes();
  }

  turnAtlasPage(direction: number) {
    if(townModes){this.setAtlasPage(this.atlasPage==='map'?'index':'map');return;}
    if(sheets.length){
      const current=this.atlasPage==='index'?sheets.length+1:this.atlasSheet?sheets.indexOf(this.atlasSheet)+1:0;
      const next=(current+Math.sign(direction)+sheets.length+2)%(sheets.length+2);
      if(next===sheets.length+1)this.setAtlasPage('index');else this.openAtlasSheet(sheets[next-1]?.id,true);
      return;
    }
    this.setAtlasPage(direction < 0 ? "map" : "index");
  }

  /** The requested current-town page reveals only town context; knowledge is left untouched. */
  prepareAtlas(position:Point){
    if(!townModes)return;
    this.atlasSheet=sheetAt(position);setCurrentTown(this.atlasSheet?.id);setAtlasSheet(this.atlasSheet?.id);
    this.atlasView.setSheet(this.atlasSheet);this.atlasPage='map';this.indexStreet=-1;this.atlasDrag=undefined;
  }

  /** Redraw the current screen, e.g. after the fare list is replaced. */
  refresh(){this.currentScreen=undefined;}

  /** Highlight one listed fare without redrawing, keeping identities stable. */
  private fareSelection=-1;
  setFareSelection(id:number){
    this.fareSelection=id;
    for(const button of this.overlay.querySelectorAll<HTMLButtonElement>('[data-fare-offer]')){
      const selected=Number(button.dataset.fareOffer)===id;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('controller-selected',selected);
      if(selected){button.focus({preventScroll:true});button.scrollIntoView({block:'nearest'});}
    }
  }

  setTaxiMessage(message: string) {
    this.atlasInformation="";
    this.hintLabel.textContent="TAXI RADIO";
    this.hint.textContent=message;this.messageKind='taxi';this.messageUntil=performance.now()+4000;
  }

  setHint(message: string) {
    this.hintLabel.textContent = "LOCAL DIRECTIONS";
    this.hint.textContent = message;this.messageKind='requested';this.messageUntil=performance.now()+10000;
  }

  remindMission(mission: Mission) {
    this.hintLabel.textContent = "MISSION REMINDER";this.messageKind='requested';this.messageUntil=performance.now()+10000;
    const fare=mission.hasRide&&mission.taxiStage==='dropoff'?` Fare ${formatMoney(mission.baseFareCents)} + remaining bonus ${formatMoney(mission.potentialBonusCents)}.`:'';
    this.hint.textContent = mission.taxiMode ? `${mission.objective}${fare} ${mission.endless?`Time: ${mission.clockText}.`:`Shift: ${mission.clockText} / ${mission.shiftLabel.split("–")[1]}.`}` : `${mission.objective} ${mission.remaining > 0 ? `Time remaining: ${formatTime(mission.remaining)}.` : "The deadline has passed; finish the drive for a late-arrival result."}`;
  }

  show(screen: Screen, mission: Mission, car: Car, parking: Parking) {
    if (screen === this.currentScreen) return;
    this.atlasDrag=undefined;this.suppressAtlasClick=false;
    this.currentScreen = screen;
    this.overlay.classList.toggle("atlas-open", screen === "atlas");
    this.overlay.hidden = screen === "running";
    if (screen === "running") return;
    if(screen==='fares'){
      const offers=mission.fareBoard.map(offer=>{
        const pickup=district.taxi!.stops.find(stop=>stop.id===offer.pickupId)!,destination=district.taxi!.stops.find(stop=>stop.id===offer.destinationId)!;
        const supplement=Math.round(Math.max(0,offer.approachDistance-1000)*2.5);
        return `<button type="button" data-fare-offer="${offer.id}" aria-pressed="false"><b>${escapeHtml(offer.passenger)}</b>${mission.fareLabel(offer)?`<strong>${escapeHtml(mission.fareLabel(offer))}</strong>`:""}<span>From ${escapeHtml(pickup.name)}, ${escapeHtml(pickup.road)}</span><span>To ${escapeHtml(destination.name)}, ${escapeHtml(destination.road)}</span><strong>${offer.quoted?`Guaranteed ${formatMoney(mission.offerGuaranteeCents(offer))}${supplement?` (includes ${formatMoney(supplement)} collection)`:''} + up to ${formatMoney(district.taxi!.maxBonusCents)} speed bonus`:'Quote pending'}</strong></button>`;
      }).join('');
      this.overlay.innerHTML=`<section class="fare-board modal" aria-labelledby="screen-title"><span class="eyebrow accent">TAXI DISPATCH / TIME PAUSED</span><h1 id="screen-title">Available fares</h1><p>${district.taxi?.mixedTownFares?'Local and inter-town jobs share this list. Inter-town quotes include an extra €12 plus distance pay. ':''}Prices are fixed from where this list was issued; collection supplements and fares pay only on delivery.</p><div class="fare-list" role="group" aria-label="Available fares">${offers}</div><div class="fare-actions"><button type="button" data-fare="accept">Accept selected</button><button type="button" data-fare="refresh">New list</button><button type="button" data-fare="close">Close list</button></div><small>A closed list is kept until you accept a fare or ask for a new one, and you can show it again while stopped. Pause to save the shift.</small></section>`;
      this.setFareSelection(this.fareSelection);
      return;
    }
    if (screen === "atlas") {
      const target=mission.target;setAtlasJourney(target&&!mission.finished?{objective:mission.objective,bay:target.bay}:undefined);
      this.atlasPage = "map";
      this.overlay.innerHTML = atlasMarkup(this.atlasPage);
      this.updateAtlasNotes();
      this.overlay.querySelector<HTMLButtonElement>("[data-atlas-close]")?.focus();
      return;
    }
    const controlsNote=`<small class="controller-note">Every key and button is listed under Change controls in the Picture &amp; Sound panel.</small>`;
    if (screen === "briefing") {
      this.overlay.innerHTML = `<section class="briefing modal" aria-labelledby="screen-title">
        <div class="briefing-main">${towns.length>1?`<div class="world-choice"><span class="eyebrow accent">CHOOSE WORLD</span><div class="district-switch" aria-label="Choose world">${towns.map(map=>`<button type="button" data-district="${map.id}" aria-pressed="${map.id===district.id}">${escapeHtml(map.name)}</button>`).join('')}</div><small class="controller-note">D-pad / left stick: choose world or Begin game · A: confirm. Keyboard: ← / →, Enter.</small></div>`:''}<span class="eyebrow accent">CEREA VICE</span>
          <h1 id="screen-title">${mission.taxiMode ? mission.endless?`Taxi driving<br> <em>Day &amp; night</em>`:`Taxi shift<br> <em>${mission.shiftLabel}</em>` : `Find<br> <em>${district.mission.name}</em>`}</h1>
          <p class="intro">${mission.taxiMode ? mission.endless?`Take passengers around the towns at any hour. Rest when you want.`:`Collect passengers and earn as much as you can before ${mission.shiftLabel.split("–")[1]}.` : district.mission.objective}</p>
          <button type="button">Begin game <span aria-hidden="true">&gt;</span></button>${mission.taxiMode ? "" : `<span class="button-note">${Math.round(district.mission.duration/60)} MINUTE DRIVE</span>`}
        </div>
        <div class="briefing-side"><span class="eyebrow">${district.name.toUpperCase()}</span><p>${mission.taxiMode?`When you want a passenger, stop, request the fare list and accept a fare. Stop in the pickup's named bay to collect them, and again at their destination.`:district.mission.hint}</p><small class="controller-note">${district.attribution}</small>
          <div class="briefing-tip">${mission.taxiMode ? `<b>${mission.endless?"Service never closes. Rest for 8 hours from the pause menu when stopped and free of passengers.":`${mission.shiftLabel} in about ${Math.ceil(mission.duration/60)} active minutes.`}</b><p>Faster rides earn a bigger bonus; slow rides still pay the base fare. The clock runs while you drive and stops while paused or reading the atlas or fare list.</p>` : ""}<b>Lost? Pull over.</b><p>Come to a full stop anywhere, then open the atlas or ask for information. Marked P bays are legal stopping places.</p></div>
          ${controlsNote}<small class="controller-note" id="controller-status" role="status"></small>
        </div>
      </section>`;
      // World choice comes first; never open scrolled down past it.
      this.overlay.scrollTop=0;
    } else if (screen === "paused") {
      this.overlay.innerHTML = `<section class="pause modal" aria-labelledby="screen-title"><span class="eyebrow accent">TIMER PAUSED</span><h1 id="screen-title">Paused</h1>${controlsNote}<small class="controller-note" id="controller-status" role="status"></small><button type="button">Back to the road <span aria-hidden="true">&gt;</span></button></section>`;
    } else if(mission.taxiMode) {
      this.overlay.innerHTML=`<section class="result modal" aria-labelledby="screen-title"><span class="eyebrow accent">${mission.clockText} / TAXI SHIFT COMPLETE</span><h1 id="screen-title">You earned ${formatMoney(mission.earningsCents)}.</h1><div class="result-stats"><div><strong>${formatMoney(mission.earningsCents)}</strong><span>TOTAL FARES</span></div><div><strong>${formatMoney(mission.bonusEarnedCents)}</strong><span>SPEED BONUSES</span></div><div><strong>${mission.completedFares}</strong><span>COMPLETED RIDES</span></div><div><strong>${car.collisions}</strong><span>COLLISIONS</span></div><div><strong>${mission.directionRequestCount}</strong><span>INFORMATION REQUESTS</span></div></div>${mission.unfinishedPassenger?"<p>The passenger still aboard at closing time is not counted as a completed fare.</p>":""}<button type="button">Start another shift <span aria-hidden="true">&gt;</span></button><span class="button-note">RESTARTS AT ${mission.shiftLabel.split("–")[0]}</span></section>`;
    } else {
      const success = mission.state === "success";
      this.overlay.innerHTML = `<section class="result modal" aria-labelledby="screen-title">
        <span class="eyebrow accent">DRIVE COMPLETE / ${district.mission.name.toUpperCase()}</span>
        <h1 id="screen-title">${success ? "Arrived on time." : "Arrived late."}</h1>
        <div class="result-stats">
          <div><strong>${formatTime(mission.elapsed)}</strong><span>DRIVING TIME</span></div>
          <div><strong>${parking.unsafeStops}</strong><span>UNSAFE STOPS</span></div>
          <div><strong>${car.collisions}</strong><span>COLLISIONS</span></div>
          <div><strong>${mission.directionRequestCount}</strong><span>DIRECTION REQUESTS</span></div>
          <div><strong>${mission.directionRequests.legal}</strong><span>LEGAL REQUESTS</span></div>
          <div><strong>${mission.directionRequests.unsafe}</strong><span>UNSAFE REQUESTS</span></div>
        </div>
        <button type="button">Take another drive <span aria-hidden="true">&gt;</span></button>
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
    const target=mission.finished?undefined:mission.target;
    const stage=document.querySelector<HTMLElement>('#objective-stage')!;
    const title=document.querySelector<HTMLElement>('#objective-title')!;
    const description=document.querySelector<HTMLElement>('#objective-description')!;
    const taxiStatus=document.querySelector<HTMLElement>('#taxi-status')!;
    if(mission.taxiMode) {
      stage.textContent=`TAXI / ${!target?'FREE DRIVING':mission.taxiStage==='pickup'?'COLLECT PASSENGER':mission.boarding>0?'PASSENGER BOARDING':'PASSENGER ABOARD'}`;
      if(description.textContent!==mission.objective)description.textContent=mission.objective;
      taxiStatus.hidden=false;
      taxiStatus.textContent=`${formatMoney(mission.earningsCents)} earned · ${mission.completedFares} fares${mission.taxiStage==='dropoff'?` · base ${formatMoney(mission.baseFareCents)} + speed bonus ${formatMoney(mission.potentialBonusCents)}`:''}`;
      document.querySelector('.deadline > span')!.textContent="TIME";
    }
    const caption=document.querySelector<HTMLElement>('.goal-caption')!;caption.hidden=!target;
    const captionText=mission.taxiMode&&mission.taxiStage==='pickup'?'PICKUP':'DESTINATION';
    const captionLabel=document.querySelector('#goal-caption')!;if(captionLabel.textContent!==captionText)captionLabel.textContent=captionText;
    const label=goalLabel(target,mission.taxiStage==='pickup'?mission.pickupStop:mission.destinationStop,district.id==='cerea'?'Cerea':district.name);
    const landmark=!target&&mission.finished?'Journey complete':label.landmark;
    if(title.textContent!==landmark)title.textContent=landmark;
    const town=document.querySelector('#goal-town')!,street=document.querySelector('#goal-street')!;
    if(town.textContent!==label.town)town.textContent=label.town;
    const streetName=label.street||(target?nearestRoad(target.bay).edge.name:'');
    if(street.textContent!==streetName)street.textContent=streetName;
    const earnings=document.querySelector<HTMLElement>('#earnings')!;
    const earned=formatMoney(mission.earningsCents);if(earnings.textContent!==earned)earnings.textContent=earned;
    earnings.title=taxiStatus.textContent??'';
    document.querySelector<HTMLElement>('.earnings-counter')!.hidden=!mission.taxiMode;
    const message=document.querySelector<HTMLElement>('.navigation-message')!;
    message.hidden=this.currentScreen!=='running'||this.messageKind==='none'||performance.now()>=this.messageUntil||(this.messageKind==='taxi'&&!parking.stopped);
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
    this.device.textContent =
      device === "Controller"
        ? "● Controller connected"
        : gamepadBlocked
          ? "Keyboard · controller restricted"
          : "Keyboard controls";
    this.device.title = gamepadBlocked
      ? "Open the preview in a new browser tab to use a controller."
      : "";
    const serve=mission.canServe(car,parking.stopped)?`${mission.taxiStage==='pickup'?`Collect ${escapeHtml(mission.passenger)}`:'Complete fare'} · `:'';
    const fares=mission.freeDriving&&!mission.finished?`${mission.fareBoard.length?'Show fare list':'Request fares'} · `:'';
    this.prompt.innerHTML = mission.boarding>0
      ? `${escapeHtml(mission.passenger)} is getting in · stay stopped`
      : parking.stopped
      ? `${serve}${fares}Ask for information · Atlas · ${car.gear === "D" ? "Select reverse" : "Select forward"} <span>· ${parking.zone ?? (parking.legal ? "stopping allowed" : "unsafe stopping place")}</span>`
      : "";
    this.prompt.hidden=!parking.stopped&&mission.boarding===0;
  }
}
return {formatMoney,formatTime,Hud};
}
export type Hud=InstanceType<ReturnType<typeof createHud>["Hud"]>;
