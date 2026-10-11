/**
 * ===========================================================================
 *  WHEN A PAGE OF THE BUILDER'S CANVAS HAS PAINTED ITS FIRST SCREEN
 * ===========================================================================
 * Opening another page in the canvas waited for the frame's full load event
 * (every picture, every script) before it came forward, so a page switch sat
 * on the old page or showed a half-drawn new one. This script says "loaded"
 * once the page's first screen is finished:
 *
 *   DOMContentLoaded has run and the fonts are in (400ms at most);
 *   the pictures on the first screen have arrived (700ms at most) and are
 *   DECODED, so the frame that shows them has them, not a blank box;
 *   the theme's ENTRANCE on that first screen is over: a section that rises
 *   and fades in as it is first seen (Posturex's, the fixture's `.reveal`)
 *   is put where it ends. It has been playing under the page in front,
 *   where nobody sees it, so it is not waited for. Only finite animations
 *   of what is on the first screen; a marquee or an autoplay that never
 *   ends is left alone. Looked at two frames and a task after the rest, so
 *   an entrance started by an IntersectionObserver (its callback runs after
 *   the first frame the page draws) is among them.
 *
 * The canvas brings a page behind forward at this (compat-canvas.tsx), so
 * what comes forward is what the page will look like a second later.
 *
 * What the theme asks the shop for inside the canvas (sections, the cart,
 * recommendations) is answered by canvas-bridge.ts CANVAS_REQUESTS and
 * canvas-cart.ts answerInCanvas.
 */
export const CANVAS_SHOWN = `<script data-sl-shown>(function(){
var sent=false,later=function(f,ms){return new Promise(function(r){setTimeout(r,ms)}).then(f)},frames=function(f){requestAnimationFrame(function(){requestAnimationFrame(function(){setTimeout(f,0)})})};
var seen=function(el){if(!el||!el.getBoundingClientRect)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight};
var post=function(){try{parent.postMessage({storelib:1,type:"loaded",scrollY:scrollY},"*")}catch(e){}};
var entrance=function(done){var all=document.getAnimations?document.getAnimations():[];var moving=all.filter(function(a){try{var t=a.effect&&a.effect.getComputedTiming();return a.playState==="running"&&t&&isFinite(t.endTime)&&seen(a.effect.target)}catch(e){return false}});moving.forEach(function(a){try{a.finish()}catch(e){}});done()};
var send=function(){if(sent)return;sent=true;var pics=Array.prototype.filter.call(document.images,function(i){return i.complete&&i.naturalWidth>0&&seen(i)});Promise.race([Promise.all(pics.map(function(i){return i.decode?i.decode().catch(function(){}):0})),later(null,300)]).then(function(){frames(function(){entrance(function(){requestAnimationFrame(function(){requestAnimationFrame(post)})})})})};
document.addEventListener("DOMContentLoaded",function(){setTimeout(function(){
  var start=performance.now();
  var firstScreen=function(){return Array.prototype.filter.call(document.images,function(i){return !i.complete&&seen(i)})};
  var check=function(){if(sent)return;if(!firstScreen().length||performance.now()-start>700)return send();setTimeout(check,50)};
  var fonts=document.fonts&&document.fonts.ready;
  if(fonts)Promise.race([fonts,new Promise(function(r){setTimeout(r,400)})]).then(check,check);else check();
},0)});
})();</script>`

/**
 * ===========================================================================
 *  THE CANVAS TOUCHES NO EDGE OF THE PHONE
 * ===========================================================================
 * A theme's phone tab bar (Posturex's Home, Account, Shop, Wishlist, Cart)
 * pads itself with `env(safe-area-inset-bottom)` so its icons clear the
 * iPhone's home bar. In the builder on a phone the canvas sits between the
 * editor's top bar and its sheet, nowhere near that edge, but the frame
 * still reads the phone's inset: the bar grew a band of empty padding that
 * ran into the sheet, and the theme's back-to-top button, placed against
 * the bar's usual height, landed on it.
 *
 * In the canvas every safe-area inset is 0, which is what it is for a page
 * that does not reach the edge of the screen. The website itself, on a
 * phone, keeps the theme's own value.
 */
const SAFE_AREA = /(?:env|constant)\(\s*safe-area-inset-(?:top|right|bottom|left)\s*(?:,[^()]*(?:\([^()]*\)[^()]*)*)?\)/gi

export function canvasInsets(html: string): string {
  return html.includes("safe-area-inset") ? html.replace(SAFE_AREA, "0px") : html
}
