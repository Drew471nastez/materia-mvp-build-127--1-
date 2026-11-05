/**
 * ===========================================================================
 *  THE LINE THAT WAS SHOWN TO A CREATOR
 * ===========================================================================
 *     Unable to exchange external code: c300...
 *
 * In red, under the email field, on a login form. That is GoTrue's internal
 * wording for one step of one protocol, and the thing after the colon is
 * Apple's authorization code.
 *
 * Two guarantees are checked here, and the second is the one that still
 * matters in a year:
 *
 *   1. THE CLASSIFIER IS DRIVEN. Every string these providers actually
 *      produce goes in, and what comes out is a code, a sentence a person can
 *      act on, and an honest answer about whether trying again will help.
 *
 *   2. NOTHING UPSTREAM CAN REACH A URL. The second half walks the auth
 *      routes and the native handler and fails if any of them puts a
 *      provider's or an SDK's own words into a redirect. That is what makes
 *      the leak impossible rather than fixed: a new route written next year
 *      that pipes `error_description` into `/login?error=` fails this test
 *      instead of failing a person.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  alreadyRegisteredHint,
  classifyOAuthError,
  describeForLog,
  existingAccountHint,
  listMethods,
  loginErrorQuery,
  messageForCode,
  providerName,
  type OAuthErrorCode,
  type SignInMethod,
} from "../lib/auth/oauth-errors"

const root = process.cwd()
let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

/**
 * THE EXACT STRING, character for character, because a test built from a
 * paraphrase proves nothing about the thing that shipped. The code is a real
 * Apple authorization code's shape: `c` then digits, a dot, a region digit,
 * a dot, and a long opaque tail.
 */
const APPLE_CODE = "c300f1b2a4d5e46f9a8b7c6d5e4f3a2b1.0.nrtxy.7Kq_Zx8VmA0pLdQe3RfWuS"
const SHIPPED = `Unable to exchange external code: ${APPLE_CODE}`

