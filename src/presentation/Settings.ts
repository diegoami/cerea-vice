export interface PresentationSettings {
  detail: boolean;
  resolution: 'sharp' | 'retro' | 'retro-fine';
  motion: boolean;
  volume: number;
  radio: boolean;
  /** Radio music level, separate from the master volume; vehicle sound stays at volume. */
  music: number;
  radioSource: 'builtin' | 'folder';
}
export const defaults: PresentationSettings = {detail:true,resolution:'retro-fine',motion:true,volume:0.75,radio:false,music:0.5,radioSource:'builtin'};
/** Saved levels snap to the offered steps, so old 0.25 / 0.5 / 1 choices are kept as they were. */
const level=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?[0,.25,.5,.75,1].reduce((a,b)=>Math.abs(b-value)<Math.abs(a-value)?b:a):fallback;
export function readSettings(storage: Pick<Storage,'getItem'> | (()=>Pick<Storage,'getItem'>) = ()=>localStorage): PresentationSettings {
  try {
    const source=typeof storage==='function'?storage():storage;
    const value=JSON.parse(source.getItem('cerea-presentation')??'{}');
    return {detail:typeof value.detail==='boolean'?value.detail:defaults.detail,
      resolution:['sharp','retro','retro-fine'].includes(value.resolution)?value.resolution:defaults.resolution,
      motion:typeof value.motion==='boolean'?value.motion:defaults.motion,
      volume:level(value.volume,defaults.volume),
      radio:typeof value.radio==='boolean'?value.radio:defaults.radio,
      music:level(value.music,defaults.music),
      radioSource:['builtin','folder'].includes(value.radioSource)?value.radioSource:defaults.radioSource};
  } catch {return {...defaults};}
}
export function renderSize(width:number,height:number,mode:PresentationSettings['resolution'],pixelRatio=1) {
  const scale=mode==='sharp'?Math.min(pixelRatio,2,1920/width):Math.min(1,(mode==='retro'?270:540)/height);
  return {width:Math.round(width*scale),height:Math.round(height*scale)};
}
/** Shared keyboard/native form controls and controller cycling, only outside play. */
export class SettingsPanel {
  private readonly element=document.createElement('section');
  private index=-1;
  private delay=0;
  private actions:{button:HTMLButtonElement;run:()=>void}[]=[];
  addAction(label:string,run:()=>void){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>{run();if(document.activeElement===button)button.blur();});this.element.append(button);this.actions.push({button,run});return button;}
  constructor(readonly values:PresentationSettings, private changed:()=>void) {
    this.element.className='presentation-settings';
    this.element.setAttribute('aria-label','Presentation settings');
    this.element.innerHTML=`<strong>PICTURE & SOUND</strong><small>D-pad: select · A: change · Start: drive<br>Keyboard: Tab / arrows edit · Space activates buttons · Enter / Esc / P drive</small>
      <label>Scenery <select data-key="detail"><option value="true">Detailed</option><option value="false">Simple</option></select></label>
      <label>Picture <select data-key="resolution"><option value="sharp">Sharp (read signs)</option><option value="retro">Retro 270p</option><option value="retro-fine">Retro 540p</option></select></label>
      <label>Cockpit motion <select data-key="motion"><option value="true">Subtle</option><option value="false">Off</option></select></label>
      <label>Volume <select data-key="volume"><option value="0">Mute (silent)</option><option value="0.25">25%</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></select></label>
      <label>Radio <select data-key="radio"><option value="false">Off</option><option value="true">On</option></select></label>
      <label>Radio source <select data-key="radioSource"><option value="builtin">Built-in tune</option><option value="folder">My music folder</option></select></label>
      <label>Music level <select data-key="music"><option value="0.25">25%</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></select></label>`;
    document.querySelector('#hud')!.append(this.element);
    this.element.addEventListener('keydown',event=>{
      // Reserve the advertised start/resume controls even after a mouse edit.
      if(event.code==='Enter'||event.code==='Escape'||event.code==='KeyP'){
        event.preventDefault();
        (event.target as HTMLElement).blur();
        return; // Let Input receive the key; ordinary form editing stays local.
      }
      event.stopPropagation();
    });
    this.element.addEventListener('change',()=>this.commit());
    for(const select of this.selects)select.value=String(values[select.dataset.key as keyof PresentationSettings]);
  }
  /** Apply a change made outside the form (e.g. after choosing a music folder), then save it. */
  apply(changes:Partial<PresentationSettings>){Object.assign(this.values,changes);for(const select of this.selects)select.value=String(this.values[select.dataset.key as keyof PresentationSettings]);this.commit();}
  private get selects(){return [...this.element.querySelectorAll('select')];}
  private commit(){
    for(const select of this.selects){const key=select.dataset.key as keyof PresentationSettings;
      Object.assign(this.values,{[key]:key==='volume'||key==='music'?Number(select.value):key==='resolution'||key==='radioSource'?select.value:select.value==='true'});}
    try{localStorage.setItem('cerea-presentation',JSON.stringify(this.values));}catch{/* Settings still apply in memory. */}
    this.changed();
  }
  update(visible:boolean,dt:number,y:number,confirm:boolean){
    this.element.hidden=!visible;
    if(!visible){this.index=-1;this.delay=0;return false;}
    this.delay=Math.max(0,this.delay-dt);
    const count=this.selects.length+this.actions.length;
    if(Math.abs(y)>.5&&this.delay===0){this.index=this.index<0?(y>0?0:count-1):(this.index+(y>0?1:-1)+count)%count;this.delay=.25;
      const item=this.selects[this.index]??this.actions[this.index-this.selects.length]?.button;item?.scrollIntoView({block:'nearest'});}
    for(const [i,select] of this.selects.entries())select.classList.toggle('controller-selected',i===this.index);
    for(const [i,action] of this.actions.entries())action.button.classList.toggle('controller-selected',i+this.selects.length===this.index);
    if(confirm&&this.index>=0){const select=this.selects[this.index];if(select){select.selectedIndex=(select.selectedIndex+1)%select.options.length;this.commit();}else this.actions[this.index-this.selects.length]?.button.click();return true;}
    return false;
  }
}
