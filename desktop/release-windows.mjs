import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
function run(command,args,capture=false){
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit',shell:false});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${command} failed (${result.status}): ${result.stderr??''}`);
  return result.stdout?.trim();
}
function cleanSource(){if(run('git',['status','--porcelain','--untracked-files=normal'],true))throw new Error('Commit source changes before building a release. Generated release/ and test-results/ stay ignored.');}
async function hash(file){const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');}
async function inventory(directory,prefix=''){
  const files=[];
  for(const entry of (await readdir(path.join(directory,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
    const relative=prefix?`${prefix}/${entry.name}`:entry.name;
    if(entry.isSymbolicLink())throw new Error(`Release contains a symbolic link: ${relative}`);
    if(entry.isDirectory())files.push(...await inventory(directory,relative));
    else if(entry.isFile()){const file=path.join(directory,relative);files.push({path:relative,bytes:(await stat(file)).size,sha256:await hash(file)});}
    else throw new Error(`Unsupported release entry: ${relative}`);
  }
  return files;
}

if(process.platform==='win32')throw new Error('Run release:win from WSL/Linux; it requires Python 3 and the Linux npm command.');
cleanSource();
const metadata=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(metadata.version)||metadata.version!==lock.version||metadata.version!==lock.packages[''].version)throw new Error('Package and lock versions must agree.');
const sourceCommit=run('git',['rev-parse','HEAD'],true);
const sourceDate=run('git',['show','-s','--format=%cI','HEAD'],true);
const output=path.join(root,'release',`v${metadata.version}`);
const stem=`Cerea-Vice-${metadata.version}-win32-x64`;
try{
  const previous=JSON.parse(await readFile(path.join(output,'release-info.json'),'utf8'));
  if(previous.sourceCommit!==sourceCommit)throw new Error(`A release for this version already exists at a different commit. Choose a new version: ${output}`);
}catch(error){if(error.code!=='ENOENT')throw error;}
// Fail on missing archive prerequisites before spending time packaging Electron.
run('python3',['--version']);
run('npm',['run','desktop:package:win']);
cleanSource();
if(sourceCommit!==run('git',['rev-parse','HEAD'],true))throw new Error('Source commit changed during the release build.');
const bundle=path.join(root,'release','Cerea Vice-win32-x64');
await stat(path.join(bundle,'cerea-vice.exe'));
await stat(path.join(bundle,'resources','app.asar'));
const notes=await readFile(path.join(root,'docs','releases',`${metadata.version}.md`),'utf8');
const build={version:metadata.version,sourceCommit,sourceDate,platform:'win32',arch:'x64',electron:JSON.parse(await readFile(path.join(root,'node_modules','electron','package.json'),'utf8')).version};
await writeFile(path.join(bundle,'BUILD.json'),JSON.stringify(build,null,2)+'\n');
await writeFile(path.join(bundle,'RELEASE-NOTES.md'),notes);
await writeFile(path.join(bundle,'START-HERE.txt'),`Cerea Vice ${metadata.version}\r\n\r\nExtract this entire folder to a local Windows directory.\r\nOpen cerea-vice.exe. Keep the files together. No npm or Node.js is needed.\r\nChoose Cerea Centro, Harbor District or Cerea outskirts prototype before starting.\r\n\r\nSave shift / Continue saved shift and Change controls are in the pause menu.\r\nPlayer data stays in %LOCALAPPDATA%\\CereaVice\\profile across upgrades.\r\nDo not delete this profile when replacing the application folder.\r\n\r\nThis is an unsigned portable playtest candidate. See RELEASE-NOTES.md.\r\nSource commit: ${sourceCommit}\r\n`);
const files=await inventory(bundle);
await mkdir(output,{recursive:true});
const archive=path.join(output,`${stem}.zip`);
run('python3',[path.join(root,'tools','archive-release.py'),bundle,archive,stem,String(Math.floor(Date.parse(sourceDate)/1000))]);
const archiveSha256=await hash(archive);
await writeFile(path.join(output,'release-info.json'),JSON.stringify({...build,archive:path.basename(archive),archiveSha256,files},null,2)+'\n');
await writeFile(path.join(output,'RELEASE-NOTES.md'),notes);
const artifacts=[path.basename(archive),'release-info.json','RELEASE-NOTES.md'];
const sums=[];for(const file of artifacts)sums.push(`${await hash(path.join(output,file))}  ${file}`);
await writeFile(path.join(output,'SHA256SUMS.txt'),sums.join('\n')+'\n');
console.log(`Release candidate: ${output}\nSource: ${sourceCommit}\nZIP SHA-256: ${archiveSha256}`);
