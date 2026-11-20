/**
 * ===========================================================================
 *  ONEPAGE EDITOR FIXES, ROUND 2
 * ===========================================================================
 * Through the real routes over the journey harness (tests/_journey):
 *
 *   1. A PRODUCT DELETED WHILE THE EDITOR IS OPEN. The delete takes its
 *      blocks off the page on the server (lib/products/forget-product) and
 *      notes the move (lib/onepage/product-removals). The editor that was
 *      open on the old version saves its other edits with no conflict, the
 *      deleted product's block never comes back, not even from a Save sent
 *      with no base, and a real second editor is still a conflict.
 *   2. SETTINGS › INTEGRATIONS TELLS THE TRUTH about Mailchimp, Zapier and
 *      Make: working cards, what they do today, connected right there with
 *      the OnePage editor's own card, and read from the same source.
 *   3. A ONEPAGE'S OLD ADDRESSES (SQL part 472): a slug change keeps the old
 *      one leading to the page, a 308 with the query kept, a page that takes
 *      the address removes it, the taken check holds another creator's for
 *      30 days and frees the creator's own, and before the SQL runs nothing
 *      fails.
 *
 * Run: node scripts/run-push-tests.mjs (in STRICT_SUITES)
 */
import "./_journey/env"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Journey } from "./_journey/harness"
import { createAdminClient } from "@/lib/supabase/admin"
import { onePageEditVersion } from "@/lib/onepage/edit-version"
import { PRODUCT_REMOVALS_KEY, removedSince, withRemovalNoted, withoutProducts, withoutRemovalsKey } from "@/lib/onepage/product-removals"
import { forgetProductOnPages } from "@/lib/products/forget-product"
import { INTEGRATIONS, integrationById } from "@/lib/integrations/catalog"
import { installVerb, removalPlan, setupSteps } from "@/lib/integrations/detail-actions"
import { pinAfter } from "@/lib/integrations/directory-order"
import { resolveOnePageAddress, oldAddressRedirect } from "@/lib/onepage/resolve-address"
import { supabaseOnePageLookup } from "@/lib/onepage/address-lookup"
import { onePageNameTaken } from "@/lib/onepage/name-availability"
import { claimOldAddress, oldAddressHeld, rememberOldAddress } from "@/lib/onepage/old-addresses"
import { onePageRoute } from "@/lib/onepage/host-route"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

type Block = { id: string; type: string; enabled: boolean; sort_order: number; data: Record<string, unknown> }
const block = (id: string, type: string, data: Record<string, unknown>, sort = 0): Block => ({ id, type, enabled: true, sort_order: sort, data })
const ids = (blocks: unknown) => (Array.isArray(blocks) ? (blocks as Block[]).map((b) => b.id).join() : "")
const named = (blocks: unknown, productId: string) => JSON.stringify(blocks ?? null).includes(productId)

const theme = { background_type: "solid", background_color: "#ffffff", text_color: "#111113", button_style: "outline", font_family: "Inter" }

