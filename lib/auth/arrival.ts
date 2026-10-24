/**
 * ===========================================================================
 *  "ACCOUNT CREATED" OR "WELCOME BACK", FROM THE ACCOUNT, NOT THE BUTTON
 * ===========================================================================
 * The owner, from a receipt: "when I click sign in it tells me welcome back,
 * because I clicked create an account when I already have an account, so it
 * doesn't know to distinguish."
 *
 * Which button was pressed says nothing about the account: Create account
 * with Google signs an existing account in, and Sign in with Google makes
 * one for an address Storelib has never seen. So the end of every way in
 * (app/auth/continue, app/auth/callback) asks the account itself: made a
 * moment ago is new, anything older is coming back. The answer rides to the
 * page they land on in a short lived cookie that names only which of the two
 * it is, and components/auth/arrival-note.tsx says it once and clears it.
 */

export type Arrival = "new" | "back"

/** The cookie the end of a sign in leaves for the page it lands on. Readable by the page, which clears it. */
export const ARRIVAL_COOKIE = "sl_arrival"

/** Long enough to outlast the welcome step a new account goes through on its way (lib/account/welcome). */
export const ARRIVAL_MAX_AGE_SECONDS = 10 * 60

/**
 * An account made within this long of the sign in that ends here is a new
 * one. The email way in makes the account before the code is typed, so the
 * window covers the code's own life; Google and Apple make it in the same
 * second as the callback.
 */
export const NEW_ACCOUNT_WINDOW_MS = 15 * 60 * 1000

/** "new" when the account was made within the window before `now`, else "back". A date that cannot be read is "back". */
export function arrivalOf(createdAt: string | null | undefined, now: number = Date.now()): Arrival {
  const made = createdAt ? Date.parse(createdAt) : NaN
  if (!Number.isFinite(made)) return "back"
  const age = now - made
  return age >= -60_000 && age <= NEW_ACCOUNT_WINDOW_MS ? "new" : "back"
}

/** The words for each, in the order the note says them. */
export const ARRIVAL_WORDS: Record<Arrival, string> = {
  new: "Account created",
  back: "Welcome back",
}

/** The cookie's value read back: only the two known words, anything else is nothing. */
export function readArrival(raw: string | null | undefined): Arrival | null {
  return raw === "new" || raw === "back" ? raw : null
}

/** The value from a whole `document.cookie` string. */
export function arrivalFromCookieString(cookie: string): Arrival | null {
  const hit = cookie.split(/;\s*/).find((c) => c.startsWith(`${ARRIVAL_COOKIE}=`))
  return readArrival(hit ? decodeURIComponent(hit.slice(ARRIVAL_COOKIE.length + 1)) : null)
}

/**
 * Pages the note waits past: the sign in screens themselves and the welcome
 * step a new account is taken through on its way. It is said on the page
 * they were going to, not on the way there.
 */
export function arrivalWaitsOn(pathname: string): boolean {
  return /^\/(login|signup|onboarding|auth|verify-email|reset-password|welcome)(\/|$)/.test(pathname)
}

/** The options both routes set it with. */
export function arrivalCookieOptions(secure: boolean) {
  return { path: "/", httpOnly: false, sameSite: "lax" as const, secure, maxAge: ARRIVAL_MAX_AGE_SECONDS }
}
