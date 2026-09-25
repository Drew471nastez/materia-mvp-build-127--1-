import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { signInNotice } from "@/lib/website-builder/account-pages"
import { returnPathOf } from "@/lib/site-accounts/hosts"
import { siteMetadata } from "../../render-site"
import { renderAccountPage } from "../../render-account"
import { pendingSignIn, siteVisitor } from "../../visitor"

/**
 * ===========================================================================
 *  SIGN IN, ON THE CREATOR'S OWN WEBSITE
 * ===========================================================================
 * The page every shop has at /account/login, in two steps, the way a
 * Shopify store's customer accounts work:
 *
 *   email   one field and Continue. It posts to /api/site-account/code,
 *           which emails a six digit code and comes back here.
 *   code    shown while this browser is waiting on a code (the signed note
 *           in its cookie, lib/site-accounts/session.ts): the address it
 *           went to, one field for the code, Send a new code, and Use a
 *           different email. It posts to /api/site-account/verify, which
 *           signs the visitor in and sends them on.
 *
 * There is no Create account: a new email makes the account when its code
 * is typed. A visitor who is already signed in to this website goes on to
 * where they were going.
 *
 * `?error=` is why the last step stopped, turned into a fixed sentence
 * (lib/website-builder/account-pages signInNotice); nothing else from the
 * address is printed. `?return=` is a path on this website to land on
 * afterwards, and only that (lib/site-accounts/hosts.ts returnPathOf).
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
  searchParams: Promise<{ error?: string; step?: string; return?: string; sent?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const base = await siteMetadata(username, undefined, "login")
  return { ...base, alternates: undefined, robots: { index: false, follow: false } }
}

export default async function SiteSignInPage({ params, searchParams }: PageProps) {
  const { username } = await params
  const sp = await searchParams.catch(() => ({}) as Awaited<PageProps["searchParams"]>)
  const { visitor, creatorId } = await siteVisitor(username)
  if (!creatorId) notFound()
  const back = returnPathOf(sp.return)
  if (visitor) redirect(back)

  const pending = sp.step === "email" ? null : await pendingSignIn(creatorId)
  /* A code refused after this browser's note ran out lands on the email step, and says to start again there. */
  const why = !pending && (sp.error === "code" || sp.error === "expired" || sp.error === "tries") ? "restart" : sp.error
  const notice = signInNotice(why) ?? (pending && sp.sent === "1" ? "A new code is on its way." : null)
  return renderAccountPage(username, "login", {
    notice,
    signIn: pending
      ? { step: "code", email: pending.m, returnTo: pending.r }
      : { step: "email", email: "", returnTo: back },
  })
}
