/**
 * ===========================================================================
 *  A PAGE IN THE BROWSER THAT MAY BE FROM BEFORE A PUBLISH ASKS, AND RELOADS
 * ===========================================================================
 * The half of ./live-release.ts that runs in the visitor's browser, written
 * once as an inline script so a Storelib theme's page (app/(site)/w/
 * [username]/layout.tsx) and an imported theme's page (app/api/site-theme/
 * site) carry the same one.
 *
 * WHEN IT ASKS, which is only when the page on screen did not just come from
 * the server:
 *   - restored from the back and forward cache (`pageshow`, persisted): Back
 *     from Stripe or from the website's checkout;
 *   - loaded by Back or Forward (navigation type "back_forward"), which the
 *     browser serves from its own cache without asking the server, or loaded
 *     from that cache or from a page fetched ahead (deliveryType "cache",
 *     "navigational-prefetch"), or prerendered and then shown (an imported
 *     theme's desktop prerender, lib/storelib-theme/compat/prerender.ts);
 *   - the tab shown again after a while (`visibilitychange`): the owner
 *     publishing in the editor's tab and coming back to this one;
 *   - Back or Forward inside the page (`popstate`), and before a link opened
 *     in place (components/website-builder/site-links.tsx, through
 *     `window.__storelibRelease`), when the last answer is older than
 *     FRESH_MS: Next's router reuses pages it fetched ahead;
 *   - a page loaded from a copy drawn more than HELD_PAGE_MS ago, once,
 *     after it has loaded: a copy a Publish did not reach (an edge copy of
 *     the front page) is caught there.
 *
 * A page drawn for this very request never asks.
 *
 * WHAT IT DOES: the marker now differs from the page's, so the page is
 * loaded again (or, before a link, the link is opened as a whole page). A
 * failed or refused answer is "not known" and changes nothing. One reload
 * per change at most, remembered for the tab, so a page that cannot catch
 * up (a server serving its last good copy) is never reloaded in a loop.
 */

/** How old the last answer may be for a link opened in place to trust it. */
export const FRESH_MS = 15_000
/** How long a tab must have been hidden for showing it again to ask. */
export const SHOWN_AFTER_MS = 4_000
/**
 * A page drawn longer ago than this was served from a copy (the edge's, a
 * held stranger's page), which a Publish should have cleared: it asks once,
 * after it has loaded, in case a copy somewhere was not. A page drawn for
 * this request never asks.
 */
export const HELD_PAGE_MS = 10_000
/** How long a link waits for an answer before it opens anyway. */
export const LINK_WAIT_MS = 400

/** The address the page asks. Same origin: every host a website answers on passes /api through (proxy.ts). */
export const RELEASE_ENDPOINT = "/api/public/site-release"

/** What `window.__storelibRelease` offers a link handler. */
export interface ReleaseWatch {
  /** An answer already said what is live is not what this page was drawn from. */
  outdated(): boolean
  /** Whether the last answer is too old to trust for a navigation. */
  due(): boolean
  /** Asks now: true when what is live is not what this page was drawn from. */
  changed(): Promise<boolean>
}

const MARKER = /^[0-9a-f]{16}$/
const NAME = /^[a-z0-9_-]{1,64}$/i

/**
 * The inline script for a page drawn from `marker` of the website `name`, at
 * `drawnAt` (ms). Empty when either is not what the server writes, so
 * nothing typed into an address ends up inside a script.
 */
