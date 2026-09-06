// Isolated fixtures only: this test never reads or mutates a real project database.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(name){
 const exports={};
 const code=ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:id=>id==='./schema'?load('schema'):require(id)});
 return exports;
}
const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, 'Set SCOTTY_TEST_URL to an isolated demo server');
const dep=(target,type='parent-child')=>({depends_on_id:target,type});
const bead=(id,extra={})=>({id,title:id,status:'open',issue_type:'task',priority:2,created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z',labels:[],dependencies:[],...extra});
const beads=[
 bead('epic',{issue_type:'epic'}),
 bead('child',{dependencies:[dep('epic'),dep('grandchild')]}),
 bead('nested',{issue_type:'epic',dependencies:[dep('child')]}),
 bead('grandchild',{dependencies:[dep('nested'),dep('outside','blocks')]}),
 ...Array.from({length:7},(_,i)=>bead(`sub-${i}`,{dependencies:[dep('child')]})),
 bead('long-title',{title:'A long descriptive task title with enough detail to wrap across many lines while retaining every word and remaining readable without overlapping the following task card. '.repeat(3),dependencies:[dep('child')]}),
 bead('outside'),bead('external-dependent',{dependencies:[dep('child','waits-for')]}),
 bead('external-related',{dependencies:[dep('grandchild','related')]}),
 bead('solo'),bead('archived',{labels:['archived'],dependencies:[dep('epic')]}),
 bead('closed-epic',{issue_type:'epic',status:'closed'}),
 bead('closed-child',{status:'closed',dependencies:[dep('closed-epic')]}),
];
const {graphDependencyLayers,buildEpicGraphScope}=load('graph-epic');
const deep=Array.from({length:2500},(_,i)=>bead(`chain-${i}`,{dependencies:i?[dep(`chain-${i-1}`,'blocks')]:[]}));
assert.equal(graphDependencyLayers(deep).get('chain-2499'),2499,'deep dependency chains avoid call-stack limits');
const cycle=[bead('a',{dependencies:[dep('b','blocks')]}),bead('b',{dependencies:[dep('a','blocks')]}),bead('c',{dependencies:[dep('a','blocks')]})];
const layers=graphDependencyLayers(cycle);
assert.equal(layers.get('a'),layers.get('b'),'cyclic dependencies share a layer');
assert.ok(layers.get('c')>layers.get('a'),'work downstream of a cycle retains a later layer');
assert.deepEqual([...graphDependencyLayers([...cycle].reverse())],[...layers],'layers do not depend on input order');
assert.ok(buildEpicGraphScope(beads.filter(b=>b.id!=='archived'),'epic').insideIds.has('sub-6'));
const writes=[];const errors=[];
const browser=await chromium.launch();let page;
try {
 const context=await browser.newContext({viewport:{width:1700,height:1200}});
 page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/p/demo/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path.endsWith('/beads/stream'))return route.abort();
  if(path.endsWith('/deps')&&req.method()==='POST'){
   const id=path.split('/').at(-2),body=req.postDataJSON();writes.push({id,...body});
   const b=beads.find(b=>b.id===id);b.dependencies.push(dep(body.depends_on_id,body.type));
   return route.fulfill({json:b});
  }
  if(path.endsWith('/beads'))return route.fulfill({json:{beads,meta:{kind:'demo',humanActor:'reviewer',humanAllowlist:['reviewer'],pollIntervalMs:300000}}});
  return route.fulfill({json:beads.find(b=>path.endsWith(`/beads/${b.id}`))??{}});
 });
 const node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);
 const ids=()=>page.locator('.react-flow__node').evaluateAll(ns=>ns.map(n=>n.dataset.id).sort());
 const scope=()=>page.getByLabel('Graph scope',{exact:true});
 const close=async()=>{await page.getByTitle('Close',{exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});};
 const graph=async()=>{await page.goto(`${base}/p/demo`);await page.getByRole('button',{name:'Graph',exact:true}).click();await node('solo').waitFor();};
 await graph();
 assert.equal(await scope().inputValue(),'','whole graph is the default');
 assert.deepEqual(await ids(),beads.filter(b=>b.id!=='archived').map(b=>b.id).sort());
 await scope().selectOption('epic');
 await node('solo').waitFor({state:'detached'});
 const expected=beads.filter(b=>!['solo','archived','closed-epic','closed-child'].includes(b.id)).map(b=>b.id).sort();
 assert.deepEqual(await ids(),expected,'scope retains root, all nested descendants and external relationships exactly once');
 for(const id of ['outside','external-dependent','external-related'])await node(id).getByText('Outside epic',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Center',exact:true}).click();await page.waitForTimeout(500);
 const rectangles=await page.locator('.react-flow__node').evaluateAll(ns=>ns.map(n=>({id:n.dataset.id,...n.getBoundingClientRect().toJSON()})));
 for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){
  const a=rectangles[i],b=rectangles[j];
  assert.ok(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1,`nodes must not overlap: ${a.id} / ${b.id}`);
 }
 const displayed=new Set(expected);
 const edgeIds=await page.locator('.react-flow__edge').evaluateAll(es=>es.map(e=>e.dataset.id).sort());
 const expectedEdges=beads.filter(b=>displayed.has(b.id)).flatMap(b=>b.dependencies.filter(d=>displayed.has(d.depends_on_id)).map(d=>`${b.id}->${d.depends_on_id}:${d.type}`)).sort();
 assert.deepEqual(edgeIds,expectedEdges,'all in-scope and boundary dependency edges are retained with canonical IDs');
 assert.equal(await page.locator('.react-flow__edge[data-id="nested->child:parent-child"]').evaluate(n=>n.classList.contains('animated')),false,'hierarchy edges are not styled as active blockers');
 const boxes=Object.fromEntries(rectangles.map(r=>[r.id,r]));
 assert.ok(boxes.outside.x<boxes.grandchild.x,'prerequisite appears left of dependent');
 await node('sub-6').click();await page.getByRole('heading',{name:'sub-6',exact:true}).waitFor();await close();
 const spotlight=page.getByRole('checkbox',{name:'Spotlight dependencies',exact:true});
 await spotlight.check();await page.getByText(/double-click for details/).waitFor();await node('grandchild').click();
 await page.getByTitle('Clear the dependency spotlight').waitFor();
 assert.ok(Number(await node('outside').locator('[data-keyboard-bead-id]').evaluate(n=>getComputedStyle(n).opacity))>=0.99,'spotlight includes external blockers despite reversed visual edge direction');
 await spotlight.uncheck();
 assert.deepEqual(writes,[],'read-only graph browsing does not write');
 await scope().selectOption('closed-epic');await node('closed-child').waitFor();
 assert.deepEqual(await ids(),['closed-child','closed-epic']);
 const live=page.getByRole('checkbox',{name:'Live dependencies only',exact:true});
 await live.check();await node('closed-epic').waitFor();
 await live.uncheck();await node('closed-child').waitFor();
 await scope().selectOption('');await node('solo').waitFor();
 assert.equal((await ids()).length,beads.length-1,'scope exit restores the full graph');
 // Explicitly unlock only this isolated browser session for link direction checks.
 await context.request.put(`${base}/api/viewer-mode`,{data:{readOnly:false}});
 await graph();await scope().selectOption('epic');await node('solo').waitFor({state:'detached'});
 const connect=async(sourceId,targetId)=>{
  const source=node(sourceId).locator('.react-flow__handle.source'),target=node(targetId).locator('.react-flow__handle.target');
  await page.getByRole('button',{name:'Center',exact:true}).click();await page.waitForTimeout(500);
  const a=await source.boundingBox(),b=await target.boundingBox();assert.ok(a&&b);
  const response=page.waitForResponse(r=>r.url().endsWith('/deps')&&r.request().method()==='POST');
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:20});await page.mouse.up();await response;
 };
 await connect('outside','sub-4');
 assert.deepEqual(writes.at(-1),{id:'sub-4',depends_on_id:'outside',type:'blocks'},'epic mode draws prerequisite to dependent');
 await scope().selectOption('');await node('solo').waitFor();
 await connect('sub-5','solo');
 assert.deepEqual(writes.at(-1),{id:'sub-5',depends_on_id:'solo',type:'blocks'},'whole graph retains original dependent to prerequisite direction');
 await scope().selectOption('epic');await node('closed-epic').waitFor({state:'detached'});
 beads.find(b=>b.id==='epic').labels=['archived'];
 await connect('outside','sub-0');
 await node('closed-epic').waitFor();
 assert.equal(await scope().inputValue(),'','archiving the selected epic returns to All beads');
 assert.deepEqual(errors,[]);
 console.log('PASS: recursive epic scope, cycles, full edges, external context, long titles, closed scopes, spotlight, scope exit, and both link directions');
} catch(e){console.error({writes,errors,url:page?.url()});throw e;}
finally{await browser.close();}
