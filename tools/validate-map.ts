import path from 'node:path';
import {readFileSync} from 'node:fs';
import {checkTown} from './town-doctor';
const file=path.resolve(process.argv[2]??'');if(!process.argv[2])throw new Error('Give a district JSON or manifest path');
const data=JSON.parse(readFileSync(file,'utf8'));let failed=false;
for(const check of checkTown({id:data.id,map:path.basename(file)},path.dirname(file))){console.log(`${check.problems.length?'FAIL':'OK'} ${check.title}: ${check.notes.join('; ')}`);for(const problem of check.problems)console.log(problem);failed||=check.problems.length>0;}
if(failed)process.exitCode=1;
