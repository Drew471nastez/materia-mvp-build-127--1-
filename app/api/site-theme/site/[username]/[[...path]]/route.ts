/**
 * ===========================================================================
 *  A WEBSITE WHOSE THEME WAS IMPORTED FROM SHOPIFY
 * ===========================================================================
 * The proxy rewrites every address of such a site here (proxy.ts,
 * compatSiteFor): its pages, its cart, the section rendering API its scripts
 * call. What each address answers is lib/storelib-theme/compat/site.ts; this
 * reads the request and writes the answer, the cart cookie included.
 *
 * `/preview/<token>/…` is the site with its unpublished changes, for the
 * person holding the install's preview link.
 */
import { NextRequest, NextResponse } from "next/server"
import { localizeCompatSite } from "@/lib/markets/compat"
import { SITE_COUNTRY_HEADER, SITE_LOCALE_HEADER, SITE_MARKET_HEADER, siteVisitorCountry } from "@/lib/markets/site-name"
import { countryCookieIn, seenCountry } from "@/lib/markets/visitor-country"
import { localeRoot } from "@/lib/storelib-theme/compat/objects"
import { compatSiteByName } from "@/lib/website-builder/compat-site"
import { isSiteReadError } from "@/lib/website-builder/site-read"
import { CART_COOKIE, accountFormPost, answer, readCartCookie, writeCartCookie } from "@/lib/storelib-theme/compat/site"
import { siteAccountOf } from "@/lib/site-accounts/theme-visitor"
import { compatCartPricing } from "@/lib/storelib-theme/compat/cart-pricing-server"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { hostOf } from "@/lib/site-accounts/session"
import { sameOriginForm } from "@/lib/site-accounts/respond"
import { POST as sendSignInCode } from "@/app/api/site-account/code/route"
import { POST as subscribeRoute } from "@/app/api/website-builder/subscribe/route"
import { POST as contactRoute } from "@/app/api/website-builder/contact/route"
import { previewTokenFrom } from "@/lib/website-builder/preview-link"
import { SITE_SEAL_HEADER, siteHostOf, siteSealed } from "@/lib/storelib-theme/compat/site-seal"
import { formFields } from "@/lib/storelib-theme/compat/form-fields"
import { timed } from "@/lib/perf/server-timing"
import { publishedTracking } from "@/lib/store/tracking-server"
import { readTracking } from "@/lib/store/tracking"
import { gaProductFor } from "@/lib/store/ga-server"
import { compatPageTags, productIdForPath } from "@/lib/store/compat-page-tags"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { PUBLIC_PAGE_CACHE, SHAREABLE_HEADER, publicAnswer, readStrangerMarker } from "@/lib/storelib-theme/compat/anonymous-cache"
import { heldStrangerPage, strangerKey } from "@/lib/storelib-theme/compat/stranger-hold"
import { openedAsDocument, readierFirstLoad } from "@/lib/storelib-theme/compat/first-load"
import { calmerScripts, runsThirdPartyScripts } from "@/lib/storelib-theme/compat/script-order"
import { withDesktopPrerender } from "@/lib/storelib-theme/compat/prerender"
import { creatorByName, creatorShopTag, creatorSiteTag } from "@/lib/website-builder/published-site"
import { siteLanguages } from "@/lib/markets/live"

/** A promise started ahead of where it is awaited, never reported as unhandled when the answer leaves first. */
function quietly<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {})
  return p
}
import { liveSiteFor } from "@/lib/website-builder/live-release"
import { freshAddress, liveReleaseScript } from "@/lib/website-builder/live-release-script"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** A page that tries again by itself, for the moment the database is away and nothing was kept. */
const UNAVAILABLE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>One moment</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 Inter,system-ui,sans-serif;color:#1a1a2e;background:#f8f9fa}p{margin:0;color:#6b7280}</style></head><body><main><h1 style="font-size:20px;margin:0 0 6px">One moment</h1><p>This page will load again by itself.</p></main></body></html>`

