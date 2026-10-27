export const controlActions=['steerLeft','steerRight','throttle','brake','handbrake','shiftGear','interact','atlas','information','reminder','resetLook','glanceLeft','glanceRight'] as const;
export type ControlAction=typeof controlActions[number];
export type Bindings=Record<ControlAction,{keys:string[];button:number|null}>;
export const defaultBindings:Bindings={
 steerLeft:{keys:['KeyA','ArrowLeft'],button:null},steerRight:{keys:['KeyD','ArrowRight'],button:null},
 throttle:{keys:['KeyW','ArrowUp'],button:7},brake:{keys:['KeyS','ArrowDown'],button:6},
 handbrake:{keys:['Space'],button:2},shiftGear:{keys:['KeyR'],button:1},interact:{keys:['Enter'],button:0},
 atlas:{keys:['KeyT'],button:3},information:{keys:['KeyF'],button:8},reminder:{keys:['Tab','KeyM'],button:12},
 resetLook:{keys:['KeyC'],button:11},glanceLeft:{keys:['KeyQ'],button:4},glanceRight:{keys:['KeyE'],button:5},
};
export const actionLabels:Record<ControlAction,string>={steerLeft:'Steer left',steerRight:'Steer right',throttle:'Accelerate',brake:'Brake',handbrake:'Handbrake',shiftGear:'Forward / reverse',interact:'Passenger service',atlas:'Open atlas',information:'Information',reminder:'Mission reminder',resetLook:'Look forward',glanceLeft:'Glance left',glanceRight:'Glance right'};
export const buttonNames=['A / Cross','B / Circle','X / Square','Y / Triangle','LB','RB','LT','RT','View / Select','Start','L3','R3','D-pad up','D-pad down','D-pad left','D-pad right'];
export const keyName=(code:string)=>code.replace(/^Key/,'').replace(/^Digit/,'').replace('Arrow','');
export function bindingLabel(bindings:Bindings,action:ControlAction,controller=false){const b=bindings[action];return controller&&b.button!==null?buttonNames[b.button]:b.keys.map(keyName).join(' / ');}
export function bindingConflict(bindings:Bindings,action:ControlAction,key:string|number){
 return controlActions.find(other=>other!==action&&(typeof key==='string'?bindings[other].keys.includes(key):bindings[other].button===key));
}
export function readBindings():Bindings{
 const result=structuredClone(defaultBindings);
 try{
   const data=JSON.parse(localStorage.getItem('cerea-controls')??'null');
   if(!data)return result;
   const keys=new Set<string>(),buttons=new Set<number>();
   for(const action of controlActions){
     const b=data[action];
     if(!b||!Array.isArray(b.keys)||b.keys.length<1||b.keys.length>2||b.keys.some((k:unknown)=>typeof k!=='string'||!validKey(k)||keys.has(k))||
       (defaultBindings[action].button===null?b.button!==null:!Number.isInteger(b.button)||b.button<0||b.button>12||b.button===9||buttons.has(b.button)))return result;
     b.keys.forEach((k:string)=>keys.add(k));if(b.button!==null)buttons.add(b.button);
   }
   return data as Bindings;
 }catch{return result;}
}
export function validKey(code:string){return code!=='KeyP'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Tab|Shift(Left|Right)|Control(Left|Right))$/.test(code);}
