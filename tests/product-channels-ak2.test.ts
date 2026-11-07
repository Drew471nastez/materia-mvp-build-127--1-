/**
 * ROUND AK (AK2): A PRODUCT'S SALES CHANNELS, SAVED AND SHOWN
 *
 * "Marketplace/Explore and Online Store toggles do not reliably persist or
 * update visibility." The editor's card, the route and the data functions,
 * driven for real over the journey harness (tests/_journey: the real route
 * handlers over an in-memory PostgREST), both before and after SQL
 * 20271125 (set_product_channels_atomic) has run, and over tests/_fake-db for
 * the reads that fail.
 *
 *   enable, disable   a tick taken off and put back, saved and read again
 *   what it shows     Explore, the OnePage's blocks and shelves, the website
 *   stale tab         an editor opened before another save sends only its
 *                     own change, so the other save stays
 *   the card          what it sends (lib/store/channel-changes) and the
 *                     editor's Saved state after a save's read back
 *
 * Run: node scripts/run-push-tests.mjs (in SUITES)
 */
import "./_journey/env"
import { Journey, type Person } from "./_journey/harness"
import { PgError, type MemoryDb } from "./_journey/postgrest"
import { fakeDb } from "./_fake-db"
import { channelChanges, listedKeys } from "../lib/store/channel-changes"
import { startingChannels, withBuiltIns, type Channel } from "../lib/store/channels"
import { cardsSaved, changedCards, initialForm, reportCardDraft, seoDescriptionFrom, type CardDrafts } from "../app/(storelib)/app/products/new/editor-form"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

/** supabase/migrations/20271125_atomic_product_channels.sql set_product_channels_atomic, ported: built-in rows made as needed, unknown keys refused, the whole set written. */
function installAtomicChannels(db: MemoryDb) {
  db.rpcs.set_product_channels_atomic = (d, a) => {
    const off = a.p_off as unknown
    if (!Array.isArray(off) || off.length > 64) throw new PgError("22023", "Invalid channel selection")
    const product = d.rows("products").find((p) => p.id === a.p_product && p.creator_id === a.p_creator)
    if (!product) throw new PgError("P0002", "Product not found")
    const channels = d.rows("sales_channels")
    const kept: string[] = []
    for (const key of off as string[]) {
      let id: string | null = null
      if (["storefront", "creator_page", "marketplace"].includes(key)) {
        let row = channels.find((c) => c.creator_id === a.p_creator && c.kind === key)
        if (!row) [row] = d.insert("sales_channels", { creator_id: a.p_creator, kind: key, name: key, is_storefront: key === "storefront", enabled: true, position: 0 }, {})
        id = row.id as string
      } else if (/^[0-9a-f-]{36}$/i.test(key)) {
        id = (channels.find((c) => c.id === key && c.creator_id === a.p_creator)?.id as string) ?? null
      }
      if (!id) throw new PgError("22023", "Unknown sales channel")
      if (!kept.includes(id)) kept.push(id)
    }
    const listings = d.rows("product_channel_listings")
    for (let i = listings.length - 1; i >= 0; i--) if (listings[i].creator_id === a.p_creator && listings[i].product_id === a.p_product && !kept.includes(listings[i].channel_id)) listings.splice(i, 1)
    for (const id of kept) {
      const there = listings.find((l) => l.channel_id === id && l.product_id === a.p_product)
      if (there) Object.assign(there, { listed: false, updated_at: new Date().toISOString() })
      else listings.push({ channel_id: id, product_id: a.p_product, creator_id: a.p_creator, listed: false, updated_at: new Date().toISOString() })
    }
    return kept
  }
}

type Setup = { channels: Channel[]; off: string[]; defaultKey: string | null; ready: boolean }

