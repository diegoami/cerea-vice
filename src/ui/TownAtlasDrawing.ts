import {roadWidth,type District,type Point,type Rect} from '../world/district';
import {atlasLabel} from '../world/placeNames';
import type {AtlasSheet} from '../navigation/AtlasSheets';

interface Paper {minX:number;minZ:number;span:number;width:number;depth:number;unit:number}
interface Street {key:string;name:string;x:number;z:number;angle:number;tier:number}
const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const overlaps=(points:readonly Point[],paper:Paper)=>{
 let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
 for(const p of points){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);}
 return x1>=paper.minX&&x0<=paper.minX+paper.width&&z1>=paper.minZ&&z0<=paper.minZ+paper.depth;
};
const corners=(r:Rect)=>[{x:r.x-r.width/2,z:r.z-r.depth/2},{x:r.x+r.width/2,z:r.z+r.depth/2}];
function polygon(rings:readonly Point[][]){
 return rings.map((ring,index)=>{
  const area=ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.z-q.x*p.z;},0);
  const points=(area>0)===(index===0)?ring:[...ring].reverse();
  return `M ${points.map(p=>`${p.x} ${p.z}`).join(' L ')} Z`;
 }).join(' ');
}
/** Few batched paths, no whole-world building DOM, and only the selected town's labels. */
export function drawTownAtlas(context:District,sheet:AtlasSheet|undefined,sheets:readonly AtlasSheet[],streets:readonly Street[],paper:Paper,tierFor:(roadClass?:string)=>number){
 const {district}=context,regional=!sheet,u=paper.unit;
 const roads=context.roads.filter(r=>regional?tierFor(r.roadClass)===1:overlaps([context.nodeById(r.a),context.nodeById(r.b)],paper));
 const roadPaths=(tier:number,extra:number)=>{
  const groups=new Map<number,string[]>();
  for(const r of roads){if(tierFor(r.roadClass)!==tier)continue;const a=context.nodeById(r.a),b=context.nodeById(r.b),width=roadWidth(r)+extra,list=groups.get(width)??[];list.push(`M ${a.x} ${a.z} L ${b.x} ${b.z}`);groups.set(width,list);}
  return [...groups].map(([width,paths])=>`<path d="${paths.join(' ')}" stroke-width="${width}"/>`).join('');
 };
 const roadDrawing=[3,2,1].map(tier=>`<g data-road-tier="${tier}"><g fill="none" stroke="#8b8e76" stroke-linecap="round">${roadPaths(tier,2)}</g><g fill="none" stroke="#f9f2df" stroke-linecap="round">${roadPaths(tier,0)}</g></g>`).join('');
 const buildings=regional?'':district.buildings.filter(b=>b.points&&overlaps(b.points,paper)).map(b=>polygon([b.points!,...(b.holes??[])])).join(' ');
 const areas=[...(district.waterAreas??[]).filter(a=>overlaps(a.points,paper)).map(a=>`<path d="${polygon([a.points,...(a.holes??[])])}" fill="#9cbfc1"/>`),...(!regional?(district.pavedAreas??[]).filter(a=>overlaps(a.points,paper)).map(a=>`<path d="${polygon([a.points,...(a.holes??[])])}" fill="#e9e0c9"/>`):[])].join('');
 const featureGroups=new Map<string,string[]>();
 for(const f of district.features){if(!overlaps(f.points,paper))continue;const key=`${f.kind}|${f.width}`,paths=featureGroups.get(key)??[];paths.push(`M ${f.points.map(p=>`${p.x} ${p.z}`).join(' L ')}`);featureGroups.set(key,paths);}
 const features=[...featureGroups].map(([key,paths])=>{const [kind,width]=key.split('|');return `<path d="${paths.join(' ')}" fill="none" stroke="${kind==='water'?'#9cbfc1':'#756e5b'}" stroke-width="${width}" ${kind==='rail'?'stroke-dasharray="3 2"':''}/>`;}).join('');
 const places=regional?'':context.landmarks.filter(p=>overlaps(p.points??corners(p),paper)).map(p=>{
  const points=p.points??[{x:p.x-p.width/2,z:p.z-p.depth/2},{x:p.x+p.width/2,z:p.z-p.depth/2},{x:p.x+p.width/2,z:p.z+p.depth/2},{x:p.x-p.width/2,z:p.z+p.depth/2}];
  return `<path d="${polygon([points,...(p.holes??[])])}" class="atlas-building"/><text x="${p.x}" y="${p.z-p.depth/2-4*u}" class="atlas-place-label" data-map-label="place" style="font-size:${4.5*u}px">${xml(atlasLabel(p).toUpperCase())}</text>`;
 }).join('');
 const bays=regional?'':context.parkingZones.filter(p=>overlaps(corners(p),paper)).map(p=>`<rect x="${p.x-p.width/2}" y="${p.z-p.depth/2}" width="${p.width}" height="${p.depth}" class="atlas-bay"/><text x="${p.x}" y="${p.z+2*u}" class="atlas-parking" data-map-label="parking">P</text>`).join('');
 const labels=regional?'':streets.map(s=>`<text data-street="${xml(s.key)}" data-angle="${s.angle}" data-road-tier="${s.tier}" x="${s.x}" y="${s.z-u}" transform="rotate(${s.angle} ${s.x} ${s.z-u})" style="font-size:${4*u}px">${xml(s.name.toUpperCase())}</text>`).join('');
 const towns=regional?`<g class="atlas-town-areas">${sheets.map(s=>`<rect data-atlas-sheet="${xml(s.id)}" x="${s.minX}" y="${s.minZ}" width="${s.width}" height="${s.depth}" fill="#cbd6b8" stroke="#728777" stroke-width="8"/>`).join('')}</g><g class="atlas-town-labels">${sheets.map(s=>`<text data-map-label="town" x="${s.minX+s.width!/2}" y="${s.minZ+s.depth!/2}">${xml(s.name)}</text>`).join('')}</g>`:'';
 const grid=regional?'':`<g class="atlas-grid">${Array.from({length:5},(_,i)=>`<path d="M ${paper.minX+i*paper.width/4} ${paper.minZ} V ${paper.minZ+paper.depth} M ${paper.minX} ${paper.minZ+i*paper.depth/4} H ${paper.minX+paper.width}"/>`).join('')}</g>`;
 const gridLabels=regional?'':`<g class="atlas-grid-label">${['A','B','C','D'].map((l,i)=>`<text data-grid-letter="${i}" x="${paper.minX+(i+.5)*paper.width/4}" y="${paper.minZ-5*u}">${l}</text>`).join('')}${[1,2,3,4].map((n,i)=>`<text data-grid-number="${i}" x="${paper.minX-7*u}" y="${paper.minZ+(i+.5)*paper.depth/4}">${n}</text>`).join('')}</g>`;
 return `<svg class="atlas-map" data-atlas-drawing="${regional?'regional':'town'}" viewBox="${paper.minX-14*u} ${paper.minZ-17*u} ${paper.width+28*u} ${paper.depth+28*u}" role="img" aria-labelledby="atlas-map-title atlas-map-description">
 <title id="atlas-map-title">${xml(sheet?.name??district.name)} atlas, north at the top</title><desc id="atlas-map-description">${regional?'Towns and connecting roads. Choose a town for detailed streets.':'Town streets, landmarks and stopping bays.'} No live position or route line.</desc>
 <defs><clipPath id="atlas-paper-clip"><rect x="${paper.minX}" y="${paper.minZ}" width="${paper.width}" height="${paper.depth}"/></clipPath></defs>
 <rect x="${paper.minX}" y="${paper.minZ}" width="${paper.width}" height="${paper.depth}" fill="#dedfc7"/>
 <g clip-path="url(#atlas-paper-clip)">${areas}${buildings?`<path class="atlas-scenery-buildings" d="${buildings}" fill="#cdc3a8" stroke="#b6ab8e" stroke-width="${.2*u}"/>`:''}${features}${grid}${roadDrawing}${towns}${bays}${places}<g class="atlas-road-label">${labels}</g></g>${gridLabels}
 <g clip-path="url(#atlas-paper-clip)"><g class="atlas-pin" style="display:none" role="img" aria-label="Your marker"><circle/><path/></g><g class="atlas-cursor" aria-hidden="true"><circle/><path/></g></g>
 <g class="atlas-north" transform="translate(${paper.minX+paper.width-9*u} ${paper.minZ+8*u}) scale(${u})"><path d="M 0 1 V 16 M -4 6 L 0 0 L 4 6"/><text x="0" y="-5">N</text></g></svg>`;
}
