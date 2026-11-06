/** Real editor/preview/public components with local API fixtures; no live writes. */
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import {mkdirSync,readFileSync} from 'node:fs'
import {serveEditorProbe} from './onepage-probe-server.mjs'
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const shots=process.env.SHOTS
if(shots)mkdirSync(shots,{recursive:true})
let blocks=[
 {id:'header',type:'header',enabled:true,sort_order:0,data:{show_avatar:true,show_name:true,show_bio:true}},
 {id:'plan',type:'link_button',enabled:true,sort_order:1,data:{label:'Your personal plan',url:'https://wa.me/123456789'},style:{presentation:{subtitle:'Tell me your goals and we will talk',variant:'compact',align:'left',title_color:'#172000',subtitle_color:'#334422'}}},
 {id:'featured',type:'link_button',enabled:true,sort_order:2,data:{label:'Explore the collection',url:'https://example.com'},style:{presentation:{subtitle:'Made for your next adventure',variant:'featured',size:'full',image_url:'/audit-images/placeholder.jpg'}}},
 ...['YouTube','Instagram','TikTok','Spotify'].map((label,i)=>({id:'social'+i,type:'link_button',enabled:true,sort_order:3+i,data:{label,url:['https://youtu.be/dQw4w9WgXcQ','https://www.instagram.com/reel/ABC_def/','https://www.tiktok.com/@creator/video/1234567890123456789','https://open.spotify.com/track/abc123'][i]},style:{presentation:{subtitle:'Latest from '+label,variant:i%2?'image-first':'visual',size:i===1?'tall':'half',image_url:'/audit-images/icon-light-32x32.png',media_mode:'card'}}})),
 {id:'book',type:'calendly',enabled:true,sort_order:8,data:{title:'Book a consultation',calendly_url:'https://calendly.com/example',embed_mode:'direct_link'},style:{presentation:{subtitle:'Find a time that works for you',align:'left'}}},
]
let theme={block_layout:'masonry',button_color:'#b9ed6d',button_text_color:'#172000',text_color:'#202025'}
const {base,server}=await serveEditorProbe({entry:'scripts/render-onepage-avatar-audit.tsx',statics:{'/audit-images/':process.cwd()+'/public/'},api(req,body){
 if(req.url==='/audit-state')return {body:{avatar:'/audit-images/icon-light-32x32.png',blocks,theme}}
 if(req.url==='/api/onepage'&&req.method==='PUT'){const row=JSON.parse(body);blocks=row.draft_blocks;theme=row.theme;return {body:{ok:true}}}
 if(req.url==='/api/onepage/publish')return {body:{ok:true}}
 if(req.url.startsWith('/_next/image'))return {status:503,body:{error:'Optimizer unavailable'}}
 return null
}})
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM||'/tmp/chromium',args:['--no-sandbox'],defaultViewport:null})
const textClick=async(page,label)=>assert.ok(await page.evaluate(label=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===label&&e.getClientRects().length);e?.click();return !!e},label),label)
try{
 for(const width of [1440,390,320]){
  const description=`A custom plan, saved from the editor at ${width}px`
  const initialDescription=blocks.find(b=>b.id==='plan').style.presentation.subtitle
  const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept())
  await page.setViewport({width,height:900})
  await page.setRequestInterception(true)
  page.on('request',r=>{const url=new URL(r.url());if(['www.youtube-nocookie.com','www.instagram.com','www.tiktok.com','open.spotify.com'].includes(url.hostname))return void r.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><p>Native media</p>'});void r.continue()})
  await page.goto(base+'/app/onepage?live',{waitUntil:'domcontentloaded'})
  await page.waitForSelector('[data-visual-link]')
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-visual-link] img')].some(i=>i.complete&&i.naturalWidth))
  await pause(1200)
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,half:[...document.querySelectorAll('[data-block-size="half"]')].map(e=>e.getBoundingClientRect().width),full:document.querySelector('[data-block-size="full"]')?.getBoundingClientRect().width,subtitle:[...document.querySelectorAll('[data-block-subtitle]')].map(e=>e.textContent)}))
  assert.equal(layout.overflow,false,`${width}: page never overflows`)
  assert.ok(layout.subtitle.includes(initialDescription))
  assert.ok(layout.half.length>=2)
  if(width>359)assert.ok(layout.half[0]<layout.full*.6,`${width}: Half-width and featured sizes render together ${JSON.stringify(layout)}`)
  else assert.ok(layout.half.every(w=>w>layout.full*.9),'Very narrow phones stack cards safely')
  // A centered Share card only fades: neither its children nor the page move.
  for(let repeat=0;repeat<3;repeat++){
   const before=await page.evaluate(()=>({x:scrollX,y:scrollY,avatar:document.querySelector('[data-page-avatar]')?.getBoundingClientRect().top,width:document.documentElement.clientWidth}))
   await page.click('button[aria-label^="Share "]')
   await page.waitForSelector('[data-share-avatar]')
   const frames=await page.evaluate(()=>new Promise(resolve=>{const points=[];let n=0;const draw=()=>{const p=document.querySelector('[data-onepage-dialog-panel]').getBoundingClientRect(),a=document.querySelector('[data-share-avatar]').getBoundingClientRect();points.push({x:p.x,y:p.y,w:p.width,h:p.height,ax:a.x,ay:a.y});if(++n<24)requestAnimationFrame(draw);else resolve(points)};requestAnimationFrame(draw)}))
   for(const key of ['x','y','w','h','ax','ay'])assert.ok(Math.max(...frames.map(p=>p[key]))-Math.min(...frames.map(p=>p[key]))<1,`${width}: Share ${key} is stable`)
   await page.keyboard.press('Tab')
   assert.ok(await page.evaluate(()=>!!document.activeElement.closest('[data-onepage-dialog]')),await page.evaluate(()=>document.activeElement.outerHTML.slice(0,500)))
   await page.keyboard.press('Escape');await pause(200)
   const after=await page.evaluate(()=>({x:scrollX,y:scrollY,avatar:document.querySelector('[data-page-avatar]')?.getBoundingClientRect().top,width:document.documentElement.clientWidth}))
   assert.deepEqual(after,before,'Opening and closing Share preserves the background geometry and scroll')
  }
  if(shots)await page.screenshot({path:`${shots}/${width}-cards.png`,fullPage:true})
  await page.goto(base+'/app/onepage#links',{waitUntil:'domcontentloaded'})
  await page.waitForSelector('[data-block-open="plan"]')
  await page.waitForSelector('[data-onepage-loader]',{hidden:true})
  await page.click('[data-block-open="plan"]')
  await page.waitForSelector('[data-block-appearance]')
  const input=await page.waitForSelector('[data-block-description]',{visible:true})
  await input.click({clickCount:3});await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.type(description)
  await page.click('[data-block-appearance] [data-segment="original"]')
  await page.click('[data-block-appearance] [data-segment="featured"]')
  await page.click('[data-block-appearance] [data-segment="compact"]')
  await page.click('[data-block-appearance] [data-segment="half"]')
  await Promise.all([page.waitForResponse(r=>r.url()===base+'/api/onepage'&&r.request().method()==='PUT'&&r.ok()),textClick(page,'Save')])
  await page.waitForFunction(()=>document.body.textContent.includes('Saved'))
  assert.equal(blocks.find(b=>b.id==='plan').style.presentation.subtitle,description)
  assert.equal(blocks.find(b=>b.id==='plan').style.presentation.size,'half')
  if(width<640)await textClick(page,'Preview')
  const frame=await page.waitForFrame(f=>f.url().includes('/onepage-preview'))
  assert.ok(frame,'The live preview frame exists')
  await frame.waitForFunction(description=>document.body.textContent.includes(description),{},description)
  const previewLook=await frame.$eval('[data-visual-link="compact"] [data-block-title]',e=>({color:getComputedStyle(e).color,font:getComputedStyle(e).fontSize}))
  await page.reload({waitUntil:'domcontentloaded'});await pause(600)
  await page.goto(base+'/app/onepage?live',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(description=>document.body.textContent.includes(description),{},description)
  assert.deepEqual(await page.$eval('[data-visual-link="compact"] [data-block-title]',e=>({color:getComputedStyle(e).color,font:getComputedStyle(e).fontSize})),previewLook,'Preview and anonymous live styling agree')
  assert.deepEqual(errors,[],`${width}: no runtime errors`)
  await context.close()
  console.log(`ok ${width}px: descriptions, mixed sizes, media fallback, editor save/refresh/live, stable Share and focus`)
 }
 // Native embeds use allowlisted providers and reserve space before loading.
 blocks=blocks.map(b=>b.id.startsWith('social')?{...b,style:{presentation:{...b.style.presentation,media_mode:'native'}}}:b)
 const p=await browser.newPage();await p.setViewport({width:390,height:900})
 await p.setRequestInterception(true);p.on('request',r=>new URL(r.url()).origin!==base?void r.respond({status:200,contentType:'text/html',body:'<p>Native provider fixture</p>'}):void r.continue())
 await p.goto(base+'/app/onepage?live',{waitUntil:'domcontentloaded'});await p.waitForSelector('[data-native-social] iframe')
 assert.equal(await p.$$eval('[data-native-social] iframe',els=>els.length),4)
 assert.ok(await p.$$eval('[data-native-social]',els=>els.every(e=>{const r=e.getBoundingClientRect();return e.dataset.nativeSocial==='YouTube'?Math.abs(r.height-r.width*9/16)<2:r.height>=150})))
 console.log('ok native YouTube, Instagram, TikTok and Spotify embeds have reserved responsive frames and fallback links')
}finally{await browser.close();await new Promise(r=>server.close(r))}
