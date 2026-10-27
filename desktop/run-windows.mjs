import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const bundle=path.join(root,'release','Cerea Vice-win32-x64');
const version=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version;
if(!existsSync(path.join(bundle,'cerea-vice.exe'))) throw new Error('Build the Windows bundle with npm run desktop:package:win first.');
const requested=process.argv[2]??'cerea';
if(!['cerea','harbor','cerea-outskirts'].includes(requested))throw new Error('Choose cerea, harbor or cerea-outskirts.');
const source=process.platform==='win32'?bundle:execFileSync('wslpath',['-w',bundle],{encoding:'utf8'}).trim();
const literal=(text)=>`'${text.replaceAll("'","''")}'`;
const script=`$ErrorActionPreference = 'Stop'
$source = ${literal(source)}
$target = Join-Path $env:TEMP (${literal('CereaVice-'+version+'-')} + [guid]::NewGuid().ToString('N').Substring(0,8))
$process = $null
try {
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
  $profile = Join-Path (Join-Path $env:LOCALAPPDATA 'CereaVice') 'profile'
  New-Item -ItemType Directory -Path $profile -Force | Out-Null
  $arguments = @(${literal('--district='+requested)}, ('--user-data-dir="' + $profile + '"'))
  $process = Start-Process -FilePath (Join-Path $target 'cerea-vice.exe') -ArgumentList $arguments -WorkingDirectory $target -PassThru
  $opened = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    $process.Refresh()
    if ($process.HasExited) { throw ('Game exited during startup with code ' + $process.ExitCode) }
    if ($process.MainWindowTitle) {
      Write-Output ('Opened ' + $process.MainWindowTitle + ' (PID ' + $process.Id + ') from ' + $target)
      $opened = $true
      break
    }
  }
  if (-not $opened) { throw 'The game did not open a window within 15 seconds.' }
  # Keep this launcher attached until its own game exits, then remove its copy
  # only. The durable profile (saves and settings) is never removed.
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw ('Game exited with code ' + $process.ExitCode) }
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    $process.WaitForExit()
  }
  # Chromium child processes may release file handles shortly after the parent.
  for ($cleanupAttempt = 0; $cleanupAttempt -lt 20; $cleanupAttempt++) {
    try {
      if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop }
      break
    } catch {
      if ($cleanupAttempt -eq 19) { Write-Warning ('Could not remove playtest folder ' + $target + ': ' + $_.Exception.Message) }
      else { Start-Sleep -Milliseconds 250 }
    }
  }
}
`;
const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{stdio:'inherit',shell:false});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
