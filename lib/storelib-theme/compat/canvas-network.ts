/**
 * ===========================================================================
 *  WHAT AN IMPORTED THEME ASKS THE SHOP FOR, ANSWERED INSIDE THE BUILDER
 * ===========================================================================
 * On the website a theme's scripts ask the site for things: the sections
 * of a page (`?section_id=`, `?sections=`), recommendations
 * (`/recommendations/products`), the search box's suggestions, the cart
 * (`/cart.js`, `/cart/add.js`), a product's JSON. In the builder's canvas
 * the page is a sandboxed frame with no origin (compat-canvas.tsx), so the
 * same requests went to the builder's own address: a cross-origin request
 * from `null` the builder refuses, or `about:srcdoc?section_id=…`, which
 * fetch cannot load at all. Each one was a red line in the console and a
 * part of the page that never filled in (a "You may also like" row, a
 * search box that found nothing).
 *
 * Now the frame's fetch and XMLHttpRequest hand those requests to the
 * builder by postMessage, and the builder answers them with the website's
 * own answer (lib/storelib-theme/compat/site.ts, `answer`), drawn from the
 * page being edited, its theme and the shop. The frame still reaches
 * nothing of the builder: it gets back what the website would have sent.
 * The theme's own files, pictures, fonts and any address elsewhere load
 * from the network as before.
 */
import { answer, type CartEntry, type SiteData } from "./site"

/**
 * In the frame, first in its <head>: the theme's requests for the shop go to
 * the builder. Plain ES5; it runs in the visitor's browser.
 */
export const CANVAS_NETWORK = `<script data-sl-network>(function(){
var seq=0,waiting={};
var base=document.baseURI;
var R=window.URL,here=function(){return window.__slPath||"/"};
var siteBase;try{siteBase=new R(base).origin}catch(e){siteBase=""}
/* A frame with no origin says "null" for location.origin and "about:srcdoc" for its address: an address built on either is an address of the website. */
if(siteBase&&R){var SL=function(u,b){if(arguments.length>1&&(b==="null"||b===null||String(b).indexOf("about:")===0))b=siteBase;return arguments.length>1?new R(u,b):new R(u)};SL.prototype=R.prototype;Object.getOwnPropertyNames(R).forEach(function(k){if(!(k in SL)||k==="canParse")try{SL[k]=R[k]}catch(e){}});try{window.URL=SL}catch(e){}}
var ours=function(u){
  var url;try{url=new R(String(u),base)}catch(e){return null}
  if(url.protocol==="about:")return here()+url.search;
  if(!siteBase||url.origin!==siteBase)return null;
  var p=url.pathname,n=p.indexOf("/null/");
  if(n>=0)p=p.slice(n+5);
  if(p==="/srcdoc"||/\\/srcdoc$/.test(p))p=here().split("?")[0];
  if(/^\\/(api|_next|static|images|fonts)\\//.test(p))return null;
  return p+url.search;
};
addEventListener("message",function(e){var m=e.data;if(!m||m.storelib!==1||m.type!=="fetched"||!waiting[m.id])return;var w=waiting[m.id];delete waiting[m.id];w(m)});
var ask=function(method,path,body,headers){return new Promise(function(ok){var id=++seq;waiting[id]=ok;try{parent.postMessage({storelib:1,type:"fetch",id:id,method:method,path:path,body:typeof body==="string"?body:null,headers:headers,referer:window.__slPath||"/"},"*")}catch(e){delete waiting[id];ok({status:503,headers:{},body:""})}setTimeout(function(){if(waiting[id]){delete waiting[id];ok({status:504,headers:{},body:""})}},8000)})};
var bodyText=function(b){
  if(b==null)return Promise.resolve(null);
  if(typeof b==="string")return Promise.resolve(b);
  if(b instanceof URLSearchParams)return Promise.resolve(b.toString());
  if(typeof FormData!=="undefined"&&b instanceof FormData){var p=new URLSearchParams();b.forEach(function(v,k){if(typeof v==="string")p.append(k,v)});return Promise.resolve(p.toString())}
  if(b&&typeof b.text==="function")return b.text();
  return Promise.resolve(String(b));
};
var typeOf=function(b,given){if(given)return given;if(typeof FormData!=="undefined"&&b instanceof FormData)return "application/x-www-form-urlencoded";if(b instanceof URLSearchParams)return "application/x-www-form-urlencoded";return ""};
var headerBag=function(h){var o={};try{new Headers(h||{}).forEach(function(v,k){o[k]=v})}catch(e){}return o};
var real=window.fetch;
window.fetch=function(input,init){
  var url=typeof input==="string"||input instanceof URL?String(input):input&&input.url;
  var path=ours(url);
  if(path===null)return real.apply(this,arguments);
  init=init||{};
  var method=String(init.method||(input&&input.method)||"GET").toUpperCase();
  var h=headerBag(init.headers||(input&&input.headers));
  var raw=init.body!==undefined?init.body:null;
  return bodyText(raw).then(function(text){
    h["content-type"]=typeOf(raw,h["content-type"]);
    return ask(method,path,text,h);
  }).then(function(r){return new Response(r.status===204||r.status===304?null:r.body,{status:r.status,headers:r.headers})});
};
var X=XMLHttpRequest.prototype,open=X.open,send=X.send,setH=X.setRequestHeader;
X.open=function(method,url){this.__sl=ours(url);this.__slm=String(method||"GET").toUpperCase();this.__slh={};if(this.__sl===null)return open.apply(this,arguments)};
X.setRequestHeader=function(k,v){if(this.__sl!=null){this.__slh[String(k).toLowerCase()]=v;return}return setH.apply(this,arguments)};
X.send=function(body){
  if(this.__sl==null)return send.apply(this,arguments);
  var x=this,h=x.__slh;
  bodyText(body).then(function(text){h["content-type"]=typeOf(body,h["content-type"]);return ask(x.__slm,x.__sl,text,h)}).then(function(r){
    var def=function(k,v){try{Object.defineProperty(x,k,{value:v,configurable:true})}catch(e){}};
    def("readyState",4);def("status",r.status);def("statusText",r.status<400?"OK":"Error");def("responseURL",x.__sl);
    var t=r.body||"";def("responseText",t);
    var rt=x.responseType;def("response",rt==="json"?(function(){try{return JSON.parse(t)}catch(e){return null}})():t);
    var hs=r.headers||{};x.getResponseHeader=function(k){return hs[String(k).toLowerCase()]||null};x.getAllResponseHeaders=function(){return Object.keys(hs).map(function(k){return k+": "+hs[k]}).join("\\r\\n")};
    ["readystatechange","load","loadend"].forEach(function(n){try{x.dispatchEvent(new Event(n))}catch(e){}});
    if(typeof x.onreadystatechange==="function")try{x.onreadystatechange()}catch(e){}
    if(typeof x.onload==="function")try{x.onload()}catch(e){}
  });
};
})();</script>`

