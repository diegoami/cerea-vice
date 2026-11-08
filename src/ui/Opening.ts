import {actionLabels,bindingLabel,controlActions,type Bindings} from '../input/Bindings';
import type {Actions} from '../input/Input';
import type {District} from '../world/district';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Opening owns only DOM listeners. The renderer's lifetime resize handler stays alive. */
export class Opening {
  state:'demo'|'rules'|'waiting'='demo';
  private ready=false;
  private readonly events=new AbortController();
  private readonly element=document.createElement('div');
  private readonly pointers=new Set<number>();
  private readonly button=document.createElement('button');
  private readonly badge=document.createElement('div');
  private worldMoveDelay=0;
  private worldMove=0;
  constructor(root:HTMLElement,private context:District,private bindings:Bindings,rules=false){
    this.element.id='opening';this.badge.className='demo-label';this.badge.textContent='DEMO  MODE';
    this.button.type='button';this.button.className='opening-start';this.button.textContent='Start';this.button.disabled=true;
    this.button.addEventListener('click',()=>this.activate(),{signal:this.events.signal});
    window.addEventListener('blur',()=>this.pointers.clear(),{signal:this.events.signal});
    window.addEventListener('pointerdown',e=>this.pointers.add(e.pointerId),{signal:this.events.signal});
    for(const name of ['pointerup','pointercancel'] as const)window.addEventListener(name,e=>this.pointers.delete(e.pointerId),{signal:this.events.signal});
    window.addEventListener('keydown',e=>{
      if(this.state!=='rules'||(e.target as HTMLElement).closest('.presentation-settings,.controls-settings'))return;
      const amounts:Record<string,number>={PageDown:250,PageUp:-250,Home:-Infinity,End:Infinity};
      if(e.code in amounts){e.preventDefault();const view=document.querySelector<HTMLElement>('#overlay')!;view.scrollTop=e.code==='Home'?0:e.code==='End'?view.scrollHeight:view.scrollTop+amounts[e.code];}
    },{signal:this.events.signal});
    this.element.append(this.badge,this.button);root.append(this.element);
    if(rules){this.state='rules';this.badge.hidden=true;this.element.hidden=true;}
  }
  activate(){
    if(!this.ready)return;
    this.ready=false;
    if(this.state==='demo'){
      this.state='rules';this.badge.hidden=true;
      this.element.hidden=true;
    }else if(this.state==='rules'){
      this.state='waiting';const button=document.querySelector<HTMLButtonElement>('.briefing-main > button');if(button){button.disabled=true;button.textContent='Release controls to begin…';}
    }
  }
  update(dt:number,actions:Actions,released:boolean){
    if(released&&this.pointers.size===0)this.ready=true;
    if(this.state==='demo')this.button.disabled=!this.ready;
    if(this.state==='rules'){const overlay=document.querySelector<HTMLElement>('#overlay');if(overlay)overlay.scrollTop+=actions.atlasPanY*dt*280;}
    if(this.state==='demo'&&this.ready&&(actions.interact||actions.pause))this.activate();
    return this.state==='waiting'&&released&&this.pointers.size===0;
  }
  refreshButton(){
    if(this.state==='demo')return;
    const button=document.querySelector<HTMLButtonElement>('.briefing-main > button');
    if(button){button.disabled=!this.ready||this.state==='waiting';if(this.state==='waiting')button.textContent='Release controls to begin…';}
  }
  /** One focus path for controller world choice, Begin game and existing options. */
  navigateRules(dt:number,actions:Actions,padMove:number,keyboardConfirm:boolean){
    if(this.state!=='rules')return false;
    const worlds=Array.from(document.querySelectorAll<HTMLButtonElement>('.district-switch button[data-district]'));
    const begin=document.querySelector<HTMLButtonElement>('.briefing-main > button');
    const options=Array.from(document.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('.presentation-settings select,.presentation-settings button:not(:disabled)'));
    const items:(HTMLButtonElement|HTMLSelectElement)[]=[...worlds,...(begin?[begin]:[]),...options];
    const active=items.findIndex(item=>item===document.activeElement);
    const inOptions=active>=0&&options.includes(items[active]);
    // Native keyboard arrows still edit selects; Enter retains the existing start shortcut.
    if(inOptions&&keyboardConfirm)return false;
    this.worldMoveDelay=Math.max(0,this.worldMoveDelay-dt);
    const axis=padMove||(!inOptions?(actions.atlasMoveX||actions.atlasMoveY):0);
    const move=Math.abs(axis)>.5?Math.sign(axis):0;
    if(move!==this.worldMove)this.worldMoveDelay=0;
    this.worldMove=move;
    if(move&&this.worldMoveDelay===0&&items.length){
      const current=worlds.findIndex(b=>b.getAttribute('aria-pressed')==='true');
      const index=active>=0?active:current>=0?current:move>0?-1:0;
      const item=items[(index+move+items.length)%items.length];
      item.focus({preventScroll:true});item.scrollIntoView({block:'nearest'});this.worldMoveDelay=.25;
    }
    const focused=items.find(item=>item===document.activeElement);
    if(focused&&actions.interact){
      if(this.ready){
        if(focused===begin)focused.click();
        else{
          this.ready=false;
          if(focused.tagName==='SELECT'){
            const select=focused as HTMLSelectElement;
            select.selectedIndex=(select.selectedIndex+1)%select.options.length;
            select.dispatchEvent(new Event('change',{bubbles:true}));
          }else focused.click();
        }
      }
      return true;
    }
    return Boolean(focused);
  }
  instructions(){
    const {district}=this.context;
    return `<span class="eyebrow accent">RULES & CONTROLS</span><h2>Find your way. Learn the streets.</h2>
      <p>${district.taxi?.endless?'Drive at any hour, day or night. Stop to request fares, accept a job and serve the pickup and destination. Rest for 8 hours from the pause menu when fully stopped with no active passenger. There is no closing time.':district.taxi?'Work '+escape(`${district.taxi.startHour.toString().padStart(2,'0')}:00–${district.taxi.endHour.toString().padStart(2,'0')}:00`)+'. Stop to request fares, compare the list, then accept one. Find the named pickup, stop inside its bay and confirm passenger service. Wait for boarding, drive to the destination and confirm again. Each delivery earns the quoted fare plus a decreasing speed bonus.':'Find '+escape(district.mission.name)+'. '+escape(district.mission.objective)}</p>
      ${district.taxi?.mixedTownFares?`<p>One continuous world joins nine towns. Local and inter-town jobs share the fare list; inter-town quotes include an extra €12 plus distance pay. Each fresh shift starts at a random landmark. In this demo, three paid jobs trigger a jump to another town. Player journeys follow the roads.</p>`:''}
      <p>Navigate by street signs, landmarks and the heading compass. There is no GPS. Stop fully to open the atlas or ask for information. The atlas marker remembers your last information request or your own estimate; driving never moves it. Atlas, fare lists and pause freeze time.</p>
      <p>Accelerate in the selected gear. Brake only slows you down. Stop fully and release the accelerator before selecting forward or reverse. Passenger service requires a full stop inside the named bay.</p>
      <h2>Current keyboard & controller controls</h2><p>Left stick steers. Right stick or captured mouse looks around; click the windshield to capture the mouse. Looking returns forward when idle.</p>
      <table><thead><tr><th>Action</th><th>Keyboard</th><th>Controller</th></tr></thead><tbody>${controlActions.map(a=>`<tr><td>${actionLabels[a]}</td><td>${escape(bindingLabel(this.bindings,a))}</td><td>${a==='steerLeft'||a==='steerRight'?'Left stick':escape(bindingLabel(this.bindings,a,true))}</td></tr>`).join('')}</tbody></table>
      <p>Pause: Esc / P / Start. In fare lists: arrows / left stick / D-pad select, Enter / A accepts, Backspace / B closes, N / Y refreshes. In the atlas: arrows / left stick move the estimate, Enter / A places it, Q / E or LB / RB turn pages; + / −, wheel or triggers zoom; right stick pans; Delete / X clears the marker; T / Esc / B closes.</p>
      <p>Use arrow keys, D-pad or left stick to navigate the opening choices; Enter / A confirms. Scroll the rules with Page Up / Down, mouse wheel, controller right stick, or touch swipe. Touch can operate this opening; driving requires keyboard or a standard controller.</p>
      <p>Begin game starts a fresh session. The options panel offers saved shifts, controls, picture and sound. During play, pause for Save shift or Main screen to choose a district. Your existing manual save is kept until you deliberately save again.</p>`;
  }

  dispose(){this.events.abort();this.element.remove();}
}
