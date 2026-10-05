import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { currentUserForRequest, profileForRequest, sellerAccessForRequest } from "@/lib/auth/request-scope"
import { shouldSendToLogin } from "@/lib/auth/current-user"
import { hasSellerAccess } from "@/lib/account/seller-access"
import { WELCOMED_KEY, welcomeDone } from "@/lib/account/welcome"
import { BUYER_HOME, SELLER_HOME, safeNext, withCarry } from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"
import { isStandInName, nameFromEmail, personName, providerNameOf } from "@/lib/profile/display-name"
import { providerPhotoOf } from "@/lib/profile/provider-photo"
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
 * throughWelcome, from app/auth/continue and app/auth/callback): two slides
 * in the same onboarding /sell uses for a store, without the store. A
 * profile (photo, name, username, optional bio, prefilled from Google or
 * Apple), then notifications. Seller setup stays on /sell. Decided here:
 *
 *   signed out          -> /login, carrying next (a blip reading the
 *                          session goes on to `next` instead)
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
  /* Signed out: sign in, then back here. A blip reading the session is not a sign out: on to where they were going, and the question waits for another visit. */
  if (shouldSendToLogin(current)) redirect(withCarry("/login", { next }))
  if (!current.user) redirect(welcomeDone(next))
  const user = current.user

  const [profile, access] = await Promise.all([profileForRequest(user.id), sellerAccessForRequest(user.id)])
  if (hasSellerAccess(access)) redirect(next && (next === SELLER_HOME || next.startsWith(`${SELLER_HOME}/`)) ? next : SELLER_HOME)
  if (user.user_metadata?.[WELCOMED_KEY] === true) redirect(welcomeDone(next ?? BUYER_HOME))

  const meta = (user.user_metadata ?? null) as Record<string, unknown> | null
  const stored = profile?.display_name ?? null
  const name =
    providerNameOf(meta) ??
    (isStandInName(stored, user.email) ? nameFromEmail(user.email) : personName({ name: stored, email: user.email })) ??
    ""
  const avatar = profile?.avatar_url || providerPhotoOf(meta)
  /* profiles.bio may not exist on an older database: a missing column is an empty bio, not a failed page. */
  let bio = ""
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { data, error } = await createAdminClient().from("profiles").select("bio").eq("id", user.id).maybeSingle()
    if (!error && typeof (data as { bio?: string | null } | null)?.bio === "string") bio = ((data as { bio: string }).bio || "").trim()
  } catch {
    bio = ""
  }

  return <StartOnboarding next={next} name={name} username={profile?.username?.trim() || null} avatar={avatar} bio={bio} />
}
