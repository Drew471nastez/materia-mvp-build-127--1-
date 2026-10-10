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
import { NextResponse } from "next/server"
import { compatSiteByName } from "@/lib/website-builder/compat-site"
import { CART_COOKIE, answer, readCartCookie, writeCartCookie } from "@/lib/storelib-theme/compat/site"
import { previewTokenFrom } from "@/lib/website-builder/preview-link"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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
      const form = await req.formData()
      const out: Record<string, unknown> = {}
      for (const [k, v] of form.entries()) {
        if (typeof v !== "string") continue
        const list = k.match(/^(\w+)\[\]$/)
        if (list) {
          const arr = (out[list[1]] as unknown[] | undefined) ?? []
          arr.push(v)
          out[list[1]] = arr
          continue
        }
        const item = k.match(/^items\[(\d+)\]\[(\w+)\]$/)
        if (item) {
          const arr = ((out.items as Record<string, unknown>[] | undefined) ?? [])
          const i = Number(item[1])
          arr[i] = { ...(arr[i] ?? {}), [item[2]]: v }
          out.items = arr
          continue
        }
        out[k] = v
      }
      return out
    }
  } catch {
    return null
  }
  return null
}

async function handle(req: Request, { params }: Params): Promise<Response> {
  const { username, path = [] } = await params
  const url = new URL(req.url)
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase()

  let segments = path
  let token: string | null = null
  if (segments[0] === "preview" && segments[1]) {
    token = previewTokenFrom(new URLSearchParams([["preview", decodeURIComponent(segments[1])]]))
    segments = segments.slice(2)
  }
  const found = await compatSiteByName(username, host, token)
  if (found.kind !== "site") return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })

  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${CART_COOKIE}=([^;]*)`))?.[1]
  const { cart, note } = readCartCookie(cookie)
  const out = await answer(found.site, {
    method: req.method,
    path: `/${segments.map(encodeURIComponent).join("/")}`,
    query: url.searchParams,
    body: await bodyOf(req),
    cart,
    note,
    ajax: req.headers.get("x-requested-with") === "XMLHttpRequest" || (req.headers.get("content-type") ?? "").includes("application/json") || (req.headers.get("accept") ?? "").includes("application/json"),
  })
  const headers = new Headers(out.headers ?? {})
  headers.set("Content-Type", out.type)
  headers.set("X-Robots-Tag", token ? "noindex" : "all")
  if (out.cart) {
    headers.append("Set-Cookie", `${CART_COOKIE}=${writeCartCookie(out.cart, out.note ?? "")}; Path=/; Max-Age=1209600; SameSite=Lax; HttpOnly; Secure`)
  }
  if (req.method === "HEAD") return new NextResponse(null, { status: out.status, headers })
  const body = typeof out.body === "string" ? out.body : new Blob([out.body as BlobPart])
  return new NextResponse(body, { status: out.status, headers })
}

export const GET = handle
export const HEAD = handle
export const POST = handle
