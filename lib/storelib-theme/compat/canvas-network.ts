/**
 * ===========================================================================
 *  WHEN A PAGE OF THE BUILDER'S CANVAS HAS PAINTED ITS FIRST SCREEN
 * ===========================================================================
 * Opening another page in the canvas waited for the frame's full load event
 * (every picture, every script) before it came forward, so a page switch sat
 * on the old page or showed a half-drawn new one. This script says "loaded"
 * once DOMContentLoaded has run, the fonts are in and the pictures on the
 * first screen have arrived, or 700ms after that at most.
 *
 * What the theme asks the shop for inside the canvas (sections, the cart,
 * recommendations) is answered by canvas-bridge.ts CANVAS_REQUESTS and
 * canvas-cart.ts answerInCanvas.
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
