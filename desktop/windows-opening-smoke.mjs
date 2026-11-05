import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

// WSL or Windows: exercise the native export in a disposable profile, then close only this instance.
const root=path.resolve(import.meta.dirname,'..');
await mkdir(path.join(root,'test-results'),{recursive:true});
const win=p=>process.platform==='win32'?p:execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
const literal=s=>`'${s.replaceAll("'","''")}'`;
const source=win(path.join(root,'release','Cerea Vice-win32-x64'));
const images=win(path.join(root,'test-results'));
const script=`$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$target=Join-Path $env:TEMP ('CereaOpeningCheck-'+[guid]::NewGuid().ToString('N'))
$process=$null
$socket=$null
try {
 New-Item -ItemType Directory -Path $target | Out-Null
 Copy-Item -Path (Join-Path ${literal(source)} '*') -Destination $target -Recurse -Force
 $profile=Join-Path $target 'test-profile'
 $process=Start-Process -FilePath (Join-Path $target 'cerea-vice.exe') -ArgumentList @('--district=veronese',('--user-data-dir="'+$profile+'"'),'--remote-debugging-port=0') -WorkingDirectory $target -PassThru
 $active=Join-Path $profile 'DevToolsActivePort'
 for($attempt=0;$attempt -lt 60;$attempt++){
  Start-Sleep -Milliseconds 250
  $process.Refresh()
  if($process.HasExited){throw 'Windows game exited during startup'}
  if((Test-Path $active) -and $process.MainWindowTitle){break}
 }
 if(-not (Test-Path $active)){throw 'Windows DevTools endpoint did not open'}
 $port=(Get-Content $active)[0]
 $page=(Invoke-RestMethod ('http://127.0.0.1:'+ $port +'/json/list') | Where-Object {$_.type -eq 'page'})[0]
 $socket=New-Object System.Net.WebSockets.ClientWebSocket
 $socket.ConnectAsync([Uri]$page.webSocketDebuggerUrl,[Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
 $script:commandId=0
 function Cdp($method,$parameters){
  $script:commandId++
  $json=@{id=$script:commandId;method=$method;params=$parameters}|ConvertTo-Json -Depth 15 -Compress
  $bytes=[Text.Encoding]::UTF8.GetBytes($json)
  $socket.SendAsync([ArraySegment[byte]]::new($bytes),[Net.WebSockets.WebSocketMessageType]::Text,$true,[Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
  do {
   $message=New-Object IO.MemoryStream
   do {
    $buffer=New-Object byte[] 65536
    $received=$socket.ReceiveAsync([ArraySegment[byte]]::new($buffer),[Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $message.Write($buffer,0,$received.Count)
   } while(-not $received.EndOfMessage)
   $reply=[Text.Encoding]::UTF8.GetString($message.ToArray())|ConvertFrom-Json
   $message.Dispose()
  } while($reply.id -ne $script:commandId)
  if($reply.error){throw ($reply.error|ConvertTo-Json -Compress)}
  return $reply.result
 }
 function Js($expression){$reply=Cdp 'Runtime.evaluate' @{expression=$expression;returnByValue=$true;awaitPromise=$true};if($reply.exceptionDetails){throw ($reply.exceptionDetails|ConvertTo-Json -Compress)};return $reply.result.value}
 for($attempt=0;$attempt -lt 60;$attempt++){if(Js "Boolean(document.querySelector('#opening button:not(:disabled)'))"){break};Start-Sleep -Milliseconds 250}
 $ready=Js "Boolean(document.querySelector('#opening button:not(:disabled)'))"
 if(-not $ready){throw 'Windows demo did not become ready'}
 Js "localStorage.setItem('cerea-save-veronese','Windows isolation sentinel')" | Out-Null
 $before=Js 'JSON.stringify(localStorage)'
 Start-Sleep -Seconds 8
 if((Js 'JSON.stringify(localStorage)') -ne $before){throw 'Windows demo modified local storage'}
 $demo=Js "({label:document.querySelector('.demo-label').textContent,stage:document.querySelector('#objective-stage').textContent,speed:document.querySelector('#speed').textContent})"
 $shot=Cdp 'Page.captureScreenshot' @{format='png'}
 [IO.File]::WriteAllBytes((Join-Path ${literal(images)} 'opening-windows-demo.png'),[Convert]::FromBase64String($shot.data))
 Js "document.querySelector('#opening button').click()" | Out-Null
 Start-Sleep -Milliseconds 700
 if(-not (Js "Boolean(document.querySelector('.opening-instructions'))")){throw 'Windows rules did not open'}
 $clock=Js "document.querySelector('#timer').textContent"
 Start-Sleep -Milliseconds 700
 if((Js "document.querySelector('#timer').textContent") -ne $clock){throw 'Windows rules did not freeze time'}
 Js "Math.random=(()=>{const values=[.68,.1,.4];return()=>values.shift()??.37})();document.querySelector('.briefing-main button').click()" | Out-Null
 Start-Sleep -Milliseconds 700
 $fresh=Js "({opening:!!document.querySelector('#opening'),stage:document.querySelector('#objective-stage').textContent,money:document.querySelector('#taxi-status').textContent,startHint:document.querySelector('#hint').textContent,save:localStorage.getItem('cerea-save-veronese')})"
 if($fresh.opening -or $fresh.stage -notmatch 'FREE DRIVING' -or $fresh.money -notmatch '0.00' -or $fresh.save -ne 'Windows isolation sentinel'){throw ('Windows handoff failed: '+($fresh|ConvertTo-Json -Compress))}
 for($attempt=0;$attempt -lt 80;$attempt++){if(Js "document.querySelector('#stream-status').hidden"){break};Start-Sleep -Milliseconds 250}
 if(-not (Js "document.querySelector('#stream-status').hidden")){throw 'Native unified-world scenery did not become ready'}
 if($fresh.startHint -notmatch 'Verona'){throw 'The native performance sample did not start in Verona'}
 $performance=Js "(async()=>{const times=[];let last=await new Promise(requestAnimationFrame);for(let i=0;i<120;i++){const now=await new Promise(requestAnimationFrame);times.push(now-last);last=now;}times.sort((a,b)=>a-b);return {frameMeanMs:times.reduce((a,b)=>a+b,0)/times.length,frameP95Ms:times[Math.floor(times.length*.95)],heapMiB:performance.memory?.usedJSHeapSize/1048576};})()"
 $shot=Cdp 'Page.captureScreenshot' @{format='png'}
 [IO.File]::WriteAllBytes((Join-Path ${literal(images)} 'opening-windows-playing.png'),[Convert]::FromBase64String($shot.data))
 Write-Output ('Windows native opening passed: '+$process.MainWindowTitle)
 Write-Output ($demo|ConvertTo-Json -Compress)
 Write-Output ($fresh|ConvertTo-Json -Compress)
 Write-Output ($performance|ConvertTo-Json -Compress)
} finally {
 if($socket){$socket.Dispose()}
 if($process -and -not $process.HasExited){$process.CloseMainWindow()|Out-Null;if(-not $process.WaitForExit(5000)){Stop-Process -Id $process.Id -Force;$process.WaitForExit()}}
 for($attempt=0;$attempt -lt 20;$attempt++){try{if(Test-Path $target){Remove-Item -LiteralPath $target -Recurse -Force};break}catch{if($attempt -eq 19){throw};Start-Sleep -Milliseconds 250}}
}
`;
const encoded=Buffer.from(script,'utf16le').toString('base64');
process.stdout.write(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024}));
