/**
 * ===========================================================================
 *  THE SIGN UP CODE PAGE CARRIES NO EMAIL ADDRESS IN ITS URL (SEC-11)
 * ===========================================================================
 * /signup/verify used to be opened as ?userId=…&email=…, so a person's
 * address sat in browser history, in request logs and in the Referer of the
 * next page. The code is bound to the account (lib/auth/email-code.ts reads
 * the address from Supabase Auth and ignores the request's), so the page needs
 * only the account id, which is not personal data.
 *
 * The page still SHOWS the address, masked, from the first of:
 *   1. this tab's memory, written by the signup and login pages just before
 *      they open it (rememberVerifyAddress), for this account id only;
 *   2. the signed in session, when it is the same account;
 *   3. an `email` in an old link (codes already mailed, open tabs): read
 *      once, then taken off the address bar (addressWithoutEmail).
 * None of them: "your email address". Nothing here is logged.
 */

const KEY = "storelib-verify-address"

type Store = Pick<Storage, "getItem" | "setItem">

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** The address a person just typed, kept in this tab for the code page of this account. */
export function rememberVerifyAddress(userId: string, email: string, s: Store | null = store()): void {
  if (!s || !userId || !email) return
  try {
    s.setItem(KEY, JSON.stringify({ userId, email }))
  } catch {
    /* private mode: the page says "your email address" */
  }
}

/** The address kept for this account id, or "". */
export function recallVerifyAddress(userId: string, s: Store | null = store()): string {
  if (!s || !userId) return ""
  try {
    const kept = JSON.parse(s.getItem(KEY) ?? "null") as { userId?: unknown; email?: unknown } | null
    return kept && kept.userId === userId && typeof kept.email === "string" ? kept.email : ""
  } catch {
    return ""
  }
}

/** The code page's own address with any `email` taken off, or null when there was none. */
export function addressWithoutEmail(href: string): string | null {
  const url = new URL(href)
  if (!url.searchParams.has("email")) return null
  url.searchParams.delete("email")
  return `${url.pathname}${url.search}${url.hash}`
}

/** What the page shows: "ab*****@example.com", never the whole address. */
export function maskedAddress(email: string): string {
  return email.replace(/(.{2})(.*)(@.*)/, (_, a: string, b: string, c: string) => a + "*".repeat(Math.min(b.length, 5)) + c)
}

/** The code page for an account, by id only. */
export function signupVerifyPath(userId: string): string {
  return `/signup/verify?userId=${encodeURIComponent(userId)}`
}