async function main() {
  const j = await Journey.start()
  const admin = createAdminClient()
  /* A column production has that no SQL file in the repository creates (the editor's archive). */
  j.db.extraColumns.add("onepages.archived_blocks")
  /* Onboarding makes each account a page; these tests lay their own in its place. */
  const dropPagesOf = (ownerId: string) => {
    j.db.tables.onepages = (j.db.tables.onepages ?? []).filter((r) => r.owner_id !== ownerId)
  }

  const seller = await j.signUp("lena@example.com", { name: "Lena Lane" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "lena" } })
  const creator = j.rows("creators").find((c) => c.user_id === seller.id)!
  const pageRow = () => j.rows("onepages").find((r) => r.owner_id === seller.id)!

  /* ── 1 ─────────────────────────────────────────────────────────────── */
  section("1. A product deleted while the OnePage editor is open")
  {
    const removals = { [PRODUCT_REMOVALS_KEY]: [] }
    const a = "0000000000000001", b = "0000000000000002", c = "0000000000000003"
    const noted = withRemovalNoted(withRemovalNoted(removals, { from: a, to: b, product_id: "p1", at: "x" }), { from: b, to: c, product_id: "p2", at: "y" })
    check("no move: nothing removed", JSON.stringify(removedSince(noted, c, c)) === "[]")
    check("one removal or two in a row between the base and the row: the products named", JSON.stringify(removedSince(noted, b, c)) === '["p2"]' && JSON.stringify(removedSince(noted, a, c)) === '["p1","p2"]')
    check("anything else between them is a conflict", removedSince(noted, "0000000000000009", c) === null && removedSince({}, a, c) === null && removedSince(noted, a, "0000000000000004") === null)
    check("the note keeps the last twenty", (withRemovalNoted(Array.from({ length: 25 }).reduce((s: Record<string, unknown>, _, i) => withRemovalNoted(s, { from: a, to: b, product_id: `p${i}`, at: "" }), {}), { from: a, to: b, product_id: "last", at: "" })[PRODUCT_REMOVALS_KEY] as unknown[]).length === 20)
    check("the editor's copy of the note is never taken", !(PRODUCT_REMOVALS_KEY in withoutRemovalsKey({ [PRODUCT_REMOVALS_KEY]: [], seo_title: "x" })))
    check("a removed product leaves a group too, and an email signup stops offering its file", (() => {
      const out = withoutProducts([block("g", "group", { children: [block("p", "product", { product_id: "p9" })] }), block("e", "email_capture", { digital_product_id: "p9", enable_digital_product: true })], ["p9"]) as Block[]
      return (out[0].data.children as Block[]).length === 0 && out[1].data.enable_digital_product === false
    })())

    const [gone] = j.db.insert("products", { creator_id: creator.id, title: "Brush pack", price_cents: 900, status: "published", type: "digital", slug: "brush-pack" }, {})
    const [kept] = j.db.insert("products", { creator_id: creator.id, title: "Paper set", price_cents: 1200, status: "published", type: "digital", slug: "paper-set" }, {})
    const start: Block[] = [
      block("hdr", "header", { show_avatar: true }, 0),
      block("lnk", "link_button", { label: "My studio", url: "https://example.com/studio" }, 1),
      block("prd", "product", { product_id: gone.id, product_title: "Brush pack" }, 2),
      block("grp", "group", { title: "More", children: [block("prd2", "product", { product_id: gone.id }), block("prd3", "product", { product_id: kept.id })] }, 3),
      block("keep", "product", { product_id: kept.id, product_title: "Paper set" }, 4),
    ]
    dropPagesOf(seller.id)
    const [page] = j.db.insert("onepages", { owner_id: seller.id, seller_id: creator.id, creator_id: creator.id, status: "published", slug: "lena-links", theme, settings: {}, social_links: {}, draft_blocks: start, published_blocks: start }, {})

    const opened = await j.call("GET /api/onepage", { as: seller })
    const versionN = opened.json?.onepage?.edit_version as string
    check("the editor opens holding version N", opened.status === 200 && /^[0-9a-f]{16}$/.test(versionN), opened.json)

    /* A second editor (another tab) also opened on N, for the genuine conflict below. */
    const deleted = await j.call("POST /api/products/delete", { as: seller, body: { productId: gone.id } })
    check("the product is deleted on the server", deleted.status === 200 && deleted.json?.outcome === "deleted" && !j.rows("products").some((p) => p.id === gone.id), deleted.json)
    const afterDelete = pageRow()
    check("its blocks are off the page's draft and live copy, the group's child too", !named(afterDelete.draft_blocks, gone.id) && !named(afterDelete.published_blocks, gone.id) && named(afterDelete.draft_blocks, kept.id), afterDelete.draft_blocks)
    const notes = ((afterDelete.settings ?? {}) as Record<string, unknown>)[PRODUCT_REMOVALS_KEY] as { from: string; to: string; product_id: string }[] | undefined
    check("the move is noted: from N to the row's version, for that product", !!notes && notes.length === 1 && notes[0].from === versionN && notes[0].to === onePageEditVersion(afterDelete as never) && notes[0].product_id === gone.id, notes)

    /* The open editor still holds the product's blocks, and has made other edits. */
    const edited: Block[] = [
      start[0],
      { ...start[1], data: { ...start[1].data, label: "My new studio" } },
      start[2],
      start[3],
      start[4],
      block("new", "link_button", { label: "Prints", url: "https://example.com/prints" }, 5),
    ]
    const save = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: edited, theme, base_version: versionN, publish: true } })
    check("its save of other edits succeeds, no conflict", save.status === 200 && save.json?.conflict !== true, save.json)
    const saved = pageRow()
    const savedBlocks = saved.draft_blocks as Block[]
    check("the edits are kept: the new label and the new block", savedBlocks.find((b) => b.id === "lnk")?.data.label === "My new studio" && savedBlocks.some((b) => b.id === "new"), savedBlocks)
    check("the deleted product's block is not in the saved draft, the live copy or the group", !named(saved.draft_blocks, gone.id) && !named(saved.published_blocks, gone.id) && ids(saved.draft_blocks) === "hdr,lnk,grp,keep,new", ids(saved.draft_blocks))
    check("the other product stays", named(saved.draft_blocks, kept.id))
    check("the answer names the removed product for the editor to drop", JSON.stringify(save.json?.removed_products) === JSON.stringify([gone.id]), save.json?.removed_products)
    check("and its new version is the row's", save.json?.edit_version === onePageEditVersion(saved as never))
    check("the removal note survives the save (only the server writes it)", Array.isArray(((saved.settings ?? {}) as Record<string, unknown>)[PRODUCT_REMOVALS_KEY]))

    const withNoBase = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: edited, theme } })
    check("a Save with no base (the second press after a conflict) never puts it back", withNoBase.status === 200 && !named(pageRow().draft_blocks, gone.id) && !named(pageRow().archived_blocks, gone.id), pageRow().draft_blocks)
    const archived = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: savedBlocks, archived_blocks: [start[2]], theme } })
    check("nor in the archive", archived.status === 200 && !named(pageRow().archived_blocks, gone.id), pageRow().archived_blocks)

    /* A genuine conflict: two editors on the same version, the second saves first. */
    const both = (await j.call("GET /api/onepage", { as: seller })).json?.onepage?.edit_version as string
    const first = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: [...savedBlocks, block("b1", "link_button", { label: "Tab B", url: "https://example.com/b" }, 9)], theme, base_version: both } })
    const second = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: [...savedBlocks, block("a1", "link_button", { label: "Tab A", url: "https://example.com/a" }, 9)], theme, base_version: both } })
    check("two editors: the first save lands", first.status === 200, first.json)
    check("two editors: the second is a conflict and writes nothing", second.status === 409 && second.json?.conflict === true && ids(pageRow().draft_blocks).includes("b1") && !ids(pageRow().draft_blocks).includes("a1"), second.json)

    /* A product deleted AND another editor's save in between: still a conflict. */
    const [later] = j.db.insert("products", { creator_id: creator.id, title: "Ink", price_cents: 500, status: "published", type: "digital", slug: "ink" }, {})
    const withLater = [...(pageRow().draft_blocks as Block[]), block("ink", "product", { product_id: later.id }, 10)]
    const put = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: withLater, theme } })
    const v0 = put.json?.edit_version as string
    await j.call("POST /api/products/delete", { as: seller, body: { productId: later.id } })
    const other = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: [...withLater.filter((b) => b.id !== "ink"), block("c1", "link_button", { label: "Phone", url: "https://example.com/c" }, 11)], theme, base_version: (await j.call("GET /api/onepage", { as: seller })).json?.onepage?.edit_version } })
    const stale = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: withLater, theme, base_version: v0 } })
    check("a removal then another editor's save, then the editor on the old version: a conflict", other.status === 200 && stale.status === 409, { other: other.status, stale: stale.json })

    /* forget-product does not write over an editor's save that landed after its read. */
    check("forget-product writes only on the row it read (updated_at), moving it on", /if \(held\) q = q\.eq\("updated_at", page\.updated_at\)/.test(code("lib/products/forget-product.ts")) && /update\.updated_at = new Date/.test(code("lib/products/forget-product.ts")))
    check("a page with no such product is not rewritten", (await forgetProductOnPages(admin, creator.id, "00000000-0000-4000-8000-000000000000", seller.id)) === 0)

    const ctx = code("lib/onepage/context.tsx")
    check("the editor drops the removed products from its copy on the save's answer", /dropProductsRef\.current\(removed\)/.test(ctx) && /savedFieldsRef\.current = savedFields\(sent\)/.test(ctx) && /published_blocks: sent\.draft_blocks/.test(ctx))
    check("and live, when a screen of this browser deletes a product", /onProductDeleted\(\(productId\) => dropProductsRef\.current\(\[productId\]\)\)/.test(ctx) && /announceProductDeleted\(productId\)/.test(code("lib/products/delete-client.ts")) && /announceProductDeleted\(productId\)/.test(code("lib/products/forget-client.ts")))
    check("as a silent step: other edits are kept and a saved page stays saved", /commit\(next, null, \{ silent: true \}\)/.test(ctx))
  }

  /* ── 2 ─────────────────────────────────────────────────────────────── */
  section("2. Settings › Integrations: Mailchimp, Zapier and Make as they are")
  {
    for (const id of ["mailchimp", "zapier", "make"] as const) {
      const item = integrationById(id)!
      const words = [item.summary, item.lead ?? "", ...item.about, ...item.data, ...item.glance.map((g) => g.value)].join(" ")
      check(`${item.name}: a working card, never Coming soon`, !!item && !item.comingSoon && item.kind === "app" && item.appId === "onepage_signups" && item.pageIntegration === id, item)
      check(`${item.name}: says what it does today, on the OnePage, with no "yet" or "would"`, /OnePage/.test(words) && !/\byet\b|\bwould\b|Coming soon/i.test(words), words)
      check(`${item.name}: Connect, with steps, and Disconnect through the editor's own API`, installVerb(item) === "Connect" && setupSteps(item).length > 0 && removalPlan(item, { installed: true })?.calls[0].path === "/api/onepage/integrations")
    }
    const zap = integrationById("zapier")!
    check("Zapier and Make claim only signups, through the signed webhook, not orders", /signed/i.test([zap.lead, ...zap.data].join(" ")) && /onepage\.signup/.test(zap.about.join(" ")) && /not sent/i.test(zap.about.join(" ")))
    check("Mailchimp: signups and form opt ins into an audience, nothing else claimed", /audience/.test(integrationById("mailchimp")!.about[0]) && /ticked the box for updates/.test(integrationById("mailchimp")!.about[0]))
    check("each in the catalog once", ["mailchimp", "zapier", "make"].every((id) => INTEGRATIONS.filter((i) => i.id === id).length === 1))
    const out = pinAfter(["meta-pixel", "klaviyo", "google-tag-manager", "printful", "zapier", "google-ads", "printify", "tiktok-pixel", "storelib-reviews", "mailchimp"], (x) => x)
    check("the directory order after Klaviyo is kept", out.join() === "meta-pixel,klaviyo,printify,printful,tiktok-pixel,google-ads,storelib-reviews,google-tag-manager,zapier,mailchimp", out)

    /* The same source both screens read: one onepage_integrations row, through the editor's own route and the sidebar's. */
    const empty = await j.call("GET /api/store/integrations/installed", { as: seller })
    check("not connected: not installed", empty.status === 200 && !(empty.json?.installed ?? []).some((i: { id: string }) => i.id === "zapier"), empty.json)
    j.db.insert("onepage_integrations", { creator_id: creator.id, provider: "zapier", status: "connected", config: {}, secret_ciphertext: null }, {})
    const editorRead = await j.call("GET /api/onepage/integrations", { as: seller })
    const installed = await j.call("GET /api/store/integrations/installed", { as: seller })
    check("connected in the OnePage editor's read", editorRead.status === 200 && editorRead.json?.integrations?.some((i: { provider: string; connected: boolean }) => i.provider === "zapier" && i.connected), editorRead.json)
    check("and installed in Settings › Integrations from that same row", installed.status === 200 && (installed.json?.installed ?? []).some((i: { id: string }) => i.id === "zapier") && !(installed.json?.installed ?? []).some((i: { id: string }) => i.id === "make"), installed.json)

    const dir = code("components/app/settings/integrations-directory.tsx")
    check("the directory reads it with the editor's own hook", /const pageIntegrations = usePageIntegrations\(\)/.test(dir) && /appId === "onepage_signups"\) return !!pageConnection\(i\)/.test(dir))
    const detail = code("components/app/settings/integration-detail.tsx")
    check("its page connects right there with the editor's own card", /item\.appId === "onepage_signups" && item\.pageIntegration \? \(\s*[\s\S]{0,200}<PageIntegrationsSection only=\{\[item\.pageIntegration\]\} \/>/.test(detail))
  }

  /* ── 3 ─────────────────────────────────────────────────────────────── */
  section("3. A OnePage's old address leads to its new one (SQL part 472)")
  {
    const sql = code("supabase/sql/run-now/472_onepage_old_addresses.sql")
    check("the part and its migration copy are the same", sql === code("supabase/migrations/20271472_onepage_old_addresses.sql"))
    check("one table: a unique old slug, its page, created_at, RLS on, service role only, idempotent", /CREATE TABLE IF NOT EXISTS public\.onepage_old_addresses/.test(sql) && /old_slug text primary key/.test(sql) && /onepage_id uuid not null references public\.onepages\(id\) on delete cascade/.test(sql) && /created_at timestamptz not null default now\(\)/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.onepage_old_addresses FROM public, anon, authenticated/.test(sql) && /TO service_role/.test(sql) && /^\/\* Part 472: /.test(sql))

    const page = pageRow()
    const moved = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, slug: "lena-studio" } })
    check("the address changes", moved.status === 200 && pageRow().slug === "lena-studio", moved.json)
    const kept = j.rows("onepage_old_addresses")
    check("the old one is kept, for this page and its owner", kept.length === 1 && kept[0].old_slug === "lena-links" && kept[0].onepage_id === page.id && kept[0].owner_id === seller.id, kept)

    const lookup = supabaseOnePageLookup(admin, "id, slug")
    const address = await resolveOnePageAddress("lena-links", lookup)
    check("storelib.me/lena-links resolves as moved to lena-studio", address.kind === "moved" && address.name === "lena-studio", address)
    const redirect = oldAddressRedirect(address, { location: "https://storelib.me/lena-links", status: 308 }, { search: "?utm_source=ig&ref=bio", mainDomain: "storelib.com" })
    check("a 308 to the new address, the query kept", redirect.status === 308 && redirect.location === "https://storelib.me/lena-studio?utm_source=ig&ref=bio", redirect)
    const viaL = onePageRoute({ host: "storelib.com", pathname: "/l/lena-links", search: "?utm_source=ig", method: "GET", userAgent: "Mozilla/5.0", mainDomain: "storelib.com" })
    check("/l/lena-links is an old address the proxy resolves the same way (query kept)", viaL?.kind === "redirect" && viaL.onePage === "lena-links" && /\?utm_source=ig$/.test(viaL.location), viaL)
    check("storelib.me/lena and custom domains render through the page route, which redirects a move with the query", /address\.kind === "moved"[\s\S]{0,700}permanentRedirect\(`\$\{onOnePageHost \? onePageUrl\(address\.name\) : getLinksInternalPath\(address\.name\)\}\$\{query\}`\)/.test(code("app/(storelib)/(marketing)/l/[slug]/page.tsx")))

    /* The taken check. */
    const other = await j.signUp("otto@example.com", { name: "Otto" })
    await j.call("POST /api/onboarding/finalize", { as: other, body: { role: "creator", creatorSlug: "otto" } })
    check("another creator: lena-links is taken while it leads to Lena's page", (await onePageNameTaken("lena-links", { userId: other.id })) === "taken")
    check("Lena herself can take it back", (await onePageNameTaken("lena-links", { onepageId: page.id, userId: seller.id })) === "free")
    kept[0].created_at = new Date(Date.now() - 31 * 86_400_000).toISOString()
    check("after 30 days it is free for anybody", (await onePageNameTaken("lena-links", { userId: other.id })) === "free")

    /* Another creator's page takes the old address: the history goes, so it never sends their visitors away. */
    const creatorO = j.rows("creators").find((c) => c.user_id === other.id)!
    dropPagesOf(other.id)
    const [pageO] = j.db.insert("onepages", { owner_id: other.id, seller_id: creatorO.id, creator_id: creatorO.id, status: "published", slug: "otto-links", theme, settings: {}, social_links: {}, draft_blocks: [] }, {})
    const taken = await j.call("PUT /api/onepage", { as: other, body: { id: pageO.id, slug: "lena-links" } })
    check("their save takes it", taken.status === 200 && j.rows("onepages").find((r) => r.id === pageO.id)?.slug === "lena-links", taken.json)
    check("the history row naming it is gone", !j.rows("onepage_old_addresses").some((r) => r.old_slug === "lena-links"), j.rows("onepage_old_addresses"))
    const now = await resolveOnePageAddress("lena-links", lookup)
    check("storelib.me/lena-links is their page now, never a redirect away", now.kind === "page" && (now.page as { id?: string }).id === pageO.id, now)
    check("and their old address leads to them", (await resolveOnePageAddress("otto-links", lookup)).kind === "moved")

    /* Back to an address the page left itself: its own row goes too. */
    await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, slug: "lena-prints" } })
    const back = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, slug: "lena-studio" } })
    check("a page going back to its own old address takes it back", back.status === 200 && !j.rows("onepage_old_addresses").some((r) => r.old_slug === "lena-studio") && j.rows("onepage_old_addresses").some((r) => r.old_slug === "lena-prints"))
    await claimOldAddress(admin, "")
    await rememberOldAddress(admin, { oldSlug: "", onepageId: page.id, ownerId: null })
    check("nothing is written for an empty address", !j.rows("onepage_old_addresses").some((r) => r.old_slug === ""))

    /* Before the SQL runs. */
    j.db.model.delete("onepage_old_addresses")
    let threw = false
    let before: Awaited<ReturnType<typeof resolveOnePageAddress>> | null = null
    try {
      before = await resolveOnePageAddress("lena-prints", supabaseOnePageLookup(admin, "id, slug"))
    } catch {
      threw = true
    }
    check("without the table: no redirect, no crash", !threw && before?.kind !== "moved", { threw, before })
    check("the taken check answers, free of history", (await oldAddressHeld(admin, "lena-prints", other.id)) === "free" && (await onePageNameTaken("lena-prints", { userId: other.id })) === "free")
    const change = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, slug: "lena-shop" } })
    check("a slug change still saves", change.status === 200 && pageRow().slug === "lena-shop", change.json)
  }

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
