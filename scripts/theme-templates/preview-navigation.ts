/**
 * ===========================================================================
 *  THE PREVIEW NEVER LEAVES ITS WEBSITE ("storelib.com refused to connect")
 * ===========================================================================
 * A template's live preview is static files under /theme-previews/<slug>/
 * (scripts/build-template-previews.ts), framed by the marketplace's Preview
 * and the theme's page. Those files may be framed by storelib.com; every
 * other address on storelib.com is sent with X-Frame-Options: DENY. So a
 * frame that goes to any address outside its website shows the browser's
 * own error, "storelib.com refused to connect".
 *
 * The build makes every link to a page it wrote point at that page and the
 * rest inert, but the theme's scripts open addresses of their own (measured
 * in the built files, round 28):
 *
 *   main-product     window.location.href = "/checkout" after an add
 *   product-offers   window.location.assign(root + "checkout"), the cart
 *   theme            the wishlist's "/pages/wishlist", "/pages/compare",
 *                    the language picker's location.assign(root + path)
 *   collection       location.assign(url) when a filter's request fails
 *   r7 media         location.assign(tile.href)
 *   a template's own inline scripts, location.assign(g)
 *
 * and a frame with no origin (the sandbox) is told of no navigation it
 * starts: the Navigation API's events are off for an opaque origin, and
 * Location cannot be wrapped. So the preview's copies of those scripts are
 * rewritten here: every `location.href =`, `window.location =`,
 * `location.assign(` and `location.replace(` goes through the shim's
 * __slLoc / __slGo instead, which opens the website's own page for an
 * address it has (the cart with its contents, a collection, the wishlist),
 * hands it to the marketplace's frames when they take pages over, and for
 * anything else (checkout, an account, another site) shows the preview note
 * and stays where it is. A link a script makes after the page was written
 * is held the same way when it is pressed.
 *
 * Only the preview's files are rewritten: no live website, no installed
 * theme and no engine file changes (template brief 27).
 */
import { transformSync } from "esbuild"

/* Only `window.` or `self.` in front, or nothing: `iframe.contentWindow.location.assign(...)` is somebody else's window. */
const BEFORE = String.raw`(?<![\w$.])((?:window|self)\.)?`
const ASSIGN_CALL = new RegExp(`${BEFORE}location\\.(assign|replace)\\(`, "g")
const HREF_SET = new RegExp(`${BEFORE}location\\.href\\s*=(?![=>])`, "g")
/* A bare `location = x` is left alone: a local variable may carry that name. */
const WINDOW_SET = /(?<![\w$.])((?:window|self)\.)location\s*=(?![=>])/g

function parses(js: string): boolean {
  try {
    transformSync(js, { loader: "js", logLevel: "silent" })
    return true
  } catch {
    return false
  }
}

/** A script with every page it opens sent through the preview's shim. Unchanged when nothing matched, or when the rewrite would not parse. */
export function keepNavigationInPreview(js: string): string {
  if (!/location/.test(js)) return js
  /* A script with a `location` of its own (a variable, a parameter) keeps its bare uses: only `window.location` is surely the page's. */
  const own = /\b(?:const|let|var)\s+location\b|\(\s*location\s*[,)]|,\s*location\s*[,)]/.test(js)
  const out = js
    .replace(ASSIGN_CALL, (m, pre: string | undefined, how: string) => (!pre && own ? m : `${pre ?? ""}__slGo("${how}",`))
    .replace(HREF_SET, (m, pre: string | undefined) => (!pre && own ? m : `${pre ?? ""}__slLoc.href=`))
    .replace(WINDOW_SET, (_m, pre: string) => `${pre}__slLoc.href=`)
  if (out === js) return js
  return parses(out) || !parses(js) ? out : js
}

/** The scripts in a page's markup, each rewritten; JSON, import maps, templates and the shim are left as they are. */
export function keepPageNavigationInPreview(markup: string): string {
  return markup.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs: string, body: string) => {
    if (!body.trim() || /\bsrc=|data-template-preview/i.test(attrs)) return m
    const type = /\btype=["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase()
    if (type && type !== "text/javascript" && type !== "module" && type !== "application/javascript") return m
    const out = keepNavigationInPreview(body)
    return out === body ? m : `<script${attrs}>${out}</script>`
  })
}

