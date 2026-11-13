/**
 * ===========================================================================
 *  HOME, WAVE 12, PLATFORM TRACK: FIVE SECTIONS OF THE NEW storelib.com
 * ===========================================================================
 * components/marketing/home/
 *   everything-in-one-place.tsx  EverythingInOnePlace  (page section 3)
 *   audience-ownership.tsx       AudienceOwnership     (section 10)
 *   analytics-showcase.tsx       AnalyticsShowcase     (section 11)
 *   integrations-section.tsx     IntegrationsSection   (section 13)
 *   app-anywhere.tsx             AppAnywhere           (section 15)
 *
 * RENDER     each renders on the server with its heading, its id and its
 *            copy, and no em dash in what a visitor reads.
 * TRUTH      every integration tile is one Storelib connects today (the
 *            catalog, not Coming soon) or the payments it runs on; the sync
 *            platforms are the five the catalog syncs; analytics shows only
 *            the breakdowns the Analytics page has, and says it has no age or
 *            gender; Google Play is Coming soon and not a link; the App Store
 *            link follows the same env as the footer.
 * IMAGES     no hotlinked picture anywhere; every local file exists; the
 *            track's own photos stay under budget.
 * MOTION     only transform and opacity in any keyframes; every loop pauses
 *            off screen (pseudo-elements too) and stops under reduced
 *            motion; nothing written into the page per frame that would make
 *            the site's :has() rules restyle the document.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createElement, type ComponentType } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace } from "@/components/marketing/home/everything-in-one-place"
import { AudienceOwnership } from "@/components/marketing/home/audience-ownership"
import { AnalyticsShowcase } from "@/components/marketing/home/analytics-showcase"
import { IntegrationsSection, PLATFORM_INTEGRATION_APPS } from "@/components/marketing/home/integrations-section"
import { AppAnywhere, PLATFORM_APP_STORE_HREF } from "@/components/marketing/home/app-anywhere"
import { PLATFORM_LAND_B64, PLATFORM_LAND_H, PLATFORM_LAND_W } from "@/components/marketing/home/platform-globe-land"
import { PLATFORM_GLOBE_SPOTS } from "@/components/marketing/home/platform-globe"
import { INTEGRATIONS } from "@/lib/integrations/catalog"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const DIR = "components/marketing/home"
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")

const SECTIONS: Array<{ file: string; name: string; C: ComponentType; id: string; heading: string }> = [
  { file: "everything-in-one-place", name: "EverythingInOnePlace", C: EverythingInOnePlace, id: "everything-in-one-place", heading: "Make the work. Skip the busywork." },
  { file: "audience-ownership", name: "AudienceOwnership", C: AudienceOwnership, id: "audience-ownership", heading: "Your audience belongs to you." },
  { file: "analytics-showcase", name: "AnalyticsShowcase", C: AnalyticsShowcase, id: "analytics-showcase", heading: "Know what's working, as it happens." },
  { file: "integrations-section", name: "IntegrationsSection", C: IntegrationsSection, id: "integrations", heading: "Connect your favorite apps" },
  { file: "app-anywhere", name: "AppAnywhere", C: AppAnywhere, id: "app-anywhere", heading: "Run your business from anywhere" },
]

console.log("\n── files and rendering ──")
const html: Record<string, string> = {}
for (const s of SECTIONS) {
  const src = read(`${DIR}/${s.file}.tsx`)
  check(`${s.file}: a client component exporting ${s.name}`, src.startsWith('"use client"') && new RegExp(`export function ${s.name}\\(`).test(src))
  let out = ""
  try {
    out = renderToStaticMarkup(createElement(s.C))
  } catch (e) {
    check(`${s.file}: renders on the server`, false, String(e))
    continue
  }
  html[s.file] = out
  /* Changed on purpose (wave 13): section 3's heading is a plain two-tone <h2> (dark lead, grey rest), not a scroll-inked StoryHeading, so its words are read from the heading itself. */
  check(`${s.file}: renders with its id and heading`, out.includes(`id="${s.id}"`) && (out.includes(`aria-label="${s.heading.replace(/'/g, "&#x27;")}"`) || text(out.match(/<h2[\s\S]*?<\/h2>/)?.[0] ?? "").trim() === s.heading), out.slice(0, 300))
  check(`${s.file}: no em dash in the words`, !/—/.test(text(out)))
  check(`${s.file}: no lorem`, !/lorem|ipsum/i.test(out))
}
/* Changed on purpose (land round): the storefront card's OnePages are drawn by the theme picker's ThemePreview (components/marketing/home/onepage-sample), whose pictures go through the image optimizer as the picker's do (data-tp-photo, data-theme-thumb); the sections' own pictures are checked here. */
const page = Object.values(html).join("\n").replace(/<img [^>]*data-(?:tp-photo|theme-thumb|theme-cover)[^>]*>/g, "")

