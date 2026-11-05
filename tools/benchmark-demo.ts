import {readFileSync} from 'node:fs';
import {District} from '../src/world/district';
import {createCar} from '../src/driving/Car';
import {createParking} from '../src/navigation/Parking';
import {createMission} from '../src/mission/Mission';
import {DemoDriver} from '../src/game/DemoDriver';
import {chooseStartPlace} from '../src/game/StartPlace';
import {SpatialGrid,rectBounds} from '../src/world/SpatialGrid';
import {streamingColliders} from '../src/world/streaming/colliders';
const registry=JSON.parse(readFileSync('public/maps/towns.json','utf8'));
const seconds=Number(process.argv.find(a=>a.startsWith('--seconds='))?.split('=')[1]??180);
if(!Number.isFinite(seconds)||seconds<=0||seconds>3600)throw new Error('Seconds must be 1–3600');
const ids=process.argv.slice(2).filter(a=>!a.startsWith('--'));
for(const id of ids.length?ids:['cerea','lower-verona','verona-plain']){
 const entry=registry.towns.find((t:{id:string})=>t.id===id);if(!entry)throw new Error(`Unknown map ${id}`);
 const context=new District(JSON.parse(readFileSync(`public/maps/${entry.map}`,'utf8')));
 const car=new (createCar(context).Car)(),parking=new (createParking(context).Parking)(),mission=new (createMission(context).Mission)({seed:683129967}),bot=new DemoDriver(context);
 if(id==='veronese')car.reset(chooseStartPlace(context,()=>.01));
 const grid=new SpatialGrid(streamingColliders(context),rectBounds);
 let moving=0,speed=0,reverse=0,changes=0,last=0;
 for(let i=0;i<seconds*60;i++){
  const action=bot.update(1/60,car,parking,mission,grid);car.update(1/60,action,grid);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);
  if(Math.abs(car.speed)>1){moving++;speed+=Math.abs(car.speed);if(Math.abs(action.steer-last)>.2)changes++;last=action.steer;}
  if(car.gear==='R')reverse++;
 }
 console.log(JSON.stringify({map:id,seconds,metres:Math.round(bot.distanceDriven),fares:mission.completedFares,meanMovingKmh:Math.round(speed/Math.max(1,moving)*36)/10,reverseSeconds:Math.round(reverse/6)/10,largeSteeringChanges:changes,collisions:car.collisions,recoveries:bot.recoveries,localChosen:bot.localFaresChosen,interTownChosen:bot.interTownFaresChosen}));
}
