/**
 * ===========================================================================
 *  THE PASSWORD PAGE'S FORM, ON THE WEBSITE ITSELF
 * ===========================================================================
 * POST   the password a visitor typed (a plain form post from the password
 *        page, `password` and `return`). Right: a pass in an httpOnly cookie
 *        on this host and on to the page they asked for. Wrong: back to the
 *        password page with one sentence.
 * GET    `?pass=`, the owner's two minute note from storelib.com
 *        (app/api/site-password/owner), spent once for the same pass.
 *
 * What decides is lib/site-password/enter.ts. Limited per visitor and per
 * website before any password is compared, so the password cannot be
 * guessed at speed from one address or from many.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { hostOf } from "@/lib/site-accounts/session"
import { originOf, privateResponse, sameOriginForm } from "@/lib/site-accounts/respond"
import { enterPassword, spendOwnerPass, type EnterResult } from "@/lib/site-password/enter"
import { passCookie, passCookieName } from "@/lib/site-password/pass"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function answer(host: string, result: EnterResult): NextResponse {
  const res = privateResponse(NextResponse.redirect(new URL(result.to, originOf(host)), 303))
  if (result.ok === true) res.cookies.set(passCookieName(host), result.pass, passCookie(host))
  return res
}

export async function POST(request: Request) {
  const host = hostOf(request)
  if (!sameOriginForm(request, host)) return privateResponse(NextResponse.json({ error: "Not allowed" }, { status: 403 }))
  let form: FormData | null = null
  try {
    form = await request.formData()
  } catch {
    form = null
  }
  const db = createAdminClient()
  const result = await enterPassword(
    { host, password: form?.get("password"), returnTo: form?.get("return") },
    {
      db,
      owner: (h) => siteOwnerOfHost(db, h),
      limited: async (creatorId) => {
        const byVisitor = await rateLimit({
          bucket: "site-password-visitor",
          subjects: [addressSubject(request)],
          windows: [{ limit: 8, seconds: 600 }, { limit: 40, seconds: 86400 }],
        })
        if (byVisitor) return true
        const bySite = await rateLimit({
          bucket: "site-password-site",
          subjects: [`creator:${creatorId}`],
          windows: [{ limit: 200, seconds: 3600 }, { limit: 2000, seconds: 86400 }],
        })
        return !!bySite
      },
    },
  )
  return answer(host, result)
}

export async function GET(request: Request) {
  const host = hostOf(request)
  const url = new URL(request.url)
  const db = createAdminClient()
  const result = await spendOwnerPass(
    { host, note: url.searchParams.get("pass"), returnTo: url.searchParams.get("return") },
    { db, owner: (h) => siteOwnerOfHost(db, h) },
  )
  return answer(host, result)
}
