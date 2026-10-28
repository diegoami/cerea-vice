import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sound, enginePitch, musicGain } from '../src/presentation/Sound';
import { defaults, readSettings } from '../src/presentation/Settings';
import { Radio, type MusicApi, type MusicLibrary } from '../src/presentation/Radio';

class Param {value=0;target=0;setTargetAtTime(value:number){this.target=value;}setValueAtTime(value:number){this.target=value;}exponentialRampToValueAtTime(value:number){this.target=value;}}
/** A minimal Web Audio stand-in that records nodes by role. Not a substitute for listening. */
function fakeAudio(initial:'running'|'suspended'='running'){
 const made={gains:[] as Param[],oscillators:[] as {type:string;frequency:Param;detune:Param}[],started:0,constructed:0,closed:0,resumes:0,randomCalls:0};
 class Node {connect(){}disconnect(){}}
 class Oscillator extends Node {frequency=new Param();detune=new Param();type='sine';onended?:()=>void;constructor(){super();made.oscillators.push(this);}start(){made.started++;}stop(){}}
 class Gain extends Node {gain=new Param();constructor(){super();made.gains.push(this.gain);}}
 class Filter extends Node {type='lowpass';frequency=new Param();Q=new Param();}
 class Source extends Node {buffer:unknown;loop=false;start(){}}
 class Compressor extends Node {threshold=new Param();ratio=new Param();}
 class Context {
  currentTime=0;destination={};sampleRate=8000;state:string=initial;
  constructor(){made.constructed++;}
  createGain(){return new Gain();}createOscillator(){return new Oscillator();}createBiquadFilter(){return new Filter();}
  createBufferSource(){return new Source();}createDynamicsCompressor(){return new Compressor();}
  createBuffer(_c:number,length:number){const data=new Float32Array(length);return {getChannelData:()=>data};}
  resume(){made.resumes++;if(this.state!=='closed')this.state=granted?'running':this.state;return Promise.resolve();}
  close(){made.closed++;return Promise.resolve();}
 }
 let granted=initial==='running';
 Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:Context});
 const random=Math.random;Math.random=()=>{made.randomCalls++;return random();};
 return {made,grant:()=>{granted=true;},restore:()=>{Math.random=random;}};
}
const car=(speed:number,gear:'D'|'R'='D',steering=0)=>({speed,gear,steering});
const idle={throttle:0,brake:0,handbrake:false};

test('vehicle sound follows speed, throttle, braking and reverse; pause and mute silence it',()=>{
 const audio=fakeAudio(),{made}=audio;
 const sound=new Sound();assert.equal(made.constructed,0,'Audio starts only after activation');assert.equal(sound.state,'off');
 sound.unlock();sound.unlock();assert.equal(made.constructed,1);assert.equal(sound.state,'running');
 const [master,engineGain]=made.gains,engine=made.oscillators[0],upper=made.oscillators[1];
 assert.equal(engine.type,'sawtooth','A harmonic-rich engine reaches small speakers');
 sound.update(.1,true,car(10),idle,defaults);
 assert.equal(master.target,defaults.volume);assert.equal(engine.frequency.target,enginePitch(10,'D',0));assert.equal(upper.frequency.target,engine.frequency.target*2);
 const cruising=engineGain.target;
 sound.update(.1,true,car(10),{...idle,throttle:1},defaults);
 assert.ok(engine.frequency.target>enginePitch(10,'D',0),'Accelerating revs the engine');assert.ok(engineGain.target>cruising,'and makes it louder');
 const brake=made.gains[5],whine=made.gains[3];
 assert.equal(brake.target,0);sound.update(.1,true,car(10),{...idle,brake:1},defaults);assert.ok(brake.target>0,'Braking while moving hisses');
 sound.update(.1,true,car(0),{...idle,brake:1},defaults);assert.equal(brake.target,0,'but not when standing still');
 assert.equal(whine.target,0);
 const before=made.started;sound.update(.1,true,car(-3,'R'),idle,defaults);
 assert.ok(whine.target>0,'Reverse adds its own whine');assert.ok(made.started>before,'Selecting reverse clunks');
 assert.ok(enginePitch(3,'R',0)>enginePitch(3,'D',0));
 sound.update(.1,false,car(10,'R'),idle,defaults);assert.equal(master.target,0,'Pause, atlas and menus fade out');
 sound.update(.1,true,car(10),idle,{...defaults,volume:0});assert.equal(master.target,0,'Mute is silent');
 sound.dispose();assert.equal(made.closed,1);
 assert.equal(made.randomCalls,0,'Sound never consumes the seeded dispatch random source');
 audio.restore();
});

