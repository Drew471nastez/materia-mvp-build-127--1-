/**
 * ===========================================================================
 *  AN IMPORTED THEME'S SCRIPTS, IN THEIR ORDER, WITHOUT HOLDING UP THE PAGE
 * ===========================================================================
 * A theme script written as a plain `<script src>` stops the browser reading
 * the page until it has downloaded and run. Shopify's own themes write every
 * script `defer` (Dawn, Horizon), and theme scripts are written to run that
 * way: after the page is read, in their order, before DOMContentLoaded. An
 * older or hand made theme that still writes them blocking is given the same
 * here, on the finished markup of a live page opened as a document (the
 * route at app/api/site-theme/site, never a preview or the builder's
 * canvas), together with two things the big builders do:
 *
 * 1. BLOCKING SCRIPTS BECOME DEFERRED, IN THE SAME ORDER. From the first
 *    blocking external script on, every classic script after it joins the
 *    browser's deferred queue, which runs them one by one in document order:
 *    a blocking external one gets `defer`, and an inline one is given its own
 *    text as a `data:` address with `defer`, so jQuery and the inline script
 *    that calls `$(…)` under it still run in that order. What came before
 *    the first blocking script is left as written: it ran first before and
 *    still does. Already `defer`, `async` and `type="module"` scripts are
 *    left as they are, and so are JSON, templates and the like.
 *
 * 2. APP SCRIPTS START AFTER THE PAGE. A reviews widget, a chat bubble, a
 *    marketing popup or an analytics pixel the theme writes `async`
 *    (LATER_HOSTS) is started once the page has loaded and the browser is idle, or at the
 *    visitor's first tap or key, whichever is first, in its order. Never one
 *    a consent tool holds back (those are written `type="text/plain"` and are
 *    not scripts until the visitor agrees), never a consent tool itself, and
 *    never Storelib's own analytics and pixels: page views are counted as
 *    before.
 *
 * 3. THE SAME DEFERRED FILE ONCE (round 48). A theme that writes a section's
 *    script inside the section (or in its layout and again in the section)
 *    asks for the same `<script src defer>` once per copy: the owner's
 *    Materia home page runs product-offers.js (85KB) and hero-benefits.js
 *    twice each. The browser runs every copy, and a deferred copy runs after
 *    the page is read, as the first did, on the same page, so the second run
 *    only binds what the first already bound (or throws on
 *    `customElements.define`). A later copy whose opening tag is the same as
 *    an earlier deferred one's, with nothing between its tags, is dropped.
 *    A blocking or async copy, or one with any attribute of its own, stays.
 *
 * WHEN NOTHING IS CHANGED, so a theme that depends on the old timing keeps it:
 *   - the theme says so: `<html data-storelib-scripts="as-written">` or
 *     `<meta name="storelib-scripts" content="as-written">` in its layout
 *   - an inline script writes into the page while it is read
 *     (`document.write`): run late, it would wipe the page
 *   - an attribute handler that fires while the page is read (`onload`,
 *     `onerror` on a picture or a frame) calls a function a deferred script
 *     would only define later
 *   - a script inside an SVG, which the deferred queue cannot reach in order
 *   - a consent tool (CONSENT_HOSTS) after the first blocking script: it has
 *     to run before the scripts it guards, so nothing up to it moves
 *   - a script already `defer` (or a module) standing before the last one
 *     that would move: it ran after them, and in one queue it would not
 *
 * Text in, text out. Only `<script>` tags change; the page's markup, its
 * styles and every other element are exactly as they came.
 */
import { INERT, RAW_TEXT, attr, closeOf, pastInert, readTag } from "./first-load"

/** Written by a theme in its layout to keep its scripts exactly as written. */
export const SCRIPTS_AS_WRITTEN = "as-written"

/** The type a delayed app script is parked under until it starts. */
export const LATER_TYPE = "text/storelib-later"

/**
 * Third-party app scripts that draw or count after the page is up: reviews,
 * chat and help desks, marketing popups, heat maps, ad and social pixels.
 * Matched on the script's host (the host itself or any name under it).
 */
