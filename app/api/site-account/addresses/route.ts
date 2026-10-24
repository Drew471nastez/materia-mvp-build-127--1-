import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { customerById } from "@/lib/site-accounts/customers"
import { orderAddresses } from "@/lib/site-accounts/account-data"
import { updateBook, type BookChange } from "@/lib/site-accounts/addresses"
import { siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { hostOf, visitorOfRequest } from "@/lib/site-accounts/session"
import { inLang, siteLangRoot } from "@/lib/site-accounts/lang"
import { originOf, privateResponse, sameOriginForm } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A CUSTOMER'S ADDRESS BOOK, CHANGED FROM THEIR ACCOUNT PAGE
 * ===========================================================================
 * The address forms on /account (a Storelib theme) and /account/addresses
 * (an imported theme, its own Shopify forms mapped here by the site route)
 * post here:
 *
 *   action=save     add one (no `id`) or change one (`id`), with the fields
 *                   checkout asks for; `default=1` makes it the default
 *   action=delete   `id`
 *   action=default  `id`
 *
 * WHO is the website's own session cookie, for this host and its creator;
 * nothing in the form names the customer. The checks are checkout's own
 * (lib/site-accounts/addresses.ts), so a saved address is one checkout
 * takes as it is.
 *
 * TWO WAYS BACK. A plain form post (no script) is sent back to the page
 * with `?address=<code>`, which the page says in its words. The account
 * page's script posts with `Accept: application/json` and gets
 * `{ ok, to }` or `{ ok: false, error }`, so a refused address is said
 * beside its field with what was typed still in it.
 */

const PAGES = new Set(["/account", "/account/addresses"])

function pick(form: FormData | null, ...keys: string[]): string {
  for (const k of keys) {
    const v = form?.get(k)
    if (typeof v === "string") return v
  }
  return ""
}

export async function POST(request: Request) {
  const host = hostOf(request)
  const origin = originOf(host)
  const wantsJson = (request.headers.get("accept") || "").includes("application/json")
  if (!sameOriginForm(request, host)) return privateResponse(NextResponse.json({ ok: false, error: "failed" }, { status: 403 }))

  let form: FormData | null = null
  try {
    form = await request.formData()
  } catch {
    form = null
  }

  const db = createAdminClient()
  const owner = await siteOwnerOfHost(db, host)
  const root = await siteLangRoot(owner?.creatorId, form?.get("lang"))
  const asked = pick(form, "return").split(/[?#]/)[0]
  const page = PAGES.has(asked) ? asked : "/account"
  const answer = (code: string, ok: boolean, editing?: string | null) => {
    const to = new URL(inLang(root, page), origin)
    to.searchParams.set("address", code)
    /* A refused form opens again, so the no-script visitor sees where it stopped. */
    if (!ok && editing !== undefined) to.searchParams.set("edit", editing ? `address:${editing}` : "address")
    to.hash = "addresses"
    const href = `${to.pathname}${to.search}${to.hash}`
    if (wantsJson) return privateResponse(NextResponse.json(ok ? { ok: true, to: href } : { ok: false, error: code }, { status: ok ? 200 : 400 }))
    return privateResponse(NextResponse.redirect(to, 303))
  }

  const visitor = owner ? visitorOfRequest(request, { creatorId: owner.creatorId }) : null
  const customer = visitor ? await customerById(db, visitor) : null
  if (!visitor || !customer) {
    const to = new URL(inLang(root, "/account/login"), origin)
    to.searchParams.set("return", page)
    if (wantsJson) return privateResponse(NextResponse.json({ ok: false, error: "signed_out", to: `${to.pathname}${to.search}` }, { status: 401 }))
    return privateResponse(NextResponse.redirect(to, 303))
  }

  const action = pick(form, "action")
  const id = pick(form, "id").slice(0, 64) || null
  let change: BookChange
  if (action === "delete" && id) change = { kind: "delete", id }
  else if (action === "default" && id) change = { kind: "default", id }
  else if (action === "save" || action === "") {
    change = {
      kind: "save",
      id,
      makeDefault: pick(form, "default") === "1",
      fields: {
        name: pick(form, "name"),
        company: pick(form, "company"),
        line1: pick(form, "line1"),
        line2: pick(form, "line2"),
        city: pick(form, "city"),
        region: pick(form, "region"),
        postalCode: pick(form, "postal_code", "postalCode"),
        country: pick(form, "country"),
        phone: pick(form, "phone"),
      },
    }
  } else return answer("failed", false)

  const limited = await rateLimit({
    bucket: "site-addresses",
    subjects: [`customer:${visitor.customerId}`],
    windows: [{ limit: 60, seconds: 3600 }],
  })
  if (limited) return answer("failed", false, change.kind === "save" ? change.id : undefined)

  /* A book never changed starts from the addresses the customer's orders went to: the list they were looking at. */
  const result = await updateBook(db, visitor, change, () => orderAddresses(db, { creatorId: customer.creator_id, email: customer.email }))
  if (result.ok === false) return answer(result.why, false, change.kind === "save" ? change.id : undefined)
  return answer(change.kind === "delete" ? "deleted" : change.kind === "default" ? "default" : "saved", true)
}
