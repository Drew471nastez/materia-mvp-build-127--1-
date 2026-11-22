/**
 * ===========================================================================
 *  GOOGLE AND APPLE FIRST ON LOG IN AND SIGN UP (round 57)
 * ===========================================================================
 * The owner: "put Continue with Google and Continue with Apple at the top of
 * the login and signup pages instead of the bottom".
 *
 *   ORDER     /login and /signup draw Google, Apple, the OR divider, then the
 *             email form, in that source order (which is also the tab and
 *             reading order: nothing is reordered with CSS)
 *   APPLE     the Apple button is drawn whenever Google is, with Google's
 *             exact classes, so it is never less prominent (Apple's HIG)
 *   KEPT      the native plugin paths, /auth/start with the carry, the
 *             loading words and the error line all still there
 *   WHERE     no other screen draws its own Google or Apple button; every
 *             other way in (checkout, receipt, header, team invite, claim,
 *             OnePage) links to these two pages
 *   WORDS     the note for a Google only address points up, not down
 *
 * scripts/check-auth-social-first-r57.mjs measures it in Chromium at 360,
 * 390, 768 and 1280: order, layout shift, focus order, names, the carry.
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode, readSource } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
function section(name: string) {
  console.log(`\n${name}`)
}

const LOGIN = "app/(storelib)/(auth)/login/page.tsx"
const SIGNUP = "app/(storelib)/(auth)/signup/page.tsx"
const APPLE = "components/auth/apple-sign-in-button.tsx"

/** The page's drawn markup: from its last `return (` of the form component to the end of that JSX. */
function markup(src: string): string {
  const at = src.indexOf('<div data-page="')
  return src.slice(at, src.indexOf("\n  )\n}", at))
}

function classOf(jsx: string, marker: string): string | null {
  const at = jsx.indexOf(marker)
  if (at < 0) return null
  const m = /className="([^"]+)"/.exec(jsx.slice(at, at + 600))
  return m ? m[1] : null
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(p)
  }
  return out
}

