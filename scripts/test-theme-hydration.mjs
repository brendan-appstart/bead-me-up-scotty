import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.SCOTTY_TEST_URL;
assert.ok(base,'Set SCOTTY_TEST_URL to an isolated development server');
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 const errors=[];
 page.on('console',msg=>{if(msg.type()==='error') errors.push(msg.text());});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  if(!localStorage.getItem('theme-test-seeded')) {
   localStorage.setItem('bmus.theme.demo','dark');
   localStorage.setItem('theme-test-seeded','true');
  }
 });
 await page.goto(`${base}/p/demo?view=epics`);
 await page.getByTitle('Toggle theme',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await page.reload();
 await page.getByTitle('Toggle theme',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 assert.deepEqual(errors,[], 'saved dark theme must hydrate without console errors');
 await page.getByTitle('Toggle theme',{exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 await page.reload();
 await page.getByTitle('Toggle theme',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 assert.equal(await page.evaluate(()=>localStorage.getItem('bmus.theme.demo')),'light');
 assert.deepEqual(errors,[]);
 console.log('PASS: saved dark theme hydration, reload, toggle, and persistence');
} finally { await browser.close(); }
