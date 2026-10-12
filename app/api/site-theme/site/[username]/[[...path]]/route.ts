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
import { SITE_LOCALE_HEADER } from "@/lib/markets/site-name"
import { localeRoot } from "@/lib/storelib-theme/compat/objects"
import { compatSiteByName } from "@/lib/website-builder/compat-site"
import { isSiteReadError } from "@/lib/website-builder/site-read"
import { CART_COOKIE, accountFormPost, answer, readCartCookie, writeCartCookie } from "@/lib/storelib-theme/compat/site"
import { siteAccountOf } from "@/lib/site-accounts/theme-visitor"
import { hostOf } from "@/lib/site-accounts/session"
import { sameOriginForm } from "@/lib/site-accounts/respond"
import { POST as sendSignInCode } from "@/app/api/site-account/code/route"
import { POST as subscribeRoute } from "@/app/api/website-builder/subscribe/route"
import { POST as contactRoute } from "@/app/api/website-builder/contact/route"
import { previewTokenFrom } from "@/lib/website-builder/preview-link"
import { SITE_SEAL_HEADER, siteHostOf, siteSealed } from "@/lib/storelib-theme/compat/site-seal"
import { formFields } from "@/lib/storelib-theme/compat/form-fields"
import { timed } from "@/lib/perf/server-timing"

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
  if (segments[0] === "preview" && segments[1]) {
    token = previewTokenFrom(new URLSearchParams([["preview", decodeURIComponent(segments[1])]]))
    segments = segments.slice(2)
  }
  /*
    The database not answering is not "no such site": a 503 that asks to be
    tried again in a moment, never cached, when there is no last good copy
    to serve (lib/website-builder/compat-site.ts).
  */
  let found: Awaited<ReturnType<typeof compatSiteByName>>
  try {
    found = await compatSiteByName(username, host, token)
  } catch (e) {
    if (!isSiteReadError(e)) throw e
    console.error("[site-theme] site unavailable:", e.message)
    return new NextResponse(UNAVAILABLE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5" } })
  }
  if (found.kind !== "site") return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })
  /*
    IN ANOTHER OF THE WEBSITE'S LANGUAGES: /fr/… on the website, sent here by
    the proxy with the language named in a header only it sets (the seal
    above proves the request came through it). The site is put in that
    language for this request alone (lib/markets/compat.ts). Never a preview.
  */
  const locale = token ? null : (req.headers.get(SITE_LOCALE_HEADER) || null)
  found = { ...found, site: await localizeCompatSite(found.site, locale) }

  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${CART_COOKIE}=([^;]*)`))?.[1]
  const { cart, note } = readCartCookie(cookie)
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
  const account = token || !page ? undefined : await siteAccountOf(req, found.site.creatorId, { orders: accountPath, pending: accountPath, order: orderId })

  const shopId = found.site.creatorId
  const out = await answer(found.site, {
    method: req.method,
    path: sitePath,
    query: url.searchParams,
    body: fields,
    cart,
    note,
    ajax,
    referer: refererPath(req.headers.get("referer")),
    account,
    /* A signed in customer's product page says "You already own this" for a download they have (lib/site-accounts/owned-products). */
    owned: account?.customer?.email
      ? async (productId: string) => {
          const { customerOwnsProduct } = await import("@/lib/site-accounts/owned-products")
          return customerOwnsProduct({ creatorId: shopId, email: account.customer!.email }, productId)
        }
      : undefined,
    submit: token
      ? undefined
      : async (kind, payload) => {
          const r = await (kind === "subscribe" ? subscribeRoute : contactRoute)(onward(req, kind === "subscribe" ? "/api/website-builder/subscribe" : "/api/website-builder/contact", JSON.stringify(payload)))
          return { ok: r.ok, status: r.status }
        },
  })
  const headers = new Headers(out.headers ?? {})
  /* A redirect the theme's page makes (Add to cart, a sign in) stays in the page's language. */
  const where = headers.get("Location")
  const root = localeRoot(found.site.i18n)
  if (where && root && where.startsWith("/") && !where.startsWith("//") && !where.startsWith(`${root}/`) && where !== root && !/^\/(?:api|checkout|receipt)(?:[/?#]|$)/.test(where)) headers.set("Location", `${root}${where === "/" ? "" : where}`)
  headers.set("Content-Type", out.type)
  headers.set("X-Robots-Tag", token ? "noindex" : "all")
  /* Every answer says how it may be kept (lib/storelib-theme/compat/site.ts): a page "no-cache", so Back and Forward show it at once; the rest no-store. The proxy no longer sets it over this. */
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store")
  if (out.cart) {
    headers.append("Set-Cookie", `${CART_COOKIE}=${writeCartCookie(out.cart, out.note ?? "")}; Path=/; Max-Age=1209600; SameSite=Lax; HttpOnly; Secure`)
  }
  if (req.method === "HEAD") return new NextResponse(null, { status: out.status, headers })
  const body = typeof out.body === "string" ? out.body : new Blob([out.body as BlobPart])
  return new NextResponse(body, { status: out.status, headers })
}

/* Timed on the server for /admin/performance (lib/perf/server-timing.ts): an imported theme's pages, cart and section calls. */
const timedHandle = timed("sites", "/api/site-theme/site", handle)
export const GET = timedHandle
export const HEAD = handle
export const POST = timedHandle
