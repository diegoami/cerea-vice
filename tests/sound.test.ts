import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sound } from '../src/presentation/Sound';
import { defaults } from '../src/presentation/Settings';

test('synthesized sound follows speed/gear, mutes paused views and keeps radio optional',()=>{
 const gains:Param[]=[],frequencies:Param[]=[];
 class Param {value=0;target=0;setTargetAtTime(value:number){this.target=value;}setValueAtTime(value:number){this.target=value;}exponentialRampToValueAtTime(value:number){this.target=value;}}
 class Oscillator {frequency=new Param();type='sine';onended?:()=>void;constructor(){frequencies.push(this.frequency);}connect(){}start(){}stop(){}disconnect(){}}
 class Gain {gain=new Param();constructor(){gains.push(this.gain);}connect(){}disconnect(){}}
 let constructed=0,closed=0;
 class Context {currentTime=0;destination={};constructor(){constructed++;}createGain(){return new Gain();}createOscillator(){return new Oscillator();}resume(){return Promise.resolve();}close(){closed++;return Promise.resolve();}}
 Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:Context});
 const sound=new Sound();assert.equal(constructed,0,'Audio starts only after activation');
 sound.unlock();sound.unlock();assert.equal(constructed,1);
 sound.update(.1,true,10,'D',0,defaults);assert.equal(gains[0].target,defaults.volume);assert.equal(frequencies[0].target,74);assert.equal(gains[2].target,0);
 sound.update(.1,true,10,'R',0,{...defaults,radio:true});assert.equal(frequencies[0].target,104);assert.ok(gains[2].target>0);
 sound.update(.1,false,10,'R',0,defaults);assert.equal(gains[0].target,0);
 sound.update(.1,true,10,'D',0,{...defaults,volume:0});assert.equal(gains[0].target,0);
 sound.dispose();assert.equal(closed,1);
});
