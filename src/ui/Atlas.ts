import { roadWidth, type Point } from "../world/district";
import { District } from "../world/district";
import { atlasLabel } from "../world/placeNames";
import { createAtlasSheets, type AtlasSheet } from '../navigation/AtlasSheets';
export type AtlasPage = "map" | "index";
export function createAtlas(context:District){
const {district,areaAt,landmarks,nodeById,parkingZones,roads}=context;
const {sheets,sheetAt,neighbour,stride}=createAtlasSheets(context);
let activeSheet:AtlasSheet|undefined;
const setAtlasSheet=(id?:string)=>{activeSheet=sheets.find(sheet=>sheet.id===id);};
function atlasFrame(sheet=activeSheet) {
  if(sheet)return {...sheet,unit:sheet.span/240};
  const bounds=district.bounds;
  const span=Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ);
  if(sheets.length)return {minX:bounds.minX,minZ:bounds.minZ,span,unit:span/240};
  const cx=(bounds.minX+bounds.maxX)/2,cz=(bounds.minZ+bounds.maxZ)/2;
  return {minX:cx-span/2,minZ:cz-span/2,span,unit:span/240};
}
function atlasReference(point: Point): string {
  const sheet=sheetAt(point),frame=atlasFrame(sheet);
  const column=Math.max(0,Math.min(3,Math.floor((point.x-frame.minX)/frame.span*4)));
  const row=Math.max(0,Math.min(3,Math.floor((point.z-frame.minZ)/frame.span*4)));
  return `${sheet?sheet.id+' · ':''}${"ABCD"[column]}${row+1}`;
}
const xml=(value:string)=>value.replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
function streetEntries(sheet?:AtlasSheet) {
  const grouped=new Map<string,{a:Point;b:Point;length:number}>();
  for(const road of roads){
    let a:Point=nodeById(road.a),b:Point=nodeById(road.b);
    if(sheet){
      // Clip the candidate to the paper so a road continuing across a page gets its own label.
      const dx=b.x-a.x,dz=b.z-a.z;let start=0,end=1;
      for(const [p,q] of [[-dx,a.x-sheet.minX],[dx,sheet.minX+sheet.span-a.x],[-dz,a.z-sheet.minZ],[dz,sheet.minZ+sheet.span-a.z]]){
        if(p===0){if(q<0){end=-1;break;}}else if(p<0)start=Math.max(start,q/p);else end=Math.min(end,q/p);
      }
      if(start>=end)continue;
      b={x:a.x+dx*end,z:a.z+dz*end};a={x:a.x+dx*start,z:a.z+dz*start};
    }
    const length=Math.hypot(b.x-a.x,b.z-a.z);
    if(!grouped.has(road.name)||grouped.get(road.name)!.length<length)grouped.set(road.name,{a,b,length});
  }
  return [...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([name,{a,b}])=>{
    const x=(a.x+b.x)/2,z=(a.z+b.z)/2;
    let angle=Math.atan2(b.z-a.z,b.x-a.x)*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180;
    const frame=atlasFrame(sheet),column=Math.max(0,Math.min(3,Math.floor((x-frame.minX)/frame.span*4))),row=Math.max(0,Math.min(3,Math.floor((z-frame.minZ)/frame.span*4)));
    return {name,key:sheet?`${sheet.id}|${name}`:name,sheet:sheet?.id,x,z,angle,reference:`${sheet?sheet.id+' · ':''}${'ABCD'[column]}${row+1}`};
  });
}
let streetCache:ReturnType<typeof streetEntries>|undefined;
function atlasStreetEntries(){return streetCache??=(sheets.length?sheets.flatMap(sheet=>streetEntries(sheet)):streetEntries()).sort((a,b)=>a.name.localeCompare(b.name)||a.reference.localeCompare(b.reference));}
function mapSvg() {
  const {minX,minZ,span,unit:u}=atlasFrame();
  const overview=sheets.length>0&&!activeSheet;
  const width=overview?district.bounds.maxX-district.bounds.minX:span,height=overview?district.bounds.maxZ-district.bounds.minZ:span;
  const maxX=minX+width,maxZ=minZ+height;
  const points=(list:Point[])=>list.map((p)=>`${p.x},${p.z}`).join(" ");
  const grid=Array.from({length:5},(_,i)=>`<path d="M ${minX+i*span/4} ${minZ} V ${maxZ} M ${minX} ${minZ+i*span/4} H ${maxX}"/>`).join("");
  const edges=roads.map((road)=>{const a=nodeById(road.a),b=nodeById(road.b);return `<path d="M ${a.x} ${a.z} L ${b.x} ${b.z}" stroke-width="${roadWidth(road)+2}"/>`;}).join("");
  const paths=roads.map((road)=>{const a=nodeById(road.a),b=nodeById(road.b);return `<path d="M ${a.x} ${a.z} L ${b.x} ${b.z}" stroke-width="${roadWidth(road)}"/>`;}).join("");
  const labels=overview?'':atlasStreetEntries().filter(street=>street.sheet===activeSheet?.id).map(street=>`<text data-street="${xml(street.key)}" x="${street.x}" y="${street.z-1*u}" transform="rotate(${street.angle} ${street.x} ${street.z})" style="font-size:${4*u}px">${xml(street.name.toUpperCase())}</text>`).join("");
  const bays=parkingZones.map((zone)=>`<rect x="${zone.x-zone.width/2}" y="${zone.z-zone.depth/2}" width="${zone.width}" height="${zone.depth}" class="atlas-bay"/><text x="${zone.x}" y="${zone.z+2*u}" class="atlas-parking" data-map-label="parking" style="font-size:${6*u}px">P</text>`).join("");
  const places=landmarks.map((place)=>`<path d="${(place.points?[place.points,...(place.holes??[])]:[[{x:place.x-place.width/2,z:place.z-place.depth/2},{x:place.x+place.width/2,z:place.z-place.depth/2},{x:place.x+place.width/2,z:place.z+place.depth/2},{x:place.x-place.width/2,z:place.z+place.depth/2}]]).map(ring=>`M ${ring.map(p=>`${p.x} ${p.z}`).join(" L ")} Z`).join(" ")}" fill-rule="evenodd" class="atlas-building"/><text x="${place.x}" y="${place.z-place.depth/2-4*u}" class="atlas-place-label" data-map-label="place" style="font-size:${4.5*u}px">${xml(atlasLabel(place).toUpperCase())}</text>`).join("");
  const features=district.features.map((feature)=>`<polyline points="${points(feature.points)}" fill="none" stroke="${feature.kind==="water"?"#9cbfc1":"#756e5b"}" stroke-width="${feature.width}" ${feature.kind==="rail"?'stroke-dasharray="3 2"':""}/>`).join("");
  // Rivers and squares as areas (#25): water in the key's colour, squares in pale stone, under the buildings.
  const area=(rings:Point[][],fill:string)=>`<path d="${rings.map(ring=>`M ${ring.map(p=>`${p.x} ${p.z}`).join(" L ")} Z`).join(" ")}" fill-rule="evenodd" fill="${fill}"/>`;
  const areas=[...(district.waterAreas??[]).map(water=>area([water.points,...(water.holes??[])],"#9cbfc1")),...(district.pavedAreas??[]).map(square=>area([square.points,...(square.holes??[])],"#e9e0c9"))].join("");
  const buildings=district.buildings.map((building)=>building.points?`<path d="${[building.points,...(building.holes??[])].map(ring=>`M ${ring.map(p=>`${p.x} ${p.z}`).join(" L ")} Z`).join(" ")}" fill-rule="evenodd" fill="#cdc3a8" stroke="#b6ab8e" stroke-width="${0.2*u}"/>`:"").join("");
  return `<svg class="atlas-map" viewBox="${minX-14*u} ${minZ-17*u} ${span+28*u} ${span+28*u}" role="img" aria-labelledby="atlas-map-title atlas-map-description">
    <title id="atlas-map-title">${xml(district.name)} street atlas, north at the top</title>
    <desc id="atlas-map-description">Streets, landmarks, water, railway and stopping bays in ${xml(district.name)}. P marks game stopping bays. Asking for information updates the position marker; manual placement records your own estimate. No live tracking or route line.</desc>
    <defs><clipPath id="atlas-paper-clip"><rect x="${minX}" y="${minZ}" width="${width}" height="${height}"/></clipPath></defs>
    <rect x="${minX}" y="${minZ}" width="${width}" height="${height}" fill="#dedfc7"/>
    <g clip-path="url(#atlas-paper-clip)">
    ${areas}${buildings}${features}${overview?'':`<g class="atlas-grid">${grid}</g>`}
    <g fill="none" stroke="#8b8e76" stroke-linecap="round">${edges}</g><g fill="none" stroke="#f9f2df" stroke-linecap="round">${paths}</g>
    ${overview?'':bays+places}<g class="atlas-road-label">${labels}</g>
    ${overview?`<g class="atlas-quadrants">${sheets.map(sheet=>`<g data-atlas-sheet="${sheet.id}"><rect x="${sheet.minX+100}" y="${sheet.minZ+100}" width="${stride}" height="${stride}"/><text data-map-label="quadrant" x="${sheet.minX+150}" y="${sheet.minZ+250}">${sheet.id}</text></g>`).join('')}</g><g class="atlas-town-labels">${district.areas.map(area=>`<text data-map-label="town" x="${area.x}" y="${area.z}">${xml(area.name)}</text>`).join('')}</g>`:''}
    </g>
    ${overview?'':`<g class="atlas-grid-label" style="font-size:${5*u}px">${["A","B","C","D"].map((letter,i)=>`<text x="${minX+(i+0.5)*span/4}" y="${minZ-5*u}">${letter}</text>`).join("")}${[1,2,3,4].map((row,i)=>`<text x="${minX-7*u}" y="${minZ+(i+0.5)*span/4}">${row}</text>`).join("")}</g>`}
    <g clip-path="url(#atlas-paper-clip)"><g class="atlas-pin" style="display:none" role="img" aria-label="Your marker"><circle r="${3.2*u}"/><path d="M ${-2*u} ${-2*u} L ${2*u} ${2*u} M ${-2*u} ${2*u} L ${2*u} ${-2*u}"/></g>
    <g class="atlas-cursor" aria-hidden="true" style="stroke-width:${0.7*u}px"><circle r="${5*u}"/><path d="M ${-8*u} 0 H ${-3*u} M ${3*u} 0 H ${8*u} M 0 ${-8*u} V ${-3*u} M 0 ${3*u} V ${8*u}"/></g></g>
    <g class="atlas-north" transform="translate(${maxX-9*u} ${minZ+8*u}) scale(${u})"><path d="M 0 1 V 16 M -4 6 L 0 0 L 4 6"/><text x="0" y="-5">N</text></g>
  </svg>`;
}
function indexMarkup() {
  const entries = [...landmarks.map((place) => ({ name: place.name, road: place.road, area: areaAt(place), ref: atlasReference(place) })),
    ...parkingZones.map((zone) => ({ name: zone.name, road: "Legal stopping bay", area: areaAt(zone), ref: atlasReference(zone) }))]
    .sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="atlas-index"><h2>Places and parking</h2><table><thead><tr><th scope="col">Place</th><th scope="col">Street / area</th><th scope="col">${sheets.length?'Page · grid':'Grid'}</th></tr></thead><tbody>${entries.map((entry) => `<tr><th scope="row">${xml(entry.name)}</th><td>${xml(entry.road)}<small>${xml(entry.area)}</small></td><td class="atlas-ref">${entry.ref}</td></tr>`).join("")}</tbody></table><p>Grid letters run west to east; numbers run north to south.${sheets.length?' Page letters and numbers identify regional quadrants; the second reference is the local grid.':''}</p><h2>Street index</h2><table class="atlas-street-index"><thead><tr><th scope="col">Street</th><th scope="col">Grid</th></tr></thead><tbody>${atlasStreetEntries().map(street=>`<tr><th scope="row"><button type="button" class="atlas-street-link" data-atlas-street="${xml(street.key)}">${xml(street.name)}${sheets.length?`<small>${xml(sheets.find(sheet=>sheet.id===street.sheet)!.name)}</small>`:''}</button></th><td class="atlas-ref">${street.reference}</td></tr>`).join("")}</tbody></table></div>`;
}
function sheetNavigation(){
  if(!sheets.length)return '';
  return `<nav class="atlas-sheet-navigation" aria-label="Atlas quadrants"><strong>${activeSheet?`${activeSheet.id} · ${xml(activeSheet.name)}`:'Region overview · select a quadrant'}</strong>${activeSheet?[[0,-1,'North'],[-1,0,'West'],[1,0,'East'],[0,1,'South']].map(([dx,dz,label])=>{const next=neighbour(activeSheet!,Number(dx),Number(dz));return `<button type="button" ${next?`data-atlas-sheet="${next.id}"`:'disabled'}>${label}${next?' · '+next.id:''}</button>`;}).join(''):'<span>Crosshair + A / Enter opens a detail page</span>'}</nav>`;
}
function atlasMarkup(page: AtlasPage): string {
  return `<section class="atlas-book${sheets.length?' regional-atlas':''}" role="dialog" aria-modal="true" aria-labelledby="atlas-title">
    <header class="atlas-header"><div><span class="atlas-edition">STREET ATLAS${district.subtitle ? ` · ${xml(district.subtitle)}` : district.streaming ? " · FICTIONAL TEST LINK" : ""}</span><h1 id="atlas-title">${xml(district.name)}</h1></div><span class="atlas-paused">TIMER PAUSED</span></header>
    <nav class="atlas-tabs" aria-label="Atlas pages"><button type="button" data-atlas-page="map" aria-pressed="${page === "map"}">01 · District map</button><button type="button" data-atlas-page="index" aria-pressed="${page === "index"}">02 · Place index</button></nav>
    ${page === "index" ? `<section class="atlas-information" aria-label="Local information" hidden><strong>LAST INFORMATION RECEIVED</strong><p id="atlas-information-text" role="status"></p></section>` : ""}
    ${page==='map'?sheetNavigation():''}
    <div class="atlas-content">${page === "map" ? `<div class="atlas-sheet"><div class="atlas-zoom-controls" aria-label="Map zoom"><button type="button" data-atlas-zoom="-1" aria-label="Zoom out">−</button><output id="atlas-zoom-level" aria-label="Map zoom level">100%</output><button type="button" data-atlas-zoom="1" aria-label="Zoom in">+</button><button type="button" data-atlas-overview>Overview</button></div>${mapSvg()}</div><aside class="atlas-margin"><section class="atlas-information atlas-information-sidebar" aria-label="Local information" hidden><strong>LAST INFORMATION RECEIVED</strong><p id="atlas-information-text" role="status"></p></section><h3>Key</h3><ul><li><span class="atlas-key-road"></span> Road</li><li><b>P</b> Legal stopping bay</li><li><span class="atlas-key-building"></span> Landmark</li><li><span class="atlas-key-water"></span> Water</li></ul><p>${sheets.length&&!activeSheet?'Select a quadrant for streets. Detail pages overlap at their edges.':'The marker moves only when you ask for information or mark your own estimate. Click the map to mark it.'}</p></aside>` : indexMarkup()}</div>
    <div class="atlas-tools"><span id="atlas-marker-status" role="status">No position marked.</span><button type="button" data-atlas-information>Ask for information <small>View / Share · F</small></button><button type="button" data-atlas-place>${sheets.length&&!activeSheet?'Open quadrant':'Mark my position'} <small>A / Cross · Enter</small></button><button type="button" data-atlas-remove>Erase marker <small>X / Square · Delete</small></button></div>
    <div class="atlas-attribution">${xml(district.attribution)}${district.id === "cerea" ? " · Modern street subset; simplified scenery and game stopping bays." : ""}</div>
    <footer class="atlas-footer"><span>LB / RB · Q / E: ${sheets.length?'quadrants / index':'pages'} · RT / LT · + / − · wheel: zoom<br>${page === "map" ? "Right stick / I J K L / drag: pan · Left stick: crosshair · R3 / Home: overview" : "Left stick: scroll · Right stick / I K: select street · A / Enter / click: locate"}</span><button type="button" data-atlas-close>Close atlas <small>B / Circle · Y / Triangle · T / Esc</small></button></footer>
  </section>`;
}
return {atlasFrame,atlasReference,atlasStreetEntries,atlasMarkup,sheets,sheetAt,setAtlasSheet};
}
