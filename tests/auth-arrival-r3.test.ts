/**
 * ===========================================================================
 *  LOG IN, SIGN UP AND SELL ON STORELIB OPEN WHOLE; /app'S SCROLLBARS QUIET
 * ===========================================================================
 * Round 3, the owner: pressing Sell on Storelib, Log in or Sign up while
 * signed out showed a grey screen with a violet spinner (loading.tsx), then a
 * white one with a black spinner (the session check), then the form fading
 * and sliding up (the layout's fade and the card's fade-in-up), and the photo
 * arriving last into a black panel. And every scroller inside /app, the Share
 * your OnePage dialog first, drew a full width black track, inherited from
 * the site's charcoal bar on <html>.
 *
 *   ARRIVAL   no loading screen, no gate spinner for a stranger, no fade, no
 *             Suspense spinner streamed ahead of the form, drawn per request
 *   SELL      a stranger's Sell on Storelib goes where /sell sends them, directly
 *   HINT      the session cookie test that decides whether to wait
 *   PHOTO     wide screens only, preloaded, a blurred copy of itself under it
 *   LOGO      its violet under the picture
 *   SCROLLBAR the page's charcoal stays on the page; inside it, thin and quiet
 *
 * The geometry, the frames and the pixels are measured by
 * scripts/check-auth-arrival-r3.mjs and scripts/check-app-scrollbars-r3.mjs
 * against a production build.
 *
 * Run with:  npm run test:push
 */
import { existsSync } from "node:fs"
import { join } from "node:path"

