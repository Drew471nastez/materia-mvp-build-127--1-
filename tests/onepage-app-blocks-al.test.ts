/**
 * Round AL: the Add block sheet, Linktree's way, and the app blocks.
 *
 *   PICKER      one per row, round tiles in each entry's own colour, a
 *               company's own mark, Essentials, Commerce, Social, Media,
 *               Contact, Events, Text and View all, search and Recently
 *               used kept, one entry for one thing
 *   ENGINE      every service without a block of its own is one block type,
 *               "app", read by one provider registry: each address parsed,
 *               only official embeds, the layouts that fit, a tap that goes
 *               to the address or opens the block sheet, each tap counted
 *   OLD BLOCKS  every saved type still draws and edits: nothing migrated
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ESSENTIAL_ENTRY_IDS, PICKER_CATEGORIES, PICKER_ENTRIES, searchEntries } from "@/components/onepage/add-block-picker"
import { ExtraBlock, extraBlockRow } from "@/components/onepage/extra-blocks"
import {
  APP_FRAME_HOSTS,
  APP_PROVIDERS,
  APP_PROVIDER_IDS,
  appBlockDefaults,
  appBlockHasContent,
  appEmbeds,
  appLayoutOf,
  appOpenModeOf,
  appStores,
  appTarget,
  appUrlProblem,
  contactVCard,
  parseAppUrl,
  upcomingEvents,
  type AppBlockData,
} from "@/lib/onepage/app-blocks"
import { isBlockShown, isExtraBlock } from "@/lib/onepage/extra-blocks"
import { canGoInGroup } from "@/lib/onepage/group"
import { createDefaultBlock, defaultTheme, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"
import { CONTENT_SECURITY_POLICY } from "@/lib/security/csp"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const app = (data: Partial<AppBlockData> & { provider: AppBlockData["provider"] }): OnePageBlock => ({ id: "blk_1", type: "app", enabled: true, sort_order: 0, data: { ...appBlockDefaults(data.provider), ...data } as OnePageBlock["data"] })
const draw = (block: OnePageBlock) => renderToStaticMarkup(React.createElement(ExtraBlock, { block, look: { theme: defaultTheme as never, scale: "live", onepageId: null } }))

function main() {
  section("The picker: Linktree's categories, one per row, coloured tiles")
  {
    check("Essentials, Commerce, Social, Media, Contact, Events, Text", PICKER_CATEGORIES.map((c) => c.id).join(",") === "essentials,commerce,social,media,contact,events,text")
    const picker = read("components/onepage/add-block-picker.tsx")
    check("View all is the last chip, and the sheet opens on Essentials", /\{ id: "all" as const, label: tt\("View all"\) \}\]/.test(picker) && /const FIRST_VIEW: PickerView = "essentials"/.test(picker))
    check("one per row: no two column grid in the list", !/grid-cols-2/.test(code(picker)) && /data-picker-rows=""/.test(picker))
    check("each row: the round tile, the name, one line and a chevron", /<EntryIcon entry=\{entry\} \/>/.test(picker) && /<ChevronRight aria-hidden/.test(picker) && /<RoundTile color=\{fill\} ink=\{ink\}/.test(picker))
    check("no row is the grey tile any more", !/<BlockTile/.test(code(picker)))
    check("Recently used is kept", /title=\{tt\("Recently used"\)\}/.test(picker) && /localStorage\.getItem\(RECENT_KEY\)/.test(picker))
    check("every entry has a line and an icon or a mark", PICKER_ENTRIES.every((e) => e.description.trim().length > 0 && (e.icon || e.brand || e.brandIcon || e.mark)))
    check("ids are unique, for the recent list", new Set(PICKER_ENTRIES.map((e) => e.id)).size === PICKER_ENTRIES.length)
    check("every essential is a listed entry", ESSENTIAL_ENTRY_IDS.every((id) => PICKER_ENTRIES.some((e) => e.id === id && !e.hidden)))
    const listed = PICKER_ENTRIES.filter((e) => !e.hidden)
    const names = listed.map((e) => e.label.toLowerCase())
    check("one entry for one thing: no two listed rows share a name", new Set(names).size === names.length, names.filter((n, i) => names.indexOf(n) !== i))
    check("Digital products is listed; the single product and All products are search only", listed.some((e) => e.label === "Digital products" && e.type === "storelib_shelf") && PICKER_ENTRIES.find((e) => e.id === "product")?.hidden === true && PICKER_ENTRIES.find((e) => e.id === "shelf")?.hidden === true)
    check("search still finds the single product, Etsy and Mailchimp", searchEntries(PICKER_ENTRIES, "single product")[0]?.id === "product" && searchEntries(PICKER_ENTRIES, "etsy")[0]?.id === "etsy" && searchEntries(PICKER_ENTRIES, "mailchimp")[0]?.id === "int_mailchimp")
    check("a listed entry comes before a search only one of the same name", searchEntries(PICKER_ENTRIES, "instagram")[0]?.id === "app_instagram" && searchEntries(PICKER_ENTRIES, "typeform")[0]?.id === "app_typeform")
    check("services with a block add that block", ["int_youtube:video", "int_spotify:music", "int_booking:calendly", "map:map", "faq:faq", "image:image", "pdf_document:pdf_document", "email_capture:email_capture", "form_quiz:form_quiz", "coaching:calendly", "shelf_course:storelib_shelf", "referral:promo_code"].every((p) => { const [id, type] = p.split(":"); return PICKER_ENTRIES.find((e) => e.id === id)?.type === type }))
    check("Google Maps wears its own four colour pin", PICKER_ENTRIES.find((e) => e.id === "map")?.brand === "google-maps" && /data-mark="google-maps"/.test(read("components/onepage/brand-icons.tsx")))
    const owner = ["app_instagram", "app_tiktok", "app_x", "app_threads", "app_facebook", "app_snapchat", "app_pinterest", "app_twitch", "app_reddit", "app_rss", "app_cameo", "app_google_reviews", "app_audiomack", "app_podcasts", "app_typeform", "app_discord", "app_books", "app_mobile_app", "app_poll", "app_contact", "app_events", "app_stats", "app_note", "app_email", "app_tips", "app_affiliate", "app_whatsapp_group", "app_tiktok_video"]
    const missing = owner.filter((id) => !listed.some((e) => e.id === id))
    check("the owner's list of apps is in the sheet", missing.length === 0, missing)
    /* Changed on purpose (round AR): the owner, "get rid of Fourthwall, or Bonfire". Not in the sheet, not found by search; a saved one is drawn as a plain link. */
    check("Fourthwall and Bonfire are gone from the sheet and from search", !PICKER_ENTRIES.some((e) => e.id === "app_bonfire" || e.id === "app_fourthwall") && !searchEntries(PICKER_ENTRIES, "bonfire").some((e) => e.id.includes("bonfire")) && !searchEntries(PICKER_ENTRIES, "fourthwall").some((e) => e.id.includes("fourthwall")))
    check("every app entry adds an app block of its provider", listed.filter((e) => e.type === "app").every((e) => APP_PROVIDER_IDS.includes((e.data as { provider: never })?.provider)))
    check("a group takes the app blocks too", canGoInGroup("app"))
  }

  section("The engine: one registry, real addresses, official embeds")
  {
    check("every provider has a mark, a colour and its layouts", APP_PROVIDER_IDS.every((id) => { const p = APP_PROVIDERS[id]; return !!p.mark && !!p.color && p.layouts.length > 0 && p.layouts.includes(p.layout) }))
    check("only https: a javascript: or data: address is nothing", parseAppUrl("javascript:alert(1)") === null && parseAppUrl("data:text/html,x") === null && parseAppUrl("https://instagram.com/a")?.protocol === "https:")
    const ig = appTarget({ provider: "instagram", url: "https://www.instagram.com/p/C1abcDEF/" })
    check("an Instagram post plays in Instagram's own embed", ig?.embed?.src === "https://www.instagram.com/p/C1abcDEF/embed/" && ig.embed.embedKind === "instagram")
    check("an Instagram profile is a handle, no frame", appTarget({ provider: "instagram", url: "instagram.com/storelib" })?.handle === "@storelib" && !appTarget({ provider: "instagram", url: "instagram.com/storelib" })?.embed)
    const tk = appTarget({ provider: "tiktok", url: "https://www.tiktok.com/@maker/video/7301234567890123456" })
    check("a TikTok video plays in TikTok's own player, 9:16", !!tk?.embed?.src.startsWith("https://www.tiktok.com/player/v1/7301234567890123456") && tk.embed.aspect === "9 / 16" && tk.handle === "@maker")
    check("an X post, a Threads post, a pin, a Reddit post and an Audiomack song each have their embed", [
      appTarget({ provider: "x", url: "https://x.com/jack/status/20" })?.embed?.embedKind === "x",
      appTarget({ provider: "threads", url: "https://www.threads.net/@zuck/post/C8abcdEFG12" })?.embed?.src === "https://www.threads.net/@zuck/post/C8abcdEFG12/embed",
      appTarget({ provider: "pinterest", url: "https://www.pinterest.com/pin/123456789012/" })?.embed?.src === "https://assets.pinterest.com/ext/embed.html?id=123456789012",
      !!appTarget({ provider: "reddit", url: "https://www.reddit.com/r/design/comments/abc123/my_post/" })?.embed?.src.startsWith("https://embed.reddit.com/r/design/comments/abc123/"),
      appTarget({ provider: "audiomack", url: "https://audiomack.com/artist/song/my-song" })?.embed?.src === "https://audiomack.com/embed/song/artist/my-song",
    ].every(Boolean))
    check("a provider refuses another service's address", appUrlProblem({ provider: "instagram", url: "https://tiktok.com/@a" }) && appUrlProblem({ provider: "discord", url: "https://example.com" }) && !appUrlProblem({ provider: "discord", url: "" }))
    const csp = (String(CONTENT_SECURITY_POLICY).split(";").find((d) => d.trim().startsWith("frame-src")) ?? "").trim().split(/\s+/)
    check("every frame host the app blocks use is in frame-src", APP_FRAME_HOSTS.every((h) => csp.includes(h)), APP_FRAME_HOSTS.filter((h) => !csp.includes(h)))
    check("posts: the address first, then the extra ones, each once, never a profile", appEmbeds({ provider: "instagram", url: "https://instagram.com/me", posts: ["https://instagram.com/p/AAA111/", "https://instagram.com/p/AAA111/", "https://instagram.com/reel/BBB222/"] }).length === 2)
    check("a layout the provider does not offer falls back to its own", appLayoutOf({ provider: "poll", layout: "carousel" }) === "card" && appLayoutOf({ provider: "instagram", layout: "carousel" }) === "carousel")
    check("embeds open in a sheet by default, pages go direct, the creator's choice wins", appOpenModeOf({ provider: "audiomack" }) === "sheet" && appOpenModeOf({ provider: "discord" }) === "direct" && appOpenModeOf({ provider: "audiomack", open_mode: "direct" }) === "direct")
    check("app stores: only each store's own page", appStores({ provider: "mobile_app", ios_url: "https://apps.apple.com/app/id1", android_url: "https://example.com/x" }).android === null && !!appStores({ provider: "mobile_app", ios_url: "https://apps.apple.com/app/id1" }).ios)
    const card = contactVCard({ name: "Ana Pop", phone: "+40 712 345 678", email: "ana@example.com", org: "Studio; One" })
    check("contact details are a vCard a phone saves", /^BEGIN:VCARD\r\nVERSION:3\.0\r\nFN:Ana Pop\r\nN:Pop;Ana;;;/.test(card) && card.includes("TEL;TYPE=CELL:+40712345678") && card.includes("ORG:Studio\\; One") && card.endsWith("END:VCARD\r\n"))
    check("past events leave the page, the rest in date order", upcomingEvents([{ id: "a", title: "A", date: "2026-12-01" }, { id: "b", title: "B", date: "2020-01-01" }, { id: "c", title: "C", date: "2026-11-20" }], "2026-11-07").map((e) => e.id).join() === "c,a")
    check("an empty app block is left out; a filled one is shown", !appBlockHasContent(app({ provider: "instagram" })) && appBlockHasContent(app({ provider: "instagram", url: "instagram.com/me" })) && !isBlockShown(app({ provider: "poll", poll_question: "Q?" })) && isBlockShown(app({ provider: "poll", poll_question: "Q?", poll_options: [{ id: "a", label: "Yes" }, { id: "b", label: "No" }] })))
    check("app is an extra block, so the page and the editor dispatch it", isExtraBlock({ type: "app" }) && createDefaultBlock("app").type === "app")
  }

  section("Drawn on the page")
  {
    const profile = draw(app({ provider: "instagram", url: "instagram.com/storelib", layout: "profile" }))
    check("a profile: the mark, the handle, the button", /data-app-layout="profile"/.test(profile) && profile.includes("@storelib") && /data-app-cta=""/.test(profile) && /href="https:\/\/instagram\.com\/storelib"/.test(profile))
    const classic = draw(app({ provider: "discord", url: "https://discord.gg/abc", layout: "classic" }))
    check("classic is the page's own button", /data-app-layout="classic"/.test(classic) && /class="op-btn/.test(classic))
    const single = draw(app({ provider: "audiomack", url: "https://audiomack.com/a/song/b", layout: "single" }))
    check("single draws the player itself, lazily", /data-app-layout="single"/.test(single) && /loading="lazy"/.test(single) && single.includes("https://audiomack.com/embed/song/a/b"))
    const grid = draw(app({ provider: "affiliate", items: [{ id: "x", title: "Lamp", url: "https://shop.example/lamp", note: "$40" }, { id: "y", title: "Desk" }] }))
    check("a list as a grid, two across", /data-app-layout="grid"/.test(grid) && /grid grid-cols-2/.test(grid) && grid.includes("Lamp") && grid.includes("Desk"))
    const poll = draw(app({ provider: "poll", poll_question: "Next video?", poll_options: [{ id: "a", label: "Tour" }, { id: "b", label: "Q and A" }] }))
    check("a poll is a radio group of its answers", /role="radiogroup"/.test(poll) && (poll.match(/data-poll-option=/g) ?? []).length === 2)
    const maps = draw(app({ provider: "google_reviews", url: "https://maps.app.goo.gl/abc", rating: 4.8, reviews_count: 120 }))
    check("Google reviews: the score, the stars and the count", /data-app-rating="4\.8"/.test(maps) && maps.includes("(120)") && /data-mark="google"/.test(maps))
    const stats = draw(app({ provider: "stats", items: [{ id: "a", value: "12k", title: "Students" }] }))
    check("stats: the number and its label", stats.includes("12k") && stats.includes("Students"))
    const rows = APP_PROVIDER_IDS.map((id) => extraBlockRow(app({ provider: id })))
    check("every provider has a row in the editor's list", rows.every((r) => !!r.title && !!r.icon))
    const all = APP_PROVIDER_IDS.map((id) => { try { draw(app({ provider: id })); return null } catch (e) { return `${id}: ${(e as Error).message}` } }).filter(Boolean)
    check("every provider draws, empty, without throwing", all.length === 0, all)
  }

  section("Old blocks, the sheet contract, and the words")
  {
    const types: OnePageBlockType[] = ["product", "storelib_shelf", "embed", "social_posts", "link_button", "lead_magnet", "promo_code", "followers", "video", "music", "calendly"]
    check("every older type still has its default block", types.every((t) => createDefaultBlock(t).type === t))
    const engine = read("components/onepage/app-block.tsx")
    check("taps go through the shared block sheet, never a copy of it", /useBlockSheet\(\)/.test(engine) && /sheet\.available/.test(engine) && !/createPortal|role="dialog"/.test(code(engine)))
    check("each tap is counted (the page's own track endpoint, the item folded into its block)", /\/api\/onepage\/track/.test(engine) && /socialLinkId\(block\.id, item\.id\)/.test(engine) && /if \(preview \|\| !onepageId/.test(engine))
    const editor = read("components/onepage/app-block-editor.tsx")
    check("the editor has a Settings half and a Layout half, and Interaction", /useBlockPart\(\)/.test(editor) && /<LayoutPicker/.test(editor) && /<ModeChoice/.test(editor) && read("components/onepage/tabs/links-tab.tsx").includes('"social_posts", "app"])'))
    const files = ["components/onepage/add-block-picker.tsx", "components/onepage/app-block.tsx", "components/onepage/app-block-editor.tsx", "lib/onepage/app-blocks.ts"]
    const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform your)\b/i
    const bad = files.filter((f) => banned.test(read(f)) || /—/.test(read(f)) || /shopify|liquid/i.test(code(read(f))))
    check("no AI words, no em dashes, no Shopify", bad.length === 0, bad)
    check("no remote logo is loaded: marks are inline", !/https?:\/\/[^"'\s]+\.(svg|png)/.test(code(read("components/onepage/brand-icons.tsx"))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
