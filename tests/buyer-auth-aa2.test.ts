/**
 * ===========================================================================
 *  SIGNED IN EVERYWHERE AT ONCE, AND SAID RIGHT (round AA2)
 * ===========================================================================
 * The owner, from a receipt: "it doesn't fully log me into the account in all
 * places ... It still shows me to sign in, even though I signed in ... it
 * tells me welcome back, because I clicked create an account when I already
 * have an account", and "when logged out it should not have on mobile the
 * mobile bottom navigation bar".
 *
 *   STATE      a page that comes back from the back/forward cache, or is
 *              left open while another tab signs in, asks again: the tab
 *              bar's record and the header both, and the page's own data
 *   ARRIVAL    "Account created" or "Welcome back" from the account's age,
 *              never from the button; set by both ends of a sign in
 *   GOOGLE     the OAuth callback attaches a guest's orders, as the email
 *              way in does, so the receipt they return to says In your library
 *   EXISTS     sign up's answer for an address that already has an account
 *              (no identities) is a sign in, never the code screen
 *   TABS       no bottom bar signed out in a browser, on every Storelib page
 *   HEADER     its Log in and Sign up come back to the page they were on
 *
 * scripts/check-buyer-auth-aa2.mjs walks all of it in a browser.
 */
import { readCode, readSource } from "./_source"
import { ARRIVAL_COOKIE, ARRIVAL_WORDS, NEW_ACCOUNT_WINDOW_MS, arrivalFromCookieString, arrivalOf, arrivalWaitsOn, readArrival } from "@/lib/auth/arrival"
import { signUpFoundExisting } from "@/lib/auth/existing-account"
import { buyerTabsBelongOn } from "@/lib/nav/buyer-tabs"
import { headerAuthBack } from "@/lib/auth/return-to"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}
const section = (name: string) => console.log(`\n${name}`)

