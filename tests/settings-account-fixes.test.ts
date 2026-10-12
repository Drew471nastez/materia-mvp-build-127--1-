/**
 * ===========================================================================
 *  SETTINGS: ONE PHOTO, NOTIFICATIONS THAT SAVE, A TIME ZONE THAT MEANS SOMETHING
 * ===========================================================================
 * The owner's seven notes on Settings, each held here:
 *
 *   1  Profile information: the username first, then the name
 *   2  One profile photo: removing it shows the initials everywhere, at once,
 *      and signing in with Google again does not bring its picture back
 *   3  "Notifications on this browser": the database refused platform "web"
 *      (23514), so every browser failed; each failure now says what it is
 *   4  Tooltips drawn on the body, kept inside the screen, wrapping
 *   5  The language picker: a popover or dialog with a search, the shared
 *      sheet on a phone, only languages with words
 *   6  The time zone: every zone, a search, "Use my current time zone", saved
 *      to the account and followed by the server
 *   7  No Stores tab; ?tab=stores opens General
 *
 * The layouts are measured by scripts/check-account-settings.mjs.
 *
 * Run with:  npm run test:push
 */
import { untt } from "./i18n-source"
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { copyProviderAvatar, profileAvatar } from "../lib/account/avatar"
import { accountTimeZone, formatForCreator, timeZoneScript, validTimeZone } from "../lib/account/time-zone"
import { endpointOf, endpointPattern, keptOn, saveFailure, tokenOf, validSubscription } from "../lib/push/web-subscriptions"
import { matches } from "../lib/ui/choice-match"
import { greetingZone } from "../lib/greeting"

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

const form = readCode("components/app/settings-form-new.tsx")

console.log("\n1. Profile information: the username, then the name")
{
  const card = form.slice(form.indexOf('data-settings-card="profile"'), form.indexOf("Your addresses"))
  const user = card.indexOf('htmlFor="username"')
  const name = card.indexOf('htmlFor="firstName"')
  check("the username field comes before the name field", user > 0 && name > user, { user, name })
}