async function main() {
  const j = await Journey.start()
  const seller = await j.signUp("maker@example.com", { name: "Mara Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mara" } })
  const cid = j.rows("creators")[0].id as string
  const product = (title: string, slug: string, type = "digital") =>
    j.db.insert("products", { creator_id: cid, type, title, slug, description: "<p>x</p>", status: "published", archived: false, price_cents: 1500, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})[0].id as string
  const pack = product("Tech House Pack", "tech-house-pack")
  const guide = product("Free Guide", "free-guide")

  const { createAdminClient } = await import("@/lib/supabase/admin")
  const { offChannel, offChannelAmong } = await import("@/lib/store/channel-filter")
  const { answersForBlocks } = await import("@/lib/onepage/live-products")
  const { shelfItems } = await import("@/lib/onepage/storelib-blocks-server")
  const { shopProducts } = await import("@/lib/website-builder/shop-products")
  const admin = createAdminClient()

  const get = async (as: Person, id: string) => (await j.call<Setup>(`GET /api/store/channels/product?productId=${id}`, { as })).json
  const listed = (s: Setup) => [...listedKeys(s.channels, s.off)].map((k) => s.channels.find((c) => (c.id ?? c.kind) === k)?.kind).sort()
  /** Where the product shows, asked of the functions the pages call. */
  const where = async (id: string) => {
    const explore = !(await offChannelAmong(admin, [id], "marketplace")).has(id)
    const onePageBlock = (await answersForBlocks(admin as never, cid, [{ id: "b1", type: "product", data: { product_id: id } }])).get(id) !== null
    const shelf = ((await shelfItems(admin, cid, "all", 12)) ?? []).some((i) => i.id === id)
    const website = (await shopProducts(admin as never, cid)).some((p) => p.id === id)
    return { explore, onePageBlock, shelf, website }
  }

  for (const atomic of [false, true]) {
    section(atomic ? "After SQL 20271125: the same, through set_product_channels_atomic" : "Before SQL 20271125 (no function): the writes in steps")
    if (atomic) installAtomicChannels(j.db)
    const id = atomic ? guide : pack
    const missingBefore = j.db.missingRpcs.length

    const first = await get(seller, id)
    check("a product nobody has changed is on every channel, read from what is saved", first.ready === true && first.off.length === 0 && listed(first).join() === "creator_page,marketplace,storefront", first)
    const shownBefore = await where(id)
    check("  and shows on Explore, its OnePage block and shelf, and the website", shownBefore.explore && shownBefore.onePageBlock && shownBefore.shelf && shownBefore.website, shownBefore)

    const off = await j.call<Setup>("PUT /api/store/channels/product", { as: seller, body: { productId: id, list: [], unlist: ["marketplace", "storefront"] } })
    check("Explore and the Online store unticked: saved, and the answer is what is saved", off.status === 200 && listed(off.json).join() === "creator_page", off.json)
    check(atomic ? "  written by the database function" : "  written without the function, which the database does not have yet", atomic ? !j.db.missingRpcs.slice(missingBefore).includes("set_product_channels_atomic") : j.db.missingRpcs.includes("set_product_channels_atomic"), j.db.missingRpcs)
    const reread = await get(seller, id)
    check("  read again (a reload of the editor): the same two off", listed(reread).join() === "creator_page" && reread.off.length === 2, reread)
    check("  the two it was taken off have rows now, so their keys are ids", reread.channels.filter((c) => c.kind === "marketplace" || c.kind === "storefront").every((c) => typeof c.id === "string"), reread.channels)
    const hidden = await where(id)
    check("  gone from Explore and the website; still on the OnePage (the Creator page channel)", !hidden.explore && !hidden.website && hidden.onePageBlock && hidden.shelf, hidden)

    const page = await j.call<Setup>("PUT /api/store/channels/product", { as: seller, body: { productId: id, unlist: ["creator_page"] } })
    const offPage = await where(id)
    check("the Creator page unticked: the OnePage's block and shelf leave it out too", page.status === 200 && !offPage.onePageBlock && !offPage.shelf && (await offChannel(admin, cid, "creator_page")).has(id), offPage)

    const marketplaceId = reread.channels.find((c) => c.kind === "marketplace")!.id as string
    const back = await j.call<Setup>("PUT /api/store/channels/product", { as: seller, body: { productId: id, list: [marketplaceId, "creator_page"] } })
    check("Explore and the Creator page ticked again (by id and by kind): only the Online store stays off", back.status === 200 && listed(back.json).join() === "creator_page,marketplace", back.json)
    const shownAgain = await where(id)
    check("  back on Explore and the OnePage, still off the website", shownAgain.explore && shownAgain.onePageBlock && shownAgain.shelf && !shownAgain.website, shownAgain)

    section("A tab opened before another save does not undo it")
    const all = await j.call<Setup>("PUT /api/store/channels/product", { as: seller, body: { productId: id, list: ["storefront"] } })
    check("(every channel on again)", listed(all.json).length === 3, all.json)
    const tabA = await get(seller, id)
    const tabB = await get(seller, id)
    /* Tab B takes it off Explore and saves. */
    const bOn = listedKeys(tabB.channels, tabB.off)
    bOn.delete(tabB.channels.find((c) => c.kind === "marketplace")!.id as string)
    const bSent = channelChanges(tabB.channels, listedKeys(tabB.channels, tabB.off), bOn)
    await j.call("PUT /api/store/channels/product", { as: seller, body: { productId: id, ...bSent } })
    /* Tab A, still showing Explore ticked, takes it off the Online store and saves. */
    const aOn = listedKeys(tabA.channels, tabA.off)
    aOn.delete(tabA.channels.find((c) => c.kind === "storefront")!.id as string)
    const aSent = channelChanges(tabA.channels, listedKeys(tabA.channels, tabA.off), aOn)
    check("  the older tab sends only its own change", aSent.list.length === 0 && aSent.unlist.length === 1, aSent)
    const aSaved = await j.call<Setup>("PUT /api/store/channels/product", { as: seller, body: { productId: id, ...aSent } })
    check("  both changes are saved: off Explore (tab B) and off the Online store (tab A)", listed(aSaved.json).join() === "creator_page", aSaved.json)
    const stale = await where(id)
    check("  and Explore still leaves it out", !stale.explore && !stale.website, stale)
    const again = await j.call<Setup>("PUT /api/store/channels/product", { as: seller, body: { productId: id, ...aSent } })
    check("  the same save sent twice changes nothing more", listed(again.json).join() === "creator_page", again.json)
    await j.call("PUT /api/store/channels/product", { as: seller, body: { productId: id, list: ["storefront", "marketplace"] } })
  }

  section("What the route refuses")
  const stranger = await j.signUp("other@example.com")
  await j.call("POST /api/onboarding/finalize", { as: stranger, body: { role: "creator", creatorSlug: "other" } })
  const theirs = await j.call("PUT /api/store/channels/product", { as: stranger, body: { productId: pack, unlist: ["marketplace"] } })
  check("another store's product: 404, nothing written", theirs.status === 404 && !(await offChannelAmong(admin, [pack], "marketplace")).has(pack), theirs.json)
  const both = await j.call("PUT /api/store/channels/product", { as: seller, body: { productId: pack, list: ["marketplace"], unlist: ["marketplace"] } })
  check("a channel both ticked and unticked: 400", both.status === 400, both.json)
  const junk = await j.call("PUT /api/store/channels/product", { as: seller, body: { productId: pack, unlist: [{ x: 1 }] } })
  check("a key that is not a word: 400", junk.status === 400, junk.json)
  const unknown = await j.call("PUT /api/store/channels/product", { as: seller, body: { productId: pack, unlist: ["11111111-1111-4111-8111-111111111111"] } })
  check("a channel that is not this store's: refused, nothing written", unknown.status >= 400 && !(await offChannelAmong(admin, [pack], "marketplace")).has(pack), unknown)
  const signedOut = await j.call("PUT /api/store/channels/product", { body: { productId: pack, unlist: ["marketplace"] } })
  check("signed out: 401", signedOut.status === 401, signedOut.json)
  const legacy = await j.call<Setup>("PUT /api/store/channels/product", { as: seller, body: { productId: pack, off: ["marketplace"] } })
  check("the whole list still works (a duplicate copies its original's)", legacy.status === 200 && listed(legacy.json).join() === "creator_page,storefront", legacy.json)

  section("A read that fails is said, not shown as every channel")
  {
    const { readProductOff, changeProductChannels } = await import("@/lib/store/channels-server")
    const P = "a0000000-0000-4000-8000-0000000000aa"
    const C = "c0000000-0000-4000-8000-0000000000cc"
    const broken = fakeDb({ products: [{ id: P, creator_id: C }], sales_channels: [] }, { failWith: { product_channel_listings: { code: "57014", message: "canceling statement due to statement timeout" } } })
    check("the listings read timed out: null, not []", (await readProductOff(broken, C, P)) === null)
    const change = await changeProductChannels(broken, C, P, { unlist: ["marketplace"] })
    check("  and a change is refused (503) rather than written over what it could not read", change.ok === false && (change as { status: number }).status === 503 && broken.log.every((l) => l.op === "select"), change)
    const before = fakeDb({ products: [{ id: P, creator_id: C }] }, { failWith: { product_channel_listings: { code: "42P01", message: 'relation "public.product_channel_listings" does not exist' } } })
    check("before parts 109 and 111: nothing is off (fail open), as before", JSON.stringify(await readProductOff(before, C, P)) === "[]")
  }

  section("Collections, the editor's other card that held a whole list: changes only too")
  {
    const now = new Date().toISOString()
    const [x] = j.db.insert("product_collections", { creator_id: cid, title: "Packs", slug: "packs", kind: "manual", created_at: now }, {})
    const [y] = j.db.insert("product_collections", { creator_id: cid, title: "Free", slug: "free", kind: "manual", created_at: now }, {})
    const member = async () => ((await j.call(`GET /api/collections/product?productId=${guide}`, { as: seller })).json.collections as { id: string; member: boolean }[]).filter((c) => c.member).map((c) => c.id).sort()
    check("(in no collection)", (await member()).length === 0)
    /* A tab opened now, then the product is put in Packs elsewhere. */
    const elsewhere = await j.call("PUT /api/collections/product", { as: seller, body: { productId: guide, add: [x.id] } })
    check("put in Packs from another tab: saved, and the answer lists where it is", elsewhere.status === 200 && JSON.stringify(elsewhere.json.member) === JSON.stringify([x.id]), elsewhere.json)
    const stale = await j.call("PUT /api/collections/product", { as: seller, body: { productId: guide, add: [y.id], remove: [] } })
    check("  the older tab adds Free: the product is in both, Packs is not taken away", stale.status === 200 && JSON.stringify(await member()) === JSON.stringify([x.id, y.id].sort()), stale.json)
    const out = await j.call("PUT /api/collections/product", { as: seller, body: { productId: guide, remove: [x.id] } })
    check("  taken out of Packs: only that", out.status === 200 && JSON.stringify(await member()) === JSON.stringify([y.id]), out.json)
    const whole = await j.call("PUT /api/collections/product", { as: seller, body: { productId: guide, collectionIds: [x.id] } })
    check("  the whole list still works", whole.status === 200 && JSON.stringify(await member()) === JSON.stringify([x.id]), whole.json)
    const strangers = await j.call("PUT /api/collections/product", { as: stranger, body: { productId: guide, add: [] } })
    check("  another store's product: 404", strangers.status === 404, strangers.json)
  }

  section("The SEO description follows the description until it is written by hand")
  {
    const base = { id: pack, creator_id: cid, title: "T", slug: "t", type: "digital", status: "published", price_cents: 100, description: "<p>Short &amp; sweet.</p>" }
    const auto = initialForm({ product: { ...base, seo_description: seoDescriptionFrom(base.description) }, assets: [], variants: [] } as never)
    check("one the editor wrote from the description: it follows the description again", auto.seoEdited === false && auto.seoDescription === "Short & sweet.", auto.seoDescription)
    const typed = initialForm({ product: { ...base, seo_description: "Written by hand" }, assets: [], variants: [] } as never)
    check("one written by hand: kept", typed.seoEdited === true)
    check("  the rule: text only, 155 characters at most", seoDescriptionFrom(`<p>${"a ".repeat(200)}</p>`).length === 155 && seoDescriptionFrom(null) === "")
  }

  section("The card: what it sends, and Saved afterwards")
  {
    const channels = withBuiltIns([])
    const saved = listedKeys(channels, [])
    check("a product with no rows is on all three", saved.size === 3)
    const now = new Set(saved)
    now.delete("marketplace")
    check("Explore unticked: only that is sent", JSON.stringify(channelChanges(channels, saved, now)) === JSON.stringify({ list: [], unlist: ["marketplace"] }))
    now.add("marketplace")
    check("ticked again before Save: nothing is sent", JSON.stringify(channelChanges(channels, saved, now)) === JSON.stringify({ list: [], unlist: [] }))
    const physicalShown = channels.filter((c) => c.kind !== "creator_page" && c.kind !== "marketplace")
    const startPhysical = startingChannels(physicalShown, "creator_page")
    check("a new thing that ships never sends the Creator page or Explore, which it does not show", JSON.stringify(channelChanges(physicalShown, saved, startPhysical)) === JSON.stringify({ list: [], unlist: [] }) && startPhysical.has("storefront"))
    const rows: Channel[] = [{ id: "22222222-2222-4222-8222-222222222222", kind: "marketplace", name: "Explore", description: null, enabled: true }]
    check("an id is matched whatever its case", !listedKeys(withBuiltIns(rows), ["22222222-2222-4222-8222-222222222222".toUpperCase()]).has(rows[0].id as string))

    let cards: CardDrafts = reportCardDraft({}, "channels", ["creator_page", "marketplace", "storefront"], true)
    cards = reportCardDraft(cards, "channels", ["creator_page", "storefront"], false)
    const sent = cards
    /* The save's answer comes back with another tab's change in it, and the card says so before the editor marks the save. */
    cards = reportCardDraft(cards, "channels", ["creator_page"], true)
    cards = cardsSaved(cards, sent)
    check("the card's read back after a save is what is saved, not the older value it sent", changedCards(cards).length === 0 && cards.channels.saved === JSON.stringify(["creator_page"]), cards)
    let plain: CardDrafts = reportCardDraft({}, "channels", ["a", "b"], true)
    plain = reportCardDraft(plain, "channels", ["a"], false)
    plain = cardsSaved(plain, plain)
    check("  and without a read back, what was sent is saved, as before", changedCards(plain).length === 0)
    let during: CardDrafts = reportCardDraft({}, "channels", ["a", "b"], true)
    during = reportCardDraft(during, "channels", ["a"], false)
    const sentDuring = during
    during = reportCardDraft(during, "channels", ["a", "b", "c"], false)
    during = cardsSaved(during, sentDuring)
    check("  a tick changed while the save was out is still unsaved", changedCards(during).join() === "channels")
  }

  check("no route answered 5xx", j.serverErrors.filter((e) => e.route.includes("channels")).length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
