/**
 * ROUND 27 (E27): the community Page editor at every width, its outlines, the creator's own legal links, the About
 * card's icons and Share, and the community header between the feed and Learn.
 *
 *   GEOMETRY  the page laid out at the pane's width from 1280 (never scaled under 1280 of page), a phone edge to edge at
 *             its own width in a narrow pane, a phone card with room around it; while the pane changes size the page
 *             keeps its width (no layout) and only its scale follows
 *   MODE      side or drawer by the editor's own width (a 1440 window at 150% and 200% zoom keeps the panel beside the
 *             page), with slack at the line; the panel's width kept between 300 and 560 and what leaves the page 340
 *   DRAWER    three resting places, the head at the foot, half, nearly all
 *   LEGAL     a creator's Privacy and Terms addresses checked one way everywhere, stored beside the page look, kept by
 *             the welcome's save, saved and read back through the real settings save, refused when they are not a web
 *             page, drawn instead of Storelib's on the About page (Storelib's where none)
 *   SOURCE    the editor (pointer events and a stored width for the panel, the drawer's own gestures, nothing modal), the
 *             outlines (inset lines on the screen's pixels, the part's own corners, no pill), the About card (icons under
 *             the button, a quieter Share on a cover), the community header (see the I5 notes)
 *
 * scripts/check-page-editor27.mjs measures the editor in a browser (layout at seven sizes, drags and their frame rates,
 * the drawer by touch, the outlines to the device pixel, the legal links).
 */
import { readCode } from "./_source"
import { fakeDb } from "./_fake-db"
import { LEGAL_URL_MAX, STORELIB_PRIVACY_URL, STORELIB_TERMS_URL, cleanLegalLinks, keptLegal, legalLinksOf, legalLinksShown, legalUrl, withLegalLinks } from "@/lib/communities/legal-links"
import { DESKTOP_MIN, PANEL_MAX, PANEL_MIN, SIDE_MIN, drawerOffsets, frameGeometry, liveGeometry, modeFor, panelWidthFor } from "@/components/community/creator/page-editor/layout"
import { DEFAULT_LOOK } from "@/lib/communities/page-look"
import { loadSettings, updateSettings, type CreatorPageContext } from "@/lib/communities/server/creator"
import type { CommunityRow } from "@/lib/communities/types"
import { GROUP_BLOCKS, changedBody, draftOf, draftProblems, groupOf, previewData, type PageDraft } from "@/components/community/creator/page-editor/draft"

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
const url = (v: unknown) => {
  const r = legalUrl(v)
  return "problem" in r ? `!${r.problem}` : r.url
}

