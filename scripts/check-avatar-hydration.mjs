/** Actual SSR HTML, image failure before JS, hydration, retry and replacement. */
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {build} from 'esbuild'
import puppeteer from 'puppeteer-core'

const dir=mkdtempSync(join(tmpdir(),'storelib-avatar-hydration-'))
const props={src:'/portrait.png',name:'Profile Owner',size:80,kind:'mark',waitForPhoto:true}
const common={bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'}
const ssr=await build({...common,platform:'node',format:'cjs',stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
import React from 'react';import {renderToString} from 'react-dom/server';import {AppAvatar} from './components/app/app-avatar';
export const html=renderToString(<AppAvatar {...${JSON.stringify(props)}}/>);`}})
const file=join(dir,'ssr.cjs')
writeFileSync(file,ssr.outputFiles[0].text)
const {html}=createRequire(import.meta.url)(file)
const client=await build({...common,platform:'browser',format:'iife',stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
import React from 'react';import {hydrateRoot} from 'react-dom/client';import {AppAvatar} from './components/app/app-avatar';
window.hydrationErrors=[];
const props=${JSON.stringify(props)};
const root=hydrateRoot(document.getElementById('app'),<AppAvatar {...props}/>,{onRecoverableError:e=>window.hydrationErrors.push(e.message)});
window.replaceAvatar=src=>root.render(<AppAvatar {...props} src={src}/>);`}})
const png=readFileSync('public/icon-light-32x32.png')
let failures=0
const server=createServer((req,res)=>{
  if(req.url.startsWith('/_next/image')){failures++;res.writeHead(503);return res.end('optimizer unavailable')}
  if(req.url.startsWith('/portrait.png')){res.setHeader('Content-Type','image/png');return res.end(png)}
  if(req.url==='/client.js'){
    // Let the server-rendered image fail before React can attach an error handler.
    return void setTimeout(()=>{res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(client.outputFiles[0].text)},500)
  }
  res.setHeader('Content-Type','text/html; charset=utf-8')
  res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app">${html}</div><script src="/client.js"></script></body></html>`)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM??'/opt/pw-browsers/chromium',args:['--no-sandbox']})
try{
  for(const width of [1440,390]){
    const page=await browser.newPage()
    await page.setViewport({width,height:900})
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.waitForFunction(()=>document.querySelector('[data-app-avatar]')?.dataset.state==='photo')
    assert.equal(await page.$eval('[data-app-avatar] img',img=>new URL(img.src).pathname),'/portrait.png')
    assert.ok(failures>0)
    assert.deepEqual(await page.evaluate(()=>window.hydrationErrors),[])
    await page.evaluate(()=>window.replaceAvatar('/portrait.png?v=2'))
    await page.waitForFunction(()=>document.querySelector('[data-app-avatar] img')?.src.endsWith('?v=2'))
    await page.evaluate(()=>window.replaceAvatar(null))
    await page.waitForFunction(()=>document.querySelector('[data-app-avatar]')?.dataset.state==='initials')
    assert.equal(await page.$('[data-app-avatar] img'),null)
    assert.deepEqual(errors,[])
    console.log(`ok ${width}px: SSR image failure before hydration recovers, replacement and removal, no hydration mismatch`)
    await page.close()
  }
}finally{
  await browser.close()
  await new Promise(r=>server.close(r))
  rmSync(dir,{recursive:true,force:true})
}
