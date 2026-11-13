/**
 * ===========================================================================
 *  ONE ONEPAGE, THROUGH THE PREVIEW AND THROUGH THE LIVE PAGE (round 10 audit)
 * ===========================================================================
 * The editor's preview and the published page draw with the same component
 * (components/onepage/preview-document.tsx frames public-onepage.tsx). What
 * can still differ is what each hands it. This takes one page, edits it the
 * way the editor does, saves it the way app/api/onepage and
 * app/api/onepage/publish store it, and compares what the preview would be
 * handed (the draft) with what the live route would be handed (the published
 * copy): every field the page draws must be the same.
 *
 * And it pins each bug the round 10 audit found in the preview, the live page
 * and the editor's data layer (scripts/check-onepage-audit.mjs drives the real
 * editor through the same cases in a browser):
 *
 *   social row      drawn from the social links on both sides, so an edited
 *                   handle is the address the live page opens, and the
 *                   preview no longer shows one set of icons on Links and
 *                   another on Design
 *   link address    "example.com/shop" opens https://example.com/shop, not
 *                   storelib.me/example.com/shop
 *   currency        the preview's prices are in the store's currency, as the
 *                   live route's are (PriceCurrency)
 *   unsaved on open bringing a social row in line is no edit
 *   archive + undo  the archive is in the history, so undoing an archive does
 *                   not leave the block on the page and in the archive
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { drawnBlocks, linkHref, publicOnePage, publicOnePageFromDraft, type OnePageRowLike } from "@/lib/onepage/public-shape"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

const NOW = Date.parse("2026-10-24T12:00:00.000Z")
let order = 0
const b = (id: string, type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id, type, enabled: true, sort_order: order++, data, ...extra })

const BLOCKS = [
  b("header", "header", { show_avatar: true, show_name: true, show_bio: true }),
  b("link", "link_button", { label: "Shop", url: "https://example.com/shop" }),
  b("bare", "link_button", { label: "Journal", url: "example.com/journal" }),
  b("www", "link_button", { label: "Blog", url: "www.example.com" }),
  b("hidden", "link_button", { label: "Hidden", url: "https://example.com/h" }, { enabled: false }),
  b("later", "link_button", { label: "Later", url: "https://example.com/l" }, { schedule: { start_at: "2999-01-01T00:00:00.000Z" } }),
  b("over", "link_button", { label: "Over", url: "https://example.com/o" }, { schedule: { end_at: "2020-01-01T00:00:00.000Z" } }),
  b("social", "social_row", { style: "icons", platforms: [{ platform: "youtube", url: "https://youtube.com/@old" }, { platform: "instagram", url: "https://instagram.com/old" }] }),
  b("group", "group", { title: "More", layout: "stack", children: [{ id: "child", type: "link_button", enabled: true, sort_order: 0, data: { label: "Child", url: "example.org" } }] }),
]

/** The row as the editor holds it after it was opened. */
const ROW: OnePageRowLike = {
  id: "op-1",
  slug: "satori",
  title: "Satori",
  bio: "Prints",
  avatar_url: "https://cdn.example/me.png",
  theme: { background_color: "#ffffff", font_family: "Inter" },
  settings: { show_branding: true, subscribe_enabled: true, verified_badge_enabled: true },
  social_links: { instagram: "https://instagram.com/new", tiktok: "https://tiktok.com/@satori", youtube: null },
  draft_blocks: BLOCKS,
  seller_id: "seller-1",
  creator_id: "seller-1",
}

/** What app/api/onepage PUT and app/api/onepage/publish store from a save of `page` (context.tsx runSave). */
function saved(page: OnePageRowLike, profilePhoto: string | null): OnePageRowLike {
  return {
    ...page,
    avatar_url: profilePhoto,
    published_blocks: clone(page.draft_blocks),
    published_theme: clone(page.theme),
    published_profile: { title: page.title || "", bio: page.bio || "", avatar_url: profilePhoto, avatar_video_url: page.avatar_video_url || null, avatar_video_crop: null },
    published_social_links: clone(page.social_links || {}),
  }
}

const DRAWN = ["title", "bio", "slug", "avatar_url", "avatar_video_url", "theme", "blocks", "social_links", "settings", "seller_id"] as const