test('a suspended audio device is reported and retried while driving, e.g. after a controller-only start',()=>{
 const audio=fakeAudio('suspended'),{made}=audio;
 const sound=new Sound();sound.unlock();assert.equal(sound.state,'waiting');const first=made.resumes;
 sound.update(.1,true,car(0),idle,defaults);sound.update(.1,true,car(0),idle,defaults);
 assert.ok(made.resumes>first,'Resume is retried while running');const retried=made.resumes;
 for(let i=0;i<5;i++)sound.update(.1,true,car(0),idle,defaults);assert.ok(made.resumes<=retried+1,'at most about once a second');
 audio.grant();for(let i=0;i<12;i++)sound.update(.1,true,car(0),idle,defaults);assert.equal(sound.state,'running');
 Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:class {constructor(){throw new Error('No audio device');}}});
 const missing=new Sound();missing.unlock();assert.equal(missing.state,'unavailable');missing.update(.1,true,car(0),idle,defaults);
 audio.restore();
});

test('the built-in radio has its own level, ducks under acceleration and stands in for an unplayable folder',()=>{
 const audio=fakeAudio(),{made}=audio;const sound=new Sound();sound.unlock();
 const radio=made.gains[6];
 sound.update(.1,true,car(5),idle,defaults);assert.equal(radio.target,0,'Radio is off by default');
 sound.update(.1,true,car(5),idle,{...defaults,radio:true});const level=radio.target;assert.ok(level>0);
 sound.update(.1,true,car(5),idle,{...defaults,radio:true,music:1});assert.ok(radio.target>level,'Music level is separate from the volume');
 sound.update(.1,true,car(5),{...idle,throttle:1},{...defaults,radio:true});assert.ok(radio.target<level,'Music ducks while accelerating');
 sound.update(.1,true,car(5),idle,{...defaults,radio:true,radioSource:'folder'});assert.equal(radio.target,0,'A playable folder replaces the tune');
 sound.update(.1,true,car(5),idle,{...defaults,radio:true,radioSource:'folder'},true);assert.ok(radio.target>0,'and the tune stands in for an unplayable one');
 assert.equal(musicGain({...defaults,volume:0,music:1},0),0,'Mute silences the music too');
 assert.ok(musicGain(defaults,1)<musicGain(defaults,0));
 audio.restore();
});

test('sound defaults are audible, old saved levels are kept and malformed audio settings fall back',()=>{
 assert.equal(defaults.volume,.75);assert.equal(defaults.music,.5);assert.equal(defaults.radio,false);assert.equal(defaults.radioSource,'builtin');
 const read=(value:object)=>readSettings({getItem:()=>JSON.stringify(value)});
 assert.equal(read({volume:.25}).volume,.25,'A saved Quiet choice is a preference, not a default');
 assert.equal(read({volume:0}).volume,0,'A saved mute stays muted');
 assert.equal(read({volume:.3}).volume,.25,'Odd values snap to an offered step');
 assert.equal(read({volume:'loud',music:Infinity,radioSource:'http://stream'}).volume,.75);
 assert.equal(read({music:Infinity}).music,.5);assert.equal(read({radioSource:'http://stream'}).radioSource,'builtin');
 assert.deepEqual(read({detail:false,volume:.5,radio:true}),{...defaults,detail:false,volume:.5,radio:true},'0.9 settings migrate with new radio defaults');
});

class FakePlayer extends EventTarget {
 src='';volume=1;paused=true;plays=0;loads=0;failNext='';
 load(){this.loads++;}
 play(){this.plays++;this.paused=false;return Promise.resolve();}
 pause(){this.paused=true;}
 removeAttribute(){this.src='';}
}
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const library=(value:Partial<MusicLibrary>):MusicLibrary=>({status:'ok',folder:'Radio',tracks:ids.map((id,i)=>({id,title:`Track ${i+1}`})),skipped:0,...value});