async function main() {
  section("STATE: the record of who is signed in is read again when a page comes back")
  {
    const store = new Map<string, string>()
    const g = globalThis as unknown as Record<string, unknown>
    const hadWindow = "window" in g
    g.window = new EventTarget()
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    const { readAuthSnapshot, subscribeAuthSnapshot, writeAuthSnapshot } = await import("@/lib/auth/auth-snapshot")
    let calls = 0
    const stop = subscribeAuthSnapshot(() => calls++)
    const show = (persisted: boolean) => {
      const e = new Event("pageshow")
      Object.defineProperty(e, "persisted", { value: persisted })
      ;(g.window as EventTarget).dispatchEvent(e)
    }
    /* Another tab signed in while this page sat in the back/forward cache, where no event reached it. */
    store.set("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1" }))
    show(true)
    check("a page restored from the back/forward cache reads the record again", calls === 1, calls)
    show(false)
    check("  a fresh load does not need telling (it read the record as it started)", calls === 1, calls)
    ;(g.window as EventTarget).dispatchEvent(new Event("focus"))
    check("  nor a focus", calls === 1, calls)
    writeAuthSnapshot({ signedIn: true, userId: "u1", avatarUrl: null, displayName: null, username: null, isSeller: false })
    check("  a write in this tab still tells", calls === 2, calls)
    check("  and the record reads signed in", readAuthSnapshot()?.signedIn === true)
    stop()
    show(true)
    check("  unsubscribing stops all of it", calls === 2, calls)
    if (!hadWindow) delete g.window
    delete g.localStorage
  }
  const header = readCode("components/platform/platform-header-client.tsx")
  check("the header asks Supabase again when its page comes back from the cache", /addEventListener\("pageshow", onShow\)/.test(header) && /if \(!e\.persisted\) return/.test(header))
  check("  and refreshes the page under it when the answer changed", /onShow[\s\S]{0,600}if \(nowId !== was\) router\.refresh\(\)/.test(header))
  check("  and lets go of it", /removeEventListener\("pageshow", onShow\)/.test(header))
  check("a sign in or out in another tab still refreshes the page (round 39)", /\(event === "SIGNED_IN" \|\| event === "SIGNED_OUT"\) && nowId !== was\) router\.refresh\(\)/.test(header))
  check("signing in writes the record before the next page (round 39)", /if \(session\?\.user\?\.id\) rememberSignedIn\(session\.user\.id\)/.test(readCode("lib/auth/continue-client.ts")))

  section("ARRIVAL: Account created or Welcome back, from the account")
  const now = Date.parse("2026-10-24T12:00:00.000Z")
  const ago = (ms: number) => new Date(now - ms).toISOString()
  check("made this second: new", arrivalOf(ago(1000), now) === "new")
  check("made at the start of the email code's life: new", arrivalOf(ago(NEW_ACCOUNT_WINDOW_MS - 1000), now) === "new")
  check("made just past the window: back", arrivalOf(ago(NEW_ACCOUNT_WINDOW_MS + 1000), now) === "back")
  check("made last month: back", arrivalOf("2026-09-01T10:00:00.000Z", now) === "back")
  check("a clock a little ahead is still new", arrivalOf(new Date(now + 30_000).toISOString(), now) === "new")
  check("a date far in the future is not trusted: back", arrivalOf(new Date(now + 3_600_000).toISOString(), now) === "back")
  check("no date, or nonsense: back", arrivalOf(null, now) === "back" && arrivalOf(undefined, now) === "back" && arrivalOf("yesterday-ish", now) === "back")
  check("the words", ARRIVAL_WORDS.new === "Account created" && ARRIVAL_WORDS.back === "Welcome back")
  check("the cookie names only which of the two", readArrival("new") === "new" && readArrival("back") === "back" && readArrival("<script>") === null && readArrival(null) === null)
  check("  read from a document's cookies", arrivalFromCookieString(`a=1; ${ARRIVAL_COOKIE}=back; b=2`) === "back" && arrivalFromCookieString("a=1") === null && arrivalFromCookieString(`x${ARRIVAL_COOKIE}=new`) === null)
  check("the note waits past the sign in screens and the welcome step", ["/login", "/signup", "/signup/verify", "/onboarding/start", "/auth/continue", "/verify-email"].every(arrivalWaitsOn))
  check("  and is said on the page they were going to", !["/", "/explore", "/receipt/abc", "/account/library", "/maria", "/loginsomething"].some(arrivalWaitsOn))
  const cont = readCode("app/(storelib)/auth/continue/route.ts")
  const callback = readCode("app/(storelib)/auth/callback/route.ts")
  check("/auth/continue sets it from the account's created_at", /arrivalOf\(user\.created_at\)/.test(cont) && /ARRIVAL_COOKIE/.test(cont))
  check("  only where the sign in ends, not on the way to the email code", cont.indexOf("arrivalOf(") > cont.indexOf("/signup/verify"))
  check("/auth/callback (Google, Apple) sets it the same way", /arrivalOf\(data\.user\.created_at\)/.test(callback) && /ARRIVAL_COOKIE/.test(callback))
  check("  never from which button was pressed", !/arrivalOf\([^)]*(intent|carry|signup|button)/i.test(cont + callback))
  const note = readCode("components/auth/arrival-note.tsx")
  check("the note clears its cookie as it reads it, so it is said once", /document\.cookie = `\$\{ARRIVAL_COOKIE\}=; path=\/; max-age=0/.test(note))
  check("  is a status for a screen reader", /role="status"/.test(note))
  check("  stands over the phone's tab bar", /var\(--buyer-tabs-h/.test(note))
  check("  is mounted once, in the root layout", /<ArrivalNote \/>/.test(readCode("app/(storelib)/layout.tsx")))
  for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
    const cat = readSource(`lib/i18n/catalog/${lang}.ts`)
    check(`  ${lang} says both`, cat.includes(`"Account created":`) && cat.includes(`"Welcome back":`))
  }

  section("GOOGLE: the OAuth callback attaches a guest's orders, like the email way in")
  check("the callback attaches orders paid with the account's address", /attachGuestOrdersByEmail\(admin, \{ id: data\.user\.id, email: data\.user\.email \}\)/.test(callback))
  check("  bounded, so a slow database never holds a sign in", /Promise\.race\(\[\s*attachGuestOrdersByEmail/.test(callback))
  check("  after the profile says the address is verified", callback.indexOf("email_verified: true") < callback.indexOf("attachGuestOrdersByEmail("))
  check("  only for an address the provider confirmed", /data\.user\.email_confirmed_at/.test(callback))

  section("EXISTS: sign up's answer for an address that has an account")
  check("no identities is an existing account (email confirmation on)", signUpFoundExisting({ user: { id: "x", identities: [] } }) === true)
  check("  a new account has one", signUpFoundExisting({ user: { id: "x", identities: [{ provider: "email" }] } }) === false)
  check("  a response without the list says nothing either way", signUpFoundExisting({ user: { id: "x" } }) === false && signUpFoundExisting({ user: null }) === false && signUpFoundExisting(null) === false)
  const signup = readCode("app/(storelib)/(auth)/signup/page.tsx")
  check("sign up moves to sign in on it, before any profile or code", /if \(signUpFoundExisting\(data\)\) \{\s*switchToSignIn\(trimmedEmail\)\s*return/.test(signup) && signup.indexOf("signUpFoundExisting(data)") < signup.indexOf("/api/auth/verify-email"))

  section("TABS: the bottom bar is for somebody signed in, in a browser")
  const pages = ["/", "/explore", "/explore?q=presets", "/maria", "/receipt/abcdefghijklmnop1234", "/account/library", "/community/film-club/feed", "/login", "/pricing"]
  check("signed out, no bar on any page", pages.every((p) => !buyerTabsBelongOn(p.split("?")[0], { signedIn: false })), pages.filter((p) => buyerTabsBelongOn(p.split("?")[0], { signedIn: false })))
  check("  on a creator's page on storelib.com either", !buyerTabsBelongOn("/maria", { signedIn: false, sellerStore: true, sellerSurface: true }))
  /* Round 24: a creator's page has no bar, signed in or not. */
  check("signed in: Explore, a receipt, the library, and not a creator's page", buyerTabsBelongOn("/explore", { signedIn: true }) && buyerTabsBelongOn("/receipt/abcdefghijklmnop1234", { signedIn: true }) && buyerTabsBelongOn("/account/library", { signedIn: true }) && !buyerTabsBelongOn("/maria", { signedIn: true, sellerStore: true, sellerSurface: true }))
  check("  never on a product, which has its own buy bar", !buyerTabsBelongOn("/maria/film-presets", { signedIn: true, sellerProduct: true, sellerSurface: true }))
  check("not known yet (the server, the page waking up): drawn pending, for the record to settle before paint", buyerTabsBelongOn("/explore", {}))
  check("the app keeps it signed out (no browser around it)", buyerTabsBelongOn("/explore", { signedIn: false, native: true }))
  const css = readSource("app/globals.css")
  check("a pending bar and its room are hidden on a page not marked signed in", /html:not\(\[data-sl-signed-in\]\):not\(\.capacitor\) \[data-tabs-auth="pending"\] \{\s*display: none;/.test(css))
  const bar = readCode("components/nav/buyer-tab-bar.tsx")
  check("  the bar reads the record through the same subscription (so a page brought back asks again)", /useSyncExternalStore\(subscribeAuthSnapshot, readSignedIn/.test(bar) || /useSignedInKnown\(\)/.test(bar))
  check("  the bar is fixed, so arriving moves nothing above it", /className="fixed inset-x-0 bottom-0 z-50 bg-white md:hidden"/.test(bar))

  section("HEADER: Log in and Sign up come back to the page")
  check("a buyer page is carried", headerAuthBack("/receipt/abcdefghijklmnop1234", false) === "/receipt/abcdefghijklmnop1234" && headerAuthBack("/maria", false) === "/maria")
  check("  Explore too", headerAuthBack("/explore", false) === "/explore")
  check("  the marketing pages and the home are not (a seller still lands on the dashboard)", headerAuthBack("/", false) === null && headerAuthBack("/pricing", true) === null)
  check("  nor the sign in screens (a loop)", headerAuthBack("/login", false) === null && headerAuthBack("/signup/verify", false) === null && headerAuthBack("/auth/continue", false) === null)
  check("the header's Log in and Sign up use it", /const guestLink: HeaderLink/.test(header) && /headerAuthBack\(pathname/.test(header) && /<GuestHeaderActions withLogin link=\{guestLink\} chrome=\{chrome\} \/>/.test(header))
  check("  the phone's Sign in too", /<Link \{\.\.\.guestLink\("\/login"\)\} data-phone-sign-in=""/.test(header))
  check("  and no guest button left on the bare link", !/<GuestHeaderActions[^>]*link=\{headerLink\}/.test(header) && !/<GuestSheetActions[^>]*link=\{headerLink\}/.test(header))

  section("WORDS")
  const words = [ARRIVAL_WORDS.new, ARRIVAL_WORDS.back].join(" ")
  check("no em dash and none of the banned words", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortlessly|supercharge|transform)\b/i.test(words))

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