function main() {
  console.log("\n  the same page through the preview and through the live route")
  {
    const owner = { displayName: "Owner Name", liveAvatarUrl: "https://cdn.example/me.png" }
    const preview = publicOnePageFromDraft(ROW, { ...owner, now: NOW })
    const live = publicOnePage(saved(ROW, "https://cdn.example/me.png"), { source: "published", ...owner, now: NOW })
    for (const k of DRAWN) check(`${k}: the same on both`, JSON.stringify(preview[k]) === JSON.stringify(live[k]), { preview: preview[k], live: live[k] })

    const ids = preview.blocks.map((x: any) => x.id).join(",")
    /* Changed on purpose (OnePage production audit, P-F3): a switched off block is not sent to either side; neither drew it. */
    check("a block outside its schedule is on neither", ids === "header,link,bare,www,social,group", ids)

    /* A page edited after its last save: the preview shows the edit, the live page what was saved, until Save. */
    const edited = { ...saved(ROW, "https://cdn.example/me.png"), title: "New name", draft_blocks: [...BLOCKS].reverse() }
    const p2 = publicOnePageFromDraft(edited, { ...owner, now: NOW })
    const l2 = publicOnePage(edited, { source: "published", ...owner, now: NOW })
    check("an unsaved edit is in the preview only", p2.title === "New name" && l2.title === "Satori")
    const l3 = publicOnePage(saved(edited, "https://cdn.example/me.png"), { source: "published", ...owner, now: NOW })
    check("and on the live page once saved", JSON.stringify(p2.blocks) === JSON.stringify(l3.blocks) && l3.title === "New name")

    /* A cleared bio and title: neither side falls back to an old copy. */
    const cleared = saved({ ...ROW, bio: "", title: "" }, null)
    const pc = publicOnePageFromDraft({ ...ROW, bio: "", title: "" }, { ...owner, now: NOW })
    const lc = publicOnePage(cleared, { source: "published", ...owner, now: NOW })
    check("a cleared bio is cleared on both", pc.bio === "" && lc.bio === "", { preview: pc.bio, live: lc.bio })
    check("a cleared title falls back to the owner's name on both", pc.title === lc.title, { preview: pc.title, live: lc.title })
  }

  console.log("\n  the social row is drawn from the social links")
  {
    const social = publicOnePageFromDraft(ROW, { now: NOW }).blocks.find((x: any) => x.id === "social") as any
    const platforms = social.data.platforms.map((p: any) => `${p.platform}=${p.url}`).join(" ")
    check("its own order kept, a removed link gone, an edited address taken, a new link last", platforms === "instagram=https://instagram.com/new tiktok=https://tiktok.com/@satori", platforms)
    const live = publicOnePage(saved(ROW, null), { source: "published", now: NOW }).blocks.find((x: any) => x.id === "social") as any
    check("the live page opens the edited address too", live.data.platforms[0].url === "https://instagram.com/new")
    check("the row in the editor's page is not changed in place", (BLOCKS[7].data as any).platforms[0].platform === "youtube")
    const old = drawnBlocks([BLOCKS[7]], {}, NOW)
    check("a page with no social links at all keeps its row as saved", old[0] === BLOCKS[7])
    const none = drawnBlocks([BLOCKS[7]], { instagram: null, youtube: "" }, NOW)
    check("and so does one whose links are all empty", none[0] === BLOCKS[7])
    const same = drawnBlocks([BLOCKS[0]], {}, NOW)
    check("a block that needs nothing is handed on as it is", same[0] === BLOCKS[0])
  }

  console.log("\n  a link address typed without https opens")
  {
    const blocks = publicOnePageFromDraft(ROW, { now: NOW }).blocks as any[]
    const url = (id: string) => blocks.find((x) => x.id === id)?.data.url
    check("example.com/journal opens https://example.com/journal", url("bare") === "https://example.com/journal", url("bare"))
    check("www.example.com opens https://www.example.com", url("www") === "https://www.example.com", url("www"))
    check("inside a group too", blocks.find((x) => x.id === "group").data.children[0].data.url === "https://example.org")
    check("an address with its scheme is left alone", url("link") === "https://example.com/shop")
    for (const [raw, want] of [
      ["mailto:hi@example.com", "mailto:hi@example.com"],
      ["tel:+40123", "tel:+40123"],
      ["/satori/links", "/satori/links"],
      ["#top", "#top"],
      ["https://", "https://"],
      ["", ""],
      ["hello", "hello"],
      [" example.com ", "https://example.com"],
    ] as const) check(`${JSON.stringify(raw)} -> ${JSON.stringify(want)}`, linkHref(raw) === want, linkHref(raw))
  }

  console.log("\n  the preview's prices are in the store's currency, as the live page's are")
  {
    const live = strip(read("app/(storelib)/(marketing)/l/[slug]/page.tsx"))
    check("the live route draws the page in the store's currency", /<PriceCurrency currency=\{[^}]*cachedStoreCurrency/.test(live))
    const frame = strip(read("components/onepage/live-preview.tsx"))
    check("the editor sends the store's currency with the page", /useStoreCurrencyIfSet\(\)/.test(frame) && /kind: "page", page: latest\.current, currency: latestCurrency\.current/.test(frame))
    check("and sends again when it changes", /\}, \[page, currency, send\]\)/.test(frame))
    const doc = strip(read("components/onepage/preview-document.tsx"))
    check("the frame draws the page inside PriceCurrency", /<PriceCurrency currency=\{currency\}>\s*<PublicOnePage/.test(doc))
    check("with the currency from the message", /setCurrency\(data\.currency \?\? null\)/.test(doc))
  }

  console.log("\n  opening the editor is not an edit")
  {
    const links = strip(read("components/onepage/tabs/links-tab.tsx"))
    const sync = links.slice(links.indexOf("const activeSocials = Object.entries(social_links || {})"), links.indexOf("}, [social_links, draft_blocks])"))
    check("the social row is brought in line silently", /\}, \{ silent: true \}\)/.test(sync), sync.slice(-200))
  }

  console.log("\n  undoing an archive takes the block out of the archive")
  {
    const ctx = strip(read("lib/onepage/context.tsx"))
    const archive = ctx.slice(ctx.indexOf("const archiveBlock = useCallback"), ctx.indexOf("const unarchiveBlock = useCallback"))
    const unarchive = ctx.slice(ctx.indexOf("const unarchiveBlock = useCallback"), ctx.indexOf("const reorderBlocks = useCallback"))
    const restore = ctx.slice(ctx.indexOf("const restore = useCallback"), ctx.indexOf("const undo = useCallback"))
    check("archiving records the archive in the history step", /archived_blocks: archived \}/.test(archive))
    check("restoring records it too", /archived_blocks: archived \}/.test(unarchive))
    check("undo and redo put the step's archive back", /putArchive\(Array\.isArray\(archived\) \? archived : \[\]\)/.test(restore))
  }

  console.log("\n  undoing every edit since the last save is the saved page")
  {
    const ctx = strip(read("lib/onepage/context.tsx"))
    const restore = ctx.slice(ctx.indexOf("const restore = useCallback"), ctx.indexOf("const undo = useCallback"))
    check("undo or redo onto the page as saved marks it clean", /!looseEditRef\.current && !savingRef\.current && savedFieldsRef\.current !== null && savedFields\(restored\) === savedFieldsRef\.current/.test(restore) && /setIsDirty\(false\)/.test(restore))
    check("never while a save is on its way", /savingRef\.current = true[\s\S]{0,80}return await runSave\(\)[\s\S]{0,60}savingRef\.current = false/.test(ctx))
    check("anything else marks it unsaved", /else \{\s*markDirty\(\)/.test(restore))
    check("a save records the page it sent as the saved one", /savedFieldsRef\.current = savedFields\(snapshot\)/.test(ctx))
    check("a fill nobody typed on a clean page is part of the saved page", /else if \(editRevisionRef\.current === savedRevisionRef\.current\) savedFieldsRef\.current = savedFields\(next\)/.test(ctx))
    check("a field that keeps its own text until Save keeps the page unsaved through undo", /markDirty: markLooseDirty/.test(ctx) && /looseEditRef\.current = true/.test(ctx))
    check("the saved fields include the blocks, the theme, the settings and the archive", /savedFields\(page: OnePage\)[\s\S]{0,400}p\.theme, p\.settings, p\.social_links, p\.draft_blocks, p\.archived_blocks/.test(ctx))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
