/**
 * ===========================================================================
 *  AN IMPORTED THEME'S PAGES, COUNTED LIKE EVERY OTHER WEBSITE'S
 * ===========================================================================
 * A website whose theme came from Shopify is drawn by the compat handler,
 * not by React, so components/analytics/track-view.tsx never ran on it: its
 * visitors, pages and products were missing from Analytics altogether, and
 * the store's Google Analytics and pixels were never on it either.
 *
 * This is the same tracker, as one small inline script with the creator
 * (and, on a product page, the product) written in:
 *
 *   a view       once per page per 30 minutes in this tab, after the page has
 *                loaded and the browser is idle, by beacon if left first, to
 *                /api/track-view, judged by lib/analytics/collect.ts like any
 *                other (bots, the store's owner, previews, repeats)
 *   add to cart  a form posting to /cart/add (the theme's own Add to cart,
 *                by form or by its script) or a Buy it now press: buy_click
 *   a link out   to another site: link_click, once per link per page
 *   the store's  view_item on a product page, add_to_cart, begin_checkout on
 *   pixels       the cart's Check out (lib/analytics/pixels.ts PIXEL_EVENT_JS)
 *
 * Ids (the visit and the browser) only with the visitor's analytics consent,
 * the same cookies lib/analytics-utils.ts keeps; without it the server counts
 * the visit by its daily hash. Nothing here can break the page: every step
 * is wrapped, and every request is dropped on failure.
 */
