import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { cleanName, customerById, renameCustomer } from "@/lib/site-accounts/customers"
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
 * form: there is no id to send. Only the name can change; the email is the
 * one the customer signed in with, and changing it would be signing in as
 * somebody else.
 */
export async function POST(request: Request) {
  const host = hostOf(request)
  const origin = originOf(host)
  if (!sameOriginForm(request, host)) return privateResponse(NextResponse.json({ error: "Not allowed" }, { status: 403 }))

  const db = createAdminClient()
  const owner = await siteOwnerOfHost(db, host)
  const visitor = owner ? visitorOfRequest(request, { creatorId: owner.creatorId }) : null
  const customer = visitor ? await customerById(db, visitor) : null
  if (!visitor || !customer) return privateResponse(NextResponse.redirect(new URL("/account/login", origin), 303))

  let form: FormData | null = null
  try {
    form = await request.formData()
  } catch {
    form = null
  }
  const name = cleanName(form?.get("name"))
  if (name === null) return privateResponse(NextResponse.redirect(new URL("/account?profile=error", origin), 303))

  const limited = await rateLimit({
    bucket: "site-profile",
    subjects: [`customer:${visitor.customerId}`],
    windows: [{ limit: 20, seconds: 3600 }],
  })
  if (limited) return privateResponse(NextResponse.redirect(new URL("/account?profile=error", origin), 303))

  const saved = await renameCustomer(db, visitor, name)
  return privateResponse(NextResponse.redirect(new URL(`/account?profile=${saved ? "saved" : "error"}#profile`, origin), 303))
}
