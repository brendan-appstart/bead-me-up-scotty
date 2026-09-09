import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
// Real temporary Git repositories; only GitHub HTTP and the expensive build are substituted.
import { createUpdater } from '../lib/update-service.ts';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scotty-update-'));
const remote = path.join(root, 'remote'); const clone = path.join(root, 'clone');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
let latest = 'v0.2.0', offline = false, status = 200;
const http = async url => {
 if (offline) throw Error('offline');
 if (status !== 200) return new Response('', {status});
 const tag = url.endsWith('/latest') ? latest : decodeURIComponent(url.split('/').at(-1));
 return Response.json({tag_name:tag, draft:false, prerelease:false});
};
try {
 fs.mkdirSync(remote); git(remote,'init','-b','main'); git(remote,'config','user.email','test@example.invalid'); git(remote,'config','user.name','Test');
 const commit = version => { fs.writeFileSync(path.join(remote,'package.json'), JSON.stringify({name:'bead-me-up-scotty',version})); git(remote,'add','.'); git(remote,'commit','-m',version); return git(remote,'rev-parse','HEAD'); };
 const old = commit('0.1.0');
 git(root,'clone',remote,clone); git(clone,'config','user.email','test@example.invalid'); git(clone,'config','user.name','Test');
 const release = commit('0.2.0'); git(remote,'tag','-a','v0.2.0','-m','release');
 const newest = commit('0.3.0'); git(remote,'tag','v0.3.0');
 const run = async (cmd,args,opts) => { if(cmd==='git') return {stdout:git(opts.cwd,...args),stderr:''}; fs.appendFileSync(path.join(root,'builds'),cmd+' '+args.join(' ')+'\n'); return {stdout:'ok',stderr:''}; };
 const options={cwd:clone,version:'0.1.0',repository:'brendan-appstart/bead-me-up-scotty',remote,fetch:http,run};
 const updater=createUpdater(options);
 const s=await updater.check();
 assert.equal(s.channel,'stable'); assert.equal(s.updateAvailable,true); assert.equal(s.latestVersion,'0.2.0'); assert.equal(s.target.sha,release); assert.equal(s.target.tag,'v0.2.0');
 latest='v0.3.0'; // A later release after opening the dialog must not change the approved target.
 const result=await updater.update(s.target);
 assert.equal(result.toSha,release); assert.equal(git(clone,'rev-parse','HEAD'),release); assert.notEqual(result.toSha,newest);
 assert.match(fs.readFileSync(path.join(root,'builds'),'utf8'),/npm run build/);
 const nogit=path.join(root,'installed');fs.mkdirSync(nogit);
 const installed=createUpdater({...options,cwd:nogit});
 const notice=await installed.check();assert.equal(notice.updateAvailable,true);assert.equal(notice.canUpdate,false);assert.match(notice.releaseUrl,/releases\/tag\/v0.3.0$/);
 await assert.rejects(installed.update(s.target),/checkout/i);
 assert.equal((await createUpdater({...options,cwd:nogit,version:'0.3.0'}).check()).updateAvailable,false);
 assert.equal((await createUpdater({...options,cwd:nogit,version:'0.4.0'}).check()).updateAvailable,false,'never suggest a downgrade');
 assert.equal((await createUpdater({...options,cwd:nogit,version:'0.3.0-beta.1'}).check()).updateAvailable,true);
 status=404;assert.equal((await createUpdater({...options,cwd:nogit}).check()).updateAvailable,false);status=429;
 assert.match((await createUpdater({...options,cwd:nogit}).check()).error,/429/);status=200;
 offline=true;assert.match((await createUpdater({...options,cwd:nogit}).check()).error,/offline/);offline=false;
 fs.writeFileSync(path.join(clone,'local.txt'),'keep me');
 await assert.rejects(updater.update({channel:'stable',tag:'v0.3.0',sha:newest}),/uncommitted/i);
 assert.equal(fs.readFileSync(path.join(clone,'local.txt'),'utf8'),'keep me');fs.unlinkSync(path.join(clone,'local.txt'));
 git(clone,'switch','-c','feature');await assert.rejects(updater.update({channel:'stable',tag:'v0.3.0',sha:newest}),/branch/i);git(clone,'switch','main');
 await assert.rejects(updater.update({channel:'stable',tag:'v0.3.0',sha:old}),/changed|match/i);
 await assert.rejects(updater.update({channel:'stable',tag:'--upload-pack=evil',sha:newest}),/invalid/i);
 const dev=await updater.check('development');assert.equal(dev.target.sha,newest);assert.equal(dev.updateAvailable,true);
 await updater.update(dev.target);assert.equal(git(clone,'rev-parse','HEAD'),newest);
 // Locally diverged work must not be overwritten by an exact release update.
 git(clone,'reset','--hard',release);fs.writeFileSync(path.join(clone,'custom'),'local');git(clone,'add','.');git(clone,'commit','-m','local');
 const localHead=git(clone,'rev-parse','HEAD');
 await assert.rejects(updater.update({channel:'stable',tag:'v0.3.0',sha:newest}),/diverg|fast.forward/i);
 assert.equal(git(clone,'rev-parse','HEAD'),localHead);

 // A failed development build remains discoverable after the source advanced.
 git(clone,'reset','--hard',release);
 const failing=createUpdater({...options,buildSha:release,run:async(cmd,args,opts)=>{if(cmd==='npm')throw Error('build unavailable');return run(cmd,args,opts);}});
 const failureTarget=(await failing.check('development')).target;
 await assert.rejects(failing.update(failureTarget),/failed/);
 assert.equal(git(clone,'rev-parse','HEAD'),newest);
 assert.equal((await createUpdater({...options,buildSha:release}).check('development')).updateAvailable,true,'a failed build must remain retryable after reload');
 git(clone,'reset','--hard',release);
 const supervised=createUpdater({...options,supervised:true});
 await supervised.update({channel:'stable',tag:'v0.3.0',sha:newest});
 await assert.rejects(supervised.update({channel:'stable',tag:'v0.3.0',sha:newest}),/already running/,'the restart delay must not permit a second update');

 git(clone,'checkout','--detach',release);
 await createUpdater(options).update({channel:'stable',tag:'v0.3.0',sha:newest});
 assert.equal(git(clone,'rev-parse','HEAD'),newest,'detached release installs can advance safely');
 assert.equal(git(clone,'branch','--show-current'),'');
 const badRelease=createUpdater({...options,cwd:nogit,fetch:async()=>Response.json({tag_name:'v0.4.0-beta.1',draft:false,prerelease:true})});
 assert.equal((await badRelease.check()).updateAvailable,false);
 assert.match((await badRelease.check()).error,/Invalid/);
 git(remote,'tag','v0.4.0',newest);
 await assert.rejects(createUpdater(options).update({channel:'stable',tag:'v0.4.0',sha:newest}),/version do not match/);
 console.log('PASS: stable notices, installed copies, semver, no-release/offline/rate-limit, exact tag update, development channel, dirty/branch/divergence/target guards');
} finally {fs.rmSync(root,{recursive:true,force:true});}
