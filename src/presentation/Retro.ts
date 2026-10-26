import * as THREE from 'three';
/** One inexpensive full-screen pass; DOM UI always stays at display resolution. */
export class Retro {
  private target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  private scene=new THREE.Scene();
  private camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  constructor(){
    const mat=new THREE.ShaderMaterial({uniforms:{image:{value:this.target.texture}},depthTest:false,depthWrite:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`uniform sampler2D image;varying vec2 vUv;void main(){vec4 c=linearToOutputTexel(texture2D(image,vUv));vec2 p=mod(floor(gl_FragCoord.xy),2.);float b=p.x==0.?(p.y==0.?0.:3.):(p.y==0.?2.:1.);c.rgb=floor(clamp(c.rgb+(b-1.5)/192.,0.,1.)*31.+.5)/31.;gl_FragColor=c;}`});
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat));
  }
  render(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera){
    const size=renderer.getSize(new THREE.Vector2());
    if(this.target.width!==size.x||this.target.height!==size.y)this.target.setSize(size.x,size.y);
    renderer.setRenderTarget(this.target);renderer.render(scene,camera);
    renderer.setRenderTarget(null);renderer.render(this.scene,this.camera);
  }
}
