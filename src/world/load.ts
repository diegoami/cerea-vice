import { District } from "./district";

export const availableDistricts = [
  {id:"cerea",name:"Cerea Centro"},
  {id:"harbor",name:"Harbor District"},
  {id:"cerea-outskirts",name:"Cerea outskirts prototype"},
] as const;
export function requestedDistrict(): string {
  const hash = new URLSearchParams(window.location.hash.slice(1)).get("district");
  if(availableDistricts.some((map)=>map.id===hash))return hash!;
  try { const saved=localStorage.getItem("cerea-district");if(availableDistricts.some((map)=>map.id===saved))return saved!; } catch { /* A preview may restrict storage. */ }
  return "cerea";
}
export async function loadSelectedDistrict() {
  const id=requestedDistrict();
  const sourceUrl=new URL(id==="cerea-outskirts"?"./maps/cerea-outskirts/manifest.json":`./maps/${id}.json`,window.location.href);
  const response=await fetch(sourceUrl);
  if(!response.ok)throw new Error(`Could not load district ${id}`);
  return new District(await response.json(),{profile:new URLSearchParams(window.location.search).has("profile"),assetBase:new URL("./",sourceUrl).href});
}
export function selectDistrict(id: string) {
  if(!availableDistricts.some((map)=>map.id===id))return;
  try { localStorage.setItem("cerea-district",id); } catch { /* Hash remains a fallback. */ }
  history.replaceState(null,"",`#district=${id}`);
  window.location.reload();
}
