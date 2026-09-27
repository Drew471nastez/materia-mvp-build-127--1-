/**
 * ===========================================================================
 *  THE EDITOR'S PREVIEW SHOWS THE BLOCKS THE LIVE ONEPAGE SHOWS
 * ===========================================================================
 * The owner's rule: what the OnePage editor's preview shows is exactly what
 * the live OnePage shows. The preview is the live page's own component in a
 * frame (components/onepage/preview-document.tsx), so the drawing cannot
 * differ. What can differ is WHICH BLOCKS each side hands that component:
 *
 *   live      app/(marketing)/l/[slug]/page.tsx: the published shape
 *             (lib/onepage/public-shape, a block outside its schedule left
 *             out), then every product read from the catalogue
 *             (withLiveProducts: gone, archived or unpublished leaves)
 *   preview   components/onepage/live-preview.tsx builds the draft shape with
 *             the same function, and the frame reads the same catalogue with
 *             the same two functions (answersForBlocks, resolveProductBlocks)
 *
 * WHY THIS EXISTS. scripts/check-onepage-parity.mjs draws one page through
 * both, in every theme, and it broke with "block count preview 26 vs live 29"
 * when the frame started reading products (501052af) and the probe's live
 * side did not. Nobody saw it until the slow browser probe was run by hand.
 * This is the same question without a browser: the same saved page through
 * the live route's steps and the preview's steps, the same block list out,
 * on every push. The steps themselves are pinned to the files that run them,
 * so a filter added to one side only fails here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { publicOnePage, publicOnePageFromDraft, type OnePageRowLike } from "@/lib/onepage/public-shape"
import { answersForBlocks, resolveProductBlocks, withLiveProducts, type ProductsDb } from "@/lib/onepage/live-products"
import { isBlockShown } from "@/lib/onepage/extra-blocks"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const SELLER = "seller-1"
const LONG_AGO = "2020-01-01T00:00:00.000Z"
const LATER = "2999-01-01T00:00:00.000Z"

let order = 0
const b = (id: string, type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id, type, enabled: true, sort_order: order++, data, ...extra })

/** One of every block the editor adds (as scripts/render-onepage-parity.tsx has them), and every way one can be left out. */
const BLOCKS = [
  b("header", "header", { show_avatar: true, show_name: true, show_bio: true }),
  b("link_plain", "link_button", { label: "Shop the prints", url: "https://example.com/shop" }),
  b("link_pro", "link_button", { label: "New collection", url: "https://example.com/new", thumbnail_url: "https://cdn.example/n.png", layout_type: "pro" }),
  b("heading", "heading", { text: "Work with me", size: "medium", alignment: "center" }),
  b("text", "text", { content: "Prints, posters and a letter every other Sunday.", alignment: "center" }),
  b("product_live", "product", { product_id: "p-live", style: "button", cta_text: "Buy now", show_price: true, product_title: "Old title", product_price_cents: 900, product_slug: "old", product_thumbnail: "https://cdn.example/old.png" }),
  b("product_callout", "product", { product_id: "p-live-2", style: "callout", cta_text: "Get it", show_price: true, product_title: "Poster pack", product_price_cents: 4800, product_slug: "poster-pack" }),
  b("product_archived", "product", { product_id: "p-archived", style: "button", cta_text: "Buy", product_title: "Old zine", product_price_cents: 900 }),
  b("product_flag", "product", { product_id: "p-flag", style: "preview", cta_text: "Buy", product_title: "Flagged", product_price_cents: 900 }),
  b("product_draft", "product", { product_id: "p-draft", style: "button", cta_text: "Buy", product_title: "Not yet", product_price_cents: 900 }),
  b("product_deleted", "product", { product_id: "p-deleted", style: "button", cta_text: "Buy", product_title: "Gone", product_price_cents: 900 }),
  b("social_icons", "social_row", { platforms: [{ platform: "instagram", url: "https://instagram.com/satori" }], style: "icons" }),
  b("image_single", "image", { image_url: "https://cdn.example/i.png", images: [{ id: "i1", image_url: "https://cdn.example/i.png" }], display_style: "single" }),
  b("divider", "divider", { style: "line", height: 24 }),
  b("email_default", "email_capture", { headline: "Sunday letter", button_text: "Subscribe" }),
  b("email_archived_gift", "email_capture", { headline: "Free brush", button_text: "Get it", enable_digital_product: true, digital_product_id: "p-archived", digital_product_title: "Brush", digital_product_file_url: "https://cdn.example/b.zip" }),
  b("group_stack", "group", { title: "Favourites", layout: "stack", children: [
    { id: "g_link", type: "link_button", enabled: true, sort_order: 0, data: { label: "Studio tour", url: "https://example.com/tour" } },
    { id: "g_archived", type: "product", enabled: true, sort_order: 1, data: { product_id: "p-archived", cta_text: "Buy" } },
    { id: "g_live", type: "product", enabled: true, sort_order: 2, data: { product_id: "p-live", cta_text: "Buy" } },
  ] }),
  b("pdf", "pdf_document", { title: "Price list", pdf_file_url: "https://example.com/a.pdf", button_text: "View PDF" }),
  b("calendly", "calendly", { title: "Book a call", calendly_url: "https://calendly.com/satori/30", button_text: "Book", embed_mode: "direct_link" }),
  b("faq", "faq", { title: "Questions", items: [{ id: "q1", question: "Do you ship abroad?", answer: "Yes." }] }),
  b("countdown", "countdown", { title: "Drop in", target_at: LONG_AGO, ended_text: "Out now" }),
  b("map", "map", { title: "Studio", address: "Strada Memorandumului 28, Cluj", show_button: true }),
  b("video", "video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Studio film" }),
  b("scheduled_later", "link_button", { label: "Next drop", url: "https://example.com/next" }, { schedule: { start_at: LATER } }),
  b("schedule_over", "link_button", { label: "Last drop", url: "https://example.com/last" }, { schedule: { end_at: LONG_AGO } }),
  b("switched_off", "link_button", { label: "Hidden", url: "https://example.com/hidden" }, { enabled: false }),
]

