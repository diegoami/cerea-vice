import { areaAt, canal, harbor, landmarks, nodeById, parkingZones, roads, type Point, type ParkingZone } from "../world/district";

export type AtlasPage = "map" | "index";

export function atlasReference(point: Point): string {
  const column = Math.max(0, Math.min(3, Math.floor((point.x + 120) / 60)));
  const row = Math.max(0, Math.min(3, Math.floor((point.z + 120) / 60)));
  return `${"ABCD"[column]}${row + 1}`;
}

function mapSvg(lastKnown: ParkingZone) {
  const grid = [-120, -60, 0, 60, 120].map((value) =>
    `<path d="M ${value} -120 V 120 M -120 ${value} H 120"/>`).join("");
  const roadPaths = roads.map((road) => {
    const a = nodeById(road.a), b = nodeById(road.b);
    return `<path d="M ${a.x} ${a.z} L ${b.x} ${b.z}"/>`;
  }).join("");
  const bays = parkingZones.map((zone) => `<g><rect x="${zone.x - zone.width / 2}" y="${zone.z - zone.depth / 2}" width="${zone.width}" height="${zone.depth}" class="atlas-bay"/><text x="${zone.x}" y="${zone.z + 2}" class="atlas-parking">P</text></g>`).join("");
  const places = landmarks.map((place) => `<g><rect x="${place.x - place.width / 2}" y="${place.z - place.depth / 2}" width="${place.width}" height="${place.depth}" class="atlas-building atlas-building-${place.id}"/></g>`).join("");
  return `<svg class="atlas-map" viewBox="-134 -137 268 268" role="img" aria-labelledby="atlas-map-title atlas-map-description">
    <title id="atlas-map-title">Harbor District street atlas, north at the top</title>
    <desc id="atlas-map-description">Harbor Road forms the southern loop, Tower Lane the northern loop, Market Street the west side and central east-west road, Central Avenue runs north-south through the centre, and East Quay forms the east side. The Blue Hotel is east of East Quay. Old Market is northwest of Central Crossroads. The Water Tower is in the northwest, and the service station is beside Harbor Road. P marks the four legal stopping bays. The red marker records the last known legal parking spot, ${lastKnown.name}. It does not track the car or show a route.</desc>
    <rect x="-120" y="-120" width="240" height="240" fill="#dedfc7"/>
    <g class="atlas-water"><rect x="${canal.x - canal.width / 2}" y="${canal.z - canal.depth / 2}" width="${canal.width}" height="${canal.depth}"/><rect x="-120" y="${harbor.z - harbor.depth / 2}" width="240" height="8"/></g>
    <g class="atlas-grid">${grid}</g>
    <g class="atlas-region-label"><text x="-40" y="64">HARBOR WARD</text><text x="0" y="-106">OLD TOWN</text><text x="103" y="36" transform="rotate(-90 103 36)">WATERFRONT</text></g>
    <g class="atlas-road-edge">${roadPaths}</g><g class="atlas-roads">${roadPaths}</g>
    <path d="M 27 -87 H 53 M 27 -73 H 53" class="atlas-bridge"/>
    <path d="M -114 58 H -68 M -114 62 H -68" class="atlas-rail"/>
    ${bays}${places}
    <g class="atlas-road-label"><text x="0" y="82">HARBOR ROAD</text><text x="-20" y="-78">TOWER LANE</text><text x="-40" y="2">MARKET STREET</text><text x="1" y="42" transform="rotate(-90 1 42)">CENTRAL AVENUE</text><text x="81" y="28" transform="rotate(-90 81 28)">EAST QUAY</text></g>
    <g class="atlas-place-label"><text x="115" y="-23" text-anchor="end">BLUE HOTEL</text><text x="-42" y="-17">OLD MARKET</text><text x="-115" y="-108" text-anchor="start">WATER TOWER</text><text x="24" y="111">SERVICE STATION</text></g>
    <text x="47" y="-99" class="atlas-feature-label">CANAL</text><text x="-98" y="54" class="atlas-feature-label">RAIL SPUR</text><text x="-93" y="118" class="atlas-feature-label">HARBOR</text>
    <g class="atlas-grid-label">${["A", "B", "C", "D"].map((letter, i) => `<text x="${-90 + i * 60}" y="-125">${letter}</text>`).join("")}${[1, 2, 3, 4].map((row, i) => `<text x="-127" y="${-88 + i * 60}">${row}</text>`).join("")}</g>
    <g class="atlas-pin" transform="translate(${lastKnown.x} ${lastKnown.z})" role="img" aria-label="Last known parking spot: ${lastKnown.name}"><circle r="4"/><path d="M -2 -2 L 2 2 M -2 2 L 2 -2"/></g>
    <g class="atlas-north"><path d="M 111 -111 V -96 M 107 -106 L 111 -112 L 115 -106"/><text x="111" y="-117">N</text></g>
  </svg>`;
}

