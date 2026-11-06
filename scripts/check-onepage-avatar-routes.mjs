/** Run the actual OnePage routes against a failed/stale profile database. */
import assert from 'node:assert/strict'
import {build} from 'esbuild'

const mocks={
  'next/server':`export class NextResponse extends Response {static json(body,init={}){return new NextResponse(JSON.stringify(body),{...init,headers:{'content-type':'application/json',...init.headers}})}};export const after=()=>{}`,
  '@/lib/supabase/server':`export const createClient=async()=>globalThis.avatarDb`,
  '@/lib/supabase/admin':`export const createAdminClient=()=>globalThis.avatarDb`,
  '@/lib/auth/route-user':`export const routeUser=async()=>({kind:'user',user:{id:'owner'}});export const authUnavailableResponse=()=>new Response('',{status:503})`,
  '@/lib/team/onepage':`export const onePageActor=async()=>({db:globalThis.avatarDb,pageOwnerId:'owner'})`,
  '@/lib/onepage/ensure-onepage':`export const ensureOnePage=async()=>null`,
  '@/lib/onepage/public-cache':`export const onePageChangedFor=async()=>{}`,
  '@/lib/onepage/name-availability':`export const onePageNameTaken=async()=>false`,
  '@/lib/account/profile-follow':`export const followProfileIdentity=async()=>({})`,
  '@/lib/seo/announce':`export const announce=()=>{};export const onePageAddresses=()=>[]`,
  '@/lib/social/onepage-sync':`export const changedLinks=()=>({});export const onePageLinks=()=>({});export const syncOnePageLinksToCreatorPage=async()=>false`,
  '@/lib/storefront/creator-page-purge':`export const creatorPagesChanged=async()=>{}`,
  '@/lib/onepage/storelib-blocks':`export const stripResolved=blocks=>blocks`,
}
const load=async path=>{
  const built=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',logLevel:'warning',plugins:[{name:'database-boundary',setup(b){
    b.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:'fixture'}:undefined)
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js'}))
  }}]})
  return import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
}
let photoError=true,photo=null
const writes=[]
const existing={id:'page',owner_id:'owner',slug:'handle',seller_id:'creator',settings:{},avatar_url:'https://storelib.com/media/avatars/owner/stale.png'}
globalThis.avatarDb={from(table){
  let update=null
  const chain=new Proxy({}, {get(_target,key){
    if(key==='then')return resolve=>{
      if(update)writes.push(update)
      resolve(table==='profiles'?{data:photoError?null:{avatar_url:photo},error:photoError?{code:'08006'}:null}:{data:table==='creators'?{id:'creator'}:{...existing,...update},error:null})
    }
    return (...args)=>{if(key==='update')update=args[0];return chain}
  }})
  return chain
}}
try{
  const {GET,PUT}=await load('app/api/onepage/route.ts')
  const {POST}=await load('app/api/onepage/publish/route.ts')
  const request=(method,body)=>new Request('https://storelib.com/api/onepage',{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
  const payload={id:'page',avatar_url:existing.avatar_url,draft_blocks:[],theme:{button_hover_animation:'fill',button_hover_fill:'#12695e',button_hover_text:'#f0a24a'}}
  for(const [fn,method] of [[GET,'GET'],[PUT,'PUT'],[POST,'POST']]){
    writes.length=0
    const response=await fn(request(method,method==='GET'?null:payload))
    assert.equal(response.status,503,method+' must not turn a failed profile read into removal')
    assert.equal(writes.length,0,method+' must not mutate a page after a failed profile read')
  }
  photoError=false
  for(photo of [null,'https://storelib.com/media/avatars/owner/current.png']){
    const read=await GET(request('GET'))
    assert.equal(read.status,200)
    assert.equal(read.headers.get('cache-control'),'no-store')
    assert.equal((await read.json()).onepage.avatar_url,photo)
    writes.length=0
    assert.equal((await PUT(request('PUT',payload))).status,200)
    assert.equal(writes[0].avatar_url,photo,'A stale editor cannot reintroduce a removed/replaced avatar')
    assert.deepEqual(writes[0].theme,payload.theme,'Hover colors survive the real save route')
    writes.length=0
    assert.equal((await POST(request('POST',payload))).status,200)
    assert.equal(writes[0].published_profile.avatar_url,photo)
    assert.deepEqual(writes[0].published_theme,payload.theme)
  }
  console.log('OnePage GET, save and publish: canonical profile, removal, failed reads and hover persistence passed')
} finally {delete globalThis.avatarDb}
