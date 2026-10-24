import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { deleteCustomer } from "@/lib/site-accounts/customers"
import { siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import {
  HINT_COOKIE,
  hintCookie,
  hostOf,
  pendingCookie,
  pendingCookieName,
  sessionCookie,
  sessionCookieName,
  visitorOfRequest,
} from "@/lib/site-accounts/session"
import { originOf, privateResponse, sameOriginForm } from "@/lib/site-accounts/respond"
import { inLang, siteLangRoot } from "@/lib/site-accounts/lang"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A CUSTOMER DELETING THEIR ACCOUNT ON A CREATOR'S WEBSITE
 * ===========================================================================
 * The Delete account form on /account posts here, on the website's own host.
 * WHO is the website's own session cookie, for this host's creator, and
 * nothing in the form: there is no id to send, so nobody can delete anybody
 * else's account. `confirm=delete` must come with it, which the form's own
 * button sends, so a stray post of the form's address alone does nothing.
 *
 * What goes is lib/site-accounts/customers.ts deleteCustomer: the account,
 * what it saved, and any code still waiting. Then every cookie of the sign
 * in, as signing out does, and the visitor lands on the home page a guest.
 * Orders stay with the creator; the receipts went to the email.
 */
export async function POST(request: Request) {
  const host = hostOf(request)
  const origin = originOf(host)
  if (!sameOriginForm(request, host)) return privateResponse(NextResponse.json({ error: "Not allowed" }, { status: 403 }))

  let form: FormData | null = null
  try {
    form = await request.formData()
  } catch {
    form = null
  }

  const db = createAdminClient()
  const owner = await siteOwnerOfHost(db, host)
  /* Back in the language the account page was in (lib/site-accounts/lang.ts). */
  const root = await siteLangRoot(owner?.creatorId, form?.get("lang"))
  const refused = () => privateResponse(NextResponse.redirect(new URL(`${inLang(root, "/account")}?deleted=no#delete`, origin), 303))
  const visitor = owner ? visitorOfRequest(request, { creatorId: owner.creatorId }) : null
  if (!visitor) return privateResponse(NextResponse.redirect(new URL(inLang(root, "/account/login"), origin), 303))
  if (form?.get("confirm") !== "delete") return refused()

  const limited = await rateLimit({
    bucket: "site-account-delete",
    subjects: [`customer:${visitor.customerId}`],
    windows: [{ limit: 5, seconds: 3600 }],
  })
  if (limited) return refused()

  const gone = await deleteCustomer(db, visitor)
  if (!gone) return refused()

  const res = NextResponse.redirect(new URL(`${inLang(root, "/")}?account_deleted=1`, origin), 303)
  res.cookies.set(sessionCookieName(host), "", { ...sessionCookie(host), maxAge: 0 })
  res.cookies.set(pendingCookieName(host), "", { ...pendingCookie(host), maxAge: 0 })
  res.cookies.set(HINT_COOKIE, "", { ...hintCookie(host), maxAge: 0 })
  return privateResponse(res)
}
