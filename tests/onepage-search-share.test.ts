/**
 * ===========================================================================
 *  A ONEPAGE'S SEARCH AND SHARE FIELDS, AND THE SETTINGS THAT SAVE THEM
 * ===========================================================================
 * "Should they not change dynamically based on the changes users make on the
 * OnePage?" They follow the page until somebody types their own, and the
 * public page says exactly what the editor previewed. Pinned here:
 *
 *   RESOLUTION    lib/onepage/seo resolveOnePageSeo: the defaults from the
 *                 name, the bio, the photo and the theme; an override; a
 *                 reset; an empty bio; long values cut like Google cuts
 *                 them; markup and entities out; the image's fingerprint
 *                 moving with what the image is drawn from and nothing else.
 *   METADATA      the public page's real generateMetadata, run against an
 *                 in-memory database, equal field for field to what the
 *                 editor's preview resolves from the draft that was saved.
 *   THE ROUTE     PUT /api/onepage as it ships, with its database swapped:
 *                 settings cleaned or refused, a page address checked like a
 *                 username and never somebody else's, the paid settings
 *                 only on a paid plan.
 *   THE IMAGE     /<slug>/links/share.png drawn for real (next/og), with the
 *                 long cache only for the current fingerprint.
 */
import { register } from "node:module"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { fakeDb } from "./_fake-db"
import {
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  clipText,
  coverRect,
  onePageMetadataFrom,
  plainText,
  resolveOnePageSeo,
  shareCardModel,
  textLength,
} from "@/lib/onepage/seo"
import {
  SEO_AUTO_DESCRIPTION_MAX,
  cutAtWord,
  descriptionSourceNote,
  pageSentence,
  platformLabel,
  platformOfUrl,
  summarizePage,
  tidyBio,
} from "@/lib/onepage/seo-description"
import { resolveProductBlocks } from "@/lib/onepage/live-products"
import { buttonStyleOf, checkPageSlug, checkSettingsPatch } from "@/lib/onepage/settings-rules"
import { publicOnePageFromDraft } from "@/lib/onepage/public-shape"
import { imageInfo } from "@/lib/onepage/share-image"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`)
  }
}

/* The address a OnePage is shared at: storelib.me/{handle} (lib/onepage/address). */
const PAGE_URL = "https://storelib.me/satori"
const THEME = { background_type: "solid", background_color: "#1A2E1A", text_color: "#eef2ec", secondary_text_color: "#b7c4b6", button_color: "#ff0000" }
const base = (over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) =>
  resolveOnePageSeo({ name: "Satori Studio", bio: "Prints, posters and a newsletter", handle: "satori", avatarUrl: "https://x.supabase.co/a.jpg", theme: THEME, settings, pageUrl: PAGE_URL, ...over })

function resolution() {
  console.log("\nFollowing the page")
  const d = base()
  check("the title is the name, the handle and the brand", d.title.value === "Satori Studio (@satori) | Storelib" && d.title.auto)
  check("the description is the bio", d.description.value === "Prints, posters and a newsletter" && d.description.auto)
  check("the shared title is the name alone: the app prints the site beside it", d.socialTitle.value === "Satori Studio" && d.socialTitle.auto)
  check("the shared description is the description", d.socialDescription.value === d.description.value && d.socialDescription.auto)
  /* Changed on purpose: a shared link shows the profile photo unless the creator picks the card (tests/onepage-share-image.test.ts pins the three choices). */
  check("the picture is the page's photo", d.image.source === "profile" && d.image.mode === "profile" && d.image.customUrl === null)
  const cardOf = (over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) => base({ shareImageMode: "card", ...over }, settings)
  const dc = cardOf()
  check("the card, when chosen, is drawn from the page", dc.image.source === "generated" && dc.image.customUrl === null)
  check("its address is beside the page, outside /api, with a fingerprint", /^https:\/\/storelib\.com\/satori\/links\/share\.png\?v=[a-z0-9]{6,12}$/.test(dc.image.url), dc.image.url)
  check("the host and Google's grey line", d.domain === "storelib.me" && d.breadcrumb === "storelib.me › satori")

  const renamed = base({ name: "Satori Prints" })
  check("a rename moves the title, the shared title and the card", renamed.title.value === "Satori Prints (@satori) | Storelib" && renamed.socialTitle.value === "Satori Prints" && cardOf({ name: "Satori Prints" }).image.url !== dc.image.url)
  check("a new bio moves the description and not the picture", base({ bio: "Posters only" }).description.value === "Posters only" && base({ bio: "Posters only" }).image.url === d.image.url)
  check("a new photo moves the picture", base({ avatarUrl: "https://x.supabase.co/b.jpg" }).image.url !== d.image.url)
  check("a new theme colour moves the card", cardOf({ theme: { ...THEME, background_color: "#000000" } }).image.url !== dc.image.url)

  console.log("\nAn empty page")
  const empty = base({ bio: "", name: "" })
  check("no name: the handle", empty.name === "@satori" && empty.title.value === "@satori | Storelib")
  check("no bio and nothing on the page: a plain line naming it", empty.description.value === "@satori on Storelib." && empty.derived.description.kind === "name")
  check("only spaces and markup in the bio count as none", base({ bio: "  <p> </p> " }).description.value === "Satori Studio on Storelib.")

  console.log("\nSomebody types their own")
  const own = base({}, { seo_title: "Risograph prints from Kyoto", seo_description: "Hand pulled prints, shipped worldwide." })
  check("the typed title wins, and says so", own.title.value === "Risograph prints from Kyoto" && !own.title.auto)
  check("the typed description wins", own.description.value === "Hand pulled prints, shipped worldwide." && !own.description.auto)
  check("the shared title follows the typed title", own.socialTitle.value === "Risograph prints from Kyoto" && own.socialTitle.auto)
  check("the shared description follows the typed description", own.socialDescription.value === "Hand pulled prints, shipped worldwide." && own.socialDescription.auto)
  const ownRenamed = base({ name: "Somebody Else" }, { seo_title: "Risograph prints from Kyoto" })
  check("a typed title no longer follows a rename", ownRenamed.title.value === "Risograph prints from Kyoto")
  check("but the fields nobody typed still do", ownRenamed.socialDescription.value === "Prints, posters and a newsletter" && ownRenamed.image.card.name === "Somebody Else")
  const social = base({}, { social_title: "Come say hi", social_description: "New prints every Friday" })
  check("a shared title of its own leaves the search title alone", social.socialTitle.value === "Come say hi" && !social.socialTitle.auto && social.title.value === "Satori Studio (@satori) | Storelib")
  check("a shared description of its own", social.socialDescription.value === "New prints every Friday" && !social.socialDescription.auto)

  console.log("\nGoing back to following")
  check("a cleared field follows again", base({}, { seo_title: null }).title.auto && base({}, { seo_title: "" }).title.auto && base({}, { seo_title: "   " }).title.auto)
  check("the page's own name typed back is not an override, nor either title it was ever given", base({}, { seo_title: "Satori Studio" }).title.auto && base({}, { seo_title: "satori studio | storelib" }).title.auto && base({}, { seo_title: "Satori Studio (@satori) | Storelib" }).title.auto)
  check("the bio typed back is not an override", base({}, { seo_description: "Prints, posters and a newsletter" }).description.auto)

  console.log("\nLong values, markup")
  const longName = "The Extraordinarily Long Named Riso Print Collective of Kyoto Japan"
  const long = base({ name: longName, bio: "word ".repeat(80) })
  check("a long name drops the brand and is cut to 60 at a word, with an ellipsis", textLength(long.title.value) <= SEO_TITLE_MAX && long.title.value.endsWith("…") && !/Storelib/.test(long.title.value), long.title.value)
  check("the shared title too", textLength(long.socialTitle.value) <= SEO_TITLE_MAX)
  check("a long bio is cut to 155 at a word", textLength(long.description.value) <= SEO_AUTO_DESCRIPTION_MAX && long.description.value.endsWith("word…"), long.description.value)
  const typedLong = base({}, { seo_title: "x".repeat(90), seo_description: "y".repeat(400) })
  check("a typed title and description are held to 60 and 160", textLength(typedLong.title.value) === 60 && textLength(typedLong.description.value) === 160)
  const marked = base({ name: "<b>Satori</b> &amp; Co", bio: "<script>alert(1)</script>Prints &lt;3\n\nand   posters" })
  check("markup is taken out and entities read", marked.name === "Satori & Co" && !/[<>]/.test(marked.description.value) && marked.description.value === "alert(1) Prints 3. and posters", marked.description.value)
  check("no tag survives in any field", ![marked.title.value, marked.description.value, marked.socialTitle.value].some((v) => /<|>/.test(v)))
  check("an emoji is never cut in half", !/\uD83C$|\uD83D$/.test(clipText("😀".repeat(100), 10)) && textLength(clipText("😀".repeat(100), 10)) <= 10)
  check("plain text of nothing is nothing", plainText(null) === "" && plainText(42) === "")

  console.log("\nThe share picture")
  /* An upload is the picture when Custom image is chosen (changed on purpose: it used to replace the card by being there). */
  const customOf = (settings: Record<string, unknown>) => base({ shareImageMode: "custom" }, settings)
  const custom = customOf({ social_image_url: "https://x.supabase.co/storage/v1/object/public/onepage-assets/u/og.jpg", social_image_position_x: 30, social_image_position_y: 70 })
  check("an upload replaces the card", custom.image.source === "custom" && custom.image.focal.x === 30 && custom.image.focal.y === 70)
  check("moving its crop moves the fingerprint", customOf({ social_image_url: custom.image.customUrl, social_image_position_x: 31, social_image_position_y: 70 }).image.url !== custom.image.url)
  check("an http, IP or internal picture is no picture", ["http://x.co/a.jpg", "https://127.0.0.1/a.jpg", "https://localhost/a.jpg", "https://metadata.internal/a.jpg", "javascript:alert(1)"].every((u) => { const i = customOf({ social_image_url: u }).image; return i.customUrl === null && i.source !== "custom" }))
  const dark = shareCardModel({ name: "A", avatarUrl: null, theme: { background_type: "solid", background_color: "#000000", text_color: "#111111" }, pageUrl: PAGE_URL })
  check("text the theme would draw unreadable is swapped for one that reads", dark.text === "#ffffff")
  const grad = shareCardModel({ name: "A", avatarUrl: null, theme: { background_type: "gradient", gradient_color_1: "#ffd1dc", gradient_color_2: "#fbe7c6", gradient_direction: 90 }, pageUrl: PAGE_URL })
  check("a gradient theme draws its gradient", grad.background.gradient === "linear-gradient(90deg, #ffd1dc 0%, #fbe7c6 100%)")
  check("no photo: initials", shareCardModel({ name: "Satori Studio", avatarUrl: null, theme: THEME, pageUrl: PAGE_URL }).initials === "SS")
  const r = coverRect(800, 1000, 1200, 630, 50, 0)
  check("a crop covers the card and keeps the chosen point", r.width === 1200 && r.height === 1500 && r.left === 0 && r.top === 0 && coverRect(800, 1000, 1200, 630, 50, 100).top === -870)
  check("a PNG and a JPEG are read for their size", JSON.stringify(imageInfo(pngHeader(640, 480))) === JSON.stringify({ width: 640, height: 480, mime: "image/png" }) && imageInfo(new Uint8Array([1, 2, 3])) === null)

  console.log("\nThe metadata it makes")
  const m = onePageMetadataFrom(d, { handle: "satori", indexable: true, icon: "https://x.supabase.co/a.jpg" }) as any
  check("the title whole, so the layout adds no second brand", m.title.absolute === "Satori Studio (@satori) | Storelib")
  check("one address for canonical and og:url", m.alternates.canonical === PAGE_URL && m.openGraph.url === PAGE_URL)
  /* Changed on purpose: the photo is a square summary card, the drawn card a large one. */
  check("the photo is a summary card, 600 square", m.twitter.card === "summary" && m.openGraph.images[0].width === 600 && m.openGraph.images[0].height === 600)
  const mc = onePageMetadataFrom(dc, { handle: "satori", indexable: true }) as any
  check("the card a large one, with its size", mc.twitter.card === "summary_large_image" && mc.openGraph.images[0].width === 1200 && mc.openGraph.images[0].height === 630)
  check("not listed means not indexed", (onePageMetadataFrom(d, { indexable: false }) as any).robots.index === false)
}

/* ─── A page with no description of its own is described from what is on it ─── */

const NOW = Date.parse("2026-09-27T12:00:00Z")
const product = (id: string, title: string | null, over: Record<string, unknown> = {}) => ({ id: `b-${id}`, type: "product", enabled: true, sort_order: 0, data: { product_id: id, product_title: title }, ...over })
const link = (label: string, url: string, over: Record<string, unknown> = {}) => ({ id: `l-${label}`, type: "link_button", enabled: true, sort_order: 0, data: { label, url }, ...over })
const socialRow = (platforms: Array<[string, string]>, over: Record<string, unknown> = {}) => ({ id: "s", type: "social_row", enabled: true, sort_order: 0, data: { style: "icons", platforms: platforms.map(([platform, url]) => ({ platform, url })) }, ...over })
const header = (showBio = true, over: Record<string, unknown> = {}) => ({ id: "h", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: showBio }, ...over })
const described = (blocks: unknown[], over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) =>
  base({ name: "Mara Lee", handle: "mara", bio: "", blocks, socialLinks: {}, now: NOW, ...over }, settings)
/* A pronoun about the creator: the sentence names them instead. */
const PRONOUN = /\b(?:he|she|him|her|his|hers|they|them|their|theirs)\b/i
/* Words nobody who sells a zine says about it. */
const HYPE = /\b(?:unlock|elevate|seamless|powerful|effortless(?:ly)?|supercharge|transform|amazing|ultimate|discover)\b/i

function describedFromThePage() {
  console.log("\nThe description chain: typed, bio, page, name")
  const page = [header(), product("p1", "Riso Pack"), product("p2", "Zine No. 4", { sort_order: 1 }), product("p3", "Tote", { sort_order: 2 }), socialRow([["instagram", "@mara"], ["tiktok", "@mara"]], { sort_order: 3 }), link("YouTube", "https://www.youtube.com/@mara", { sort_order: 4 })]
  const typed = described(page, { bio: "Riso prints from Leeds" }, { seo_description: "Prints by hand, posted on Fridays." })
  check("1. a description they typed wins over the bio and the page", typed.description.value === "Prints by hand, posted on Fridays." && !typed.description.auto)
  const fromBio = described(page, { bio: "Riso prints from Leeds" })
  check("2. then the bio", fromBio.description.value === "Riso prints from Leeds" && fromBio.derived.description.kind === "bio")
  const fromPage = described(page)
  check(
    "3. then the page: its products by name, then where else to find them",
    fromPage.description.value === "Shop Riso Pack, Zine No. 4 and Tote from Mara Lee. Also on Instagram, TikTok and YouTube." && fromPage.description.auto,
    fromPage.description.value,
  )
  check("   and what it was made from, for the note under the field", JSON.stringify(fromPage.derived.description) === JSON.stringify({ kind: "page", products: 3, socials: 3, links: 0 }) && descriptionSourceNote(fromPage.derived.description) === "From your page: 3 products, 3 socials")
  const empty = described([header()])
  check("4. only an empty page gets the plain line", empty.description.value === "Mara Lee on Storelib." && descriptionSourceNote(empty.derived.description).startsWith("From your page name"))
  check("the bio note", descriptionSourceNote(fromBio.derived.description) === "From your bio")

  console.log("\nThe sentence, every way it is said")
  const s = (blocks: unknown[], socialLinks: Record<string, unknown> = {}) => described(blocks, { socialLinks }).description.value
  check("one product", s([product("p1", "Riso Pack")]) === "Shop Riso Pack from Mara Lee.")
  check("more than three: a count and the first three", s(["a", "b", "c", "d", "e"].map((id, i) => product(id, `Print ${id.toUpperCase()}`, { sort_order: i }))) === "Shop 5 products from Mara Lee, including Print A, Print B and Print C.")
  check("a product with no title is counted, not named", s([product("p1", null), product("p2", "Tote", { sort_order: 1 })]) === "Shop 2 products from Mara Lee, including Tote.")
  check("a title too long to name is counted, not cut", s([product("p1", "The Complete Guide to Risograph Printing at Home for Beginners")]) === "Shop 1 product from Mara Lee.")
  check("socials alone", s([socialRow([["instagram", "@m"], ["twitter", "@m"], ["youtube", "@m"], ["twitch", "m"]])]) === "Find Mara Lee on Instagram, X, YouTube and 1 more.")
  check("a social row with none of its own draws the profile's links, and so is read from them", s([socialRow([])], { youtube: "https://youtube.com/@m", instagram: "@m" }) === "Find Mara Lee on Instagram and YouTube.")
  check("links, when there are no socials", s([link("Podcast", "https://pod.example"), link("Newsletter", "https://news.example", { sort_order: 1 })]) === "Links from Mara Lee: Podcast and Newsletter.")
  check("more links than it names", s(["Podcast", "Newsletter", "Portfolio", "Blog", "Shop"].map((l, i) => link(l, `https://${i}.example`, { sort_order: i }))) === "Links from Mara Lee: Podcast, Newsletter, Portfolio and 2 more links.")
  check("products and links", s([product("p1", "Riso Pack"), link("Podcast", "https://pod.example", { sort_order: 1 })]) === "Shop Riso Pack from Mara Lee. Links to Podcast.")
  check("socials win over link titles", s([link("Podcast", "https://pod.example"), link("Me on TikTok", "https://tiktok.com/@m", { sort_order: 1 })]) === "Find Mara Lee on TikTok.")
  check("a link to a platform counts as that platform", platformOfUrl("https://m.youtube.com/@x") === "youtube" && platformOfUrl("instagram.com/x") === "instagram" && platformOfUrl("https://x.com/m") === "twitter" && platformOfUrl("https://mara.substack.com") === "substack" && platformOfUrl("https://example.com/instagram.com") === null)
  /* The editor's list of platforms (components/onepage/brand-icons ONEPAGE_SOCIAL_PLATFORMS), read from its source so the icons' React is not loaded here. */
  const offered = [...readFileSync(join(process.cwd(), "components/onepage/brand-icons.tsx"), "utf8").matchAll(/\{ key: "([a-z]+)", label: "([^"]+)" \}/g)].map((m) => [m[1], m[2]] as const)
  const misnamed = offered.filter(([key, label]) => platformLabel(key) !== label)
  check("each platform named as the editor and its icon name it", offered.length >= 20 && misnamed.length === 0, JSON.stringify(misnamed))
  check("in the page's order, whatever order the array is in", s([product("p2", "Second", { sort_order: 2 }), product("p1", "First", { sort_order: 1 })]) === "Shop First and Second from Mara Lee.")
  const again = [product("p1", "A"), product("p2", "B", { sort_order: 1 }), socialRow([["tiktok", "@m"], ["instagram", "@m"]], { sort_order: 2 })]
  check("the same page says the same thing every time: nothing to flicker", s(again) === s(JSON.parse(JSON.stringify(again))) && s(again) === "Shop A and B from Mara Lee. Also on TikTok and Instagram.")
  check("a product twice on the page is one product", s([product("p1", "Tote"), product("p1", "Tote", { id: "again", sort_order: 1 })]) === "Shop Tote from Mara Lee.")
  const groupPage = [{ id: "g", type: "group", enabled: true, sort_order: 0, data: { layout: "stack", children: [product("p1", "Inside"), { ...product("p2", "Switched off"), enabled: false }] } }]
  check("a group's products count, the ones it draws only", s(groupPage) === "Shop Inside from Mara Lee.")
  const carousel = [{ id: "g", type: "group", enabled: true, sort_order: 0, data: { layout: "carousel", children: [{ ...product("p1", "Shown"), enabled: true }, { ...product("p2", "Unset"), enabled: undefined }] } }]
  check("a carousel draws only the children switched on", s(carousel) === "Shop Shown from Mara Lee.")
  const long = s([...["Risograph Print Number One", "Risograph Print Number Two", "Risograph Print Number Three", "Risograph Print Four"].map((t, i) => product(`p${i}`, t, { sort_order: i })), socialRow([["instagram", "@m"], ["tiktok", "@m"], ["youtube", "@m"], ["threads", "@m"], ["pinterest", "@m"]], { sort_order: 9 })])
  check("held to 155, by naming fewer rather than cutting", textLength(long) <= SEO_AUTO_DESCRIPTION_MAX && !long.includes("…") && long.startsWith("Shop 4 products from Mara Lee"), long)
  const every = [
    s([product("p1", "A")]),
    s([socialRow([["instagram", "@m"]])]),
    s([link("Podcast", "https://pod.example")]),
    s([product("p1", "A"), socialRow([["instagram", "@m"]], { sort_order: 1 })]),
    s([product("p1", "A"), link("Podcast", "https://pod.example", { sort_order: 1 })]),
    described([]).description.value,
  ]
  check("no pronoun, no hype word, no dash in any of them", every.every((t) => !PRONOUN.test(t) && !HYPE.test(t) && !/[–—]/.test(t)), every.join(" / "))

  console.log("\nOnly what a visitor sees, and nothing private")
  const hidden = s([
    product("p1", "Switched off", { enabled: false }),
    product("p2", "Next year", { schedule: { start_at: "2027-01-01T00:00:00Z" } }),
    product("p3", "Ended", { schedule: { end_at: "2026-01-01T00:00:00Z" } }),
    link("Draft link", "https://"),
    link("Hidden link", "https://h.example", { enabled: false }),
    socialRow([["instagram", "@m"]], { enabled: false }),
  ])
  check("a block that is off, scheduled for later, ended, or empty is not named", hidden === "Mara Lee on Storelib.", hidden)
  check("a product that is archived or unpublished is not named (read live, as the page reads it)", s(resolveProductBlocks([product("p1", "Live"), product("p2", "Archived", { sort_order: 1 })], new Map([["p1", { id: "p1", title: "Live" }], ["p2", null]]))) === "Shop Live from Mara Lee.")
  check("an email link or an email icon is never named", s([link("Email me", "mailto:mara@example.com"), socialRow([["email", "mara@example.com"], ["whatsapp", "+44 7700 900123"]], { sort_order: 1 })]) === "Mara Lee on Storelib.")
  const leaky = s([link("Write to mara@example.com", "https://contact.example"), product("p1", "Zine <b>No. 4</b> &amp; tote", { sort_order: 1 })])
  check("an address in a title is taken out; markup and entities too", !/@example|mara@|<|&amp;/.test(leaky) && leaky.includes("Zine No. 4 & tote"), leaky)
  const bioHidden = described([header(false), product("p1", "Tote")], { bio: "Riso prints from Leeds" })
  check("a bio the header hides is not used", bioHidden.description.value === "Shop Tote from Mara Lee." && bioHidden.derived.page.bioShown === false)
  check("a page with no header block keeps its bio, as before", described([product("p1", "Tote")], { bio: "Riso prints" }).description.value === "Riso prints")
  const huge = Array.from({ length: 5000 }, (_, i) => link(`Link ${i}`, `https://${i}.example`, { sort_order: i }))
  const t0 = performance.now()
  const big = summarizePage({ blocks: huge, now: NOW })
  check("bounded: 5000 blocks read as the first 200, in well under 50ms", big.linkCount === 200 && performance.now() - t0 < 50, `${big.linkCount} in ${Math.round(performance.now() - t0)}ms`)

  console.log("\nThe bio, tidied and cut")
  check("lines become sentences, decorations and addresses go", tidyBio("Photographer\n• London\n\nBookings: mara@example.com\nPrints &amp; zines") === "Photographer. London. Bookings. Prints & zines", tidyBio("Photographer\n• London\n\nBookings: mara@example.com\nPrints &amp; zines"))
  check("markup lines too", tidyBio("<p>Prints</p><p>Zines</p>") === "Prints. Zines")
  const ls = String.fromCharCode(0x2028), zw = String.fromCharCode(0x200b), bell = String.fromCharCode(7)
  check("invisible and control characters go", tidyBio(`Pri${zw}nts${bell} and${ls}zines`) === "Pri nts and. zines")
  const early = cutAtWord("I print risographs in Leeds. Every print is pulled by hand on recycled paper, signed and numbered, and posted on Fridays to anywhere in the world with a note.", 155)
  check("a sentence that ends early is not where it stops: too little would be left", early.endsWith("…") && early.length > 100, early)
  const cut = cutAtWord("Prints, posters and a newsletter for people who like paper, ink, and the smell of a studio in the morning; also zines, totes and the occasional shirt (and more", 155)
  check("otherwise at a word, with nothing hanging and an ellipsis", textLength(cut) <= 155 && cut.endsWith("…") && !/[\s,;:(]…$/.test(cut) && !/ (?:and|or|the|a)…$/.test(cut), cut)
  const sentences = cutAtWord("Prints by hand. " + "Posted on Fridays to anywhere in the world, signed and numbered, on recycled paper. ".repeat(3), 155)
  check("a sentence end late enough is where it stops", sentences.endsWith(".") && !sentences.endsWith("…") && textLength(sentences) <= 155, sentences)
  check("text that fits is left alone", cutAtWord("Short bio.", 155) === "Short bio.")

  console.log("\nThe title")
  check("the name and the handle", described([]).title.value === "Mara Lee (@mara) | Storelib")
  check("the handle is not repeated when it is the name", described([], { name: "Mara", handle: "mara" }).title.value === "Mara | Storelib" && described([], { name: "Mara Lee", handle: "mara.lee" }).title.value === "Mara Lee | Storelib")
  const longish = described([], { name: "Satori Risograph Print Studio of Leeds", handle: "satoristudioleeds" }).title.value
  check("the brand goes before the handle, the handle before the name is cut", longish === "Satori Risograph Print Studio of Leeds (@satoristudioleeds)" && textLength(longish) <= 60, longish)
  const longer = described([], { name: "Satori Risograph Print Studio of Leeds and Co", handle: "satoristudioleeds" }).title.value
  const longest = described([], { name: "Satori Risograph Print Studio of Leeds, Bradford and York", handle: "satoristudioleeds" }).title.value
  check("then the name with the brand, then the name alone", longer === "Satori Risograph Print Studio of Leeds and Co | Storelib" && longest === "Satori Risograph Print Studio of Leeds, Bradford and York", JSON.stringify([longer, longest]))
  check("the title note says where it comes from", described([]).derived.title === "name-and-handle" && described([], { name: "Mara", handle: "mara" }).derived.title === "name")

  console.log("\nOverrides and the way back")
  const own = described(page, {}, { seo_title: "Riso prints", seo_description: "By hand." })
  check("typed title and description stop following, the shared ones follow them", own.title.value === "Riso prints" && own.socialTitle.value === "Riso prints" && own.socialDescription.value === "By hand." && own.socialDescription.auto)
  const socialOwn = described(page, {}, { social_description: "Fridays only" })
  check("a shared description of its own leaves the made one on search", socialOwn.socialDescription.value === "Fridays only" && socialOwn.description.value === fromPage.description.value)
  check("reset (an empty value) follows the page again", described(page, {}, { seo_description: null }).description.value === fromPage.description.value && described(page, {}, { seo_description: "" }).description.auto)
  check("the made sentence typed back is not an override", described(page, {}, { seo_description: fromPage.description.value }).description.auto)
  check("nor the one line every page used to get", described(page, {}, { seo_description: "Links and products from Mara Lee." }).description.auto)
  const followed = described(page.concat([product("p9", "Poster", { sort_order: 9 })]))
  check("an edit to the page moves the made description", followed.description.value !== fromPage.description.value && /4 products/.test(followed.description.value), followed.description.value)
  check("the sentence alone, for a page with nothing: null", pageSentence("M", summarizePage({ blocks: [] })) === null)
}

function pngHeader(w: number, h: number) {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const v = new DataView(b.buffer)
  v.setUint32(16, w)
  v.setUint32(20, h)
  return b
}

function rules() {
  console.log("\nWhat the route accepts")
  const t = checkSettingsPatch({ seo_title: "  <b>Hello</b>   there  ", seo_description: "d".repeat(300), social_title: "", share_style: "glassmorphism", subscribe_enabled: false, extra_key: { a: 1 } })
  check("text is stripped, trimmed and held to its limit", t.ok && t.value.seo_title === "Hello there" && (t.value.seo_description as string).length === 160 && t.value.social_title === null)
  check("the templates' glassmorphism is stored as glass", t.ok && t.value.share_style === "glass" && buttonStyleOf("glassmorphism", "white") === "glass")
  check("a key it does not know is kept", t.ok && JSON.stringify(t.value.extra_key) === '{"a":1}')
  check("a share picture at http is refused", !checkSettingsPatch({ social_image_url: "http://x.co/a.jpg" }).ok)
  check("one at https is kept", checkSettingsPatch({ social_image_url: "https://x.supabase.co/a.jpg" }).ok)
  check("a switch that is not on or off is refused", !checkSettingsPatch({ share_enabled: "no" }).ok)
  check("a style nobody draws is refused", !checkSettingsPatch({ subscribe_style: "neon" }).ok)
  check("a badge that does not exist is refused", !checkSettingsPatch({ verified_badge_type: "king" }).ok && checkSettingsPatch({ verified_badge_type: "verified_brand" }).ok)
  check("the crop is held to 0 to 100", (checkSettingsPatch({ social_image_position_x: 140 }) as any).value.social_image_position_x === 100)
  check("a value sent back as it is stored is kept, however old", checkSettingsPatch({ social_image_url: "http://old.example/a.png" }, { social_image_url: "http://old.example/a.png" }).ok)
  check("settings that are not an object are refused", !checkSettingsPatch("x").ok && !checkSettingsPatch([1]).ok)
  check("a page address follows the username rules", checkPageSlug("Satori-Prints").ok && (checkPageSlug("Satori-Prints") as any).value === "satori-prints")
  check("a short, reserved or broken address is refused, with a sentence saying what to do",
    ["ab", "app", "checkout", "-x-", "a--b", "x".repeat(31)].every((s) => !checkPageSlug(s).ok) && (checkPageSlug("ab") as any).error === "Use at least 3 characters")
}

/* ─── The real route and page, with the database swapped ─────────────────── */

const S: any = ((globalThis as any).__seoStubs = { admin: null, server: null, user: null })
const dir = mkdtempSync(join(tmpdir(), "onepage-seo-stubs-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs: Record<string, string> = {
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__seoStubs.admin\n`),
  "@/lib/supabase/server": stub(
    "server",
    `export const createClient = async () => ({ ...globalThis.__seoStubs.server, auth: { getUser: async () => ({ data: { user: globalThis.__seoStubs.user }, error: null }) } })\n`,
  ),
  "@/lib/custom-domains/store": stub("domains", `export const primaryHostFor = async () => null\n`),
  "@/lib/website-builder/site-seo-data": stub("site-seo", `export const activeDomainOf = async () => null\n`),
  "@/components/onepage/public-onepage": stub("public", `export const PublicOnePage = () => null\n`),
  "@/components/analytics/track-view": stub("track", `export const TrackView = () => null\n`),
  "@/components/attribution/capture-touch": stub("touch", `export const CaptureTouch = () => null\n`),
  "@/lib/onepage/ensure-onepage": stub("ensure", `export const ensureOnePage = async () => null\n`),
  "next/navigation": stub("nav", `export const notFound = () => { throw new Error("NOT_FOUND") }\nexport const permanentRedirect = () => {}\nexport const redirect = () => {}\nexport const usePathname = () => "/"\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams()\n`),
  "next/og": stub(
    "og",
    `import { createRequire } from "node:module"\nconst require = createRequire(${JSON.stringify(join(process.cwd(), "package.json"))})\nexport const ImageResponse = require("next/og").ImageResponse\n`,
  ),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundle(entry: string): Promise<string> {
  const out = join(process.env.PUSH_TEST_OUT || dir, "__onepage-seo__", entry.replace(/[^\w]+/g, "_") + ".mjs")
  await build({
    entryPoints: [join(process.cwd(), entry)],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    jsx: "automatic",
    logLevel: "error",
    alias: { "@": process.cwd() },
    packages: "external",
    plugins: [
      {
        name: "stand-ins",
        setup(b) {
          const names = new Set(Object.keys(stubs))
          b.onResolve({ filter: /.*/ }, (a) => (names.has(a.path) ? { path: a.path, external: true } : undefined))
        },
      },
    ],
    external: ["next/*", "server-only"],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

const OWNER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"
const OTHER = "33333333-3333-4333-8333-333333333333"
const PAGE = "44444444-4444-4444-8444-444444444444"

/** The page as the editor holds it, after a save: the draft, and the copy publish took of it. */
function savedRow(draft: Record<string, any>) {
  return {
    ...draft,
    status: "published",
    published_blocks: draft.draft_blocks,
    published_theme: draft.theme,
    published_profile: { title: draft.title, bio: draft.bio, avatar_url: draft.avatar_url, avatar_video_url: null },
    published_social_links: draft.social_links,
  }
}

function world(row: Record<string, any>, plan = "free") {
  return fakeDb({
    onepages: [row],
    creators: [{ id: CREATOR, user_id: OWNER, banned_at: null, subscription_plan_id: plan, subscription_status: "active" }],
    profiles: [
      { id: OWNER, username: "satori", display_name: "Satori Studio", avatar_url: null },
      { id: OTHER, username: "takenname", display_name: "Somebody", avatar_url: null },
    ],
    /* The catalogue the page's product blocks are read against (lib/onepage/live-products, the real one). */
    products: [
      { id: "p1", creator_id: CREATOR, status: "published", title: "Riso Pack", slug: "riso-pack", price_cents: 1200, thumbnail_url: null },
      { id: "p2", creator_id: CREATOR, status: "draft", title: "Unpublished Zine", slug: "zine", price_cents: 800, thumbnail_url: null },
      { id: "p3", creator_id: CREATOR, status: "published", archived: true, title: "Archived Tote", slug: "tote", price_cents: 900, thumbnail_url: null },
      { id: "p4", creator_id: CREATOR, status: "published", title: "Poster Renamed", slug: "poster", price_cents: 500, thumbnail_url: null },
    ],
  })
}

/* What the catalogue answers about the same products, as the editor's panel asks it (components/onepage/seo-panel useProductAnswers). */
const CATALOGUE = new Map<string, { id: string; title: string } | null>([
  ["p1", { id: "p1", title: "Riso Pack" }],
  ["p2", null],
  ["p3", null],
  ["p4", { id: "p4", title: "Poster Renamed" }],
])

const DRAFT = {
  id: PAGE,
  owner_id: OWNER,
  seller_id: CREATOR,
  creator_id: CREATOR,
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: "https://x.supabase.co/storage/v1/object/public/onepage-assets/u/a.jpg",
  theme: THEME,
  settings: { show_branding: true, analytics_enabled: true },
  social_links: {},
  draft_blocks: [],
}

/* A page with things on it: a live product, an unpublished one, an archived one, one renamed since it was added, socials and links. */
const PAGE_BLOCKS = [
  { id: "h", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
  { id: "b1", type: "product", enabled: true, sort_order: 1, data: { product_id: "p1", product_title: "Riso Pack" } },
  { id: "b2", type: "product", enabled: true, sort_order: 2, data: { product_id: "p2", product_title: "Unpublished Zine" } },
  { id: "b3", type: "product", enabled: true, sort_order: 3, data: { product_id: "p3", product_title: "Archived Tote" } },
  { id: "b4", type: "product", enabled: true, sort_order: 4, data: { product_id: "p4", product_title: "Poster" } },
  { id: "b5", type: "social_row", enabled: true, sort_order: 5, data: { style: "icons", platforms: [{ platform: "instagram", url: "@satori" }, { platform: "email", url: "hello@satori.example" }] } },
  { id: "b6", type: "link_button", enabled: true, sort_order: 6, data: { label: "My videos", url: "https://youtube.com/@satori" } },
  { id: "b7", type: "link_button", enabled: false, sort_order: 7, data: { label: "Secret link", url: "https://secret.example" } },
]
const FROM_THE_PAGE = "Shop Riso Pack and Poster Renamed from Satori Studio. Also on Instagram and YouTube."

function previewOf(draft: Record<string, any>) {
  const drawn = publicOnePageFromDraft(draft as any, { displayName: "Satori Studio", liveAvatarUrl: null })
  /* As the panel does it: the draft's blocks with each product as the catalogue answers, and its social links. */
  const blocks = resolveProductBlocks(drawn.blocks, CATALOGUE)
  return resolveOnePageSeo({ name: drawn.title, bio: drawn.bio, blocks, socialLinks: drawn.social_links, handle: draft.slug, avatarUrl: drawn.avatar_url, theme: drawn.theme, settings: draft.settings, shareImageMode: draft.share_image_mode, pageUrl: PAGE_URL })
}

async function metadataAndRoutes() {
  const page = (await import(await bundle("app/(marketing)/l/[slug]/page.tsx"))) as any
  const route = (await import(await bundle("app/api/onepage/route.ts"))) as any
  const image = (await import(await bundle("app/(marketing)/[sellername]/links/share.png/route.tsx"))) as any

  console.log("\nThe public page says what the editor previewed")
  const cases: Array<[string, Record<string, any>]> = [
    ["following the page", DRAFT],
    ["a typed title and a shared description", { ...DRAFT, settings: { ...DRAFT.settings, seo_title: "Risograph prints from Kyoto", social_description: "New prints every Friday" } }],
    ["an empty bio and an uploaded picture", { ...DRAFT, bio: "", share_image_mode: "custom", settings: { ...DRAFT.settings, social_image_url: "https://x.supabase.co/storage/v1/object/public/onepage-assets/u/og.jpg", social_image_position_x: 20, social_image_position_y: 80 } }],
    ["the card chosen", { ...DRAFT, share_image_mode: "card" }],
    ["no bio: described from the page's blocks", { ...DRAFT, bio: "", draft_blocks: PAGE_BLOCKS, social_links: { youtube: "https://youtube.com/@satori" } }],
    ["a bio the header hides", { ...DRAFT, draft_blocks: [{ ...PAGE_BLOCKS[0], data: { show_avatar: true, show_name: true, show_bio: false } }, ...PAGE_BLOCKS.slice(1)] }],
  ]
  for (const [label, draft] of cases) {
    S.admin = world(savedRow(draft))
    const meta = await page.generateMetadata({ params: Promise.resolve({ slug: "satori" }) })
    const seen = previewOf(draft)
    const same =
      meta.title?.absolute === seen.title.value &&
      meta.description === seen.description.value &&
      meta.openGraph?.title === seen.socialTitle.value &&
      meta.openGraph?.description === seen.socialDescription.value &&
      meta.openGraph?.url === seen.url &&
      meta.alternates?.canonical === seen.url &&
      meta.openGraph?.images?.[0]?.url === seen.image.url &&
      meta.twitter?.images?.[0] === seen.image.url &&
      meta.twitter?.title === seen.socialTitle.value &&
      /* The card type follows the picture (changed on purpose: a photo is "summary"). */
      meta.twitter?.card === seen.image.twitterCard &&
      meta.openGraph?.images?.[0]?.type === seen.image.type
    check(`${label}: title, description, share card and address are the preview's`, same, JSON.stringify({ meta: { t: meta.title, d: meta.description, og: meta.openGraph }, seen: { t: seen.title, d: seen.description, st: seen.socialTitle, img: seen.image.url } }))
  }

  console.log("\nThe public description is made from the published copy, with its products read live")
  {
    const noBio = { ...DRAFT, bio: "", draft_blocks: PAGE_BLOCKS }
    S.admin = world(savedRow(noBio))
    const meta = await page.generateMetadata({ params: Promise.resolve({ slug: "satori" }) })
    check("it names the live products under their names now, and where else to find them", meta.description === FROM_THE_PAGE && meta.openGraph?.description === FROM_THE_PAGE, meta.description)
    check("an unpublished or archived product, an email, a switched off link: none of it is in the metadata", !/Unpublished|Archived|hello@|Secret/.test(JSON.stringify(meta)))
    /* A draft edit that is not published yet: the live page keeps saying what was published. */
    const draftBlocks = [...PAGE_BLOCKS, { id: "b9", type: "product", enabled: true, sort_order: 0.5, data: { product_id: "p1x", product_title: "Not Published Yet" } }]
    const draftAhead = { ...savedRow(noBio), draft_blocks: draftBlocks }
    S.admin = world(draftAhead)
    const still = await page.generateMetadata({ params: Promise.resolve({ slug: "satori" }) })
    check("a block added to the draft and not published yet is not in the live metadata", still.description === FROM_THE_PAGE && !/Not Published Yet/.test(JSON.stringify(still)), still.description)
    check("the editor's preview, from that draft, already shows it", /Not Published Yet/.test(previewOf({ ...noBio, draft_blocks: draftBlocks }).description.value))
    const bioAhead = { ...savedRow({ ...DRAFT, draft_blocks: PAGE_BLOCKS }), bio: "A draft bio" }
    S.admin = world(bioAhead)
    const bioStill = await page.generateMetadata({ params: Promise.resolve({ slug: "satori" }) })
    check("a bio typed into the draft over a published one waits for publish", bioStill.description === DRAFT.bio, bioStill.description)
  }
  S.admin = world(savedRow(DRAFT))
  const missing = await page.generateMetadata({ params: Promise.resolve({ slug: "nobody-here" }) })
  check("a page that is not there says so, is not indexed and has no card", missing.title === "Page not found" && missing.robots?.index === false && !missing.openGraph)

  console.log("\nPUT /api/onepage")
  const put = async (body: Record<string, unknown>, plan = "free") => {
    const db = world({ ...DRAFT, status: "published" }, plan)
    S.admin = db
    S.server = db
    S.user = { id: OWNER }
    const res = await route.PUT(new Request("https://storelib.test/api/onepage", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: PAGE, ...body }) }))
    return { res, body: await res.json().catch(() => ({})), row: db.tables.onepages[0] }
  }
  let r = await put({ settings: { seo_title: "<i>Prints</i> from Kyoto", share_style: "glassmorphism" } })
  check("settings are cleaned and merged, the rest kept", r.res.status === 200 && r.row.settings.seo_title === "Prints from Kyoto" && r.row.settings.share_style === "glass" && r.row.settings.show_branding === true)
  r = await put({ settings: { social_image_url: "http://169.254.169.254/latest" } })
  check("a share picture at an internal address is refused with a reason", r.res.status === 400 && /https/.test(r.body.error) && r.row.settings.social_image_url === undefined)
  r = await put({ slug: "takenname" })
  check("an address that is somebody else's username is taken", r.res.status === 400 && r.body.error === "That page address is taken" && r.row.slug === "satori")
  r = await put({ slug: "app" })
  check("an address the platform owns is refused", r.res.status === 400 && r.row.slug === "satori")
  r = await put({ slug: "satori-prints" })
  check("a free address is taken", r.res.status === 200 && r.row.slug === "satori-prints")
  r = await put({ slug: "satori" })
  check("sending the address it has changes nothing and checks nothing", r.res.status === 200 && r.row.slug === "satori")
  r = await put({ settings: { verified_badge_enabled: true } }, "free")
  check("the verified badge is refused on the free plan", r.res.status === 400 && /Pro/.test(r.body.error) && r.row.settings.verified_badge_enabled === undefined)
  r = await put({ settings: { show_branding: false } }, "free")
  check("so is hiding the Storelib badge", r.res.status === 400 && r.row.settings.show_branding === true)
  r = await put({ settings: { verified_badge_enabled: true, verified_badge_type: "verified_artist" } }, "growth")
  check("both are saved on Pro", r.res.status === 200 && r.row.settings.verified_badge_enabled === true && r.row.settings.verified_badge_type === "verified_artist")
  {
    /* The plan cannot be read: the badge is neither granted (a free page would get Pro while the read fails) nor refused as unpaid (a paying creator told to upgrade). */
    const db = world({ ...DRAFT, status: "published" }, "growth")
    S.admin = new Proxy(db, { get: (t, k) => (k === "from" ? (table: string) => { if (table === "creators") throw new Error("down"); return (t as any).from(table) } : (t as any)[k]) })
    S.server = db
    S.user = { id: OWNER }
    const res = await route.PUT(new Request("https://storelib.test/api/onepage", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: PAGE, settings: { verified_badge_enabled: true } }) }))
    const body = await res.json().catch(() => ({}))
    check("a plan that cannot be read neither grants the badge nor calls it unpaid: try again", res.status === 400 && /could not be checked/.test(body.error ?? "") && db.tables.onepages[0].settings.verified_badge_enabled === undefined, body)
  }
  r = await put({ title: 42 })
  check("a name that is not text is refused", r.res.status === 400)
  S.user = null
  const anon = await route.PUT(new Request("https://storelib.test/api/onepage", { method: "PUT", body: JSON.stringify({ id: PAGE }) }))
  check("nobody signed in, nothing saved", anon.status === 401)

  console.log("\nThe share image")
  S.admin = world(savedRow({ ...DRAFT, avatar_url: null }))
  const seen = previewOf({ ...DRAFT, avatar_url: null })
  const v = new URL(seen.image.url).searchParams.get("v")
  const current = await image.GET(new Request(`https://storelib.com/satori/links/share.png?v=${v}`), { params: Promise.resolve({ sellername: "satori" }) })
  const bytes = new Uint8Array(await current.arrayBuffer())
  const info = imageInfo(bytes)
  check("it is a 1200 by 630 PNG", current.status === 200 && current.headers.get("content-type") === "image/png" && info?.width === 1200 && info?.height === 630, JSON.stringify(info))
  check("the current fingerprint is kept for a year", /s-maxage=31536000/.test(current.headers.get("cache-control") || ""))
  const stale = await image.GET(new Request("https://storelib.com/satori/links/share.png?v=old"), { params: Promise.resolve({ sellername: "satori" }) })
  check("an old one for a minute", stale.status === 200 && /s-maxage=60\b/.test(stale.headers.get("cache-control") || ""))
  const none = await image.GET(new Request("https://storelib.com/nobody/links/share.png"), { params: Promise.resolve({ sellername: "nobody" }) })
  check("no page, no picture", none.status === 404)
}

async function main() {
  resolution()
  describedFromThePage()
  rules()
  await metadataAndRoutes()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
