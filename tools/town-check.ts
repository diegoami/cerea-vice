/** Check listed districts: `npm run town:check -- [id ...]` (all when none are named). See tools/town-doctor.ts. */
import registryData from '../public/maps/towns.json';
import {validateRegistry} from '../src/world/load';
import {checkTown} from './town-doctor';

const registry=validateRegistry(registryData),ids=process.argv.slice(2);
const unknown=ids.filter(id=>!registry.towns.some(t=>t.id===id));
if(unknown.length){console.error(`Not in public/maps/towns.json: ${unknown.join(', ')}. Listed: ${registry.towns.map(t=>t.id).join(', ')}`);process.exit(2);}
let failed=0;
for(const town of registry.towns.filter(t=>!ids.length||ids.includes(t.id))){
 const start=performance.now(),results=checkTown(town);
 console.log(`\n${town.name} (${town.id}), ${((performance.now()-start)/1000).toFixed(1)} s`);
 for(const check of results){
  console.log(`  ${check.problems.length?'FAIL':'ok  '} ${check.title}${check.notes.length?` — ${check.notes.join('; ')}`:''}`);
  for(const problem of check.problems)console.log(`       ${problem}`);
  if(check.problems.length)failed++;
 }
}
if(failed){console.log(`\n${failed} check(s) failed.`);process.exit(1);}
