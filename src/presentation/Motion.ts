/** Presentation only: no changes to car physics, heading, stopping or compass. */
export class BodyMotion {
  roll=0;pitch=0;wobble=0;
  private previousSpeed=0;
  private time=0;
  update(dt:number,speed:number,steering:number,enabled:boolean){
    const acceleration=dt>0?(speed-this.previousSpeed)/dt:0;this.previousSpeed=speed;
    if(enabled)this.time+=dt;
    const blend=1-Math.exp(-7*dt);
    this.roll+=((enabled?-steering*Math.min(Math.abs(speed),16)*.0008:0)-this.roll)*blend;
    this.pitch+=((enabled?Math.max(-.008,Math.min(.008,acceleration*.0007)):0)-this.pitch)*blend;
    this.wobble=enabled?Math.sin(this.time*19)*Math.min(Math.abs(speed),15)*.00035:0;
    if(!enabled){this.roll=0;this.pitch=0;}
  }
  reset(speed=0){this.roll=0;this.pitch=0;this.wobble=0;this.previousSpeed=speed;this.time=0;}
}