/** The catalogue as it is now, the seller's own rows only, as both sides read it. */
const CATALOGUE: Record<string, unknown>[] = [
  { id: "p-live", title: "New title", slug: "new", price_cents: 1200, thumbnail_url: "https://cdn.example/new.png", status: "published", archived: false },
  { id: "p-live-2", title: "Poster pack", slug: "poster-pack", price_cents: 4800, thumbnail_url: null, status: "published", archived: false },
  { id: "p-archived", title: "Old zine", slug: "old-zine", price_cents: 900, thumbnail_url: null, status: "archived", archived: true },
  { id: "p-flag", title: "Flagged", slug: "flagged", price_cents: 900, thumbnail_url: null, status: "published", archived: true },
  { id: "p-draft", title: "Not yet", slug: "not-yet", price_cents: 900, thumbnail_url: null, status: "draft", archived: false },
]

/** A database the way both sides call it: products of one seller, by id. It records who was asked for. */
function dbOf(rows: Record<string, unknown>[], broken = false) {
  const asked: string[] = []
  const db: ProductsDb = {
    from: () => ({
      select: () => ({
        eq: (_col: string, creator: string) => ({
          in: async (_c: string, ids: string[]) => {
            asked.push(creator)
            if (broken) return { data: null, error: { message: "down" } }
            return { data: rows.filter((r) => ids.includes(String(r.id))), error: null }
          },
        }),
      }),
    }),
  }
  return { db, asked }
}

/** The saved page: published a moment ago, so the published copy is the draft. */
const row = (over: Partial<OnePageRowLike> = {}): OnePageRowLike => ({
  id: "op-1",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints and posters",
  avatar_url: "https://cdn.example/me.png",
  theme: { background_color: "#ffffff" },
  settings: { show_branding: true },
  social_links: {},
  draft_blocks: BLOCKS,
  published_blocks: JSON.parse(JSON.stringify(BLOCKS)),
  seller_id: SELLER,
  creator_id: SELLER,
  ...over,
})

/** What app/(marketing)/l/[slug]/page.tsx hands PublicOnePage (its steps are pinned below). */
async function livePage(r: OnePageRowLike, db: ProductsDb) {
  const resolvedCreatorId = r.seller_id || r.creator_id || null
  const shape = publicOnePage(r, { source: "published", displayName: null, liveAvatarUrl: null, customDomain: null, sellerId: resolvedCreatorId })
  shape.blocks = await withLiveProducts(db, shape.seller_id ?? "", shape.blocks)
  return shape
}

/** What the editor posts (components/onepage/live-preview.tsx) and the frame hands PublicOnePage (preview-document.tsx). */
async function previewPage(r: OnePageRowLike, db: ProductsDb) {
  const sent = publicOnePageFromDraft(r, { displayName: null, liveAvatarUrl: null })
  const sellerId = sent?.seller_id ?? null
  const answers = sellerId ? await answersForBlocks(db, sellerId, sent.blocks) : new Map()
  return { ...sent, blocks: resolveProductBlocks(sent.blocks, answers) }
}

/** The blocks the page draws, in order: what PublicOnePage keeps (isBlockShown), children included. */
const drawn = (blocks: any[]): unknown[] =>
  blocks
    .filter((x) => isBlockShown(x))
    .sort((x, y) => x.sort_order - y.sort_order)
    .map((x) => ({ id: x.id, data: x.type === "group" ? { ...x.data, children: drawn(x.data.children || []) } : x.data }))
const idsOf = (list: unknown[]) => list.map((x: any) => x.id).join(",")

