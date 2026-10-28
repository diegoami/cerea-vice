import type { PresentationSettings } from './Settings';
export type SoundState='off'|'running'|'waiting'|'unavailable';
export interface VehicleSound {speed:number;gear:'D'|'R';steering:number}
export interface PedalSound {throttle:number;brake:number;handbrake:boolean}
/** Music sits under the engine: its own level, ducked a little while accelerating hard. */
export const musicGain=(settings:PresentationSettings,throttle:number)=>settings.volume*settings.music*(1-.25*Math.max(0,Math.min(1,throttle)));
/** Engine pitch: a low sawtooth fundamental whose harmonics reach small laptop speakers. */
export function enginePitch(speed:number,gear:'D'|'R',throttle:number){
  const v=Math.abs(speed);
  return gear==='R'?44+v*7+throttle*10:40+v*3.8+throttle*12;
}
/**
 * Original synthesized tones. No recordings, downloads or external audio assets.
 * Nothing here depends on the route, position or destination: sound is never a navigation cue.
 */
export class Sound {
  private context?:AudioContext;
  private master?:GainNode;
  private engine?:OscillatorNode;
  private engineUpper?:OscillatorNode;
  private engineFilter?:BiquadFilterNode;
  private engineGain?:GainNode;
  private whine?:OscillatorNode;
  private whineGain?:GainNode;
  private rumbleGain?:GainNode;
  private brakeGain?:GainNode;
  private radio?:OscillatorNode;
  private radioBass?:OscillatorNode;
  private radioGain?:GainNode;
  private time=0;
  private tickAt=0;
  private turning=false;
  private disposed=false;
  private failed=false;
  private resumeAt=0;
  private gear?:'D'|'R';
  /** Whether the platform is actually producing sound; shown on the dashboard. */
  get state():SoundState{
    if(this.failed)return 'unavailable';
    if(!this.context)return 'off';
    return this.context.state==='running'?'running':'waiting';
  }
  unlock(){
    if(this.disposed||this.failed)return;
    if(!this.context){
      try{this.build();}catch{this.failed=true;return;}
    }
    if(this.context!.state!=='running')void this.context!.resume().catch(()=>{/* Silent fallback if the platform denies audio. */});
  }
  private build(){
    const ctx=new AudioContext();this.context=ctx;
    const gain=(value=0,to:AudioNode=this.master!)=>{const node=ctx.createGain();node.gain.value=value;node.connect(to);return node;};
    const tone=(type:OscillatorType,to:AudioNode)=>{const node=ctx.createOscillator();node.type=type;node.connect(to);node.start();return node;};
    // A gentle limiter keeps layered tones from clipping at 100%.
    const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-10;limiter.ratio.value=6;limiter.connect(ctx.destination);
    this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(limiter);
    this.engineGain=gain();
    this.engineFilter=ctx.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.Q.value=4;this.engineFilter.connect(this.engineGain);
    this.engine=tone('sawtooth',this.engineFilter);
    const upper=gain(.35,this.engineFilter);this.engineUpper=tone('square',upper);this.engineUpper.detune.value=7;
    this.whineGain=gain();this.whine=tone('sine',this.whineGain);
    // Looped noise: tyre rumble (low) and brake hiss (mid). A fixed generator, never Math.random.
    const noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=noise.getChannelData(0);
    for(let i=0,seed=1;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=seed/2147483648-1;}
    const filtered=(type:BiquadFilterType,frequency:number,q:number)=>{
      const source=ctx.createBufferSource();source.buffer=noise;source.loop=true;
      const filter=ctx.createBiquadFilter();filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;
      const level=gain(0);source.connect(filter);filter.connect(level);source.start();return level;
    };
    this.rumbleGain=filtered('lowpass',180,.7);
    this.brakeGain=filtered('bandpass',2400,1.2);
    // Built-in radio: a soft square arpeggio over a sine bass, on its own music level.
    this.radioGain=gain();
    const lead=ctx.createBiquadFilter();lead.type='lowpass';lead.frequency.value=1400;lead.connect(this.radioGain);
    this.radio=tone('square',lead);
    const bass=gain(1.4,this.radioGain);this.radioBass=tone('sine',bass);
  }
  update(dt:number,running:boolean,car:VehicleSound,pedals:PedalSound,settings:PresentationSettings,builtInFallback=false){
    const ctx=this.context;if(!ctx||!this.master||!this.engine||!this.engineUpper||!this.engineFilter||!this.engineGain||!this.whine||!this.whineGain||!this.rumbleGain||!this.brakeGain||!this.radio||!this.radioBass||!this.radioGain)return;
    const now=ctx.currentTime,v=Math.abs(car.speed),throttle=running?pedals.throttle:0;
    if(running)this.time+=dt;
    // Retry a suspended context while driving (e.g. a controller-only browser start); cheap and idempotent.
    if(running&&ctx.state!=='running'&&this.time>=this.resumeAt){this.resumeAt=this.time+1;void ctx.resume().catch(()=>{});}
    this.master.gain.setTargetAtTime(running?settings.volume:0,now,.04);
    const pitch=enginePitch(car.speed,car.gear,throttle);
    this.engine.frequency.setTargetAtTime(pitch,now,.08);
    this.engineUpper.frequency.setTargetAtTime(pitch*2,now,.08);
    this.engineFilter.frequency.setTargetAtTime(380+throttle*1100+v*35,now,.1);
    this.engineGain.gain.setTargetAtTime(.16+throttle*.12+Math.min(21,v)*.004,now,.08);
    // Reverse adds a thin gear whine, so the selected direction is audible without looking.
    this.whine.frequency.setTargetAtTime(pitch*9,now,.08);
    this.whineGain.gain.setTargetAtTime(car.gear==='R'&&v>.2?.025+Math.min(6,v)*.004:0,now,.1);
    this.rumbleGain.gain.setTargetAtTime(Math.min(21,v)*.012,now,.12);
    const braking=Math.max(pedals.brake,pedals.handbrake?1:0);
    this.brakeGain.gain.setTargetAtTime(running&&v>.5?braking*Math.min(1,v/8)*.09:0,now,.05);
    const notes=[220,261.63,329.63,293.66,246.94,293.66,349.23,261.63],bass=[110,110,87.31,98];
    this.radio.frequency.setTargetAtTime(notes[Math.floor(this.time*4)%notes.length],now,.01);
    this.radioBass.frequency.setTargetAtTime(bass[Math.floor(this.time/2)%bass.length],now,.03);
    // The built-in tune also stands in when the music folder has nothing playable.
    const builtIn=settings.radio&&(settings.radioSource==='builtin'||builtInFallback)&&settings.volume>0;
    this.radioGain.gain.setTargetAtTime(builtIn?.09*settings.music*(1-.25*throttle):0,now,.1);
    if(this.gear!==car.gear){if(this.gear&&running)this.blip(car.gear==='R'?[330,220]:[220,330]);this.gear=car.gear;}
    // Steering-linked tick is ambience, not a turn instruction or route cue.
    if(!running||Math.abs(car.steering)<.3){this.turning=false;this.tickAt=0;return;}
    if(!this.turning){this.turning=true;this.tickAt=this.time;}
    if(this.time>=this.tickAt){this.tickAt=this.time+.55;this.blip([900],.035,.025);}
  }
  /** A short two-note check at a chosen level, so volume can be judged on the settings screen. */
  preview(volume:number){
    this.unlock();const ctx=this.context;if(!ctx||volume<=0)return;
    // Bypasses the master fade, which keeps the game itself silent while paused.
    const out=ctx.createGain();out.gain.value=volume;out.connect(ctx.destination);
    [196,293.66].forEach((frequency,i)=>{
      const start=ctx.currentTime+i*.14,tone=ctx.createOscillator(),gain=ctx.createGain();tone.type='sawtooth';tone.frequency.value=frequency;
      gain.gain.setValueAtTime(.18,start);gain.gain.exponentialRampToValueAtTime(.0001,start+.12);
      tone.connect(gain);gain.connect(out);tone.start(start);tone.stop(start+.13);tone.onended=()=>{tone.disconnect();gain.disconnect();if(i===1)out.disconnect();};
    });
  }
  /** Short square tones: the selector clunk on forward/reverse and the steering tick. */
  private blip(frequencies:number[],length=.06,level=.06){
    const ctx=this.context!;
    frequencies.forEach((frequency,i)=>{
      const start=ctx.currentTime+i*length*1.4,tone=ctx.createOscillator(),gain=ctx.createGain();tone.type='square';tone.frequency.value=frequency;
      gain.gain.setValueAtTime(level,start);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
      tone.connect(gain);gain.connect(this.master!);tone.start(start);tone.stop(start+length+.005);tone.onended=()=>{tone.disconnect();gain.disconnect();};
    });
  }
  dispose(){this.disposed=true;void this.context?.close();}
}
