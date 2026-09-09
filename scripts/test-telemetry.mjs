import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createTelemetry } from '../lib/telemetry.ts';
const dir = mkdtempSync(join(tmpdir(), 'scotty-telemetry-'));
const file = join(dir, 'telemetry.json');
let now = new Date('2026-09-08T12:00:00Z');
const sent = [];
let offline = false;
const options = { file, key: 'test-project-token', host: 'https://us.i.posthog.com', version: '1.2.3', now: () => now,
  send: async (url, init) => { sent.push({url, body: JSON.parse(init.body)}); if (offline) throw new Error('offline'); return new Response('1'); } };
try {
 const freshEvents = [];
 const fresh = createTelemetry({...options, file:join(dir,'fresh.json'), key:undefined,
   send:async (_url,init)=>{freshEvents.push(JSON.parse(init.body)); return new Response('1');}});
 await fresh.capture();
 assert.equal(freshEvents.length,1,'a fresh installation must report without a local environment token');
 assert.match(freshEvents[0].api_key,/^phc_[A-Za-z0-9]+$/,'only a public capture token may ship');
 assert.deepEqual(fresh.settings(),{enabled:true,configured:true});
 const t = createTelemetry(options);
 assert.equal(t.settings().enabled, true);
 await Promise.all([t.capture(), t.capture(), t.capture()]);
 assert.equal(sent.length, 1, 'concurrent tabs must not duplicate daily activity');
 const id = sent[0].body.distinct_id;
 assert.match(id, /^[0-9a-f-]{36}$/);
 assert.match(sent[0].body.uuid,/^[0-9a-f-]{36}$/);
 assert.deepEqual(sent[0], {url:'https://us.i.posthog.com/i/v0/e/', body: {api_key:'test-project-token', event:'app_active', distinct_id:id, uuid:sent[0].body.uuid, timestamp:'2026-09-08T12:00:00.000Z', properties:{app_version:'1.2.3', $process_person_profile:false, $geoip_disable:true}}});
 await createTelemetry(options).capture();
 assert.equal(sent.length, 1, 'restart must preserve daily limit');
 t.setEnabled(false);
 now = new Date('2026-09-09T12:00:00Z');
 await createTelemetry(options).capture();
 assert.equal(sent.length, 1, 'opt-out must survive restart');
 t.setEnabled(true);
 await t.capture();
 assert.equal(sent.length, 2);
 assert.equal(sent[1].body.distinct_id, id);
 now = new Date('2026-09-10T12:00:00Z'); offline = true;
 await t.capture(); await t.capture();
 assert.equal(sent.length, 3, 'offline failures must not retry repeatedly');
 const noKey = createTelemetry({...options, file:join(dir,'no-key.json'), key:''});
 await noKey.capture(); assert.equal(sent.length,3);
 const invalidHost = createTelemetry({...options, file:join(dir,'invalid-host.json'), host:'http://us.i.posthog.com'});
 await invalidHost.capture(); assert.equal(sent.length,3, 'never send a token over plain HTTP');
 const blockedFile = join(dir,'not-a-directory'); writeFileSync(blockedFile,'x');
 const cannotPersist = createTelemetry({...options, file:join(blockedFile,'telemetry.json')});
 await cannotPersist.capture(); assert.equal(sent.length,3, 'storage failures must stop reporting');
 assert.throws(()=>cannotPersist.setEnabled(false), 'failed preference writes must not report success');
 writeFileSync(file,'broken');
 await t.capture(); assert.equal(sent.length,3, 'corrupt preference must fail closed');
 assert.equal(t.settings().enabled,false);
 t.setEnabled(false);
 assert.equal(JSON.parse(readFileSync(file)).enabled,false);
 const shared = join(dir,'shared.json');
 const receipts = join(dir,'receipts.jsonl');
 const worker = `import {createTelemetry} from ${JSON.stringify(new URL('../lib/telemetry.ts',import.meta.url).href)};
 import fs from 'node:fs';
 const t=createTelemetry({file:${JSON.stringify(shared)},key:'test-token',host:'https://us.i.posthog.com',version:'test',now:()=>new Date('2026-10-01T00:00:00Z'),send:async(u,i)=>{fs.appendFileSync(${JSON.stringify(receipts)},i.body+'\\n');return new Response('1');}});
 await t.capture();`;
 await Promise.all(Array.from({length:8},()=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',worker],{stdio:'ignore'});
  child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(new Error('worker failed')));
 })));
 assert.equal(readFileSync(receipts,'utf8').trim().split('\n').length,1,'independent processes must reserve one daily event');
 const crashed = join(dir,'crashed.json');
 mkdirSync(`${crashed}.days`); writeFileSync(join(`${crashed}.days`,'2026-09-10'),'');
 offline=false;
 await createTelemetry({...options,file:crashed}).capture(); assert.equal(sent.length,3);
 now=new Date('2026-09-11T12:00:00Z');
 await createTelemetry({...options,file:crashed}).capture(); assert.equal(sent.length,4,'abandoned daily claim must not block tomorrow');
 // Failed delivery must remain retryable, without counting a retry as another event.
 for (const failure of ['offline','http','quota','invalid']) {
  let clock = new Date('2026-11-01T12:00:00Z');
  let healthy = false;
  const attempts = [];
  const retryOptions = {...options,file:join(dir,`${failure}.json`),now:()=>clock,
   send:async (_url,init)=>{
    attempts.push(JSON.parse(init.body));
    if(healthy) return new Response('{"status":"Ok"}');
    if(failure==='offline') throw new Error('offline');
    if(failure==='http') return new Response('unavailable',{status:503});
    if(failure==='quota') return new Response('{"status":1,"quota_limited":["events"]}');
    return new Response('not an acknowledgement');
   }};
  await createTelemetry(retryOptions).capture();
  clock = new Date('2026-11-01T12:09:59Z');
  await createTelemetry(retryOptions).capture();
  assert.equal(attempts.length,1,'failed requests must have a cooldown across restarts');
  clock = new Date('2026-11-01T12:10:00Z');
  healthy=true;
  await Promise.all(Array.from({length:8},()=>createTelemetry(retryOptions).capture()));
  assert.equal(attempts.length,2,`${failure} failure must retry once after the cooldown`);
  assert.match(attempts[0].uuid,/^[0-9a-f-]{36}$/);
  assert.deepEqual(attempts[1],attempts[0],'retries must retain the entire event, including UUID and timestamp');
  clock = new Date('2026-11-01T13:00:00Z');
  await createTelemetry(retryOptions).capture();
  assert.equal(attempts.length,2,'an acknowledged event must stop retrying');
 }
 let retryClock=new Date('2026-12-01T12:00:00Z');
 let failedAttempts=0;
 const boundedOptions={...options,file:join(dir,'bounded.json'),now:()=>retryClock,
  send:async()=>{failedAttempts++;throw new Error('offline');}};
 const bounded=createTelemetry(boundedOptions);
 await bounded.capture();
 bounded.setEnabled(false);
 retryClock=new Date('2026-12-01T12:10:00Z');
 await createTelemetry(boundedOptions).capture();
 assert.equal(failedAttempts,1,'opting out must stop pending retries');
 bounded.setEnabled(true);
 for(const time of ['12:10','12:20','12:30','23:59']){
  retryClock=new Date(`2026-12-01T${time}:00Z`);
  await createTelemetry(boundedOptions).capture();
 }
 assert.equal(failedAttempts,3,'delivery must be bounded to three attempts per UTC day');
 retryClock=new Date('2026-12-02T00:00:00Z');
 await createTelemetry(boundedOptions).capture();
 assert.equal(failedAttempts,4,'a failed day must not block tomorrow');
 const retryReceipts=join(dir,'retry-receipts.jsonl');
 const retryWorker=`import {createTelemetry} from ${JSON.stringify(new URL('../lib/telemetry.ts',import.meta.url).href)};
 import fs from 'node:fs';
 await createTelemetry({file:${JSON.stringify(join(dir,'shared-retry.json'))},key:'test-token',host:'https://us.i.posthog.com',version:'test',now:()=>new Date(process.argv[1]),send:async(u,i)=>{fs.appendFileSync(${JSON.stringify(retryReceipts)},i.body+'\\n');return new Response('1',{status:Number(process.argv[2])});}}).capture();`;
 for(const [time,status] of [['12:00',503],['12:10',200],['12:20',200]]){
  await Promise.all(Array.from({length:8},()=>new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--input-type=module','-e',retryWorker,`2026-12-03T${time}:00Z`,String(status)],{stdio:'ignore'});
   child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('retry worker failed')));
  })));
 }
 const retried=readFileSync(retryReceipts,'utf8').trim().split('\n').map(s=>JSON.parse(s));
 assert.equal(retried.length,2,'independent processes must share retry cooldowns and acknowledgement');
 assert.deepEqual(retried[0],retried[1],'independent processes must retry the same event');
 console.log('PASS: fresh-install default, minimal payload, daily limit, concurrency, restart, opt-out, bounded retries, deduplication identity, empty key, corrupt preference');
} finally { rmSync(dir,{recursive:true,force:true}); }
