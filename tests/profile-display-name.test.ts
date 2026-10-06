/**
 * ===========================================================================
 *  ROUND 13 O2: NAMES, ONBOARDING, APP LINKS
 * ===========================================================================
 *   NAMES        nobody is ever "Your profile", "Creator" or "Unknown": the
 *                helpers in lib/profile/display-name.ts, the sign in that
 *                keeps a name (lib/profile/keep-name.ts, against a stand in
 *                database), and every screen that used to write its own
 *                placeholder reads personName() instead
 *   ONBOARDING   a new account is asked once what brought it here
 *                (lib/account/welcome.ts), both branches, and lands where it
 *                was going (a community, joined when free)
 *   APP LINKS    apple-app-site-association and assetlinks.json from env
 *                vars, served as JSON; https links open the page in the app
 *
 * Browser measurements: scripts/check-onboarding-branch.mjs,
 * scripts/check-app-pull.mjs, scripts/check-open-app-pill.mjs.
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"
import {
  NAMELESS,
  NAME_MAX,
  cleanName,
  isStandInName,
  nameFromEmail,
  nameFromHandle,
  nameRepair,
  needsNameStep,
  personName,
  providerNameOf,
} from "../lib/profile/display-name"
import { keepProfileName, type KeepNameDb } from "../lib/profile/keep-name"
import { WELCOME_PATH, WELCOMED_KEY, cleanBio, throughWelcome, welcomeDone, welcomeHref, welcomeWanted } from "../lib/account/welcome"
import { destinationWithAppOpen, pendingAppOpen } from "../lib/account/app-open"
import { safeNext } from "../lib/auth/continue"
import { APP_PATHS, DEFAULT_ANDROID_FINGERPRINTS, DEFAULT_TEAM_ID, WEB_ONLY_SEGMENTS, appLinkConfig, appleAppSiteAssociation, assetLinks, opensInApp } from "../lib/platform/app-links"
import { openTarget, pageAppLink, pillPhone } from "../lib/platform/open-in-app"
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

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
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}

/** A profiles table of one row, with the compare and set keep-name writes. */
function standIn(row: { display_name?: string | null; username?: string | null; email?: string | null } | null) {
  const state = { row: row ? { ...row } : null, writes: 0 }
  const db: KeepNameDb = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }) }),
      update: (values) => ({
        eq: () => ({
          is: () => ({
            select: async () => {
              if (state.row && state.row.display_name == null) {
                state.row.display_name = values.display_name
                state.writes++
                return { data: [{ id: "u" }], error: null }
              }
              return { data: [], error: null }
            },
          }),
          eq: (_c: string, value: string) => ({
            select: async () => {
              if (state.row && state.row.display_name === value) {
                state.row.display_name = values.display_name
                state.writes++
                return { data: [{ id: "u" }], error: null }
              }
              return { data: [], error: null }
            },
          }),
        }),
      }),
    }),
  }
  return { db, state }
}

