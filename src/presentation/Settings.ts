export interface PresentationSettings {
  detail: boolean;
  resolution: 'retro' | 'retro-fine' | 'sharp' | 'high';
  motion: boolean;
  volume: number;
  radio: boolean;
}
export const defaults: PresentationSettings = {detail:true,resolution:'retro-fine',motion:true,volume:0.25,radio:false};
export function readSettings(storage: Pick<Storage,'getItem'> | (()=>Pick<Storage,'getItem'>) = ()=>localStorage): PresentationSettings {
  try {
    const source=typeof storage==='function'?storage():storage;
    const value=JSON.parse(source.getItem('cerea-presentation')??'{}');
    return {detail:typeof value.detail==='boolean'?value.detail:defaults.detail,
      resolution:['retro','retro-fine','sharp','high'].includes(value.resolution)?value.resolution:defaults.resolution,
      motion:typeof value.motion==='boolean'?value.motion:defaults.motion,
      volume:typeof value.volume==='number'&&Number.isFinite(value.volume)?Math.max(0,Math.min(1,value.volume)):defaults.volume,
      radio:typeof value.radio==='boolean'?value.radio:defaults.radio};
  } catch {return {...defaults};}
}
export const isRetro=(mode:PresentationSettings['resolution'])=>mode==='retro'||mode==='retro-fine';
/** Internal picture size for a CSS-pixel window. Sharp keeps its 0.9 cap (1920 px wide,
 * pixel ratio 2); High is opt-in only and caps at 3840×2160 and the GPU's `limit`. */
export function renderSize(width:number,height:number,mode:PresentationSettings['resolution'],pixelRatio=1,limit=Infinity) {
  const scale=mode==='sharp'?Math.min(pixelRatio,2,1920/width):mode==='high'?Math.min(pixelRatio,2,3840/width,2160/height):Math.min(1,(mode==='retro'?270:540)/height);
  const fit=Math.min(1,limit/Math.max(width*scale,height*scale));
  return {width:Math.max(1,Math.round(width*scale*fit)),height:Math.max(1,Math.round(height*scale*fit))};
}
export const pictureNotes:Record<PresentationSettings['resolution'],string>={
  'retro':'Lightest. Coarse pixels; small signs are hard to read.',
  'retro-fine':'Default. Pixel look at a modest cost.',
  'sharp':'Display resolution up to 1920 px wide, for reading street plates.',
  'high':'Full display and HiDPI resolution up to 3840 px wide. Most demanding: choose Sharp or Retro if driving stutters.',
};
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
      <label>Picture <select data-key="resolution"><option value="retro">Retro 270p</option><option value="retro-fine">Retro 540p</option><option value="sharp">Sharp</option><option value="high">High (to 4K)</option></select></label>
      <small class="picture-info"></small><span class="picture-announce" role="status" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"></span>
      <label>Cockpit motion <select data-key="motion"><option value="true">Subtle</option><option value="false">Off</option></select></label>
      <label>Volume <select data-key="volume"><option value="0">Mute</option><option value="0.25">Quiet</option><option value="0.5">Medium</option><option value="1">Full</option></select></label>
      <label>Radio <select data-key="radio"><option value="false">Off</option><option value="true">On</option></select></label>`;
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
    this.announced=values.resolution;
  }
  private announced:string;
  private get selects(){return [...this.element.querySelectorAll('select')];}
  /** Names the selected quality and the picture size actually drawn, in device pixels. */
  showPicture(width:number,height:number,windowWidth:number,windowHeight:number){
    const info=this.element.querySelector('.picture-info')!;
    info.textContent=`${pictureNotes[this.values.resolution]} Drawing ${width}×${height} for a ${windowWidth}×${windowHeight} window.`;
  }
  private commit(){
    for(const select of this.selects){const key=select.dataset.key as keyof PresentationSettings;
      Object.assign(this.values,{[key]:key==='volume'?Number(select.value):key==='resolution'?select.value:select.value==='true'});}
    try{localStorage.setItem('cerea-presentation',JSON.stringify(this.values));}catch{/* Settings still apply in memory. */}
    // Window resizes redraw the size line silently; only a change of picture mode is announced.
    if(this.values.resolution!==this.announced){this.announced=this.values.resolution;this.element.querySelector('.picture-announce')!.textContent=pictureNotes[this.values.resolution];}
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
