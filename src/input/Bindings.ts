export const controlActions=['steerLeft','steerRight','throttle','brake','handbrake','shiftGear','interact','atlas','information','requestFares','reminder','resetLook','glanceLeft','glanceRight','radioNext'] as const;
export type ControlAction=typeof controlActions[number];
export type Bindings=Record<ControlAction,{keys:string[];button:number|null}>;
export const defaultBindings:Bindings={
 steerLeft:{keys:['KeyA','ArrowLeft'],button:null},steerRight:{keys:['KeyD','ArrowRight'],button:null},
 throttle:{keys:['KeyW','ArrowUp'],button:7},brake:{keys:['KeyS','ArrowDown'],button:6},
 handbrake:{keys:['Space'],button:2},shiftGear:{keys:['KeyR'],button:1},interact:{keys:['Enter'],button:0},
 atlas:{keys:['KeyT'],button:3},information:{keys:['KeyF'],button:8},requestFares:{keys:['KeyO'],button:13},reminder:{keys:['Tab','KeyM'],button:12},
 resetLook:{keys:['KeyC'],button:11},glanceLeft:{keys:['KeyQ'],button:4},glanceRight:{keys:['KeyE'],button:5},
 radioNext:{keys:['KeyV'],button:15},
};
export const actionLabels:Record<ControlAction,string>={steerLeft:'Steer left',steerRight:'Steer right',throttle:'Accelerate',brake:'Brake',handbrake:'Handbrake',shiftGear:'Forward / reverse',interact:'Passenger service',atlas:'Open atlas',information:'Information',requestFares:'Request fares',reminder:'Mission reminder',resetLook:'Look forward',glanceLeft:'Glance left',glanceRight:'Glance right',radioNext:'Radio: next track'};
export const buttonNames=['A / Cross','B / Circle','X / Square','Y / Triangle','LB','RB','LT','RT','View / Select','Start','L3','R3','D-pad up','D-pad down','D-pad left','D-pad right'];
export const keyName=(code:string)=>code.replace(/^Key/,'').replace(/^Digit/,'').replace('Arrow','');
export function bindingLabel(bindings:Bindings,action:ControlAction,controller=false){const b=bindings[action];return controller&&b.button!==null?buttonNames[b.button]:b.keys.map(keyName).join(' / ');}
export function bindingConflict(bindings:Bindings,action:ControlAction,key:string|number){
 return controlActions.find(other=>other!==action&&(typeof key==='string'?bindings[other].keys.includes(key):bindings[other].button===key));
}
/** A key the stored profile does not use: the preferred default when free, then the other letters, then digits. */
function freeKey(used:Set<unknown>,preferred:string){
 const candidates=[preferred,...'HVXBNCDEFGIJKLMQRSTUWYZ'.split('').map(c=>`Key${c}`),...Array.from({length:10},(_,i)=>`Digit${i}`)];
 return candidates.find(k=>validKey(k)&&!used.has(k))??preferred;
}
/** Likewise for a controller button; at most 13 of the 15 assignable buttons are ever bound. */
function freeButton(used:Set<unknown>,preferred:number){
 return [preferred,15,14,10,13,12,11,8,4,5,3,2,1,0,6,7].find(b=>validButton(b)&&!used.has(b))??preferred;
}
/** Actions added after a release, oldest first: older profiles gain them without losing any choice. */
const addedActions:ControlAction[]=['requestFares','radioNext'];
export function readBindings():Bindings{
 const result=structuredClone(defaultBindings);
 try{
   const data=JSON.parse(localStorage.getItem('cerea-controls')??'null');
   if(!data)return result;
   // 0.8 profiles predate Request fares and 0.9 profiles the radio; keep their choices and add free defaults.
   if(typeof data!=='object'||Array.isArray(data))return result;
   for(const action of addedActions)if(!data[action]){
     const stored=Object.values(data as Record<string,{keys?:unknown[];button?:unknown}>);
     const keys=new Set<unknown>(stored.flatMap(b=>Array.isArray(b?.keys)?b.keys:[])),buttons=new Set<unknown>(stored.map(b=>b?.button));
     data[action]={keys:[freeKey(keys,defaultBindings[action].keys[0])],button:freeButton(buttons,defaultBindings[action].button!)};
   }
   const keys=new Set<string>(),buttons=new Set<number>();
   for(const action of controlActions){
     const b=data[action];
     if(!b||!Array.isArray(b.keys)||b.keys.length<1||b.keys.length>2||b.keys.some((k:unknown)=>typeof k!=='string'||!validKey(k)||keys.has(k))||
       (defaultBindings[action].button===null?b.button!==null:!Number.isInteger(b.button)||!validButton(b.button)||buttons.has(b.button)))return result;
     b.keys.forEach((k:string)=>keys.add(k));if(b.button!==null)buttons.add(b.button);
   }
   return data as Bindings;
 }catch{return result;}
}
/** Start (9) always pauses; the D-pad below Up is free while driving. */
export function validButton(index:number){return Number.isInteger(index)&&index>=0&&index<=15&&index!==9;}
export function validKey(code:string){return code!=='KeyP'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Tab|Shift(Left|Right)|Control(Left|Right))$/.test(code);}
