/**
 * ROUND 33: the community Page editor and the About page it edits.
 *
 *   LINKS    a network and what the creator has (@name, a bare name, an address) make one https address on that
 *            network; another network's address is refused for it; the About page reads the network back from the host
 *   LOOK     the cover's focus and the join button (lib/communities/page-look.ts): cleaned, stored beside the welcome
 *            steps and kept when they are saved; the brand colour from a logo, darkened until white reads on it
 *   ROW      the facts under the name (about-facts.ts aboutRow)
 *   DRAFT    the preview is the About page drawn from the draft; Save sends only what changed
 *   SOURCE   the route, the section, the description through the product editor's field and sanitizer, the Membership
 *            section's rule, the signed out menu
 *
 * scripts/check-page-editor-round33.mjs measures the editor and the page in a browser.
 */
import { readCode } from "./_source"
import { displayOfLink, networkOfUrl, normalizeSocialLink, socialLinksOf } from "@/lib/communities/social-links"
import { DEFAULT_LOOK, buttonBrand, cleanLook, contrast, coverPosition, dominantColour, joinLookOf, keptLook, pageLookOf, withPageLook } from "@/lib/communities/page-look"
import { aboutRow } from "@/components/community/public/about-facts"
import { changedBody, galleryViews, previewData, type PageDraft } from "@/components/community/creator/page-editor/draft"
import { adminSectionOf } from "@/components/community/creator/logic"
import { navigatorModel } from "@/lib/nav/places-shared"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readCode(p)
const url = (r: ReturnType<typeof normalizeSocialLink>) => ("url" in r ? r.url : `!${r.error}`)

console.log("\nLINKS: a network and @name")
{
  check("@name, a bare name, the address without https and with http all give one Instagram address", ["@clay", "clay", "www.instagram.com/clay", "http://www.instagram.com/clay"].map((v) => url(normalizeSocialLink("instagram", v))).every((u, i, a) => u === a[0]) && url(normalizeSocialLink("instagram", "instagram.com/clay")) === "https://instagram.com/clay" && url(normalizeSocialLink("instagram", "@clay")) === "https://www.instagram.com/clay")
  check("TikTok, YouTube, Threads take the @ into the path; X and Telegram do not", url(normalizeSocialLink("tiktok", "clay")) === "https://www.tiktok.com/@clay" && url(normalizeSocialLink("youtube", "@clay")) === "https://www.youtube.com/@clay" && url(normalizeSocialLink("threads", "clay")) === "https://www.threads.net/@clay" && url(normalizeSocialLink("x", "@clay")) === "https://x.com/clay" && url(normalizeSocialLink("telegram", "@clay")) === "https://t.me/clay")
  check("a WhatsApp number becomes wa.me with the digits", url(normalizeSocialLink("whatsapp", "+40 721 000 111")) === "https://wa.me/40721000111")
  check("another network's address is refused, naming it", /TikTok/.test(url(normalizeSocialLink("instagram", "tiktok.com/@clay"))) && !normalizeSocialLink("instagram", "tiktok.com/@clay").ok)
  check("a website needs an address, any host", url(normalizeSocialLink("website", "clay.studio/about")) === "https://clay.studio/about" && !normalizeSocialLink("website", "clay").ok && !normalizeSocialLink("website", "javascript:alert(1)").ok)
  check("Spotify needs a link, not a name", !normalizeSocialLink("spotify", "clay").ok && normalizeSocialLink("spotify", "open.spotify.com/show/abc").ok)
  check("the network is read back from the host", networkOfUrl("https://m.youtube.com/@x") === "youtube" && networkOfUrl("https://twitter.com/x") === "x" && networkOfUrl("https://discord.gg/abc") === "discord" && networkOfUrl("https://example.com") === "website")
  const views = socialLinksOf([{ label: "x", url: "https://www.instagram.com/clay" }, { label: "Our site", url: "https://clay.studio" }, { label: "bad", url: "http://clay.studio" }, { label: "js", url: "javascript:alert(1)" }])
  check("the About page draws https links only, each with its network's name (a website keeps its words)", views.length === 2 && views[0].network === "instagram" && views[0].label === "Instagram" && views[1].label === "Our site", views)
  check("the field shows a stored address as @name where the network has handles", displayOfLink("instagram", "https://www.instagram.com/clay") === "@clay" && displayOfLink("tiktok", "https://www.tiktok.com/@clay") === "@clay" && displayOfLink("website", "https://clay.studio/about") === "clay.studio/about")
}

