import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
// Needs `npm run build`. Starts the built app through the scotty launcher with
// PORT set (a default, not an explicit --port), so the reuse path is exercised.
// The headless shell skips install checks and always reports none, so this uses
// full Chromium (`npx playwright install chromium`) or SCOTTY_TEST_CHANNEL=chrome.
const port=Number(process.env.SCOTTY_TEST_PORT||3198);
const base=`http://localhost:${port}`;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'scotty-pwa-'));
const env={...process.env,PORT:String(port),BEADS_DEMO:'1',POSTHOG_KEY:'',XDG_CONFIG_HOME:tmp};
const launch=(extraEnv={},args=[])=>{
 const child=spawn(process.execPath,['bin/bead-me-up-scotty.mjs','--no-open',...args],{env:{...env,...extraEnv},cwd:process.cwd()});
 child.output='';
 child.stdout.on('data',d=>child.output+=d);
 child.stderr.on('data',d=>child.output+=d);
 return child;
};
const waitFor=(child,re)=>new Promise((resolve,reject)=>{
 const t=setInterval(()=>{
  if(re.test(child.output)){clearInterval(t);resolve();}
  else if(child.exitCode!==null){clearInterval(t);reject(new Error(`launcher exited: ${child.output}`));}
 },100);
});
// Launch once more and expect it to open the Scotty already on `p`, not start one.
const reuses=async(p,extraEnv,args,why)=>{
 const child=launch(extraEnv,args);
 await new Promise(r=>child.once('exit',r));
 assert.equal(child.exitCode,0,child.output);
 assert.match(child.output,new RegExp(`localhost:${p}/[\\s\\S]*already running`),why);
 return child.output;
};
const stop=child=>child.exitCode===null&&new Promise(r=>{child.once('exit',r);child.kill('SIGTERM');});
const server=launch();
let browser;
try {
 await waitFor(server,/Ctrl\+C to stop/);

 const manifest=await (await fetch(`${base}/manifest.webmanifest`)).json();
 assert.equal(manifest.name,'Bead Me Up, Scotty');
 assert.equal(manifest.display,'standalone');
 for (const icon of manifest.icons) {
  const res=await fetch(new URL(icon.src,base));
  assert.equal(res.status,200,`${icon.src} must be served`);
  assert.equal(res.headers.get('content-type'),'image/png');
 }

 // A persistent profile: Chrome refuses to install from incognito-like contexts.
 browser=await chromium.launchPersistentContext(path.join(tmp,'profile'),{channel:process.env.SCOTTY_TEST_CHANNEL||'chromium'});
 const page=await browser.newPage();
 const cdp=await browser.newCDPSession(page);
 const installErrors=async url=>{await page.goto(url);return (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.map(e=>e.errorId);};
 assert.notDeepEqual(await installErrors(`${base}/icon-192.png`),[],'a page without a manifest must not be installable');
 assert.deepEqual(await installErrors(base),[],'Chromium must report the app as installable');
 assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),'/manifest.webmanifest');

 await reuses(port,{},[],'second launch must reuse the first');
 await reuses(port,{},['--port',String(port)],'an explicit --port must reuse a Scotty already there');

 const blocker=net.createServer().listen(port+1,'0.0.0.0');
 await new Promise(r=>blocker.once('listening',r));
 const moved=launch({PORT:String(port+1)});
 try {
  await waitFor(moved,/Ctrl\+C to stop/);
  assert.match(moved.output,new RegExp(`Port ${port+1} is used by another program, so using ${port+2}`));
  const again=await reuses(port+2,{PORT:String(port+1)},[],'a later launch must reuse the moved instance');
  assert.match(again,/won't find this instance/);
 } finally { await stop(moved); blocker.close(); }

 console.log('PASS: manifest and icons served, Chromium reports no installability errors, launcher reuses a running Scotty (default, explicit and moved ports) and warns when another program holds the port');
} finally {
 await browser?.close();
 await stop(server);
 fs.rmSync(tmp,{recursive:true,force:true});
}
