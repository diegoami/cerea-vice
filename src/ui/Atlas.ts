import { district, areaAt, landmarks, nodeById, parkingZones, roads, type Point } from "../world/district";

export type AtlasPage = "map" | "index";

export function atlasFrame() {
  const bounds=district.bounds;
  const span=Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ);
  const cx=(bounds.minX+bounds.maxX)/2,cz=(bounds.minZ+bounds.maxZ)/2;
  return {minX:cx-span/2,minZ:cz-span/2,span,unit:span/240};
}
export function atlasReference(point: Point): string {
  const frame=atlasFrame();
  const column=Math.max(0,Math.min(3,Math.floor((point.x-frame.minX)/frame.span*4)));
  const row=Math.max(0,Math.min(3,Math.floor((point.z-frame.minZ)/frame.span*4)));
  return `${"ABCD"[column]}${row+1}`;
}
const xml=(value:string)=>value.replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
function mapSvg() {
  const {minX,minZ,span,unit:u}=atlasFrame();
  const maxX=minX+span,maxZ=minZ+span;
  const points=(list:Point[])=>list.map((p)=>`${p.x},${p.z}`).join(" ");
  const grid=Array.from({length:5},(_,i)=>`<path d="M ${minX+i*span/4} ${minZ} V ${maxZ} M ${minX} ${minZ+i*span/4} H ${maxX}"/>`).join("");
  const edges=roads.map((road)=>{const a=nodeById(road.a),b=nodeById(road.b);return `<path d="M ${a.x} ${a.z} L ${b.x} ${b.z}" stroke-width="${(road.width??16)+2}"/>`;}).join("");
  const paths=roads.map((road)=>{const a=nodeById(road.a),b=nodeById(road.b);return `<path d="M ${a.x} ${a.z} L ${b.x} ${b.z}" stroke-width="${road.width??16}"/>`;}).join("");
  const labels=[...new Set(roads.map((road)=>road.name))].map((name)=>{
    const road=roads.filter((road)=>road.name===name).sort((ra,rb)=>{const a=nodeById(ra.a),b=nodeById(ra.b),c=nodeById(rb.a),d=nodeById(rb.b);return Math.hypot(d.x-c.x,d.z-c.z)-Math.hypot(b.x-a.x,b.z-a.z);})[0];
    const a=nodeById(road.a),b=nodeById(road.b),x=(a.x+b.x)/2,z=(a.z+b.z)/2;
    let angle=Math.atan2(b.z-a.z,b.x-a.x)*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180;
    return `<text x="${x}" y="${z-1*u}" transform="rotate(${angle} ${x} ${z})" style="font-size:${4*u}px">${xml(name.toUpperCase())}</text>`;
  }).join("");
  const bays=parkingZones.map((zone)=>`<rect x="${zone.x-zone.width/2}" y="${zone.z-zone.depth/2}" width="${zone.width}" height="${zone.depth}" class="atlas-bay"/><text x="${zone.x}" y="${zone.z+2*u}" class="atlas-parking" style="font-size:${6*u}px">P</text>`).join("");
  const places=landmarks.map((place)=>`<path d="${(place.points?[place.points,...(place.holes??[])]:[[{x:place.x-place.width/2,z:place.z-place.depth/2},{x:place.x+place.width/2,z:place.z-place.depth/2},{x:place.x+place.width/2,z:place.z+place.depth/2},{x:place.x-place.width/2,z:place.z+place.depth/2}]]).map(ring=>`M ${ring.map(p=>`${p.x} ${p.z}`).join(" L ")} Z`).join(" ")}" fill-rule="evenodd" class="atlas-building"/><text x="${place.x}" y="${place.z-place.depth/2-4*u}" class="atlas-place-label" style="font-size:${4.5*u}px">${xml((place.kind==="church"?"San Zeno":place.kind==="school"?"Scuola Visentini":place.name).toUpperCase())}</text>`).join("");
  const features=district.features.map((feature)=>`<polyline points="${points(feature.points)}" fill="none" stroke="${feature.kind==="water"?"#9cbfc1":"#756e5b"}" stroke-width="${feature.width}" ${feature.kind==="rail"?'stroke-dasharray="3 2"':""}/>`).join("");
  const buildings=district.buildings.map((building)=>building.points?`<path d="${[building.points,...(building.holes??[])].map(ring=>`M ${ring.map(p=>`${p.x} ${p.z}`).join(" L ")} Z`).join(" ")}" fill-rule="evenodd" fill="#cdc3a8" stroke="#b6ab8e" stroke-width="${0.2*u}"/>`:"").join("");
  return `<svg class="atlas-map" viewBox="${minX-14*u} ${minZ-17*u} ${span+28*u} ${span+28*u}" role="img" aria-labelledby="atlas-map-title atlas-map-description">
    <title id="atlas-map-title">${xml(district.name)} street atlas, north at the top</title>
    <desc id="atlas-map-description">Streets, landmarks, water, railway and stopping bays in ${xml(district.name)}. P marks game stopping bays. Asking for information updates the position marker; manual placement records your own estimate. No live tracking or route line.</desc>
    <rect x="${minX}" y="${minZ}" width="${span}" height="${span}" fill="#dedfc7"/>
    ${buildings}${features}<g class="atlas-grid">${grid}</g>
    <g fill="none" stroke="#8b8e76" stroke-linecap="round">${edges}</g><g fill="none" stroke="#f9f2df" stroke-linecap="round">${paths}</g>
    ${bays}${places}<g class="atlas-road-label">${labels}</g>
    <g class="atlas-grid-label" style="font-size:${5*u}px">${["A","B","C","D"].map((letter,i)=>`<text x="${minX+(i+0.5)*span/4}" y="${minZ-5*u}">${letter}</text>`).join("")}${[1,2,3,4].map((row,i)=>`<text x="${minX-7*u}" y="${minZ+(i+0.5)*span/4}">${row}</text>`).join("")}</g>
    <g class="atlas-pin" style="display:none" role="img" aria-label="Your marker"><circle r="${3.2*u}"/><path d="M ${-2*u} ${-2*u} L ${2*u} ${2*u} M ${-2*u} ${2*u} L ${2*u} ${-2*u}"/></g>
    <g class="atlas-cursor" aria-hidden="true" style="stroke-width:${0.7*u}px"><circle r="${5*u}"/><path d="M ${-8*u} 0 H ${-3*u} M ${3*u} 0 H ${8*u} M 0 ${-8*u} V ${-3*u} M 0 ${3*u} V ${8*u}"/></g>
    <g class="atlas-north" transform="translate(${maxX-9*u} ${minZ+8*u}) scale(${u})"><path d="M 0 1 V 16 M -4 6 L 0 0 L 4 6"/><text x="0" y="-5">N</text></g>
  </svg>`;
}