function indexMarkup() {
  const entries = [...landmarks.map((place) => ({ name: place.name, road: place.road, area: areaAt(place), ref: atlasReference(place) })),
    ...parkingZones.map((zone) => ({ name: zone.name, road: "Legal stopping bay", area: areaAt(zone), ref: atlasReference(zone) }))]
    .sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="atlas-index"><h2>Places and parking</h2><table><thead><tr><th scope="col">Place</th><th scope="col">Street / area</th><th scope="col">Grid</th></tr></thead><tbody>${entries.map((entry) => `<tr><th scope="row">${entry.name}</th><td>${entry.road}<small>${entry.area}</small></td><td class="atlas-ref">${entry.ref}</td></tr>`).join("")}</tbody></table><p>Grid letters run west to east; numbers run north to south. Match a place’s reference to the squares on the district map.</p></div>`;
}

/** Printed geography and the last settled legal bay; never a live vehicle position. */
export function atlasMarkup(page: AtlasPage, lastKnown: ParkingZone): string {
  return `<section class="atlas-book" role="dialog" aria-modal="true" aria-labelledby="atlas-title">
    <header class="atlas-header"><div><span class="atlas-edition">CEREA MOTORING ATLAS · 1986 EDITION</span><h1 id="atlas-title">Harbor District</h1></div><span class="atlas-paused">PARKED READING · TIMER PAUSED</span></header>
    <nav class="atlas-tabs" aria-label="Atlas pages"><button type="button" data-atlas-page="map" aria-pressed="${page === "map"}">01 · District map</button><button type="button" data-atlas-page="index" aria-pressed="${page === "index"}">02 · Place index</button></nav>
    <div class="atlas-content">${page === "map" ? `<div class="atlas-sheet">${mapSvg(lastKnown)}</div><aside class="atlas-margin"><h2>Finding your way</h2><p>North is at the top. Match street names, junctions and landmarks to the road outside.</p><h3>Key</h3><ul><li><span class="atlas-key-road"></span> Road</li><li><b>P</b> Legal stopping bay</li><li><span class="atlas-key-building"></span> Landmark</li><li><span class="atlas-key-water"></span> Water</li></ul><p>The red marker is your last known parking spot. It updates only after you stop in a marked P bay.</p><p class="atlas-margin-note">Unsure where you are? Close the atlas and ask for directions while stopped.</p></aside>` : indexMarkup()}</div>
    <div class="atlas-position" id="atlas-marker-status" role="status"><strong>Last known position</strong> ${lastKnown.name} · ${atlasReference(lastKnown)}</div>
    <footer class="atlas-footer"><span>LB / RB · D-pad ← →<br>Q / E · Arrow keys: turn page</span><button type="button" data-atlas-close>Close atlas <small>B / Circle · Y / Triangle · T / Esc</small></button></footer>
  </section>`;
}
