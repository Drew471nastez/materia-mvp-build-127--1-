/** Exercise the real GET handler with a failing database: a transient read
 * must never acknowledge a stale default or an incomplete theme as success. */
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const mocks={
 'next/server':`export const NextResponse={json:(data,init={})=>new Response(JSON.stringify(data),{...init,headers:{'content-type':'application/json'}})};export const after=()=>{}`,
 '@/lib/supabase/server':`export const createClient=async()=>globalThis.__themeReadDb`,
 '@/lib/website-builder/owned-install':`export const editorUser=async()=>({user:{id:'user'}});export const readTwice=fn=>fn();export const UNREACHABLE='Unreachable'`,
 '@/lib/perf/server-timing':`export const timed=(area,name,fn)=>fn`,
 '@/lib/github-sync/mirror':`export const mirrorToGitHub=()=>{}`,
 '@/lib/website-builder/save-theme-file':`export const saveThemeFile=()=>{}`,
 '@/lib/website-builder/theme-file-tree':`export const getDefaultFileContent=()=>"builtin";export const shownPath=p=>p`,
 '@/lib/storelib-theme':`export const compileThemeFile=()=>({ok:true})`,
 '@/lib/storelib-theme/compat/storelib-reviews':`export const withStorelibReviewsSection=files=>files`,
 '@/lib/website-builder/theme-config-store':`export const settingsDataFor=()=>null`,
}
const result=await build({entryPoints:['app/api/website-builder/themes/[installId]/files/route.ts'],bundle:true,write:false,platform:'node',format:'esm',logLevel:'warning',plugins:[{name:'fixture-services',setup(b){
 b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined)
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))
}}]})
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
const error={data:null,error:{code:'08006',message:'connection interrupted'}}
let answer
function db(){return {from(table){const q={table,filters:{}};const chain=new Proxy({}, {get(_,key){
 if(key==='then')return (resolve,reject)=>Promise.resolve(table==='creators'?{data:{id:'creator'}}:table==='store_theme_installs'?{data:{id:'install',name:'Theme'}}:answer(q)).then(resolve,reject)
 return (...args)=>{if(key==='eq')q.filters[args[0]]=args[1];else q[key]=args;return chain}
}});return chain}}}
globalThis.__themeReadDb=db()
async function read(query){return GET(new Request('https://example.test/api/files?'+query),{params:Promise.resolve({installId:'install'})})}
try {
 answer=q=>q.range?.[0]===0?{data:Array.from({length:1000},(_,i)=>({path:`shopify/sections/s${i}.liquid`,content:'old'})),error:null}:error
 let res=await read('compat=1');assert.equal(res.status,503);assert(!(await res.text()).includes('shopify/sections/s0'))
 console.log('ok: a failed second page does not return a partial theme')
 for(const query of ['sources=1','path=sections%2Fhero.storelib','compat-locale=fr']){
  answer=()=>error;res=await read(query);assert.equal(res.status,503,query);assert.equal(res.headers.get('cache-control'),'no-store')
 }
 console.log('ok: failed source, single-file and translation reads remain retryable, never cached defaults')
 answer=q=>q.filters.path?error:{data:[],error:null}
 res=await read('sources=1');assert.equal(res.status,503)
 console.log('ok: a failed schema read does not erase the settings panel')
 answer=()=>({data:null,error:null});res=await read('path=sections%2Fhero.storelib');assert.equal(res.status,200);assert.equal((await res.json()).content,'builtin')
 answer=q=>q.filters.path?{data:null,error:null}:{data:[{path:'sections/hero.storelib',content:'published',draft_content:'new draft'}],error:null}
 res=await read('sources=1');assert.equal((await res.json()).files['sections/hero.storelib'],'new draft')
 console.log('ok: genuine defaults still work, and successful reads prefer the saved draft')
} finally {delete globalThis.__themeReadDb}