async function main() {
  console.log("\n  the same saved page, through the live route and through the preview")

  {
    const live = await livePage(row(), dbOf(CATALOGUE).db)
    const preview = await previewPage(row(), dbOf(CATALOGUE).db)
    const a = drawn(live.blocks)
    const p = drawn(preview.blocks)
    check("the same blocks, in the same order", idsOf(a) === idsOf(p), { live: idsOf(a), preview: idsOf(p) })
    check("each with the same data, groups included", JSON.stringify(a) === JSON.stringify(p))
    const WANTED = "header,link_plain,link_pro,heading,text,product_live,product_callout,social_icons,image_single,divider,email_default,email_archived_gift,group_stack,pdf,calendly,faq,countdown,map,video"
    check("and exactly the blocks a visitor should see", idsOf(a) === WANTED, idsOf(a))

    const ids = idsOf(a).split(",")
    check("a live product is on both, drawn from the product row", ids.includes("product_live") && (a.find((x: any) => x.id === "product_live") as any).data.product_title === "New title")
    for (const gone of ["product_archived", "product_flag", "product_draft", "product_deleted"]) {
      check(`${gone.replace("product_", "")} product: on neither`, !ids.includes(gone) && !idsOf(p).split(",").includes(gone))
    }
    const group = a.find((x: any) => x.id === "group_stack") as any
    check("inside a group too", idsOf(group.data.children) === "g_link,g_live")
    const gift = a.find((x: any) => x.id === "email_archived_gift") as any
    check("an email form keeps its place and stops giving the archived file", !!gift && gift.data.enable_digital_product === false)
    for (const out of ["scheduled_later", "schedule_over", "switched_off"]) check(`${out.replace("_", " ")}: on neither`, !ids.includes(out))
  }

  console.log("\n  and in the cases where they could part")

  {
    const liveAsk = dbOf(CATALOGUE)
    const previewAsk = dbOf(CATALOGUE)
    await livePage(row(), liveAsk.db)
    await previewPage(row(), previewAsk.db)
    check("both ask the catalogue as the same seller", liveAsk.asked.join() === SELLER && previewAsk.asked.join() === SELLER, { live: liveAsk.asked, preview: previewAsk.asked })
  }
  {
    const r = row({ seller_id: null, creator_id: SELLER })
    const a = drawn((await livePage(r, dbOf(CATALOGUE).db)).blocks)
    const p = drawn((await previewPage(r, dbOf(CATALOGUE).db)).blocks)
    check("a page that names its seller only as creator_id: still the same list", idsOf(a) === idsOf(p) && !idsOf(a).includes("product_archived"))
  }
  {
    const a = drawn((await livePage(row(), dbOf(CATALOGUE, true).db)).blocks)
    const p = drawn((await previewPage(row(), dbOf(CATALOGUE, true).db)).blocks)
    check("a catalogue that cannot be read: both keep the blocks as saved", idsOf(a) === idsOf(p) && idsOf(a).includes("product_archived"))
  }
  {
    const r = row({ published_blocks: null })
    const a = drawn((await livePage(r, dbOf(CATALOGUE).db)).blocks)
    const p = drawn((await previewPage(r, dbOf(CATALOGUE).db)).blocks)
    check("a page from before the published copy existed: the same list", idsOf(a) === idsOf(p))
  }

  console.log("\n  the steps above are the steps the two files run")

  const route = strip(read("app/(marketing)/l/[slug]/page.tsx"))
  check("the route builds the published shape with the seller it resolved", /publishedShape\(onepage, owner, \{[\s\S]*?sellerId: resolvedCreatorId,?\s*\}\)/.test(route))
  check("publishedShape is the published shape of lib/onepage/public-shape", /return publicOnePage\(onepage, \{\s*source: "published"/.test(strip(read("lib/onepage/published-page.ts"))))
  check("then reads its products by the seller the shape names",
    /transformedOnepage\.blocks = await withLiveProducts\(\s*adminSupabase as unknown as ProductsDb,\s*transformedOnepage\.seller_id \?\? "",\s*transformedOnepage\.blocks,?\s*\)/.test(route))
  check("and draws that, with nothing else taken out", /<PublicOnePage onepage=\{transformedOnepage\} \/>/.test(route) && (route.match(/transformedOnepage\.blocks =/g) ?? []).length === 1)

  const editor = strip(read("components/onepage/live-preview.tsx"))
  check("the editor posts the draft shape", /publicOnePageFromDraft\(onepage as never, \{ displayName: owner\.displayName, liveAvatarUrl: owner\.avatarUrl \}\)/.test(editor))

  const frame = strip(read("components/onepage/preview-document.tsx"))
  check("the frame asks by the seller the shape names", /const sellerId = sent\?\.seller_id \?\? null/.test(frame) && /answersForBlocks\(db, sellerId, blocks\)/.test(frame))
  check("and resolves what it was sent with the live route's rule", /blocks: resolveProductBlocks\(sent\.blocks, answers\)/.test(frame))
  check("and draws that, with nothing else taken out", /<PublicOnePage onepage=\{page as never\} \/>/.test(frame) && (frame.match(/blocks:/g) ?? []).length === 1)

  const probe = strip(read("scripts/render-onepage-parity.tsx"))
  check("the browser probe's live side runs the route's product read too", /withLiveProducts\(createClient\(\) as unknown as ProductsDb, shape\.seller_id \?\? "", shape\.blocks\)/.test(probe))
  check("and its catalogue is the one the preview's frame reads", /\(window as any\)\.PROBE_PRODUCTS = CATALOGUE/.test(probe) && /globalThis\.PROBE_PRODUCTS/.test(read("scripts/onepage-probe-server.mjs")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
