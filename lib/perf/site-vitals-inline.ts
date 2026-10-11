/**
 * ===========================================================================
 *  AN IMPORTED THEME'S PAGE MEASURES ITSELF TOO
 * ===========================================================================
 * A website whose theme was imported from Shopify is drawn as text by the
 * compat engine (lib/storelib-theme/compat), not by React, so the collector
 * a Storelib theme's page mounts (components/website-builder/site-vitals.tsx)
 * was never on it: its visitors' speed was never counted under "Published
 * websites", on a subdomain or a connected domain alike.
 *
 * This is the same collector as a couple of kilobytes of inline script, in
 * the head of every live page (lib/website-builder/compat-site.ts), never on
 * a preview or in the editor's canvas (it refuses to run in a frame). The
 * browser's observers are buffered, so where it runs costs nothing measured.
 * The same rules as the React one, and lib/website-builder/web-vitals.ts's
 * algorithms written out: LCP until the first input, CLS by session windows,
 * INP as the slowest interaction with one forgiven per fifty. One beacon
 * per page load, when the page is hidden or left, to SITE_BEACON_PATH on the
 * site's own host. No cookie, nothing about the visitor; a browser driven by
 * a script (screenshots, bots) sends nothing.
 *
 * Pure. tests/perf-collect.test.ts runs it in a page.
 */

import { SITE_BEACON_PATH } from "./config"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The script, ready for the page's head; empty for anything that is not an install id. */
export function siteVitalsScript(installId: string): string {
  if (!UUID.test(installId)) return ""
  const id = JSON.stringify(installId.toLowerCase())
  const ep = JSON.stringify(SITE_BEACON_PATH)
  return (
    `<script data-storelib-vitals="">(function(){try{` +
    `if(window.__slSV||window.self!==window.top||navigator.webdriver||typeof PerformanceObserver==="undefined")return;window.__slSV=1;` +
    `var ID=${id},EP=${ep},S=PerformanceObserver.supportedEntryTypes||[],nv=performance.getEntriesByType("navigation")[0],act=(nv&&nv.activationStart)||0;` +
    `var hid=document.visibilityState==="hidden"?0:1/0,lcp=null,done=false,sh=[],it={},obs=[],sent=false;` +
    `function ob(t,f,x){if(S.indexOf(t)<0)return;try{var o=new PerformanceObserver(function(l){f(l.getEntries())}),p={type:t,buffered:true};if(x)for(var k in x)p[k]=x[k];o.observe(p);obs.push([o,f])}catch(e){}}` +
    `ob("largest-contentful-paint",function(es){if(done)return;for(var i=0;i<es.length;i++)if(es[i].startTime<hid)lcp=Math.max(0,es[i].startTime-act)});` +
    `ob("layout-shift",function(es){for(var i=0;i<es.length;i++)if(!es[i].hadRecentInput)sh.push([es[i].value,es[i].startTime])});` +
    `function ev(es){for(var i=0;i<es.length;i++){var e=es[i],k=e.interactionId;if(!k)continue;if(!(k in it)||e.duration>it[k])it[k]=e.duration}}` +
    `ob("event",ev,{durationThreshold:16});ob("first-input",ev);` +
    `function stop(){done=true}addEventListener("keydown",stop,{once:true,capture:true});addEventListener("pointerdown",stop,{once:true,capture:true});` +
    `function cls(){var w=0,c=0,f=0,l=0;for(var i=0;i<sh.length;i++){var v=sh[i][0],t=sh[i][1];if(c>0&&t-l<1000&&t-f<5000){c+=v;l=t}else{c=v;f=t;l=t}if(c>w)w=c}return Math.round(w*1e4)/1e4}` +
    `function inp(){var a=[];for(var k in it)a.push(it[k]);if(!a.length)return undefined;a.sort(function(x,y){return y-x});var n=Math.max(performance.interactionCount||0,a.length);return Math.round(a[Math.min(a.length-1,Math.floor(n/50))])}` +
    `function send(){if(sent)return;for(var i=0;i<obs.length;i++){try{obs[i][1](obs[i][0].takeRecords())}catch(e){}}sent=true;` +
    `var b=JSON.stringify({s:ID,lcp:lcp===null?undefined:Math.round(lcp),inp:inp(),cls:S.indexOf("layout-shift")<0?undefined:cls()});` +
    `try{if(!(navigator.sendBeacon&&navigator.sendBeacon(EP,new Blob([b],{type:"text/plain"}))))fetch(EP,{method:"POST",body:b,keepalive:true,credentials:"omit"}).catch(function(){})}catch(e){}` +
    `for(var j=0;j<obs.length;j++)obs[j][0].disconnect()}` +
    `addEventListener("visibilitychange",function(){if(document.visibilityState!=="hidden")return;hid=Math.min(hid,performance.now());send()},true);` +
    `addEventListener("pagehide",send,true)` +
    `}catch(e){}})();</script>`
  )
}
