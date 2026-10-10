/**
 * ===========================================================================
 *  NO WHITE FLASH BETWEEN A LIVE SITE'S PAGES
 * ===========================================================================
 * A Storelib website and an imported Shopify theme alike go from page to
 * page by loading the next page whole, as Shopify does. The next page is
 * already fetched while the pointer rests on its link
 * (lib/website-builder/prefetch-rules.ts); this is the other half, how the
 * change looks. A cross-document view transition keeps the page being left
 * on screen until the next one can be drawn, then the two cross-fade,
 * briefly: no white page between them, and the header and its logo do not
 * blink. Off for a visitor who has asked for less motion, and ignored by a
 * browser that does not have it, which loads pages as it always did.
 *
 * Live pages only: the builder's canvas draws one page and does not move.
 */
/*
  `:root::` and not `::`: the app's own stylesheet turns the root's fade off
  for its sliding layers (app/globals.css), and this sheet is only on a
  site's pages, so on a site the more particular rule wins and the pages
  cross-fade. plus-lighter adds the two pictures, so what is the same on
  both, the header and its logo, stays exactly as it was through the fade.
*/
export const VIEW_TRANSITION_CSS =
  "@keyframes sl-page-out{to{opacity:0}}@keyframes sl-page-in{from{opacity:0}}" +
  "@media (prefers-reduced-motion: no-preference){@view-transition{navigation:auto}" +
  ":root::view-transition-group(root){animation:none}" +
  ":root::view-transition-old(root){animation:sl-page-out 160ms ease both;mix-blend-mode:plus-lighter}" +
  ":root::view-transition-new(root){animation:sl-page-in 160ms ease both;mix-blend-mode:plus-lighter}" +
  /* The page arriving waits, under the page being left, until it has started (NAVIGATION_HEAD_SCRIPT). */
  ":root[data-sl-arriving]::view-transition-group(*),:root[data-sl-arriving]::view-transition-old(*),:root[data-sl-arriving]::view-transition-new(*){animation-play-state:paused}" +
  "::view-transition{pointer-events:none}}"

/** The element at the very end of a live page: the next page is shown once the browser has read up to it. */
export const PAGE_END_ID = "sl-page-end"

/*
  ═══════════════════════════════════════════════════════════════════════
   WHERE A TRANSITION IS WORSE THAN NONE, AND WHEN THE NEXT PAGE IS SHOWN
  ═══════════════════════════════════════════════════════════════════════
  Run in the page's <head>, before anything is drawn.

  OFF IN AN APP'S WEB VIEW AND ON A SLOW PHONE. Android's system WebView
  (Storelib's own Android app, and Instagram, Facebook and TikTok's in-app
  browsers) fails to paint during a cross-document transition: the page
  froze dimmed, or went white, between two pages. Shopify's own Horizon turns
  transitions off for exactly these (assets/view-transitions.js, June 2026),
  and for a phone with two cores or 2 GB, where the fade costs more than it
  hides. There the page loads as any page does.

  THE NEXT PAGE IS SHOWN WHEN IT HAS STARTED, NOT HALF WAY. The browser
  shows a new page at its first chance, before its scripts have run: its
  sections were drawn, then the theme's own start-up (an entrance animation
  armed on DOMContentLoaded, a slider laying its slides out) hid them or
  moved them and faded them back in. A flash, then a slow dim, on every
  click. So the arriving page is read to its end first (`rel=expect` on
  #sl-page-end, as Horizon does for its #MainContent), and its fade in waits,
  paused, with the page being left on screen, until its DOMContentLoaded
  has run. Then the two cross-fade and the theme's own entrance plays once,
  from the start, as it does on a first visit. Never longer than 1.2 seconds
  from the click, so a slow page still shows what it has; only when a
  transition runs (a link followed on this site, never a first visit or a
  reload).

  A PRESS DURING THE FADE ENDS IT, so a tap is never answered late.
*/
export const NAVIGATION_HEAD_SCRIPT = `(function(){try{
var ua=navigator.userAgent||"",d=document,root=d.documentElement,head=d.head||root;
var blocker=d.getElementById("sl-render-blocker");
var off=(/\\bAndroid\\b/i.test(ua)&&/;\\s?wv\\)/i.test(ua))||/\\b(FBAN|FBAV|FB_IAB|FBIOS|Instagram|musical_ly|Bytedance|BytedanceWebview|trill|TikTok)(?:\\b|_)/i.test(ua)||Number(navigator.hardwareConcurrency)<=2||Number(navigator.deviceMemory)<=2;
if(off){if(blocker)blocker.remove();var s=d.createElement("style");s.setAttribute("data-storelib-navigation-off","");s.textContent="@view-transition{navigation:none}";head.appendChild(s);return}
var act=window.navigation&&navigation.activation;
var can=!matchMedia("(prefers-reduced-motion: reduce)").matches&&!!act&&!!act.from&&act.navigationType!=="reload";
if(blocker){if(!can)blocker.remove();else setTimeout(function(){blocker.remove()},Math.max(0,1800-performance.now()))}
var started=false,waiting=null;
d.addEventListener("DOMContentLoaded",function(){setTimeout(function(){started=true;if(waiting)requestAnimationFrame(waiting)},0)});
addEventListener("pagereveal",function(e){var t=e.viewTransition;if(!t)return;
var skip=function(){try{t.skipTransition()}catch(x){}};["pointerdown","keydown"].forEach(function(n){d.addEventListener(n,skip,{once:true,capture:true})});
var go=function(){root.removeAttribute("data-sl-arriving")};
if(!started){root.setAttribute("data-sl-arriving","");waiting=go;setTimeout(go,Math.max(0,1200-performance.now()))}
t.finished.then(go,go)});
}catch(e){}})();`

/** As markup, for a page drawn as text (an imported theme's live page): in its <head>. */
export function liveNavigationMarkup(): string {
  return `<link rel="expect" href="#${PAGE_END_ID}" blocking="render" id="sl-render-blocker"><script data-storelib-navigation>${NAVIGATION_HEAD_SCRIPT}</script><style data-storelib-navigation>${VIEW_TRANSITION_CSS}</style>`
}

/** Last in the page's <body>: what the head's render blocker waits for. */
export function liveNavigationEnd(): string {
  return `<div id="${PAGE_END_ID}" hidden></div>`
}
