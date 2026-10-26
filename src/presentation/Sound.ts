import type { PresentationSettings } from './Settings';
/** Original synthesized tones. No recordings, downloads or external audio assets. */
export class Sound {
  private context?:AudioContext;
  private master?:GainNode;
  private engine?:OscillatorNode;
  private engineGain?:GainNode;
  private radio?:OscillatorNode;
  private radioGain?:GainNode;
  private time=0;
  private tickAt=0;
  private turning=false;
  private disposed=false;
  unlock(){
    if(this.disposed)return;
    if(!this.context){
      const ctx=new AudioContext();this.context=ctx;
      this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
      this.engine=ctx.createOscillator();this.engine.type='triangle';this.engineGain=ctx.createGain();
      this.engine.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();
      this.radio=ctx.createOscillator();this.radio.type='sine';this.radioGain=ctx.createGain();this.radioGain.gain.value=0;
      this.radio.connect(this.radioGain);this.radioGain.connect(this.master);this.radio.start();
    }
    void this.context.resume().catch(()=>{/* Silent fallback if the platform denies audio. */});
  }
  update(dt:number,running:boolean,speed:number,gear:'D'|'R',steer:number,settings:PresentationSettings){
    const ctx=this.context;if(!ctx||!this.master||!this.engine||!this.engineGain||!this.radio||!this.radioGain)return;
    if(running)this.time+=dt;
    this.master.gain.setTargetAtTime(running?settings.volume:0,ctx.currentTime,.04);
    this.engine.frequency.setTargetAtTime(34+Math.abs(speed)*(gear==='R'?7:4),ctx.currentTime,.08);
    this.engineGain.gain.setTargetAtTime(.07+Math.min(21,Math.abs(speed))*.004,ctx.currentTime,.08);
    const notes=[220,261.63,329.63,293.66,246.94,293.66,349.23,261.63];
    this.radio.frequency.setTargetAtTime(notes[Math.floor(this.time*2)%notes.length],ctx.currentTime,.08);
    this.radioGain.gain.setTargetAtTime(settings.radio?.012:0,ctx.currentTime,.1);
    // Steering-linked tick is ambience, not a turn instruction or route cue.
    if(!running||Math.abs(steer)<.3){this.turning=false;this.tickAt=0;return;}
    if(!this.turning){this.turning=true;this.tickAt=this.time;}
    if(this.time>=this.tickAt){
      this.tickAt=this.time+.55;
      const tone=ctx.createOscillator(),gain=ctx.createGain();tone.type='square';tone.frequency.value=900;
      gain.gain.setValueAtTime(.018,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.035);
      tone.connect(gain);gain.connect(this.master);tone.start();tone.stop(ctx.currentTime+.04);tone.onended=()=>{tone.disconnect();gain.disconnect();};
    }
  }
  dispose(){this.disposed=true;void this.context?.close();}
}