function indexMarkup() {
  const entries = [...landmarks.map((place) => ({ name: place.name, road: place.road, area: areaAt(place), ref: atlasReference(place) })),
    ...parkingZones.map((zone) => ({ name: zone.name, road: "Legal stopping bay", area: areaAt(zone), ref: atlasReference(zone) }))]
    .sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="atlas-index"><h2>Places and parking</h2><table><thead><tr><th scope="col">Place</th><th scope="col">Street / area</th><th scope="col">Grid</th></tr></thead><tbody>${entries.map((entry) => `<tr><th scope="row">${entry.name}</th><td>${entry.road}<small>${entry.area}</small></td><td class="atlas-ref">${entry.ref}</td></tr>`).join("")}</tbody></table><p>Grid letters run west to east; numbers run north to south. Match a place’s reference to the squares on the district map.</p></div>`;
}

/** Printed geography only: this view never receives the car, heading or mission position. */
export function atlasMarkup(page: AtlasPage): string {
  return `<section class="atlas-book" role="dialog" aria-modal="true" aria-labelledby="atlas-title">
    <header class="atlas-header"><div><span class="atlas-edition">CEREA MOTORING ATLAS · ${district.id === "cerea" ? "MODERN STREETS / RETRO EDITION" : "1986 EDITION"}</span><h1 id="atlas-title">${xml(district.name)}</h1></div><span class="atlas-paused">PARKED READING · TIMER PAUSED</span></header>
    <nav class="atlas-tabs" aria-label="Atlas pages"><button type="button" data-atlas-page="map" aria-pressed="${page === "map"}">01 · District map</button><button type="button" data-atlas-page="index" aria-pressed="${page === "index"}">02 · Place index</button></nav>
    <div class="atlas-content">${page === "map" ? `<div class="atlas-sheet">${mapSvg()}</div><aside class="atlas-margin"><h2>Finding your way</h2><p>North is at the top. Match street names, junctions and landmarks to the road outside.</p><h3>Key</h3><ul><li><span class="atlas-key-road"></span> Road</li><li><b>P</b> Legal stopping bay</li><li><span class="atlas-key-building"></span> Landmark</li><li><span class="atlas-key-water"></span> Water</li></ul><p>Asking for information updates the marker. To mark where you think you are, click the map or move the crosshair and press A / Enter.</p><p class="atlas-margin-note">Unsure where you are? Close the atlas and ask for directions while stopped.</p></aside>` : indexMarkup()}</div>
    <div class="atlas-tools"><span id="atlas-marker-status" role="status">No position marked.</span><button type="button" data-atlas-place>Mark my position <small>A / Cross · Enter</small></button><button type="button" data-atlas-remove>Erase marker <small>X / Square · Delete</small></button></div>
    <div class="atlas-attribution">${xml(district.attribution)}${district.id === "cerea" ? " · Modern street subset; simplified scenery and game stopping bays." : ""}</div>
    <footer class="atlas-footer"><span>LB / RB · Q / E: pages<br>Stick / D-pad / arrows: move crosshair</span><button type="button" data-atlas-close>Close atlas <small>B / Circle · Y / Triangle · T / Esc</small></button></footer>
  </section>`;
}