/**
 * ANOTHER PAGE COMES FORWARD WHEN IT CAN BE SEEN, NOT WHEN ITS LAST PICTURE
 * IS IN. A page opened in the canvas loads behind the one on screen and
 * takes its place on its "loaded" message (compat-canvas.tsx). That was the
 * window's load: every picture and video on the page, two seconds and more
 * on a long home page, while the old page sat there after the click. Now it
 * is sent once the page has started (its DOMContentLoaded has run), its
 * fonts are in and the pictures in its first screen are, or 700ms from that
 * at most; the rest arrive as they do on any website.
 */
export const CANVAS_SHOWN = `<script data-sl-shown>(function(){
var sent=false,send=function(){if(sent)return;sent=true;requestAnimationFrame(function(){requestAnimationFrame(function(){try{parent.postMessage({storelib:1,type:"loaded",scrollY:scrollY},"*")}catch(e){}})})};
document.addEventListener("DOMContentLoaded",function(){setTimeout(function(){
  var start=performance.now();
  var firstScreen=function(){return Array.prototype.filter.call(document.images,function(i){if(i.complete)return false;var r=i.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight})};
  var check=function(){if(sent)return;if(!firstScreen().length||performance.now()-start>700)return send();setTimeout(check,50)};
  var fonts=document.fonts&&document.fonts.ready;
  if(fonts)Promise.race([fonts,new Promise(function(r){setTimeout(r,400)})]).then(check,check);else check();
},0)});
})();</script>`

export interface CanvasRequest {
  id: number
  method: string
  path: string
  body: string | null
  headers: Record<string, string>
  /** The page the frame shows, as a path of the website. */
  referer?: string
}

export interface CanvasReply {
  storelib: 1
  type: "fetched"
  id: number
  status: number
  headers: Record<string, string>
  body: string
}

/** A form or JSON body as fields, the way the site route reads one (app/api/site-theme/site route.ts, bodyOf). */
function fieldsOf(body: string | null, type: string): Record<string, unknown> | null {
  if (!body) return null
  try {
    if (type.includes("json")) {
      const v = JSON.parse(body)
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null
    }
    if (type.includes("form") || /^[^{[]/.test(body)) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of new URLSearchParams(body)) {
        const list = k.match(/^(\w+)\[\]$/)
        if (list) {
          const arr = (out[list[1]] as unknown[] | undefined) ?? []
          arr.push(v)
          out[list[1]] = arr
          continue
        }
        const item = k.match(/^items\[(\d+)\]\[(\w+)\]$/)
        if (item) {
          const arr = (out.items as Record<string, unknown>[] | undefined) ?? []
          const i = Number(item[1])
          arr[i] = { ...(arr[i] ?? {}), [item[2]]: v }
          out.items = arr
          continue
        }
        out[k] = v
      }
      return out
    }
  } catch {
    return null
  }
  return null
}

/**
 * The builder's side: one request from the frame, answered as the website
 * answers it. `cart` is the canvas's own cart, kept by the caller for the
 * life of the editor, so an add in the page shows in the theme's drawer.
 */
export async function answerCanvasRequest(site: SiteData, req: CanvasRequest, cart: { entries: CartEntry[]; note: string }): Promise<CanvasReply> {
  const reply = (status: number, headers: Record<string, string>, body: string): CanvasReply => ({ storelib: 1, type: "fetched", id: req.id, status, headers, body })
  try {
    const at = new URL(req.path, "https://canvas.invalid")
    const type = req.headers["content-type"] ?? ""
    const out = await answer(site, {
      method: req.method,
      path: at.pathname,
      query: at.searchParams,
      body: req.method === "GET" || req.method === "HEAD" ? null : fieldsOf(req.body, type),
      cart: cart.entries,
      note: cart.note,
      ajax: req.headers["x-requested-with"] === "XMLHttpRequest" || type.includes("json") || (req.headers.accept ?? "").includes("application/json"),
      referer: typeof req.referer === "string" && req.referer.startsWith("/") ? req.referer : undefined,
    })
    if (out.cart) {
      cart.entries = out.cart
      cart.note = out.note ?? cart.note
    }
    const headers: Record<string, string> = { "content-type": out.type }
    for (const [k, v] of Object.entries(out.headers ?? {})) if (k.toLowerCase() !== "cache-control") headers[k.toLowerCase()] = v
    return reply(out.status, headers, typeof out.body === "string" ? out.body : "")
  } catch {
    return reply(500, { "content-type": "text/plain" }, "")
  }
}
