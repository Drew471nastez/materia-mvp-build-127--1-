/**
 * Round 58 (f4): the integrations area as an app store, in Storelib's own UI.
 *
 *   the listing    every integration's page before it is installed: a column
 *                  with the mark, name, pricing, category, developer and the
 *                  one action, beside a gallery, what it does, in Storelib,
 *                  requirements and your data; no key field on it
 *   the media      a video only from VERIFIED_VIDEOS (none yet: nothing could
 *                  be checked against youtube.com from the round's session),
 *                  played from a youtube-nocookie frame only once its own
 *                  poster is pressed; otherwise Storelib's own drawn scenes
 *   the sheet      Install opens numbered steps over the integration's own
 *                  panel (a bottom sheet on a phone, a dialog that leaves the
 *                  way it came on a computer); Discord goes straight to its
 *                  own sign in; the key travels exactly as before
 *   installed      one template: Status, What is synced, Activity and errors
 *                  (only what the API returns), Settings, Disconnect; Storelib
 *                  Reviews' Settings tab carries the same column
 *
 * scripts/check-apps-r58.mjs measures the pages in Chromium at 360, 390, 768
 * and 1280 (CLS, no key on the page, the sheet's motion, no YouTube request).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { INTEGRATIONS, integrationById } from "@/lib/integrations/catalog"
import { installVerb } from "@/lib/integrations/detail-actions"
import { OAUTH_START, SCREENSHOTS, VERIFIED_VIDEOS, YOUTUBE_ID, activityOf, descriptionOf, factsOf, installLabel, installMode, installSteps, mediaFor, pricingOf, requirementsOf, sceneFor, syncedOf, youtubeEmbedUrl } from "@/lib/integrations/listing"
import { AppListing } from "@/components/app/integrations/app-listing"
import { AppMediaGallery } from "@/components/app/integrations/app-media"
import { ActivityCard, SyncedCard } from "@/components/app/integrations/installed-app"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const notifyOnly = (id: string) => {
  const i = integrationById(id)!
  return i.kind === "listed" || (i.kind === "commerce" && !!i.comingSoon)
}
const AI = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform)\b/i

console.log("\nEvery integration has a listing\n")
{
  const rows = INTEGRATIONS.map((i) => ({ id: i.id, facts: factsOf(i), mode: installMode(i, notifyOnly(i.id)), steps: installSteps(i), d: descriptionOf(i), needs: requirementsOf(i), media: mediaFor(i) }))
  check("all of them: pricing, category and developer in the column", rows.length === INTEGRATIONS.length && rows.length >= 40 && rows.every((r) => r.facts.map((f) => f.label).join() === "Pricing,Category,Developer" && r.facts.every((f) => !!f.value)), rows.length)
  check("  a headline and a paragraph for each", rows.every((r) => r.d.lead.length > 20))
  check("  pricing is a word, never a figure", INTEGRATIONS.every((i) => !/[0-9$€£%]/.test(`${pricingOf(i).line} ${pricingOf(i).note ?? ""}`)), INTEGRATIONS.map((i) => pricingOf(i)).filter((p) => /[0-9$€£%]/.test(p.line + (p.note ?? ""))))
  check("  third party: Free to install, with the provider's own pricing noted; Storelib's own: Included", pricingOf(integrationById("printful")!).line === "Free to install" && /Printful charges/.test(pricingOf(integrationById("printful")!).note ?? "") && pricingOf(integrationById("storelib-reviews")!).line === "Included with Storelib" && pricingOf(integrationById("sendcloud")!).line === "Not available yet")
  check("  developer: Storelib built the connection, the service is named", factsOf(integrationById("printful")!)[2].value === "Storelib" && factsOf(integrationById("printful")!)[2].note === "Connects to Printful" && factsOf(integrationById("storelib-reviews")!)[2].note === "Made by Storelib")
  check("  requirements: the account, the key, products that ship", JSON.stringify(requirementsOf(integrationById("printful")!)) === JSON.stringify(["A Printful account", "A private token", "Products that ship turned on for your store"]) && requirementsOf(integrationById("storelib-reviews")!).includes("Nothing to connect"))
  check("every one that installs has a way to: one press, its own sign in, the sheet, or Tell me", INTEGRATIONS.filter((i) => installVerb(i)).every((i) => installMode(i, notifyOnly(i.id)).kind !== "none"))
  check("  Coming soon is Tell me when it's ready", INTEGRATIONS.filter((i) => notifyOnly(i.id)).every((i) => installMode(i, true).kind === "notify" && installLabel(i, installMode(i, true)) === "Tell me when it's ready"))
  check("  Storelib Reviews turns on in one press", installMode(integrationById("storelib-reviews")!, false).kind === "one_tap")
  const discord = installMode(integrationById("discord")!, false)
  check("  Discord, the OAuth one, goes straight to its own sign in, a route that exists", discord.kind === "oauth" && discord.href === "/api/community-roles/discord/connect" && /export async function GET/.test(read("app/api/community-roles/discord/connect/route.ts")) && Object.keys(OAUTH_START).length === 1)
  const sheets = INTEGRATIONS.filter((i) => installMode(i, notifyOnly(i.id)).kind === "sheet" && installVerb(i))
  check("the sheet's steps: two to four, short, numbered in the UI, the last one says where to paste", sheets.every((i) => installSteps(i).length >= 2 && installSteps(i).length <= 4), sheets.filter((i) => !(installSteps(i).length >= 2 && installSteps(i).length <= 4)).map((i) => i.id))
  check("  Printful's as the owner put it: open it, make a token, paste it here", JSON.stringify(installSteps(integrationById("printful")!)) === JSON.stringify(["Open Printful, Developer portal, Your tokens.", "Create a token with the orders, sync products and webhooks scopes.", "Paste it here. Storelib checks it with Printful."]))
  check("  never 'below' in a sheet: the field is right under the steps", sheets.every((i) => installSteps(i).every((s) => !/\bbelow\b/.test(s))), sheets.flatMap((i) => installSteps(i).filter((s) => /\bbelow\b/.test(s))))
  const copy = JSON.stringify([...rows.flatMap((r) => [...r.steps, ...r.needs, ...r.facts.map((f) => `${f.value} ${f.note ?? ""}`)]), read("lib/integrations/listing.ts"), read("components/app/integrations/app-media.tsx"), read("components/app/integrations/app-listing.tsx"), read("components/app/integrations/install-sheet.tsx"), read("components/app/integrations/installed-app.tsx")])
  /* The words a store reads: every tt("...") in the new files, and every step, requirement and fact (not the CSS, where transform is a property). */
  const words = JSON.stringify([...rows.flatMap((r) => [...r.steps, ...r.needs, ...r.facts.map((f) => `${f.value} ${f.note ?? ""}`)]), ...[...copy.matchAll(/tt\(\\"([^"\\]+)/g)].map((m) => m[1])])
  check("plain words: no em or en dash, nothing that sounds like an ad", !/[—–]/.test(copy) && !AI.test(words), (words.match(AI) ?? [])[0])
}

