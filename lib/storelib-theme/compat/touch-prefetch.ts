/**
 * ===========================================================================
 *  ON A PHONE, THE PAGE BEHIND A LINK IN VIEW IS FETCHED BEFORE THE TAP
 * ===========================================================================
 * An imported theme's live page asks the browser to fetch a link's page when
 * a pointer rests on it or presses it (lib/website-builder/prefetch-rules.ts,
 * "moderate"), and on a desktop to draw it (./prerender.ts). A phone has no
 * resting pointer: the fetch starts at the touch, a few tens of milliseconds
 * before the tap opens the page, so every page a visitor moved to on a phone
 * was asked of the server from nothing (round BC, measured on the owner's
 * live site: about 1.4 to 1.9 seconds from the tap to the next page's first
 * paint, on a 10 Mbps phone).
 *
 * A Storelib theme's page already fetches the links a touch screen shows
 * (components/website-builder: links in view are fetched whole there). This
 * is the same for an imported theme, with the same care:
 *
 *   - a touch screen only (no hover), Chrome and Edge (Speculation Rules);
 *     not with Data Saver on, nor on a connection slower than 4G
 *   - a link that has been in view, at least half of it and visible (not a
 *     closed popup's button), for a second: what the visitor is looking at,
 *     not everything they scroll past
 *   - at most three pages for each page opened, each address once
 *   - started after the page has loaded and settled, so it never competes
 *     with the page itself
 *   - prefetch only: the page's markup is downloaded, nothing on it runs,
 *     no analytics counts it. The same addresses as the hover rule: this
 *     website's own pages, never the cart, checkout, account or the API, a
 *     link marked nofollow, one opening a new tab or one with
 *     `data-no-prefetch`.
 */

/** The most pages fetched ahead for one page opened. */
export const TOUCH_PREFETCH_MAX = 3
/** How long a link must stay in view before its page is fetched, in ms. */
export const TOUCH_PREFETCH_DWELL_MS = 1000

export const TOUCH_PREFETCH_STARTER = `(function(){try{var d=document,n=navigator,c=n.connection;if(!window.HTMLScriptElement||!HTMLScriptElement.supports||!HTMLScriptElement.supports("speculationrules")||!window.IntersectionObserver)return;if(!matchMedia("(hover: none)").matches)return;if(c&&(c.saveData||(c.effectiveType&&c.effectiveType!=="4g")))return;var MAX=${TOUCH_PREFETCH_MAX},WAIT=${TOUCH_PREFETCH_DWELL_MS},done={},count=0,timers=new Map(),io,skip=/^\\/(?:cart|checkout|account|api)(?:\\/|$)/;function target(a){if(!a.href||a.target==="_blank"||a.hasAttribute("download")||a.matches("[rel~=nofollow],[data-no-prefetch]"))return null;var u;try{u=new URL(a.href,location.href)}catch(e){return null}if(u.origin!==location.origin||skip.test(u.pathname)||u.pathname===location.pathname)return null;return u.pathname+u.search}function seen(a){return !a.checkVisibility||a.checkVisibility({opacityProperty:true,visibilityProperty:true})}function fetchAhead(k){if(done[k]||count>=MAX)return;done[k]=1;count++;var s=d.createElement("script");s.type="speculationrules";s.textContent=JSON.stringify({prefetch:[{source:"list",urls:[k]}]});d.head.appendChild(s);if(count>=MAX&&io)io.disconnect()}io=new IntersectionObserver(function(es){es.forEach(function(e){var a=e.target;if(e.isIntersecting){if(!timers.has(a))timers.set(a,setTimeout(function(){timers.delete(a);var k=target(a);if(k&&seen(a))fetchAhead(k)},WAIT))}else{clearTimeout(timers.get(a));timers.delete(a)}})},{threshold:0.5});var start=function(){d.querySelectorAll("a[href]").forEach(function(a){if(target(a))io.observe(a)})};var later=function(){setTimeout(function(){(window.requestIdleCallback||setTimeout)(start)},1500)};if(d.readyState==="complete")later();else addEventListener("load",later,{once:true})}catch(e){}})();`

