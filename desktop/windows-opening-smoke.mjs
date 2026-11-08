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
const destinationViews=JSON.parse(execFileSync(process.execPath,['--import','tsx',path.join(root,'desktop/destination-view.mjs')],{cwd:root,encoding:'utf8'}));
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
 $demo=Js "({label:document.querySelector('.demo-label').textContent,stage:document.querySelector('#objective-stage').textContent,speed:document.querySelector('#speed').textContent,radioVisible:!document.querySelector('.navigation-message').hidden,earnings:document.querySelector('#earnings').textContent})"
 if($demo.label -cne 'DEMO  MODE'){throw 'The demo label contains extra text'}
 if([double]$demo.speed -gt 0 -and $demo.radioVisible){throw 'Taxi radio obscures the travelling demo'}
 $shot=Cdp 'Page.captureScreenshot' @{format='png'}
 [IO.File]::WriteAllBytes((Join-Path ${literal(images)} 'opening-windows-demo.png'),[Convert]::FromBase64String($shot.data))
 Js "document.querySelector('#opening button').click()" | Out-Null
 Start-Sleep -Milliseconds 700
 if(-not (Js "Boolean(document.querySelector('.opening-instructions'))")){throw 'Windows rules did not open'}
 $clock=Js "document.querySelector('#timer').textContent"
 Start-Sleep -Milliseconds 700
 if((Js "document.querySelector('#timer').textContent") -ne $clock){throw 'Windows rules did not freeze time'}
 Js "Math.random=(()=>{const values=[.68,.1,.4];return()=>values.shift()??.37})();document.querySelector('.briefing-main > button').click()" | Out-Null
 Start-Sleep -Milliseconds 700
 $fresh=Js "({opening:!!document.querySelector('#opening'),stage:document.querySelector('#objective-stage').textContent,money:document.querySelector('#taxi-status').textContent,startHint:document.querySelector('#hint').textContent,save:localStorage.getItem('cerea-save-veronese')})"
 if($fresh.opening -or $fresh.stage -notmatch 'FREE DRIVING' -or $fresh.money -notmatch '0.00' -or $fresh.save -ne 'Windows isolation sentinel'){throw ('Windows handoff failed: '+($fresh|ConvertTo-Json -Compress))}
 for($attempt=0;$attempt -lt 80;$attempt++){if(Js "document.querySelector('#stream-status').hidden"){break};Start-Sleep -Milliseconds 250}
 if(-not (Js "document.querySelector('#stream-status').hidden")){throw 'Native unified-world scenery did not become ready'}
 if($fresh.startHint -notmatch 'Verona'){throw 'The native performance sample did not start in Verona'}
 $performance=Js "(async()=>{const times=[];let last=await new Promise(requestAnimationFrame);for(let i=0;i<120;i++){const now=await new Promise(requestAnimationFrame);times.push(now-last);last=now;}times.sort((a,b)=>a-b);return {frameMeanMs:times.reduce((a,b)=>a+b,0)/times.length,frameP95Ms:times[Math.floor(times.length*.95)],heapMiB:performance.memory?.usedJSHeapSize/1048576};})()"
 $shot=Cdp 'Page.captureScreenshot' @{format='png'}
 [IO.File]::WriteAllBytes((Join-Path ${literal(images)} 'opening-windows-playing.png'),[Convert]::FromBase64String($shot.data))
 Cdp 'Input.dispatchKeyEvent' @{type='keyDown';key='f';code='KeyF'} | Out-Null
 Cdp 'Input.dispatchKeyEvent' @{type='keyUp';key='f';code='KeyF'} | Out-Null
 Start-Sleep -Milliseconds 250
 Cdp 'Input.dispatchKeyEvent' @{type='keyDown';key='t';code='KeyT'} | Out-Null
 Cdp 'Input.dispatchKeyEvent' @{type='keyUp';key='t';code='KeyT'} | Out-Null
 Start-Sleep -Milliseconds 700
 $atlasTown=Js "({mode:document.querySelector('.atlas-book')?.dataset.atlasMode,title:document.querySelector('#atlas-title')?.textContent,nodes:document.querySelector('.atlas-map')?.querySelectorAll('*').length,time:document.querySelector('#timer').textContent,marker:document.querySelector('.atlas-pin')?.getAttribute('transform')})"
 if($atlasTown.mode -ne 'town' -or $atlasTown.title -notmatch 'Verona' -or $atlasTown.nodes -gt 1400){throw ('Native town atlas failed: '+($atlasTown|ConvertTo-Json -Compress))}
 $atlasZoom=Js ${literal("(async()=>{const start=performance.now();document.querySelector('[data-atlas-zoom=\"1\"]').click();const handlerMs=performance.now()-start;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {handlerMs,paintMs:performance.now()-start,level:document.querySelector('#atlas-zoom-level').textContent};})()")}
 $shot=Cdp 'Page.captureScreenshot' @{format='png'}
 [IO.File]::WriteAllBytes((Join-Path ${literal(images)} 'town-atlas-windows-town.png'),[Convert]::FromBase64String($shot.data))
 Js "document.querySelector('.atlas-mode-navigation [data-atlas-overview]').click()" | Out-Null
 Start-Sleep -Milliseconds 300
 $atlasRegion=Js "({mode:document.querySelector('.atlas-book')?.dataset.atlasMode,nodes:document.querySelector('.atlas-map')?.querySelectorAll('*').length,time:document.querySelector('#timer').textContent,marker:document.querySelector('.atlas-pin')?.getAttribute('transform')})"
 if($atlasRegion.mode -ne 'regional' -or $atlasRegion.nodes -gt 300 -or $atlasRegion.marker -ne $atlasTown.marker -or $atlasRegion.time -ne $atlasTown.time){throw 'Native regional atlas changed knowledge/time or retained global detail'}
 $shot=Cdp 'Page.captureScreenshot' @{format='png'}
 [IO.File]::WriteAllBytes((Join-Path ${literal(images)} 'town-atlas-windows-region.png'),[Convert]::FromBase64String($shot.data))
 Js "document.querySelector('.atlas-mode-navigation [data-atlas-sheet]').click()" | Out-Null
 $atlasBox=Js "(()=>{const b=document.querySelector('.atlas-map').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};})()"
 $dragX=[double]$atlasBox.x+[double]$atlasBox.width*.5
 $dragY=[double]$atlasBox.y+[double]$atlasBox.height*.5
 Cdp 'Input.dispatchMouseEvent' @{type='mousePressed';x=$dragX;y=$dragY;button='left';buttons=1;clickCount=1} | Out-Null
 Cdp 'Input.dispatchMouseEvent' @{type='mouseMoved';x=($dragX-80);y=$dragY;buttons=1} | Out-Null
 $escaped=Js "({mode:document.querySelector('.atlas-book').dataset.atlasMode,captured:document.querySelector('.atlas-map').hasPointerCapture(1),view:document.querySelector('.atlas-map').getAttribute('viewBox')})"
 if($escaped.mode -ne 'regional' -or -not $escaped.captured){throw 'Native town drag did not continue into the region'}
 Cdp 'Input.dispatchMouseEvent' @{type='mouseMoved';x=($dragX-200);y=$dragY;buttons=1} | Out-Null
 Cdp 'Input.dispatchMouseEvent' @{type='mouseReleased';x=($dragX-200);y=$dragY;button='left';buttons=0;clickCount=1} | Out-Null
 if((Js "document.querySelector('.atlas-map').getAttribute('viewBox')") -eq $escaped.view){throw 'Native region drag remained blocked at a town border'}
 if((Js "document.querySelector('.atlas-pin').getAttribute('transform')") -ne $atlasTown.marker){throw 'Native dragging placed an unintended estimate'}
 Cdp 'Input.dispatchKeyEvent' @{type='keyDown';key='t';code='KeyT'} | Out-Null
 Cdp 'Input.dispatchKeyEvent' @{type='keyUp';key='t';code='KeyT'} | Out-Null
 Start-Sleep -Milliseconds 400
 Cdp 'Input.dispatchKeyEvent' @{type='keyDown';key='p';code='KeyP'} | Out-Null
 Cdp 'Input.dispatchKeyEvent' @{type='keyUp';key='p';code='KeyP'} | Out-Null
 Start-Sleep -Milliseconds 500
 for($restAttempt=0;$restAttempt -lt 2;$restAttempt++){
  $rested=Js "(()=>{const b=[...document.querySelectorAll('.presentation-settings button')].find(b=>b.textContent==='Rest for 8 hours');if(!b||b.disabled)return false;b.click();return true;})()"
  if(-not $rested){throw 'Native rest action was unavailable at a settled free-driving stop'}
  Start-Sleep -Milliseconds 2000
 }
 Js "[...document.querySelectorAll('#overlay button')].find(b=>b.textContent.includes('Back to the road')).click()" | Out-Null
 Start-Sleep -Milliseconds 700
 $night=Js "({time:document.querySelector('#timer').textContent,money:document.querySelector('#earnings').textContent,save:localStorage.getItem('cerea-save-veronese')})"
 if($night.time -notmatch '^23:' -or $night.money -notmatch '0.00' -or $night.save -ne 'Windows isolation sentinel'){throw 'Native rest changed progression or failed to reach night'}
 $shot=Cdp 'Page.captureScreenshot' @{format='png'}
 [IO.File]::WriteAllBytes((Join-Path ${literal(images)} 'living-windows-night.png'),[Convert]::FromBase64String($shot.data))
 Cdp 'Input.dispatchKeyEvent' @{type='keyDown';key='p';code='KeyP'} | Out-Null
 Cdp 'Input.dispatchKeyEvent' @{type='keyUp';key='p';code='KeyP'} | Out-Null
 Start-Sleep -Milliseconds 300
 Js "[...document.querySelectorAll('.presentation-settings button')].find(b=>b.textContent==='Save game').click()" | Out-Null
 $views=Js ${literal(`(()=>{const poses=${JSON.stringify(destinationViews)};window.destinationViews=poses;return poses.length;})()`)}
 for($viewIndex=0;$viewIndex -lt $views;$viewIndex++){
  Js ('(()=>{const pose=window.destinationViews['+$viewIndex+'],s=JSON.parse(localStorage.getItem("cerea-save-veronese"));Object.assign(s.car,pose.car);s.mission.totalElapsed=600;s.mission.elapsed=0;localStorage.setItem("cerea-save-veronese",JSON.stringify(s));[...document.querySelectorAll(".presentation-settings button")].find(b=>b.textContent==="Continue saved game").click();const picture=document.querySelector("[data-key=resolution]");picture.value="high";picture.dispatchEvent(new Event("change",{bubbles:true}));})()') | Out-Null
  Start-Sleep -Milliseconds 300
  if(-not (Js "[...document.querySelectorAll('.save-status')].some(e=>e.textContent.startsWith('Loaded'))")){throw 'Native destination-view fixture did not load through the normal save path'}
  Js "document.querySelector('#overlay button').click()" | Out-Null
  for($attempt=0;$attempt -lt 80;$attempt++){if(Js "document.querySelector('#stream-status').hidden && /STOP/.test(document.querySelector('#stop-state').textContent)"){break};Start-Sleep -Milliseconds 250}
  $poseName=Js ('window.destinationViews['+$viewIndex+'].name')
  $shot=Cdp 'Page.captureScreenshot' @{format='png'}
  [IO.File]::WriteAllBytes((Join-Path ${literal(images)} ('destination-windows-'+$poseName+'.png')),[Convert]::FromBase64String($shot.data))
  Cdp 'Input.dispatchKeyEvent' @{type='keyDown';key='p';code='KeyP'} | Out-Null
  Cdp 'Input.dispatchKeyEvent' @{type='keyUp';key='p';code='KeyP'} | Out-Null
  Start-Sleep -Milliseconds 300
 }
 Write-Output ($atlasTown|ConvertTo-Json -Compress)
 Write-Output ($atlasZoom|ConvertTo-Json -Compress)
 Write-Output ($atlasRegion|ConvertTo-Json -Compress)
 Write-Output ($night|ConvertTo-Json -Compress)
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