console.log("\nMedia: a checked video or nothing from YouTube\n")
{
  check("every verified video is a well formed ID with its channel and the day it was checked", Object.values(VERIFIED_VIDEOS).every((v) => !!v && YOUTUBE_ID.test(v.youtubeId) && v.channel.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(v.checked)))
  /* Changed on purpose (r60): YouTube was reachable in round 60 and every video was checked with oEmbed against the provider's own channel (lib/integrations/videos.ts, tests/apps-media-r60.test.ts). */
  check("  none is guessed: each one names the channel it was checked on and the day", Object.values(VERIFIED_VIDEOS).every((v) => !!v && v.channelUrl.startsWith("https://www.youtube.com/@")))
  check("  no screenshot without its source; none shipped this round", Object.values(SCREENSHOTS).every((list) => (list ?? []).every((s) => s.src.startsWith("/") && s.source.length > 0)) && Object.keys(SCREENSHOTS).length === 0)
  check("the embed is youtube-nocookie, only for an 11 character ID", youtubeEmbedUrl("abcdefghijk")!.startsWith("https://www.youtube-nocookie.com/embed/abcdefghijk?") && youtubeEmbedUrl("abc") === null && youtubeEmbedUrl("abcdefghij\"") === null && youtubeEmbedUrl("../../x?a=1") === null)
  check("every integration draws a scene of what it does in Storelib", INTEGRATIONS.every((i) => !!sceneFor(i)) && sceneFor(integrationById("printful")!) === "orders" && sceneFor(integrationById("shippo")!) === "labels" && sceneFor(integrationById("shipstation")!) === "shipments" && sceneFor(integrationById("klaviyo")!) === "subscribers" && sceneFor(integrationById("sendcloud")!) === "soon")
  const item = integrationById("printful")!
  const withVideo = renderToStaticMarkup(React.createElement(AppMediaGallery, { item, media: { video: { youtubeId: "abcdefghijk", title: "A video", channel: "Printful", channelUrl: "https://www.youtube.com/@PrintfulCustomPrinting", checked: "2026-11-23" }, more: [], screenshots: [], scene: "orders" }, color: "#2c2c2c" }))
  /* Changed on purpose (r60): the poster is the video's own YouTube thumbnail, from i.ytimg.com, as the owner asked; still no frame and no youtube.com address until pressed. */
  check("  a video draws its poster: no frame and no youtube.com address until pressed; its thumbnail from i.ytimg.com", /data-app-video-poster=""/.test(withVideo) && !/<iframe/.test(withVideo) && !/youtube(-nocookie)?\.com/.test(withVideo) && /https:\/\/i\.ytimg\.com\/vi\/abcdefghijk\/maxresdefault\.jpg/.test(withVideo))
  /* Changed on purpose (r60): Printful has checked videos now; Telegram, with none, is the one drawn. */
  const scenes = renderToStaticMarkup(React.createElement(AppMediaGallery, { item: integrationById("telegram")!, media: mediaFor(integrationById("telegram")!), color: "#2c2c2c" }))
  check("  without one, three drawn frames, each in a box with its own aspect ratio (no shift)", (scenes.match(/data-app-scene=""/g) ?? []).length >= 3 && /aspect-\[16\/10\]/.test(scenes) && !/<img[^>]+(press|screenshot)/.test(scenes))
}