console.log("\nLOOK: the cover's focus and the button")
{
  check("anything unrecognised reads as the page as it was", JSON.stringify(cleanLook(null)) === JSON.stringify(DEFAULT_LOOK) && JSON.stringify(pageLookOf({ page: "x" })) === JSON.stringify(DEFAULT_LOOK))
  const l = cleanLook({ coverX: 140, coverY: "-3", joinLabel: "  Get   access ", joinStyle: "brand", brand: "#1F7A5C", joinNote: "x".repeat(200) })
  check("the focus is clamped to 0 to 100, the words tidied and cut, the colour kept lower case", l.coverX === 100 && l.coverY === 0 && l.joinLabel === "Get access" && l.joinNote.length === 90 && l.brand === "#1f7a5c" && l.joinStyle === "brand", l)
  check("the brand style without a colour is ink", cleanLook({ joinStyle: "brand" }).joinStyle === "ink")
  check("a cover nobody moved carries no style; a moved one is x% y%", coverPosition(DEFAULT_LOOK) === undefined && coverPosition({ coverX: 20, coverY: 70 }) === "20% 70%")
  const kept = withPageLook({ welcome: "hi", safety: { slowModeSeconds: 30 } }, l)
  check("the look is stored beside the welcome steps, everything else kept", (kept as { welcome: string }).welcome === "hi" && !!(kept as { safety?: unknown }).safety && JSON.stringify(pageLookOf(kept)) === JSON.stringify(l))
  check("the default look is stored as nothing", !("page" in withPageLook({ page: l }, DEFAULT_LOOK)))
  check("saving the welcome keeps the look (keptLook)", JSON.stringify(keptLook(kept).page) === JSON.stringify(l) && JSON.stringify(keptLook({})) === "{}")
  const server = code("lib/communities/server/creator.ts")
  check("the settings route keeps the look when the welcome is saved, and saves pageLook through cleanLook", /\.\.\.keptSafety\(c\.onboarding\), \.\.\.keptLook\(c\.onboarding\)/.test(server) && /withPageLook\(patch\.onboarding \?\? c\.onboarding, cleanLook\(b\.pageLook\)\)/.test(server))
  for (const hex of ["#ffd400", "#7fd1ff", "#1f7a5c", "#ff5a5f"]) {
    const b = buttonBrand(hex)
    check(`a logo colour ${hex} is darkened until white reads on it at 4.5:1`, !!b && contrast(b, "#ffffff") >= 4.5, b)
  }
  check("a grey logo gives no brand colour", buttonBrand("#8a8a8a") === null && buttonBrand(null) === null)
  const px = (r: number, g: number, b: number, a = 255, n = 1) => Array.from({ length: n }, () => [r, g, b, a]).flat()
  const logo = [...px(255, 255, 255, 255, 50), ...px(0, 0, 0, 0, 30), ...px(31, 122, 92, 255, 12), ...px(200, 40, 40, 255, 4)]
  check("the logo's colour is its commonest saturated one, white, black and see through left out", dominantColour(logo) === "#1f7a5c", dominantColour(logo))
  check("a logo of greys has none", dominantColour(px(128, 128, 128, 255, 20)) === null)
  check("the page's button: the brand style falls back to ink without a usable colour", joinLookOf(cleanLook({ joinStyle: "brand", brand: "#888888" })).style === "ink" && joinLookOf(l).brand !== null)
}

console.log("\nROW: the facts under the name")
{
  const c = { visibility: "public" as const, options: [] }
  const row = aboutRow(c, { members: 1284, online: 12, admins: 3 }, { kind: "free", priceLine: "Free" })
  /* Changed on purpose (round 26, the owner): the admins moved from this row to the info card. */
  check("who it is for, members, online, the price; no admins", row.map((f) => `${f.value}${f.word ? ` ${f.word}` : ""}`).join(" | ") === "Public | 1,284 members | 12 online | Free", row)
  const quiet = aboutRow({ visibility: "private", options: [] }, { members: 1, online: 0, admins: null }, null)
  check("online and admins only when known and above zero; one member", quiet.map((f) => f.key).join() === "visibility,members,price" && quiet[1].word === "member")
  const paid = aboutRow(c, { members: 9, online: null, admins: 1 }, { kind: "paid", priceLine: "$19/month" })
  check("a paid tier's price", paid.find((f) => f.key === "price")?.value === "$19/month" && !paid.some((f) => (f.key as string) === "admins"))
}

