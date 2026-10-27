import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('portable ZIP preserves all files, has a safe extraction root, verifies and is repeatable',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cerea-release-'));
 try{
  const source=path.join(directory,'bundle');await mkdir(path.join(source,'resources'),{recursive:true});
  await writeFile(path.join(source,'cerea-vice.exe'),Buffer.from([0,10,255,20]));await writeFile(path.join(source,'resources','app.asar'),'fixture app');
  const archive=path.join(directory,'candidate.zip');
  const create=()=>spawnSync('python3',['tools/archive-release.py',source,archive,'Cerea-Vice-test-win32-x64','1793088000'],{encoding:'utf8'});
  assert.equal(create().status,0);const original=await readFile(archive);assert.equal(create().status,0);assert.deepEqual(await readFile(archive),original);
  const inspect=spawnSync('python3',['-c',`import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n assert sorted(z.namelist()) == ['Cerea-Vice-test-win32-x64/cerea-vice.exe','Cerea-Vice-test-win32-x64/resources/app.asar']\n assert z.read('Cerea-Vice-test-win32-x64/cerea-vice.exe') == bytes([0,10,255,20])\n`,archive],{encoding:'utf8'});
  assert.equal(inspect.status,0,inspect.stderr);
  await symlink(path.join(source,'cerea-vice.exe'),path.join(source,'linked.exe'));
  assert.notEqual(create().status,0,'Archive must reject links');assert.deepEqual(await readFile(archive),original,'A rejected rebuild preserves the prior ZIP');
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('portable archive rejects extraction traversal and an archive placed inside its own bundle',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cerea-release-path-'));
 try{
  const source=path.join(directory,'bundle');await mkdir(source);
  for(const [file,folder] of [[path.join(directory,'candidate.zip'),'../escape'],[path.join(source,'candidate.zip'),'bundle']]){
   const result=spawnSync('python3',['tools/archive-release.py',source,file,folder,'1793088000'],{encoding:'utf8'});
   assert.notEqual(result.status,0);
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});
