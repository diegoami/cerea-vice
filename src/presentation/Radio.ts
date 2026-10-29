/** What the desktop shell reports about the player's music folder. Titles and ids only, never paths. */
export interface MusicLibrary {status:'none'|'ok'|'missing'|'empty'|'unreadable';folder?:string;tracks:{id:string;title:string}[];skipped:number;cancelled?:boolean}
/** The preload bridge (desktop/preload.cjs). Absent in an ordinary browser. */
export interface MusicApi {library():Promise<MusicLibrary>;chooseFolder():Promise<MusicLibrary>}
type Player=Pick<HTMLAudioElement,'play'|'pause'|'load'|'addEventListener'|'removeAttribute'>&{src:string;volume:number;paused:boolean};
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** After a playback error that is not an unplayable track (for example an audio-device error), wait before trying again. */
const RETRY_MS=2000;
const short=(text:string)=>text.length>40?`${text.slice(0,39)}…`:text;

/**
 * Local-folder radio. Plays tracks the desktop shell lists, by id, through the
 * cerea-music: protocol. Any failure leaves a readable message and the built-in tune.
 */
export class Radio {
  private library:MusicLibrary={status:'none',tracks:[],skipped:0};
  private index=0;
  private failures=0;
  private loaded='';
  private player?:Player;
  private playing=false;
  private retryAt=0;
  message='';
  onChange:()=>void=()=>{};
  constructor(private readonly api:MusicApi|undefined=(globalThis as {cereaMusic?:MusicApi}).cereaMusic,private readonly createPlayer:()=>Player=()=>new Audio()){
    this.message=api?'No music folder chosen.':'A music folder needs the desktop app; the built-in tune plays instead.';
  }
  get available(){return Boolean(this.api);}
  /** True when a folder track can be played; otherwise the built-in tune stands in. */
  get playable(){return this.library.status==='ok'&&this.failures<this.library.tracks.length;}
  get title(){return this.playable?this.library.tracks[this.index].title:'';}
  get summary(){return this.playable?`${this.index+1}/${this.library.tracks.length} ${short(this.title)}`:'';}
  async load(){if(this.api)await this.receive(()=>this.api!.library(),false);}
  async choose(){if(this.api)await this.receive(()=>this.api!.chooseFolder(),true);}
  private async receive(request:()=>Promise<MusicLibrary>,chosen:boolean){
    let library:MusicLibrary;
    try{library=await request();}catch{this.message='The music folder could not be read. The built-in tune plays instead.';this.onChange();return;}
    if(chosen&&library.cancelled&&this.library.status==='ok'){this.message=`Kept “${library.folder??'your music folder'}”.`;this.onChange();return;}
    const valid=library&&Array.isArray(library.tracks)?library.tracks.filter(t=>t&&ID.test(t.id)&&typeof t.title==='string'):[];
    this.library={status:library?.status??'none',folder:typeof library?.folder==='string'?library.folder:undefined,tracks:valid,skipped:Number(library?.skipped)||0};
    this.index=0;this.failures=0;this.loaded='';this.retryAt=0;this.stop();
    const folder=this.library.folder?`“${this.library.folder}”`:'The music folder';
    const fallback=' The built-in tune plays instead.';
    this.message=this.library.status==='ok'&&valid.length?`${folder}: ${valid.length} track${valid.length===1?'':'s'}${this.library.skipped?`, ${this.library.skipped} other file${this.library.skipped===1?'':'s'} ignored`:''}.`
      :this.library.status==='missing'?`${folder} is not available (moved, renamed or on a disconnected drive). Choose it again or another folder.${fallback}`
      :this.library.status==='unreadable'?`${folder} cannot be read; check its permissions or choose another.${fallback}`
      :this.library.status==='empty'||this.library.status==='ok'?`${folder} has no supported music (MP3, OGG, Opus, WAV, FLAC, M4A/AAC, WebM).${fallback}`
      :'No music folder chosen.';
    if(this.library.status==='ok'&&!valid.length)this.library.status='empty';
    this.onChange();
  }
  next(){this.step(1);}
  previous(){this.step(-1);}
  private step(direction:number){
    if(!this.playable){this.onChange();return;}
    this.index=(this.index+direction+this.library.tracks.length)%this.library.tracks.length;this.failures=0;this.loaded='';this.retryAt=0;
    this.message=`Track ${this.summary}`;this.onChange();
  }
  /** Plays only while driving with the folder source on; pauses (keeping its place) otherwise. */
  update(active:boolean,level:number){
    if(!active||!this.playable||level<=0){this.stop();return;}
    const player=this.player??=this.attach();
    const track=this.library.tracks[this.index];
    if(this.loaded!==track.id){this.loaded=track.id;player.src=`cerea-music://track/${track.id}`;player.load();this.playing=false;}
    player.volume=Math.max(0,Math.min(1,level));
    if(!this.playing&&Date.now()>=this.retryAt){this.playing=true;void player.play().catch((error:unknown)=>{if((error as {name?:string})?.name==='NotSupportedError')this.fail(track.id);else {this.playing=false;this.retryAt=Date.now()+RETRY_MS;}});}
  }
  private stop(){if(this.player&&this.playing){this.player.pause();}this.playing=false;}
  private attach(){
    const player=this.createPlayer();
    player.addEventListener('ended',()=>{this.loaded='';this.index=(this.index+1)%this.library.tracks.length;this.playing=false;this.onChange();});
    player.addEventListener('error',()=>this.fail(this.loaded));
    player.addEventListener('playing',()=>{this.failures=0;});
    return player;
  }
  /** Skip an unreadable or undecodable track; after a full round of failures, fall back. */
  private fail(id:string){
    if(!id||id!==this.loaded||!this.playable)return;
    const title=this.title;this.failures++;this.playing=false;this.loaded='';
    if(this.playable){this.index=(this.index+1)%this.library.tracks.length;this.message=`Skipped “${short(title)}”: it could not be played.`;}
    else {this.player?.removeAttribute('src');this.message=`None of the tracks in “${this.library.folder??'the folder'}” could be played. The built-in tune plays instead.`;}
    this.onChange();
  }
}
