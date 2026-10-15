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
 *   the theme's ENTRANCE is NOT finished for it. It used to be: every
 *   finite animation on the first screen was jumped to its end before the
 *   page said "loaded", so a page switch landed flat, with no hero fade and
 *   no section rising, and on the first page of the builder the entrance
 *   that had started under the loader jumped to its end in plain sight.
 *
 * The page is drawn before anyone sees it (under the editor's loader, or
 * under the page in front), so its entrance would play out of sight: a
 * theme that marks a section done when its entrance ends (Posturex's
 * animation.js puts `animation: none` on it) had nothing left to show by the
 * time the page was. So until the canvas says the page is "shown", the
 * page's CSS animations are HELD at their start (animation-play-state,
 * paused; nothing else of the theme's is changed), and at "shown" they are
 * let go: the hero fades and the sections rise as they do when the live
 * site's page arrives, once, where they can be seen. A transition already
 * under way on the first screen then is started again from its beginning,
 * for the same reason. A page never shown lets its animations go by itself
 * after 12 seconds, so nothing can stay held.
 *
 * THE SAME PAGE DRAWN AGAIN is not a page arriving: an edit the page could
 * not take in place (a section added to a group, the layout changed) draws
 * it again behind itself. That one is told "shown" with `instant` while it
 * is still behind: its animations are let go and its first screen's
 * entrance put where it ends, and so is any that starts while it waits
 * behind (put where the page was scrolled to, a theme's late reveal pass),
 * until it is shown: it replaces the page in front looking as that page
 * did, and nothing on it fades or rises again under an edit.
 *
 * ONLY WHAT IS ON SCREEN THERE. Any animation that started in those five
 * seconds used to be put where it ends, wherever it was: a section scrolled
 * to just after an edit arrived already arrived, its fade and rise gone. Now
 * an animation starting then is finished only while the page still stands
 * where it was put (the "scroll" with `settle` from the canvas) and its
 * element is on screen there; one that starts because the page was scrolled
 * plays as it does on the website.
 *
 * The canvas shows a page at this (compat-canvas.tsx): the first page takes
 * the editor's loader off, a page behind comes forward, so what is shown has
 * its fonts and its first screen's pictures in, decoded, and never fills in
 * box by box in front of anyone.
 *
 * What the theme asks the shop for inside the canvas (sections, the cart,
 * recommendations) is answered by canvas-bridge.ts CANVAS_REQUESTS and
 * canvas-cart.ts answerInCanvas.
 */
export const CANVAS_SHOWN = `<script data-sl-shown>(function(){
var hold=document.createElement("style");hold.setAttribute("data-sl-hold","");hold.textContent="*,*::before,*::after{animation-play-state:paused!important}";(document.head||document.documentElement).appendChild(hold);
var sent=false,later=function(f,ms){return new Promise(function(r){setTimeout(r,ms)}).then(f)},frames=function(f){requestAnimationFrame(function(){requestAnimationFrame(function(){setTimeout(f,0)})})};
var seen=function(el){if(!el||!el.getBoundingClientRect)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight};
var post=function(){try{parent.postMessage({storelib:1,type:"loaded",scrollY:scrollY},"*")}catch(e){}};
var replayed=false;
var replay=function(){if(replayed)return;replayed=true;hold.remove();var all=document.getAnimations?document.getAnimations():[];all.forEach(function(a){try{var t=a.effect&&a.effect.getComputedTiming();if(!t||!isFinite(t.endTime)||t.endTime<=0||!seen(a.effect.target))return;if(a.playState==="running"||a.playState==="finished"){a.currentTime=0;a.play()}}catch(e){}})};
var quiet=0,quietEnd=0,quietY=null;
var fin=function(){(document.getAnimations?document.getAnimations():[]).forEach(function(a){try{var t=a.effect&&a.effect.getComputedTiming();if(a.playState==="running"&&t&&isFinite(t.endTime)&&seen(a.effect.target))a.finish()}catch(e){}})};
addEventListener("animationstart",function(e){if(!quiet||Date.now()>quietEnd||!e.target||!e.target.getAnimations)return;if(quietY!==null&&Math.abs(scrollY-quietY)>1)return;if(!seen(e.target))return;try{e.target.getAnimations().forEach(function(a){var t=a.effect&&a.effect.getComputedTiming();if(t&&isFinite(t.endTime))a.finish()})}catch(x){}},true);
var settle=function(){if(!replayed){replayed=true;hold.remove()}quiet=1;quietEnd=Date.now()+5000;quietY=null;fin();frames(fin)};
addEventListener("message",function(e){var m=e.data;if(!m||m.storelib!==1)return;if(m.type==="scroll"&&m.settle&&quiet)frames(function(){quietY=scrollY});if(m.type==="shown"){if(m.instant)settle();else if(quiet)frames(function(){fin();quiet=0});else replay()}});
setTimeout(function(){if(!replayed){replayed=true;hold.remove()}},12000);
var send=function(){if(sent)return;sent=true;var pics=Array.prototype.filter.call(document.images,function(i){return i.complete&&i.naturalWidth>0&&seen(i)});Promise.race([Promise.all(pics.map(function(i){return i.decode?i.decode().catch(function(){}):0})),later(null,300)]).then(function(){frames(function(){requestAnimationFrame(function(){requestAnimationFrame(post)})})})};
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
