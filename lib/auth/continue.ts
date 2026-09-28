import { safeReturnTarget } from "@/lib/auth/return-to"
import { hasSellerAccess, type SellerAccess } from "@/lib/account/seller-access"

/**
 * ===========================================================================
 *  WHERE SOMEBODY GOES ONCE THEY ARE SIGNED IN, AND WHY THEY CAME
 * ===========================================================================
 * One signup and one login for everyone. Two things travel with a person
 * through every hop of it (signup, the email code, Google or Apple, the
 * native app's OAuth bridge, a password reset, the welcome screen) and are
 * read once, at the end, by /auth/continue:
 *
 *   INTENT. Only "sell" exists. It means they pressed Sell on Storelib or
 *   Become a seller, so the end of signing in is seller onboarding, not the
 *   buyer side. Anything else in the parameter is ignored.
 *
 *   NEXT. The page they were on, so a plain login puts them back where they
 *   were. Checked with the same rule as every other return target
 *   (lib/auth/return-to.ts): a path here, or an https address on storelib.com
 *   or one of its subdomains, which is where a creator's shop sends a shopper
 *   who pressed Account. Anything else is dropped, so the sign in page can
 *   never be used to launder somebody else's link. The auth screens
 *   themselves are dropped too, since coming back to /login after logging in
 *   is a loop, not a destination.
 *
 * Everything in this file is pure, so the whole table is a unit test
 * (tests/sell-intent.test.ts) and the same function decides on the server
 * and in the app.
 */

export const SELL_INTENT = "sell" as const
export type AuthIntent = typeof SELL_INTENT

export interface AuthCarry {
  intent: AuthIntent | null
  next: string | null
}

/** The only intent there is. Case and spaces do not matter; anything else is none. */
export function readIntent(raw: unknown): AuthIntent | null {
  return typeof raw === "string" && raw.trim().toLowerCase() === SELL_INTENT ? SELL_INTENT : null
}

/**
 * Screens that are part of signing in. Being sent back to one of them after
 * signing in would start it again, so a `next` that names one is no target.
 */
const AUTH_SCREENS = [
  "/login",
  "/signup",
  "/auth",
  "/verify-email",
  "/reset-password",
  "/request",
  "/welcome",
  "/native-start",
  "/onboarding",
  "/sell",
]