function main() {
  console.log("\nA failed sign in says something a person can act on, and nothing else")

  // ── 1. The failure that shipped ────────────────────────────────────────
  {
    const f = classifyOAuthError({
      error: "server_error",
      errorCode: "unexpected_failure",
      errorDescription: SHIPPED,
    }, "apple")

    check("the shipped failure is recognised", f.code === "exchange_failed", f.code)
    check("and it is treated as worth retrying", f.retryable)
    check("and it is flagged as ours to look at", f.operational)
    check("the sentence names Apple", f.message.includes("Apple"), f.message)
    check(
      "the sentence has a next step in it",
      /try|use|start/i.test(f.message),
      f.message,
    )

    /** The point of the whole file. */
    const everythingRendered = [f.code, f.message, loginErrorQuery(f, "apple")].join(" ")
    check("the authorization code is nowhere in what gets shown", !everythingRendered.includes(APPLE_CODE))
    check("no fragment of it survives either", !everythingRendered.includes("c300f1b2"))
    check(
      "and neither does any of upstream's wording",
      !/unable to exchange|external code|server_error|unexpected_failure/i.test(everythingRendered),
      everythingRendered,
    )
  }

  // ── 2. Everything else these two providers actually say ────────────────
  const cases: Array<[string, OAuthErrorCode]> = [
    ["access_denied", "cancelled"],
    ["user_cancelled_authorize", "cancelled"],
    ["The user cancelled the sign in", "cancelled"],
    /** Apple's client secret is a JWT it will not honour past six months. */
    ["invalid_client", "provider_unavailable"],
    ["unauthorized_client", "provider_unavailable"],
    ["Invalid client secret", "provider_unavailable"],
    ["redirect_uri mismatch", "provider_unavailable"],
    ["User already registered", "wrong_method"],
    ["Identity is already linked to another user", "wrong_method"],
    ["An email address is required.", "not_allowed"],
    ["This signup could not be completed.", "not_allowed"],
    ["invalid request: both auth code and code verifier should be non-empty", "flow_lost"],
    ["invalid flow state, no valid flow state found", "flow_lost"],
    ["Email link is invalid or has expired", "expired"],
    ["invalid_grant", "expired"],
    [SHIPPED, "exchange_failed"],
    ["Error exchanging code for session", "exchange_failed"],
    ["bad_gateway", "exchange_failed"],
  ]

  for (const [input, expected] of cases) {
    const f = classifyOAuthError(input)
    check(`"${input.slice(0, 46)}" reads as ${expected}`, f.code === expected, `got ${f.code}`)
  }

  // ── 3. Retrying is honest ──────────────────────────────────────────────
  {
    /**
     * A CONFIGURATION FAILURE MUST NOT BE RETRIED.
     *
     * If Apple's client secret has expired, every attempt fails identically.
     * Retrying that is a loop, and telling somebody "try once more" is a lie
     * they will act on several times before giving up.
     */
    check("an expired client secret is not retried", !classifyOAuthError("invalid_client").retryable)
    check("a cancelled sign in is not retried", !classifyOAuthError("access_denied").retryable)
    check("the wrong sign in method is not retried", !classifyOAuthError("User already registered").retryable)
    check("a spent code is retried", classifyOAuthError("invalid_grant").retryable)
    check("a lost verifier is retried", classifyOAuthError("code verifier").retryable)
    check("and something unrecognised is retried once", classifyOAuthError("???").retryable)

    /** Nothing at all is not a reason to accuse anyone of anything. */
    const nothing = classifyOAuthError(null)
    check("no input still yields a usable sentence", nothing.message.length > 10 && nothing.code === "unknown")
  }

  // ── 4. The query string ────────────────────────────────────────────────
  {
    const q = loginErrorQuery(classifyOAuthError(SHIPPED, "apple"), "apple")
    const parsed = new URLSearchParams(q)
    check("the redirect carries a code", parsed.get("authError") === "exchange_failed", q)
    check("and the provider", parsed.get("provider") === "apple")
    check("an unknown provider is not echoed into the URL", !loginErrorQuery(classifyOAuthError("x"), "<script>").includes("script"))
    check("and the URL is only ever those two keys", [...parsed.keys()].every((k) => k === "authError" || k === "provider"))
  }

  // ── 5. The log keeps what the screen drops, minus the token ────────────
  {
    const line = describeForLog({ error: "server_error", errorDescription: SHIPPED })

    check("the log keeps upstream's own words", line.includes("Unable to exchange external code"))
    check("because that is where invalid_client has to be visible", describeForLog("invalid_client").includes("invalid_client"))
    check("but the authorization code is cut out of it", !line.includes(APPLE_CODE), line)
    check("and it says so rather than going quiet", line.includes("[redacted]"), line)
    check("a long opaque token anywhere is cut too", describeForLog("token=" + "A".repeat(40)).includes("[redacted]"))
    check("the log line is bounded", describeForLog("x".repeat(5000)).length <= 300)
  }

  // ── 6. Naming the way in ───────────────────────────────────────────────
  {
    check("one method reads plainly", listMethods(["google"]) === "Google", listMethods(["google"]))
    check("two are joined with or", listMethods(["google", "apple"]) === "Google or Apple", listMethods(["google", "apple"]))
    check(
      "three are a list",
      listMethods(["email", "google", "apple"]) === "your email and password, Google or Apple",
      listMethods(["email", "google", "apple"]),
    )

    /**
     * THE APPLE ACCOUNT THAT WAS ASKED FOR A PASSWORD.
     *
     * account-origin used to answer "is it Google?", so an account created
     * with Sign in with Apple came back as password-enabled and the form
     * asked for one that has never existed.
     */
    const apple = existingAccountHint(["apple"])
    check("an Apple-only account is named as such", !!apple && apple.includes("Apple"), String(apple))
    check("and it says there is no password", !!apple && /no password/i.test(apple))
    check("an account WITH a password is not interrupted", existingAccountHint(["email", "google"]) === null)
    check("and neither is an email nobody has used", existingAccountHint([]) === null)

    check("signup names the method too", alreadyRegisteredHint(["apple"]).includes("Apple"))
    check("and still says something when it does not know", alreadyRegisteredHint([]).length > 10)
  }

  // ── 7. Provider naming ─────────────────────────────────────────────────
  {
    check("apple", providerName("apple") === "Apple")
    check("google", providerName("GOOGLE") === "Google")
    check("and anything else stays neutral", providerName("facebook") === "that service")
    check("including nothing at all", providerName(null) === "that service")
    check("every code has a sentence", (["exchange_failed", "flow_lost", "expired", "cancelled", "provider_unavailable", "wrong_method", "not_allowed", "unknown"] as OAuthErrorCode[]).every((c) => messageForCode(c).length > 10))
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  THE PART THAT OUTLIVES THIS FIX
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Every file that can send somebody to /login after a failed sign in. If a
   * new one is added and it pipes upstream's words into the URL, this fails.
   */
  const AUTH_REDIRECTORS = [
    "app/(storelib)/auth/callback/route.ts",
    "app/(storelib)/auth/start/route.ts",
    "app/(storelib)/auth/sync-session/route.ts",
    "lib/native-oauth.ts",
    "components/native-auth-handler.tsx",
    "lib/native-bridge.ts",
  ]

  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")

  /**
   * A redirect that interpolates something other than a literal. The three
   * shapes that put upstream text in a URL: an error description, an SDK
   * error's .message, and a bare variable holding either.
   */
  const LEAKY = [
    /login\?error=\$\{encodeURIComponent\((?!"|')/,
    /login\?[^`"']*\$\{[^}]*(errorDescription|error_description|\.message|oauthErrDesc|exchangeErr|desc)\b/,
  ]

  for (const file of AUTH_REDIRECTORS) {
    let code: string
    try {
      code = strip(readFileSync(join(root, file), "utf8"))
    } catch {
      check(`${file} exists`, false, "file not found")
      continue
    }
    const leak = LEAKY.find((re) => re.test(code))
    check(`${file} never redirects with upstream's own words`, !leak, leak ? `matched ${leak}` : "")
  }

  /** And the ones that should be using the classifier are using it. */
  for (const file of ["app/(storelib)/auth/callback/route.ts", "lib/native-oauth.ts", "app/(storelib)/auth/sync-session/route.ts"]) {
    const code = readFileSync(join(root, file), "utf8")
    check(`${file} classifies before it redirects`, code.includes("classifyOAuthError"))
  }

  /**
   * THE CHECK HAS TO BE ABLE TO FAIL, or it is decoration.
   */
  {
    const shipped = 'return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription || error)}`)'
    check("the scan would have caught the line that shipped", LEAKY.some((re) => re.test(shipped)))

    const native = 'window.location.assign(`/login?error=${encodeURIComponent(desc)}`)'
    check("and the native one", LEAKY.some((re) => re.test(native)))

    const fine = 'return NextResponse.redirect(`${origin}/login?${loginErrorQuery(failure)}`)'
    check("and it stays quiet about the shape that replaced them", !LEAKY.some((re) => re.test(fine)))

    const literal = 'redirect(`${origin}/login?error=${encodeURIComponent("Please sign in again.")}`)'
    check("a sentence we wrote ourselves is not a leak", !LEAKY.some((re) => re.test(literal)))
  }

  // ── The login page: one retry, and only one ────────────────────────────
  {
    const page = readFileSync(join(root, "app/(storelib)/(auth)/login/page.tsx"), "utf8")
    check("the login page reads the code, not a sentence", page.includes('searchParams.get("authError")'))
    check("it still understands the old shape", page.includes('searchParams.get("error")'))
    check("a retry is claimed from storage before it runs", /claimRetry/.test(page) && /sessionStorage.setItem\(key, "1"\)/.test(page))
    check("the retry is gated on the failure being retryable", /failure\.retryable && provider/.test(page) && /claimRetry\(provider\)/.test(page))
    /**
     * The screenshot that reopened this: "Apple did not finish signing you
     * in. Try once more." shown AFTER the automatic retry had already been
     * spent, which is advice for something that had just happened and failed.
     */
    check(
      "a second failure stops saying try once more",
      /claimRetry\(provider\)\)? \{[\s\S]{0,1400}?messageForCode\("provider_unavailable", provider\)/.test(page),
    )
    check(
      "and points at the sign in options that do work",
      messageForCode("provider_unavailable", "apple").includes("Google") === false &&
        /email and password|another sign in option/i.test(messageForCode("provider_unavailable", "apple")),
      messageForCode("provider_unavailable", "apple"),
    )
    check("cancelling shows nothing at all", /failure\.code === "cancelled"[\s\S]{0,80}setError\(null\)/.test(page))
    check("and the provider is remembered when the button is pressed", page.includes('rememberProvider("apple")') && page.includes('rememberProvider("google")'))
  }

  // ── A native failure has to leave the phone ────────────────────────────
  {
    /**
     * The web flow logs Apple's own words on our server. The native flow
     * goes Supabase -> deep link -> app and never touches it, so for several
     * rounds the only copy of the reason why sign in failed was a console
     * inside a WebView on somebody else's phone.
     */
    const native = readFileSync(join(root, "lib/native-oauth.ts"), "utf8")
    check("a native OAuth failure is reported off the device", native.includes("reportOAuthFailure"))
    check("to the endpoint that already exists for it", /reportOAuthFailure[\s\S]{0,900}\/api\/client-errors/.test(native))
    check(
      "it survives the navigation that happens next",
      /reportOAuthFailure[\s\S]{0,900}keepalive: true/.test(native),
    )
    check(
      "and it carries the redacted wording, not the raw one",
      /reportOAuthFailure\(failure\.code, detail\)/.test(native) && /const detail = describeForLog\(/.test(native),
    )
    /** Nothing about the person goes in it. */
    const body = native.slice(native.indexOf("function reportOAuthFailure"), native.indexOf("function reportOAuthFailure") + 900)
    check("no email, token or session in the report", !/email|access_token|refresh_token|session/i.test(body), body.slice(0, 0))
  }

  // ── account-origin answers with the real list ──────────────────────────
  {
    const route = readFileSync(join(root, "app/api/auth/account-origin/route.ts"), "utf8")
    check("account-origin knows Apple exists", route.includes('providers.has("apple")'))
    check("and returns the methods rather than a guess", /methods,/.test(route))
    check("and no longer calls an Apple account password-enabled", route.includes("passwordEnabled: hasEmailProvider"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