import { PIXEL_EVENT_JS } from "@/lib/analytics/pixels"

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function compatTrackScript(input: { creatorId: string; productId?: string | null; mainDomain: string }): string {
  if (!ID.test(input.creatorId)) return ""
  const product = input.productId && ID.test(input.productId) ? input.productId : null
  const conf = JSON.stringify({ c: input.creatorId, p: product, m: input.mainDomain.toLowerCase().replace(/^www\./, "") })
  const js =
    PIXEL_EVENT_JS +
    `(function(K){var w=window,d=document;try{if(navigator.webdriver||w.self!==w.top)return;var q=new URLSearchParams(location.search);if(q.has('preview')||q.has('sl_preview')||/^\\/(w\\/[^/]+\\/)?preview(\\/|$)/.test(location.pathname))return}catch(e){return}` +
    /* Consent, as lib/consent/consent.ts writes it: version 2, analytics on. */
    `function ok(){var m=d.cookie.match(/(?:^|;\\s*)storelib_consent=(\\d{1,3})\\.p[01]\\.a([01])\\./);return!!m&&m[1]==='2'&&m[2]==='1'}` +
    `function ck(n){var m=d.cookie.match(new RegExp('(?:^|;\\\\s*)'+n+'=([^;]+)'));return m?decodeURIComponent(m[1]):''}` +
    `function rid(p){return p+Math.random().toString(36).slice(2)+Date.now().toString(36)}` +
    `function ids(){if(!ok())return{};var s=ck('sl_asid')||rid('s_'),v=ck('materia_visitor')||rid('v_');d.cookie='sl_asid='+encodeURIComponent(s)+'; path=/; max-age=1800; samesite=lax; secure';if(!ck('materia_visitor'))d.cookie='materia_visitor='+encodeURIComponent(v)+'; path=/; max-age=31536000; samesite=lax; secure';return{sessionId:s,visitorId:v}}` +
    `function send(path,b,beacon){var t;try{t=JSON.stringify(b)}catch(e){return}try{if(beacon&&navigator.sendBeacon&&navigator.sendBeacon(path,new Blob([t],{type:'text/plain;charset=UTF-8'})))return}catch(e){}try{fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:t,keepalive:true,credentials:'same-origin'}).catch(function(){})}catch(e){}}` +
    /* Where the visit came from: the first page of it, kept for the visit (as getAttributionForTracking). */
    `function attr(){var k='sl_attr:'+K.c,a=null;try{a=JSON.parse(sessionStorage.getItem(k)||'null')}catch(e){}var u={};['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(n){var x=new URLSearchParams(location.search).get(n);if(x)u[n]=x});if(!u.utm_source&&!u.utm_medium){var sq=new URLSearchParams(location.search);['ref','source','via','src'].some(function(n){var x=(sq.get(n)||'').trim();if(x&&x.length<=60&&/^[a-z][a-z0-9._-]*$/i.test(x)&&!/^[0-9]+$/.test(x)){u.utm_source=x.toLowerCase();return true}return false})}if(!u.utm_source&&!u.utm_medium){var cq=new URLSearchParams(location.search);[['gclid','google','cpc'],['gbraid','google','cpc'],['wbraid','google','cpc'],['msclkid','bing','cpc'],['ttclid','tiktok','paid'],['twclid','x','paid'],['li_fat_id','linkedin','paid'],['fbclid','facebook',''],['igshid','instagram','']].some(function(c){if((cq.get(c[0])||'').trim()){u.utm_source=c[1];if(c[2])u.utm_medium=c[2];return true}return false})}var r=d.referrer,rd='Direct';try{if(r){var h=new URL(r).hostname.replace(/^www\\./,'');if(h&&h!==location.hostname.replace(/^www\\./,''))rd=h;else r=''}}catch(e){r=''}if(!a||u.utm_source||u.utm_medium||(a.referrerDomain==='Direct'&&rd!=='Direct')){a={referrerDomain:rd,referrer:r||null,pageUrl:location.href,utm:u};try{sessionStorage.setItem(k,JSON.stringify(a))}catch(e){}}return a}` +
    /* The view: once per path per 30 minutes in this tab (lib/analytics/page-tracker pageKeyOf, recentlySent). */
    `var key='sl_pv:'+K.c+'|'+location.host.toLowerCase()+((location.pathname.toLowerCase().replace(/\\/{2,}/g,'/').replace(/\\/+$/,''))||'/'),sent=false;function seen(){try{var at=+sessionStorage.getItem(key);return at>0&&Date.now()-at<1800000}catch(e){return false}}` +
    `function view(beacon){if(sent||seen())return;sent=true;try{sessionStorage.setItem(key,String(Date.now()))}catch(e){}var a=attr(),i=ids(),u=a.utm||{},wd=w.innerWidth||0;send('/api/track-view',{creatorId:K.c,productId:K.p||undefined,href:location.href,sessionId:i.sessionId,visitorId:i.visitorId,referrerDomain:a.referrerDomain,referrer:a.referrer,pageUrl:a.pageUrl,utm_source:u.utm_source,utm_medium:u.utm_medium,utm_campaign:u.utm_campaign,utm_term:u.utm_term,utm_content:u.utm_content,deviceType:wd&&wd<768?'mobile':wd&&wd<1024?'tablet':'desktop',screenWidth:screen.width,screenHeight:screen.height,language:navigator.language||null,pageTitle:(d.title||'').slice(0,200)||undefined},beacon)}` +
    `function go(){if(w.requestIdleCallback)w.requestIdleCallback(function(){view(false)},{timeout:2000});else setTimeout(function(){view(false)},400);if(K.p)setTimeout(function(){w.__slPixel('view_item',K.p)},0)}` +
    `function shown(){if(d.readyState==='complete')go();else{var t=setTimeout(go,10000);w.addEventListener('load',function(){clearTimeout(t);go()},{once:true})}}` +
    `if(d.visibilityState==='hidden'||d.prerendering){var f=function(){if(d.visibilityState!=='hidden'&&!d.prerendering){d.removeEventListener('visibilitychange',f);d.removeEventListener('prerenderingchange',f);shown()}};d.addEventListener('visibilitychange',f);d.addEventListener('prerenderingchange',f)}else shown();` +
    `w.addEventListener('pagehide',function(){if(!sent&&d.readyState!=='loading')view(true)});` +
    /* Add to cart and Buy it now: the step, once per page, to Storelib and to the store's pixels. */
    `var steps={};function step(t,pix){if(steps[t])return;steps[t]=1;var i=ids();send('/api/track-event',{eventType:t,creatorId:K.c,productId:K.p||undefined,href:location.href,sessionId:i.sessionId,visitorId:i.visitorId},true);w.__slPixel(pix,K.p)}` +
    `d.addEventListener('submit',function(e){try{var f=e.target,a=f&&f.getAttribute&&(f.getAttribute('action')||'');if(/\\/cart\\/add/.test(a))step('buy_click','add_to_cart')}catch(x){}},true);` +
    `d.addEventListener('click',function(e){try{var n=e.target&&e.target.closest&&e.target.closest('.shopify-payment-button,[data-shopify="payment-button"],[name="checkout"],a[href*="/checkout"],button[name="add"],[data-storelib-buy-now]');if(!n)return;if(n.matches('[name="checkout"],a[href*="/checkout"]')){if(!steps.c){steps.c=1;w.__slPixel('begin_checkout',null)}}else step('buy_click','add_to_cart')}catch(x){}},true);` +
    /* A link out of the website (lib/analytics/page-tracker watchOutboundLinks). */
    `var out={};d.addEventListener('click',function(e){try{if(e.button>1)return;var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var t=new URL(a.href,location.href),s=t.protocol.replace(':','');var o=s==='mailto'||s==='tel'||((s==='http'||s==='https')&&t.host!==location.host&&!(t.hostname===K.m||t.hostname.slice(-K.m.length-1)==='.'+K.m));if(!o)return;var l=(s==='http'||s==='https')?t.protocol+'//'+t.host+t.pathname:s+':';if(out[l])return;out[l]=1;var i=ids();send('/api/track-event',{eventType:'link_click',creatorId:K.c,href:location.href,linkUrl:l,sessionId:i.sessionId,visitorId:i.visitorId},true)}catch(x){}},true)` +
    `})(${conf})`
  return `<script data-storelib-track>${js}</script>`
}

/** The store's Google Analytics, Tag Manager and pixels (Settings › Integrations), as plain tags for a page that is not React. */
export function compatTrackingTags(tags: { key: string; src?: string; inline?: string }[]): string {
  return tags
    .map((t) => (t.src ? `<script async src="${t.src.replace(/"/g, "&quot;")}" data-storelib-tag="${t.key}"></script>` : t.inline ? `<script data-storelib-tag="${t.key}">${t.inline.replace(/<\/script/gi, "<\\/script")}</script>` : ""))
    .join("")
}
