/** End-to-end local browser audit. No production accounts or uploads used.
 * CHROMIUM=/path/to/chrome PROBE_CSS=source node scripts/check-onepage-avatar-sync.mjs */
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import {mkdirSync,readFileSync} from 'node:fs'
import { serveEditorProbe } from './onepage-probe-server.mjs'

let avatar = '/audit-images/icon-light-32x32.png'
let refusePhoto = false
let theme = { button_hover_animation: 'fill', button_hover_fill: '#e4572e', button_hover_text: '#112233' }
const blocks = [
  { id:'h', type:'header', enabled:true, sort_order:0, data:{show_avatar:true,show_name:true,show_bio:true} },
  { id:'b1', type:'link_button', enabled:true, sort_order:1, data:{label:'Audit link',url:'https://example.com'} },
  { id:'b2', type:'link_button', enabled:true, sort_order:2, data:{label:'Highlighted link',url:'https://example.com',animation_type:'swipe'} },
]
const {base,server} = await serveEditorProbe({
  entry:'scripts/render-onepage-avatar-audit.tsx', statics:{'/audit-images/':process.cwd()+'/public/'},
  api(req, body) {
    if (req.url === '/audit-state') return {body:{avatar,theme,blocks}}
    if (req.url.startsWith('/_next/image')) return {status:503,body:{error:'Optimizer temporarily unavailable'}}
    if (req.url === '/api/account/avatar') {
      if (refusePhoto) return {status:503,body:{error:'Photo did not save'}}
      avatar = JSON.parse(body).url
      return {body:{ok:true,url:avatar}}
    }
    if (req.url === '/api/onepage' && req.method === 'PUT') {theme=JSON.parse(body).theme;return {body:{ok:true}}}
    if (req.url === '/api/onepage/publish') return {body:{ok:true}}
    return null
  },
})
const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM??'/opt/pw-browsers/chromium',defaultViewport:null,args:['--no-sandbox','--window-size=1440,900','--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4']})
const resize = async (page,width) => {
  const cdp=await page.createCDPSession()
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false})
}
const pause=ms=>new Promise(r=>setTimeout(r,ms))
if(process.env.SHOTS)mkdirSync(process.env.SHOTS,{recursive:true})
const clickText=async(page,word)=>{
  const ok=await page.evaluate(word=>{
    const button=[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().height>0 && b.textContent.trim()===word)
    if(!button)return false
    button.click();return true
  },word)
  assert.ok(ok,'Missing button '+word)
}
try {
  for (const width of [1440,390]) {
    const page=await browser.newPage()
    await resize(page,width)
    const errors=[]
    page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)})
    page.on('dialog',d=>void d.accept())
    let recovering=false, retryRequests=0, uploadPath=null
    const bytes=readFileSync('public/icon-light-32x32.png')
    await page.setRequestInterception(true)
    page.on('request',request=>{
      const url=new URL(request.url())
      const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,x-upsert,cache-control','access-control-allow-methods':'POST,GET,OPTIONS'}
      if(url.hostname==='placeholder.supabase.co'&&url.pathname.startsWith('/storage/v1/object/')){
        if(request.method()==='OPTIONS')return void request.respond({status:204,headers:cors})
        if(request.method()==='POST'){
          uploadPath=url.pathname
          return void request.respond({status:200,headers:cors,contentType:'application/json',body:JSON.stringify({Key:uploadPath})})
        }
        return void request.respond({status:200,headers:cors,contentType:'image/png',body:bytes})
      }
      if(url.hostname==='storelib.com'&&url.pathname.startsWith('/media/avatars/probe-user/'))return void request.respond({status:200,headers:cors,contentType:'image/png',body:bytes})
      if(new URL(request.url()).pathname==='/audit-images/retry.png'){
        retryRequests++
        if(!recovering) return void request.abort('failed')
        return void request.respond({status:200,contentType:'image/png',body:bytes})
      }
      void request.continue()
    })
    await page.goto(base+'/app/onepage#links',{waitUntil:'domcontentloaded'})
    await page.waitForSelector('[data-editor-avatar] img').catch(async e=>{console.log(await page.evaluate(()=>document.body.innerText.slice(0,600)));throw e})
    const photo = async expected => {
      await page.waitForFunction(expected => {
        const images=[...document.querySelectorAll('[data-editor-avatar] img')]
        return images.length>0 && images.every(i=>i.complete&&i.naturalWidth>0&&i.src.endsWith(expected))
      },{},expected)
      const frame=page.frames().find(f=>f.url().includes('/onepage-preview'))
      if (frame) await frame.waitForFunction(expected=>[...document.querySelectorAll('[data-page-avatar] img')].some(i=>i.complete&&i.naturalWidth>0&&i.src.endsWith(expected)),{},expected)
    }
    await photo(avatar)
    await page.click('[data-editor-avatar]')
    await clickText(page,'Select image or GIF')
    const file=await page.waitForSelector('[role="dialog"] input[type="file"]')
    await file.uploadFile(process.cwd()+'/public/placeholder.jpg')
    await page.waitForSelector('[data-crop-save]:not([disabled])')
    await pause(400)
    await page.click('[data-crop-save]')
    await page.waitForFunction(()=>!document.querySelector('[data-crop-upload="image"]'))
    assert.match(uploadPath??'',/^\/storage\/v1\/object\/avatars\/probe-user\//)
    await photo(avatar)
    await page.reload({waitUntil:'domcontentloaded'})
    await photo(avatar)
    console.log(`ok ${width}px: actual file selection, crop, storage upload and canonical save`)
    if(process.env.SHOTS)await new Promise(r=>setTimeout(r,800))
    if(process.env.SHOTS)await page.screenshot({path:`${process.env.SHOTS}/${width}-editor.png`})

    for (const next of ['/audit-images/placeholder.jpg','/audit-images/icon-light-32x32.png']) {
      const before=avatar
      await page.evaluate(()=>{window.oldPhotoRead=window.auditReadStart()})
      await page.evaluate(url=>window.auditPhoto(url),next)
      assert.equal(await page.evaluate(before=>window.auditReadFinish(before,window.oldPhotoRead),before),false,'A late read cannot replace a newer committed photo')
      await photo(next)
      await page.reload({waitUntil:'domcontentloaded'})
      await photo(next)
    }
    refusePhoto=true
    assert.equal(await page.evaluate(async()=>{try{await window.auditPhoto(null);return false}catch{return true}}),true)
    refusePhoto=false
    await photo(avatar)
    await page.evaluate(()=>window.auditPhoto(null))
    await page.waitForFunction(()=>!document.querySelector('[data-editor-avatar] img'))
    await page.reload({waitUntil:'domcontentloaded'})
    await page.waitForSelector('[data-editor-avatar]')
    assert.equal(await page.$('[data-editor-avatar] img'),null)
    await page.evaluate(()=>window.auditPhoto('/audit-images/icon-light-32x32.png'))
    await photo(avatar)
    await page.evaluate(()=>window.auditPhoto('/audit-images/retry.png'))
    assert.ok(await page.evaluate(()=>[...document.querySelectorAll('[data-editor-avatar] img')].some(i=>i.complete&&i.naturalWidth>0)),'Keep the decoded image while replacement retries')
    await pause(200)
    recovering=true
    await photo(avatar)
    assert.ok(retryRequests>=2,'A transient original-image failure must be retried')
    await page.evaluate(()=>window.auditPhoto('/audit-images/missing.png'))
    await page.waitForFunction(()=>!document.querySelector('[data-editor-avatar] img'))
    await page.evaluate(()=>window.auditPhoto('/audit-images/icon-light-32x32.png'))
    await photo(avatar)
    // Anonymous visitors and both themed modals use the same photo.
    const anonymous=await browser.createBrowserContext()
    const live=await anonymous.newPage()
    await resize(live,width)
    await live.goto(base+'/app/onepage?live',{waitUntil:'domcontentloaded'})
    await live.waitForFunction(()=>[...document.querySelectorAll('[data-page-avatar] img')].some(i=>i.complete&&i.naturalWidth>0))
    await live.click('[data-onepage-share-button]')
    await live.waitForFunction(()=>[...document.querySelectorAll('[data-share-avatar] img')].some(i=>i.complete&&i.naturalWidth>0))
    if(process.env.SHOTS)await new Promise(r=>setTimeout(r,500))
    if(process.env.SHOTS)await live.screenshot({path:`${process.env.SHOTS}/${width}-share.png`})
    await live.keyboard.press('Escape')
    // Reload closes either desktop dialog or phone sheet without relying on its animation.
    await live.reload({waitUntil:'domcontentloaded'})
    await live.waitForSelector('[data-onepage-bell]')
    await live.click('[data-onepage-bell]')
    await live.waitForFunction(()=>[...document.querySelectorAll('[data-subscribe-avatar] img')].some(i=>i.complete&&i.naturalWidth>0))
    if(process.env.SHOTS)await new Promise(r=>setTimeout(r,500))
    if(process.env.SHOTS)await live.screenshot({path:`${process.env.SHOTS}/${width}-newsletter.png`})
    console.log(`ok ${width}px: replacement, failed removal, removal, refresh and anonymous profile`)
    await page.goto(base+'/app/onepage#design',{waitUntil:'domcontentloaded'})
    await page.waitForSelector('[data-nav-row="buttons"]')
    await page.click('[data-nav-row="buttons"]')
    await page.waitForSelector('[data-hover-colours]')
    await pause(650)
    const color=async(label,value)=>{
      await page.click(`[data-color-field][aria-label^="${label}:"]`)
      const input=await page.waitForSelector('[data-color-hex]',{visible:true})
      await pause(400)
      await input.click({clickCount:3})
      await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control')
      await page.keyboard.type(value)
      await page.keyboard.press('Enter')
      if(width<640) await clickText(page,'Done')
      else await page.keyboard.press('Escape')
      await pause(350)
    }
    await color('Hover fill','#12695e')
    await color('Hover text','#f0a24a')
    await clickText(page,'Save')
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Saved'))
    assert.equal(theme.button_hover_fill,'#12695e')
    assert.equal(theme.button_hover_text,'#f0a24a')
    const hoverElement = async (target, button) => {
      await button.evaluate(b=>b.scrollIntoView({block:'center'}))
      if (typeof target.parentFrame === 'function' && target.parentFrame()) {
        const element=await target.frameElement()
        const bounds=await element.boundingBox()
        const local=await button.evaluate(b=>{const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight}})
        await page.mouse.move(bounds.x+local.x*bounds.width/local.w,bounds.y+local.y*bounds.height/local.h)
      } else await button.hover()
    }
    const checkHover=async(target,label)=>{
      const button=await target.$('.op-btn')
      await hoverElement(target,button)
      await pause(250)
      const result=await button.evaluate(b=>({ink:getComputedStyle(b).color,fill:getComputedStyle(b,'::after').backgroundColor,on:getComputedStyle(b,'::after').opacity}))
      if(result.on!=='1') console.log(label,await button.evaluate(b=>({hovered:b.matches(':hover'),media:matchMedia('(hover: hover) and (pointer: fine)').matches,rect:b.getBoundingClientRect().toJSON(),hit:document.elementFromPoint(b.getBoundingClientRect().left+10,b.getBoundingClientRect().top+10)?.outerHTML.slice(0,200)})))
      assert.deepEqual(result,{ink:'rgb(240, 162, 74)',fill:'rgb(18, 105, 94)',on:'1'},label)
      const highlighted=await target.$('.op-btn.animate-onepage-swipe')
      if(highlighted){
        await hoverElement(target,highlighted);await pause(250)
        assert.equal(await highlighted.evaluate(b=>getComputedStyle(b,'::before').backgroundColor),'rgb(18, 105, 94)')
        assert.equal(await highlighted.evaluate(b=>getComputedStyle(b,'::before').opacity),'1')
      }
    }
    if(width<640){await clickText(page,'Preview');await pause(500)}
    const candidates=page.frames().filter(f=>f.url().includes('/onepage-preview'))
    let preview=null
    for(const candidate of candidates){const element=await candidate.frameElement();if(await element.isVisible())preview=candidate}
    if(preview) {await preview.waitForSelector('.op-btn');await checkHover(preview,'Preview hover')}
    await live.goto(base+'/app/onepage?live',{waitUntil:'domcontentloaded'})
    await live.waitForSelector('.op-btn')
    await checkHover(live,'Anonymous live hover')
    if(process.env.SHOTS)await new Promise(r=>setTimeout(r,500))
    if(process.env.SHOTS)await live.screenshot({path:`${process.env.SHOTS}/${width}-hover.png`})
    if(width<640){await clickText(page,'Edit');await pause(300)}
    // Reset each field independently through the actual editor controls.
    await page.evaluate(()=>{
      const field=document.querySelector('[data-color-field][aria-label^="Hover fill:"]')
      field.parentElement.querySelector('button:not([data-color-field])').click()
    })
    await clickText(page,'Save')
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Saved'))
    assert.equal(theme.button_hover_fill,null)
    assert.equal(theme.button_hover_text,'#f0a24a','Fill reset must preserve an independently chosen text color')
    await page.evaluate(()=>{
      const field=document.querySelector('[data-color-field][aria-label^="Hover text:"]')
      field.parentElement.querySelector('button:not([data-color-field])').click()
    })
    await clickText(page,'Save')
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Saved'))
    assert.equal(theme.button_hover_text,null)
    console.log(`ok ${width}px: Share, newsletter, hover fill/text, save and independent resets`)
    // The next size starts with custom colors again.
    theme={...theme,button_hover_fill:'#e4572e',button_hover_text:'#112233'}
    assert.deepEqual(errors,[])
    await anonymous.close()
    await page.close()
  }
} finally {
  await browser.close()
  await new Promise(r=>server.close(r))
}