interface Params {
  params: Promise<{ username: string; path?: string[] }>
}

/** A form or JSON body as fields. `items[0][id]` and `updates[]` are read the way Shopify reads them. */
async function bodyOf(req: Request): Promise<Record<string, unknown> | null> {
  if (req.method === "GET" || req.method === "HEAD") return null
  const type = req.headers.get("content-type") ?? ""
  try {
    if (type.includes("application/json")) {
      const v = await req.json()
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null
    }
    if (type.includes("form")) {
      return formFields((await req.formData()).entries())
    }
  } catch {
    return null
  }
  return null
}

/**
 * The same request, sent on to one of Storelib's own routes on this host:
 * its headers as the browser sent them (the Origin the route checks, the
 * address its rate limits count, the cookies), with a new body. So a theme's
 * form goes through exactly the checks a Storelib website's own form does.
 */
function onward(req: Request, path: string, body: FormData | string): NextRequest {
  const headers = new Headers(req.headers)
  headers.delete("content-length")
  if (typeof body === "string") headers.set("content-type", "application/json")
  else headers.delete("content-type")
  return new NextRequest(new URL(path, req.url), { method: "POST", headers, body })
}

/** The page a script's request came from, as a path on this site: only which of the site's own pages its sections are drawn about. */
function refererPath(referer: string | null): string | undefined {
  if (!referer) return undefined
  try {
    const u = new URL(referer)
    return `${u.pathname}${u.search}`
  } catch {
    return undefined
  }
}