console.log("\nThe listing: no key on the page\n")
{
  const item = integrationById("printful")!
  const html = renderToStaticMarkup(React.createElement(AppListing, { item, Title: "h1", standing: { label: "Not connected", dot: "bg-[#9ca3af]" }, color: "#2c2c2c", action: React.createElement("button", { "data-app-install": "sheet" }, "Connect") }))
  check("the column: the mark, the name as the page's title, where it stands, the action, the facts, the help link", /<h1[^>]*>Printful<\/h1>/.test(html) && /data-app-install="sheet"/.test(html) && /data-app-facts=""/.test(html) && />Free to install</.test(html) && />Print on demand</.test(html) && />Storelib</.test(html) && /Printful help/.test(html))
  check("the rest: gallery, what it does, In Storelib, Requirements, Your data", /data-app-gallery=""/.test(html) && /data-integration-about=""/.test(html) && />In Storelib</.test(html) && />Requirements</.test(html) && /data-integration-data=""/.test(html))
  check("  no input of any kind on the listing", !/<input|<textarea|<select/.test(html))
  const detail = read("components/app/settings/integration-detail.tsx")
  check("the page is the listing until installed, unless the app has its own tabs (Reviews)", /const listing = !installed && !view/.test(detail) && /\{listing \? \(\s*<AppListing/.test(detail))
  check("  Install opens the sheet; Discord's is a link to its own sign in; the following bar's press does the same", /if \(listing && mode\.kind === "sheet"\) \{\s*setInstalling\(true\)/.test(detail) && /if \(listing && mode\.kind === "oauth"\) \{\s*window\.location\.assign\(mode\.href\)/.test(detail) && /<a href=\{mode\.href\}[^>]*data-app-install="oauth"/.test(detail))
  check("  the sheet holds the provider's own fields, alone", /<IntegrationCard provider=\{providerInfo\(item\.providerId\)!\} state=\{providerState\} loading=\{states === null\} onSaved=\{onStates\} bare \/>/.test(detail) && /<InstallSheet open=\{installing\}/.test(detail))
}

console.log("\nThe key travels exactly as before\n")
{
  const card = read("components/physical/integrations-marketplace.tsx")
  check("bare is the same form: one form, drawn in the card or alone", (card.match(/const form = \(/g) ?? []).length === 1 && /if \(bare\) return connectable \? form : null/.test(card) && /\{open \? form : null\}/.test(card))
  check("  the same PUT, the same body, to the same route", /api<\{ integrations: IntegrationState\[\] \}>\(`\/api\/physical\/integrations\/\$\{provider\.id\}`, \{ method: "PUT", body \}\)/.test(card) && /save\(\{ url, webhookSecret: secret, apiKey: key, \.\.\.\(provider\.fields\.includes\("api_secret"\) \? \{ apiSecret \} : \{\}\) \}/.test(card))
  check("  a password field with no autocomplete, cleared after it is sent, never filled from the server", /<TextInput type="password" autoComplete="off" value=\{key\}/.test(card) && /setKey\(""\)/.test(card) && !/setKey\(state/.test(card))
  const route = read("app/api/physical/integrations/[provider]/route.ts")
  check("  the route still seals it and sends back only the hint (unchanged this round)", /seal|encrypt/i.test(route + read("lib/physical/integrations-server.ts")) && /keyHint/.test(read("lib/physical/integrations-server.ts")))
  const sheet = read("components/app/integrations/install-sheet.tsx")
  check("the sheet reads and keeps no key itself", !/apiKey|api_key|localStorage|sessionStorage/.test(sheet))
  check("  a phone gets the app's bottom sheet; a computer a dialog on opacity and transform only, none under reduced motion", /if \(phone\) \{\s*return \(\s*<Modal/.test(sheet) && /transition-\[opacity,transform\]/.test(sheet) && /motion-reduce:transition-none/.test(sheet) && !/transition-\[[^\]]*(height|width|top|margin)/.test(sheet))
  check("  it stays mounted for its way out, then gives focus back", /setMounted\(false\)\s*opener\.current\?\.focus/.test(sheet))
  check("  success once installed while open; a failure stays in the panel with the fields kept", /if \(open && installed && !wasInstalled\.current\) setDone\(true\)/.test(sheet) && /data-install-success=""/.test(sheet))
}

console.log("\nThe installed page: one template\n")
{
  const printful = integrationById("printful")!
  const facts = { verifiedAt: "2026-11-20T08:00:00Z", lastSyncAt: "2026-11-22T09:12:00Z", lastError: null, ordersSent: 14, labelsBought: 0, webhooks: "on" as const }
  const act = activityOf(printful, facts)
  check("activity is only what the API returned", act.map((r) => r.text).join("|") === "Last talked to Printful|14 orders sent to Printful|Printful sends updates to Storelib as they happen|Key checked with Printful")
  check("  an error comes first, in red", activityOf(printful, { ...facts, lastError: "Printful said the token has expired." })[0].tone === "red")
  check("  nothing known, nothing listed", activityOf(printful, null).length === 0 && activityOf(printful, {}).length === 0)
  const empty = renderToStaticMarkup(React.createElement(ActivityCard, { rows: [] }))
  check("  an empty list says what will show there", /Nothing yet/.test(empty) && /data-installed-activity="0"/.test(empty))
  check("what is synced, for a print partner and for Klaviyo", syncedOf(printful).length === 2 && syncedOf(integrationById("klaviyo")!).some((r) => r.startsWith("Sends: ")) && syncedOf(integrationById("storelib-reviews")!).some((r) => r.startsWith("Emails: ")))
  check("  drawn as a label and a value", /What is synced/.test(renderToStaticMarkup(React.createElement(SyncedCard, { rows: ["Sends: Subscribers"] }))))
  const detail = read("components/app/settings/integration-detail.tsx")
  check("every installed integration without tabs uses InstalledApp: Status, synced, activity, Settings, Disconnect", /<InstalledApp status=\{statusSection\} synced=\{synced\} activity=\{factsRead \? <ActivityCard rows=\{activityOf\(item, factsRead\)\} \/> : null\} settings=\{setup\} danger=\{danger\} \/>/.test(detail))
  const reviews = read("components/reviews/manage/integration-view.tsx")
  check("Storelib Reviews' Settings tab carries the same column: What is synced over At a glance", /\{sections\.synced\}\s*\{sections\.glance\}/.test(reviews) && /synced\?: React\.ReactNode \| null/.test(read("components/app/settings/integration-apps.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
