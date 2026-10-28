import {actionLabels,bindingConflict,bindingLabel,buttonNames,controlActions,defaultBindings,keyName,validButton,validKey,type Bindings,type ControlAction} from './Bindings';

export class ControlsPanel {
 private element=document.createElement('section');
 private index=0;private delay=0;
 private capture?:{action:ControlAction;controller:boolean};
 private ready=false;
 private heldButtons:boolean[]=[];
 private message='';
 visible=false;
 constructor(readonly bindings:Bindings,private changed:()=>void){
   this.element.className='controls-settings';this.element.hidden=true;this.element.setAttribute('role','dialog');this.element.setAttribute('aria-label','Change controls');
   document.querySelector('#hud')!.append(this.element);
   this.element.addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button)return;
     if(button.dataset.control){this.index=Number(button.dataset.index);this.begin(button.dataset.control as ControlAction,button.dataset.device==='pad');}
     else if(button.hasAttribute('data-default-controls'))this.reset();else this.close();
   });
   window.addEventListener('keydown',e=>{
     if(!this.visible)return;e.preventDefault();e.stopImmediatePropagation();
     if(e.repeat)return;
     if(e.code==='Escape'){if(this.capture){this.capture=undefined;this.render();}else this.close();return;}
     if(this.capture){if(!this.capture.controller)this.assign(e.code);return;}
     if(['ArrowDown','ArrowRight','Tab'].includes(e.code))this.index=(this.index+1)%this.count;
     else if(['ArrowUp','ArrowLeft'].includes(e.code))this.index=(this.index+this.count-1)%this.count;
     else if(e.code==='Enter'||e.code==='Space')this.activate();
     this.highlight();
   },true);
 }
 private get count(){return controlActions.reduce((n,a)=>n+(this.bindings[a].button===null?1:2),0)+2;}
 open(){this.visible=true;this.element.hidden=false;this.index=0;this.ready=false;this.message='';this.render();this.highlight();}
 private close(){this.capture=undefined;this.visible=false;this.element.hidden=true;this.changed();}
 private reset(){Object.assign(this.bindings,structuredClone(defaultBindings));this.persist();this.message='Default controls restored.';this.render();}
 private persist(){try{localStorage.setItem('cerea-controls',JSON.stringify(this.bindings));this.message='Controls saved.';}catch{this.message='Controls apply now, but storage is unavailable; they could not be saved.';}this.changed();}
 private begin(action:ControlAction,controller:boolean){this.capture={action,controller};this.ready=!this.heldButtons.some(Boolean);this.message=`${actionLabels[action]}: press a ${controller?'controller button':'key'}. Escape cancels; Start cancels controller capture.`;this.render();}
 private assign(value:string|number){
   if(!this.capture)return;
   if(typeof value==='string'&&!validKey(value)){this.message='Use a letter, digit, arrow, Enter, Space, Tab, Shift or Ctrl. P and Escape are reserved for pause; Escape cancels.';this.render();return;}
   const conflict=bindingConflict(this.bindings,this.capture.action,value);
   if(conflict){this.message=`${typeof value==='string'?keyName(value):buttonNames[value]} is assigned to ${actionLabels[conflict]}. Choose another, or change that action first.`;this.render();return;}
   if(typeof value==='string')this.bindings[this.capture.action].keys=[value];else this.bindings[this.capture.action].button=value;
   this.capture=undefined;this.persist();this.render();
 }
 private activate(){const button=this.element.querySelectorAll<HTMLButtonElement>('button')[this.index];button?.click();}
 private highlight(){for(const [i,b] of [...this.element.querySelectorAll('button')].entries()){b.classList.toggle('controller-selected',i===this.index);if(i===this.index){b.focus({preventScroll:true});b.scrollIntoView({block:'nearest'});}}}
 private render(){let index=0;this.element.innerHTML=`<h2>Change controls</h2><p>Driving bindings only. Atlas and menus keep their own controls. Sticks steer/look; Start and Escape always pause. D-pad selects; A edits. B closes.</p><div class="binding-table">${controlActions.map(action=>`<div><span>${actionLabels[action]}</span><button data-control="${action}" data-device="key" data-index="${index++}">${bindingLabel(this.bindings,action)}</button>${this.bindings[action].button!==null?`<button data-control="${action}" data-device="pad" data-index="${index++}">${bindingLabel(this.bindings,action,true)}</button>`:'<span>Left stick</span>'}</div>`).join('')}</div><p role="status">${this.message||'Select a binding. L3 is available for forward / reverse.'}</p><button data-default-controls>Restore defaults</button><button data-close-controls>Back</button>`;}
 update(dt:number,pad:Gamepad|undefined){
   this.heldButtons=pad?.buttons.map(b=>b.value>.5)??[];
   if(!this.visible)return;
   const pressed=this.heldButtons;
   if(!this.ready){if(!pressed.some(Boolean))this.ready=true;return;}
   if(this.capture){if(pressed[9]){this.capture=undefined;this.ready=false;this.render();}else if(this.capture.controller){const index=pressed.findIndex(Boolean);if(validButton(index)){this.assign(index);this.ready=false;}}return;}
   this.delay=Math.max(0,this.delay-dt);
   if(pressed[1]){this.close();return;}
   if(pressed[0]){this.activate();this.ready=false;return;}
   const move=Number(pressed[13])-Number(pressed[12]);
   if(move&&this.delay===0){this.index=(this.index+move+this.count)%this.count;this.delay=.22;this.highlight();}
 }
}
