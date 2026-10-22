/**
 * ===========================================================================
 *  "CREATE ACCOUNT" WITH AN ADDRESS THAT ALREADY HAS ONE
 * ===========================================================================
 * The owner, from a receipt: "if I click create an account ... when I click
 * sign in it tells me welcome back, because I clicked create an account when
 * I already have an account, so it doesn't know to distinguish."
 *
 * The sign up form asks /api/auth/account-origin about the address before it
 * makes anything (rate limited there). When the answer is "it exists", the
 * form says so and moves to sign in: the login page opens with the address
 * filled in, a line saying why they are there instead, and the same carry
 * (intent and the page to return to, lib/auth/continue.ts), so a sign up
 * started on a receipt still ends on that receipt.
 *
 * The address travels in this tab's sessionStorage, not in the URL, so it is
 * never written to a server log or a browser's shared history. A login page
 * opened any other way finds nothing there and behaves as it always did.
 */
import { withCarry, type AuthCarry } from "./continue"

export const EXISTING_EMAIL_KEY = "storelib_existing_account_email"
/** The flag on /login that says "you came from sign up, and this address has an account". */
export const EXISTS_PARAM = "exists"

/** Where sign up sends an address that already has an account. */
export function signInInsteadHref(rawEmail: string, carry: Partial<AuthCarry>, storage: Pick<Storage, "setItem"> | null = safeSession()): string {
  const email = rawEmail.trim().toLowerCase()
  try {
    if (email) storage?.setItem(EXISTING_EMAIL_KEY, email)
  } catch {
    /* No storage: the login page opens without the address filled in, and still says why. */
  }
  return withCarry(`/login?${EXISTS_PARAM}=1`, carry)
}

/** The address sign up handed over, read once. */
export function takeExistingEmail(storage: Pick<Storage, "getItem" | "removeItem"> | null = safeSession()): string | null {
  try {
    const value = storage?.getItem(EXISTING_EMAIL_KEY) ?? null
    storage?.removeItem(EXISTING_EMAIL_KEY)
    return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null
  } catch {
    return null
  }
}

function safeSession(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}
