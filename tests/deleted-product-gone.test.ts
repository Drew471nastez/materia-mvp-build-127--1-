/**
 * ===========================================================================
 *  "IF I DELETED THAT PRODUCT WHY IS IT STILL SHOWING?"
 * ===========================================================================
 * The report, with two pictures: a OnePage still drawing "Download $29.00"
 * and "Get Access $9.00" with the product's cover beside each, and a product
 * card for a guide that had been deleted.
 *
 * WHERE IT CAME FROM. A OnePage product block stores the product's id AND a
 * copy of what it looked like when it was added: `product_title`,
 * `product_thumbnail`, `product_price_cents`, `product_slug`. Publishing
 * copies the whole block array into `onepages.published_blocks`, so the copy
 * is frozen a second time. components/onepage/public-onepage.tsx drew every
 * one of those fields out of the block and never read the `products` table,
 * so deleting the product changed nothing on the page. It was the only
 * public surface that worked this way: the creator page, the product page,
 * explore, the built website and the sitemaps all query the product row and
 * filter on `status = 'published'`.
 *
 * WHAT IS PINNED HERE. That a block is resolved against the product as it is
 * now, that gone, archived and unpublished all take it off the page, that a
 * live one is drawn from the row rather than from the copy, and that a
 * product nobody could answer about leaves the page as it was. Then that
 * every other public surface still filters on the live status, and that a
 * delete purges the caches that were holding the product for up to ten
 * minutes afterwards.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  answersForBlocks,
  productIdsInBlocks,
  resolveProductBlocks,
  withLiveProducts,
  withoutProduct,
  type LiveProduct,
  type ProductsDb,
} from "@/lib/onepage/live-products"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const GUIDE = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
const KEPT = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"

/** The page from the report: two product rows, one of them since deleted. */
const page = () => [
  {
    id: "b1",
    type: "product",
    enabled: true,
    sort_order: 0,
    style: { background_color: "#111111" },
    data: {
      product_id: GUIDE,
      cta_text: "Download",
      show_price: true,
      style: "preview",
      product_title: "SEO + GEO/AEO Content Guide for Product Brands",
      product_thumbnail: "https://cdn.example/guide.png",
      product_price_cents: 2900,
      product_slug: "seo-geo-aeo-content-guide",
      custom_thumbnail: "https://cdn.example/mine.png",
      product_description: "Seven words the creator shortened by hand",
    },
  },
  {
    id: "b2",
    type: "product",
    enabled: true,
    sort_order: 1,
    data: {
      product_id: KEPT,
      cta_text: "Get Access",
      show_price: true,
      style: "button",
      product_title: "Old title",
      product_thumbnail: "https://cdn.example/old.png",
      product_price_cents: 900,
      product_slug: "old-slug",
    },
  },
  {
    id: "b3",
    type: "group",
    enabled: true,
    sort_order: 2,
    data: {
      layout: "stack",
      children: [
        { id: "c1", type: "product", enabled: true, sort_order: 0, data: { product_id: GUIDE, cta_text: "Buy" } },
        { id: "c2", type: "text", enabled: true, sort_order: 1, data: { content: "Still here" } },
      ],
    },
  },
  {
    id: "b4",
    type: "email_capture",
    enabled: true,
    sort_order: 3,
    data: {
      headline: "Get the free checklist",
      button_text: "Send it",
      enable_digital_product: true,
      digital_product_id: GUIDE,
      digital_product_title: "Checklist",
      digital_product_file_url: "https://cdn.example/checklist.pdf",
    },
  },
  { id: "b5", type: "text", enabled: true, sort_order: 4, data: { content: "A note that has nothing to do with products" } },
]

const live: LiveProduct = {
  id: KEPT,
  title: "Get Access, renamed",
  slug: "get-access",
  price_cents: 1200,
  thumbnail_url: "https://cdn.example/new.png",
}

const ids = (blocks: any[]) => blocks.map((b) => b.id)
const byId = (blocks: any[], id: string) => blocks.find((b) => b.id === id)