/**
 * The shim's half (inside its function, after ROOT; SLUG, carry, showNote,
 * HAND and handoff are its own and hoisted). PAGES is the website's pages, as
 * the paths a store would answer ("/", "/cart", "/collections/all").
 */
export const PREVIEW_NAVIGATION_SHIM = (pages: string[]) => `var PAGES=${JSON.stringify(pages)};
function siteOf(){return ROOT+SLUG+"/"}
function pageFor(x){var p=x.pathname.replace(/\\/+$/,"")||"/";if(p.indexOf(ROOT)===0)return p.indexOf(siteOf())===0?x.pathname+x.search+x.hash:null;p=p.replace(/^\\/collections\\/[^/]+(?=\\/products\\/)/,"");if(PAGES.indexOf(p)<0)return null;return siteOf()+(p==="/"?"index":p.slice(1))+".html"+x.search+x.hash}
function goTo(how,u,from){var x;try{x=new URL(String(u),location.href)}catch(e){return}
if(/^(javascript|mailto|tel|sms):$/i.test(x.protocol))return;
var to=x.host===location.host?pageFor(x):null;
if(!to){showNote(from||null);return}
if(x.pathname.replace(/\\/+$/,"")==="/cart"||/\\/cart[.]html$/.test(x.pathname))to=carry(to);
var y=new URL(to,location.href);if(y.pathname===location.pathname&&y.search===location.search){if(y.hash!==location.hash)location.hash=y.hash;return}
if(HAND&&how!=="replace"&&handoff(y.pathname+y.search+y.hash))return;
how==="replace"?location.replace(y.href):location.assign(y.href)}
W.__slGo=function(how,u){goTo(how,u)};
W.__slLoc={get href(){return location.href},set href(u){goTo("assign",u)},toString:function(){return location.href}};
/* A link a script made after the page was written: pressed, it opens the website's own page or stays. */
D.addEventListener("click",function(e){if(e.defaultPrevented||e.button!==0)return;var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a||a.hasAttribute("download")||a.hasAttribute("data-preview-inert"))return;var h=(a.getAttribute("href")||"").trim();if(!h||h.charAt(0)==="#"||/^(javascript|mailto|tel|sms|data):/i.test(h))return;var x;try{x=new URL(a.href)}catch(_){return}if(x.host===location.host&&x.pathname.indexOf(siteOf())===0)return;e.preventDefault();goTo("assign",a.href,a)},true);
`

/**
 * THE NEXT PAGE, STARTED BEFORE THE PRESS (round 28). Each page of the
 * preview is a document with no origin, and Chromium keeps no file for such
 * a frame: every page asks again for its stylesheets, scripts and fonts
 * (scripts/check-template-preview-speed.mjs measures it). The wait cannot be
 * made shorter from in here, so it is started earlier: once the marketplace
 * takes pages over (HAND), a pointer resting on a link of the website for
 * PREVIEW_INTENT_MS, or a finger touching it, tells the marketplace which
 * page is likely next, and it draws that page in a hidden frame
 * (theme-preview.tsx, LiveSite). The press then shows a page that is already
 * there, or nearly.
 */
export const PREVIEW_INTENT_MS = 80
export const PREVIEW_INTENT_SHIM = `var IT=0,ITH="";function intent(a){if(!a||a.hasAttribute("download"))return;var to=nextPage(a.href);if(!to||to===ITH)return;ITH=to;try{parent.postMessage({type:"storelib:template-preview-intent",href:to},"*")}catch(e){}}
D.addEventListener("pointerover",function(e){if(!HAND||e.pointerType==="touch")return;var a=e.target&&e.target.closest&&e.target.closest("a[href]");clearTimeout(IT);if(a)IT=setTimeout(function(){intent(a)},${PREVIEW_INTENT_MS})},{passive:true});
D.addEventListener("touchstart",function(e){if(!HAND)return;intent(e.target&&e.target.closest&&e.target.closest("a[href]"))},{passive:true});
`
