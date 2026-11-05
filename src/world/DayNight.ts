import * as THREE from 'three';
import type {Point} from './schema';
export function daylightAt(hour:number){const h=((hour%24)+24)%24;return Math.max(0,Math.sin((h-6)/12*Math.PI));}
export class DayNight {
 readonly group=new THREE.Group();
 readonly sun=new THREE.DirectionalLight(0xffe5bd,2.5);
 readonly moon=new THREE.DirectionalLight(0x829fcf,.3);
 readonly ambient=new THREE.HemisphereLight(0xdde8ed,0x6d5946,1.5);
 readonly stars:THREE.Points;
 readonly sunDisc:THREE.Sprite;readonly moonDisc:THREE.Sprite;
 private readonly headlight=new THREE.SpotLight(0xffe6ae,90,85,.6,.7,1);
 private readonly canvas=document.createElement('canvas');
 private readonly sky:THREE.CanvasTexture;
 private minute=-1;
 constructor(private scene:THREE.Scene,private latitude=45){
  this.group.name='Day and night sky';this.canvas.width=16;this.canvas.height=128;this.sky=new THREE.CanvasTexture(this.canvas);this.sky.colorSpace=THREE.SRGBColorSpace;scene.background=this.sky;
  const disc=(moon:boolean)=>{const c=document.createElement('canvas');c.width=c.height=64;const p=c.getContext('2d')!;p.fillStyle=moon?'#d9e2e5':'#ffe2a0';p.beginPath();p.arc(32,32,25,0,Math.PI*2);p.fill();if(moon){p.fillStyle='#aab8c1';for(const [x,y,r] of [[21,24,5],[39,38,7],[27,44,3]]){p.beginPath();p.arc(x,y,r,0,Math.PI*2);p.fill();}}const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,fog:false,depthWrite:false,toneMapped:false}));sprite.scale.setScalar(moon?65:80);return sprite;};
  this.sunDisc=disc(false);this.moonDisc=disc(true);
  const positions:number[]=[],colours:number[]=[];
  for(let i=0;i<320;i++){const az=i*2.3999632297,y=.08+.91*((i*73%317)/317),r=Math.sqrt(1-y*y);positions.push(Math.sin(az)*r*1200,y*1200,Math.cos(az)*r*1200);const light=.6+(i%5)*.1;colours.push(light,light,Math.min(1,light+.08));}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
  this.stars=new THREE.Points(geometry,new THREE.PointsMaterial({size:1.6,sizeAttenuation:false,vertexColors:true,transparent:true,depthWrite:false,fog:false,toneMapped:false}));
  this.group.add(this.sun,this.sun.target,this.moon,this.moon.target,this.ambient,this.sunDisc,this.moonDisc,this.stars,this.headlight,this.headlight.target);
  this.headlight.position.set(0,1.1,0);scene.add(this.group);this.update(7);
 }
 position(point:Point,heading=0){this.group.position.set(point.x,0,point.z);this.headlight.target.position.set(Math.sin(heading)*35,0,-Math.cos(heading)*35);}
 update(hour:number){
  const day=daylightAt(hour),night=1-THREE.MathUtils.smoothstep(day,0,.35),angle=(hour-6)/12*Math.PI;
  const direction=new THREE.Vector3(Math.cos(angle),Math.sin(angle),this.latitude<0?-.28:.28).normalize();this.sun.position.copy(direction).multiplyScalar(1000);this.moon.position.copy(this.sun.position).multiplyScalar(-1);
  this.sunDisc.position.copy(this.sun.position);this.moonDisc.position.copy(this.moon.position);
  this.sunDisc.visible=direction.y>-.02;this.moonDisc.visible=-direction.y>-.02&&night>.1;this.sun.intensity=day*2.6;this.moon.intensity=night*.3;
  this.ambient.intensity=.4+day*1.3;this.ambient.color.copy(new THREE.Color(0x829cc1).lerp(new THREE.Color(0xdde8ed),1-night));(this.stars.material as THREE.PointsMaterial).opacity=night*.9;this.headlight.visible=night>.2;
  const horizon=new THREE.Color(0x111c35).lerp(new THREE.Color(0xb4bec7),Math.sqrt(day));if(this.scene.fog)this.scene.fog.color.copy(horizon);
  if(this.minute!==Math.floor(hour*60)){
   this.minute=Math.floor(hour*60);const p=this.canvas.getContext('2d')!,g=p.createLinearGradient(0,0,0,128),top=new THREE.Color(0x050a1b).lerp(new THREE.Color(0x557e9b),Math.sqrt(day));
   g.addColorStop(0,'#'+top.getHexString());g.addColorStop(.52,'#'+horizon.getHexString());const glow=horizon.clone().lerp(new THREE.Color(0xb98b77),Math.max(0,1-Math.abs(day-.2)/.2));g.addColorStop(.64,'#'+glow.getHexString());g.addColorStop(1,'#172133');p.fillStyle=g;p.fillRect(0,0,16,128);this.sky.needsUpdate=true;
  }
 }
 dispose(){this.group.removeFromParent();this.stars.geometry.dispose();(this.stars.material as THREE.Material).dispose();for(const disc of [this.sunDisc,this.moonDisc]){disc.material.map?.dispose();disc.material.dispose();}this.sky.dispose();}
}