function isAuthScreen(target: string): boolean {
  if (!target.startsWith("/")) return false
  const path = target.split(/[?#]/)[0].toLowerCase()
  return AUTH_SCREENS.some((s) => path === s || path.startsWith(`${s}/`))
}

/**
 * A `next` worth following, or null. Same rule as lib/auth/return-to.ts
 * (a path here, or https on the platform or a subdomain of it), minus the
 * auth screens. `mainDomain` is passed in so the tests can name it.
 */
export function safeNext(raw: unknown, mainDomain: string): string | null {
  const target = safeReturnTarget(raw, { mainDomain })
  if (!target) return null
  if (isAuthScreen(target)) return null
  return target
}

/** Both carried values out of a query string, each checked. */
export function readCarry(
  params: { get(name: string): string | null } | URLSearchParams,
  mainDomain: string,
): AuthCarry {
  return {
    intent: readIntent(params.get("intent")),
    /* `redirect` is the older name the receipt page still sends. */
    next: safeNext(params.get("next") ?? params.get("redirect"), mainDomain),
  }
}

/**
 * A path with the carried values added to its query, leaving whatever it
 * already had. "/signup" with sell and "/library" is
 * "/signup?intent=sell&next=%2Flibrary". Nothing is added that is not set, so
 * an ordinary login link stays "/login".
 */
export function withCarry(path: string, carry: Partial<AuthCarry>): string {
  const [beforeHash, hash = ""] = path.split("#", 2)
  const [base, query = ""] = beforeHash.split("?", 2)
  const params = new URLSearchParams(query)
  if (carry.intent) params.set("intent", carry.intent)
  else params.delete("intent")
  if (carry.next) params.set("next", carry.next)
  const q = params.toString()
  return `${base}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`
}

/** Where every sign in ends: the server decides from here (app/auth/continue). */
export const CONTINUE_PATH = "/auth/continue"

export function continueHref(carry: Partial<AuthCarry>): string {
  return withCarry(CONTINUE_PATH, carry)
}

/** The buyer's home: Discover. */
export const BUYER_HOME = "/explore"
/**
 * A buyer's home when the app opens cold (lib/native-bridge cacheNativeHome).
 * The library, not Discover: the offline shell inside the installed apps
 * (out/index.html) only knows the homes it shipped with, and turns any other
 * into /app, which would send a buyer to seller onboarding on every launch.
 */
export const NATIVE_BUYER_HOME = "/library"
/** The seller's home: the dashboard. */
export const SELLER_HOME = "/app"
/** Seller onboarding, for anybody signed in who does not have seller access yet. */
export const SELL_PATH = "/sell"

function isAppPath(target: string): boolean {
  if (!target.startsWith("/")) return false
  const path = target.split(/[?#]/)[0]
  return path === "/app" || path.startsWith("/app/")
}

/**
 * ===========================================================================
 *  THE DECISION, ONCE SIGNED IN AND VERIFIED
 * ===========================================================================
 *
 *   intent  seller access  next             goes to
 *   sell    yes            /app/...         that /app page
 *   sell    yes            anything else    /app
 *   sell    no             any              /sell (seller onboarding),
 *                                           carrying next as the way back
 *   none    yes            set              next
 *   none    yes            none             /app
 *   none    no             /app/...         /sell: /app is for sellers, and
 *                                           /sell is the door into it
 *   none    no             set              next
 *   none    no             none             /explore
 *
 * "No seller access" includes a half finished onboarding: /sell opens the
 * setup again, it does not count as being a seller.
 */
export function destinationAfterAuth(carry: AuthCarry, access: SellerAccess): string {
  const seller = hasSellerAccess(access)
  if (carry.intent === SELL_INTENT) {
    if (seller) return carry.next && isAppPath(carry.next) ? carry.next : SELLER_HOME
    return carry.next && !isAppPath(carry.next) ? withCarry(SELL_PATH, { next: carry.next }) : SELL_PATH
  }
  if (carry.next) {
    if (isAppPath(carry.next) && !seller) return SELL_PATH
    return carry.next
  }
  return seller ? SELLER_HOME : BUYER_HOME
}

/**
 * ===========================================================================
 *  THE CARRY ACROSS AN OAUTH ROUND TRIP
 * ===========================================================================
 * Supabase checks the OAuth `redirectTo` against an allow-list, and an entry
 * written as an exact URL stops matching the moment a parameter is added
 * (see app/auth/start). So the carry cannot ride on the callback URL. It
 * goes in a short lived cookie on the platform instead, written by
 * /auth/start in the same browser (the Custom Tab, on Android) that
 * /auth/callback runs in, and read once there.
 *
 * In the native app's own OAuth (lib/native-oauth.ts) the page that pressed
 * the button is the page that gets the deep link back, so the same encoded
 * value is kept in its storage instead (NATIVE_CARRY_KEY).
 */
export const CARRY_COOKIE = "storelib_auth_carry"
export const CARRY_MAX_AGE_SECONDS = 15 * 60
export const NATIVE_CARRY_KEY = "storelib_auth_carry"

export function encodeCarry(carry: Partial<AuthCarry>): string {
  const params = new URLSearchParams()
  if (carry.intent) params.set("intent", carry.intent)
  if (carry.next) params.set("next", carry.next)
  return params.toString()
}

/** The value back, checked again: a cookie is only as trustworthy as the browser that sent it. */
export function decodeCarry(raw: string | null | undefined, mainDomain: string): AuthCarry {
  if (!raw) return { intent: null, next: null }
  try {
    return readCarry(new URLSearchParams(raw), mainDomain)
  } catch {
    return { intent: null, next: null }
  }
}

/**
 * A path on this site, and only that, for the routes that put `${origin}` in
 * front of what they were given (sync-session, the Android App Link). An
 * address that is not a plain path would make `${origin}${next}` another
 * host: "https://storelib.com" + "@evil.com" is evil.com.
 */
export function sameOriginPath(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback
  const value = raw.trim()
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s\\]/.test(value)) return fallback
  if (value.length > 2048) return fallback
  return value
}

/**
 * ===========================================================================
 *  /sell, AS A TABLE (app/(auth)/sell/page.tsx)
 * ===========================================================================
 *
 *   signed in  verified  seller access   answer
 *   no         -         -               /signup?intent=sell (and next)
 *   yes        no        -               /signup/verify, carrying intent=sell
 *   yes        yes       seller          /app
 *   yes        yes       started, none   seller onboarding, drawn on /sell
 */
export type SellDecision = { kind: "redirect"; to: string } | { kind: "onboarding" }

export function sellDecision(input: {
  user: { id: string; email?: string | null } | null
  emailVerified: boolean
  access: SellerAccess
  next: string | null
}): SellDecision {
  const carry = { intent: SELL_INTENT, next: input.next }
  if (!input.user) return { kind: "redirect", to: withCarry("/signup", carry) }
  if (!input.emailVerified) {
    return {
      kind: "redirect",
      to: withCarry(
        `/signup/verify?userId=${encodeURIComponent(input.user.id)}&email=${encodeURIComponent(input.user.email ?? "")}`,
        carry,
      ),
    }
  }
  if (hasSellerAccess(input.access)) return { kind: "redirect", to: SELLER_HOME }
  return { kind: "onboarding" }
}
