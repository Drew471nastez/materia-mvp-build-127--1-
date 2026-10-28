/** Real editor regression: a GitHub code push during an iframe scroll keeps
 * the visible page alive, then replaces it at the last scroll offset. */
import assert from 'node:assert/strict'
process.env.PROBE_CSS='source'
const {bundle,css}=await import('./editor-probe-harness.mjs')
const {importedTheme,openEditor,sleep}=await import('./canvas-probe-kit.mjs')
const compat=await importedTheme({store:true})
const globals=`window.PROBE_ACTIVITY={events:[],syncAt:null};window.PROBE_CONNECTIONS={agents:[],github:{repo:'owner/theme'},latest:null};`
const ed=await openEditor({kind:'imported',bundle,css,compat,globals,settle:1500})
try {
 const {page}=ed
 const frame=await ed.front()
 await page.evaluate(()=>document.querySelector('[data-compat-frame="front"]').setAttribute('data-scroll-original','yes'))
 await frame.evaluate(()=>{
   window.__scrollProbe={times:[],until:performance.now()+4000};
   const tick=t=>{
     window.__scrollProbe.times.push(t);
     window.scrollTo(0,Math.min(600,120+(t-(window.__scrollProbe.until-4000))/8));
     if(t<window.__scrollProbe.until)requestAnimationFrame(tick);
     else window.__scrollProbe.last=window.scrollY;
   };
   requestAnimationFrame(tick);
 })
 await sleep(350)
 compat.all['shopify/assets/materia.js']+='\n;window.__scrollPushVersion=1;'
 compat.all['shopify/assets/materia.css']+='\n:root{--scroll-push:1}'
 await page.evaluate(all=>{
   Object.assign(window.PROBE_COMPAT.files,all);
   window.PROBE_ACTIVITY.events=[
     {id:1,agent_name:'GitHub',path:'shopify/assets/materia.js',action:'updated'},
     {id:2,agent_name:'GitHub',path:'shopify/assets/materia.css',action:'updated'},
   ];
 },Object.fromEntries(['shopify/assets/materia.js','shopify/assets/materia.css'].map(p=>[p,compat.all[p]])))
 await sleep(1800)
 assert(await page.evaluate(()=>document.querySelector('[data-compat-frame="front"]').getAttribute('data-scroll-original')==='yes'),'front frame changed during scrolling')
 console.log('ok: the visible frame survives a code push while scrolling')
 await frame.waitForFunction(()=>typeof window.__scrollProbe.last==='number',{timeout:10000})
 const scroll=await frame.evaluate(()=>{
   const p=window.__scrollProbe;
   return {last:p.last,longest:Math.max(...p.times.slice(1).map((t,i)=>t-p.times[i]))};
 })
 await page.waitForFunction(()=>!document.querySelector('[data-compat-frame="front"]').hasAttribute('data-scroll-original'),{timeout:20000})
 await sleep(500)
 const next=await ed.front()
 const actual=await next.evaluate(()=>({y:window.scrollY,js:window.__scrollPushVersion,css:getComputedStyle(document.documentElement).getPropertyValue('--scroll-push').trim()}))
 assert.equal(actual.js,1,'new script did not arrive')
 assert.equal(actual.css,'1','new stylesheet did not arrive')
 assert(Math.abs(actual.y-scroll.last)<=3,`scroll jumped from ${scroll.last} to ${actual.y}`)
 assert(scroll.longest<120,`scroll frame exceeded 120ms: ${scroll.longest}`)
 assert.equal(await page.$$eval('[data-compat-frame]',frames=>frames.length),1,'old canvas frame retained')
 assert.deepEqual(ed.errors.filter(e=>!/ResizeObserver loop/.test(e)),[])
 await next.evaluate(()=>scrollTo(0,0))
 await sleep(1500)
 const appearance=await next.evaluate(()=>[...document.querySelectorAll('.hero__heading')].map(el=>({opacity:getComputedStyle(el).opacity,slide:el.closest('[data-slide]')?.className,animations:el.getAnimations().map(a=>({state:a.playState,time:a.currentTime,end:a.effect.getComputedTiming().endTime}))})))
 console.log('Hero after returning to the top:',JSON.stringify(appearance))
 assert(appearance.length>0 && Number(appearance[0].opacity)>0.99,'the hero did not remain visible after the push')
 console.log(`ok: push lands after scrolling; offset ${scroll.last} → ${actual.y}px, longest scroll frame ${Math.round(scroll.longest)}ms; one iframe remains`)
} finally {await ed.close()}
