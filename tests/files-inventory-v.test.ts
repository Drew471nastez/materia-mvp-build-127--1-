/**
 * Round V, track 11: Files' detail view, and inventory that keeps track of
 * everything.
 *
 * FILES
 *   the detail view    a wide window on a computer, the sheet on a phone;
 *                      the link field whose Copy button never shrinks, and
 *                      Copied after; alt text saved (part 214); Delete a quiet
 *                      word whose question names where the file is used;
 *                      Escape closes, the arrows go through the grid
 *   the grid           resized copies at the width each tile is drawn
 *                      (srcset and sizes per grid), lazy after the first
 *                      rows, a fixed square with a grey under it, AVIF/WebP
 *                      through the optimizer; the original kept for Download
 *                      and the large view
 *   where it is used   the shop's own products, variants and pages only
 *
 * INVENTORY
 *   adjust             add, remove, set for every reason; past zero refused
 *   history            every source named: manual, order, return,
 *                      transfer, import, API, partner app, product editor
 *   orders             held under a lock: thirty buyers, five units, five
 *                      holds (and the same race without a lock oversells)
 *   refunds, returns   released or restocked by the order's own rules
 *   transfers          draft, sent, received in part, received, cancelled;
 *                      one item short and nothing moves
 *   low stock          the variant's line, else the product's, else the shop's
 *   keep selling       the cart and checkout read one rule
 *   another shop       never reached
 *
 * On a real Postgres: bash scripts/sql-harness/inventory-race.sh
 * In a browser: node scripts/check-file-modal.mjs, node scripts/check-inventory-adjust.mjs
 *
 * Run with: node scripts/run-push-tests.mjs (it imports server modules)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { untt } from "./i18n-source"
import { MANAGE_SIZES, THUMB_SIZES, THUMB_WIDTHS, fileThumb, rawSize, slotFor, thumbSlot } from "@/lib/files/thumb"
import { cleanAlt, fileUsage, mentions, saveAltText } from "@/lib/files/usage-server"
import {
  MANUAL_REASONS,
  REASONS_FOR,
  canSell,
  csvCell,
  inventoryCsv,
  lowForAlert,
  lowStockAt,
  mergeTransferItems,
  movementSource,
  parseInventoryCsv,
  planAdjust,
  readUnits,
  reasonFor,
  receivePlan,
  sellsWhenOut,
  stockState,
  transferActions,
} from "@/lib/physical/inventory-rules"
import { adjustStock, cancelTransfer, movements, receiveTransfer, saveStockSettings, shipTransfer } from "@/lib/physical/inventory-server"
import { refundReleasesStock } from "@/lib/physical/status"
import { variantStock, lowStockLine } from "@/lib/physical/storefront-stock"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SHOP = "00000000-0000-4000-b000-000000000001"
const OTHER = "00000000-0000-4000-b000-000000000002"
const VAR = "00000000-0000-4000-c100-000000000001"
const L1 = "00000000-0000-4000-d000-000000000001"
const L2 = "00000000-0000-4000-d000-000000000002"

/* ── A small database: tables in memory, the query builder the stock code uses, and rpc ── */
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
function memoryDb(tables: Record<string, Row[]>, rpc: (fn: string, args: Row) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>) {
  const writes: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = []
  const from = (table: string) => {
    const filters: [string, string, unknown][] = []
    let op = "select"
    let payload: Row | Row[] | null = null
    let single: "one" | "maybe" | null = null
    let limit: number | null = null
    const match = (r: Row) =>
      filters.every(([kind, col, val]) => {
        const v = col.includes(".") ? undefined : r[col]
        if (col.includes(".")) return true
        if (kind === "eq") return String(v) === String(val)
        if (kind === "in") return (val as unknown[]).map(String).includes(String(v))
        if (kind === "lt") return Number(v) < Number(val)
        if (kind === "notnull") return v !== null && v !== undefined
        return true
      })
    const run = async () => {
      const rows = tables[table] ?? (tables[table] = [])
      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[]
        const made = list.map((p, i) => ({ id: p.id ?? `${table}-${rows.length + i + 1}`, ...p }))
        rows.push(...made)
        writes.push({ table, op, payload, filters: [] })
        return { data: single ? made[0] : made, error: null }
      }
      if (op === "update") {
        const hit = rows.filter(match)
        hit.forEach((r) => Object.assign(r, payload))
        writes.push({ table, op, payload, filters: filters.map(([, c, v]) => [c, v]) })
        return { data: hit, error: null }
      }
      if (op === "upsert") {
        writes.push({ table, op, payload, filters: [] })
        rows.push(payload as Row)
        return { data: null, error: null }
      }
      if (op === "delete") {
        writes.push({ table, op, filters: filters.map(([, c, v]) => [c, v]) })
        return { data: null, error: null }
      }
      let out = rows.filter(match)
      if (limit !== null) out = out.slice(0, limit)
      if (single) return { data: out[0] ?? null, error: null }
      return { data: out, error: null }
    }
    const q: Row = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), q),
      in: (c: string, v: unknown[]) => (filters.push(["in", c, v]), q),
      lt: (c: string, v: unknown) => (filters.push(["lt", c, v]), q),
      not: (c: string) => (filters.push(["notnull", c, null]), q),
      order: () => q,
      limit: (n: number) => ((limit = n), q),
      insert: (p: Row | Row[]) => ((op = "insert"), (payload = p), q),
      update: (p: Row) => ((op = "update"), (payload = p), q),
      upsert: (p: Row) => ((op = "upsert"), (payload = p), q),
      delete: () => ((op = "delete"), q),
      maybeSingle: () => ((single = "maybe"), run()),
      single: () => ((single = "one"), run()),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
    }
    return q
  }
  return { from, rpc, tables, writes }
}
const MISSING = { data: null, error: { code: "PGRST202", message: "not found" } }