function main() {
  console.log("\n  a deleted product leaves the page it was on")

  const deleted = resolveProductBlocks(page(), new Map([[GUIDE, null], [KEPT, live]]))
  check("the row for the deleted product is gone", !ids(deleted).includes("b1"))
  check("and so is the one inside the group", !ids(byId(deleted, "b3").data.children).includes("c1"))
  check("the group itself stays, with what was beside it", ids(byId(deleted, "b3").data.children).join() === "c2")
  check("nothing else on the page moved", ids(deleted).join() === "b2,b3,b4,b5")
  check("the blocks handed in were not changed", ids(page()).join() === "b1,b2,b3,b4,b5")

  console.log("\n  a live product is drawn from the product, not from the copy in the block")

  const kept = byId(deleted, "b2").data
  check("the title comes from the row", kept.product_title === "Get Access, renamed")
  check("the price comes from the row", kept.product_price_cents === 1200)
  check("the picture comes from the row", kept.product_thumbnail === "https://cdn.example/new.png")
  check("and the address, so the button cannot point at an old slug", kept.product_slug === "get-access")
  check("what the creator set on the block is untouched", kept.cta_text === "Get Access" && kept.style === "button")

  const stillLive = resolveProductBlocks(page(), new Map([[GUIDE, { ...live, id: GUIDE }]]))
  const first = byId(stillLive, "b1").data
  check("a picture the creator chose still beats the product's cover", first.custom_thumbnail === "https://cdn.example/mine.png")
  check("and the description they shortened is left as they wrote it",
    first.product_description === "Seven words the creator shortened by hand")
  check("the block keeps its own styling", byId(stillLive, "b1").style.background_color === "#111111")

  console.log("\n  archived and unpublished go the same way, and come back")

  const rows = (status: string, archived = false) => [
    { id: GUIDE, title: "Guide", slug: "guide", price_cents: 2900, thumbnail_url: "u", status, archived },
  ]
  const dbOf = (data: any[], fail = false): ProductsDb => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => Promise.resolve(fail ? { data: null, error: { message: "no" } } : { data, error: null }),
        }),
      }),
    }),
  })

  return (async () => {
    const archived = await answersForBlocks(dbOf(rows("published", true)), "creator-1", page())
    check("a product archived by the older flag reads as not live", archived.get(GUIDE) === null)
    const byStatus = await answersForBlocks(dbOf(rows("archived")), "creator-1", page())
    check("and so does one archived by its status", byStatus.get(GUIDE) === null)
    const draft = await answersForBlocks(dbOf(rows("draft")), "creator-1", page())
    check("an unpublished product reads as not live", draft.get(GUIDE) === null)
    const published = await answersForBlocks(dbOf(rows("published")), "creator-1", page())
    check("a published one reads as live", (published.get(GUIDE) as LiveProduct)?.slug === "guide")

    const hidden = await withLiveProducts(dbOf(rows("draft")), "creator-1", page())
    check("so unpublishing takes the block off the page", !ids(hidden).includes("b1"))
    const back = await withLiveProducts(dbOf(rows("published")), "creator-1", page())
    check("and publishing it again brings the block back", ids(back).includes("b1"))

    console.log("\n  a product nobody could answer about is left exactly as it was")

    const unread = await withLiveProducts(dbOf([], true), "creator-1", page())
    check("a read that failed changes nothing", ids(unread).join() === "b1,b2,b3,b4,b5")
    const noCreator = await withLiveProducts(dbOf(rows("draft")), "", page())
    check("and neither does a page with no seller to ask about", ids(noCreator).join() === "b1,b2,b3,b4,b5")
    const notAsked = resolveProductBlocks(page(), new Map([["some-other-id", null]]))
    check("a block about a product outside the answer is kept", ids(notAsked).join() === "b1,b2,b3,b4,b5")
    const missingRow = await answersForBlocks(dbOf([]), "creator-1", page())
    check("a product the catalogue has no row for reads as gone", missingRow.get(GUIDE) === null)

    console.log("\n  an email capture keeps collecting addresses, and stops offering a file that is gone")

    const capture = byId(deleted, "b4").data
    check("the block is still on the page", !!capture)
    check("its headline and button are untouched", capture.headline === "Get the free checklist" && capture.button_text === "Send it")
    check("the delivery is off", capture.enable_digital_product === false)
    check("and names nothing", capture.digital_product_id === null && capture.digital_product_file_url === null)
    const stillGiven = resolveProductBlocks(page(), new Map([[GUIDE, { ...live, id: GUIDE }]]))
    check("a product still on sale still gets delivered", byId(stillGiven, "b4").data.enable_digital_product === true)

    console.log("\n  the catalogue is asked about every product the page names")

    const found = productIdsInBlocks(page())
    check("including one inside a group", found.includes(GUIDE) && found.includes(KEPT))
    check("each one asked about once", found.length === 2)
    check("a page with no blocks asks nothing", productIdsInBlocks(null).length === 0)

    console.log("\n  and a deleted product can be taken out of the stored page")

    const swept = withoutProduct(page(), GUIDE)
    check("every mention of it goes", ids(swept).join() === "b2,b3,b4,b5" && !JSON.stringify(swept).includes(GUIDE))
    check("the other product is left alone", JSON.stringify(swept).includes(KEPT))
    check("an empty id changes nothing", ids(withoutProduct(page(), "")).join() === "b1,b2,b3,b4,b5")

    console.log("\n  the live page resolves its blocks, every render")

    const route = strip(read("app/(storelib)/(marketing)/l/[slug]/page.tsx"))
    /* Through liveBlocksFor: withLiveProducts once per request for the metadata and the body (lib/onepage/published-page.ts). */
    check("the OnePage route reads the products", /liveBlocksFor\(/.test(route) && /withLiveProducts\(/.test(strip(read("lib/onepage/published-page.ts"))))
    check("and puts the answer back into the blocks it draws",
      /transformedOnepage\.blocks = await liveBlocksFor\(/.test(route))
    check("on a route that is not cached, so a delete shows at once", /export const dynamic = "force-dynamic"/.test(route))
    check("the handle's address draws the same route, so it is fixed too",
      /import PublicOnePageRoute/.test(read("app/(storelib)/(marketing)/[sellername]/links/page.tsx")))

    console.log("\n  every other public surface asks the product row for its status")

    const published2 = (file: string) => /\.eq\("status", "published"\)/.test(read(file))
    check("the creator page", published2("app/(storelib)/(marketing)/u/[username]/page.tsx"))
    check("the product page's shared read", published2("lib/commerce/product-page-cache.ts"))
    check("the product page's own read", published2("lib/commerce/product-page-data.ts"))
    check("explore", published2("app/(storelib)/(marketing)/explore/page.tsx"))
    check("explore by category", published2("app/(storelib)/(marketing)/explore/[category]/page.tsx"))
    check("the built website's shop", published2("lib/website-builder/shop-products.ts"))
    check("the products a website section picked by hand", published2("lib/website-builder/storefront-data-server.ts"))
    check("the website's own product page", published2("components/website-builder/theme/render-product.tsx"))
    check("the sitemaps", published2("lib/seo/sitemaps.ts"))
    check("the sitemap on a creator's own domain", published2("lib/seo/creator-domain.ts"))
    check("the website's SEO product list", published2("lib/website-builder/site-seo-data.ts"))
    check("and an archived product is not offered to a search engine",
      /p\.status !== "published" \|\| p\.archived === true/.test(read("lib/seo/indexing.ts")))
    check("a product page that finds no published row is a 404, not a broken card",
      /notFound\(\)/.test(read("app/(storelib)/(marketing)/p/[slug]/page.tsx")))

    console.log("\n  a delete drops what was cached of the product")

    const forget = strip(read("lib/products/forget-product.ts"))
    check("the product page's own entries, by slug and by id",
      /revalidateTag\(productTag\(slug\), \{ expire: 0 \}\)/.test(forget) && /revalidateTag\(productTag\(productId\), \{ expire: 0 \}\)/.test(forget))
    check("the creator's, which holds the theme and the seller's other products",
      /revalidateTag\(creatorTag\(creatorId\), \{ expire: 0 \}\)/.test(forget))
    check("the website's shop grid and its SEO product list, held for ten minutes",
      /revalidateTag\(creatorShopTag\(creatorId\), \{ expire: 0 \}\)/.test(forget))
    check("the rendered website pages", /revalidatePublishedSite\(creatorId\)/.test(forget))
    check("and both addresses the product answered on",
      /revalidatePath\(`\/p\/\$\{slug\}`\)/.test(forget) && /revalidatePath\(`\/\$\{handle\}\/\$\{slug\}`\)/.test(forget))
    check("the blocks are only taken off the page for a product that is gone",
      /export async function forgetDeletedProduct/.test(forget) && !/forgetProductOnPages/.test(forget.split("export function purgeProductCaches")[1].split("export async function forgetProductOnPages")[0]))
    check("and nothing here deletes a product, an order or a page",
      !/\.delete\(\)/.test(forget))

    const route2 = strip(read("app/api/products/forget/route.ts"))
    check("the route asks the database whether the product is really gone", /const \{ data: still \}/.test(route2))
    check("a product that is still there only has its caches purged",
      /if \(row\?\.id\) \{\s*purgeProductCaches\(/.test(route2))
    check("only the caller's own products are reachable", /\.eq\("creator_id", creatorId\)/.test(route2))
    /* Changed on purpose (round 41 team): the store comes from requireTeamPermission("products"), the owner's own or the one a team member with Products works in; signed out is still 401. */
    check("and a stranger gets nothing", /const gate = await requireTeamPermission\("products"\)/.test(route2) && /gate\.status === 401 \? NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\) : gate/.test(route2))

    console.log("\n  every screen that deletes or hides a product says so")

    const list = strip(read("app/(storelib)/app/products/products-client.tsx"))
    /* A delete is the server's now, which forgets the product once the row is really gone (tests/product-delete.test.ts). */
    const deleteRoute = strip(read("app/api/products/delete/route.ts"))
    check("the products list, after a delete",
      /await deleteProduct\(product\.id\)/.test(list) &&
        /if \(result\.kind === "deleted"\) \{\s*await forgetDeletedProduct\(admin, /.test(deleteRoute) &&
        deleteRoute.indexOf("forgetDeletedProduct(admin") > deleteRoute.indexOf('if (result.kind === "failed")'))
    check("and after archiving or restoring", /await forgetProduct\(product\.id, product\.slug\)/.test(list))
    const edit = strip(read("components/app/product-edit-form.tsx"))
    check("the product editor, after a delete", (edit.match(/await forgetProduct\(/g) ?? []).length === 2)
    check("the course editor, through the same delete", /await deleteProduct\(product\.id\)/.test(read("components/app/course-edit-form.tsx")))
    check("the product editor's delete and publish switch", /await deleteProduct\(productId\)/.test(read("app/(storelib)/app/products/new/product-editor.tsx")) && /await forgetProduct\(productId, slug\)/.test(read("app/(storelib)/app/products/new/product-editor.tsx")))
    check("the course builder's publish switch", /await forgetProduct\(/.test(read("components/app/course-builder.tsx")))
    check("and an admin deleting one from the console",
      /forgetDeletedProduct\(supabase, \{/.test(read("app/api/admin/blog/seo-metrics/route.ts")))

    console.log("\n  the database forgets it too, for the editor's own copy")

    const sql = read("supabase/sql/run-now/43_onepage_forget_deleted_product.sql")
    check("one part, run on a product delete",
      /CREATE TRIGGER onepages_forget_deleted_product AFTER DELETE ON public\.products/.test(sql))
    check("it takes the block out of the draft and the published copy",
      /SET draft_blocks = public\.onepage_blocks_without_product/.test(sql) && /published_blocks = public\.onepage_blocks_without_product/.test(sql))
    check("it can never fail the delete", /EXCEPTION WHEN OTHERS THEN RAISE WARNING/.test(sql))
    check("it deletes no row of the creator's own", !/^(DELETE|delete|TRUNCATE|truncate)\b/m.test(sql))
    check("and the pages that already hold a gone product are swept once",
      /NOT EXISTS \(SELECT 1 FROM public\.products p WHERE p\.id = v_id::uuid\)/.test(sql))
    check("the check after has a column for it",
      /p43_onepage_forget_product/.test(read("supabase/sql/run-now/99_check_after.sql")))

    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed > 0) {
      console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
      process.exit(1)
    }
  })()
}

void main()
