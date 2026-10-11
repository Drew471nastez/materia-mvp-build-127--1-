/**
 * Round T: Settings › Integrations as a directory, analytics and ad pixels
 * that really load on a store's website, and every integration with its own
 * mark and page.
 *
 *   npx tsx tests/integrations-t.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { TRACKERS, TRACKER_HOSTS, TRACKER_ORDER, readTracking, tidyId, trackingTags } from "@/lib/store/tracking"
import { INTEGRATIONS, integrationById, searchIntegrations, visibleIntegrations } from "@/lib/integrations/catalog"
import { CONTENT_SECURITY_POLICY } from "@/lib/security/csp"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nAn ID, never code\n")
{
  check("each service's own format, tidied: spaces gone, upper case", tidyId("ga4", " g-1a2b3c4d5e ") === "G-1A2B3C4D5E" && tidyId("meta_pixel", "1234 5678 9012 3456") === "1234567890123456")
  check("  an empty field removes it", tidyId("ga4", "") === null && tidyId("ga4", "   ") === null && tidyId("gtm", null) === null)
  check("  anything else is refused", tidyId("ga4", "UA-12345-1") === "bad" && tidyId("meta_pixel", "12ab") === "bad" && tidyId("gtm", "GTM-ABC');alert(1)//") === "bad" && tidyId("tiktok_pixel", 42) === "bad")
  check("every example the form shows is a valid ID", TRACKER_ORDER.every((id) => tidyId(id, TRACKERS[id].example) === TRACKERS[id].example))
  check("what is stored is read back only when it is the right shape", JSON.stringify(readTracking({ ga4: "G-ABCD1234", meta_pixel: "<script>", gtm: 5, extra: "x" })) === JSON.stringify({ ga4: "G-ABCD1234" }))
  const tags = trackingTags({ ga4: "G-ABCD1234", google_ads: "AW-123456789", gtm: "GTM-AB12CD", meta_pixel: "1234567890123456", tiktok_pixel: "C4A1B2C3D4E5F6G7H8I9", pinterest_tag: "2612345678901" })
  const text = JSON.stringify(tags)
  check("the tags are the services' own: one gtag for Analytics and Ads, Tag Manager, Meta, TikTok, Pinterest", tags.map((t) => t.key).join() === "gtag-src,gtag,gtm,meta,tiktok,pinterest" && /gtag\/js\?id=G-ABCD1234/.test(text))
  check("  each ID goes in as a JSON string, never spliced as code", /gtag\('config',\\"G-ABCD1234\\"\)/.test(text) && /fbq\('init',\\"1234567890123456\\"\)/.test(text))
  check("  a bad ID that somehow got stored is skipped on the page", trackingTags({ meta_pixel: "1');alert(1);//" }).length === 0 && trackingTags(null).length === 0)
}

console.log("\nOn the website, and only there\n")
{
  const comp = read("components/website-builder/store-tracking.tsx")
  check("the tags load after the page is interactive, each with its own id", /strategy="afterInteractive"/.test(comp) && /id=\{`storelib-\$\{t\.key\}`\}/.test(comp))
  const pages = ["app/(site)/w/[username]/render-site.tsx", "app/(site)/w/[username]/search/page.tsx", "app/(site)/w/[username]/products/page.tsx", "app/(site)/w/[username]/products/[slug]/page.tsx", "app/(site)/w/[username]/collections/page.tsx", "app/(site)/w/[username]/collections/[handle]/page.tsx", "app/(site)/w/[username]/cart/page.tsx", "app/(site)/w/[username]/render-account.tsx"]
  const missing = pages.filter((p) => !/<StoreTracking creatorId=\{/.test(read(p)))
  check("every published page of the website carries them", missing.length === 0, missing)
  const render = read("app/(site)/w/[username]/render-site.tsx")
  const preview = render.slice(render.indexOf("async function previewPage"), render.indexOf("export async function coverPage"))
  check("  never a preview, so the store's own testing isn't counted", !/StoreTracking/.test(preview))
  const server = read("lib/store/tracking-server.ts")
  check("read through a short cache, cleared on save", /unstable_cache\(/.test(server) && /revalidate: 300, tags: \[trackingTag\(creatorId\)\]/.test(server) && /revalidateTag\(trackingTag\(creatorId\)/.test(server))
  check("every host a tag uses is in the content security policy, and vercel.json carries the same policy", TRACKER_HOSTS.every((h) => CONTENT_SECURITY_POLICY.includes(h)) && read("vercel.json").includes(CONTENT_SECURITY_POLICY))
}

console.log("\nThe directory\n")
{
  check("every integration with a mark has its file in public/", INTEGRATIONS.filter((i) => i.logo).every((i) => existsSync(join(process.cwd(), "public", i.logo!))), INTEGRATIONS.filter((i) => i.logo && !existsSync(join(process.cwd(), "public", i.logo))).map((i) => i.logo))
  check("  the analytics, ad and shipping services all have one", ["google-analytics", "google-tag-manager", "google-ads", "meta-pixel", "tiktok-pixel", "pinterest-tag", "printful", "printify", "gelato", "shippo", "easypost", "shipstation", "cj-dropshipping"].every((id) => !!integrationById(id)?.logo))
  check("analytics and pixels for every store; the commerce ones only with physical products on", visibleIntegrations(false).every((i) => !i.physical) && visibleIntegrations(false).some((i) => i.id === "meta-pixel") && visibleIntegrations(true).length === INTEGRATIONS.length)
  check("built in means it works with nothing to connect; a key we can't use yet says so", INTEGRATIONS.filter((i) => i.builtIn).every((i) => !i.comingSoon) && integrationById("printful")?.comingSoon === true)
  check("every page has About, At a glance and Data ownership", INTEGRATIONS.every((i) => i.about.length > 0 && i.glance.length >= 3 && i.data.length > 0))
  check("search reads names, lines and categories", searchIntegrations(INTEGRATIONS, "pixel").some((i) => i.id === "meta-pixel") && searchIntegrations(INTEGRATIONS, "print on demand").some((i) => i.id === "printful") && searchIntegrations(INTEGRATIONS, "zzz").length === 0)
  const ui = read("components/app/settings/integrations-directory.tsx")
  check("a search, Request integration, pills with counts and Installed", /data-integrations-search=""/.test(ui) && /data-request-integration=""/.test(ui) && /\["all", "installed", \.\.\.CATEGORY_ORDER/.test(ui) && /counts\.get\(f\)/.test(ui))
  check("a card opens its page, kept in the address, with Back to integrations", /writeIntegrationParam\(id\)/.test(ui) && /Back to integrations/.test(ui) && />About</.test(ui) && />At a glance</.test(ui) && />Data ownership</.test(ui) && /"Set up"/.test(ui) /* round R1: the setup card is "Set up", "Settings" once connected, or "Get notified" */)
  const req = read("app/api/store/integrations/request/route.ts")
  check("a request is the owner's, five a day at most", /shopCaller\(\)/.test(req) && /\(count \?\? 0\) >= 5/.test(req))
  const sql = read("supabase/sql/run-now/112_integrations.sql")
  check("part 112: tracking on store_settings, small; requests owner read", /ADD COLUMN IF NOT EXISTS tracking jsonb/.test(sql) && /pg_column_size\(tracking\) < 2048/.test(sql) && /integration_requests_owner_read/.test(sql))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
