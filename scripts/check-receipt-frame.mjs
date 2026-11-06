/** Checks the real header and receipt together, including anonymous purchases. */
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import {mkdirSync} from 'node:fs'
import {serveEditorProbe} from './onepage-probe-server.mjs'
const shots=process.env.SHOTS
if(shots)mkdirSync(shots,{recursive:true})
const {base,server}=await serveEditorProbe({entry:'scripts/render-receipt-frame.tsx',pathname:'/receipt/x',statics:{'/audit-images/':process.cwd()+'/public/'},api(req){
 if(req.url.startsWith('/api/platform/flags'))return{body:{communities:false,exploreMarketplace:true}}
 if(req.url.startsWith('/api/receipt'))return{body:{ok:true}}
 if(req.url.startsWith('/api/me/'))return{body:{signedIn:false,places:[],businesses:[]}}
 if(req.url.startsWith('/api/reviews/check'))return{body:{isLoggedIn:false,hasPurchased:false,hasReviewed:false}}
 return null
}})
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM||'/tmp/chromium',args:['--no-sandbox'],defaultViewport:null})
try{
 for(const width of [320,390,768,1440])for(const which of ['guest','free','paid','signedout']){
  const page=await browser.newPage(),errors=[]
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.setViewport({width,height:900})
  await page.goto(base+`/receipt/x?case=${which}`,{waitUntil:'domcontentloaded'})
  await page.waitForSelector('[data-receipt-back]')
  await new Promise(r=>setTimeout(r,900))
  const measure=()=>page.evaluate(()=>{const header=document.querySelector('#platform-header-root').getBoundingClientRect(),back=document.querySelector('[data-receipt-back]').getBoundingClientRect();return {search:document.querySelectorAll('[data-header-search-strip],[data-header-search-field]').length,overlap:header.bottom>back.top+1,overflow:document.documentElement.scrollWidth>innerWidth,backVisible:back.height>=36&&back.left>=0&&back.right<=innerWidth,sections:[...document.querySelectorAll('[data-receipt-items],[data-receipt-email],[data-receipt-account]')].map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}))}})
  const before=await measure();assert.equal(before.search,0);assert.equal(before.overlap,false);assert.equal(before.overflow,false);assert.ok(before.backVisible)
  for(let i=1;i<before.sections.length;i++)assert.ok(before.sections[i].top>=before.sections[i-1].bottom,'Receipt sections never overlap')
  await page.evaluate(()=>scrollTo(0,180));assert.equal((await measure()).search,0)
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-receipt-back]');assert.equal((await measure()).search,0)
  if(shots&&width===390&&which==='guest')await page.screenshot({path:`${shots}/receipt-guest-header.png`,fullPage:true})
  assert.deepEqual(errors,[]);await page.close()
  console.log(`ok ${width}px ${which}: dedicated receipt frame, no search, reachable Back, no overlaps, refresh`)
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}
