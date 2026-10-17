/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE MEASURES ITSELF, ONCE PER PAGE VIEW
 * ===========================================================================
 * The one collector every live page of a website carries: a Storelib theme's
 * pages (components/website-builder/site-vitals.tsx puts it in the page) and
 * an imported Shopify theme's (lib/website-builder/compat-site.ts, in the
 * head). Website settings › Performance reads what it sends.
 *
 * WHAT IT MEASURES, with the browser's own PerformanceObserver and no
 * library: LCP (until the visitor's first input), CLS by session windows,
 * INP as the slowest interaction with one forgiven per fifty, FCP, TTFB
 * (both from the moment a prerendered page was shown), and for a page
 * change inside the site without a reload, how long from the tap to the
 * next frame of the new page. lib/website-builder/web-vitals.ts holds the
 * same algorithms where the tests reach them.
 *
 * WHEN. The script itself only adds two listeners. The observers start
 * after the page's load event, at the browser's next idle moment, and read
 * back what the browser buffered before then; a visitor who leaves sooner
 * starts them on the way out, so a page left before it loaded is still
 * counted. Nothing reads layout. One beacon per page view, when the page is
 * hidden or left (navigator.sendBeacon), and one per page change.
 *
 * WHERE. Live pages only: never a preview, and it refuses to run in a frame
 * (the editor's canvas, anyone embedding the site) or in a browser driven
 * by a script (screenshots, bots).
 *
 * WHAT IS SENT: the path, whether it was a load or a page change, the
 * viewport width, the connection type and the numbers. Not the site (the
 * route finds it from the host), no cookie, nothing about the visitor.
 *
 * Pure. tests/perf-collect.test.ts runs it in a page and
 * scripts/check-performance-tab.mjs measures its size.
 */

import { SITE_BEACON_PATH } from "./config"

/** The collector as script text, without the tag. */
export const SITE_VITALS_JS =
  `(function(){try{var W=window,D=document,N=navigator,P=performance;` +
  `if(W.__slSV||W.self!==W.top||N.webdriver||typeof PerformanceObserver==="undefined")return;W.__slSV=1;` +
  `var EP=${JSON.stringify(SITE_BEACON_PATH)},S=PerformanceObserver.supportedEntryTypes||[],nv=P.getEntriesByType("navigation")[0],act=(nv&&nv.activationStart)||0,` +
  /* hid: when the page was first hidden; on: the observers have started; v: the page view being measured. */
  `hid=D.visibilityState==="hidden"?0:1/0,on=0,obs=[],lastIn=0,v=view("l",0);` +
  `function view(k,t){return{k:k,p:location.pathname,t:t,lcp:null,fcp:null,sh:[],it:{},ic:P.interactionCount||0,nav:null,sent:0}}` +
  `function ob(t,f,x){if(S.indexOf(t)<0)return;try{var o=new PerformanceObserver(function(l){f(l.getEntries())}),p={type:t,buffered:true};if(x)for(var k in x)p[k]=x[k];o.observe(p);obs.push([o,f])}catch(e){}}` +
  `function stop(){lastIn=P.now();if(v.k==="l")v.done=1}` +
  `function start(){if(on)return;on=1;` +
  `ob("largest-contentful-paint",function(es){if(v.k!=="l"||v.done)return;for(var i=0;i<es.length;i++)if(es[i].startTime<hid)v.lcp=Math.max(0,es[i].startTime-act)});` +
  `ob("paint",function(es){for(var i=0;i<es.length;i++)if(es[i].name==="first-contentful-paint"&&es[i].startTime<hid&&v.k==="l")v.fcp=Math.max(0,es[i].startTime-act)});` +
  `ob("layout-shift",function(es){for(var i=0;i<es.length;i++){var e=es[i];if(!e.hadRecentInput&&e.startTime>=v.t)v.sh.push([e.value,e.startTime])}});` +
  `function ev(es){for(var i=0;i<es.length;i++){var e=es[i],k=e.interactionId;if(!k||e.startTime<v.t)continue;if(!(k in v.it)||e.duration>v.it[k])v.it[k]=e.duration}}` +
  `ob("event",ev,{durationThreshold:16});ob("first-input",ev)}` +
  `function cls(){var w=0,c=0,f=0,l=0,s=v.sh;for(var i=0;i<s.length;i++){var x=s[i][0],t=s[i][1];if(c>0&&t-l<1000&&t-f<5000){c+=x;l=t}else{c=x;f=t;l=t}if(c>w)w=c}return Math.round(w*1e4)/1e4}` +
  `function inp(){var a=[];for(var k in v.it)a.push(v.it[k]);` +
  /* A tap before the observers started and quicker than the browser buffers: its first input is still on the timeline. */
  `if(!a.length&&v.k==="l"){var fi=P.getEntriesByType("first-input")[0];if(fi)a.push(fi.duration)}if(!a.length)return undefined;a.sort(function(x,y){return y-x});var n=Math.max((P.interactionCount||0)-v.ic,a.length);return Math.round(a[Math.min(a.length-1,Math.floor(n/50))])}` +
  `function r(x){return x===null?undefined:Math.round(x)}` +
  `function send(){start();for(var i=0;i<obs.length;i++){try{obs[i][1](obs[i][0].takeRecords())}catch(e){}}if(v.sent)return;v.sent=1;` +
  `var c=N.connection&&N.connection.effectiveType,b={v:1,p:v.p,k:v.k==="l"?"l":"s",w:W.innerWidth,c:c,inp:inp(),cls:S.indexOf("layout-shift")<0?undefined:cls()};` +
  `if(v.k==="l"){b.lcp=r(v.lcp);b.fcp=r(v.fcp);if(nv&&nv.responseStart>0)b.ttfb=Math.round(Math.max(0,nv.responseStart-act))}else{if(v.nav===null)return;b.nav=r(v.nav)}` +
  `var j=JSON.stringify(b);try{if(!(N.sendBeacon&&N.sendBeacon(EP,new Blob([j],{type:"text/plain"}))))fetch(EP,{method:"POST",body:j,keepalive:true,credentials:"omit"}).catch(function(){})}catch(e){}}` +
  /* A page change inside the site without a reload: the page view so far is sent, and the new one is timed from the tap that asked for it to its first frame. */
  `function moved(){if(location.pathname===v.p)return;var now=P.now(),t0=now-lastIn<5000?lastIn:now;send();v=view("s",t0);var w=v;` +
  `requestAnimationFrame(function(){requestAnimationFrame(function(){if(D.visibilityState!=="hidden")w.nav=P.now()-t0})})}` +
  `["pushState","replaceState"].forEach(function(m){var o=history[m];if(o)history[m]=function(){var x=o.apply(this,arguments);try{moved()}catch(e){}return x}});` +
  `addEventListener("popstate",function(){lastIn=P.now();moved()},true);` +
  `addEventListener("keydown",stop,{capture:true});addEventListener("pointerdown",stop,{capture:true});` +
  `addEventListener("visibilitychange",function(){if(D.visibilityState!=="hidden")return;hid=Math.min(hid,P.now());send()},true);` +
  `addEventListener("pagehide",send,true);` +
  `function idle(){(W.requestIdleCallback||function(f){setTimeout(f,1)})(start,{timeout:2000})}` +
  `if(D.readyState==="complete")idle();else addEventListener("load",idle,{once:true})` +
  `}catch(e){}})();`

/** The collector, ready for the page: one inline script. */
export function siteVitalsScript(): string {
  return `<script data-storelib-vitals="">${SITE_VITALS_JS}</script>`
}
