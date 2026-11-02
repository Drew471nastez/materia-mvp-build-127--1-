/**
 * ===========================================================================
 *  NOTHING PRIVATE IN A LOG LINE, WHOEVER WROTE THE LINE
 * ===========================================================================
 * lib/net/log.ts cleans what its own callers pass. Most of the 700 routes
 * still log with a bare console.error(e), and an error from supabase-js, a
 * fetch or Stripe can carry a token, a cookie, a key or a customer's address
 * in its message or stack. scrubSecrets() is the one rule for all of them:
 * the console guard (lib/net/console-guard.ts) runs every server error and
 * warning line through it, and so do reportError and logLine.
 *
 *   a JWT (an access token, a session cookie's payload)   [jwt]
 *   Authorization: Bearer <anything>                      Bearer [token]
 *   a Stripe, Resend, Supabase or webhook key             [key]
 *   a Supabase session cookie's value                     sb-x-auth-token=[cookie]
 *   token=, password=, secret=, apikey=... values         name=[redacted]
 *   a Cookie header, ?code= in an address                  [redacted]
 *   an email address                                      ja***@gmail.com (lib/privacy/mask-email)
 *   15 to 19 digits that pass the Luhn check              [card]
 *
 * Ids, amounts, routes and error codes stay: those are what a log is for.
 * Pure, no imports: safe at the edge, in the proxy and in a test.
 */

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi
const KEYISH = /\b(?:sk|pk|rk|whsec|re|sb|sbp)_(?:live_|test_|secret_|publishable_)?[A-Za-z0-9]{12,}\b/g
const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/g
const SB_COOKIE = /\b(sb-[A-Za-z0-9-]+-auth-token(?:-code-verifier)?(?:\.\d+)?)=[^;\s,"']+/g
/* `name=value` or `"name":"value"` for a name that holds a secret, in a query string, a form body or JSON. */
const SECRET_PAIR =
  /(["']?\b(?:access_token|refresh_token|id_token|token|password|passwd|secret|client_secret|api[_-]?key|apikey|authorization|signature|otp)\b["']?\s*[:=]\s*["']?)([^"'&\s,;}]{3,})/gi
/* A whole Cookie header: every value in it. */
const COOKIE_HEADER = /(\b(?:set-)?cookie["']?\s*[:=]\s*["']?)[^"'\n]+/gi
/* `?code=` / `&code=` in an address: a sign in or reset code. A bare "code" key stays, it is PostgREST's error code. */
const QUERY_CODE = /([?&](?:code|token_hash|state)=)[^&\s"'#]+/gi
const EMAIL = /([A-Za-z0-9._%+-]{1,64})@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g
/* 15 to 19 digits, optionally grouped, that pass the Luhn check: a card number. A 13 digit millisecond time is not one. */
const CARD = /\b(?:\d[ -]?){14,18}\d\b/g

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

export function scrubSecrets(input: string): string {
  if (!input) return input
  return input
    .replace(JWT, "[jwt]")
    .replace(BEARER, (_m, kind: string) => `${kind} [token]`)
    .replace(KEYISH, "[key]")
    .replace(AWS_KEY, "[key]")
    .replace(SB_COOKIE, "$1=[cookie]")
    .replace(COOKIE_HEADER, "$1[redacted]")
    .replace(QUERY_CODE, "$1[redacted]")
    .replace(SECRET_PAIR, (_m, name: string, value: string) => (value.startsWith("[") ? `${name}${value}` : `${name}[redacted]`))
    .replace(EMAIL, (_m, local: string, domain: string) => `${local.slice(0, Math.min(2, local.length))}***@${domain}`)
    .replace(CARD, (m) => {
      const digits = m.replace(/\D/g, "")
      return digits.length >= 15 && digits.length <= 19 && luhn(digits) ? "[card]" : m
    })
}
