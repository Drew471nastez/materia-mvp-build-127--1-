/** Browser regression checks for the actual activity hook, including writer
 * discovery, burst folding, failed application, navigation and visibility. */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

const built = await build({
  stdin: { contents: `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
import {useSiteActivity} from './components/website-builder/site-connections';
function Probe() {
 const [id, setId] = useState('first'); window.switchInstall = setId;
 useSiteActivity({installId:id, onEvents: async (events, info) => {
   if (window.rejectApply) throw Error('apply failed');
   window.applied.push({id, ids:events.map(e=>e.id), catchUp:info.catchUp});
 }, onStale: async () => { window.recoveries++; if(window.rejectRecovery) throw Error('recovery failed'); }});
 return <div>{id}</div>;
}
window.probeRoot=createRoot(document.getElementById('app')); window.probeRoot.render(<Probe/>);`,
    resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', minify: true,
  define: {'process.env.NODE_ENV':'"production"'}, logLevel: 'warning',
})
const browser = await puppeteer.launch({ executablePath:process.env.CHROMIUM || await chromium.executablePath(), args:chromium.args, headless:true })
try {
 const page = await browser.newPage()
 const errors=[]; page.on('pageerror', e=>errors.push(String(e)))
 await page.setContent('<div id="app"></div>')
 await page.evaluate(() => {
   window.applied=[]; window.recoveries=0; window.calls=[]; window.rows={first:[],second:[]};
   window.fetch=async url=>{
     window.calls.push(String(url));
     const id=String(url).split('/themes/')[1].split('/')[0];
     const after=new URL(String(url),'http://fixture').searchParams.get('after');
     const rows=window.rows[id] || [];
     const events=after===null?[]:rows.filter(e=>e.id>Number(after)).slice(0,20);
     const cursor=after===null?(rows.at(-1)?.id || 0):(events.at(-1)?.id || Number(after));
     const response={ready:true, cursor, events, connections:{agents:[],github:null,latest:null}, sync_at:null};
     if(window.hold===id && after!==null) await new Promise(resolve=>window.release=resolve);
     return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});
   };
   window.addRows=(id,from,to)=>{for(let i=from;i<=to;i++)window.rows[id].push({id:i,agent_name:'Codex',path:'sections/hero.storelib',action:'updated'})};
 })
 await page.addScriptTag({content:built.outputFiles[0].text})
 await page.waitForFunction(()=>window.calls.some(c=>c.includes('?after=0')))
 await page.evaluate(()=>{ window.addRows('first',1,45); window.dispatchEvent(new KeyboardEvent('keydown',{key:'x'})); })
 await page.waitForFunction(()=>window.applied.length===1,{timeout:10000})
 let batches=await page.evaluate(()=>window.applied)
 assert.equal(batches[0].ids.length,45,'one batch for a 45-file push')
 assert.equal(batches[0].catchUp,true)
 console.log('ok: a writer connected after opening is followed; 45 events land in one batch')
 await page.evaluate(()=>{window.rejectApply=true;window.rejectRecovery=true;window.addRows('first',46,46)})
 await page.waitForFunction(()=>window.recoveries>0)
 await page.evaluate(()=>{window.rejectApply=false;window.rejectRecovery=false})
 await page.waitForFunction(()=>window.applied.some(b=>b.ids.includes(46)),{timeout:10000})
 console.log('ok: failed application and failed recovery retain the cursor for retry')
 await page.evaluate(()=>{window.hold='first';window.addRows('first',47,47)})
 await page.waitForFunction(()=>typeof window.release==='function')
 await page.evaluate(()=>window.switchInstall('second'))
 await page.waitForFunction(()=>window.calls.some(c=>c.includes('/second/agent-activity')))
 await page.evaluate(()=>{window.release();window.addRows('second',1,1)})
 await page.waitForFunction(()=>window.applied.some(b=>b.id==='second'&&b.ids.includes(1)),{timeout:10000})
 batches=await page.evaluate(()=>window.applied)
 assert(!batches.some(b=>b.id==='first'&&b.ids.includes(47)),'old install response must not be applied')
 console.log('ok: switching installs resets the cursor and ignores the old in-flight response')
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'))})
 // Allow the request already in flight to settle, then verify a hidden tab stays quiet.
 await new Promise(r=>setTimeout(r,1500))
 const before=await page.evaluate(()=>window.calls.length)
 await new Promise(r=>setTimeout(r,1500))
 assert.equal(await page.evaluate(()=>window.calls.length),before)
 await page.evaluate(()=>{window.addRows('second',2,2);Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))})
 await page.waitForFunction(()=>window.applied.some(b=>b.id==='second'&&b.ids.includes(2)),{timeout:10000})
 console.log('ok: hidden tabs pause and returning resumes without a refresh')
 await page.evaluate(()=>{
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));
   window.addRows('second',3,3);
 })
 await page.waitForFunction(()=>window.applied.some(b=>b.id==='second'&&b.ids.includes(3)),{timeout:10000})
 console.log('ok: a rapid second tab switch cannot strand the polling timer')
 assert.deepEqual(errors,[])
 await page.evaluate(()=>window.probeRoot.unmount())
 console.log('All activity channel checks passed.')
} finally { await browser.close() }