export function liveReleaseScript(name: string, marker: string, drawnAt: number = Date.now()): string {
  if (!NAME.test(name) || !MARKER.test(marker)) return ""
  const drawn = Number.isFinite(drawnAt) ? Math.floor(drawnAt) : 0
  const js = `(function(){try{
var mine=${JSON.stringify(marker)},url=${JSON.stringify(`${RELEASE_ENDPOINT}?name=${encodeURIComponent(name.toLowerCase())}`)},drawn=${drawn},last=Date.now(),hidden=0,busy=null,old=false;
function changed(){if(old)return Promise.resolve(true);if(busy)return busy;busy=fetch(url,{cache:"no-store",credentials:"omit"}).then(function(r){return r.ok?r.json():null}).then(function(j){last=Date.now();if(j&&typeof j==="object"&&"marker"in j&&j.marker!==mine)old=true;return old}).catch(function(){return false}).then(function(c){busy=null;return c});return busy}
function once(){var k="sl-release:"+mine;try{if(sessionStorage.getItem(k))return false;sessionStorage.setItem(k,"1")}catch(e){}return true}
function check(){changed().then(function(c){if(c&&once())location.reload()})}
window.__storelibRelease={outdated:function(){return old},due:function(){return Date.now()-last>${FRESH_MS}},changed:changed};
window.addEventListener("pageshow",function(e){if(e.persisted)check()});
var nav=performance.getEntriesByType&&performance.getEntriesByType("navigation")[0];if(document.prerendering)document.addEventListener("prerenderingchange",check,{once:true});else if(nav&&(nav.type==="back_forward"||nav.deliveryType==="cache"||nav.deliveryType==="navigational-prefetch"))check();
else if(Date.now()-drawn>${HELD_PAGE_MS}){var idle=function(){(window.requestIdleCallback||function(f){return setTimeout(f,1)})(check,{timeout:3000})};if(document.readyState==="complete")idle();else window.addEventListener("load",idle,{once:true})}
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden"){hidden=Date.now();return}if(hidden&&Date.now()-hidden>${SHOWN_AFTER_MS})check()});
window.addEventListener("popstate",function(){if(old||Date.now()-last>${FRESH_MS})check()});
}catch(e){}})();`
  return js
}

/**
 * For a link opened in place: whether to open it as a whole page instead,
 * because what is live changed. Answers within LINK_WAIT_MS or says no.
 */
export async function releaseChangedBeforeLink(watch: ReleaseWatch | undefined, waitMs = LINK_WAIT_MS): Promise<boolean> {
  if (!watch) return false
  if (watch.outdated()) return true
  if (!watch.due()) return false
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), waitMs)
  })
  try {
    return await Promise.race([watch.changed().catch(() => false), late])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A SWITCH BETWEEN A STORELIB THEME AND AN IMPORTED ONE
 * ═══════════════════════════════════════════════════════════════════════════
 * Which renderer draws a website is decided by the proxy, from an answer
 * each server keeps for a few seconds (proxy.ts compatSiteFor). Right after
 * a Publish that switches between a Storelib theme and an imported Shopify
 * one, a server still holding the old answer sends the visitor to the
 * renderer that cannot draw the new theme: an imported theme's handler said
 * "Not found", and a Storelib theme's routes drew a page with nothing on it.
 *
 * Whichever renderer sees it sends the visitor to the same address with
 * this in the query, and the proxy, seeing it, asks again before it routes
 * (at most once a second a name). Sent once: an address that already has it
 * is answered as it is, so nothing can loop.
 */
export const SITE_FRESH_PARAM = "sl_fresh"

/** The address with SITE_FRESH_PARAM added, or null when it already has it. `pathAndQuery` starts with "/". */
export function freshAddress(pathAndQuery: string): string | null {
  const u = new URL(pathAndQuery, "https://site.invalid")
  if (u.searchParams.has(SITE_FRESH_PARAM)) return null
  u.searchParams.set(SITE_FRESH_PARAM, "1")
  return `${u.pathname}${u.search}${u.hash}`
}

/**
 * The same, from a page in the browser: a Storelib theme's route that finds
 * the website's theme is an imported one. Never in a frame (the wishlist an
 * imported theme frames, ?sl_embed, is this route's on purpose) and never on
 * a preview, which is the creator's look at a theme that is not live.
 */
export const FRESH_REDIRECT_SCRIPT = `(function(){try{var u=new URL(location.href);if(window.top!==window.self||u.searchParams.has("sl_embed")||/(^|\\/)preview\\//.test(u.pathname)||u.searchParams.has(${JSON.stringify(SITE_FRESH_PARAM)}))return;u.searchParams.set(${JSON.stringify(SITE_FRESH_PARAM)},"1");location.replace(u.toString())}catch(e){}})();`