console.log("\nDRAFT: the preview and Save")
{
  const start: PageDraft = { name: "Clay", tagline: "Pots", descriptionHtml: "<p>Hi</p>", logoUrl: null, coverUrl: "/c.jpg", gallery: [], benefits: ["A"], faq: [], links: [], look: DEFAULT_LOOK, summary: "", memberLinks: [], seoTitle: "", seoDescription: "", discoveryEnabled: true, legal: { privacy: "", terms: "" } }
  check("nothing changed sends nothing", Object.keys(changedBody(start, { ...start })).length === 0)
  const now: PageDraft = { ...start, name: "Clay Club", descriptionHtml: "<p><br></p>", look: { ...DEFAULT_LOOK, coverY: 20 }, links: [{ label: "Instagram", url: "https://www.instagram.com/clay" }] }
  const body = changedBody(start, now)
  check("Save sends what changed: the name, an emptied description as empty, the links, the look", Object.keys(body).sort().join() === "descriptionHtml,links,name,pageLook" && body.descriptionHtml === "" && (body.pageLook as { coverY: number }).coverY === 20, body)
  check("the gallery is the creator's list, else the cover picture alone, a video once it can play", galleryViews([], "/c.jpg", {}).length === 1 && galleryViews([{ type: "video", videoId: "v" }], null, { v: { status: "processing", thumbnailUrl: null, durationSeconds: null } }).length === 0 && galleryViews([{ type: "image", url: "/a.jpg" }], "/c.jpg", {}).length === 1)
  const base = { community: { name: "Clay", tagline: "Pots", descriptionHtml: "<p>Hi</p>", descriptionText: null, benefits: [], faq: [], gallery: [], links: [], logoUrl: null, coverUrl: null }, join: {}, notice: null } as never
  const shown = previewData(base, now, {})
  check("the preview is the page with the draft on it", shown.community.name === "Clay Club" && shown.community.descriptionHtml === null && shown.community.links?.[0]?.network === "instagram" && shown.community.coverPosition === "50% 20%")
}

console.log("\nSOURCE: the route, the description, Membership, the signed out menu")
{
  check("/app/community/<slug>/page is the Page section", adminSectionOf("/app/community/clay/page") === "page" && adminSectionOf("/app/community/clay/settings") === "settings")
  const route = code("app/app/community/[id]/page/page.tsx")
  check("the route gates on manage_settings and hands its section to the shell", /sectionPage\(id, "manage_settings"\)/.test(route) && /<SectionSeed id="page">/.test(route) && /<SectionFrame id="page" \/>/.test(route))
  const panels = code("components/community/creator/page-editor/panels.tsx")
  check("the description is the product editor's rich text field, with pictures and its size check", /<RichTextEditor/.test(panels) && /uploadImage=\{\(file\) => uploadDescriptionImage\(file,/.test(panels) && /checkSize=\{descriptionTooLong\}/.test(panels))
  const server = code("lib/communities/server/creator.ts")
  check("the server cleans it with the product description's sanitizer, refused over the same size", /if \(b\.descriptionHtml !== undefined\)/.test(server) && /descriptionTooLong\(html\)/.test(server) && /sanitizeDescription\(html\)/.test(server))
  const sales = code("components/community/public/sales-page.tsx")
  check("the About page draws sanitized HTML, and older plain text as text", /dangerouslySetInnerHTML=\{\{ __html: c\.descriptionHtml \}\}/.test(sales) && /whitespace-pre-wrap[^"]*" data-community-description=""/.test(sales) && /looksLikeHtml\(raw\) \? sanitizeDescription\(raw\)/.test(code("lib/communities/server/public.ts")))
  /* Changed on purpose (round 26, the owner): no Membership section at all, and the icons are drawn in the info card (and with who runs it below 1280px). */
  check("no Membership section", !/data-community-membership/.test(sales) && !/<PricingCard /.test(sales))
  check("the links are drawn as icons on the About page", /<SocialLinks links=\{links\} size=/.test(sales) && /links: socialLinksOf\(community\.links\)/.test(code("lib/communities/server/public.ts")))
  const join = code("components/community/public/join-controls.tsx")
  check("the creator's words and style only on a button that joins, asks or pays; the questions before joining untouched", /return kind === "join_free" \|\| kind === "request" \|\| kind === "checkout"/.test(join) && /if \(asked\.length\) \{/.test(join) && /<JoinQuestionFields/.test(join))
  const guest = navigatorModel({ signedIn: false, communitiesOn: true, recent: [] } as never).actions
  check("signed out, the menu offers Log in and Sign up", guest.map((a) => `${a.label}:${a.href}`).join() === "Log in:/login,Sign up:/signup" && !guest.some((a) => /Start creating/.test(a.label)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
