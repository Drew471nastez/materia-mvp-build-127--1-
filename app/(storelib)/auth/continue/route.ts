import { NextResponse, after } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { readCurrentUser } from "@/lib/auth/current-user"
import { getMainDomain } from "@/lib/url-helpers"
import { hasSellerAccess, sellerAccessFrom } from "@/lib/account/seller-access"
import { throughWelcome } from "@/lib/account/welcome"
import { APP_OPEN_USED, destinationWithAppOpen } from "@/lib/account/app-open"
import { createAdminClient } from "@/lib/supabase/admin"
import { INVITE_COOKIE, inviteFallbackNext } from "@/lib/team/invite-links"
import { onATeam } from "@/lib/team/server"
import { keepProfileName, type KeepNameDb } from "@/lib/profile/keep-name"
import { attachGuestOrdersByEmail } from "@/lib/orders/attach-guest-orders"
import { ARRIVAL_COOKIE, arrivalCookieOptions, arrivalOf } from "@/lib/auth/arrival"
import {
  CARRY_COOKIE,
  decodeCarry,
  destinationAfterAuth,
  readCarry,
  withCarry,
  type AuthCarry,
} from "@/lib/auth/continue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** How long a sign in waits for its guest orders to join the account (lib/orders/attach-guest-orders.ts). */
const ATTACH_WAIT_MS = 2500

/**
 * ===========================================================================
 *  GET /auth/continue?intent=sell&next=/somewhere
 * ===========================================================================
 * The end of every way in: a password, a Google or Apple account, the email
 * code, the native app's OAuth, somebody who was already signed in. Each of
 * those used to decide for itself where to send a person, with its own copy
 * of the rules and its own client side bounce, and the copies disagreed.
 * Now they all come here, and this answers on the server with one 302:
 *
 *   signed out                -> /login, carrying intent and next
 *   email not verified        -> /signup/verify, carrying them
 *   otherwise                 -> lib/auth/continue.ts destinationAfterAuth:
 *                                /sell, /app, next, or /explore
 *
 * The carry comes from the query string, or, after an OAuth round trip that
 * could not keep one, from the short lived cookie /auth/start wrote (read
 * once and cleared here).
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const mainDomain = getMainDomain()
  const jar = await cookies()

  let carry: AuthCarry = readCarry(url.searchParams, mainDomain)
  const saved = jar.get(CARRY_COOKIE)?.value
  if (saved) {
    if (!carry.intent && !carry.next) carry = decodeCarry(saved, mainDomain)
    jar.delete(CARRY_COOKIE)
  }

  const go = (target: string) => NextResponse.redirect(new URL(target, url.origin), { status: 303 })

  const supabase = await createClient()
  /*
    WHEN SUPABASE AUTH DOES NOT ANSWER, the access token's signature is
    checked against Supabase's public keys instead (lib/auth/current-user.ts
    fallbackClaims, as lib/auth/request-scope.ts and route-user do), so a
    signed in person is sent on to where they were going rather than to the
    login form. This route only decides a redirect; every page it sends to
    checks again, and the guest order attach below asks Auth itself and
    attaches nothing when it cannot (lib/orders/attach-guest-orders.ts).
  */
  const current = await readCurrentUser(supabase, { fallbackClaims: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null })
  const user = current.user

  /* A team invite opened before signing in, when nothing else said where to go (lib/team/invite-links.ts). Read once a person is in. */
  const invite = jar.get(INVITE_COOKIE)?.value
  if (invite && user) {
    carry = { ...carry, next: inviteFallbackNext(carry.next, invite) }
    jar.delete(INVITE_COOKIE)
  }

  /*
    NOBODY HERE, OR WE COULD NOT TELL. Either way the login page is the
    right place: it reads the session the browser holds (in the native app
    that is the device store, not a cookie) and sends a signed in person
    straight back here with it.
  */
  if (!user) return go(withCarry("/login", carry))

  const [{ data: profile }, { data: creator }] = await Promise.all([
    supabase.from("profiles").select("email_verified, is_creator").eq("id", user.id).maybeSingle(),
    supabase.from("creators").select("onboarding_completed").eq("user_id", user.id).maybeSingle(),
  ])

  if (!(profile as { email_verified?: boolean | null } | null)?.email_verified) {
    /* No `sent`: the verify page sends a fresh code when it opens without one. */
    return go(
      withCarry(`/signup/verify?userId=${encodeURIComponent(user.id)}`, carry),
    )
  }

  /*
    WHAT THEY BOUGHT AS A GUEST WITH THIS ADDRESS IS THEIRS NOW, before the
    redirect, so the library or the receipt they land on already shows it
    (lib/orders/attach-guest-orders.ts). Only here, after the address is
    known to be verified. Bounded: a slow database delays a sign in by at
    most a moment and the orders join on the next one.
  */
  await Promise.race([
    attachGuestOrdersByEmail(createAdminClient(), { id: user.id, email: user.email }),
    new Promise((resolve) => setTimeout(resolve, ATTACH_WAIT_MS)),
  ]).catch(() => null)

  const access = sellerAccessFrom({
    creator: creator as { onboarding_completed?: boolean | null } | null,
    profile: profile as { is_creator?: boolean | null } | null,
  })
  /* A name for the account, from the provider or the handle, over a made up one (lib/profile/keep-name), after the answer. */
  after(() => keepProfileName(createAdminClient() as unknown as KeepNameDb, user).then(() => undefined))
  /*
    A new account sets its profile once, on its way to where it was going
    (lib/account/welcome). A sign-in with nowhere else to go opens the page
    the account remembered (the app, after a join or Open in the app).
  */
  /* On a store's team with no store of their own: the dashboard is that store's, never onboarding (lib/team/landing). */
  const teamMember = !hasSellerAccess(access) && (await onATeam(createAdminClient(), user.id))
  const opened = destinationWithAppOpen(destinationAfterAuth(carry, access, { teamMember }), user.user_metadata, carry.next)
  if (opened.used) after(() => supabase.auth.updateUser({ data: { [APP_OPEN_USED]: opened.used } }).then(() => undefined))
  const response = go(throughWelcome(opened.destination, { createdAt: user.created_at, meta: user.user_metadata, seller: hasSellerAccess(access), intent: carry.intent }))
  /* "Account created" or "Welcome back" on the page they land on, from the account's age, not the button pressed (lib/auth/arrival.ts). */
  response.cookies.set(ARRIVAL_COOKIE, arrivalOf(user.created_at), arrivalCookieOptions(url.protocol === "https:"))
  return response
}