import { readCode, readSource } from "./_source"
import { mayBeSignedIn } from "../lib/auth/session-hint"
import { sellDecision, withCarry, SELL_INTENT } from "../lib/auth/continue"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`) }
}

const AUTH = "app/(storelib)/(auth)"
const login = readCode(`${AUTH}/login/page.tsx`)
const signup = readCode(`${AUTH}/signup/page.tsx`)

console.log("\nARRIVAL: the form on the first frame")
{
  check("no loading screen for /login or /signup (a grey screen and a violet spinner on every press)",
    !existsSync(join(process.cwd(), `${AUTH}/login/loading.tsx`)) && !existsSync(join(process.cwd(), `${AUTH}/signup/loading.tsx`)))
  for (const [name, page] of [["login", login], ["signup", signup]] as const) {
    check(`${name}: the spinner only for a request with a session cookie, or the app finishing its own sign in`,
      /if \(nativeAuthInProgress \|\| \(authGateLoading && maybeSignedIn\)\) \{/.test(page) && /const maybeSignedIn = useMaybeSignedIn\(\)/.test(page))
    check(`${name}: never the old "wait for the check whoever you are"`, !/if \(authGateLoading \|\| nativeAuthInProgress\) \{\s*return <AuthResolvingScreen/.test(page))
    check(`${name}: the card does not fade or slide in`, !/animate-fade-in-up/.test(page))
    check(`${name}: no Suspense boundary to stream a spinner ahead of the form`, !/<Suspense\b/.test(page))
  }
  for (const name of ["login", "signup"]) {
    const layout = readCode(`${AUTH}/${name}/layout.tsx`)
    check(`${name}: drawn per request, so the first HTML is the form with its own ?intent= and ?next=`,
      /export const dynamic = "force-dynamic"/.test(layout) && /<AuthArrival>\{children\}<\/AuthArrival>/.test(layout))
  }
  const server = readCode("components/auth/auth-arrival-server.tsx")
  check("the layout reads the request's cookies and hands the hint down", /await cookies\(\)/.test(server) && /maybeSignedIn=\{mayBeSignedIn\(jar\)\}/.test(server))
  const shell = readCode(`${AUTH}/layout.tsx`)
  check("every sign in step: no fade on the page itself", /<main className="min-h-svh bg-white" data-page="auth">/.test(shell) && !/animate-in|fade-in/.test(shell))
  check("the handover and invite pages (AuthSplit) do not slide in either", !/animate-fade-in-up/.test(readCode("components/auth/auth-split.tsx")))
  check("in the apps, the band under the clock is white from the first HTML", /html\.capacitor:has\(main\[data-page="auth"\]\)::before \{\s*background-color: #ffffff;/.test(readCode("app/globals.css")))
}

console.log("\nSELL: straight to sign up for selling")
{
  const header = readCode("components/platform/platform-header-client.tsx")
  const guest = withCarry("/signup", { intent: SELL_INTENT })
  const decided = sellDecision({ user: null, emailVerified: false, access: { state: "none" } as never, next: null })
  check("the header's address is the one /sell sends a stranger to", decided.kind === "redirect" && decided.to === guest, { guest, decided })
  check("on the computer's row and in the phone menu", /\{\.\.\.link\(GUEST_SELL\)\}\s*data-guest-sell=""/.test(header) && /go\(GUEST_SELL\)\}\s*data-menu-sell=""/.test(header))
  check("Become a seller, for somebody signed in, still opens /sell", /link\("\/sell"\)/.test(header))
  check("read when pressed, and the photo warmed while a pointer rests on it", /prefetch: false as const, onPointerEnter: \(\) => warmAuthPhoto\(path\)/.test(header))
}

console.log("\nHINT: worth waiting only when there is a session to find")
{
  check("a whole session cookie", mayBeSignedIn("a=1; sb-abcd-auth-token=base64-xyz"))
  check("a chunked one", mayBeSignedIn("sb-abcd-auth-token.0=base64-xyz; sb-abcd-auth-token.1=more"))
  check("an empty one is not", !mayBeSignedIn("sb-abcd-auth-token="))
  check("a stranger's cookies are not", !mayBeSignedIn("storelib_consent=2.p1; sl_owned_hint=1; _ga=GA1.1"))
}

console.log("\nPHOTO: fetched with the page, never by a phone, never into a black box")
{
  const photo = readCode("components/auth/auth-photo.tsx")
  check("a <picture> whose only source is for 1024px and up", /<source media=\{WIDE\} srcSet=\{props\.srcSet\} sizes=\{SIZES\} \/>/.test(photo) && /const WIDE = "\(min-width: 1024px\)"/.test(photo))
  check("the <img> a phone falls back to asks for nothing", /src=\{NOTHING\}/.test(photo) && /const NOTHING = "data:image\/gif;base64,/.test(photo))
  check("both copies preloaded from <head> for wide screens, at high priority",
    /<link rel="preload" as="image" href=\{soft\.src\} media=\{WIDE\} fetchPriority="high" \/>/.test(photo) &&
      /<link rel="preload" as="image" imageSrcSet=\{props\.srcSet\} imageSizes=\{SIZES\} media=\{WIDE\} fetchPriority="high" \/>/.test(photo))
  check("the 32px copy drawn blurred under it", /getImageProps\(\{ src, alt: "", width: 32, height: 32, quality: 75 \}\)/.test(photo) && /blur-2xl/.test(photo))
  for (const f of [`${AUTH}/login/page.tsx`, `${AUTH}/signup/page.tsx`, `${AUTH}/signup/verify/page.tsx`, `${AUTH}/verify-email/verify-email-content.tsx`, "components/auth/auth-split.tsx"]) {
    const src = readSource(f)
    check(`${f.replace(`${AUTH}/`, "")}: draws the photo through it`, /<AuthPhoto src=\{(LOGIN_PHOTO|SIGNUP_PHOTO|AUTH_PHOTO)\} \/>/.test(src) && !/collage%20imags/.test(src))
  }
}

console.log("\nLOGO: its own violet before the picture")
{
  check("the square is the logo's colour from the first frame",
    /backgroundColor: STORELIB_LOGO_GROUND/.test(readCode("components/brand/storelib-logo.tsx")) && /export const STORELIB_LOGO_GROUND = "#895ffe"/.test(readCode("lib/brand/logo.ts")))
}

console.log("\nSCROLLBAR: charcoal for the page, quiet inside it")
{
  const css = readCode("app/globals.css")
  check("the page's own bar keeps the charcoal (5157f318e)", /html \{\s*scrollbar-width: thin;\s*scrollbar-color: #777777 #292929;\s*\}/.test(css))
  check("touch screens: nothing inherited, the platform's own indicator", /body \{\s*scrollbar-color: auto;\s*\}/.test(css))
  check("pointer screens: the thumb in the surface's own text colour on no track, thin at zero specificity",
    /@media \(hover: hover\) and \(pointer: fine\) \{\s*body \{\s*scrollbar-color: rgba\(120, 120, 128, 0\.4\) transparent;\s*scrollbar-color: color-mix\(in srgb, currentColor 26%, transparent\) transparent;\s*\}\s*:where\(body \*\) \{\s*scrollbar-width: thin;\s*\}/.test(css))
  /* Four: the html rule, and the html::-webkit-scrollbar background, track and thumb border for Safari. Nothing under <body>. */
  check("no charcoal track named for anything inside the page", (css.match(/#292929/g) ?? []).length === 4 && !/\[data-post-overlay-scroll\],\s*\[data-bell-list\] \{\s*scrollbar-width: thin;\s*scrollbar-color: #777777 #292929/.test(css))
  check("forced colours: the system's own", /@media \(forced-colors: active\) \{\s*html,\s*body \{\s*scrollbar-color: auto;/.test(css))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