async function main() {
  const appleSrc = readCode(APPLE)
  const appleClass = /className="([^"]+)"/.exec(appleSrc)?.[1] ?? null

  for (const [name, file, orMarker] of [
    ["login", LOGIN, ">OR<"],
    ["signup", SIGNUP, '{t("auth.or")}'],
  ] as const) {
    const code = readCode(file)
    const jsx = markup(code)

    section(`ORDER (${name})`)
    const google = jsx.indexOf("onClick={handleGoogleSignIn}")
    const apple = jsx.indexOf("<AppleSignInButton")
    const or = jsx.indexOf(orMarker)
    const form = jsx.indexOf("<form")
    const email = jsx.indexOf('id="email"')
    const submit = jsx.indexOf('type="submit"')
    const h1 = jsx.indexOf("<h1")
    check(`${name}: every piece is found`, [google, apple, or, form, email, submit, h1].every((i) => i > 0), { google, apple, or, form, email, submit, h1 })
    check(`${name}: heading, then Google, then Apple`, h1 < google && google < apple)
    check(`${name}: then the OR divider`, apple < or)
    check(`${name}: then the email form, its field and Continue`, or < form && form < email && email < submit)
    check(`${name}: one Google button and one Apple button`, jsx.split("onClick={handleGoogleSignIn}").length === 2 && jsx.split("<AppleSignInButton").length === 2)
    check(`${name}: one divider`, jsx.split(orMarker).length === 2)
    check(`${name}: the buttons sit in their own group, not inside the form`, jsx.slice(0, form).includes("onClick={handleGoogleSignIn}") && !jsx.slice(form, jsx.indexOf("</form>")).includes("handleGoogleSignIn"))
    check(`${name}: nothing reorders them for the eye (no order-, flex-col-reverse), so tab and reading order follow the drawn order`, !/\border-(first|last|\d+|\[)|flex-col-reverse|\[order:/.test(jsx))

    section(`APPLE (${name})`)
    const appleTag = jsx.slice(apple, jsx.indexOf("/>", apple))
    const between = jsx.slice(jsx.indexOf("</Button>", google) + "</Button>".length, apple)
    check(`${name}: Apple sits right after Google, with no condition around it`, /^\s*$/.test(between), between)
    check(`${name}: and is disabled by the same two flags as Google`, /disabled=\{isGoogleLoading \|\| isAppleLoading\}/.test(appleTag) && /isLoading=\{isAppleLoading\}/.test(appleTag) && /onClick=\{handleAppleSignIn\}/.test(appleTag))
    const googleClass = classOf(jsx, "onClick={handleGoogleSignIn}")
    check(`${name}: Apple's button has Google's exact classes (same height, width, type, colours)`, !!googleClass && googleClass === appleClass, { googleClass, appleClass })

    section(`KEPT (${name})`)
    check(`${name}: the native Google sheet first, then the Safari sheet`, /signInWithNativeGoogle\(supabase\)/.test(code) && /Capacitor\.isNativePlatform\(\)/.test(code) && /skipBrowserRedirect: true/.test(code))
    check(`${name}: the native Apple path`, /provider: "apple"/.test(code))
    check(`${name}: web goes through /auth/start with the carry`, /withCarry\("\/auth\/start\?provider=google", carry\)/.test(code) && /withCarry\("\/auth\/start\?provider=apple", carry\)/.test(code))
    check(`${name}: the single flight locks`, /__oauthStarting/.test(code) && /__appleOAuthStarting/.test(code))
    check(`${name}: the error line under the field`, /id="auth-error" role="alert"/.test(jsx) && jsx.indexOf('id="auth-error"') > form)
  }

  section("APPLE BUTTON")
  check("Continue with Apple, Connecting... while it loads", /"Continue with Apple"/.test(appleSrc) && /"Connecting\.\.\."/.test(appleSrc))
  check("its logo is hidden from a screen reader, so the name is the words", /aria-hidden="true"/.test(appleSrc))

  section("SIGNUP KEEPS")
  const signup = readCode(SIGNUP)
  const sjsx = markup(signup)
  check("the honeypot still inside the form", sjsx.indexOf('name="website"') > sjsx.indexOf("<form") && sjsx.indexOf('name="website"') < sjsx.indexOf("</form>"))
  check("the terms note right under the form's Continue", sjsx.indexOf('t("auth.by_clicking")') > sjsx.indexOf("</form>"))
  check("Log in at the end", sjsx.indexOf("href={loginHref}") > sjsx.indexOf("</form>"))

  section("LOGIN KEEPS")
  const ljsx = markup(readCode(LOGIN))
  check("Forgot password? and Sign up after the form", ljsx.indexOf('withCarry("/request", carry)') > ljsx.indexOf("</form>") && ljsx.indexOf('withCarry("/signup", carry)') > ljsx.indexOf("</form>"))

  section("WORDS")
  const loginProse = readSource(LOGIN)
  check("the Google only note points up at the buttons, now above it", /sign in options above/.test(loginProse) && !/sign in options below/.test(loginProse))
  const note = /<p className="text-xs text-blue-800">\s*([^<]+)</.exec(loginProse)?.[1]?.replace(/\s+/g, " ").trim() ?? ""
  check("no em dash and none of the banned words in it", note.length > 0 && !/\u2014/.test(note) && !/\b(unlock|elevate|seamless|powerful|effortlessly|supercharge|transform)\b/i.test(note), note)

  section("WHERE")
  const drawers = [...walk("app"), ...walk("components")]
    .filter((p) => {
      const c = readCode(p)
      return /handleGoogleSignIn|<AppleSignInButton|"auth\.continue_with_google"|>\s*Continue with Google\s*</.test(c)
    })
    .sort()
  check("only log in and sign up draw a Google or Apple button", JSON.stringify(drawers) === JSON.stringify([LOGIN, SIGNUP].sort()), drawers)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
