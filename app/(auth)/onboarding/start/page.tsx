import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { currentUserForRequest, profileForRequest, sellerAccessForRequest } from "@/lib/auth/request-scope"
import { hasSellerAccess } from "@/lib/account/seller-access"
import { WELCOMED_KEY, welcomeDone } from "@/lib/account/welcome"
import { BUYER_HOME, SELLER_HOME, safeNext, withCarry } from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"
import { isStandInName, nameFromEmail, personName, providerNameOf } from "@/lib/profile/display-name"
import { StartOnboarding } from "./start-onboarding"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Welcome to Storelib",
  robots: { index: false, follow: false },
}

/**
 * ===========================================================================
 *  /onboarding/start: A NEW ACCOUNT'S FIRST STEPS
 * ===========================================================================
 * Where the end of a sign up sends a new account once (lib/account/welcome
 * throughWelcome, from app/auth/continue and app/auth/callback): the same
 * onboarding as /sell, opening on one question, "I want to sell" (the
 * store setup, unchanged) or "I'm here to join and buy" (a name, a photo,
 * notifications in the app, done). Decided here, on the server:
 *
 *   signed out          -> /login, carrying next
 *   a seller            -> /app
 *   answered before     -> where they were going
 *   anybody else        -> the onboarding, with the name to start from
 *
 * The name it starts from is the one Google or Apple sent, else the one on
 * the profile when it is theirs, else words from the email: never the
 * email's raw letters, never a placeholder (lib/profile/display-name).
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const next = safeNext(typeof params.next === "string" ? params.next : null, getMainDomain())

  const current = await currentUserForRequest()
  const user = current.user
  if (!user) redirect(withCarry("/login", { next }))

  const [profile, access] = await Promise.all([profileForRequest(user.id), sellerAccessForRequest(user.id)])
  if (hasSellerAccess(access)) redirect(next && (next === SELLER_HOME || next.startsWith(`${SELLER_HOME}/`)) ? next : SELLER_HOME)
  if (user.user_metadata?.[WELCOMED_KEY] === true) redirect(welcomeDone(next ?? BUYER_HOME))

  const meta = (user.user_metadata ?? null) as Record<string, unknown> | null
  const stored = profile?.display_name ?? null
  const name =
    providerNameOf(meta) ??
    (isStandInName(stored, user.email) ? nameFromEmail(user.email) : personName({ name: stored, email: user.email })) ??
    ""

  return <StartOnboarding next={next} name={name} username={profile?.username?.trim() || null} />
}