async function main() {
  console.log("\nFiles: the detail view")
  {
    const lib = read("components/files/files-library.tsx")
    const details = lib.slice(lib.indexOf("function FileDetails("), lib.indexOf("/* ── Asked before a delete"))
    const linkField = lib.slice(lib.indexOf("export function CopyLinkField"), lib.indexOf("/** The type a person reads"))
    check("a wide window on a computer: the picture beside a 340px column", /w-\[min\(1040px,calc\(100vw-48px\)\)\]/.test(details) && /w-\[340px\] shrink-0 flex-col/.test(details))
    check("the sheet on a phone, the same parts one under the other", /phone \? \(\s*<div className="flex min-h-0 flex-1 flex-col" data-file-details="phone">/.test(details) && /<SheetDialog/.test(details))
    check("the link: the address cut with an ellipsis, beside a Copy button that never shrinks", /min-w-0 flex-1 truncate/.test(linkField) && /min-w-\[92px\] shrink-0 items-center justify-center gap-1\.5 whitespace-nowrap/.test(linkField))
    check("  Copy says Copied for a moment, and a failure says so", /copied \? "Copied" : "Copy"/.test(linkField) && /setTimeout\(\(\) => setCopied\(false\), 1600\)/.test(linkField) && /The link could not be copied\./.test(linkField))
    check("  and copies the file's own address", /<CopyLinkField url=\{f\.url\} \/>/.test(details) && /navigator\.clipboard\.writeText\(text\)/.test(lib))
    check("alt text for pictures, saved through PATCH /api/files and kept on the file", /<AltText file=\{f\} onSaved=\{onAlt\} \/>/.test(details) && /method: "PATCH", body: \{ bucket: file\.bucket, path: file\.path, alt:/.test(lib) && /x\.id === f\.id \? \{ \.\.\.x, alt \}/.test(lib))
    check("Delete is a quiet red word, not a bordered red button", /data-file-delete=""/.test(details) && /text-\[#b42318\] outline-none transition-colors hover:bg-\[#fef2f2\]/.test(details) && !/BTN_DANGER, "w-full/.test(details))
    check("type, size, dimensions, uploaded, from; a video's length", ["Type", "Size", "Dimensions", "Uploaded", "From", "Length"].every((w) => details.includes(`"${w}"`)))
    check("dimensions read from the original as it loads", /onSize\(\{ w: e\.currentTarget\.naturalWidth, h: e\.currentTarget\.naturalHeight \}\)/.test(lib) && /videoWidth/.test(lib))
    check("where it is used, from /api/files/usage", /\/api\/files\/usage\?bucket=\$\{encodeURIComponent\(f\.bucket\)\}&path=\$\{encodeURIComponent\(f\.path\)\}/.test(lib) && /data-file-uses=""/.test(details))
    check("the arrow keys go through the grid as it is filtered, not while typing", /e\.key === "ArrowLeft" && prev/.test(details) && /e\.key === "ArrowRight" && next/.test(details) && /t\.tagName === "INPUT" \|\| t\.tagName === "TEXTAREA"/.test(details) && /list=\{shown\}/.test(lib))
    check("Escape closes: the dialog's and the sheet's own", /onClose=\{onClose\}/.test(details) && /SheetDialog/.test(details))
    check("the large view is the original at full resolution, the tile's copy under it", /src=\{file\.url\}/.test(lib) && /data-file-preview-under=""/.test(lib) && !/filePreview\(/.test(lib))
    check("the files on either side are fetched ahead", /function useNeighbours/.test(lib) && /img\.src = f\.url/.test(lib))
    const confirm = lib.slice(lib.indexOf("function ConfirmDelete("), lib.indexOf("function ConfirmDeleteMany("))
    /* Changed on purpose (round 39): a file in use is taken out of Files and kept where it shows (lib/files/keep.ts), so those places no longer go blank. */
    check("delete asks first, and names the places a file in use stays in", /useUsage\(file\)/.test(confirm) && /data-file-confirm-in-use=""/.test(confirm) && /It leaves Files and stays in those places\./.test(confirm))
    check("  a file not used anywhere says so", /It is not used on your products or website\./.test(confirm))
    check("  and the used-in answer is asked again once a file is deleted", /usage\.delete\(f\.id\)/.test(lib))
  }

  console.log("\nFiles: the grid's pictures")
  {
    const lib = read("components/files/files-library.tsx")
    const own = "https://storelib.com/media/store-builder-images/u1/files/a.jpg"
    const t = fileThumb(own, MANAGE_SIZES)
    check("every tile asks for a copy the width it is drawn, 128 to 640", THUMB_WIDTHS.join() === "128,256,384,640" && THUMB_WIDTHS.every((w) => t.srcSet!.includes(`&w=${w}&q=88 ${w}w`)))
    check("  each width one Next serves", THUMB_WIDTHS.every((w) => [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840].includes(w)))
    check("  Files' grid says its own sizes, the chooser keeps its", t.sizes === MANAGE_SIZES && fileThumb(own).sizes === THUMB_SIZES && /fileThumb\(file\.url, mode === "manage" \? MANAGE_SIZES : THUMB_SIZES\)/.test(lib))
    check("  a 390px phone at 3x picks the 640 copy for a two across tile", slotFor(MANAGE_SIZES, 390) * 3 > 384 && slotFor(MANAGE_SIZES, 390) * 3 <= 640, slotFor(MANAGE_SIZES, 390))
    check("  the sizes read the same at every width", Math.round(slotFor(MANAGE_SIZES, 768)) === 177 && slotFor(MANAGE_SIZES, 1280) === 220 && Math.round(thumbSlot(390)) === 133 && thumbSlot(1440) === 180)
    check("  a small picture's real pixels, from whichever sizes the tile has", rawSize({ naturalWidth: 24 / (640 / slotFor(MANAGE_SIZES, 390)), naturalHeight: 10, currentSrc: "/_next/image?url=x&w=640&q=88", sizes: MANAGE_SIZES }, 390).w === 24)
    check("lazy after the first rows, decoded off the main thread", /loading=\{index < EAGER \? "eager" : "lazy"\}/.test(lib) && /decoding="async"/.test(lib))
    check("no shift: a fixed square with the grey under it from the first frame", /relative block aspect-square w-full overflow-hidden bg-\[#f3f4f6\]/.test(lib))
    check("AVIF then WebP from the optimizer, kept a year", /formats: \['image\/avif', 'image\/webp'\]/.test(raw("next.config.mjs")) && /minimumCacheTTL: 31536000/.test(raw("next.config.mjs")))
    check("Download saves the original, never a copy", /const res = await fetch\(f\.url, \{ credentials: "omit" \}\)/.test(lib))
    check("a large library: tiles off screen are skipped by layout and paint", /\[content-visibility:auto\]/.test(lib) && /\[contain-intrinsic-size:auto_112px\]/.test(lib))
  }

  console.log("\nFiles: where a file is used, its alt text, only the owner's")
  {
    const owner = { userId: "u1", creatorId: SHOP }
    const path = "u1/files/1-abc.jpg"
    const url = `https://storelib.com/media/store-builder-images/${path}`
    const db = memoryDb(
      {
        products: [
          { id: "p1", creator_id: SHOP, title: "Lamp", thumbnail_url: url, gallery_urls: [] },
          { id: "p2", creator_id: SHOP, title: "Mug", thumbnail_url: null, gallery_urls: ["https://x/other.jpg"] },
          { id: "p3", creator_id: OTHER, title: "Theirs", thumbnail_url: url, gallery_urls: [] },
        ],
        product_variants: [{ id: "v1", product_id: "p2", name: "Blue", image_url: `https://skg.supabase.co/storage/v1/object/public/store-builder-images/${path}` }],
        store_builder_configs: [{ id: "s1", creator_id: SHOP, page_type: "shop", draft_config: { sections: [{ image: url }] }, published_config: null }],
        onepages: [],
      },
      async () => ({ data: null, error: null }),
    )
    const r = await fileUsage(db, owner, "store-builder-images", path)
    const labels = r.ok === false ? [] : (r as { uses: { label: string }[] }).uses.map((u) => u.label)
    check("a product, a variant (in the storage host's form) and a website page", JSON.stringify(labels) === JSON.stringify(["Lamp", "Mug, Blue", "Website: Home"]), labels)
    check("  another shop's product with the same address is not listed", !labels.includes("Theirs"))
    const theirs = await fileUsage(db, owner, "store-builder-images", "u2/files/x.jpg")
    check("  another person's file: not found", theirs.ok === false && (theirs as { status: number }).status === 404)
    check("  a path that climbs out: not found", (await fileUsage(db, owner, "store-builder-images", "u1/../u2/x.jpg")).ok === false)
    check("mentions reads addresses, lists and JSON", mentions("a/b/c", "b/c") && mentions(["x", "a/b"], "a/b") && mentions({ s: [{ i: "a/b" }] }, "a/b") && !mentions(null, "a"))
    check("alt text is one plain line of at most 500", cleanAlt("  A lamp\n<b>on</b> a desk ") === "A lamp b on /b a desk" && cleanAlt("x".repeat(600))!.length === 500 && cleanAlt("") === null && cleanAlt(3) === undefined)
    const saved = await saveAltText(db, owner, "store-builder-images", path, "A brass lamp")
    check("  saved for the owner's own file, keyed by bucket and path", saved.ok === true && db.writes.some((w) => w.op === "upsert" && JSON.stringify(w.payload).includes('"alt_text":"A brass lamp"') && JSON.stringify(w.payload).includes(`"creator_id":"${SHOP}"`)))
    check("  never for another person's", (await saveAltText(db, owner, "product-images", `${OTHER}/p/1.jpg`, "x")).ok === false)
    const noTable = memoryDb({}, async () => ({ data: null, error: null }))
    noTable.from = ((t: string) => ({ upsert: async () => ({ error: { code: "42P01" } }), select: () => ({}) })) as never
    const waiting = await saveAltText(noTable, owner, "store-builder-images", path, "x")
    check("  before part 214: a plain message, no crash", waiting.ok === false && /Run SQL part 214/.test((waiting as { error: string }).error))
    const route = raw("app/api/files/route.ts")
    check("the routes are the owner's: shopCaller, and the usage route too", /* Changed on purpose (round 41 team): Files is part of Products: the owner, or a team member with Products in the store they work in */
/export async function PATCH[\s\S]*shopCaller\("products"\)/.test(route) && /shopCaller\("products"\)/.test(raw("app/api/files/usage/route.ts")))
  }

  console.log("\nInventory: adjust, the sums for every reason")
  {
    const now = { onHand: 12, committed: 2, incoming: 0 }
    const add = planAdjust(now, { field: "on_hand", mode: "add", quantity: "5" })
    check("add 5 to 12: 17, available 15", add.ok === true && (add as { after: number; availableAfter: number }).after === 17 && (add as { availableAfter: number }).availableAfter === 15)
    const rem = planAdjust(now, { field: "on_hand", mode: "remove", quantity: 4 })
    check("remove 4 from 12: 8", rem.ok === true && (rem as { delta: number; after: number }).delta === -4 && (rem as { after: number }).after === 8)
    const set = planAdjust(now, { field: "on_hand", mode: "set", quantity: "20" })
    check("set to 20 from 12: +8", set.ok === true && (set as { delta: number }).delta === 8)
    const same = planAdjust(now, { field: "on_hand", mode: "set", quantity: "12" })
    check("set to what it is: unchanged", same.ok === true && (same as { unchanged: boolean }).unchanged === true)
    const past = planAdjust(now, { field: "on_hand", mode: "remove", quantity: 13 })
    check("removing more than on hand is refused, in words", past.ok === false && (past as { error: string }).error === "Only 12 on hand here.")
    const short = planAdjust(now, { field: "on_hand", mode: "set", quantity: 1 })
    check("a count under what is sold: allowed, available shown under zero", short.ok === true && (short as { availableAfter: number }).availableAfter === -1)
    check("bad numbers refused: negative, decimal, words, too many, zero to add", ["-1", "1.5", "ten", "1000001"].every((q) => planAdjust(now, { field: "on_hand", mode: "add", quantity: q }).ok === false) && planAdjust(now, { field: "on_hand", mode: "add", quantity: "0" }).ok === false && planAdjust(now, { field: "on_hand", mode: "set", quantity: "0" }).ok === true)
    check("units on order: set and remove", (planAdjust({ ...now, incoming: 6 }, { field: "incoming", mode: "set", quantity: 2 }) as { delta: number }).delta === -4 && planAdjust({ ...now, incoming: 1 }, { field: "incoming", mode: "remove", quantity: 2 }).ok === false)
    check("the reasons a seller can choose: received, returned, count, correction, damaged, theft or loss, promotion, other", MANUAL_REASONS.join() === "received,returned_restock,count,correction,damaged,theft_or_loss,promotion_or_donation,other")
    check("each mode offers its own reasons, the usual one first", REASONS_FOR.add[0] === "received" && REASONS_FOR.remove[0] === "damaged" && REASONS_FOR.set[0] === "count" && REASONS_FOR.remove.includes("theft_or_loss") && REASONS_FOR.add.includes("returned_restock"))
    check("  a reason that does not fit the mode becomes the mode's usual one", reasonFor("add", "damaged") === "received" && reasonFor("remove", "promotion_or_donation") === "promotion_or_donation" && reasonFor("set", "nonsense") === "count")
    for (const mode of ["add", "remove", "set"] as const) {
      for (const reason of REASONS_FOR[mode]) {
        const calls: Row[] = []
        const db = memoryDb({}, async (fn, args) => {
          calls.push({ fn, ...args })
          return { data: { applied: true, on_hand: 9, committed: 0, incoming: 0, available: 9, before: 4, after: 9 }, error: null }
        })
        const r = await adjustStock(db, { creatorId: SHOP, userId: "u1", variantId: VAR, locationId: L1, field: "on_hand", mode, quantity: 5, reason, note: "box 4", key: "adjust:k" })
        const c = calls[0] ?? {}
        check(`  ${mode} with ${reason}: one locked call with the reason, note, key and person`, r.ok === true && calls.length === 1 && c.fn === "physical_inventory_adjust" && c.p_mode === mode && c.p_reason === reason && c.p_note === "box 4" && c.p_key === "adjust:k" && c.p_actor_user === "u1" && c.p_creator === SHOP, c)
      }
    }
    const below = memoryDb({}, async () => ({ data: { applied: false, error: "below_zero", current: 3 }, error: null }))
    const b = await adjustStock(below, { creatorId: SHOP, userId: "u1", variantId: VAR, locationId: L1, field: "on_hand", mode: "remove", quantity: 5 })
    check("the database's refusal under the lock reads in words", b.ok === false && (b as { error: string }).error === "Only 3 on hand here.")
    const twice = memoryDb({}, async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }))
    check("the same press twice: already saved, not an error page", ((await adjustStock(twice, { creatorId: SHOP, userId: null, variantId: VAR, locationId: L1, field: "on_hand", mode: "add", quantity: 1 })) as { error: string }).error === "That change was already saved.")
    /* Before part 214: the old way, one keyed apply of the difference. */
    const applies: Row[] = []
    const old = memoryDb({ inventory_levels: [{ variant_id: VAR, location_id: L1, creator_id: SHOP, on_hand: 7, committed: 1, incoming: 0 }] }, async (fn, args) => {
      if (fn === "physical_inventory_adjust") return MISSING
      applies.push({ fn, ...args })
      return { data: { applied: true, on_hand: 10, committed: 1, incoming: 0, available: 9 }, error: null }
    })
    const o = await adjustStock(old, { creatorId: SHOP, userId: "u1", variantId: VAR, locationId: L1, field: "on_hand", mode: "set", quantity: 10, reason: "other", note: "shelf" })
    check("before part 214: a set becomes the difference (+3), Other written as a correction with its word in the note", o.ok === true && applies.length === 1 && applies[0].p_on_hand === 3 && applies[0].p_reason === "correction" && applies[0].p_note === "Other: shelf", applies[0])
    const sql = raw("supabase/migrations/20270201_v11_inventory_and_files.sql")
    check("part 214 works out add, remove and set under the level's lock", /SELECT \* INTO lvl FROM public\.inventory_levels WHERE variant_id = p_variant AND location_id = p_location FOR UPDATE;\s*IF p_key IS NOT NULL AND EXISTS/.test(sql) && /delta := CASE p_mode WHEN 'add' THEN p_quantity WHEN 'remove' THEN -p_quantity ELSE p_quantity - cur END;/.test(sql))
    check("  and refuses taking away past zero", /IF delta < 0 AND cur \+ delta < 0 THEN\s*RETURN jsonb_build_object\('applied', false, 'error', 'below_zero'/.test(sql))
  }

  console.log("\nInventory: the history names every source")
  {
    const cases: [Row, string][] = [
      [{ reason: "received", refType: null, actor: "creator" }, "manual"],
      [{ reason: "other", refType: null }, "manual"],
      [{ reason: "order_reserved", refType: "checkout" }, "order"],
      [{ reason: "sale_fulfilled", refType: "fulfillment" }, "order"],
      [{ reason: "order_cancelled", refType: "checkout" }, "order"],
      [{ reason: "reservation_released", refType: "checkout" }, "order"],
      [{ reason: "returned_restock", refType: "return" }, "return"],
      [{ reason: "transfer_out", refType: "transfer" }, "transfer"],
      [{ reason: "transfer_cancelled", refType: "transfer" }, "transfer"],
      [{ reason: "count", refType: "import" }, "import"],
      [{ reason: "count", refType: "api" }, "api"],
      [{ reason: "provider_sync", refType: "provider" }, "app"],
      [{ reason: "count", refType: "product" }, "product"],
      [{ reason: "initial", refType: null }, "product"],
    ]
    for (const [m, want] of cases) check(`  ${m.reason}${m.refType ? ` (${m.refType})` : ""}: ${want}`, movementSource(m as never) === want)
    check("the product editor's counts say where they came from", /reason: level \? "count" : "initial",\s*refType: "product",/.test(raw("lib/physical/catalog-server.ts")))
    check("returns, shipments cancelled and partners keep theirs", /reason: "returned_restock", refType: "return"/.test(raw("lib/physical/orders-server.ts")) && /refType: "fulfillment"/.test(raw("lib/physical/orders-server.ts")) && /refType: "provider"/.test(raw("lib/integrations/fulfilment/stock-deps-server.ts")))
    check("an import is a stock count from source import, keyed by the file and its line", /mode: "set", quantity: l\.onHand, reason: "count", note: "Imported from a file", key: `import:\$\{a\.creatorId\}:\$\{a\.fileKey\}:\$\{l\.line\}`, refType: "import"/.test(raw("lib/physical/inventory-server.ts")))
    const db = memoryDb(
      {
        inventory_movements: [
          { id: 3, creator_id: SHOP, variant_id: VAR, location_id: L1, delta_on_hand: 5, delta_committed: 0, delta_incoming: 0, on_hand_after: 17, reason: "received", actor: "creator", actor_user_id: "u1", ref_type: null, created_at: "2026-10-01" },
          { id: 2, creator_id: OTHER, variant_id: VAR, location_id: L1, delta_on_hand: -1, delta_committed: 0, delta_incoming: 0, on_hand_after: 1, reason: "damaged", actor: "creator", ref_type: null, created_at: "2026-10-01" },
        ],
      },
      async () => ({ data: null, error: null }),
    )
    const list = await movements(db, SHOP, { variantId: VAR })
    check("each line: before and after, why, who, from where", list.length === 1 && list[0].onHandBefore === 12 && list[0].onHandAfter === 17 && list[0].actorUserId === "u1" && list[0].source === "manual")
    check("  another shop's history is never read", !list.some((m) => m.id === 2))
    const page = await movements(db, SHOP, { before: 3 })
    check("  a page at a time, newest first, older than the last shown", page.length === 0)
    const sql = raw("supabase/migrations/20270201_v11_inventory_and_files.sql")
    check("the history is append only: an edit or a delete is refused, a deleted product only clears its id", /BEFORE UPDATE OR DELETE ON public\.inventory_movements/.test(sql) && /to_jsonb\(NEW\) - 'creator_id' - 'variant_id' - 'location_id'/.test(sql) && /IF TG_OP = 'DELETE' THEN\s*RAISE EXCEPTION/.test(sql))
    check("  and says who: the person behind a manual change", /ADD COLUMN IF NOT EXISTS actor_user_id uuid/.test(sql) && /actor_user_id, idempotency_key\)/.test(sql))
    const route = raw("app/api/physical/inventory/movements/route.ts")
    check("  You, the store owner, or the team member's email", /m\.actorUserId === c\.userId \? "You"/.test(route) && /"Store owner"/.test(route) && /from\("store_team_members"\)\.select\("user_id, email"\)\.eq\("creator_id", c\.creatorId\)/.test(route))
  }

  console.log("\nInventory: orders never take stock below zero")
  {
    /* Thirty buyers at once for five units: each hold reads and writes the level under its lock, as physical_reserve does. */
    const level = { onHand: 5, committed: 0 }
    let lock: Promise<void> = Promise.resolve()
    const locked = <T>(fn: () => Promise<T>): Promise<T> => {
      const run = lock.then(fn)
      lock = run.then(() => undefined, () => undefined)
      return run
    }
    const tick = () => new Promise<void>((r) => setTimeout(r, Math.random() * 3))
    const reserve = (qty: number) =>
      locked(async () => {
        const available = level.onHand - level.committed
        await tick()
        if (!canSell({ tracked: true, keepSelling: false, available, quantity: qty })) return false
        level.committed += qty
        return true
      })
    const won = (await Promise.all(Array.from({ length: 30 }, () => reserve(1)))).filter(Boolean).length
    check("thirty at once for five: five holds, available never under zero", won === 5 && level.onHand - level.committed === 0, { won, level })
    /* The same race without the lock: what a read, then a write, would do. */
    const loose = { onHand: 5, committed: 0 }
    const unlocked = async () => {
      const available = loose.onHand - loose.committed
      await tick()
      if (available < 1) return false
      loose.committed += 1
      return true
    }
    const looseWon = (await Promise.all(Array.from({ length: 30 }, unlocked))).filter(Boolean).length
    check("  without the lock the same race oversells, which is why every hold is one locked statement", looseWon > 5, looseWon)
    const sql78 = raw("supabase/sql/run-now/78_physical_commerce.sql")
    check("physical_reserve locks each level and refuses what is not available, all lines or none", /SELECT \* INTO lvl FROM public\.inventory_levels WHERE variant_id = ln\.variant_id AND location_id = ln\.location_id FOR UPDATE;\s*IF lvl\.creator_id <> co\.creator_id THEN RAISE EXCEPTION 'physical_reserve: not this shop'; END IF;\s*IF NOT ln\.oversell AND lvl\.available < ln\.quantity THEN\s*RAISE EXCEPTION 'out_of_stock/.test(sql78))
    check("  checkout holds tracked lines, keep selling ones may oversell", /oversell: l\.inventoryPolicy === "continue"/.test(raw("lib/physical/checkout-server.ts")) && /\.filter\(\(l\) => l\.type === "physical" && l\.trackInventory && l\.variantId && l\.locationId\)/.test(raw("lib/physical/checkout-server.ts")))
    check("a refund in full before it ships releases the stock; partial or shipped does not", refundReleasesStock({ totalCents: 1000, refundedCents: 1000, cancelledAt: null, shipments: [], lines: [{ type: "physical" }] }) && !refundReleasesStock({ totalCents: 1000, refundedCents: 500, cancelledAt: null, shipments: [], lines: [{ type: "physical" }] }) && !refundReleasesStock({ totalCents: 1000, refundedCents: 1000, cancelledAt: null, shipments: [{ status: "shipped" }], lines: [{ type: "physical" }] }))
    check("a return restocks what the seller ticked, once, at its location", /const want = input\.restock && i\.id in input\.restock \? input\.restock\[i\.id\] : i\.restock/.test(raw("lib/physical/orders-server.ts")) && /key: `restock:\$\{i\.id\}`/.test(raw("lib/physical/orders-server.ts")))
  }

  console.log("\nInventory: transfers")
  {
    check("a draft is sent or cancelled", transferActions("draft").join() === "send,cancel")
    check("one on its way is received or cancelled", transferActions("in_transit").join() === "receive,cancel" && transferActions("partially_received").join() === "receive,cancel")
    check("a closed one does nothing", transferActions("received").length === 0 && transferActions("cancelled").length === 0)
    const items = [{ id: "a", quantity: 6, received: 0 }, { id: "b", quantity: 2, received: 0 }]
    const part = receivePlan(items, { a: "4" })
    check("4 of 6 arrived: partly received", part.status === "partially_received" && part.take.a === 4 && part.total === 4 && !("b" in part.take))
    const over = receivePlan([{ id: "a", quantity: 6, received: 4 }, { id: "b", quantity: 2, received: 2 }], { a: "40", b: "-1" })
    check("more than is on its way is taken as all of it; under zero as none", over.take.a === 2 && !("b" in over.take) && over.status === "received")
    check("the same product picked twice is one line", JSON.stringify(mergeTransferItems([{ variantId: "v", quantity: 2 }, { variantId: "v", quantity: 3 }, { variantId: "w", quantity: 0 }])) === '[{"variantId":"v","quantity":5}]')
    /* Part 214 there: one call each, with the shop and the person. */
    const calls: Row[] = []
    const db = memoryDb({}, async (fn, args) => {
      calls.push({ fn, ...args })
      if (fn === "physical_transfer_ship") return { data: null, error: { code: "P0001", message: `transfer_short:${VAR}:2` } }
      if (fn === "physical_transfer_receive") return { data: { applied: true, status: "partially_received", received: 4 }, error: null }
      return { data: { applied: true, status: "cancelled" }, error: null }
    })
    db.tables.product_variants = [{ id: VAR, name: "Blue", products: { title: "Mug" } }]
    const sent = await shipTransfer(db, SHOP, "t1", "u1")
    check("one item short: refused by name, and nothing was sent", sent.ok === false && (sent as { error: string }).error === "Only 2 of Mug, Blue available to send. Nothing was sent.", sent)
    const got = await receiveTransfer(db, SHOP, "t1", [{ itemId: "i1", quantity: 4 }, { itemId: "i2", quantity: -3 }], "u1")
    check("received in part: one call with what arrived", got.ok === true && (got as { status: string }).status === "partially_received" && JSON.stringify(calls[1].p_items) === '[{"item_id":"i1","quantity":4},{"item_id":"i2","quantity":0}]' && calls[1].p_creator === SHOP && calls[1].p_actor_user === "u1")
    check("nothing arrived: asked for a number first", ((await receiveTransfer(db, SHOP, "t1", [{ itemId: "i1", quantity: 0 }])) as { error: string }).error === "Enter how many arrived.")
    check("cancelled: one call for the shop", (await cancelTransfer(db, SHOP, "t1", "u1")).ok === true && calls[calls.length - 1].fn === "physical_transfer_cancel" && calls[calls.length - 1].p_creator === SHOP)
    /* Before part 214: every item checked before anything moves. */
    const moved: Row[] = []
    const old = memoryDb(
      {
        inventory_transfers: [{ id: "t2", creator_id: SHOP, status: "draft", origin_location_id: L1, destination_location_id: L2 }],
        inventory_transfer_items: [{ id: "i1", transfer_id: "t2", variant_id: VAR, quantity: 3 }, { id: "i2", transfer_id: "t2", variant_id: "v2", quantity: 9 }],
        inventory_levels: [{ variant_id: VAR, location_id: L1, creator_id: SHOP, available: 5 }, { variant_id: "v2", location_id: L1, creator_id: SHOP, available: 1 }],
        product_variants: [{ id: "v2", name: "Default", products: { title: "Poster" } }],
      },
      async (fn, args) => {
        if (fn.startsWith("physical_transfer")) return MISSING
        moved.push({ fn, ...args })
        return { data: { applied: true }, error: null }
      },
    )
    const r = await shipTransfer(old, SHOP, "t2")
    check("before part 214: one short item stops the send before any stock moves", r.ok === false && moved.length === 0 && /Only 1 of Poster/.test((r as { error: string }).error), { r, moved })
    check("  another shop's transfer is not found", ((await shipTransfer(old, OTHER, "t2")) as { error: string }).error === "Transfer not found.")
    const sql = raw("supabase/migrations/20270201_v11_inventory_and_files.sql")
    check("part 214 sends, receives and cancels a whole transfer in one transaction", /RAISE EXCEPTION 'transfer_short:%:%'/.test(sql) && /FOR UPDATE;\s*IF NOT FOUND THEN RETURN jsonb_build_object\('applied', false, 'error', 'not_found'\); END IF;\s*IF t\.status <> 'draft'/.test(sql) && /'transfer_cancelled', 'transfer', p_transfer::text, 'transfer_cancel_out:'/.test(sql))
  }

  console.log("\nInventory: low stock, keep selling")
  {
    check("the variant's own line first, then the product's, then the shop's, then 5", lowStockAt(2, 8, 5) === 2 && lowStockAt(null, 8, 5) === 8 && lowStockAt(null, null, 3) === 3 && lowStockAt(undefined, undefined, undefined) === 5 && lowStockAt(0, 8, 5) === 0)
    check("the alert names a tracked variant at or under its line", lowForAlert(3, 3, true) && !lowForAlert(4, 3, true) && !lowForAlert(0, 3, false) && lowForAlert(-1, 0, true))
    check("a row's state: oversold, out, low, fine, not tracked", stockState(-1, 5, true) === "oversold" && stockState(0, 5, true) === "out" && stockState(5, 5, true) === "low" && stockState(6, 5, true) === "ok" && stockState(0, 5, false) === "untracked")
    const jobs = raw("lib/physical/jobs-server.ts")
    check("the low stock email reads the variant's own line", /variantLowStockLines\(db, ids\)/.test(jobs) && /const threshold = lowStockAt\(own\.get\(v\.id\), p\.low_stock_threshold, fallback\)/.test(jobs) && /if \(!lowForAlert\(available, threshold, true\)\) continue/.test(jobs))
    check("  and a manual remove that takes it low queues it too", /if \(change\.field === "on_hand" && done\.after < done\.before\) await queueLowStockAlerts\(c\.db, c\.creatorId, \[body\.variantId as string\]\)/.test(raw("app/api/physical/inventory/route.ts")))
    const store = raw("lib/physical/storefront-stock.ts")
    check("the storefront's Only N left reads the variant's line too", /const lowAt = lowStockLine\(own\.get\(v\.id\) \?\? product\.low_stock_threshold, shopLine\)/.test(store) && lowStockLine(2, 5) === 2)
    check("  a database without part 214 reads the product's line, never an error", /if \(!error\) for \(const r of/.test(store))
    check("  Only 2 left at a line of 3", variantStock(2, { tracked: true, keepSelling: false, lowAt: 3 }).left === 2 && variantStock(0, { tracked: true, keepSelling: false, lowAt: 3 }).soldOut)
    check("keep selling: the variant's or the product's", sellsWhenOut("continue", false) && sellsWhenOut("deny", true) && !sellsWhenOut("deny", false) && !sellsWhenOut(null, null))
    check("the cart: untracked and keep selling always sell; otherwise only what is available", canSell({ tracked: false, keepSelling: false, available: 0, quantity: 3 }) && canSell({ tracked: true, keepSelling: true, available: 0, quantity: 3 }) && canSell({ tracked: true, keepSelling: false, available: 3, quantity: 3 }) && !canSell({ tracked: true, keepSelling: false, available: 2, quantity: 3 }))
    const pricing = raw("lib/physical/checkout-pricing-server.ts")
    check("  checkout reads the same rule", /sellsWhenOut\(v\.inventory_policy, p\.continue_selling\) \? "continue" : "deny"/.test(pricing) && /* Changed on purpose (round AF): lines of one option counted together. */ /if \(!canSell\(\{ tracked, keepSelling: policy === "continue", available, quantity: before \+ item\.quantity \}\)\) \{/.test(pricing))
    check("  and the product editor reads it the same way", /inventoryPolicy: sellsWhenOut\(r\.inventory_policy, product\.continue_selling\) \? "continue" : "deny"/.test(raw("lib/physical/catalog-server.ts")))
  }

  console.log("\nInventory: settings, export, import, another shop")
  {
    const writes: Row[] = []
    const settingsDb = (creator: string, method = "self") => ({
      from: (t: string) => {
        const q: Row = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: t === "product_variants" ? { id: VAR, product_id: "p1", products: { id: "p1", creator_id: creator, type: "physical", fulfillment_method: method } } : null, error: null }),
          update: (p: Row) => {
            writes.push({ t, p })
            return { eq: () => ({ eq: async () => ({ error: t === "product_variants" ? { code: "42703" } : null }) }) }
          },
        }
        return q
      },
    })
    const theirs = await saveStockSettings(settingsDb(OTHER), SHOP, VAR, { trackInventory: true })
    check("another shop's variant: not yours, nothing written", theirs.ok === false && (theirs as { status: number }).status === 404 && writes.length === 0)
    const mine = await saveStockSettings(settingsDb(SHOP), SHOP, VAR, { trackInventory: false, continueSelling: true, lowStockThreshold: 4 })
    check("Track stock and Keep selling are the product's, written for the shop", writes[0]?.t === "products" && JSON.stringify(writes[0].p) === '{"track_inventory":false,"continue_selling":true}')
    check("  the variant's line before part 214: a plain message, the rest saved", mine.ok === false && /Run SQL part 214/.test((mine as { error: string }).error) && /The other settings were saved\./.test((mine as { error: string }).error))
    check("  a print partner's product cannot be counted", ((await saveStockSettings(settingsDb(SHOP, "print_on_demand"), SHOP, VAR, { trackInventory: true })) as { status: number }).status === 400)
    check("  a low stock line must be a whole number", ((await saveStockSettings(settingsDb(SHOP), SHOP, VAR, { lowStockThreshold: "-2" })) as { status: number }).status === 400)
    const csv = inventoryCsv([{ productTitle: "=HYPERLINK(\"x\")", variantName: "Blue, large", sku: "MUG-1", locationName: "Home", locationId: L1, variantId: VAR, onHand: 5, committed: 1, available: 4, incoming: 0, tracked: true, keepSelling: false, lowStockAt: 3 }])
    check("the export: a header, quoted cells, never a formula", csv.startsWith("Product,Variant,SKU,Location,On hand,Committed,Available,Incoming,Tracked,Keep selling when out,Low stock at,Variant ID,Location ID\r\n") && csv.includes(`"'=HYPERLINK(""x"")","Blue, large",MUG-1,Home,5,1,4,0,Yes,No,3,${VAR},${L1}`), csv)
    check("  a negative number stays a number", csvCell(-2) === "-2" && csvCell("-x") === "'-x")
    const back = parseInventoryCsv(csv.replace(",5,1,4,", ",7,1,4,"))
    check("the export goes back in as a count of 7 at that location", back.lines.length === 1 && back.lines[0].onHand === 7 && back.lines[0].variantId === VAR && back.lines[0].locationId === L1 && back.errors.length === 0, back)
    const loose = parseInventoryCsv("sku,location,on hand\nA-1,Home,3\nB-2,Home,\nC-3,Home,2.5\n,Home,4\n")
    check("  a plain file: SKU, Location, On hand; an empty count skipped, a bad one said", loose.lines.length === 1 && loose.lines[0].sku === "A-1" && loose.errors.length === 2, loose)
    check("  a file without On hand or without a key says what to add", parseInventoryCsv("sku,location\nA,Home\n").errors[0] === "Add an On hand column." && parseInventoryCsv("location,on hand\nHome,3\n").errors[0] === "Add a SKU or Variant ID column.")
    check("readUnits: whole numbers 0 to a million only", readUnits("0") === 0 && readUnits(" 12 ") === 12 && readUnits("1e3") === null && readUnits(-1) === null && readUnits(1_000_001) === null)
    const routes = ["app/api/physical/inventory/route.ts", "app/api/physical/inventory/export/route.ts", "app/api/physical/inventory/import/route.ts", "app/api/physical/inventory/movements/route.ts", "app/api/physical/transfers/route.ts", "app/api/physical/transfers/[id]/route.ts"]
    /* Changed on purpose (round 41 team): Inventory is part of Products: the owner, or a team member with Products */
    check("every stock route is the signed in shop's (physicalCaller), every write on the server", routes.every((p) => /const c = await physicalCaller\("products"\)\s*if \(c instanceof NextResponse\) return c/.test(raw(p))))
    const sql = raw("supabase/migrations/20270201_v11_inventory_and_files.sql")
    check("the new stock functions are the server's alone", ["physical_inventory_move", "physical_inventory_adjust", "physical_transfer_ship", "physical_transfer_receive", "physical_transfer_cancel"].every((f) => new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated`).test(sql) && new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role`).test(sql)))
    check("  and each checks the variant and the location are the shop's", (sql.match(/IF owner IS NULL OR owner IS DISTINCT FROM p_creator OR loc_owner IS NULL OR loc_owner IS DISTINCT FROM p_creator THEN/g) ?? []).length === 2 && (sql.match(/WHERE id = p_transfer AND creator_id = p_creator FOR UPDATE;/g) ?? []).length === 3)
    check("file_details: RLS on, the owner reads, only the server writes", /ALTER TABLE public\.file_details ENABLE ROW LEVEL SECURITY;/.test(sql) && /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.file_details FROM authenticated;/.test(sql) && /c\.user_id = \(SELECT auth\.uid\(\)\)/.test(sql))
    const runNow = raw("supabase/sql/run-now/214_inventory_and_files.sql")
    check("part 214 in run-now is the migration, one statement per line, each note on its own line", runNow.trim().split("\n").filter((l) => !/^\/\*.*\*\/$/.test(l)).length === 32 && runNow.includes("CREATE OR REPLACE FUNCTION public.physical_transfer_receive(") && !runNow.includes("\n\n"))
    check("  and listed in the run-now README", /\| `214_inventory_and_files\.sql` \|/.test(raw("supabase/sql/run-now/README.md")))
  }

  console.log("\nInventory: the page")
  {
    const page = read("app/app/inventory/inventory-client.tsx")
    check("adjust: Add, Remove, Set to, the result before it is saved", /label: \(\) => "Add"/.test(page) && /label: \(\) => "Remove"/.test(page) && /label: \(\) => "Set to"/.test(page) && /<LevelRow level=\{level\} after=\{planned && !planned\.unchanged/.test(page))
    check("  a dialog on a computer, the sheet on a phone (the shared Modal)", /<Modal\s+open\s+onClose=\{onClose\}\s+title="Adjust stock"/.test(page))
    check("  the settings beside it: Track stock, Keep selling, Low stock at, Units on order", ["Track stock", "Keep selling when out of stock", "Low stock at", "Units on order"].every((w) => page.includes(w)))
    check("  plain errors, Save only when something changed", /error=\{planError\}/.test(page) && /disabled=\{!canSave\}/.test(page))
    check("history: fifty at a time, by location, every source", /Show more/.test(page) && /p\.set\("locationId", loc\)/.test(page) && /SOURCE_LABEL\[m\.source\]\(\)/.test(page))
    check("transfers: receive in part with what arrived, cancel asked first", /data-transfer-arrived=""/.test(page) && /receivePlan\(/.test(page) && /confirmCancel === t\.id/.test(page))
    check("export and import from the page's menu", /\/api\/physical\/inventory\/export/.test(page) && /\/api\/physical\/inventory\/import/.test(page))
    check("no em dashes or banned words in what was added", ![page, read("components/files/files-library.tsx"), raw("lib/physical/inventory-rules.ts"), raw("lib/files/usage-server.ts"), raw("supabase/migrations/20270201_v11_inventory_and_files.sql")].some((s) => /—|\b(unlock|elevate|seamless|powerful|effortlessly|supercharge)\b/i.test(s)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()
