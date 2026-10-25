import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const bundle=path.join(root,'release','Cerea Vice-win32-x64');
if(!existsSync(path.join(bundle,'cerea-vice.exe'))) throw new Error('Build the Windows bundle with npm run desktop:package:win first.');
const requested=process.argv[2]??'cerea';
if(!['cerea','harbor'].includes(requested))throw new Error('Choose cerea or harbor.');
const source=process.platform==='win32'?bundle:execFileSync('wslpath',['-w',bundle],{encoding:'utf8'}).trim();
const literal=(text)=>`'${text.replaceAll("'","''")}'`;
const script=`$ErrorActionPreference = 'Stop'
$source = ${literal(source)}
$target = Join-Path $env:TEMP ('CereaVice-0.2-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
$process = Start-Process -FilePath (Join-Path $target 'cerea-vice.exe') -ArgumentList ${literal('--district='+requested)} -WorkingDirectory $target -PassThru
Write-Output ('Opened Cerea Vice ${requested} (PID ' + $process.Id + ') from ' + $target)
`;
const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{stdio:'inherit',shell:false});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
