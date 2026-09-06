// Review-link discovery and Needs You rendering against isolated fixtures.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {chromium} from 'playwright';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/review-links.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL});
const {reviewLinks}=exports;
const input={description:'[Review](https://example.com/review_(draft)) ![screenshot](attachment://decision/screen.png)',notes:'https://example.com/review_(draft) /api/p/demo/attachments/decision/local.png',design:'https://example.org/design.',comments:[{text:'https://example.net/comment javascript:alert(1) file:///private/secret'}]};
assert.deepEqual([...reviewLinks(input)],['https://example.com/review_(draft)','attachment://decision/screen.png','/api/p/demo/attachments/decision/local.png','https://example.org/design','https://example.net/comment']);
assert.equal(reviewLinks({description:'javascript:alert(1) data:text/html,test file:///tmp/foo attachment://../bad /api/p/demo/attachments/../../shutdown'}).length,0);
assert.equal(reviewLinks({description:'An explanation can be reviewed without any links.'}).length,0);
const base=process.env.SCOTTY_TEST_URL;assert.ok(base,'Set SCOTTY_TEST_URL');
const bead=(id,extra={})=>({id,title:id,issue_type:'task',status:'open',priority:2,labels:[],dependencies:[],created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z',...extra});
const beads=[bead('decision',{labels:['human'],...input}),bead('gate',{issue_type:'gate',await_type:'human',description:'Please review the explanation in this bead.'})];
const browser=await chromium.launch();
try{
 const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/p/demo/**',route=>{
  const path=new URL(route.request().url()).pathname;
  assert.equal(route.request().method(),'GET','review-link browsing never writes');
  if(path.endsWith('/beads/stream'))return route.abort();
  return route.fulfill({json:path.endsWith('/beads')?{beads,meta:{kind:'demo',humanActor:'reviewer',humanAllowlist:['reviewer'],pollIntervalMs:300000}}:{}});
 });
 const open=async()=>{await page.goto(`${base}/p/demo`);await page.getByRole('button',{name:'Needs You',exact:true}).click();await page.getByText('Links & attachments',{exact:true}).waitFor();};
 await open();
 const card=page.locator('[data-keyboard-bead-id="decision"]');
 const links=await card.locator('a').evaluateAll(as=>as.map(a=>({href:a.getAttribute('href'),target:a.target,rel:a.rel})));
 assert.equal(links.length,5);
 assert.ok(links.some(a=>a.href==='/api/p/demo/attachments/decision/screen.png'),'attachment refs resolve to the current project');
 assert.ok(links.some(a=>a.href==='/api/p/demo/attachments/decision/local.png'),'local API attachment links are surfaced');
 assert.ok(links.every(a=>a.target==='_blank'&&a.rel.includes('noopener')));
 await page.getByText('No supporting links found. Review the bead details before deciding.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).isDisabled(),true,'read-only approval guard remains');
 await context.request.put(`${base}/api/viewer-mode`,{data:{readOnly:false}});await open();
 assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).isEnabled(),true,'absence of links does not become an approval gate');
 assert.deepEqual(errors,[]);
 console.log('PASS: supporting link discovery, Markdown delimiters, local attachments, safe schemes, read-only access and non-gating empty state');
}finally{await browser.close();}