console.log("\n2. One profile photo")
{
  const day = 24 * 60 * 60 * 1000
  const google = "https://lh3.googleusercontent.com/a/photo"
  check("a new account gets the Google picture", copyProviderAvatar({ profileExists: false, profileAvatar: null, providerAvatar: google, chosen: false, accountAgeMs: 2000 }))
  check("so does the profile the database trigger has just made", copyProviderAvatar({ profileExists: true, profileAvatar: null, providerAvatar: google, chosen: false, accountAgeMs: 60_000 }))
  /* The owner, round 10: "saved to their profile when they have none (on every sign in until they have one)". */
  check("a sign in to an older account with no photo now does too", copyProviderAvatar({ profileExists: true, profileAvatar: null, providerAvatar: google, chosen: false, accountAgeMs: 30 * day }))
  check("nor one where the person removed their photo, however new", !copyProviderAvatar({ profileExists: true, profileAvatar: null, providerAvatar: google, chosen: true, accountAgeMs: 2000 }))
  check("nor over a photo that is there", !copyProviderAvatar({ profileExists: true, profileAvatar: "https://x/avatars/u/a.jpg", providerAvatar: google, chosen: false, accountAgeMs: 2000 }))
  check("the old placeholder is no photo", profileAvatar("/placeholder.svg?height=40") === null && profileAvatar("") === null && profileAvatar("https://x/a.jpg") === "https://x/a.jpg")

  const callback = readCode("app/auth/callback/route.ts")
  check("the sign in callback asks the provider photo rule, both when it makes the profile and when it finds one",
    (callback.match(/providerPhotoWanted\(\{/g) ?? []).length === 2 && !/if \(!existingProfile\.avatar_url && avatarUrl\) updates\.avatar_url = avatarUrl/.test(callback)
      && /AVATAR_CHOSEN\] === true/.test(callback))

  const layout = readCode("app/app/layout.tsx")
  check("the header's photo is the profile's, with no fallback", /const avatarUrl = profileAvatar\(profile\?\.avatar_url\)/.test(layout)
    && !/googleAvatar|user_metadata\?\.picture|storeBuilderAvatar|onepage\?\.avatar_url \|\| googleAvatar/.test(layout))
  const sidebar = readCode("components/app/sidebar.tsx")
  check("every avatar in the shell reads it through the store Settings announces to", /const avatarSrc = toOriginalImageUrl\(useShellAvatar\(avatarUrl\)\)/.test(sidebar))
  const store = readCode("lib/account/avatar-store.ts")
  check("the store: an announcement wins until the server's own answer changes", /useSyncExternalStore\(subscribe, read, \(\) => null\)/.test(store) && /return announced \? announced\.url : server/.test(store) && /latest = null/.test(store))

  const photo = readCode("components/app/settings/profile-photo.tsx")
  check("removing saves through the route and tells the shell at once", /await savePhoto\(null\)[\s\S]{0,200}announceAvatar\(null\)/.test(photo) && /await savePhoto\(publicUrl\)\s*announceAvatar\(publicUrl\)/.test(photo))
  check("and no longer writes the profile straight from the browser", !/from\("profiles"\)\.update\(\{ avatar_url/.test(photo))
  const route = readCode("app/api/account/avatar/route.ts")
  /* The writes moved into lib/account/avatar-save (the choice first, then the profile, read back): tests/avatar-one-source runs them. */
  const save = readCode("lib/account/avatar-save.ts")
  check("the route writes the profile on the person's own client and marks the choice on the account",
    /saveProfilePhoto\(supabase as unknown as PhotoClient, user, url\)/.test(route)
      && /supabase\.from\("profiles"\)\.update\(\{ avatar_url: url \}\)\.eq\("id", user\.id\)/.test(save) && /supabase\.auth\.updateUser\(\{ data: \{ \[AVATAR_CHOSEN\]: true \} \}\)/.test(save))
  check("and only takes a photo from the person's own folder", /\/storage\/v1\/object\/public\/avatars\/\$\{userId\}\//.test(route))

  const settings = readCode("app/app/settings/_server.ts")
  check("Settings reads no other photo to fall back to", !/googleAvatarUrl|storeBuilderAvatarUrl|onepageAvatarUrl/.test(settings + form) && /useShellAvatar\(profile\.avatar_url\) \?\? ""/.test(form))
  for (const f of ["app/account/library/page.tsx", "app/account/settings/page.tsx", "components/marketing/header.tsx", "components/marketing/header-client.tsx", "components/platform/platform-header-client.tsx"]) {
    check(`${f}: no Google fallback either`, !/user_metadata\??\.(avatar_url|picture)|googleAvatar/.test(readCode(f)))
  }
}

console.log("\n3. Notifications on this browser")
{
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/ab_c%d", keys: { p256dh: "BPk", auth: "x1" } }
  check("a browser's subscription is taken", validSubscription(sub))
  check("anything else is not", !validSubscription({ endpoint: "http://x", keys: { p256dh: "a", auth: "b" } }) && !validSubscription({ endpoint: "https://x" }) && !validSubscription(null))
  const token = tokenOf(sub)
  check("the token is the subscription, endpoint first, and gives the endpoint back", token.startsWith('{"endpoint":') && endpointOf(token) === sub.endpoint)
  const pattern = endpointPattern(sub.endpoint)
  check("the LIKE pattern escapes % and _ so it matches this endpoint only", pattern === '%"endpoint":"https://fcm.googleapis.com/fcm/send/ab\\_c\\%d"%', pattern)
  check("the check constraint refusing 'web' is recognised", saveFailure({ code: "23514", message: 'new row for relation "push_tokens" violates check constraint "push_tokens_platform_check"' }) === "platform_refused")
  check("so is a missing table, a duplicate, and nothing wrong", saveFailure({ code: "PGRST205" }) === "no_table" && saveFailure({ code: "23505" }) === "duplicate" && saveFailure(null) === "none" && saveFailure({ code: "XX000" }) === "other")
  check("subscriptions kept on the account are read back, junk dropped", keptOn({ storelib_web_push: [sub, { endpoint: 1 }] }).length === 1 && keptOn(undefined).length === 0)

  const route = readCode("app/api/push/web/route.ts")
  check("the save is a delete of this endpoint then an insert, not an upsert on a conflict target that may not exist",
    !/onConflict/.test(route) && /\.delete\(\)\.eq\("platform", "web"\)\.like\("token", endpointPattern\(sub\.endpoint\)\)/.test(route) && /\.insert\(\{ user_id: who\.id, token, platform: "web"/.test(route))
  check("a database that refuses 'web' keeps it on the account, and says which SQL to run", /failure === "platform_refused" \|\| failure === "no_table"/.test(route) && /keepOnAccount\(admin, who\.id, sub\)/.test(route) && /run-now\/23_browser_push_and_time_zone\.sql/.test(route))
  check("GET ?endpoint= says whether this browser is saved", /searchParams\.get\("endpoint"\)/.test(route) && /saved: inTable \|\| onAccount/.test(route))
  check("a blip is a 503, not a sign out", /current\.state === "indeterminate"/.test(route) && /kind === "unknown"\) return unreachable\(\)/.test(route))
  const sender = readCode("lib/push/sender.ts")
  check("the sender reaches the browsers kept on the account too, each once", /readKept\(supabase, userId\)/.test(sender) && /!inTable\.has\(s\.endpoint\)/.test(sender))

  const client = readCode("lib/push/web-client.ts")
  check("the worker is found by its own script, not whatever controls /", /getRegistrations\(\)/.test(client) && /scriptURL\.endsWith\(WORKER\)/.test(client) && !/getRegistration\(WORKER\)/.test(client))
  check("and waited for by its own state with a ceiling, not serviceWorker.ready", !/serviceWorker\.ready/.test(client) && /WORKER_WAIT_MS/.test(client) && /statechange/.test(client))
  check("a subscription under another key is dropped and made again", /!sameKey\(sub\.options\?\.applicationServerKey, wanted\)/.test(client) && /InvalidStateError/.test(client))
  check("each failure is named: dismissed, blocked, worker, push service, network, signed out, server",
    ["dismissed", "worker", "push_service", "network", "signed_out", "server"].every((k) => client.includes(`new WebPushError("${k}"`)) && /return "blocked"/.test(client))
  check("on load the switch reads the browser and the server, and re-saves a subscription the server lost", /publicKey\(sub\.endpoint\)/.test(client) && /server\.saved === false/.test(client) && /await save\(sub\)/.test(client))
  check("Safari on an iPhone is told so, not 'unsupported'", /"standalone" in navigator/.test(client) && /"iphone"/.test(client))
  const panels = readCode("components/app/settings/account-panels.tsx")
  check("the row shows the message for each state and the error's own words", /state === "blocked" \? NOTIFICATION_WORDS\.blocked/.test(panels) && /e instanceof WebPushError \? e\.message/.test(panels) && /data-notifications-error/.test(panels))
  check("and is still not drawn in the native apps", /state === "unsupported" && document\.documentElement\.classList\.contains\("capacitor"\)\)\) return null/.test(panels))

  const migration = untt(readFileSync("supabase/migrations/20261001_browser_push_and_time_zone.sql", "utf8"))
  const part = untt(readFileSync("supabase/sql/run-now/23_browser_push_and_time_zone.sql", "utf8"))
  for (const [name, sql] of [["the migration", migration], ["run-now 22", part]] as const) {
    check(`${name}: every platform check is replaced by one that takes 'web'`, /pg_get_constraintdef\(oid\) ilike '%platform%'/.test(sql) && /check \(platform in \('ios', 'android', 'web'\)\)/.test(sql))
    check(`${name}: the token index and profiles.timezone`, /create unique index if not exists push_tokens_token_idx on public\.push_tokens \(token\)/.test(sql) && /add column if not exists timezone text/.test(sql))
  }
  check("run-now 22 is one statement per line, listed in the README", part.trim().split("\n").every((l) => l.startsWith("/*") || l.trim().endsWith(";")) && untt(readFileSync("supabase/sql/run-now/README.md", "utf8")).includes("23_browser_push_and_time_zone.sql"))
}

console.log("\n4. Tooltips are never cut off")
{
  const tip = readCode("components/ui/tooltip.tsx")
  check("drawn on the body, kept 12px inside the screen", /<TooltipPrimitive\.Portal>/.test(tip) && /collisionPadding = TOOLTIP_EDGE/.test(tip) && /export const TOOLTIP_EDGE = 12/.test(tip) && /avoidCollisions/.test(tip))
  check("and wrapping at 280px, or the screen less 24px", /max-w-\[min\(280px,calc\(100vw-24px\)\)\]/.test(tip) && /whitespace-normal/.test(tip))
  check("a tap opens it on a touch screen", /pointerType === 'touch'/.test(tip) && /e\.preventDefault\(\)/.test(tip))
  const general = form.slice(form.indexOf('{panelTab === "general" && ('), form.indexOf('{panelTab === "security" && ('))
  check("Settings' Support Email note is the shared tooltip, not a nowrap box in the card", /<InfoTip label="About the support email">/.test(general) && !/whitespace-nowrap z-50/.test(general) && !/group-hover:visible/.test(general))
  check("and so is the statement descriptor's", /<InfoTip label="About statement descriptor">/.test(form))
}

console.log("\n5. The language picker")
{
  /* lib/i18n/translations.ts is not compiled here (it carries duplicate keys tsc refuses), so its languages are read from its text. */
  const words = untt(readFileSync("lib/i18n/translations.ts", "utf8"), "lib/i18n/translations.ts")
  const translated = [...words.matchAll(/^  ([a-zA-Z-]+|"[a-zA-Z-]+"): \{/gm)].map((m) => m[1].replace(/"/g, ""))
  const langs = readCode("lib/i18n/app-languages.ts")
  check("only languages with words are offered", /LANGUAGES\.filter\(\(l\) => l\.code in translations\)/.test(langs) && translated.join(",") === "en,es,fr,de,pt-BR,it,pl", translated.join(","))
  check("each by its own name with its name in the dashboard's language under it", /new Intl\.DisplayNames\(\[locale\], \{ type: "language" \}\)/.test(langs) && /const local = nameIn\(here, l\.code\) \?\? english/.test(langs) && /label: l\.name/.test(langs) && /detail: !local \|\| same \? undefined : local/.test(langs))
  const de = { value: "de", label: "Deutsch", detail: "German", keywords: "German de" }
  const es = { value: "es", label: "Español", detail: "Spanish", keywords: "Spanish es" }
  check("search finds a language by its English name, and without its accents", matches(de, "germ") && matches(es, "espanol") && !matches(de, "spanish"))
  const bucharest = { value: "Europe/Bucharest", label: "Bucharest", detail: "Europe", aside: "UTC+3", keywords: "UTC+3 GMT+3 +3" }
  check("and a time zone by its city, region or offset", matches(bucharest, "buch") && matches(bucharest, "europe utc+3") && matches(bucharest, "gmt+3") && !matches(bucharest, "utc+2"))
  const list = readCode("components/ui/choice-list.tsx")
  check("a popover under the field on a computer, the shared sheet on a phone", /<PopoverContent/.test(list) && /<BottomSheet/.test(list) && /usePhoneWidth\(\)/.test(list))
  check("the sheet has the search at the top, 48px rows and no X", /min-h-\[48px\]/.test(list) && /header=\{\s*<div data-choice-sheet-header/.test(list) && !/ChoiceSheet[\s\S]{0,1500}<X /.test(list.slice(list.indexOf("export function ChoiceSheet"), list.indexOf("export function ChoicePicker"))))
  check("16px search text on a phone, so iOS does not zoom", /compact \? "h-11 text-\[16px\]"/.test(list))
  check("Settings' Language is that field", /<ChoicePicker\s+name="language"/.test(form) && !/showLanguageModal/.test(form))
  check("and the account menu's Language opens the same list", /<AppLanguageModal open=\{languageOpen\}/.test(readCode("components/app/sidebar.tsx")) && /<ChoiceDialog/.test(readCode("components/app/language-picker.tsx")))
}

console.log("\n6. The time zone, saved and followed")
{
  check("an IANA name is taken", validTimeZone("Europe/Bucharest") === "Europe/Bucharest" && validTimeZone("America/New_York") === "America/New_York")
  check("UTC is taken, as UTC", validTimeZone("UTC") === "UTC" && validTimeZone("Etc/UTC") === "UTC")
  check("anything else is refused", validTimeZone("Mars/Olympus") === null && validTimeZone("Europe/Bucharest</script>") === null && validTimeZone("") === null && validTimeZone(42) === null)
  check("the column wins over the account's copy, and junk in either is ignored",
    accountTimeZone("Asia/Tokyo", { timezone: "Europe/Paris" }) === "Asia/Tokyo" && accountTimeZone(null, { timezone: "Europe/Paris" }) === "Europe/Paris" && accountTimeZone("nope", { timezone: "nope" }) === null)
  const f = formatForCreator("2026-10-01T06:40:00Z", "Europe/Bucharest")
  check("a sale email's time is the creator's, with its zone named", f.date === "Thursday, October 1, 2026" && /^9:40\sAM GMT\+3$/.test(f.time), f)
  check("and with no zone it says UTC rather than pretending", /UTC$/.test(formatForCreator("2026-10-01T06:40:00Z", null).time))
  check("the layout's script only ever writes a validated zone", timeZoneScript("Europe/Bucharest").includes('"Europe/Bucharest"') && timeZoneScript("x\"</script>") === "")
  check("Home greets by the account's zone before the cookie or the connection", greetingZone("Europe%2FBucharest", "America/New_York", "Asia/Tokyo") === "Asia/Tokyo" && greetingZone("Europe%2FBucharest", "America/New_York", null) === "Europe/Bucharest")

  const route = readCode("app/api/account/time-zone/route.ts")
  check("the route validates, writes the column on the person's own client and keeps it on the account",
    /const zone = validTimeZone\(body\.timeZone\)/.test(route) && /supabase\.from\("profiles"\)\.update\(\{ timezone: zone \}\)/.test(route) && /updateUser\(\{ data: \{ \[TIME_ZONE_KEY\]: zone \} \}\)/.test(route))
  check("a database without the column still saves it", /missingSchema\(error\)/.test(route))
  check("and sets the cookie the server renders in, unencoded (Next encodes it)", /res\.cookies\.set\(TIME_ZONE_COOKIE, zone,/.test(route))
  check("Settings saves it to the account, not only to this browser", /fetch(?:WithDeadline)?\("\/api\/account\/time-zone"/.test(form) && !/localStorage\.setItem\('storelib_timezone'/.test(form))
  check("and starts from the account's zone", /if \(accountTimeZone\) return accountTimeZone/.test(form) && /accountTimeZone=\{data\.timeZone\}/.test(readCode("app/app/settings/_view.tsx")))
  const layout = readCode("app/app/layout.tsx")
  check("every /app page reads the account's zone on every device", /accountTimeZone\(null, user\.user_metadata\)/.test(layout) && /timeZoneScript\(accountZone\)/.test(layout) && /<TimeZoneSync accountZone=\{accountZone\} \/>/.test(layout))
  check("an account with none is given the browser's, once", /fetch\("\/api\/account\/time-zone"/.test(readCode("components/app/time-zone-sync.tsx")) && /storelib_tz_asked/.test(readCode("components/app/time-zone-sync.tsx")))
  check("Home's greeting and the Orders page's first render follow it", /accountTimeZone\(null, user\.user_metadata\)\)/.test(readCode("app/app/page.tsx")) && /timeZone=\{accountTimeZone\(null, user\.user_metadata\) \?\? readTimeZone/.test(readCode("app/app/orders/sales/page.tsx")))
  const email = readCode("lib/email.tsx")
  /* The first sale email is the notification engine's FIRST_SALE now (lib/notify), no longer a sender in lib/email.tsx. */
  check("the sale email is written in it", /creatorTimeZone\(admin, creatorId\)/.test(email) && /formatForCreator\(sale\.occurredAt, creatorZone \?\? null\)/.test(email) && !/function sendFirstSaleEmail/.test(email))
  const picker = readCode("components/app/time-zone-picker.tsx")
  check("the picker lists every zone the browser knows, and offers this device's", /supportedValuesOf\?\.\("timeZone"\)/.test(picker) && /Use my current time zone/.test(picker))
}

console.log("\n7. No Stores tab")
{
  check("the tab and its panel are gone", !/id: "stores"/.test(form) && !/activeTab === "stores"/.test(form) && !/"stores"/.test(form))
  check("an old ?tab=stores link opens General and tidies the address", /else if \(tab\) \{[\s\S]{0,300}url\.searchParams\.delete\("tab"\)/.test(form))
  check("the billing page's copy of the tabs has none either", !/"stores"/.test(readCode("components/app/billing/billing-page-client.tsx")))
}

/*
  "On mobile there's too much text, that one text shrinks the rest." The
  Website row carried "Published: Luca Dragoste. A custom domain is set in its
  Domains." and four controls, so at 390 its text had a third of the row and
  ran seven lines. Measured by scripts/check-settings-addresses.mjs.
*/
console.log("\n8. Your addresses: a name, an address, three controls")
{
  const list = readCode("components/app/settings/addresses.tsx")
  check("no row explains itself", !/Published:|custom domain is set|Its own address|until you give it|note=/.test(list))
  check("the Website row shows its connected domain, else its storelib address", /return domain \? \{ display: domain, url: `https:\/\/\$\{domain\}` \} : \{ display: getWebsiteUrlDisplay\(siteName\), url: getWebsiteUrl\(siteName\) \}/.test(list))
  check("and General hands it the domain the share pill uses", /<AddressList username=\{username\} website=\{website\} websiteDomain=\{websiteDomain\} \/>/.test(form))
  check(
    "on a phone the address has the whole line under the name, cut only at its end",
    /data-address-display=""[\s\S]{0,200}"col-span-2 row-start-2 truncate text-\[13px\] leading-5 sm:col-span-1"/.test(list) &&
      /grid grid-cols-\[minmax\(0,1fr\)_auto\]/.test(list),
  )
  check("every row has Copy and Open", (list.match(/aria-label=\{`Copy the \$\{label\.toLowerCase\(\)\} address`\}/g) ?? []).length === 1 && /aria-label=\{`Open the \$\{label\.toLowerCase\(\)\}`\}/.test(list))
  check(
    "the Website's third control is Edit, a menu of where it went before and the editor",
    /data-address-menu=""/.test(list) &&
      ["{ label: \"Edit website\", href: editor }", "href: `${editor}?settings=domains`", "href: `${editor}?settings=seo`", "href: `${editor}?settings=general`"].every((s) => list.includes(s)) &&
      /<ResponsiveActionMenu/.test(list),
  )
  check("the creator page and OnePage still edit where they did", /href="\/creator-page"/.test(list) && /href="\/app\/onepage"/.test(list) && /href="\/app\/website-builder"/.test(list))
  check(
    "44px targets on a phone, 32px on a computer, and Edit never wraps",
    /"inline-flex h-11 w-11 shrink-0[^"]*sm:h-8 sm:w-8"/.test(list) && /"inline-flex h-11 min-w-\[60px\] shrink-0[^"]*whitespace-nowrap[^"]*sm:h-8/.test(list),
  )
  check("no box inside the card: rows and hairlines", /data-address-list="" className="divide-y divide-\[#f0f1f3\] border-t border-\[#f0f1f3\]"/.test(list) && !/rounded-xl border border-\[#eceef1\]/.test(list))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