async function handle(req: Request, { params }: Params): Promise<Response> {
  /*
    WHERE A DRAWN PAGE'S TIME WENT, said in Server-Timing (read, the site and
    its products; localize, its language and market; draw, the theme's
    Liquid; post, the page made ready for its first paint). A browser's
    network panel shows it, and so does a check from outside; it names no
    store data, only milliseconds.
  */
  const began = performance.now()
  const timing: string[] = []
  let lap = began
  const mark = (name: string) => {
    const now = performance.now()
    timing.push(`${name};dur=${Math.round(now - lap)}`)
    lap = now
  }
  const { username, path = [] } = await params
  const url = new URL(req.url)
  const host = siteHostOf(req.headers)
  /*
    ONLY WHAT THE PROXY SENT. Straight at /api/site-theme/site/<name>, on
    storelib.com or on another creator's host, a theme's scripts would run in
    an origin that is not its own website's: a 404, before anything is read.
  */
  if (!(await siteSealed(req.headers.get(SITE_SEAL_HEADER), username, host))) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })
  }

  let segments = path
  let token: string | null = null
  /*
    A STRANGER'S PAGE (lib/storelib-theme/compat/anonymous-cache.ts): the
    proxy marked it with the host, country, language and market it is drawn
    for. Drawn from those alone, with no cookie read, so the copy the CDN
    keeps at this address is the same for everybody sent to it.
  */
  const stranger = readStrangerMarker(segments[0])
  if (stranger) {
    /* Only as the proxy marks it: this host, and the language, market and country it named in its own headers. A path that merely looks like one is not a page. */
    const told = (name: string) => req.headers.get(name) || null
    if (stranger.host !== host || told(SITE_LOCALE_HEADER) !== stranger.locale || told(SITE_MARKET_HEADER) !== stranger.market || told(SITE_COUNTRY_HEADER) !== stranger.country) {
      return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })
    }
    segments = segments.slice(1)
  } else if (segments[0] === "preview" && segments[1]) {
    token = previewTokenFrom(new URLSearchParams([["preview", decodeURIComponent(segments[1])]]))
    segments = segments.slice(2)
  }
  /*
    The database not answering is not "no such site": a 503 that asks to be
    tried again in a moment, never cached, when there is no last good copy
    to serve (lib/website-builder/compat-site.ts).
  */
  /*
    ASKED BESIDE THE SITE, NOT AFTER IT: the website's languages (which the
    draw lays over it) and, for a page, the store's analytics tags. Each
    needs only the creator, and each was a round trip of its own after the
    whole site had been read. Not for a preview, which shows neither.
  */
  const creatorAsked = token ? null : quietly(creatorByName(username).catch(() => null))
  const languagesAsked = creatorAsked ? quietly(creatorAsked.then(async (c) => (c ? { creatorId: c.creatorId, value: await siteLanguages(c.creatorId) } : null))) : null
  const pageAsked = req.method === "GET" && !/\.(js|json)$/.test(segments[segments.length - 1] ?? "") && req.headers.get("x-requested-with") !== "XMLHttpRequest" && !(req.headers.get("accept") ?? "").includes("application/json")
  const trackingAsked = creatorAsked && pageAsked ? quietly(creatorAsked.then(async (c) => (c ? { creatorId: c.creatorId, value: await publishedTracking(createAdminClient(), c.creatorId).catch(() => null) } : null))) : null
  /* Each early answer only for the site that was found (the same name's creator; never a last good copy's other one). */
  const forSite = <T,>(asked: Promise<{ creatorId: string; value: T } | null> | null, creatorId: string): Promise<T | undefined> | undefined =>
    asked ? asked.then((a) => (a && a.creatorId === creatorId ? a.value : undefined)) : undefined
  let found: Awaited<ReturnType<typeof compatSiteByName>>
  try {
    found = await compatSiteByName(username, host, token)
    mark("read")
  } catch (e) {
    if (!isSiteReadError(e)) throw e
    console.error("[site-theme] site unavailable:", e.message)
    return new NextResponse(UNAVAILABLE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5" } })
  }
  if (found.kind !== "site") {
    /*
      A STORELIB THEME IS LIVE NOW, published over the imported one a moment
      ago, and this server's proxy routed by the answer from before
      (lib/website-builder/live-release-script.ts SITE_FRESH_PARAM): the
      same address again, once, for the proxy to ask afresh.
    */
    const again = token ? null : await switchedAway(req, username, segments)
    if (again) return new NextResponse(null, { status: 307, headers: { Location: again, "Cache-Control": "no-store" } })
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })
  }
  /*
    IN ANOTHER OF THE WEBSITE'S LANGUAGES: /fr/… on the website, sent here by
    the proxy with the language named in a header only it sets (the seal
    above proves the request came through it). The site is put in that
    language for this request alone (lib/markets/compat.ts). Never a preview.
  */
  const locale = token ? null : (req.headers.get(SITE_LOCALE_HEADER) || null)
  /* And in the visitor's market's currency, when their country is in one that shows its own (the proxy's visitorMarket). */
  const market = token ? null : (req.headers.get(SITE_MARKET_HEADER) || null)
  /*
    The visitor's country, for the theme's own country selector: the one
    the proxy names (they chose it, or it is where they are; a header only
    the proxy sets, like the language's), else the one they picked here
    (sl_country), else where they are. "home" (the store's own prices) is
    no country: the selector shows the store's own (themeCountries).
  */
  const visitorCountry = stranger
    ? siteVisitorCountry({ chosen: null, told: stranger.country, seen: null })
    : siteVisitorCountry({
        chosen: countryCookieIn(req.headers.get("cookie")),
        told: token ? null : req.headers.get(SITE_COUNTRY_HEADER),
        seen: seenCountry(req.headers),
      })
  /* The store's own currency, before the page is put in the market's: what the checkout prices the cart in. */
  const storeCurrency = found.site.shop.currency ?? "USD"
  found = { ...found, site: await localizeCompatSite(found.site, locale, market, visitorCountry, forSite(languagesAsked, found.site.creatorId)) }
  mark("localize")

  const cookie = stranger ? undefined : req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${CART_COOKIE}=([^;]*)`))?.[1]
  const { cart, note, attributes, discount } = readCartCookie(cookie)
  const sitePath = `/${segments.map(encodeURIComponent).join("/")}`
  const fields = await bodyOf(req)
  const ajax = req.headers.get("x-requested-with") === "XMLHttpRequest" || (req.headers.get("content-type") ?? "").includes("application/json") || (req.headers.get("accept") ?? "").includes("application/json")

  /*
    A THEME'S ACCOUNT FORMS, carried out by Storelib's own account routes
    (lib/storelib-theme/compat/site.ts accountFormPost): sign in, Create
    account and Forgot password each email a code, through the very route a
    Storelib website's sign in form posts to, with this request's headers, so
    its Origin check, its three rate limits and its "the same answer for every
    email" all apply. Never on a preview, which signs nobody in.
  */
  const accountPost = token ? null : accountFormPost(req.method, sitePath, fields)
  if (accountPost?.kind === "back") return new NextResponse(null, { status: 303, headers: { Location: accountPost.to, "Cache-Control": "private, no-store" } })
  if (accountPost?.kind === "code") {
    const form = new FormData()
    form.set("email", accountPost.email)
    form.set("return", accountPost.returnPath)
    if (accountPost.name) form.set("name", accountPost.name)
    return sendSignInCode(onward(req, "/api/site-account/code", form))
  }
  /* A newsletter or contact form, from this website's own page only. */
  const formPost = req.method === "POST" && (/^\/contact\/?$/.test(sitePath) || (sitePath === "/account" && fields?.form_type === "customer"))
  if (formPost && !sameOriginForm(req, hostOf(req))) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers: { "Cache-Control": "no-store" } })

  /* Who is visiting: the website's own session, read only when there is one, with the orders on the account pages. */
  const accountPath = sitePath === "/account" || sitePath.startsWith("/account/")
  const page = (req.method === "GET" || req.method === "HEAD") && !ajax && !/\.(js|json)$/.test(sitePath)
  /* An order's own page (/account/orders/<id>): that order too, with its files, when it is this customer's. */
  const orderId = sitePath.match(/^\/account\/orders\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i)?.[1] ?? null
  const account = token || stranger || !page ? undefined : await siteAccountOf(req, found.site.creatorId, { orders: accountPath, pending: accountPath, order: orderId })

  const shopId = found.site.creatorId
  /*
    A DISCOUNT CODE TRIED FROM THE THEME'S CART (/cart/update.js `discount`):
    counted with the checkout's own code checks, so the cart is no faster a
    way to guess a shop's codes than the checkout is.
  */
  const triedCode = req.method === "POST" && typeof fields?.discount === "string" && fields.discount.trim() !== ""
  if (triedCode && !token) {
    const limited = await rateLimit({ bucket: "coupon", subjects: [addressSubject(req)], windows: [{ limit: 120, seconds: 600 }], message: "Too many requests. Wait a moment and try again." })
    if (limited) return NextResponse.json({ status: 429, message: "Too many tries. Wait a moment and try again.", description: "Too many tries. Wait a moment and try again." }, { status: 429, headers: { "Cache-Control": "private, no-store" } })
  }
  /* The cart priced by the website's own checkout: its discount code and its delivery rates (lib/storelib-theme/compat/cart-pricing-server.ts). Never on a preview, which has no checkout. */
  const site = token || stranger ? found.site : { ...found.site, pricing: compatCartPricing({ creatorId: shopId, storeCurrency, market }) }
  const out = await answer(site, {
    method: req.method,
    path: sitePath,
    query: url.searchParams,
    body: fields,
    cart,
    note,
    attributes,
    discountCode: discount,
    ajax,
    referer: refererPath(req.headers.get("referer")),
    account,
    /* A signed in customer's product page says "You already own this" for a download they have (lib/site-accounts/owned-products). */
    owned: account?.customer?.email
      ? async (productId: string) => {
          const { customerOwnsProduct } = await import("@/lib/site-accounts/owned-products")
          return customerOwnsProduct({ creatorId: shopId, email: account.customer!.email }, productId)
        }
      : /* Bought here as a guest: the signed httpOnly grant of the browser that paid (lib/receipts/guest-access.ts), this shop's products only, its receipt the way to the files. */
        !token && !stranger && page && /(?:^|;\s*)sl_owned=/.test(req.headers.get("cookie") ?? "")
        ? async (productId: string) => {
            const { guestAccessFromCookieHeader } = await import("@/lib/receipts/guest-access")
            const { guestOpenHref, guestOwns } = await import("@/lib/receipts/guest-access-server")
            const { createAdminClient } = await import("@/lib/supabase/admin")
            const mine = (await guestOwns(createAdminClient(), guestAccessFromCookieHeader(req.headers.get("cookie")), { creatorId: shopId }, [productId]))[productId]
            return mine ? { whole: mine.whole, options: mine.options, href: guestOpenHref(mine.orderId) } : null
          }
        : undefined,
    submit: token
      ? undefined
      : async (kind, payload) => {
          const r = await (kind === "subscribe" ? subscribeRoute : contactRoute)(onward(req, kind === "subscribe" ? "/api/website-builder/subscribe" : "/api/website-builder/contact", JSON.stringify(payload)))
          return { ok: r.ok, status: r.status }
        },
  })
  mark("draw")
  const headers = new Headers(out.headers ?? {})
  for (const c of out.cookies ?? []) headers.append("Set-Cookie", c)
  /* A redirect the theme's page makes (Add to cart, a sign in) stays in the page's language; the language selector's own answer (/localization) is the language chosen, already. */
  const where = headers.get("Location")
  const root = localeRoot(found.site.i18n)
  if (where && root && sitePath !== "/localization" && where.startsWith("/") && !where.startsWith("//") && !where.startsWith(`${root}/`) && where !== root && !/^\/(?:api|checkout|receipt)(?:[/?#]|$)/.test(where)) headers.set("Location", `${root}${where === "/" ? "" : where}`)
  headers.set("Content-Type", out.type)
  headers.set("X-Robots-Tag", token ? "noindex" : "all")
  /* Every answer says how it may be kept (lib/storelib-theme/compat/site.ts): a page "no-cache", so Back and Forward show it at once; the rest no-store. The proxy no longer sets it over this. */
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store")
  if (out.cart) {
    headers.append("Set-Cookie", `${CART_COOKIE}=${writeCartCookie(out.cart, out.note ?? "", out.attributes ?? attributes, out.discountCode ?? discount)}; Path=/; Max-Age=1209600; SameSite=Lax; HttpOnly; Secure`)
  }
  /*
    A stranger's plain page: the same for every stranger sent to this marked
    address, so the hold below may hand it on (handleHeld). NOT TO THE CDN
    ANY MORE: a CDN copy is out of Publish's reach (revalidateTag clears
    Next's caches, not the CDN's copy of a route's answer), and it showed the
    previous theme for up to its minute after every Publish. The held copy is
    under the site's tag, which Publish expires at once. The browser is told
    what any page of the theme says ("private, no-cache"), which keeps Back
    and Forward instant. Anything else drawn for the marker keeps its own header.
  */
  if (stranger && !ajax && publicAnswer({ method: req.method, status: out.status, type: out.type, cacheControl: headers.get("Cache-Control"), setsCookie: headers.has("Set-Cookie"), changesCart: out.cart !== undefined })) {
    headers.set("Cache-Control", PUBLIC_PAGE_CACHE)
    headers.set(SHAREABLE_HEADER, "1")
  }
  if (req.method === "HEAD") return new NextResponse(null, { status: out.status, headers })
  /*
    COUNTED, AND THE STORE'S OWN ANALYTICS ON IT: a page of the live website
    (never a preview) gets Storelib's tracker and the store's Google
    Analytics and pixels, as every page of a builder website does
    (lib/storelib-theme/compat/track-script.ts).
  */
  let html = typeof out.body === "string" ? out.body : null
  if (html && !token && page && out.status === 200 && /text\/html/i.test(out.type) && /<\/body>/i.test(html)) {
    /* The page's product by its id from the lists already held: its full read (description, each variant's stock) ran once to draw the page and is not run again for the tags. */
    const productId = productIdForPath(found.site, sitePath)
    const markerRead = liveSiteFor(found.site.creatorId).then((l) => l?.marker ?? null, () => null)
    const early = await forSite(trackingAsked, found.site.creatorId)
    const stored = early !== undefined ? early : await publishedTracking(createAdminClient(), found.site.creatorId).catch(() => null)
    /* The store's Google Analytics with the page's product named, its pixels, Storelib's tracker and the visitor's language offer (lib/store/compat-page-tags.ts). */
    const t = readTracking(stored)
    const named = productId && (t.ga4 || t.google_ads) ? await gaProductFor(found.site.creatorId, null, productId) : null
    /*
      WHICH PUBLISH THIS PAGE WAS DRAWN FROM, so a copy the browser restores
      after a Publish (Back from checkout, a tab shown again) asks and loads
      again (lib/website-builder/live-release.ts). Held under the site's tag
      with the page, so a held stranger's page carries the marker it was
      drawn with.
    */
    const marker = await markerRead
    const tags = compatPageTags({ stored, creatorId: found.site.creatorId, productId, named, i18n: found.site.i18n, mainDomain: getMainDomain() }) + (marker ? releaseTag(username, marker) : "")
    const at = html.search(/<\/body>(?![\s\S]*<\/body>)/i)
    html = `${html.slice(0, at)}${tags}${html.slice(at)}`
    /*
      READY FOR ITS FIRST DRAW, when it is opened as a page: the body's CSS
      gathered in the head in its own order, the country flags loaded when
      seen (lib/storelib-theme/compat/first-load.ts). A theme's script that
      fetches a page to take a section out of it (a quick view) is answered
      with the markup as the theme wrote it, styles in their sections.
    */
    if (openedAsDocument(req.headers)) {
      html = readierFirstLoad(html).html
      /*
        ITS SCRIPTS IN THEIR ORDER WITHOUT HOLDING UP THE PAGE: a blocking
        theme script deferred with everything after it, an app widget or
        pixel the theme writes started after load
        (lib/storelib-theme/compat/script-order.ts), unless the theme asks
        for them as written or does something that needs the old timing.
        Said in a header, so a page left as written says why.
      */
      const scripts = calmerScripts(html)
      html = scripts.html
      if (scripts.deferred || scripts.queued || scripts.later || scripts.asWritten) headers.set("X-Storelib-Scripts", scripts.asWritten ? `as-written; ${scripts.asWritten}` : `deferred=${scripts.deferred}; queued=${scripts.queued}; later=${scripts.later}`)
      /* On a desktop, a page that runs nobody else's scripts is prerendered when its link is rested on (lib/storelib-theme/compat/prerender.ts). */
      if (!runsThirdPartyScripts(html)) html = withDesktopPrerender(html)
    }
  }
  const body = html ?? (typeof out.body === "string" ? out.body : new Blob([out.body as BlobPart]))
  mark("post")
  timing.push(`total;dur=${Math.round(performance.now() - began)}`)
  headers.set("Server-Timing", timing.join(", "))
  return new NextResponse(body, { status: out.status, headers })
}

/**
 * The address to send a page request on to when the website's live theme is
 * a Storelib theme (the proxy's answer was from before a switch), or null.
 * Only for a page asked for as a page, only once (freshAddress), and only
 * for a website with something published.
 */
async function switchedAway(req: Request, username: string, segments: readonly string[]): Promise<string | null> {
  if (req.method !== "GET" || !openedAsDocument(req.headers)) return null
  const creator = await creatorByName(username).catch(() => null)
  const live = creator ? await liveSiteFor(creator.creatorId).catch(() => null) : null
  if (!live || live.compat) return null
  const locale = req.headers.get(SITE_LOCALE_HEADER)
  const path = `/${segments.map(encodeURIComponent).join("/")}`
  return freshAddress(`${locale ? `/${encodeURIComponent(locale)}` : ""}${path === "/" && locale ? "" : path}${new URL(req.url).search}`)
}

/** The release watch, as a tag before </body> (lib/website-builder/live-release-script.ts). Nothing for a name or marker it does not accept. */
function releaseTag(name: string, marker: string): string {
  const js = liveReleaseScript(name, marker)
  return js ? `<script data-storelib-release>${js}</script>` : ""
}

/**
 * A STRANGER'S PAGE, DRAWN ONCE AND HANDED TO EVERY STRANGER SENT TO THE SAME
 * MARKED ADDRESS (lib/storelib-theme/compat/stranger-hold.ts). Only after the
 * same checks the draw makes: the proxy's seal for this name on this host,
 * and a marker that names this host and the language, market and country
 * the proxy said in its own headers. A page that sets a cookie or is not a
 * plain 200 is never reused. Everything else goes straight to the draw.
 */
async function handleHeld(req: Request, ctx: Params): Promise<Response> {
  if (req.method !== "GET") return handle(req, ctx)
  const { username, path = [] } = await ctx.params
  const stranger = readStrangerMarker(path[0])
  const ajax = req.headers.get("x-requested-with") === "XMLHttpRequest" || (req.headers.get("accept") ?? "").includes("application/json")
  if (!stranger || ajax || /\.(js|json)$/.test(path[path.length - 1] ?? "")) return handle(req, ctx)
  const host = siteHostOf(req.headers)
  const told = (name: string) => req.headers.get(name) || null
  if (!(await siteSealed(req.headers.get(SITE_SEAL_HEADER), username, host))) return handle(req, ctx)
  if (stranger.host !== host || told(SITE_LOCALE_HEADER) !== stranger.locale || told(SITE_MARKET_HEADER) !== stranger.market || told(SITE_COUNTRY_HEADER) !== stranger.country) return handle(req, ctx)
  const creator = await creatorByName(username).catch(() => null)
  if (!creator) return handle(req, ctx)
  const url = new URL(req.url)
  const page = await heldStrangerPage(strangerKey(username, path, url.search, openedAsDocument(req.headers)),[creatorSiteTag(creator.creatorId), creatorShopTag(creator.creatorId)], async () => {
    const res = await handle(req, ctx)
    const headers = [...res.headers.entries()]
    const body = await res.text()
    return { status: res.status, headers, body, share: res.status === 200 && res.headers.get(SHAREABLE_HEADER) === "1" && res.headers.get("Cache-Control") === PUBLIC_PAGE_CACHE && !res.headers.has("Set-Cookie") }
  })
  const headers = new Headers(page.headers)
  /* A held page says it was held, and what its draw cost when it was drawn. */
  if (page.held) headers.set("Server-Timing", ["hold;desc=hit", headers.get("Server-Timing")?.replace(/(^|, )(\w+);/g, "$1drawn-$2;")].filter(Boolean).join(", "))
  /* Said between the draw and the hold only. */
  headers.delete(SHAREABLE_HEADER)
  /* Said for /admin/performance and for a person checking: this page came from the hold, not a new draw. */
  headers.set("X-Storelib-Held", page.held ? "hit" : "miss")
  return new NextResponse(page.body, { status: page.status, headers })
}

/* Timed on the server for /admin/performance (lib/perf/server-timing.ts): an imported theme's pages, cart and section calls. */
const timedHandle = timed("sites", "/api/site-theme/site", handle)
export const GET = timed("sites", "/api/site-theme/site", handleHeld)
export const HEAD = handle
export const POST = timedHandle
