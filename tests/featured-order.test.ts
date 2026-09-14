/**
 * ===========================================================================
 *  THE CREATOR'S ARRANGEMENT IS THE ORDER ON THE PAGE
 * ===========================================================================
 * Home and the Products tab were the same list twice: both came from one
 * query ordered by `created_at`, and the featured section picked its products
 * out of it with `.filter()`. A filter keeps the order of the array it
 * filters — so a creator could drag their products into the arrangement they
 * wanted, it was saved in `productIds`, and the page showed them by date
 * anyway.
 *
 * This is the ordering itself, extracted so it can be run rather than read.
 */
import { pickFeatured } from "@/lib/store-builder/featured-order"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}

/* Newest first, which is how the page queries them and what Products shows. */
const NEWEST = [
  { id: "d" }, { id: "c" }, { id: "b" }, { id: "a" },
]
const ids = (list: { id: string }[]) => list.map((p) => p.id).join("")

function main() {
  console.log("\nThe creator's arrangement is the order on the page")

  check("with no picks it is everything, newest first", ids(pickFeatured(NEWEST, [])) === "dcba")
  check("and undefined picks behave the same", ids(pickFeatured(NEWEST, undefined)) === "dcba")

  /* The whole point: an arrangement that is not the date order survives. */
  check("picks come back in the creator's order", ids(pickFeatured(NEWEST, ["a", "d", "b"])) === "adb")
  check(
    "even when that order is the exact reverse of the query",
    ids(pickFeatured(NEWEST, ["a", "b", "c", "d"])) === "abcd",
  )
  /* `.filter()` would have returned "dba" for the first of those and "dcba"
     for the second — the query's order, every time. */
  check("which a filter could not do", ids(NEWEST.filter((p) => ["a", "d", "b"].includes(p.id))) === "dba")

  /* An id that no longer resolves: deleted, unpublished, or another
     creator's. `products` is already the list a visitor may see, so a miss is
     dropped rather than left as a hole. */
  check("an id that no longer resolves is dropped", ids(pickFeatured(NEWEST, ["a", "zz", "c"])) === "ac")
  check("and all of them missing is empty, not everything", pickFeatured(NEWEST, ["zz", "yy"]).length === 0)
  check("a duplicated id is not shown twice", ids(pickFeatured(NEWEST, ["a", "a", "b"])) === "ab")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
