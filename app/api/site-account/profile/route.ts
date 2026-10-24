import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { cleanName, customerById, renameCustomer, setCustomerPhone } from "@/lib/site-accounts/customers"
import { cleanPhone } from "@/lib/site-accounts/addresses"
import { inLang, siteLangRoot } from "@/lib/site-accounts/lang"
import { siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { hostOf, visitorOfRequest } from "@/lib/site-accounts/session"
import { originOf, privateResponse, sameOriginForm } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A CUSTOMER'S NAME, CHANGED FROM THEIR ACCOUNT PAGE
 * ===========================================================================
 * The Profile form on /account posts `name` here. WHO is the website's own
 * session cookie, for this host and this host's creator, and nothing in the
 * form: there is no id to send. The name and the phone number can change
 * (each form sends one of them); the email is the one the customer signed
 * in with, and changing it would be signing in as somebody else.
 *
 * The page's script posts with `Accept: application/json` and is answered
 * `{ ok, to }`, so a refused phone number is said beside its field.
 */
export async function POST(request: Request) {
  const host = hostOf(request)
  const origin = originOf(host)
  const wantsJson = (request.headers.get("accept") || "").includes("application/json")
  if (!sameOriginForm(request, host)) return privateResponse(NextResponse.json({ error: "Not allowed" }, { status: 403 }))

  let form: FormData | null = null
  try {
    form = await request.formData()
  } catch {
    form = null
  }

  const db = createAdminClient()
  const owner = await siteOwnerOfHost(db, host)
  /* Back to the account in the language the page was in (lib/site-accounts/lang.ts). */
  const root = await siteLangRoot(owner?.creatorId, form?.get("lang"))
  const back = (code: string, ok: boolean, edit?: string) => {
    const to = new URL(inLang(root, "/account"), origin)
    to.searchParams.set("profile", code)
    if (edit) to.searchParams.set("edit", edit)
    to.hash = "profile"
    if (wantsJson) return privateResponse(NextResponse.json(ok ? { ok: true, to: `${to.pathname}${to.search}${to.hash}` } : { ok: false, error: code }, { status: ok ? 200 : 400 }))
    return privateResponse(NextResponse.redirect(to, 303))
  }
  const visitor = owner ? visitorOfRequest(request, { creatorId: owner.creatorId }) : null
  const customer = visitor ? await customerById(db, visitor) : null
  if (!visitor || !customer) return privateResponse(NextResponse.redirect(new URL(inLang(root, "/account/login"), origin), 303))

  /* The form names the one field it changes: the name, or the phone number (part 287). */
  const hasPhone = typeof form?.get("phone") === "string"
  const hasName = typeof form?.get("name") === "string"
  const name = hasName ? cleanName(form?.get("name")) : null
  const phone = hasPhone ? cleanPhone(form?.get("phone")) : null
  if (!hasName && !hasPhone) return back("error", false)
  if (hasName && name === null) return back("error", false, "name")
  if (hasPhone && phone === null) return back("phone", false, "phone")

  const limited = await rateLimit({
    bucket: "site-profile",
    subjects: [`customer:${visitor.customerId}`],
    windows: [{ limit: 20, seconds: 3600 }],
  })
  if (limited) return back("error", false)

  if (hasName && !(await renameCustomer(db, visitor, name as string))) return back("error", false, "name")
  if (hasPhone && !(await setCustomerPhone(db, visitor, phone as string))) return back(customer.phone === undefined ? "unavailable" : "error", false, "phone")
  return back("saved", true)
}
