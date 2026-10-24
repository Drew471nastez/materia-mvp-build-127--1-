import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, emailSubject, rateLimit } from "@/lib/api/rate-limit"
import { buildMailgunFromHeader, sendMailgunEmail } from "@/lib/mailgun"
import { requestCode, type SignInDeps } from "@/lib/site-accounts/sign-in"
import { returnPathOf, siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { siteBrand } from "@/lib/site-accounts/site-brand"
import { cookieFrom, hostOf, pendingCookie, pendingCookieName, pendingFrom } from "@/lib/site-accounts/session"
import { cleanEmail } from "@/lib/site-accounts/token"
import { inLang, langOfRoot, siteLangRoot } from "@/lib/site-accounts/lang"
import { emailLanguageFor } from "@/lib/emails/words-server"
import { originOf, privateResponse, sameOriginForm } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  SIGN IN, STEP ONE: AN EMAIL, AND A CODE SENT TO IT
 * ===========================================================================
 * The sign in page's form posts here, on the website's own host (every /api
 * path is served there, see proxy.ts). What it decides is in
 * lib/site-accounts/sign-in.ts; this reads the form, asks the limits, and
 * answers with a redirect back to the sign in page: the code step, with the
 * note of which code this browser is waiting on in an httpOnly cookie, or
 * the email step with a fixed reason.
 *
 * The same answer for an email that has an account here and one that does
 * not: nothing about the address is looked up at this step.
 *
 * THREE LIMITS, each counted in Postgres (lib/api/rate-limit.ts): per
 * address emailed, across every website, so nobody can have one inbox
 * flooded by a hundred shops; per visitor's IP; and per website, so a flood
 * from many addresses stops at one store rather than at the mail provider.
 */

async function formOf(request: Request): Promise<FormData | null> {
  try {
    return await request.formData()
  } catch {
    return null
  }
}

function back(host: string, query: Record<string, string>, root = ""): NextResponse {
  /* The sign in page in the language the form was sent from (/fr/account/login), not the website's own (lib/site-accounts/lang.ts). */
  const to = new URL(inLang(root, "/account/login"), originOf(host))
  for (const [k, v] of Object.entries(query)) if (v) to.searchParams.set(k, v)
  return privateResponse(NextResponse.redirect(to, 303))
}

export async function POST(request: Request) {
  const host = hostOf(request)
  if (!sameOriginForm(request, host)) return privateResponse(NextResponse.json({ error: "Not allowed" }, { status: 403 }))

  const form = await formOf(request)
  const returnPath = returnPathOf(form?.get("return"))
  /* Only a path that is not the account page itself is carried in the address. */
  const keep = returnPath === "/account" ? "" : returnPath
  const db = createAdminClient()
  /* Asked once: the language below and the sign in itself both need the host's creator. */
  const ownerRead = siteOwnerOfHost(db, host)
  /* Send a new code is asked from the code step, whose note knows the language the sign in began in. */
  const noted = form?.get("again") === "1" ? pendingFrom(cookieFrom(request, pendingCookieName(host)), host) : null
  const creatorId = (await ownerRead)?.creatorId
  const root = await siteLangRoot(creatorId, form?.get("lang") ?? (noted?.l ? langOfRoot(noted.l) : null))
  /* The code email in that language too (or the website's own), with the store's approved words for it (lib/emails/words-server). */
  const mailWords = creatorId ? await emailLanguageFor(creatorId, root ? langOfRoot(root) : null).catch(() => null) : null

  const deps: SignInDeps = {
    db,
    owner: (h) => (h === host ? ownerRead : siteOwnerOfHost(db, h)),
    limited: async ({ creatorId, email }) => {
      const byAddress = await rateLimit({
        bucket: "site-signin-email",
        subjects: [emailSubject(email)],
        windows: [{ limit: 5, seconds: 600 }, { limit: 20, seconds: 86400 }],
      })
      if (byAddress) return true
      const byVisitor = await rateLimit({
        bucket: "site-signin-visitor",
        subjects: [addressSubject(request)],
        windows: [{ limit: 10, seconds: 600 }, { limit: 50, seconds: 86400 }],
      })
      if (byVisitor) return true
      const byStore = await rateLimit({
        bucket: "site-signin-store",
        subjects: [`creator:${creatorId}`],
        windows: [{ limit: 300, seconds: 3600 }, { limit: 3000, seconds: 86400 }],
      })
      return !!byStore
    },
    /*
      A code they just asked for: transactional, so it leaves at once (no
      bounce lookup first, no tracking), from the store by name, and a reply
      reaches the store.
    */
    send: (mail) =>
      sendMailgunEmail({
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        from: buildMailgunFromHeader(mail.fromName),
        replyTo: mail.replyTo || undefined,
        tags: ["site-sign-in"],
        transactional: true,
      }),
    brand: (creatorId) => siteBrand(db, creatorId),
  }

  /* "Send a new code" on the code step posts the same email again, marked. */
  const again = form?.get("again") === "1"
  /* `name`: a theme's Create account form's first and last name, saved once the code proves the email (lib/site-accounts/sign-in.ts). */
  /*
    Send a new code posts only the email and where to go. The name a Create
    account form gave rides in the note this browser already holds, and the
    new note replaced it without one, so an account made after a second code
    had no name. It is carried over from the note, for the same email only.
  */
  const held = again ? pendingFrom(cookieFrom(request, pendingCookieName(host)), host) : null
  const name = form?.get("name") || (held?.n && held.m === cleanEmail(form?.get("email")) ? held.n : undefined)
  const result = await requestCode({ host, email: form?.get("email"), returnPath, name, lang: root || null, mail: mailWords }, deps)
  /* A new code that could not be sent leaves the visitor on the code step; a first one, on the email step. */
  if (result.ok === false) return back(host, again ? { error: result.why } : { error: result.why, step: "email", return: keep }, root)

  const res = back(host, again ? { sent: "1" } : {}, root)
  res.cookies.set(pendingCookieName(host), result.pending, pendingCookie(host))
  return res
}
