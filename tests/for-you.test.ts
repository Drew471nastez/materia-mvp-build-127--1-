/**
 * "For you", and the threshold under which it does not appear.
 *
 * Two rules worth protecting, because both are the kind that look fine on the
 * one account somebody tries them with:
 *
 *   NOT ENOUGH IS NOT A LITTLE. Below the threshold nothing changes at all.
 *   A row half built from one purchase is worse than no personalisation:
 *   it tells somebody the shop thinks it knows them, using one data point.
 *
 *   FOR YOU IS AN ORDER, NOT A FILTER. Ranking keeps the whole catalogue
 *   underneath, so the page never runs out and the pager still has rows.
 *
 * Run with:  npm run test:push
 */

import {
  EMPTY_INTERESTS,
  FOR_YOU_ID,
  buildPillRow,
  interestScore,

} from "../lib/explore/interests"
import { readInterests } from "../lib/explore/read-interests"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`)
  }
}

const GENERAL = ["all", "design", "development", "business", "marketing", "ai", "education", "productivity", "video"]
const KNOWN = [...GENERAL, "photography", "audio-music", "social-media", "ecommerce", "freebies", "other"]

/** Enough of the supabase builder for this read. */
function client(rows: Record<string, any[]>) {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        then: (res: any, rej: any) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(res, rej),
      }
      return builder
    },
  }
}

async function main() {
  console.log("\nBelow the threshold, nothing changes\n")

  {
    /* One purchase. A purchase is not a taste. */
    const interests = await readInterests("u1", "a@b.c", {
      supabase: client({ entitlements: [{ product_id: "p1" }], wishlist_items: [] }),
      admin: client({
        products: [{ id: "p1", category: "design", creator_id: "c1" }],
        subscribers: [],
      }),
    })
    check("one product is not enough", !interests.enough, `productCount ${interests.productCount}`)
    const row = buildPillRow(interests, GENERAL, KNOWN)
    check("so the first pill is still All", row.firstId === "all" && row.firstLabel === "All")
    check("and the row is the one everybody gets", row.ids.join(",") === GENERAL.filter((g) => g !== "all").join(","))
    check("and nothing is marked as personalised", row.personalised.length === 0)
    check("and a product scores nothing", interestScore({ category: "design", creator_id: "c1" }, interests) === 0)
  }

  {
    /* Three products, but no two of them agree on anything. */
    const interests = await readInterests("u1", null, {
      supabase: client({
        entitlements: [{ product_id: "p1" }],
        wishlist_items: [{ product_id: "p2" }, { product_id: "p3" }],
      }),
      admin: client({
        products: [
          { id: "p1", category: "design", creator_id: "c1" },
          { id: "p2", category: "video", creator_id: "c2" },
          { id: "p3", category: "education", creator_id: "c3" },
        ],
        subscribers: [],
      }),
    })
    check(
      "three products across three unrelated categories is not a taste either",
      !interests.enough,
      `categories ${interests.categories.join("/")}, enough=${interests.enough}`,
    )
  }

  console.log("\nPast it, the row is theirs\n")

  const interests = await readInterests("u1", "a@b.c", {
    supabase: client({
      entitlements: [{ product_id: "p1" }, { product_id: "p2" }],
      wishlist_items: [{ product_id: "p3" }, { product_id: "p4" }],
    }),
    admin: client({
      products: [
        { id: "p1", category: "design", creator_id: "c1" },
        { id: "p2", category: "design", creator_id: "c1" },
        { id: "p3", category: "photography", creator_id: "c2" },
        { id: "p4", category: "ai", creator_id: "c3" },
      ],
      subscribers: [{ creator_id: "c9" }],
    }),
  })

  check("four products with a category in common is enough", interests.enough)
  check("the strongest category is the one they paid for twice", interests.categories[0] === "design", interests.categories.join("/"))
  check("the creator they bought from twice ranks first", interests.creatorIds[0] === "c1", interests.creatorIds.join("/"))
  check("a creator they only subscribed to is still in the list", interests.creatorIds.includes("c9"))
  check("and what they own is remembered", interests.ownedProductIds.sort().join(",") === "p1,p2")

  const row = buildPillRow(interests, GENERAL, KNOWN)
  check("the first pill becomes For you", row.firstId === FOR_YOU_ID && row.firstLabel === "For you")
  check("three of their own categories come first", row.ids.slice(0, 3).join(",") === interests.categories.slice(0, 3).join(","), row.ids.join(","))
  check(
    "photography is offered even though the general row has no pill for it",
    row.ids.includes("photography"),
    row.ids.join(","),
  )
  check("the row does not grow", row.ids.length === GENERAL.length - 1, `${row.ids.length} vs ${GENERAL.length - 1}`)
  check("no category appears twice", new Set(row.ids).size === row.ids.length, row.ids.join(","))
  check("and exactly three are marked as theirs", row.personalised.length === 3)

  console.log("\nFor you is an order, not a filter\n")

  const catalogue = [
    { id: "x1", category: "business", creator_id: "zz" },
    { id: "x2", category: "design", creator_id: "zz" },
    { id: "x3", category: "video", creator_id: "c1" },
  ]
  const ranked = [...catalogue].sort((a, b) => interestScore(b, interests) - interestScore(a, interests))
  check(
    "a product by a creator they bought from outranks one merely in their category",
    ranked[0].id === "x3",
    ranked.map((p) => `${p.id}:${interestScore(p, interests)}`).join(" "),
  )
  check("their category still beats an unrelated one", ranked[1].id === "x2")
  check("and nothing is dropped", ranked.length === catalogue.length)
  check(
    "a signed-out visitor ranks everything the same",
    catalogue.every((p) => interestScore(p, EMPTY_INTERESTS) === 0),
  )

  console.log(`\n  ${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`  failing: ${failures.join(", ")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
