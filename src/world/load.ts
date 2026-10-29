import { District } from "./district";

/** One playable district in `public/maps/towns.json`. Spec-built towns are kept up to date by tools/import-town.py. */
export interface TownEntry {
  id:string; name:string;
  /** Map file relative to `maps/`: a district JSON or a streaming manifest. */
  map:string;
  dataVersion:number; attribution:string;
  /** `local`: real geography around its own origin; `regional`: the shared regional frame; `authored`: fictional, handmade coordinates. */
  frame:"local"|"regional"|"authored";
  taxi:boolean; provenance:boolean;
  /** Town spec that builds this map, or null for handmade or derived districts. */
  spec:string|null;
  derivedFrom?:string;
  /** Fixed poses for tools/capture-views.mjs. */
  views?:{name:string;bay?:string;x?:number;z?:number}[];
}
export interface TownRegistry { version:1; default:string; towns:TownEntry[] }

const plain=(value:unknown):value is string=>typeof value==="string"&&value.length>0;
/** Text shown to the player: no markup, as for district text (district.ts). Folders loaded at runtime (#33) are untrusted. */
const shown=(value:unknown):value is string=>plain(value)&&value.length<200&&!/[<>]/.test(value);
/** Validate the district list, naming the first problem. */
export function validateRegistry(value:unknown):TownRegistry {
  const fail=(message:string)=>{throw new Error(`District list: ${message}`);};
  if(!value||typeof value!=="object")fail("not a JSON object");
  const data=value as Partial<TownRegistry>;
  if(data.version!==1)fail("version must be 1");
  if(!Array.isArray(data.towns)||!data.towns.length)fail("no districts are listed");
  const ids=new Set<string>();
  for(const town of data.towns!){
    if(!town||!plain(town.id)||!/^[a-z0-9-]+$/.test(town.id))fail(`an entry has an invalid id`);
    if(ids.has(town.id))fail(`"${town.id}" is listed twice`);ids.add(town.id);
    if(!shown(town.name)||!shown(town.attribution))fail(`"${town.id}" needs a plain-text name and attribution`);
    if(!plain(town.map)||town.map.includes("..")||town.map.startsWith("/")||!/\.json$/.test(town.map))fail(`"${town.id}" needs a map file inside maps/`);
    if(!Number.isInteger(town.dataVersion)||town.dataVersion<1)fail(`"${town.id}" needs a positive data version`);
    if(!["local","regional","authored"].includes(town.frame))fail(`"${town.id}" has an unknown frame`);
    if(typeof town.taxi!=="boolean"||typeof town.provenance!=="boolean")fail(`"${town.id}" needs taxi and provenance flags`);
    if(town.spec!==null&&!plain(town.spec))fail(`"${town.id}" has an invalid spec path`);
  }
  if(!plain(data.default)||!ids.has(data.default))fail("the default district is not listed");
  return data as TownRegistry;
}
export async function loadRegistry(base=window.location.href):Promise<TownRegistry> {
  const response=await fetch(new URL("./maps/towns.json",base));
  if(!response.ok)throw new Error("District list: maps/towns.json could not be loaded");
  return validateRegistry(await response.json());
}
export function requestedDistrict(registry:TownRegistry): string {
  const listed=(id:string|null)=>registry.towns.some((town)=>town.id===id);
  const hash = new URLSearchParams(window.location.hash.slice(1)).get("district");
  if(listed(hash))return hash!;
  // A remembered choice that is no longer listed falls back to the default; its saves are kept.
  try { const saved=localStorage.getItem("cerea-district");if(listed(saved))return saved!; } catch { /* A preview may restrict storage. */ }
  return registry.default;
}
export class DistrictLoadError extends Error {
  constructor(readonly town:TownEntry, readonly registry:TownRegistry){super(`Could not load district ${town.id} (maps/${town.map})`);}
}
export async function loadSelectedDistrict() {
  const registry=await loadRegistry();
  const town=registry.towns.find((entry)=>entry.id===requestedDistrict(registry))!;
  const sourceUrl=new URL(`./maps/${town.map}`,window.location.href);
  let context:District;
  try{
    const response=await fetch(sourceUrl);
    if(!response.ok)throw new Error(response.statusText);
    context=new District(await response.json(),{profile:new URLSearchParams(window.location.search).has("profile"),assetBase:new URL("./",sourceUrl).href});
  }catch(cause){console.error(cause);throw new DistrictLoadError(town,registry);}
  if(context.district.id!==town.id)throw new DistrictLoadError(town,registry);
  return {context,towns:registry.towns};
}
export function selectDistrict(towns:readonly Pick<TownEntry,"id">[], id: string) {
  if(!towns.some((town)=>town.id===id))return;
  try { localStorage.setItem("cerea-district",id); } catch { /* Hash remains a fallback. */ }
  history.replaceState(null,"",`#district=${id}`);
  window.location.reload();
}