console.log("\n── images ──")
const srcs = [...page.matchAll(/\s(?:src|srcSet|srcset)="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((p) => p.trim().split(/\s+/)[0]))
check("pictures found in the markup", srcs.length > 20, srcs.length)
check("no picture is hotlinked", srcs.every((u) => u.startsWith("/")), srcs.filter((u) => !u.startsWith("/")))
const missing = [...new Set(srcs)].filter((u) => !existsSync(join(root, "public", u)))
check("every local picture exists", missing.length === 0, missing)
const allSrc = SECTIONS.map((s) => read(`${DIR}/${s.file}.tsx`)).join("\n") + read(`${DIR}/platform-globe.tsx`)
check("no remote image host in the sources", !/images\.unsplash\.com|plus\.unsplash\.com|https?:\/\/[^"'\s]+\.(png|jpe?g|webp|svg|gif)/.test(strip(allSrc)))
const own = readdirSync(join(root, "public/home/platform"))
const ownBytes = own.reduce((n, f) => n + statSync(join(root, "public/home/platform", f)).size, 0)
check("the track's photos are .webp", own.length > 0 && own.every((f) => f.endsWith(".webp")), own)
check("the track's photos stay under 6 MB together, 400 KB each", ownBytes <= 6 * 1024 * 1024 && own.every((f) => statSync(join(root, "public/home/platform", f)).size <= 400 * 1024), ownBytes)
/* Changed on purpose (wave 13): the section's visual is the owner's own photograph of the app, in public/home/app. */
check("the app photo is lazy, async, sized and has sizes", /<img[^>]*storelib-app-720\.webp[^>]*/.test(html["app-anywhere"] ?? "") && /<img[^>]*storelib-app[^>]*loading="lazy"[^>]*decoding="async"/.test(html["app-anywhere"] ?? "") && /sizes="[^"]+"/.test(html["app-anywhere"] ?? ""))
{
  const appFiles = readdirSync(join(root, "public/home/app"))
  check("the app photo is .webp, each file under 120 KB", appFiles.length >= 2 && appFiles.every((f) => f.endsWith(".webp") && statSync(join(root, "public/home/app", f)).size <= 120 * 1024), appFiles)
}
check("every <img> carries width and height", [...page.matchAll(/<img [^>]*>/g)].every((m) => /width="\d+"/.test(m[0]) && /height="\d+"/.test(m[0])))

console.log("\n── truth: integrations ──")
const ALIAS: Record<string, string> = { "Tag Manager": "Google Tag Manager" }
/* Not catalog rows: the payments Storelib's checkout runs on (Stripe, with its wallets) and the bookings calendar (lib/google-calendar). */
const RUNS_ON = new Set(["Stripe", "Apple Pay", "Google Pay", "Google Calendar", "PostHog"])
const byName = new Map(INTEGRATIONS.map((i) => [i.name, i]))
for (const a of PLATFORM_INTEGRATION_APPS) {
  const name = ALIAS[a.name] ?? a.name
  const row = byName.get(name)
  const ok = RUNS_ON.has(name) || (!!row && !row.comingSoon && !row.paused)
  check(`${a.name}: Storelib connects to it today`, ok, row ? { comingSoon: row.comingSoon } : "not in the catalog")
  if (a.logo) check(`${a.name}: its logo is the catalog's own file`, existsSync(join(root, "public", a.logo)) && (!row || row.logo === a.logo), { logo: a.logo, catalog: row?.logo })
}
check("PostHog is a real Send analytics destination", /PostHog/.test(read("lib/integrations/catalog.ts")))
check("Google Calendar is a real bookings connection", existsSync(join(root, "lib/google-calendar/server.ts")))
check("Apple Pay and Google Pay come with Stripe's checkout", /apple/i.test(read("lib/checkout/wallet-domains.ts")))
const comingSoon = INTEGRATIONS.filter((i) => i.comingSoon).map((i) => i.name)
check("no Coming soon integration shown", !PLATFORM_INTEGRATION_APPS.some((a) => comingSoon.includes(a.name)))
check("no rival store builder", !/Shopify|Squarespace|Wix|Gumroad|Linktree|Stan Store|Kajabi|Fourthwall/i.test(text(page)))
const integ = read(`${DIR}/integrations-section.tsx`)
check("brand marks come one by one from the trimmed generated set, never react-icons/si itself", !/from\s+["']react-icons\/si["']/.test(allSrc) && /from "@\/components\/icons\/brand-icons\.generated"/.test(integ))
const generated = read("components/icons/brand-icons.generated.ts")
const used = [...allSrc.matchAll(/\b(Si[A-Z][A-Za-z0-9]+)\b/g)].map((m) => m[1])
check("every mark used is in the generated file", used.every((n) => generated.includes(`export function ${n}(`)), used.filter((n) => !generated.includes(`export function ${n}(`)))
/* Changed on purpose (wave 13): a tile is the app's icon alone, named for assistive tech, and its turn lands on the same icon (no text back). */
{
  const ih = html["integrations-section"] ?? ""
  check("each app is one named icon, copies are hidden from assistive tech", PLATFORM_INTEGRATION_APPS.every((a) => ih.includes(`role="img" aria-label="${a.name}"`)) && /aria-hidden="true" data-copy=""/.test(ih))
  check("no count, no hover hint, no subheading, no text on a tile", !/\d+ apps|hover or tap|Paste a key/i.test(text(ih)) && !/aria-pressed/.test(ih))
  check("the section is light", /bg-white/.test(ih) && !/bg-\[#0b0b0c\]/.test(ih))
  check("the turn lands where it started: edge on at the half, round from the other side", /rotateY\(90deg\)", offset: 0\.5/.test(integ) && /rotateY\(-90deg\)", offset: 0\.5/.test(integ) && /rotateY\(0deg\)" \},?\s*\]/.test(integ))
  check("the light follows the pointer by transform, one write per frame", /requestAnimationFrame\(paint\)/.test(integ) && /translate3d\(\$\{x\}px, \$\{y\}px, 0\)/.test(integ))
}

console.log("\n── truth: audience and emails ──")
const aud = text(html["audience-ownership"] ?? "")
for (const p of ["Klaviyo", "Omnisend", "Brevo", "MailerLite", "Kit"]) check(`syncs to ${p}, a platform the catalog syncs`, aud.includes(p) && byName.has(p) && !byName.get(p)?.comingSoon)
check("unsubscribes come back, as the catalog says", /Unsubscribes come back/.test(aud) && /Unsubscribes come back/.test(read("lib/integrations/catalog.ts")))
check("the composer has the real fields and buttons", ["To", "From", "Subject", "Send test", "Schedule", "Send"].every((w) => aud.includes(w)))
/* Added (wave 13): light, no subheading, a believable creator email, the five platforms in their own marks. */
{
  const audSrc = read(`${DIR}/audience-ownership.tsx`)
  check("audience: a light section (not black UI)", /className=\{`\$\{m\.root\} bg-white /.test(audSrc) && !/bg-black|#121214|\bdark\b \/>/.test(audSrc))
  check("audience: no subheading under the heading", /<StoryHeading id="audience-ownership-title"[^>]*\/>\s*<\/div>/.test(audSrc))
  check("audience: the ceramics example is gone", !/glaze|ceramic|Maya Lin/i.test(aud))
  check("audience: the sent email reports delivered, opened and clicked, as Emails does", ["Delivered", "Opened", "Clicked"].every((w) => aud.includes(w)) && /tt\("Opened"/.test(read("app/(storelib)/app/emails/emails-home.tsx")) && /tt\("Clicked"/.test(read("app/(storelib)/app/emails/emails-home.tsx")))
  const logos = read(`${DIR}/email-platform-logos.tsx`)
  check("audience: each platform is drawn in its own mark, not a word in a pill", ["KlaviyoLogo", "OmnisendLogo", "BrevoLogo", "MailerLiteLogo", "KitLogo"].every((n) => new RegExp(`export function ${n}\\(`).test(logos)) && /EMAIL_PLATFORMS\.map/.test(audSrc))
  check("audience: subscribers come in by doors Contacts names", ["OnePage", "Checkout", "Website", "Free download"].every((w) => audSrc.includes(`via: "${w}"`)) && /onepage: "OnePage"/.test(read("lib/contacts/contact-source.ts")))
}
check("contacts export as CSV, as Contacts does", /Export CSV/.test(aud) && /contacts\/export/.test(read("app/(storelib)/app/contacts/people-client.tsx")) && /text\/csv/.test(read("app/api/contacts/export/route.ts")))

console.log("\n── truth: analytics ──")
const ana = text(html["analytics-showcase"] ?? "")
const reports = read("app/(storelib)/app/analytics/analytics-reports.tsx")
/* Changed on purpose (wave 13): the owner asked for a simpler analytics section, so it shows three of the real cards (the Operating systems and OnePage links cards are left out, not renamed). */
for (const card of ["Traffic sources", "Countries", "Devices"]) check(`card "${card}" is a real Analytics card`, ana.includes(card) && reports.includes(`tt("${card}")`))
/* Added (wave 13): the four figures are the Analytics page's own four, in its words. */
{
  const words = read("lib/i18n/translations.ts")
  check("the four figures are the page's own: Visitors, Total Revenue, Total Orders, Conversion Rate", ["Visitors", "Total Revenue", "Total Orders", "Conversion Rate"].every((w) => ana.includes(w) && words.includes(`: "${w}"`)) && /CORE_TABS = \["views", "revenue", "orders", "conversion"\]/.test(read("app/(storelib)/app/analytics/analytics-client.tsx")))
}
for (const tab of ["Source", "Social", "Campaign", "Visitors", "Orders", "Device", "Browser"]) check(`tab "${tab}" is a real tab`, ana.includes(tab) && reports.includes(`tt("${tab}")`))
/* Changed on purpose (wave 13): simpler, so the line saying there is no age or gender report went; nothing claims one either. */
check("no invented age or gender chart", !/\b(Age|Ages|Gender|18-24|25-34|Female|Male)\b/i.test(ana))
check("no city report shown (Storelib has none)", !/Top cities|\bCities\b/.test(ana))
check("live is Home's live visitors", /live/.test(ana) && /dashboard\.liveVisitors/.test(read("components/app/dashboard-client.tsx")))
const spotBlock = read(`${DIR}/analytics-showcase.tsx`).split("const SPOT_COUNTRY")[1]?.split("\n]")[0] ?? ""
check("every globe spot names its country", PLATFORM_GLOBE_SPOTS.length === (spotBlock.match(/\["[A-Z]{2}", "[^"]+"\]/g) ?? []).length, PLATFORM_GLOBE_SPOTS.length)
const bits = Buffer.from(PLATFORM_LAND_B64, "base64")
let land = 0
for (const b of bits) for (let k = 0; k < 8; k++) land += (b >> k) & 1
check("the land bitmap is 180 x 90 bits", bits.length === Math.ceil((PLATFORM_LAND_W * PLATFORM_LAND_H) / 8))
check("about 30% of the cells are land", land / (PLATFORM_LAND_W * PLATFORM_LAND_H) > 0.22 && land / (PLATFORM_LAND_W * PLATFORM_LAND_H) < 0.4, land)

console.log("\n── truth: the app ──")
const app = html["app-anywhere"] ?? ""
check("App Store link follows the footer's env (none set here)", PLATFORM_APP_STORE_HREF === null && /NEXT_PUBLIC_IOS_APP_STORE_ID/.test(read(`${DIR}/app-anywhere.tsx`)) && /NEXT_PUBLIC_IOS_APP_STORE_URL/.test(read(`${DIR}/app-anywhere.tsx`)))
check("the App Store badge is there", /Download on the/.test(app) && /App Store/.test(app))
check("Google Play says Coming soon and is not a link", /Google Play/.test(app) && /Coming soon/.test(app) && !/play\.google\.com/.test(app) && !/<a [^>]*>[^]*?Google Play[^]*?<\/a>/.test(app.replace(/<a [^>]*App Store[\s\S]*?<\/a>/, "")))
/* Changed on purpose (wave 13): no drawn screen any more (the owner's photo is the visual); the points are titles only, with no check marks; Google Play is not faded. */
check("the three points are titles only, with no check marks", ["A ping for every sale", "Orders, products and numbers", "Your community, in your pocket"].every((w) => text(app).includes(w)) && !/M3\.5 8\.5 6\.5 11\.5 12\.5 4\.5/.test(app) && !/A notification the moment/.test(app))
check("the Google Play badge is drawn at full strength", !/opacity-40|grayscale/.test(read(`${DIR}/app-anywhere.tsx`)))

console.log("\n── motion ──")
const cssFiles = readdirSync(join(root, DIR)).filter((f) => f.endsWith(".module.css"))
/* Changed on purpose (wave 13): section 3 draws its stylesheet as a React <style href precedence> (EVERYTHING_STYLES, preloaded by lazy-sections), not a CSS module; it is held to the same rules below. */
check("each section has its own CSS module, plus the shared one", ["platform", ...SECTIONS.filter((s) => s.file !== "everything-in-one-place").map((s) => s.file)].every((f) => cssFiles.includes(`${f}.module.css`)), cssFiles)
{
  const ev = read(`${DIR}/everything-in-one-place.tsx`)
  const css = ev.split("const CSS = `")[1]?.split("\n`")[0] ?? ""
  const frames = [...css.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?\})\s*\}/g)].map((m) => m[1])
  const props = frames.flatMap((body) => [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]))
  check("everything-in-one-place: keyframes animate only transform and opacity (and time their own steps)", frames.length >= 6 && props.every((p) => p === "transform" || p === "opacity" || p === "animation-timing-function"), [...new Set(props)])
  check("everything-in-one-place: every loop pauses while the section is not live", /\.ev\[data-platform-live="false"\] \.ev-loop,\.ev:not\(\[data-platform-live\]\) \.ev-loop\{animation-play-state:paused\}/.test(css))
  check("everything-in-one-place: has a reduced-motion path that stops every loop", /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.ev-loop,[^{]*\{animation:none !important\}/.test(css))
  check("everything-in-one-place: no :has() and no selector ending in *", !/:has\(/.test(css) && !/\*\s*\{/.test(css))
}
for (const f of cssFiles) {
  const css = read(`${DIR}/${f}`)
  const frames = [...css.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1])
  const props = frames.flatMap((body) => [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]))
  check(`${f}: keyframes animate only transform and opacity`, props.every((p) => p === "transform" || p === "opacity"), [...new Set(props)])
  if (frames.length || /transition/.test(css)) check(`${f}: has a reduced-motion path`, /prefers-reduced-motion:\s*reduce/.test(css))
}
const shared = read(`${DIR}/platform.module.css`)
check("loops pause off screen, pseudo-elements too", /\[data-platform-live="false"\] \.loop,/.test(shared) && /\[data-platform-live="false"\] \.loop::after/.test(shared))
check("loops stop under reduced motion", /prefers-reduced-motion: reduce\)[\s\S]*\.loop,[\s\S]*animation: none !important/.test(shared))
check("content is visible without JavaScript", /@media \(scripting: none\)/.test(shared))
const motion = read(`${DIR}/platform-motion.tsx`)
check("count-ups change a text node's data, never insert one", /node\.data = next/.test(motion) && !/textContent = formatRef\.current\(n\)/.test(motion))
check("the composer types with a CSS cover, not per-letter DOM writes", !/textContent/.test(read(`${DIR}/audience-ownership.tsx`)) && /steps\(var\(--steps/.test(read(`${DIR}/audience-ownership.module.css`)))
check("subscriber rows and visitor toasts are fixed slots, never inserted", /key=\{k\}/.test(read(`${DIR}/audience-ownership.tsx`)) && /slots\.map/.test(read(`${DIR}/analytics-showcase.tsx`)))
const globe = read(`${DIR}/platform-globe.tsx`)
check("the globe runs only while on screen, and draws once under reduced motion", /if \(!running \|\| !inView\) return/.test(globe) && /if \(reduced\)/.test(globe) && /cancelAnimationFrame/.test(globe))
check("the globe caps device pixels", /Math\.min\(1\.5, window\.devicePixelRatio/.test(globe))
/* Added on purpose (home page scroll pass 2): the globe is drawn in a worker, from a string the script builds. */
check("the globe is drawn off the page's thread where the browser can hand it a canvas", /transferControlToOffscreen\(\)/.test(globe) && /new Worker\(url\)/.test(globe) && /GLOBE_WORKER_SOURCE/.test(globe))
const globeWorker = await import(pathToFileURL(join(process.cwd(), "scripts/build-globe-worker.mjs")).href)
check("the worker's string is up to date (node scripts/build-globe-worker.mjs)", read(`${DIR}/platform-globe-worker-source.ts`) === globeWorker.globeWorkerModule(await globeWorker.globeWorkerSource()))
check("no scroll listeners in the track's code", !/addEventListener\(\s*["']scroll/.test(strip(allSrc + motion)))
/* Changed on purpose (wave 13): no back face any more; the turn is a Web Animation that exists only while it runs. */
check("integration tiles have no 3D layer at rest", !/perspective|rotateY|preserve-3d/.test(read(`${DIR}/integrations-section.module.css`)) && /inner\.animate\(FLIP/.test(integ))
check("no new dependency", !/three|lottie|framer-motion|gsap/.test(strip(allSrc)))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
