import { District } from "./district";

export const availableDistricts = [
  {id:"cerea",name:"Cerea Centro"},
  {id:"harbor",name:"Harbor District"},
] as const;
export function requestedDistrict(): string {
  const hash = new URLSearchParams(window.location.hash.slice(1)).get("district");
  if(availableDistricts.some((map)=>map.id===hash))return hash!;
  try { const saved=localStorage.getItem("cerea-district");if(availableDistricts.some((map)=>map.id===saved))return saved!; } catch { /* A preview may restrict storage. */ }
  return "cerea";
}
export async function loadSelectedDistrict() {
  const id=requestedDistrict();
  const response=await fetch(new URL(`./maps/${id}.json`,window.location.href));
  if(!response.ok)throw new Error(`Could not load district ${id}`);
  return new District(await response.json(),{profile:new URLSearchParams(window.location.search).has("profile")});
}
export function selectDistrict(id: string) {
  if(!availableDistricts.some((map)=>map.id===id))return;
  try { localStorage.setItem("cerea-district",id); } catch { /* Hash remains a fallback. */ }
  history.replaceState(null,"",`#district=${id}`);
  window.location.reload();
}
