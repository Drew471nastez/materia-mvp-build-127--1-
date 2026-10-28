/** Measure the shipped switch preparation in Chromium. An optional BEFORE
 * file contains an earlier CANVAS_SWITCH script for a same-page comparison.
 * node scripts/check-canvas-switch-work.mjs [before-script.js] */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
const built=await build({stdin:{contents:"export {CANVAS_SWITCH} from './lib/storelib-theme/compat/canvas-bridge'",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'})
const {CANVAS_SWITCH}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM||await chromium.executablePath(),args:chromium.args,headless:true})
try {
 const reports=[]
 const cases=process.argv[2]?[['before',readFileSync(process.argv[2],'utf8')],['after',CANVAS_SWITCH]]:[['after',CANVAS_SWITCH]]
 for(const [label,script] of cases){
  const page=await browser.newPage();await page.setViewport({width:1280,height:800})
  await page.setContent('<style>body{margin:0}.shopify-section>div{height:320px;display:grid;grid-template-columns:repeat(8,1fr)}</style>'+Array.from({length:100},(_,i)=>`<section class="shopify-section"><div>${Array.from({length:32},()=>`<span>Section ${i}</span>`).join('')}</div></section>`).join(''))
  await page.addScriptTag({content:script})
  const cdp=await page.createCDPSession();await cdp.send('Performance.enable')
  const metric=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]))
  const height=await page.evaluate(()=>document.documentElement.scrollHeight)
  const before=await metric()
  const work=await page.evaluate(()=>{const t=performance.now();window.__slSwitch(true);return performance.now()-t})
  const after=await metric()
  const state=await page.evaluate(()=>({height:document.documentElement.scrollHeight,held:[...document.querySelectorAll('.shopify-section')].filter(s=>s.style.contentVisibility==='hidden').length,visibleHeld:[...document.querySelectorAll('.shopify-section')].filter(s=>s.style.contentVisibility==='hidden'&&s.getBoundingClientRect().top<innerHeight).length}))
  assert(state.held>80,'long page was not held');assert.equal(state.visibleHeld,0);assert.equal(state.height,height)
  await page.evaluate(()=>window.__slSwitch(false))
  await page.waitForFunction(()=>![...document.querySelectorAll('.shopify-section')].some(s=>s.style.contentVisibility==='hidden'),{timeout:5000})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),height)
  const report={label,layouts:after.LayoutCount-before.LayoutCount,workMs:Math.round(work*10)/10,held:state.held};reports.push(report);console.log(JSON.stringify(report))
  await page.close()
 }
 const after=reports.at(-1);assert(after.layouts<=8,`switch preparation forced ${after.layouts} layouts`)
 if(reports.length===2)assert(after.layouts<reports[0].layouts/4,'layout batching did not materially reduce forced layouts')
 const native=await build({stdin:{contents:"import {holdOffscreenSections,releaseHeldSections} from './lib/website-builder/canvas-switch'; window.nativeSwitch={holdOffscreenSections,releaseHeldSections}",resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife'})
 const page=await browser.newPage()
 await page.setContent('<div id="card"><div id="wb-preview-root" style="height:800px;overflow:auto">'+Array.from({length:100},()=>'<div data-section-box><div style="height:320px">Section</div></div>').join('')+'</div></div>')
 await page.addScriptTag({content:native.outputFiles[0].text})
 const nativeResult=await page.evaluate(async()=>{
  const root=document.getElementById('wb-preview-root'),read=root.getBoundingClientRect.bind(root);let reads=0;
  root.getBoundingClientRect=()=>{reads++;return read()};
  const height=root.scrollHeight;
  window.nativeSwitch.holdOffscreenSections(document.getElementById('card'));
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const during={reads,held:root.querySelectorAll('[data-wb-held]').length,height:root.scrollHeight};
  window.nativeSwitch.releaseHeldSections(100);
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return {...during,before:height,remaining:root.querySelectorAll('[data-wb-held]').length};
 })
 assert(nativeResult.held>80);assert(nativeResult.reads<=4,`native canvas remeasured its viewport ${nativeResult.reads} times`);assert.equal(nativeResult.height,nativeResult.before);assert.equal(nativeResult.remaining,0)
 console.log('Native canvas:',JSON.stringify(nativeResult))
 await page.close()
 console.log('Passed: switch preparation batches layouts, keeps the visible sections and page height, and releases every held section.')
}finally{await browser.close()}
