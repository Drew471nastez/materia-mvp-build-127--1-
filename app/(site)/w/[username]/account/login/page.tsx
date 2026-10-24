import { notFound, redirect } from "next/navigation"
import { splitSiteName } from "@/lib/markets/site-name"
import type { Metadata } from "next"
import { siteLocalizer } from "@/lib/markets/live"
import { accountWord, signInNoticeIn } from "@/lib/site-accounts/words"
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
  const { username: segment } = await params
  const base = await siteMetadata(splitSiteName(segment).name, undefined, "login")
  return { ...base, alternates: undefined, robots: { index: false, follow: false } }
}

export default async function SiteSignInPage({ params, searchParams }: PageProps) {
  /* /fr/account/login: the same page, in French (lib/markets/site-name). */
  const { username: segment } = await params
  const { name: username, locale, market } = splitSiteName(segment)
  const sp = await searchParams.catch(() => ({}) as Awaited<PageProps["searchParams"]>)
  const { visitor, creatorId } = await siteVisitor(username)
  if (!creatorId) notFound()
  const back = returnPathOf(sp.return)
  if (visitor) redirect(back)

  const pending = sp.step === "email" ? null : await pendingSignIn(creatorId)
  /* A code refused after this browser's note ran out lands on the email step, and says to start again there. */
  const why = !pending && (sp.error === "code" || sp.error === "expired" || sp.error === "tries") ? "restart" : sp.error
  /* In the page's language (lib/site-accounts/words.ts): /fr/account/login says why in French. */
  const words = (await siteLocalizer(creatorId, locale, market).catch(() => null))?.words
  const refusal = signInNoticeIn(words, why)
  const notice = refusal ?? (pending && sp.sent === "1" ? accountWord(words, "acct_notice_sent") : null)
  return renderAccountPage(username, "login", {
    notice,
    noticeError: !!refusal,
    signIn: pending
      ? { step: "code", email: pending.m, returnTo: pending.r }
      : { step: "email", email: "", returnTo: back },
    lang: { locale, market },
  })
}
