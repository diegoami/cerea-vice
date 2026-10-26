export interface PresentationSettings {
  detail: boolean;
  resolution: 'sharp' | 'retro' | 'retro-fine';
  motion: boolean;
  volume: number;
  radio: boolean;
}
export const defaults: PresentationSettings = {detail:true,resolution:'retro-fine',motion:true,volume:0.25,radio:false};
export function readSettings(storage: Pick<Storage,'getItem'>): PresentationSettings {
  try {
    const value=JSON.parse(storage.getItem('cerea-presentation')??'{}');
    return {detail:typeof value.detail==='boolean'?value.detail:defaults.detail,
      resolution:['sharp','retro','retro-fine'].includes(value.resolution)?value.resolution:defaults.resolution,
      motion:typeof value.motion==='boolean'?value.motion:defaults.motion,
      volume:typeof value.volume==='number'&&Number.isFinite(value.volume)?Math.max(0,Math.min(1,value.volume)):defaults.volume,
      radio:typeof value.radio==='boolean'?value.radio:defaults.radio};
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
  constructor(readonly values:PresentationSettings, private changed:()=>void) {
    this.element.className='presentation-settings';
    this.element.setAttribute('aria-label','Presentation settings');
    this.element.innerHTML=`<strong>PICTURE & SOUND</strong><small>D-pad: select · A: change · Start: drive</small>
      <label>Scenery <select data-key="detail"><option value="true">Detailed</option><option value="false">Simple</option></select></label>
      <label>Picture <select data-key="resolution"><option value="sharp">Sharp (read signs)</option><option value="retro">Retro 270p</option><option value="retro-fine">Retro 540p</option></select></label>
      <label>Cockpit motion <select data-key="motion"><option value="true">Subtle</option><option value="false">Off</option></select></label>
      <label>Volume <select data-key="volume"><option value="0">Mute</option><option value="0.25">Quiet</option><option value="0.5">Medium</option><option value="1">Full</option></select></label>
      <label>Radio <select data-key="radio"><option value="false">Off</option><option value="true">On</option></select></label>`;
    document.querySelector('#hud')!.append(this.element);
    this.element.addEventListener('keydown',event=>event.stopPropagation());
    this.element.addEventListener('change',()=>this.commit());
    for(const select of this.selects)select.value=String(values[select.dataset.key as keyof PresentationSettings]);
  }
  private get selects(){return [...this.element.querySelectorAll('select')];}
  private commit(){
    for(const select of this.selects){const key=select.dataset.key as keyof PresentationSettings;
      Object.assign(this.values,{[key]:key==='volume'?Number(select.value):key==='resolution'?select.value:select.value==='true'});}
    try{localStorage.setItem('cerea-presentation',JSON.stringify(this.values));}catch{/* Settings still apply in memory. */}
    this.changed();
  }
  update(visible:boolean,dt:number,y:number,confirm:boolean){
    this.element.hidden=!visible;
    if(!visible){this.index=-1;this.delay=0;return false;}
    this.delay=Math.max(0,this.delay-dt);
    if(Math.abs(y)>.5&&this.delay===0){this.index=this.index<0?(y>0?0:this.selects.length-1):(this.index+(y>0?1:-1)+this.selects.length)%this.selects.length;this.delay=.25;}
    for(const [i,select] of this.selects.entries())select.classList.toggle('controller-selected',i===this.index);
    if(confirm&&this.index>=0){const select=this.selects[this.index];select.selectedIndex=(select.selectedIndex+1)%select.options.length;this.commit();return true;}
    return false;
  }
}
