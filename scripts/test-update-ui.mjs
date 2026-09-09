import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.SCOTTY_TEST_URL;
assert.ok(base, 'Set SCOTTY_TEST_URL to an isolated demo server');
assert.equal((await (await fetch(base+'/api/telemetry')).json()).configured,false);
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let manual=true;const requests=[];let checks=0;
 const sha='1234567890abcdef1234567890abcdef12345678';
 await page.route('**/api/update/check*',route=>{
  checks++;const channel=new URL(route.request().url()).searchParams.get('channel')||'stable';
  return route.fulfill({json:{channel,currentVersion:'0.1.0',latestVersion:'0.2.0',releaseUrl:'https://github.com/brendan-appstart/bead-me-up-scotty/releases/tag/v0.2.0',updateAvailable:true,canUpdate:!manual,manualReason:manual?'This installation needs a manual update. Follow the release instructions.':undefined,isGitRepo:!manual,supervised:false,behind:3,localSha:'abc1234',remoteSha:sha,target:manual?undefined:{channel,sha,tag:channel==='stable'?'v0.2.0':undefined}}});
 });
 await page.route('**/api/update/run',route=>{requests.push(route.request().postDataJSON());return route.fulfill({json:{ok:true,steps:[{name:'Build app',ok:true,output:''}],restarting:false,fromSha:'abc1234',toSha:sha}});});
 await page.goto(base+'/p/demo');
 const badge=page.getByRole('button',{name:'Version 0.2.0 available',exact:true});
 await badge.waitFor({timeout:5000});await badge.click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 assert.equal(await dialog.getByRole('button',{name:'Update now',exact:true}).count(),0);
 assert.match(await dialog.innerText(),/manual update/);
 assert.match(await dialog.getByRole('link',{name:'Release notes and update instructions'}).getAttribute('href'),/v0.2.0$/);
 await dialog.getByRole('button',{name:'Not now',exact:true}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 const channel=page.getByRole('combobox',{name:'Update channel'});assert.equal(await channel.inputValue(),'stable');
 await channel.selectOption('development');
 await page.getByRole('button',{name:/Development update available/}).waitFor();
 await channel.selectOption('stable');await badge.waitFor();
 const toggle=page.getByRole('switch',{name:'Check for new versions'});await toggle.click();
 await badge.waitFor({state:'hidden'});const before=checks;
 await page.reload();await page.getByRole('combobox',{name:'Update channel'}).waitFor();assert.equal(checks,before,'disabled checks remain disabled across reloads');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await toggle.click();await badge.waitFor();
 manual=false;await page.reload();await badge.click();
 await dialog.getByRole('button',{name:'Update now',exact:true}).click();
 await dialog.getByText(/Restart the server/).waitFor();
 assert.deepEqual(requests,[{channel:'stable',sha,tag:'v0.2.0'}],'update POST pins the displayed target');
 assert.deepEqual(errors,[]);
 console.log('PASS: release notice for installed copies, manual instructions, channel changes, immediate persistent opt-out, exact target POST and restart guidance');
}finally{await browser.close();}
