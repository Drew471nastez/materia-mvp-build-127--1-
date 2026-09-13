/**
 * ===========================================================================
 *  WHAT WENT WRONG WITH SIGN IN, SAID TO A PERSON
 * ===========================================================================
 * A creator was shown this, in red, under the email field:
 *
 *     Unable to exchange external code: c300...
 *
 * Three separate things are wrong with that line.
 *
 * IT MEANS NOTHING TO THEM. It is GoTrue's internal wording for one step of
 * one protocol. There is no action in it. The person is left on a login form
 * that has just told them, in red, that they are not allowed in.
 *
 * IT IS A CREDENTIAL. `c300...` is Apple's authorization code, printed in
 * full. It reached the screen because it reached the URL, which means it is
 * in history, in the WebView's session, and in anything that samples URLs.
 * It is spent by the time it is shown, so this is not an open door, but a
 * credential belongs in neither of those places and it is one line of code to
 * keep it out.
 *
 * IT IS USUALLY TEMPORARY, AND WE TREATED IT AS FINAL. This particular
 * failure is Supabase's server failing to trade Apple's authorization code
 * for a token at appleid.apple.com. Apple's codes are single use and live
 * five minutes, so the common causes are a person who spent longer than that
 * on the Apple screen with a second device, and a callback that arrived
 * twice. Both work on the next attempt. Showing a dead end for something that
 * a retry fixes is the difference between an outage and a hiccup.
 *
 * ---------------------------------------------------------------------------
 *  WHAT THIS FILE IS
 * ---------------------------------------------------------------------------
 * One place that turns whatever an OAuth provider or GoTrue said into
 *
 *   - a short code that is safe to put in a URL, and
 *   - a sentence that names what happened and what to do, and
 *   - whether trying again is likely to work.
 *
 * NOTHING UPSTREAM IS EVER PASSED THROUGH. Not narrowed, not escaped, not
 * truncated: the upstream string is read, classified, and dropped. That is
 * what makes the leak impossible rather than unlikely, and it is checked in
 * tests/oauth-errors.test.ts against the exact string that shipped.
 *
 * Pure, and it imports nothing, so both the server routes and the native
 * deep link handler use the same judgement.
 */

export type OAuthProvider = "apple" | "google"

/**
 * URL-safe, stable, and meaningless on its own, which is the point: the login
 * page holds the words, the URL holds a key. Renaming a sentence then never
 * touches a redirect, and a redirect can never carry a sentence somebody
 * upstream wrote.
 */
export type OAuthErrorCode =
  /** The provider could not be reached, or would not finish. Try again. */
  | "exchange_failed"
  /** The browser lost the half of the handshake it was holding. Try again. */
  | "flow_lost"
  /** The code or link had already been used, or had aged out. Try again. */
  | "expired"
  /** They pressed cancel, or closed the sheet. Not an error. */
  | "cancelled"
  /** Our end is misconfigured: a key, a secret, an allowed URL. */
  | "provider_unavailable"
  /** The email belongs to an account that signs in another way. */
  | "wrong_method"
  /** A signup this account is not allowed to make. */
  | "not_allowed"
  /** Classified as nothing in particular. */
  | "unknown"

export interface OAuthFailure {
  code: OAuthErrorCode
  /** Safe to render. Written here, never upstream. */
  message: string
  /** Whether starting the same flow again is likely to succeed. */
  retryable: boolean
  /**
   * Whether this is the owner's problem rather than the person's, so the
   * server log can say so loudly while the screen stays calm.
   */
  operational: boolean
}

const PROVIDER_NAME: Record<OAuthProvider, string> = { apple: "Apple", google: "Google" }

/** "Apple", "Google", or a neutral word when we were not told which. */
export function providerName(provider?: string | null): string {
  const key = String(provider ?? "").toLowerCase()
  return key === "apple" || key === "google" ? PROVIDER_NAME[key] : "that service"
}