async function main() {
  console.log("\nGEOMETRY: how wide the page is laid out, and its scale")
  {
    const g1440 = frameGeometry("desktop", 760, 678)
    check("a computer pane narrower than 1280 shows the 1280 page scaled to fit (0.59 in a 1440 window, was 0.51)", g1440.w === DESKTOP_MIN && Math.abs(g1440.scale - 760 / 1280) < 1e-9 && g1440.boxW === 760 && g1440.h >= Math.ceil(678 / g1440.scale), g1440)
    const wide = frameGeometry("desktop", 1500, 800)
    check("a pane of 1280 or more is the page at its own size, nothing scaled", wide.w === 1500 && wide.scale === 1 && wide.h === 800, wide)
    const bare = frameGeometry("phone", 366, 430)
    check("a pane as narrow as a phone: the page edge to edge at the pane's own width, never scaled", bare.w === 366 && bare.scale === 1 && !bare.card && bare.boxW === 366, bare)
    const tiny = frameGeometry("phone", 300, 400)
    check("under 320 the 320 page is scaled, never laid out narrower than a phone", tiny.w === 320 && Math.abs(tiny.scale - 300 / 320) < 1e-9, tiny)
    const card = frameGeometry("phone", 760, 678)
    check("a phone card in a wide pane: 390 wide, centred on whole pixels, as tall as the pane allows", card.card && card.w === 390 && card.scale === 1 && card.left === Math.round((760 - 390) / 2) && Number.isInteger(card.boxW) && Number.isInteger(card.boxH), card)
    const live = liveGeometry("desktop", 660, 678, { w: 1280, h: 1146 })
    check("while the pane changes size the page keeps the width it was laid out at; only the scale follows", live.w === 1280 && Math.abs(live.scale - 660 / 1280) < 1e-9 && live.h >= Math.ceil(678 / live.scale), live)
    const grow = liveGeometry("desktop", 700, 678, { w: 1280, h: 5000 })
    check("its height only grows while it moves (no layout each frame)", grow.h === 5000)
  }

  console.log("\nMODE: side or drawer, by the editor's own width; the panel's width")
  {
    check("a 1440 window (editor 1136) and 1280 (976) and 1024 (720): the panel beside the page", ["side", "side", "side"].join() === [modeFor(1136, null), modeFor(976, null), modeFor(720, null)].join())
    check("a 1440 window at 150% (960 of CSS, editor 672) and at 200% (720, editor 672): still beside the page", modeFor(672, null) === "side")
    check("a tablet upright beside the rail (editor 532) and a phone (368): the drawer", modeFor(532, null) === "drawer" && modeFor(368, null) === "drawer")
    check("near the line it stays what it was (a scrollbar coming and going does not flip it)", modeFor(SIDE_MIN - 2, "side") === "side" && modeFor(SIDE_MIN + 2, "drawer") === "drawer" && modeFor(SIDE_MIN + 20, "drawer") === "side")
    check("the panel's width is kept between 300 and 560", panelWidthFor(1136, 900) === PANEL_MAX && panelWidthFor(1136, 100) === PANEL_MIN && panelWidthFor(1136, 420) === 420)
    check("and never leaves the page under 340 beside it", panelWidthFor(720, 560) === 720 - 340 - 16 && panelWidthFor(672, 560) === 316)
  }

  console.log("\nDRAWER: its three resting places")
  {
    const o = drawerOffsets(692, 76)
    check("nearly all at 0, half at half its height, the head alone at the foot", o.full === 0 && o.half === 692 - 346 && o.peek === 692 - 76, o)
    const small = drawerOffsets(300, 76)
    check("on a short screen half still shows the head and some fields", 300 - small.half >= 76 + 120 && small.peek === 224, small)
  }

  console.log("\nLEGAL: the creator's own Privacy and Terms")
  {
    check("https kept as the browser reads it", url("https://MySite.com/Privacy?x=1") === "https://mysite.com/Privacy?x=1")
    check("a bare address is read as https", url("mysite.com/privacy") === "https://mysite.com/privacy" && url("//mysite.com/terms") === "https://mysite.com/terms")
    check("http is kept", url("http://mysite.com/terms") === "http://mysite.com/terms")
    check("empty is none (Storelib's stand)", url("") === null && url("   ") === null && url(null) === null && url(undefined) === null)
    check("javascript:, data:, mailto:, file: and ftp: are refused", ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "mailto:a@b.co", "file:///etc/passwd", "ftp://x.com/a"].every((v) => url(v) === "!address"))
    check("a user and password, a space, a host with no dot, a private host are refused", ["https://u:p@mysite.com/a", "https://my site.com", "https://localhost/privacy", "http://192.168.1.4/a", "http://10.0.0.1/a", "https://printer.local/x", "https://[::1]/x"].every((v) => url(v) === "!address"))
    check("not a string is refused", url(42) === "!address" && url({}) === "!address")
    check(`over ${LEGAL_URL_MAX} characters is refused as too long`, url(`https://mysite.com/${"a".repeat(LEGAL_URL_MAX)}`) === "!long")
    check("a stored value that does not pass reads as none", cleanLegalLinks({ privacy: "javascript:x", terms: "mysite.com/t" }).privacy === null && cleanLegalLinks({ terms: "mysite.com/t" }).terms === "https://mysite.com/t" && cleanLegalLinks("x").privacy === null)
    const ob = { welcome: "Hi", page: { coverX: 10 }, safety: { slowMode: 30 } }
    const withLinks = withLegalLinks(ob, { privacy: "https://a.com/p", terms: null })
    check("stored beside the page look, everything else in onboarding kept", (withLinks.legal as { privacy: string }).privacy === "https://a.com/p" && withLinks.welcome === "Hi" && (withLinks.page as { coverX: number }).coverX === 10 && !!withLinks.safety)
    check("none at all is stored as nothing", !("legal" in withLegalLinks(withLinks, { privacy: null, terms: null })))
    check("the welcome's save keeps them", keptLegal(withLinks).legal?.privacy === "https://a.com/p" && Object.keys(keptLegal({})).length === 0)
    const shown = legalLinksShown({ privacy: null, terms: "https://a.com/t" })
    check("the page links the creator's own where set, Storelib's where not, each on its own", shown[0].href === STORELIB_PRIVACY_URL && !shown[0].own && shown[1].href === "https://a.com/t" && shown[1].own && legalLinksShown(null).map((l) => l.href).join() === `${STORELIB_PRIVACY_URL},${STORELIB_TERMS_URL}`)

    check("in the editor: the Links group, after the member links", groupOf("legal") === "links" && GROUP_BLOCKS.links.join() === "links,memberLinks,legal")
    const start: PageDraft = { name: "Clay", tagline: "", descriptionHtml: "<p>Hi</p>", logoUrl: null, coverUrl: null, gallery: [], benefits: [], faq: [], links: [], look: DEFAULT_LOOK, summary: "", memberLinks: [], seoTitle: "", seoDescription: "", discoveryEnabled: true, legal: { privacy: "", terms: "" } }
    const body = changedBody(start, { ...start, legal: { privacy: " clay.com/privacy ", terms: "" } })
    check("Save sends both, as stored (https added, null for Storelib's)", JSON.stringify(body) === JSON.stringify({ legalLinks: { privacy: "https://clay.com/privacy", terms: null } }), body)
    check("spaces around an address are no change", Object.keys(changedBody({ ...start, legal: { privacy: "https://a.com/p", terms: "" } }, { ...start, legal: { privacy: " https://a.com/p ", terms: "" } })).length === 0)
    const problems = draftProblems({ ...start, legal: { privacy: "javascript:alert(1)", terms: "ok.com" } }, { paid: false })
    check("Save waits for an address that is not a web page, naming which", problems.length === 1 && problems[0].block === "legal" && (problems[0] as { kind: string }).kind === "privacy", problems)
    const base = { community: { name: "Clay", tagline: null, descriptionHtml: null, descriptionText: null, benefits: [], faq: [], gallery: [], links: [], logoUrl: null, coverUrl: null }, join: {}, notice: null } as never
    const prev = previewData(base, { ...start, legal: { privacy: "clay.com/p", terms: "nope" } }, {}) as unknown as { community: { legal: { privacy: string | null; terms: string | null } } }
    check("the preview links what passes, Storelib's for what does not yet", prev.community.legal.privacy === "https://clay.com/p" && prev.community.legal.terms === null)

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co"
    const row = {
      id: "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a", creator_id: "c1", owner_user_id: "u1", slug: "clay", name: "Clay", tagline: "Pots", description: "<p>Hello</p>", logo_url: null, cover_url: null, cover_video_id: null, visibility: "public", access: "free", status: "published", category: null, language: "en", member_count: 3, post_count: 0, discovery_enabled: true, approval_required: false, default_role: "member", directory_enabled: true, classroom_enabled: true, events_enabled: true, chat_enabled: true, gamification_enabled: false, rules: [], faq: [], benefits: [], links: [], onboarding: { page: { coverX: 30, coverY: 50, joinLabel: "Get access", joinStyle: "ink", joinNote: "", brand: null } }, seo_title: null, seo_description: null, trending_score: 0, trending_at: null, platform_hidden: false, suspended_at: null, suspended_reason: null, archived_at: null, deleted_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      gallery: [], summary: null, member_links: [],
    }
    const db = fakeDb({ communities: [row] })
    const ctx = (community: unknown) => ({ userId: "u1", creatorId: "c1", creatorName: "Ana", community: community as CommunityRow, viewer: {} as never, role: "owner" as const, db: db as never, paymentsReady: true }) as CreatorPageContext
    const save = (body: Record<string, unknown>, role: "owner" | "moderator" = "owner") => updateSettings(db as never, { community: row as unknown as CommunityRow, role, actorId: "u1", creatorId: "c1", body })
    const before = draftOf({ name: row.name, logoUrl: null, coverUrl: null }, await loadSettings(ctx(row)))
    check("before: none, the editor's fields empty", before.legal.privacy === "" && before.legal.terms === "")
    const saved = await save(changedBody(before, { ...before, legal: { privacy: "clay.com/privacy", terms: "https://clay.com/terms" } }))
    check("the settings save takes them", saved.ok, saved)
    const stored = (row.onboarding as Record<string, unknown>).legal as { privacy: string; terms: string } | undefined
    check("stored in onboarding.legal, the page look beside them untouched", stored?.privacy === "https://clay.com/privacy" && stored?.terms === "https://clay.com/terms" && ((row.onboarding as Record<string, unknown>).page as { joinLabel: string }).joinLabel === "Get access", row.onboarding)
    const again = draftOf({ name: row.name, logoUrl: null, coverUrl: null }, await loadSettings(ctx(row)))
    check("read back, the editor starts from exactly what was saved", again.legal.privacy === "https://clay.com/privacy" && again.legal.terms === "https://clay.com/terms")
    const welcome = await save({ onboarding: { enabled: true, welcome: "Hello, clay people" } })
    check("saving the welcome steps keeps them", welcome.ok && legalLinksOf(row.onboarding).terms === "https://clay.com/terms", row.onboarding)
    const one = await save({ legalLinks: { terms: "" } })
    check("one emptied, the other kept", one.ok && legalLinksOf(row.onboarding).terms === null && legalLinksOf(row.onboarding).privacy === "https://clay.com/privacy")
    const bad = await save({ legalLinks: { privacy: "javascript:alert(1)" } }) as { ok: boolean; field?: string }
    check("an address that is not a web page is refused by the save itself, naming the field", !bad.ok && bad.field === "legalLinks.privacy" && legalLinksOf(row.onboarding).privacy === "https://clay.com/privacy", bad)
    const mod = await save({ legalLinks: { privacy: "" } }, "moderator") as { ok: boolean; status?: number }
    check("a moderator cannot change them", !mod.ok && mod.status === 403)
    const pub = code("lib/communities/server/public.ts")
    check("the public page reads them from the community's settings", /legal: legalLinksOf\(community\.onboarding\)/.test(pub))
  }

  console.log("\nSOURCE: the editor")
  {
    const editor = code("components/community/creator/page-editor/page-editor.tsx")
    check("no modal sheet, no bar at the foot: the docked drawer", !/BottomSheet/.test(editor) && !/data-page-phone-bar/.test(editor) && /<EditorDrawer/.test(editor))
    check("decided by the editor's own width (a ResizeObserver), not the window's", /function useEditorMode/.test(editor) && /new ResizeObserver\(read\)/.test(editor) && !/matchMedia\("\(min-width/.test(editor))
    check("the panel's edge: a separator with pointer capture, one write a frame, the keyboard's arrows, a double press resets", /role="separator"/.test(editor) && /setPointerCapture/.test(editor) && /requestAnimationFrame\(frame\)/.test(editor) && /ArrowLeft/.test(editor) && /onDoubleClick=\{\(\) => resizeTo\(PANEL_DEFAULT, true\)\}/.test(editor))
    check("its width remembered, written to the panel without a render", /localStorage\.setItem\(PANEL_KEY/.test(editor) && /el\.style\.width = `\$\{width\}px`/.test(editor))
    check("the framed page is memoised, so the drawer or the panel moving never draws it again", /const FramedPage = React\.memo\(/.test(editor))
    check("the row of controls follows its own width (container queries) and wraps rather than cut", /@container/.test(editor) && /flex-wrap/.test(editor) && !/xl:max-2xl:hidden/.test(editor))
    const drawer = code("components/community/creator/page-editor/drawer.tsx")
    check("the drawer: pointer events, a translate written on the move, the builder's snap and release, never modal", /addEventListener\("pointermove", move\)/.test(drawer) && /el\.style\.translate = `0 \$\{at\}px`/.test(drawer) && /snapTarget\(/.test(drawer) && /snapMotion\(/.test(drawer) && /releaseVelocity\(/.test(drawer) && !/aria-modal/.test(drawer) && !/scrim/i.test(drawer.replace(/\/\*[\s\S]*?\*\//g, "")))
    check("a finger's tap on the drawer's head is taken on the lift, and a click that still follows is let go", /isTap\(\{ distance: Math\.hypot/.test(drawer) && /pressed\.click\(\)/.test(drawer) && /performance\.now\(\) - took\.at > CLICK_AFTER_MS/.test(drawer))
    check("the drawer stays clear of the navigation pill and the keyboard", /var\(--app-nav-top/.test(drawer) && /var\(--kb-inset/.test(drawer))
    const frame = code("components/community/creator/page-editor/preview-frame.tsx")
    check("while it moves the box is only moved and scaled, on its own layer; at rest laid out again", /b\.style\.willChange = "translate, scale"/.test(frame) && /b\.style\.translate = `\$\{tx\}px 0`/.test(frame) && /b\.style\.scale = String\(k\)/.test(frame) && /window\.setTimeout\(settleNow, SETTLE_MS\)/.test(frame))
    check("outlines: an inset line on the screen's pixels, never a border Chromium rounds", /boxShadow: `inset 0 0 0 \$\{lw\}px/.test(frame) && /const unit = 1 \/ \(scale \* dpr\)/.test(frame) && !/border: `\$\{lw\}px solid/.test(frame))
    check("outlines: the part's own corners, never a pill, the part's own box with no padding but a two pixel gap", /const radius = s\.r > 0 \? s\.r \+ gap \+ lw : px\(2\)/.test(frame) && !/999px/.test(frame) && !/const pad = px\(4\)/.test(frame))
    check("outlines of parts in the page's flow scroll with it, under its own bars; those in bars are measured against the screen", /data-preview-hotspots=""[^>]*zIndex: 35/.test(frame) && /data-preview-hotspots-pinned/.test(frame) && /function pinnedIn/.test(frame))
    check("as a visitor still nothing leaves the page and no outlines are drawn", /const NEVER_ACTS = 'a\[href\], \[data-page-block="join"\]/.test(frame) && /\{visitor \? null : <Hotspots doc=\{doc\} \/>\}/.test(frame))
  }

  console.log("\nSOURCE: the About card")
  {
    const controls = code("components/community/public/join-controls.tsx")
    const card = controls.slice(controls.indexOf("export function JoinCard"), controls.indexOf("export function PricingCard"))
    check("the icons sit under the button (Join or Open community) and its note, not above the price", card.indexOf("<PrimaryAction") > 0 && card.indexOf("data-join-card-links") > card.indexOf("<PrimaryAction") && card.indexOf("data-join-card-links") < card.indexOf("data-join-card-facts") && !/\{links \? <div className="mt-3\.5">\{links\}<\/div> : null\}/.test(card))
    const share = code("components/community/public/share-community.tsx")
    check("Share on a cover is quieter: 28px, see through until pointed at, a lighter icon", /onCover/.test(share) && /h-7 w-7 bg-white\/75/.test(share) && /h-\[13px\] w-\[13px\]/.test(share))
    check("the cover's Share is the quiet one on the card, the page's gallery and the member card", /onCover=\{!!community\.coverUrl\}/.test(controls) && /<CommunityShareButton slug=\{c\.slug\} name=\{c\.name\} onCover \/>/.test(code("components/community/public/sales-page.tsx")) && /onCover=\{!!community\.coverUrl\}/.test(code("components/community/member/wall.tsx")))
    check("the legal links are the creator's where set", /legalLinksShown\(c\.legal\)/.test(code("components/community/public/sales-page.tsx")))
  }

  console.log("\nSOURCE: the community's header between the feed and Learn (I5)")
  {
    const frame = code("components/community/member/shell-frame.tsx")
    check("the scrollbar's room is kept at every width, not only from 1024px (a zoomed window lost and found it on each switch)", /const GUTTER = "html\{scrollbar-gutter:stable\}html\{overscroll-behavior-y:none\}"/.test(frame) && !/@media \(min-width:1024px\)\{html\{scrollbar-gutter/.test(frame))
    const fade = code("components/community/member/place-crossfade.ts")
    check("what was stuck under the bar when the place is copied stays exactly where it stood while the copy fades", /const PIN_ATTR = "data-still-pin"/.test(fade) && /getComputedStyle\(s\)\.position !== "sticky"/.test(fade) && /c\.style\.position = "relative"/.test(fade) && /c\.style\.translate = `\$\{Math\.round\(pin\.left - at\.left\)\}px \$\{Math\.round\(pin\.top - at\.top\)\}px`/.test(fade))
    check("the originals are never left marked", /finally \{\s*for \(const s of marked\) s\.removeAttribute\(PIN_ATTR\)/.test(fade))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