export const LATER_HOSTS = [
  /* reviews */
  "judge.me", "judgeme.imgix.net", "loox.io", "stamped.io", "yotpo.com", "okendo.io", "reviews.io", "trustpilot.com", "junip.co", "fera.ai",
  /* chat and help */
  "tidio.co", "tidiochat.com", "tawk.to", "crisp.chat", "intercom.io", "intercomcdn.com", "zdassets.com", "gorgias.chat", "livechatinc.com", "hs-scripts.com", "smartsupp.com", "chatra.io", "drift.com",
  /* marketing popups and email capture */
  "klaviyo.com", "privy.com", "omnisend.com", "justuno.com", "getsitecontrol.com", "wisepops.com", "optimonk.com",
  /* heat maps and session replay */
  "hotjar.com", "clarity.ms", "luckyorange.com", "mouseflow.com",
  /* ad and social pixels, analytics */
  "connect.facebook.net", "analytics.tiktok.com", "s.pinimg.com", "sc-static.net", "static.ads-twitter.com", "snap.licdn.com", "bat.bing.com", "googletagmanager.com", "google-analytics.com", "redditstatic.com",
] as const

/** Consent tools: they must run before what they guard, so they stay where they are and nothing up to them moves. */
export const CONSENT_HOSTS = ["cookiebot.com", "cookielaw.org", "onetrust.com", "usercentrics.eu", "iubenda.com", "termly.io", "cookieyes.com", "osano.com", "privacy-center.org", "didomi.io", "quantcast.com", "consentmanager.net", "cookie-script.com"] as const

/** Script types that are JavaScript the browser runs as a classic script. */
const CLASSIC = new Set(["", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript", "application/x-javascript", "text/jscript"])

const onHost = (host: string, list: readonly string[]) => list.some((h) => host === h || host.endsWith(`.${h}`))

/** The host of a script's address, or "" for one on the page's own site (a path). */
export function scriptHost(src: string): string {
  const s = src.trim()
  if (!/^(?:https?:)?\/\//i.test(s)) return ""
  try {
    return new URL(s.startsWith("//") ? `https:${s}` : s).hostname.toLowerCase()
  } catch {
    return ""
  }
}

/* Storelib's own scripts that depend on nothing the theme defines: they may run where they are. */
const OWN_STANDALONE = /\sdata-storelib-(?:head|track|tag|vitals|navigation|language-suggest|later|prerender|loading|release)\b/i

/*
  STILL BEING READ, AS FAR AS THE MOVED SCRIPTS CAN TELL. Each of them used
  to run while the page was read, when `document.readyState` said
  "loading"; run from the deferred queue it would say "interactive". A
  theme that asks (jQuery's `$(fn)`, `if (readyState === "loading")
  addEventListener("DOMContentLoaded", …) else init()`) would then start at
  once, before the scripts after it had run: measured in
  scripts/check-imported-scripts.ts, a ready callback ran ahead of the
  vendor script it needed. So the page keeps saying "loading" until
  DOMContentLoaded, as it did, and those callbacks wait for it, as they did.
  The browser's own value comes back first thing at DOMContentLoaded.
*/
export const STILL_LOADING = `(function(){var d=document;try{Object.defineProperty(d,"readyState",{configurable:true,get:function(){return"loading"}});d.addEventListener("DOMContentLoaded",function(){try{delete d.readyState}catch(e){}},{once:true,capture:true})}catch(e){}})();`

interface Found {
  start: number
  end: number
  /** The opening tag. */
  raw: string
  /** What is between the tags. */
  text: string
}

export interface ScriptPlan {
  html: string
  /** Blocking external scripts given `defer`. */
  deferred: number
  /** Inline scripts put in the deferred queue, in their place. */
  queued: number
  /** App scripts started after the page. */
  later: number
  /** Later copies of a deferred script already on the page, dropped (3. above). */
  dropped: number
  /** Why the page's blocking scripts were left as written, when they were. */
  asWritten: "flag" | "document.write" | "handler" | "svg" | "consent" | "order" | null
}

/** A handler attribute that fires while the page is read and calls a bare function (not `this.…`, `event.…`). */
const EARLY_HANDLER = /<(?:img|iframe|image|video|audio|source|object|embed|body|link)\b[^>]*\son(?:load|error)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
const CALLS_GLOBAL = /(?:^|[^.\w$])(?!(?:this|event|window|document|console|if|return|typeof|void|new|function)\b)([A-Za-z_$][\w$]*)\s*\(/

/** Every `<script>` that runs, in document order, with whether one sits inside an SVG. Inert places (template, noscript) are skipped. */
function scriptsOf(html: string): { scripts: Found[]; inSvg: boolean } {
  const scripts: Found[] = []
  let inSvg = false
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf("<", i)
    if (lt < 0) break
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4)
      i = end < 0 ? html.length : end + 3
      continue
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt)
      i = end < 0 ? html.length : end + 1
      continue
    }
    const tag = readTag(html, lt)
    if (!tag) {
      i = lt + 1
      continue
    }
    i = tag.end
    if (tag.closing) continue
    const selfClosed = /\/\s*>$/.test(tag.raw)
    if (INERT.has(tag.name)) {
      if (selfClosed) continue
      const end = pastInert(html, tag.name, tag.end)
      if ((tag.name === "svg" || tag.name === "math") && /<script\b/i.test(html.slice(tag.end, end))) inSvg = true
      i = end
      continue
    }
    if (tag.name === "script") {
      const end = closeOf(html, "script", tag.end)
      const close = html.slice(tag.end, end).search(/<\/script\s*>$/i)
      scripts.push({ start: tag.start, end, raw: tag.raw, text: close < 0 ? html.slice(tag.end, end) : html.slice(tag.end, tag.end + close) })
      i = end
      continue
    }
    if (RAW_TEXT.has(tag.name) && !selfClosed) i = closeOf(html, tag.name, tag.end)
  }
  return { scripts, inSvg }
}

