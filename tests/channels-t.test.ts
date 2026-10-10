/**
 * Round T: sales channels. Storelib's three (Online store, Creator page,
 * Explore) and a store's own; a product taken off one really leaves it.
 *
 *   npx tsx tests/channels-t.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BUILT_IN_KINDS, channelKey, listedOn, readChannel, startingChannels, withBuiltIns, type Channel } from "@/lib/store/channels"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe channels\n")
{
  const none = withBuiltIns([])
  check("a store that never opened Sales channels has Storelib's three, with no rows", none.length === 3 && none.every((c) => c.id === null && c.enabled) && none.map((c) => c.kind).join() === BUILT_IN_KINDS.join(), none)
  const own: Channel = { id: "11111111-1111-4111-8111-111111111111", kind: "custom", name: "Market stall", description: null, enabled: true }
  const renamed: Channel = { id: "22222222-2222-4222-8222-222222222222", kind: "storefront", name: "Something else", description: null, enabled: false }
  const both = withBuiltIns([own, renamed])
  check("the built-ins first, then the store's own; a built-in keeps its name and is always on", both[0].id === renamed.id && both[0].name === "Online store" && both[0].enabled && both.at(-1)?.name === "Market stall")
  check("a channel is named by its id, or by its kind before it has one", channelKey(none[0]) === "storefront" && channelKey(own) === own.id)
  check("a new product starts on every channel unless one is chosen", startingChannels(both, null).size === 4 && [...startingChannels(both, own.id as string)].join() === own.id)
  check("  a chosen channel that is gone or off means every channel", startingChannels(both, "33333333-3333-4333-8333-333333333333").size === 4 && startingChannels([...both.slice(0, 3), { ...own, enabled: false }], own.id as string).size === 3)
  check("a name is 1 to 80 characters, no markup", readChannel({ name: " <i>Wholesale</i> " }).ok && !readChannel({ name: " " }).ok && (readChannel({ name: "x".repeat(99) }) as { name: string }).name.length === 80)
  check("a list keeps every product but the ones taken off", listedOn([{ id: "a" }, { id: "b" }], new Set(["b"])).map((p) => p.id).join() === "a" && listedOn([{ id: "a" }], new Set()).length === 1)
}

console.log("\nTaking a product off really hides it there\n")
{
  const shop = read("lib/website-builder/shop-products.ts")
  check("the online store's lists (sections, /products, collections pages) leave it out", /rows = listedOn\(rows, await offChannel\(db, creatorId, "storefront"\)\)/.test(shop))
  check("  and the filter is a plain module, since the browser loads shop-products too", /from "@\/lib\/store\/channel-filter"/.test(shop) && !/channels-server/.test(shop) && !/server-only/.test(read("lib/store/channel-filter.ts")))
  check("  its collections", /offChannel\(db, creatorId, "storefront"\)/.test(read("lib/website-builder/storefront-collections-server.ts")))
  check("  a section that picked it", /offStore\.has\(String\(p\.id\)\)/.test(read("lib/website-builder/storefront-data-server.ts")))
  check("  its search", /offChannel\(admin, creatorId, "storefront"\)/.test(read("app/api/website-builder/search/route.ts")))
  const page = read("app/(marketing)/u/[username]/page.tsx")
  check("the creator page's grid, read with the server's client (the rows are the owner's)", /offChannel\(createAdminClient\(\), creator\.id, "creator_page"\)/.test(page))
  check("  and the one page", /offChannel\(db, creatorId, "creator_page"\)/.test(read("lib/onepage/live-products.ts")))
  check("Explore, its categories and its search", /offChannelAmong\(createAdminClient\(\), products\.map/.test(read("app/(marketing)/explore/page.tsx")) && /offChannelAmong\(createAdminClient\(\), catalogue\.map/.test(read("app/(marketing)/explore/[category]/page.tsx")) && /offChannelAmong\(admin,/.test(read("app/api/v2/search/route.ts")))
  const filter = read("lib/store/channel-filter.ts")
  check("both filters fail open: an error hides nothing", (filter.match(/return new Set\(\)/g) ?? []).length >= 4)
}

console.log("\nWhere it is set\n")
{
  const editor = read("app/app/products/new/product-editor.tsx")
  check("the product editor has a Sales channels card, saved after the product exists", /<SalesChannelsCard ref=\{channelsRef\}/.test(editor) && /await channelsRef\.current\?\.save\(finalProductId\)/.test(editor))
  const card = read("app/app/products/new/sales-channels-card.tsx")
  check("  a new product starts where Settings says; nothing is sent when nothing changed", /startingChannels\(d\.channels, d\.defaultKey\)/.test(card) && /if \(!loaded \|\| !loaded\.ready \|\| !dirty\.current\) return null/.test(card))
  const server = read("lib/store/channels-server.ts")
  check("the product must be the caller's, and its channels are set whole", /from\("products"\)\.select\("id"\)\.eq\("id", productId\)\.eq\("creator_id", creatorId\)/.test(server) && /\.not\("channel_id", "in"/.test(server))
  check("Storelib's channels can't be renamed or removed", /Storelib's own channels keep their names/.test(server) && /Storelib's own channels can't be removed/.test(server))
  check("a built-in channel's row is made the first time it is needed", /async function builtInId/.test(server) && /is_storefront: kind === "storefront"/.test(server))
  const form = read("components/app/settings-form-new.tsx")
  check("Settings has Sales channels in Store, for every store", /\{ id: "channels", label: "Sales channels"[^}]*group: "store"/.test(form) && /panelTab === "channels" && <ChannelsPanel \/>/.test(form) && !/COMMERCE_TABS = new Set<string>\(\[[^\]]*"channels"/.test(form))
  const sql = read("supabase/sql/run-now/111_sales_channel_kinds.sql")
  check("part 111 gives channels a kind, one of each built-in a store, and hides nothing", /ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom'/.test(sql) && /sales_channels_one_of_kind/.test(sql) && !/INSERT INTO public\.product_channel_listings/i.test(sql))
  const routes = read("app/api/store/channels/route.ts") + read("app/api/store/channels/product/route.ts")
  check("the routes are the owner's alone", (routes.match(/shopCaller\(\)/g) ?? []).length >= 4)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