test('the folder radio plays by id, skips unreadable tracks and explains missing, empty and unreadable folders',async()=>{
 const player=new FakePlayer();let next:MusicLibrary=library({skipped:2});let calls=0;
 const api:MusicApi={library:async()=>{calls++;return next;},chooseFolder:async()=>next};
 const radio=new Radio(api,()=>player as unknown as HTMLAudioElement);let changes=0;radio.onChange=()=>changes++;
 assert.equal(radio.available,true);assert.equal(radio.playable,false);assert.match(radio.message,/No music folder chosen/);
 await radio.load();assert.equal(calls,1);assert.equal(radio.playable,true);assert.match(radio.message,/“Radio”: 3 tracks, 2 other files ignored/);
 radio.update(false,.5);assert.equal(player.plays,0,'Nothing plays outside driving');
 radio.update(true,.4);assert.equal(player.src,`cerea-music://track/${ids[0]}`);assert.equal(player.plays,1);assert.equal(player.volume,.4);
 radio.update(true,.4);assert.equal(player.plays,1,'No restart every frame');
 radio.update(false,.4);assert.equal(player.paused,true,'Pause and atlas pause the music, keeping its place');
 radio.update(true,0);assert.equal(player.paused,true,'Muted music does not play');
 radio.next();radio.update(true,.4);assert.equal(player.src,`cerea-music://track/${ids[1]}`);assert.equal(radio.summary,'2/3 Track 2');
 radio.previous();radio.previous();assert.equal(radio.summary,'3/3 Track 3','Previous wraps around');
 radio.update(true,.4);player.dispatchEvent(new Event('ended'));radio.update(true,.4);assert.equal(player.src,`cerea-music://track/${ids[0]}`,'A finished track advances');
 player.dispatchEvent(new Event('error'));assert.match(radio.message,/Skipped “Track 1”/);radio.update(true,.4);assert.equal(player.src,`cerea-music://track/${ids[1]}`);
 player.dispatchEvent(new Event('error'));radio.update(true,.4);player.dispatchEvent(new Event('error'));
 assert.equal(radio.playable,false,'After every track fails, the built-in tune takes over');assert.match(radio.message,/None of the tracks/);
 const before=player.plays;radio.update(true,.4);assert.equal(player.plays,before);
 for(const [status,pattern] of [['missing',/not available/],['empty',/no supported music/],['unreadable',/cannot be read/],['none',/No music folder chosen/]] as const){
  next=library({status,tracks:[]});await radio.load();assert.equal(radio.playable,false);assert.match(radio.message,pattern);
 }
 next=library({tracks:[{id:'../../secret',title:'x'},{id:ids[2],title:'Kept'}]});await radio.load();
 assert.equal(radio.summary,'1/1 Kept','Malformed ids from the bridge are ignored');
 next={...library({}),cancelled:true};await radio.choose();assert.match(radio.message,/Kept “Radio”/,'Cancelling the dialog keeps the folder');
 assert.ok(changes>0);
});

test('the radio survives a failing bridge and explains the browser build',async()=>{
 const broken=new Radio({library:async()=>{throw new Error('ipc');},chooseFolder:async()=>{throw new Error('ipc');}},()=>new FakePlayer() as unknown as HTMLAudioElement);
 await broken.load();assert.equal(broken.playable,false);assert.match(broken.message,/could not be read/);
 const browser=new Radio(undefined,()=>new FakePlayer() as unknown as HTMLAudioElement);assert.equal(browser.available,false);
 await browser.choose();assert.match(browser.message,/needs the desktop app/);browser.next();browser.update(true,1);
});

test('changing the volume plays a short check tone at that level, and none when muted',()=>{
 const audio=fakeAudio(),{made}=audio;const sound=new Sound();
 sound.preview(0);assert.equal(made.constructed,1,'The check unlocks audio');const started=made.started;
 assert.equal(made.started,started,'Mute plays nothing');
 const gains=made.gains.length;sound.preview(.5);assert.equal(made.started,started+2);assert.equal(made.gains[gains].value,.5);
 audio.restore();
});