type Kind = "data" | "module" | "inline" | "blocking" | "deferred" | "async"

function kindOf(s: Found): Kind {
  const type = (attr(s.raw, "type") ?? "").trim().toLowerCase().split(";")[0].trim()
  if (type === "module") return "module"
  if (!CLASSIC.has(type)) return "data"
  if (attr(s.raw, "nomodule") !== null) return "data"
  const src = attr(s.raw, "src")
  if (src === null) return "inline"
  if (attr(s.raw, "async") !== null) return "async"
  if (attr(s.raw, "defer") !== null) return "deferred"
  return "blocking"
}

/** UTF-8 text as base64, the same on the server and in a test. */
const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64")

/** An opening tag with attributes added before its `>`. */
const withAttrs = (raw: string, extra: string) => raw.replace(/\s*\/?\s*>$/, `${extra}>`)

/** An opening tag without the named attributes. */
function withoutAttrs(raw: string, names: string[]): string {
  let out = raw
  for (const n of names) out = out.replace(new RegExp(`\\s${n}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+))?(?=[\\s/>])`, "ig"), "")
  return out
}

/* An attribute's text as the page wrote it is already escaped; only a quote could end the new double quoted one. */
const escapeAttr = (v: string) => v.replace(/"/g, "&quot;")

/*
  THE STARTER FOR APP SCRIPTS: once the page has loaded and the browser is
  idle, or at the visitor's first tap or key. Each parked script becomes a
  real one in its place, in the page's order. A page drawn ahead of a
  click (./prerender.ts) starts them only once it is shown.
*/
export const LATER_STARTER = `(function(){var w=window,d=document,on=0,ev=["pointerdown","keydown","touchstart"];function go(){if(on)return;on=1;ev.forEach(function(n){w.removeEventListener(n,go,true)});var l=d.querySelectorAll('script[type="${LATER_TYPE}"]');for(var i=0;i<l.length;i++){var o=l[i],n=d.createElement("script");for(var j=0;j<o.attributes.length;j++){var a=o.attributes[j];if(a.name!=="type"&&a.name.indexOf("data-storelib-later")!==0)n.setAttribute(a.name,a.value)}var t=o.getAttribute("data-storelib-later-type");if(t)n.type=t;n.async=o.hasAttribute("async");if(o.textContent)n.textContent=o.textContent;n.src=o.getAttribute("data-storelib-later-src");o.parentNode.replaceChild(n,o)}}ev.forEach(function(n){w.addEventListener(n,go,{capture:true,passive:true})});function idle(){if(d.prerendering){d.addEventListener("prerenderingchange",idle,{once:true});return}(w.requestIdleCallback||function(f){return setTimeout(f,1)})(go,{timeout:3000})}if(d.readyState==="complete")idle();else w.addEventListener("load",idle,{once:true})})();`

/** Whether the theme asked for its scripts as written. */
export function themeKeepsScripts(html: string): boolean {
  const head = html.slice(0, Math.max(0, html.search(/<body\b/i)) || html.length)
  return /<html\b[^>]*\sdata-storelib-scripts\s*=\s*["']?as-written/i.test(head) || /<meta\b[^>]*name\s*=\s*["']storelib-scripts["'][^>]*content\s*=\s*["']as-written/i.test(head)
}

/** The live page with its blocking scripts deferred in order and its app scripts started after load. */
export function calmerScripts(html: string): ScriptPlan {
  const none = (why: ScriptPlan["asWritten"]): ScriptPlan => ({ html, deferred: 0, queued: 0, later: 0, dropped: 0, asWritten: why })
  if (!/<\/body>/i.test(html)) return none(null)
  const { scripts, inSvg } = scriptsOf(html)
  const kinds = scripts.map(kindOf)

  /*
    App scripts to start later: theme written, from a listed host, never a
    consent tool, and only one already `async`. An async script has nothing
    waiting on it by its place in the page; a blocking or deferred one may
    have the script under it calling it, so it keeps its turn (and is
    deferred with the rest below).
  */
  const laterAt = new Set<number>()
  scripts.forEach((s, i) => {
    if (kinds[i] !== "async" || OWN_STANDALONE.test(s.raw)) return
    const host = scriptHost(attr(s.raw, "src") ?? "")
    if (host && onHost(host, LATER_HOSTS) && !onHost(host, CONSENT_HOSTS)) laterAt.add(i)
  })

  /*
    Where deferring may begin: the first blocking external script that is
    not parked and comes after the last consent tool. A consent tool runs
    before what it guards, so it never moves, and neither does a script
    before it (moving that one would move the tool too).
  */
  let from = -1
  let why: ScriptPlan["asWritten"] = null
  const consentAt = (i: number) => kinds[i] !== "data" && onHost(scriptHost(attr(scripts[i].raw, "src") ?? ""), CONSENT_HOSTS)
  const blocking = (k: Kind, i: number) => k === "blocking" && !laterAt.has(i) && !consentAt(i)
  if (kinds.some(blocking)) {
    let barrier = -1
    kinds.forEach((_, i) => {
      if (consentAt(i)) barrier = i
    })
    if (themeKeepsScripts(html)) why = "flag"
    else if (scripts.some((s, i) => kinds[i] === "inline" && /\bdocument\s*\.\s*write(?:ln)?\s*\(/.test(s.text))) why = "document.write"
    else if (inSvg) why = "svg"
    else if ([...html.matchAll(EARLY_HANDLER)].some((m) => CALLS_GLOBAL.test(m[1] ?? m[2] ?? ""))) why = "handler"
    else {
      from = kinds.findIndex((k, i) => i > barrier && blocking(k, i))
      if (from < 0) why = "consent"
    }
  }
  /*
    THE ORDER HOLDS ONLY IF NOTHING ALREADY DEFERRED COMES BEFORE THE LAST
    SCRIPT MOVED. A `defer` or module script ran after every script the
    parser met; put in the same queue as a script that used to run while the
    page was read, it would run before it if it stands earlier in the page.
    Then everything is left as written.
  */
  const moves = (k: Kind, i: number) => !laterAt.has(i) && (k === "blocking" || (k === "inline" && !OWN_STANDALONE.test(scripts[i].raw) && /\S/.test(scripts[i].text)))
  if (from >= 0) {
    let last = -1
    kinds.forEach((k, i) => {
      if (i >= from && moves(k, i)) last = i
    })
    if (kinds.some((k, i) => (k === "deferred" || k === "module") && i < last && !laterAt.has(i))) {
      why = "order"
      from = -1
    }
  }

  /* A later copy of a deferred script: the same opening tag, nothing between its tags. Not when the theme keeps its scripts as written. */
  const dropAt = new Set<number>()
  if (why !== "flag" && !themeKeepsScripts(html)) {
    const seen = new Set<string>()
    scripts.forEach((s, i) => {
      if (kinds[i] !== "deferred" || /\S/.test(s.text) || OWN_STANDALONE.test(s.raw)) return
      const key = sameTag(s.raw)
      if (seen.has(key)) dropAt.add(i)
      else seen.add(key)
    })
  }

  const out: string[] = []
  let copied = 0
  let deferred = 0
  let queued = 0
  scripts.forEach((s, i) => {
    let tag: string | null = null
    if (dropAt.has(i)) {
      tag = ""
    } else if (laterAt.has(i)) {
      const src = attr(s.raw, "src") ?? ""
      const type = attr(s.raw, "type")
      const parked = withoutAttrs(s.raw, ["src", "type"])
      tag = `${withAttrs(parked, ` type="${LATER_TYPE}" data-storelib-later-src="${escapeAttr(src)}"${type && type.trim().toLowerCase() === "module" ? ` data-storelib-later-type="module"` : ""}`)}</script>`
    } else if (from >= 0 && i >= from) {
      if (!moves(kinds[i], i)) return
      /* Once, just before the first script that moves: the page still says it is being read (STILL_LOADING). */
      const first = deferred + queued === 0 ? `<script data-storelib-loading>${STILL_LOADING}</script>` : ""
      if (kinds[i] === "blocking") {
        tag = `${first}${withAttrs(s.raw, " defer")}${s.text}</script>`
        deferred++
      } else {
        tag = `${first}${withAttrs(withoutAttrs(s.raw, ["defer", "async"]), ` defer src="data:text/javascript;charset=utf-8;base64,${base64(s.text)}"`)}</script>`
        queued++
      }
    }
    if (tag === null) return
    out.push(html.slice(copied, s.start), tag)
    copied = s.end
  })
  if (!out.length) return none(why)
  out.push(html.slice(copied))
  let result = out.join("")
  if (laterAt.size) {
    const at = result.search(/<\/body>(?![\s\S]*<\/body>)/i)
    result = `${result.slice(0, at)}<script data-storelib-later>${LATER_STARTER}</script>${result.slice(at)}`
  }
  return { html: result, deferred, queued, later: laterAt.size, dropped: dropAt.size, asWritten: why }
}

/** An opening script tag compared as the browser reads it: spacing and `defer="defer"` against `defer` aside. */
function sameTag(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\sdefer(?:\s*=\s*(?:"defer"|'defer'|defer|""|''))?(?=[\s/>])/i, " defer")
    .replace(/\s*\/?\s*>$/, ">")
}

/**
 * Whether a page runs scripts from anyone but the site and Storelib: an
 * external script on another host, a parked app script, the store's own
 * analytics or pixels Storelib adds (data-storelib-tag), or an inline script
 * that writes a script element from another host. Such a page is only ever
 * fetched ahead, never prerendered (./prerender.ts).
 */
export function runsThirdPartyScripts(html: string): boolean {
  const { scripts } = scriptsOf(html)
  return scripts.some((s) => {
    const kind = kindOf(s)
    if (kind === "data") return attr(s.raw, "type")?.trim().toLowerCase() === LATER_TYPE
    if (/\sdata-storelib-tag\b/i.test(s.raw)) return true
    if (kind === "inline") return /createElement\(\s*["']script["']\s*\)/.test(s.text) && /["'`](?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(s.text) && !OWN_STANDALONE.test(s.raw)
    return scriptHost(attr(s.raw, "src") ?? "") !== ""
  })
}
