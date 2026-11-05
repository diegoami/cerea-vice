import type {NavigationTarget,TaxiStop} from '../world/schema';
/** Destination data only: never derive the driver's current street or position for the HUD. */
export function goalLabel(target:NavigationTarget|undefined,stop?:TaxiStop,fallbackTown=''){
 if(!target)return {landmark:'No destination',town:'',street:''};
 const suffix=target.name.match(/\s*\(([^)]+)\)$/);
 const id=stop?.townId??(stop?.id.includes(':')?stop.id.split(':')[0]:undefined);
 const inferred=id?.replace(/-/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase())??fallbackTown;
 const town=id==='verona-south'?'Verona':id==='cerea'?'Cerea':stop?.town??suffix?.[1]??inferred;
 return {landmark:target.name.replace(/\s*\([^)]+\)$/,''),town,street:target.road??stop?.road??''};
}