/**
 * THE NEXT PAGE DRAWN AHEAD ON A PHONE, round 52. Prefetch saves the
 * download, but an imported theme's page still runs its whole start up when
 * it is opened: measured on the owner's Materia (scripts/check-site-speed-r52.mjs,
 * a phone with a 4x slower CPU on 4G), 3.6 s from the tap to the next page
 * drawn, nearly all of it the theme's own scripts. Prerendered, the page has
 * run them before the tap.
 *
 * The same starter, with the same care (a touch screen, 4G, no Data Saver,
 * after load, the same addresses), plus:
 *   - only a page whose markup runs nobody else's script (the route asks
 *     ./script-order.ts runsThirdPartyScripts, as for the desktop's
 *     ./prerender.ts), so no pixel or widget counts a page nobody opened;
 *   - only a phone with 4 GB and 4 cores or more (navigator.deviceMemory,
 *     hardwareConcurrency; a phone that does not say counts as one);
 *   - at most TOUCH_PRERENDER_MAX pages: the first link looked at for a
 *     second, and a link a finger lands on, which is drawn from the touch,
 *     before the tap ends. The others in view are only fetched.
 * Chrome and Edge on Android; Safari has no Speculation Rules and is as before.
 */
export const TOUCH_PRERENDER_MAX = 2
export const TOUCH_PRERENDER_STARTER = `(function(){try{var d=document,n=navigator,c=n.connection;if(!window.HTMLScriptElement||!HTMLScriptElement.supports||!HTMLScriptElement.supports("speculationrules")||!window.IntersectionObserver)return;if(!matchMedia("(hover: none)").matches)return;if(c&&(c.saveData||(c.effectiveType&&c.effectiveType!=="4g")))return;var MAX=${TOUCH_PREFETCH_MAX},DRAW=${TOUCH_PRERENDER_MAX},WAIT=${TOUCH_PREFETCH_DWELL_MS},done={},count=0,timers=new Map(),io,skip=/^\\/(?:cart|checkout|account|api)(?:\\/|$)/;function target(a){if(!a.href||a.target==="_blank"||a.hasAttribute("download")||a.matches("[rel~=nofollow],[data-no-prefetch]"))return null;var u;try{u=new URL(a.href,location.href)}catch(e){return null}if(u.origin!==location.origin||skip.test(u.pathname)||u.pathname===location.pathname)return null;return u.pathname+u.search}function seen(a){return !a.checkVisibility||a.checkVisibility({opacityProperty:true,visibilityProperty:true})}var drawn={},drawnCount=0,able=(n.deviceMemory||4)>=4&&(n.hardwareConcurrency||4)>=4;function drawAhead(k){if(!able||drawn[k]||drawnCount>=DRAW)return false;drawn[k]=1;drawnCount++;done[k]=1;var s=d.createElement("script");s.type="speculationrules";s.textContent=JSON.stringify({prerender:[{source:"list",urls:[k]}]});d.head.appendChild(s);return true}function fetchAhead(k){if(done[k]||count>=MAX)return;if(drawAhead(k)){count++;return}done[k]=1;count++;var s=d.createElement("script");s.type="speculationrules";s.textContent=JSON.stringify({prefetch:[{source:"list",urls:[k]}]});d.head.appendChild(s);if(count>=MAX&&io)io.disconnect()}d.addEventListener("touchstart",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");var k=a&&target(a);if(k)drawAhead(k)},{passive:true,capture:true});io=new IntersectionObserver(function(es){es.forEach(function(e){var a=e.target;if(e.isIntersecting){if(!timers.has(a))timers.set(a,setTimeout(function(){timers.delete(a);var k=target(a);if(k&&seen(a))fetchAhead(k)},WAIT))}else{clearTimeout(timers.get(a));timers.delete(a)}})},{threshold:0.5});var start=function(){d.querySelectorAll("a[href]").forEach(function(a){if(target(a))io.observe(a)})};var later=function(){setTimeout(function(){(window.requestIdleCallback||setTimeout)(start)},1500)};if(d.readyState==="complete")later();else addEventListener("load",later,{once:true})}catch(e){}})();`

/** The page with the touch prefetch, put just before its last `</body>`. */
export function withTouchPrefetch(html: string, opts: { prerender?: boolean } = {}): string {
  const at = html.search(/<\/body>(?![\s\S]*<\/body>)/i)
  if (at < 0 || html.includes("data-storelib-touch-prefetch")) return html
  return `${html.slice(0, at)}<script data-storelib-touch-prefetch>${opts.prerender ? TOUCH_PRERENDER_STARTER : TOUCH_PREFETCH_STARTER}</script>${html.slice(at)}`
}
