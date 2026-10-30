/** Real imported preview components: fractional widths, filtering, delayed
 * layout changes, reopening, and replacing theme files without a page reload.
 * CHROMIUM=/path/to/chrome node scripts/check-section-preview-layout.mjs */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import puppeteer from 'puppeteer-core'

const built = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CompatPreviewProvider, CompatPreviewSheet, CompatPreviewBox} from './components/website-builder/compat/compat-section-preview';
import {patchCompatFiles} from './components/website-builder/compat/compat-files';
const presets = Array.from({length:48}, (_,i)=>({name:'Section '+i, settings:{heading:'Section '+i}}));
const schema = {type:'hero', name:'Hero', fields:[], presets};
const rows = {
 'shopify/layout/theme.liquid':'<!doctype html><html><head>{{ content_for_header }}</head><body><main id="MainContent">{{ content_for_layout }}</main></body></html>',
 'shopify/config/settings_schema.json':'[]',
 'shopify/config/settings_data.json':'{"current":{}}',
 'shopify/sections/hero.liquid':'<section style="margin:64px 0;height:360px;background:#eef2f3;padding:30px;box-sizing:border-box"><h2>{{ section.settings.heading }}</h2><span>Original theme</span><div style="position:fixed;right:-100px;bottom:-100px;width:200px;height:200px;background:#bfd8cf"></div></section>{% schema %}'+JSON.stringify({name:'Hero',settings:[{type:'text',id:'heading',default:'Hello'}],presets})+'{% endschema %}'
};
const originalFetch=window.fetch;
window.fetch=(url,init)=>String(url).includes('/files?compat=1')?Promise.resolve(new Response(JSON.stringify({files:rows}),{headers:{'Content-Type':'application/json'}})):originalFetch(url,init);
const sources={}; let revision=0;
function Probe(){
 const [filter,setFilter]=useState(false),[open,setOpen]=useState(true),[width,setWidth]=useState(693.375);
 window.filterCards=setFilter; window.openLibrary=setOpen; window.resizeLibrary=setWidth;
 window.pushTheme=()=>patchCompatFiles('layout-probe',{'shopify/sections/hero.liquid':rows['shopify/sections/hero.liquid'].replace('Original theme','Updated theme '+(++revision))});
 return <CompatPreviewProvider installId="layout-probe" sources={sources} settings={undefined} live={open}>
 <div data-library-scroll style={{height:720,overflow:'auto',width,visibility:open?'visible':'hidden'}}>
 <div data-library-grid className="grid" style={{position:'relative',display:'flex',flexDirection:'column',gap:24}}>
 <CompatPreviewSheet renderWidth={1200} open={open} layoutKey={String(filter)+width}/>
 {presets.map((p,i)=><div data-library-card="hero" data-preset={i} key={i} hidden={filter&&i%3!==0}>
 <CompatPreviewBox type="hero" presetIndex={i} schema={schema} width={width} renderWidth={1200} eager/>
 <div className="title">{p.name}</div></div>)}
 </div></div></CompatPreviewProvider>
}
createRoot(document.getElementById('app')).render(<Probe/>);
` },
  bundle: true, write: false, platform: 'browser', format: 'iife', minify: true, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
  banner: {js:'var process={env:{NODE_ENV:"production"},browser:true};'},
  plugins: [{ name: 'unused-server-crypto', setup(b) {
    b.onResolve({filter:/^node:crypto$/}, () => ({path:'crypto',namespace:'probe'}))
    b.onLoad({filter:/.*/,namespace:'probe'}, () => ({contents:'export function createHash(){throw Error("Unexpected server compiler in preview probe")}',loader:'js'}))
  }}],
})
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/probe.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8')
  res.end(req.url === '/probe.js' ? built.outputFiles[0].text : `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:24px;font-family:Arial}.title{height:24px}iframe{position:absolute;left:0;top:0;border:0;pointer-events:none}
  </style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const errors = []
  page.on('pageerror', e => {errors.push(e.message);console.error(e.message)})
  page.on('console', m => {if(m.type()==='error') console.error(m.text())})
  await page.goto(`http://127.0.0.1:${server.address().port}`, {waitUntil:'load'})
  await page.waitForFunction(() => document.querySelectorAll('[data-compat-preview-state="shown"]').length === 48).catch(async e => {
    console.log(await page.evaluate(()=>({body:document.body.innerHTML.slice(0,1000),states:[...document.querySelectorAll('[data-compat-preview-state]')].map(e=>e.dataset.compatPreviewState),html:document.querySelector('iframe')?.contentDocument?.body?.innerHTML.slice(0,1500)})))
    throw e
  })
  const audit = async label => {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
    const result = await page.evaluate(() => {
      const f = document.querySelector('iframe'), fr = f.getBoundingClientRect(), k = fr.width / f.offsetWidth
      let maxError = 0, visible = 0, hiddenPaint = 0, badMeasurements = 0
      for (const card of document.querySelectorAll('[data-library-card]')) {
        const box = card.querySelector('[data-preview-box]'), r = box.getBoundingClientRect()
        const w = f.contentDocument.querySelector('[data-sl-card="hero:'+card.dataset.preset+'"]')
        if (!w) continue
        if (card.hidden) { if (w.getBoundingClientRect().height) hiddenPaint++; continue }
        if (w.querySelector('[data-sl-pv]').offsetHeight !== 488) badMeasurements++
        const wr = w.getBoundingClientRect(); visible++
        maxError = Math.max(maxError, Math.abs(fr.top+wr.top*k-r.top), Math.abs(fr.left+wr.left*k-r.left), Math.abs(wr.height*k-r.height), Math.abs(wr.width*k-r.width))
      }
      return {visible,hiddenPaint,badMeasurements,maxError:Math.round(maxError*100)/100,frames:document.querySelectorAll('iframe').length}
    })
    console.log(label, result)
    assert.equal(result.frames, 1)
    assert.equal(result.hiddenPaint, 0)
    assert.equal(result.badMeasurements, 0, 'Section margins must be included in the preview height')
    assert.ok(result.visible > 0)
    assert.ok(result.maxError <= 0.5, `${label}: previews drifted ${result.maxError}px from their cards`)
  }
  await audit('Fractional desktop width')
  await page.evaluate(() => {document.querySelector('[data-library-scroll]').scrollTop=7300})
  await audit('Scroll deep in the list')
  await page.evaluate(() => window.filterCards(true))
  await audit('Filter cards')
  await page.evaluate(() => {document.querySelector('.title').style.height='73.375px'})
  await audit('Delayed title resize')
  await page.evaluate(() => {window.filterCards(false);window.resizeLibrary(337.625)})
  await audit('Resize to phone width')
  await page.evaluate(() => {document.querySelector('#app').style.transform='scale(.975)'})
  await audit('Scaled dialog')
  await page.evaluate(() => window.openLibrary(false))
  await page.evaluate(() => window.openLibrary(true))
  await audit('Reopen without reload')
  await page.evaluate(() => {window.originalPreviewDocument=document.querySelector('iframe').contentDocument})
  for (let revision=1;revision<=3;revision++) {
    const heights = await page.evaluate(()=>[...document.querySelectorAll('[data-preview-box]')].map(b=>b.clientHeight))
    assert.equal(await page.evaluate(() => window.pushTheme()), true)
    await page.waitForFunction(revision => {
      const doc=document.querySelector('iframe')?.contentDocument
      return doc?.querySelectorAll('[data-sl-card]').length===48 && [...doc.querySelectorAll('[data-sl-pv]')].every(w=>w.textContent.includes('Updated theme '+revision))
    },{},revision).catch(async e => {
      console.log(await page.evaluate(()=>({shown:document.querySelectorAll('[data-compat-preview-state="shown"]').length,frames:document.querySelectorAll('iframe').length,html:document.querySelector('iframe')?.contentDocument?.body?.innerHTML.slice(0,800),cards:document.querySelector('iframe')?.contentDocument?.querySelectorAll('[data-sl-card]').length})))
      throw e
    })
    assert.equal(await page.evaluate(()=>window.originalPreviewDocument===document.querySelector('iframe').contentDocument),true,'Section updates should reuse the document without leaving old cards')
    await audit('Replace theme files without reload, revision '+revision)
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('[data-preview-box]')].map(b=>b.clientHeight)),heights,'A content update of the same size must not expand cards to placeholder heights')
    await page.evaluate(() => window.filterCards(true))
    await audit('Filter after theme replacement '+revision)
    await page.evaluate(() => window.filterCards(false))
  }
  assert.deepEqual(errors, [])
  if (process.env.SHOT) await page.screenshot({path:process.env.SHOT})
} finally {
  await browser.close()
  await new Promise(r => server.close(r))
}