async function main() {
  console.log("\nA name is cleaned, and a placeholder word is no name")
  check("spaces collapsed, control and zero width characters out", cleanName("  Ana​   Lucia\n") === "Ana Lucia")
  check("every placeholder word is no name, whatever its case", ["Your profile", "creator", "UNKNOWN", "User", "Member", "anonymous", "null", "undefined", "Storelib user"].every((w) => cleanName(w) === null))
  check("one letter is an initial, not a name", cleanName("A") === null && cleanName("Al") === "Al")
  check("a long name stops at a word near the ceiling", (cleanName("Maria ".repeat(20)) ?? "").length <= NAME_MAX && !(cleanName("Maria ".repeat(20)) ?? "").endsWith(" "))
  check("not a string is no name", cleanName(null) === null && cleanName(42) === null && cleanName(undefined) === null)

  console.log("\nA name made from an email or a handle")
  check("ana.lucia92@x.com is Ana Lucia", nameFromEmail("ana.lucia92@x.com") === "Ana Lucia")
  check("a +tag is dropped", nameFromEmail("maya+shop@x.com") === "Maya")
  check("Apple's hidden address is never a name", nameFromEmail("x7h2k9qz@privaterelay.appleid.com") === null && nameFromEmail("ana@privaterelay.appleid.com") === null)
  check("a local part that reads as a code is no name", nameFromEmail("q8x2kz7v@gmail.com") === null && nameFromEmail("123456@x.com") === null && nameFromEmail("bcdfgh@x.com") === null)
  check("ana-lucia is Ana Lucia, @ana is Ana", nameFromHandle("ana-lucia") === "Ana Lucia" && nameFromHandle("@ana") === "Ana")
  check("member-12345 (a handle made for nobody in particular) is no name", nameFromHandle("member-12345") === null && nameFromHandle("member") === null)

  console.log("\nThe provider's name")
  check("Google's full_name, else name", providerNameOf({ full_name: "Ana Lucia", name: "Ana" }) === "Ana Lucia" && providerNameOf({ name: "Ana" }) === "Ana")
  check("Apple's given and family names", providerNameOf({ given_name: "Ana", family_name: "Lucia" }) === "Ana Lucia")
  check("an email sent as the name is not a name", providerNameOf({ full_name: "ana@x.com" }) === null)
  check("nothing sent, nothing", providerNameOf({}) === null && providerNameOf(null) === null)

  console.log("\nWhat a screen shows: never a placeholder, never an address")
  check("their own name first", personName({ name: "Ana Lucia", username: "zz" }) === "Ana Lucia")
  check("a placeholder stored as the name falls through to the handle", personName({ name: "Creator", username: "maya-prints" }) === "Maya Prints")
  check("  to the email's words when there is no handle", personName({ name: "Unknown", email: "ana.lucia@x.com" }) === "Ana Lucia")
  check("  to the store's address for a seller with nothing else", personName({ name: null, slug: "clay-studio" }) === "Clay Studio")
  check("  and to the one neutral line when nothing is known", personName({}) === NAMELESS && personName(null) === NAMELESS)
  check("an email stored as the name is never shown", personName({ name: "ana@x.com", username: "ana" }) === "Ana" && !personName({ name: "ana@x.com" }).includes("@"))
  check("the code an Apple hidden address left as the name gives way to the handle", personName({ name: "x7h2k9qz", email: "x7h2k9qz@privaterelay.appleid.com", username: "maya" }) === "Maya")
  check("  and is still better than nothing when there is no handle", personName({ name: "x7h2k9qz", email: "x7h2k9qz@privaterelay.appleid.com" }) === "x7h2k9qz")
  check("a caller's own fallback is kept for a place that needs one", personName({}, "Clay Studio") === "Clay Studio")
  const words = ["Your profile", "Creator", "Unknown", "User", "Member"]
  const samples = [{}, { name: "" }, { name: "  " }, { name: "creator" }, { name: "Unknown", username: "" }, { name: "user", slug: "" }, { username: "member-1" }]
  check("no input ever comes out as a placeholder word", samples.every((s) => !words.includes(personName(s))), samples.map((s) => personName(s)))

  console.log("\nWhat a sign in writes into a profile")
  check("a name they have is never touched", nameRepair({ stored: "Ana Lucia", email: "ana@x.com", meta: { full_name: "Someone Else" } }) === null)
  check("Google's name over the email's letters the trigger wrote", nameRepair({ stored: "jsmith92", email: "jsmith92@gmail.com", meta: { full_name: "John Smith" } }) === "John Smith")
  check("Google's name over an empty one", nameRepair({ stored: null, email: "a@b.com", meta: { name: "John Smith" } }) === "John Smith")
  check("no provider name: a name from the handle over an empty one", nameRepair({ stored: "", username: "maya-prints", email: "q8x2kz7v@x.com" }) === "Maya Prints")
  check("  else from the email", nameRepair({ stored: null, username: null, email: "ana.lucia@x.com" }) === "Ana Lucia")
  check("  over a placeholder word too", nameRepair({ stored: "User", username: "maya", email: "q8x2kz7v@x.com" }) === "Maya")
  check("the email's letters are kept when they read as a name", nameRepair({ stored: "ana", email: "ana@x.com", username: "ana-1" }) === null)
  check("  and replaced by the handle when they read as a code", nameRepair({ stored: "x7h2k9qz", email: "x7h2k9qz@privaterelay.appleid.com", username: "maya" }) === "Maya")
  check("a stand in is the email's letters, empty, or a placeholder", isStandInName("ana", "ana@x.com") && isStandInName("", "a@x.com") && isStandInName("Creator", null) && !isStandInName("Ana", "ana.l@x.com"))

  console.log("\nWho is asked \"What should we call you?\"")
  check("an email sign up (the trigger wrote the email's letters)", needsNameStep({ stored: "ana", email: "ana@x.com" }))
  check("nobody Google or Apple sent a name for", !needsNameStep({ stored: "jsmith92", email: "jsmith92@gmail.com", meta: { full_name: "John Smith" } }))
  check("nobody with a name of their own", !needsNameStep({ stored: "Ana Lucia", email: "ana@x.com" }))

  console.log("\nThe sign in keeps a name (lib/profile/keep-name, a stand in database)")
  {
    const { db, state } = standIn({ display_name: "jsmith92", username: "jsmith92", email: "jsmith92@gmail.com" })
    const r = await keepProfileName(db, { id: "u", email: "jsmith92@gmail.com", user_metadata: { full_name: "John Smith" } })
    check("Google's name replaces the email's letters", r === "saved" && state.row?.display_name === "John Smith", { r, row: state.row })
    const again = await keepProfileName(db, { id: "u", email: "jsmith92@gmail.com", user_metadata: { full_name: "John Smith" } })
    check("  and the next sign in changes nothing", again === "has_name" && state.writes === 1)
  }
  {
    const { db, state } = standIn({ display_name: "Ana Lucia", username: "ana", email: "ana@x.com" })
    const r = await keepProfileName(db, { id: "u", email: "ana@x.com", user_metadata: { full_name: "Google Name" } })
    check("a name they set is never overwritten", r === "has_name" && state.row?.display_name === "Ana Lucia")
  }
  {
    const { db, state } = standIn({ display_name: null, username: "maya-prints", email: "q8x2kz7v@x.com" })
    const r = await keepProfileName(db, { id: "u", email: "q8x2kz7v@x.com", user_metadata: {} })
    check("an empty name gets the handle's words", r === "saved" && state.row?.display_name === "Maya Prints")
  }
  {
    const { db, state } = standIn({ display_name: "jsmith92", username: "j", email: "jsmith92@gmail.com" })
    /* Settings saved a name between the read and the write: the write finds the row changed and leaves it. */
    const racing: KeepNameDb = {
      from: (t) => {
        const real = db.from(t)
        return {
          select: real.select,
          update: (v) => {
            state.row!.display_name = "Set In Settings"
            return real.update(v)
          },
        }
      },
    }
    const r = await keepProfileName(racing, { id: "u", email: "jsmith92@gmail.com", user_metadata: { full_name: "John Smith" } })
    check("a name saved in the same moment wins (compare and set)", r === "lost_race" && state.row?.display_name === "Set In Settings")
  }
  {
    const broken: KeepNameDb = { from: () => { throw new Error("down") } }
    check("a database that throws never fails a sign in", (await keepProfileName(broken, { id: "u" })) === "failed")
    const { db } = standIn(null)
    check("no profile yet is said, not written", (await keepProfileName(db, { id: "u", user_metadata: { full_name: "A B" } })) === "no_profile")
  }

  console.log("\nEvery way in keeps the name")
  const callback = readCode("app/auth/callback/route.ts")
  const cont = readCode("app/auth/continue/route.ts")
  const sync = readCode("app/auth/sync-session/route.ts")
  check("the web callback writes the provider's name on a new profile, never \"User\"", /display_name: initialName/.test(callback) && !/\|\| "User"/.test(callback))
  check("  and keeps it on every sign in, after the answer", /after\(\(\) => keepProfileName\(/.test(callback))
  check("/auth/continue (a password, the email code, the app) keeps it too", /after\(\(\) => keepProfileName\(/.test(cont))
  check("the app's sign in (sync-session) keeps it beside the photo", /keepProfileName\(createAdminClient\(\)/.test(sync) && /keepProviderPhoto\(/.test(sync))

  console.log("\nA new account is asked once what brought it here (lib/account/welcome)")
  const now = Date.parse("2026-10-05T12:00:00Z")
  const fresh = "2026-10-05T11:50:00Z"
  check("a new buyer is asked", welcomeWanted({ createdAt: fresh, meta: {}, seller: false, intent: null, now }))
  check("a seller never", !welcomeWanted({ createdAt: fresh, meta: {}, seller: true, intent: null, now }))
  check("Sell on Storelib never (it is the selling branch already)", !welcomeWanted({ createdAt: fresh, meta: {}, seller: false, intent: "sell", now }))
  check("answered before never", !welcomeWanted({ createdAt: fresh, meta: { [WELCOMED_KEY]: true }, seller: false, intent: null, now }))
  check("an account from before this existed never", !welcomeWanted({ createdAt: "2026-09-01T00:00:00Z", meta: {}, seller: false, intent: null, now }) && !welcomeWanted({ createdAt: null, meta: {}, seller: false, intent: null, now }))
  check("it carries where they were going, Discover needs no carrying", welcomeHref("/community/clay?join=1") === `${WELCOME_PATH}?next=%2Fcommunity%2Fclay%3Fjoin%3D1` && welcomeHref("/explore") === WELCOME_PATH)
  check("throughWelcome leaves everybody else's way alone", throughWelcome("/app", { createdAt: fresh, meta: {}, seller: true, intent: null, now }) === "/app")
  check("the onboarding is an auth screen, never somebody's next", safeNext("/onboarding/start", "storelib.com") === null)
  check("the join branch ends in the community, joined by its own ?join=1", welcomeDone("/community/clay?join=1") === "/community/clay?join=1")
  check("  an invite they followed is accepted on arrival", welcomeDone("/community/clay/join?invite=abcdefghijklmnop") === "/community/clay/join?invite=abcdefghijklmnop&accept=1")
  check("  and with nowhere to go, Discover, never their profile", welcomeDone(null) === "/explore" && welcomeDone("//evil.com") === "/explore")
  const startPage = readCode("app/(auth)/onboarding/start/page.tsx")
  check("the start page sends a seller to /app and an answered account on its way", /hasSellerAccess\(access\)\) redirect/.test(startPage) && /WELCOMED_KEY\] === true\) redirect\(welcomeDone/.test(startPage))
  check("a short bio is one line, and empty is nothing", cleanBio("  hi   there  ") === "hi there" && cleanBio("   ") === null && cleanBio(4) === null && (cleanBio("x".repeat(200)) || "").length === 160)
  const modal = readCode("components/app/creator-onboarding-modal.tsx")
  check("a new account opens on Your profile, not a community question", /useState\(start \? JOIN_NAME : 1\)/.test(modal) && /Your profile/.test(modal) && !/Make it yours/.test(modal) && !/What brings you to Storelib/.test(modal) && !/I'm here to join and buy/.test(modal))
  check("  the profile is a name and links, then a username and bio; notifications only in the app", /data-onboarding-join-bio/.test(modal) && /data-onboarding-join-photo/.test(modal) && /JOIN_NAME, JOIN_SOCIAL, \.\.\.\(joinNotify \? \[JOIN_NOTIFY\] : \[\]\)/.test(modal) && /inNativeApp\(\)/.test(modal) && /Create a profile/.test(modal) && /Pick a username/.test(modal) && /placeholder="yourname"/.test(modal) && /storelib\.com\/\$\{normalizeHandle\(joinHandle\)\}/.test(modal) && /Don't miss a thing|Don&apos;t miss a thing/.test(modal))
  check("  no store field in the join slides (no category, no plan)", (() => { const a = modal.indexOf("step === JOIN_NAME &&"); const b = modal.indexOf("{step === 1 && ("); const part = modal.slice(a, b); return a > 0 && b > a && !/selectedCategory|PricingSection/.test(part) && !/communities/.test(part) })())
  check("  notifications are asked only after Turn on notifications", /Turn on notifications/.test(modal) && /await allowNotifications\(\)/.test(modal) && /setPushAnswer\(await askPushPermission\(\)\)/.test(modal) && /Notification\.requestPermission/.test(modal) && /Get notified about replies, messages, updates and things you follow/.test(modal))
  check("  the handle goes through the one handle rule, the name through /api/account/welcome", /\/api\/profile\/username/.test(modal) && /\/api\/account\/welcome/.test(modal))
  const api = readCode("app/api/account/welcome/route.ts")
  check("the welcome API cleans the name, refuses an address, is rate limited and writes only the session's own row", /cleanName\(body\.name\)/.test(api) && /name\.includes\("@"\)/.test(api) && /rateLimit\(/.test(api) && /\.eq\("id", user\.id\)/.test(api) && /cleanBio\(body\.bio\)/.test(api))
  check("a sign-in with nowhere else to go opens the page the account remembered, once", destinationWithAppOpen("/explore", { storelib_open_path: "/community/clay" }, null).destination === "/community/clay" && destinationWithAppOpen("/explore", { storelib_open_path: "/community/clay", storelib_open_used: "/community/clay" }, null).destination === "/explore" && destinationWithAppOpen("/p/x", { storelib_open_path: "/community/clay" }, "/p/x").destination === "/p/x" && pendingAppOpen({ storelib_open_path: "https://evil.com" }) === null)
  const invite = readCode("components/community/member/invite-landing.tsx")
  check("an invite's landing accepts once on arrival with ?accept=1, and drops the flag first", /get\("accept"\) !== "1"/.test(invite) && /searchParams\.delete\("accept"\)/.test(invite) && /autoAccepted\.current = true/.test(invite))

  console.log("\nPull to refresh on the /app home: the community's spinner (scripts/check-app-pull.mjs measures it)")
  const indicator = readCode("components/app/pull-to-refresh-indicator.tsx")
  const dash = readCode("components/app/dashboard-client.tsx")
  check("the indicator draws the eight spokes, not the ring", /SPINNER_SPOKES\.map/.test(indicator) && /data-ptr-spoke/.test(indicator) && !/data-ptr-arc/.test(indicator))
  check("  in the room the spokes need", /const REFRESH_HOLD = SPOKES_HOLD/.test(dash))

  console.log("\nApp links (lib/platform/app-links)")
  const cfg = appLinkConfig({})
  check("without env vars, exactly what the files held", cfg.teamId === DEFAULT_TEAM_ID && cfg.bundleId === "com.storelib.app" && cfg.fingerprints.join() === DEFAULT_ANDROID_FINGERPRINTS.join())
  const custom = appLinkConfig({ APPLE_TEAM_ID: "abcde12345", IOS_BUNDLE_ID: "com.example.app", ANDROID_PACKAGE_NAME: "com.example.app", ANDROID_SHA256_CERT_FINGERPRINTS: `${"aa:".repeat(31)}aa, ${"BB:".repeat(31)}BB` })
  check("from env vars, each checked (case, several fingerprints)", custom.teamId === "ABCDE12345" && custom.bundleId === "com.example.app" && custom.fingerprints.length === 2 && custom.fingerprints[0] === `${"AA:".repeat(31)}AA`)
  check("a malformed value is the default, never a broken file", appLinkConfig({ APPLE_TEAM_ID: "nope", ANDROID_SHA256_CERT_FINGERPRINTS: "zz" }).teamId === DEFAULT_TEAM_ID && appLinkConfig({ ANDROID_SHA256_CERT_FINGERPRINTS: "zz" }).fingerprints.join() === DEFAULT_ANDROID_FINGERPRINTS.join())
  const aasa = appleAppSiteAssociation(custom)
  check("the AASA names the app for links and passwords", aasa.applinks.details[0].appIDs[0] === "ABCDE12345.com.example.app" && aasa.webcredentials.apps[0] === "ABCDE12345.com.example.app")
  check("assetlinks names the package and keys", assetLinks(custom)[0].target.package_name === "com.example.app" && assetLinks(custom)[0].target.sha256_cert_fingerprints.length === 2)
  const opens = ["/community/clay", "/community/clay/post/1", "/@ana", "/member/ana", "/u/ana", "/p/a-thing", "/andrewrullz", "/andrewrullz/a-product", "/auth/callback"]
  const stays = ["/", "/app", "/app/products", "/checkout", "/receipt/1", "/purchase/success", "/login", "/signup", "/explore", "/api/x", "/admin", "/onboarding/start", "/community", "/robots.txt", "/icon.png", "/sitemap.xml"]
  check("communities, profiles, creator pages and products open the app", opens.every(opensInApp), opens.filter((p) => !opensInApp(p)))
  check("checkout, sign in, /app and the platform's own pages stay in the browser", stays.every((p) => !opensInApp(p)), stays.filter(opensInApp))
  /* Every top level route under app/ is either one of the app's paths or the platform's own, so no new page is ever taken for a creator page. */
  const segs = new Set<string>()
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const full = join(d, f)
      if (!statSync(full).isDirectory()) continue
      if (/^\(.*\)$/.test(f)) walk(full)
      else if (!f.startsWith("[") && !f.startsWith("_")) segs.add(f)
    }
  }
  walk(join(process.cwd(), "app"))
  const known = new Set<string>([...WEB_ONLY_SEGMENTS, ...APP_PATHS.map((p) => p.split("/")[1].replace(/\*$/, ""))])
  const unknown = [...segs].filter((s) => !known.has(s) && !/\./.test(s))
  check("every top level route is the app's or the platform's own", unknown.length === 0, unknown)
  const cfgFile = readCode("next.config.mjs")
  check("the two addresses are served by the routes (rewritten before the public folder)", /source: "\/\.well-known\/apple-app-site-association", destination: "\/api\/app-links\/apple-app-site-association"/.test(cfgFile) && /source: "\/\.well-known\/assetlinks\.json", destination: "\/api\/app-links\/assetlinks"/.test(cfgFile))
  {
    const { GET: aasaGet } = await import("../app/api/app-links/apple-app-site-association/route")
    const { GET: linksGet } = await import("../app/api/app-links/assetlinks/route")
    const a = aasaGet()
    const l = linksGet()
    check("served as application/json with a 200", a.status === 200 && a.headers.get("content-type") === "application/json" && l.status === 200 && l.headers.get("content-type") === "application/json")
    const body = JSON.parse(await a.text())
    check("  and the body parses to the association", body.applinks.details[0].components.length > 10 && Array.isArray(JSON.parse(await l.text())))
  }
  check("a storelib.com link the phone hands the app is its page", openTarget("https://storelib.com/community/clay?x=1") === "/community/clay?x=1" && openTarget("https://www.storelib.com/@ana") === "/@ana")
  check("  the sign in and reset returns are left to their own handler", openTarget("https://storelib.com/auth/callback?code=1") === null && openTarget("https://storelib.com/app/auth/callback?code=1") === null && openTarget("https://storelib.com/reset-password#t") === null)
  check("  another site never", openTarget("https://storelib.com.evil.com/x") === null && openTarget("https://evil.com/community/x") === null)
  const opener = readCode("components/platform/app-link-opener.tsx")
  check("the app follows the launch link once per run, not on every page load", /sessionStorage\.getItem\(LAUNCH_KEY\)/.test(opener) && /if \(seen !== launch\) go\(launch\)/.test(opener))
  check("the root layout mounts it", /<AppLinkOpener \/>/.test(readCode("app/layout.tsx")))
  const manifest = readCode("android/app/src/main/AndroidManifest.xml")
  check("Android declares the shared pages as verified App Links", /android:autoVerify="true"[\s\S]*?android:pathPrefix="\/community\/"[\s\S]*?android:pathPrefix="\/@"/.test(manifest))

  console.log("\nThe Open in the app pill (scripts/check-open-app-pill.mjs measures it)")
  check("Android opens this page in the app, the Play Store as the fallback", /^intent:\/\/storelib\.com\/community\/clay#Intent;scheme=https;package=com\.storelib\.app;S\.browser_fallback_url=/.test(pageAppLink("android", "/community/clay")))
  {
    const fb = decodeURIComponent((pageAppLink("android", "/community/clay").split("S.browser_fallback_url=")[1] || "").replace(/;end$/, ""))
    check("  and Play carries the page, so a later install can open it", fb.startsWith("https://play.google.com/store/apps/details") && fb.includes("referrer=utm_content%3D%2Fcommunity%2Fclay"))
  }
  check("a free join from sign-up is finished on the server, then the feed", /load\.data\.join\.kind === "join_free"/.test(readCode("app/(marketing)/community/[slug]/page.tsx")) && /redirect\(`\$\{home\}\?welcome=1`\)/.test(readCode("app/(marketing)/community/[slug]/page.tsx")))
  check("an iPhone opens the app's scheme with the page", pageAppLink("ios", "/community/clay") === "com.storelib.app://open?path=%2Fcommunity%2Fclay")
  const ua = { safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1", chrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/129.0 Mobile/15E148", android: "Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile Safari/537.36", app: "Mozilla/5.0 (iPhone) Capacitor", mac: "Mozilla/5.0 (Macintosh) Safari/605" }
  check("Safari with the Smart App Banner gets no pill; without one it does", pillPhone(ua.safari, true) === null && pillPhone(ua.safari, false) === "ios")
  check("Chrome on an iPhone and Android get the pill; the app and a computer never", pillPhone(ua.chrome, true) === "ios" && pillPhone(ua.android, true) === "android" && pillPhone(ua.app, false) === null && pillPhone(ua.mac, false) === null)
  const pill = readCode("components/community/open-in-app-pill.tsx")
  const joinBar = readCode("components/community/public/join-controls.tsx")
  check(
    "the pill floats above the join bar and buyer tabs, not over them",
    /COMMUNITY_FLOAT_BOTTOM/.test(pill) && /data-community-fixed-foot/.test(joinBar) && /CommunityFixedFootWatch/.test(readCode("components/community/member/shell-frame.tsx")),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("\nFailed:\n  " + failures.join("\n  "))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
