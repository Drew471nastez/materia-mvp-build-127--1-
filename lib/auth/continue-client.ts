"use client"

import { createClient } from "@/lib/supabase/client"
import { readSellerAccess, hasSellerAccess } from "@/lib/account/seller-access"
import { cacheNativeHome } from "@/lib/native-bridge"
import {
  NATIVE_BUYER_HOME,
  NATIVE_CARRY_KEY,
  SELLER_HOME,
  continueHref,
  decodeCarry,
  encodeCarry,
  type AuthCarry,
} from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"
import { readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"

/** The header's record says signed in as this person, keeping what it knew of them (lib/auth/auth-snapshot.ts). */
export function rememberSignedIn(userId: string): void {
  const known = readAuthSnapshot()
  const same = known && known.userId === userId ? known : null
  writeAuthSnapshot({
    signedIn: true,
    userId,
    avatarUrl: same ? same.avatarUrl : null,
    displayName: same ? same.displayName : null,
    username: same ? same.username : null,
    isSeller: same ? same.isSeller : false,
  })
}

/**
 * ===========================================================================
 *  THE BROWSER'S HALF OF /auth/continue
 * ===========================================================================
 * A screen that has just signed somebody in (the login form, the email code,
 * the native OAuth handler) does not decide where they go. It hands the carry
 * to /auth/continue in one hard navigation and the server answers with one
 * redirect (lib/auth/continue.ts). A hard navigation, because the session
 * cookie the browser client has just written has to go with the request.
 *
 * In the native app the session lives in the device store, not in cookies,
 * so it goes through /auth/sync-session first, which writes the cookies on
 * its own redirect and then follows `next` to /auth/continue.
 */

type Tokens = { access_token?: string | null; refresh_token?: string | null; user?: { id?: string } | null } | null | undefined

function isNativeShell(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    return cap?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

/** The URL `goOnAfterAuth` navigates to. Split out so it can be tested and reused. */
export function afterAuthUrl(carry: Partial<AuthCarry>, session: Tokens, native: boolean): string {
  const target = continueHref(carry)
  if (native && session?.access_token && session?.refresh_token) {
    return (
      `/auth/sync-session` +
      `?access_token=${encodeURIComponent(session.access_token)}` +
      `&refresh_token=${encodeURIComponent(session.refresh_token)}` +
      `&next=${encodeURIComponent(target)}`
    )
  }
  return target
}

/**
 * On to wherever this person belongs. In the app, the home a cold start
 * opens on is remembered first (the library for a buyer, the dashboard for a
 * seller), with a ceiling so a slow read never holds the navigation.
 */
export async function goOnAfterAuth(carry: Partial<AuthCarry>, session: Tokens): Promise<void> {
  /*
    SIGNED IN, SAID BEFORE THE NEXT PAGE PAINTS. The phone's tab bar is
    decided by a line that reads the header's record of the session as the
    page is parsed (components/nav/buyer-tab-bar.tsx SIGNED_IN_BOOT), and the
    record was only written once a header on the next page had asked
    Supabase, so a first sign in on this browser landed with no bar, and the
    library or receipt under it, until that answer came. The header still
    checks and corrects every field of it; this is the head start only.
  */
  if (session?.user?.id) rememberSignedIn(session.user.id)
  const native = isNativeShell()
  if (native && session?.user?.id) {
    const userId = session.user.id
    await Promise.race([
      readSellerAccess(createClient(), userId).then((access) =>
        cacheNativeHome(hasSellerAccess(access) ? SELLER_HOME : NATIVE_BUYER_HOME),
      ),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]).catch(() => {})
  }
  window.location.replace(afterAuthUrl(carry, session, native))
}

/**
 * The carry across the native app's own OAuth, where the page that opened
 * the browser is the page the deep link comes back to (lib/native-oauth.ts).
 * localStorage rather than sessionStorage, for a WebView the system reloaded
 * while the browser was open; a timestamp, so an abandoned attempt from last
 * week does not turn today's plain login into seller onboarding.
 */
const NATIVE_CARRY_MAX_AGE_MS = 15 * 60 * 1000

export function rememberNativeCarry(carry: Partial<AuthCarry>): void {
  try {
    const value = encodeCarry(carry)
    if (!value) localStorage.removeItem(NATIVE_CARRY_KEY)
    else localStorage.setItem(NATIVE_CARRY_KEY, JSON.stringify({ value, at: Date.now() }))
  } catch {
    /* storage refused: the sign in still works, it lands on the default */
  }
}

export function takeNativeCarry(): AuthCarry {
  try {
    const raw = localStorage.getItem(NATIVE_CARRY_KEY)
    localStorage.removeItem(NATIVE_CARRY_KEY)
    if (!raw) return { intent: null, next: null }
    const { value, at } = JSON.parse(raw) as { value?: string; at?: number }
    if (typeof at !== "number" || Date.now() - at > NATIVE_CARRY_MAX_AGE_MS) return { intent: null, next: null }
    return decodeCarry(value, getMainDomain())
  } catch {
    return { intent: null, next: null }
  }
}