/**
 * THE SENTENCES.
 *
 * Each one names the thing that happened and what to do about it, and none of
 * them uses a word from the protocol. "Unable to exchange external code" is
 * not a fact a person can act on; "it did not finish, try once more" is.
 */
export function messageForCode(code: OAuthErrorCode, provider?: string | null): string {
  const who = providerName(provider)
  switch (code) {
    case "exchange_failed":
      return `${who} did not finish signing you in. Try once more.`
    case "flow_lost":
      return "This sign in was started in another window. Start it again here."
    case "expired":
      return "That sign in took too long and expired. Try once more."
    case "cancelled":
      return "Sign in was cancelled."
    case "provider_unavailable":
      return `Signing in with ${who} is not working right now. Use your email and password, or another sign in option.`
    case "wrong_method":
      return "This email already has an account that signs in a different way. Use the option it was created with."
    case "not_allowed":
      return "This account could not be created."
    case "unknown":
    default:
      return "Sign in did not complete. Try once more."
  }
}

/**
 * Matched against the whole of what upstream said, lowercased.
 *
 * ORDER MATTERS. The first match wins, so the specific patterns come before
 * the general ones: "invalid_client" is a configuration failure and would
 * otherwise be swallowed by the "invalid" in a broader rule.
 */
const PATTERNS: Array<{ test: RegExp; code: OAuthErrorCode }> = [
  /** The person said no. Apple and Google both, plus GoTrue's relay of it. */
  { test: /access_denied|user_cancelled|user_canceled|cancell?ed|consent_required|login_required/, code: "cancelled" },

  /**
   * OUR CONFIGURATION, NOT THEIRS.
   *
   * Apple's client secret is a JWT signed with a .p8 key and Apple caps its
   * lifetime at six months, so Sign in with Apple stops working for everybody
   * on a date nobody wrote down. `invalid_client` is what Apple returns then.
   * It has to be told apart from the retryable failures, because retrying it
   * forever is the worst possible response to it.
   */
  { test: /invalid_client|unauthorized_client|client secret|client_secret|invalid_scope|redirect_uri|unsupported_response/, code: "provider_unavailable" },

  /** An account that exists and signs in some other way. */
  { test: /already (been )?registered|already exists|identity (is )?already linked|email address is already|user already/, code: "wrong_method" },

  /** Our own before-user-created hook, and anything else refusing a signup. */
  { test: /signups? (not allowed|are disabled|is disabled)|could not be completed|not accepted|email address is required/, code: "not_allowed" },

  /**
   * The browser's half of PKCE is gone: a duplicate callback, a tab that was
   * closed, a cookie the other cookie jar had. Starting over always fixes it,
   * which is why it is separated from the generic retryable case.
   */
  { test: /code verifier|code_verifier|flow state|flow_state|pkce/, code: "flow_lost" },

  /** Single use, five minutes, already spent. */
  { test: /expired|otp_expired|invalid_grant|already used|token has expired/, code: "expired" },

  /**
   * THE ONE THAT SHIPPED. GoTrue says this when its own call to the
   * provider's token endpoint fails, and it appends the authorization code to
   * the message, which is how a credential ended up on a login form.
   */
  { test: /unable to exchange external code|exchange external|error exchanging|server_error|unexpected_failure|bad_gateway|timeout|temporarily unavailable/, code: "exchange_failed" },
]

const RETRYABLE = new Set<OAuthErrorCode>(["exchange_failed", "flow_lost", "expired", "unknown"])
const OPERATIONAL = new Set<OAuthErrorCode>(["provider_unavailable", "exchange_failed"])

export interface UpstreamError {
  /** ?error= */
  error?: string | null
  /** ?error_code= */
  errorCode?: string | null
  /** ?error_description= */
  errorDescription?: string | null
  /** An SDK error's .message, when that is all there is. */
  message?: string | null
}

/**
 * Read everything upstream said, decide what it was, and return only our own
 * words. The input is never stored on the result, by construction: there is
 * nowhere on OAuthFailure to put it.
 */
