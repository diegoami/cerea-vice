import * as THREE from 'three';
import type { Car } from './Car';
import {createPerson} from '../world/People';
import {cockpit as colours} from '../world/palette';

export const MIRROR_MOUNTS = [[-1.13,-1.30,.50,-.35,.24],[1.45,-1.85,-.85,.35,.34]] as const;

// An economical 1980s interior, fixed to the car rather than the player's gaze.
export class Cockpit {
  readonly interior = new THREE.Group();
  private wheel = new THREE.Group();
  private lever = new THREE.Group();
  private instruments = document.createElement('canvas');
  private instrumentTexture: THREE.CanvasTexture;
  private lastReadout = '';
  private passenger?:THREE.Group;
  private passengerIdentity='';
  private mirrorTime = 0;
  private mirrors: { camera: THREE.PerspectiveCamera; target: THREE.WebGLRenderTarget; position: THREE.Vector3; direction: THREE.Vector3 }[] = [];

  constructor(scene: THREE.Scene) {
    const cabin=this.interior;
    cabin.name='1986 car interior';
    scene.add(cabin);
    const vinyl=new THREE.MeshLambertMaterial({color:colours.vinyl});
    const trim=new THREE.MeshLambertMaterial({color:colours.trim});
    const cloth=new THREE.MeshLambertMaterial({color:colours.cloth});
    const rubber=new THREE.MeshLambertMaterial({color:colours.rubber});
    const chrome=new THREE.MeshLambertMaterial({color:colours.chrome});
    const box=(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
      mesh.position.set(x,y,z);parent.add(mesh);return mesh;
    };
    // Low dashboard and bonnet leave the road and signs above the dash clear.
    box(cabin,.32,1.29,-1.12,2.08,.38,.5,vinyl);
    box(cabin,.32,1.49,-1.18,2.12,.07,.55,trim);
    box(cabin,.32,1.26,-2.06,2.05,.10,1.3,trim);
    for(const x of [-.76,1.40]) {
      box(cabin,x,1.19,.05,.10,.60,1.9,vinyl);
      box(cabin,x,1.51,.05,.12,.07,1.9,trim);
      box(cabin,x,2.13,-1.12,.045,1.36,.065,trim).rotation.x=-.18;
      box(cabin,x,1.39,.15,.07,.07,.32,chrome); // Door pull.
    }
    box(cabin,.32,2.88,-.04,2.2,.07,2.3,cloth);
    box(cabin,.32,2.82,-1.12,2.15,.12,.08,vinyl);
    for(const x of [0,.98]) {
      box(cabin,x,1.04,.57,.62,.18,.68,cloth);
      box(cabin,x,1.43,.85,.62,.70,.16,cloth);
      box(cabin,x,1.90,.85,.35,.22,.13,cloth);
    }
    box(cabin,.32,1.20,1.52,1.95,.22,.48,cloth);
    box(cabin,.32,1.52,1.74,1.95,.62,.15,cloth);
    // Three-spoke steering wheel, sloped away from the driver.
    this.wheel.position.set(0,1.53,-.85);
    const column=new THREE.Group();column.position.copy(this.wheel.position);column.rotation.x=-.28;cabin.add(column);
    this.wheel.position.set(0,0,0);column.add(this.wheel);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.235,.025,8,40),rubber);this.wheel.add(rim);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.236,.004,6,40),chrome);ring.position.z=.019;this.wheel.add(ring);
    for(const angle of [0,Math.PI,-Math.PI/2]) {
      const spoke=box(this.wheel,Math.cos(angle)*.105,Math.sin(angle)*.105,0,.21,.036,.03,vinyl);spoke.rotation.z=angle;
    }
    box(this.wheel,0,0,.025,.12,.085,.055,vinyl);
    box(cabin,0,1.43,-.91,.075,.08,.29,vinyl);
    // Instrument binnacle, vents and a simple radio / centre console.
    box(cabin,0,1.59,-1.16,.68,.30,.10,rubber);
    this.instruments.width=768;this.instruments.height=320;
    this.instrumentTexture=new THREE.CanvasTexture(this.instruments);
    this.instrumentTexture.colorSpace=THREE.SRGBColorSpace;
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(.64,.267),new THREE.MeshBasicMaterial({map:this.instrumentTexture}));
    panel.position.set(0,1.60,-1.103);cabin.add(panel);
    for(const x of [.58,1.05]) {
      box(cabin,x,1.43,-.852,.30,.13,.035,rubber);
      for(let i=0;i<4;i++)box(cabin,x,1.385+i*.03,-.825,.27,.009,.01,trim);
    }
    box(cabin,.62,1.17,-.83,.39,.28,.15,vinyl);
    box(cabin,.62,1.23,-.744,.28,.06,.01,rubber);
    for(const x of [.48,.76])box(cabin,x,1.14,-.73,.035,.035,.025,chrome);
    box(cabin,.57,.93,-.30,.33,.17,.61,vinyl);
    box(cabin,.57,1.03,-.32,.17,.025,.24,rubber);
    this.lever.position.set(.57,1.04,-.32);cabin.add(this.lever);
    box(this.lever,0,.10,0,.018,.20,.018,chrome);
    box(this.lever,0,.21,0,.065,.055,.065,rubber);
    // Mirrors render actual rearward scenery; the interior is hidden in those
    // passes to avoid recursion. Modest resolution and 10 Hz keep the cost low.
    for(const [x,z,angle,outward,width] of MIRROR_MOUNTS) {
      box(cabin,x,1.78,z+.02,.17,.045,.10,vinyl);
      const housing=new THREE.Group();housing.position.set(x,1.88,z);housing.rotation.y=angle;cabin.add(housing);
      box(housing,0,0,0,width,.21,.07,rubber);
      const target=new THREE.WebGLRenderTarget(320,192);
      target.texture.colorSpace=THREE.SRGBColorSpace;
      const geometry=new THREE.PlaneGeometry(width-.04,.17);
      const uv=geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));
      const glass=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:target.texture}));glass.position.z=.038;housing.add(glass);
      this.mirrors.push({camera:new THREE.PerspectiveCamera(65,320/192,.15,1000),target,position:new THREE.Vector3(x,1.88,z),direction:new THREE.Vector3(outward,-.08,1).normalize()});
    }
  }

  setPassenger(identity:string){
    if(identity===this.passengerIdentity)return;
    this.passengerIdentity=identity;
    if(this.passenger){this.passenger.removeFromParent();this.passenger.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.passenger=undefined;}
    if(identity){this.passenger=createPerson(identity,true);this.passenger.position.set(.98,.94,.63);this.interior.add(this.passenger);}
  }

  update(car:Pick<Car,"x"|"z"|"heading"|"steering"|"gear"|"speed">,roll=0,pitch=0,wobble=0) {
    this.interior.position.set(car.x,0,car.z);
    this.interior.rotation.set(pitch,-car.heading,roll,"YXZ");
    this.wheel.rotation.z=-car.steering*1.5+wobble;
    this.lever.rotation.x=car.gear==='D'?-.22:.22;
    const speed=Math.round(Math.abs(car.speed)*3.6);
    const readout=`${speed}/${car.gear}`;
    if(readout===this.lastReadout)return;
    this.lastReadout=readout;
    const ctx=this.instruments.getContext('2d')!;
    ctx.fillStyle='#111b1d';ctx.fillRect(0,0,768,320);
    const cx=247,cy=165,r=123;
    ctx.strokeStyle='#697c71';ctx.lineWidth=5;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
    for(let v=0;v<=120;v+=10) {
      const a=(135+v*2.25)*Math.PI/180;
      ctx.strokeStyle='#dfdfbd';ctx.lineWidth=v%20===0?4:2;
      ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*108,cy+Math.sin(a)*108);ctx.lineTo(cx+Math.cos(a)*120,cy+Math.sin(a)*120);ctx.stroke();
      if(v%20===0) {ctx.fillStyle='#e8e6c4';ctx.font='22px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(v),cx+Math.cos(a)*86,cy+Math.sin(a)*86);}
    }
    const a=(135+Math.min(speed,120)*2.25)*Math.PI/180;
    ctx.strokeStyle='#ed945f';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*101,cy+Math.sin(a)*101);ctx.stroke();
    ctx.fillStyle='#dedcc0';ctx.font='21px monospace';ctx.fillText('km/h',cx,cy+48);
    ctx.textAlign='left';ctx.font='19px monospace';ctx.fillStyle='#a8b7a2';ctx.fillText('CEREA  /  1986',438,56);
    ctx.font='bold 70px monospace';ctx.fillStyle='#e9e7c8';ctx.fillText(String(speed).padStart(2,'0'),438,145);
    ctx.font='22px monospace';ctx.fillText('km/h',548,145);
    ctx.font='bold 38px monospace';
    for(const [gear,x] of [['D',458],['R',548]] as const) {ctx.fillStyle=car.gear===gear?'#e7b96d':'#4d6158';ctx.fillText(gear,x,232);}
    ctx.font='18px monospace';ctx.fillStyle='#97a995';ctx.fillText(car.gear==='D'?'FORWARD':'REVERSE',438,285);
    this.instrumentTexture.needsUpdate=true;
  }

  renderMirrors(renderer:THREE.WebGLRenderer,scene:THREE.Scene,dt:number) {
    this.mirrorTime-=dt;
    if(this.mirrorTime>0)return;
    this.mirrorTime=.1;
    this.interior.updateMatrixWorld(true);
    const previous=renderer.getRenderTarget();
    this.interior.visible=false;
    try {
      for(const mirror of this.mirrors) {
        mirror.camera.position.copy(mirror.position).applyMatrix4(this.interior.matrixWorld);
        const direction=mirror.direction.clone().transformDirection(this.interior.matrixWorld);
        mirror.camera.lookAt(mirror.camera.position.clone().add(direction));
        renderer.setRenderTarget(mirror.target);renderer.render(scene,mirror.camera);
      }
    } finally {this.interior.visible=true;renderer.setRenderTarget(previous);}
  }
}