export function classifyOAuthError(input: UpstreamError | string | null | undefined, provider?: string | null): OAuthFailure {
  const parts =
    typeof input === "string"
      ? [input]
      : [input?.error, input?.errorCode, input?.errorDescription, input?.message]

  const haystack = parts.filter(Boolean).join(" ").toLowerCase()

  let code: OAuthErrorCode = haystack ? "unknown" : "unknown"
  for (const { test, code: candidate } of PATTERNS) {
    if (test.test(haystack)) {
      code = candidate
      break
    }
  }

  return {
    code,
    message: messageForCode(code, provider),
    retryable: RETRYABLE.has(code),
    operational: OPERATIONAL.has(code),
  }
}

/**
 * The query string a failed sign in redirects with.
 *
 * `authError` rather than `error`, because `error` is what the old routes
 * used to carry a whole sentence in, and the login page still has to read
 * those and translate them. Two names keep "a code we wrote" and "a string
 * that arrived from somewhere" apart.
 */
export function loginErrorQuery(failure: OAuthFailure, provider?: string | null): string {
  const params = new URLSearchParams({ authError: failure.code })
  const key = String(provider ?? "").toLowerCase()
  if (key === "apple" || key === "google") params.set("provider", key)
  return params.toString()
}

/**
 * WHAT GOES IN THE SERVER LOG.
 *
 * The opposite trade from the screen: upstream's own words are exactly what
 * is wanted here, because this is where somebody debugging Apple needs to see
 * `invalid_client`. The authorization code is still cut out of it, since a
 * log is a place things get copied out of, and it carries no information the
 * error code does not already carry.
 */
export function describeForLog(input: UpstreamError | string | null | undefined): string {
  const parts =
    typeof input === "string"
      ? [input]
      : [input?.error, input?.errorCode, input?.errorDescription, input?.message]
  const joined = parts.filter(Boolean).join(" | ")
  return (
    joined
      /**
       * "Unable to exchange external code: c30012ab...". Everything after the
       * colon is the code. Apple's start with `c` and Google's are longer
       * still, so the rule is the phrase rather than the shape of the value.
       */
      .replace(/(exchange external code:?)\s*\S+/gi, "$1 [redacted]")
      /** Anything else long enough and opaque enough to be a token. */
      .replace(/\b[A-Za-z0-9_-]{28,}\b/g, "[redacted]")
      .slice(0, 300)
  )
}

/**
 * ===========================================================================
 *  "YOU ALREADY HAVE AN ACCOUNT, AND THIS IS HOW YOU GET INTO IT"
 * ===========================================================================
 * The second half of the same problem. Somebody presses Continue with Apple
 * for an email that signs in with Google, or types an email whose account has
 * no password at all, and the product's answer was either a generic refusal
 * or a request for a password that does not exist.
 *
 * /api/auth/account-origin knows the answer. This turns it into the sentence,
 * in one place, so the login page and the signup page cannot drift.
 */
export type SignInMethod = "email" | "google" | "apple"

const METHOD_NAME: Record<SignInMethod, string> = {
  email: "your email and password",
  google: "Google",
  apple: "Apple",
}

/** "Google", "Google or Apple", "your email and password, Google or Apple". */
export function listMethods(methods: readonly SignInMethod[]): string {
  const names = methods.map((m) => METHOD_NAME[m]).filter(Boolean)
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`
}

/**
 * What to say on the LOGIN page when an email has an account that does not
 * take a password. Null when there is nothing useful to say, which is the
 * signal to carry on and ask for one.
 */
export function existingAccountHint(methods: readonly SignInMethod[]): string | null {
  if (!methods.length) return null
  if (methods.includes("email")) return null
  return `This account signs in with ${listMethods(methods)}. There is no password on it.`
}

/**
 * And on the SIGNUP page, where the account already existing is the whole of
 * the news.
 */
export function alreadyRegisteredHint(methods: readonly SignInMethod[]): string {
  if (!methods.length) return "This email already has an account. Log in instead."
  return `This email already has an account. Log in with ${listMethods(methods)}.`
}
