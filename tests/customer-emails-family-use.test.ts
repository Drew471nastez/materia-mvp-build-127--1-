/**
 * Emails › Customer emails, wave 9 (the owner: "if I don't sell physical
 * products or have a community, don't show those emails as if they apply,
 * but don't hide them completely either"): which families a store uses
 * (lib/emails/family-use.ts), what /api/store/emails says about it, and what
 * the list draws for a family the store does not use.
 *
 *   npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FAMILY_EMPTY, emailsInUse, familyPlan } from "@/lib/emails/family-use"
import { emailsOf } from "@/lib/emails/customer-list"
import { customerEmailsFrom } from "@/lib/emails/shapes"
import { FamilyNotUsed } from "@/components/app/emails/family-not-used"

/* The answer's type as the panel reads it (components/app/settings/customer-emails-panel.tsx CustomerEmailsData), kept apart so this suite compiles without the panel. */
type CustomerEmailsData = { shop: Record<string, unknown>; copy: Record<string, unknown>; sells?: { physical: boolean | null; communitiesOn: boolean } }

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const fam = (plan: ReturnType<typeof familyPlan>) => plan.map((p) => `${p.family}${p.inUse ? "" : "?"}`).join(",")

function draw(family: "physical" | "communities", compact: boolean, preview: boolean): string {
  return renderToStaticMarkup(React.createElement(FamilyNotUsed, { family, bare: true, compact, onPreview: preview ? () => {} : undefined }))
}

async function main() {
  console.log("\nWhich families a store uses\n")
  const both = { physical: true, communitiesOn: true }
  check("a store that ships and has a community: all three, in use, in their usual order", fam(familyPlan({ physicalOn: true, sells: both, communities: 2 })) === "digital,physical,communities")
  check("nothing shipped, no community: both kept, after Digital, marked not in use", fam(familyPlan({ physicalOn: true, sells: { physical: false, communitiesOn: true }, communities: 0 })) === "digital,physical?,communities?")
  check("a community but nothing shipped: the one in use comes before the one that is not", fam(familyPlan({ physicalOn: true, sells: { physical: false, communitiesOn: true }, communities: 1 })) === "digital,communities,physical?")
  check("ships but no community: Physical in use, Communities after it, not in use", fam(familyPlan({ physicalOn: true, sells: both, communities: 0 })) === "digital,physical,communities?")
  check("physical commerce off for Storelib: Physical products is not offered at all", fam(familyPlan({ physicalOn: false, sells: { physical: true, communitiesOn: true }, communities: 0 })) === "digital,communities?")
  check("communities off for Storelib and none: Communities is not offered", fam(familyPlan({ physicalOn: true, sells: { physical: true, communitiesOn: false }, communities: 0 })) === "digital,physical")
  check("  but a community the store already has is still listed", fam(familyPlan({ physicalOn: true, sells: { physical: true, communitiesOn: false }, communities: 1 })) === "digital,physical,communities")
  check("a read that failed (physical null) lists Physical as in use: nothing hidden on a guess", fam(familyPlan({ physicalOn: true, sells: { physical: null, communitiesOn: true }, communities: 1 })) === "digital,physical,communities")
  check("an answer from before wave 9 (no sells) lists as it did: Physical in use, no Communities without one", fam(familyPlan({ physicalOn: true, sells: undefined, communities: 0 })) === "digital,physical")
  check("Digital products is always offered and in use", [true, false].every((on) => familyPlan({ physicalOn: on, sells: null, communities: 0 })[0]?.family === "digital" && familyPlan({ physicalOn: on, sells: null, communities: 0 })[0]?.inUse === true))
  const unused = familyPlan({ physicalOn: true, sells: { physical: false, communitiesOn: true }, communities: 0 })
  check("the Emails count is only what goes out: digital's alone for a store that does neither", emailsInUse(unused, true) === emailsOf("digital", true).length, emailsInUse(unused, true))
  check("  and every family's for one that does both", emailsInUse(familyPlan({ physicalOn: true, sells: both, communities: 1 }), true) === emailsOf("all", true).length)

  console.log("\nWhat each unused family says, and where it starts\n")
  check("physical: a title, why, and Add a physical product to /app/products/new?type=physical", FAMILY_EMPTY.physical.title === "You aren't selling physical products" && /automatically/.test(FAMILY_EMPTY.physical.body) && FAMILY_EMPTY.physical.action === "Add a physical product" && FAMILY_EMPTY.physical.href === "/app/products/new?type=physical")
  check("communities: a title, why, and Create a community to /app/community/new", FAMILY_EMPTY.communities.title === "You don't have any communities" && /automatically/.test(FAMILY_EMPTY.communities.body) && FAMILY_EMPTY.communities.action === "Create a community" && FAMILY_EMPTY.communities.href === "/app/community/new")
  check("  both start pages exist", read("app/(storelib)/app/products/new/page.tsx").length > 0 && read("app/(storelib)/app/community/new/page.tsx").length > 0)

  console.log("\nThe answer, checked at the door\n")
  const shop = { name: "Shop", currency: "USD" }
  const a = customerEmailsFrom<CustomerEmailsData>({ shop, copy: {}, sells: { physical: false, communitiesOn: true } })
  check("sells is kept as booleans", a?.sells?.physical === false && a?.sells?.communitiesOn === true, a?.sells)
  const b = customerEmailsFrom<CustomerEmailsData>({ shop, copy: {}, sells: { physical: "no", communitiesOn: 1 } })
  check("  a physical of another type is unknown (null), communitiesOn only when true", b?.sells?.physical === null && b?.sells?.communitiesOn === false, b?.sells)
  const c = customerEmailsFrom<CustomerEmailsData>({ shop, copy: {}, sells: "x" })
  check("  missing or not an object: undefined, so the list draws as before", c?.sells === undefined && customerEmailsFrom<CustomerEmailsData>({ shop, copy: {} })?.sells === undefined)

  const route = read("app/api/store/emails/route.ts")
  check("the server answers sells: { physical, communitiesOn }", /sells: \{ physical, communitiesOn \}/.test(route))
  check("  physical is one row of the caller's own store's products of type physical", /from\("products"\)\.select\("id"\)\.eq\("creator_id", creatorId\)\.eq\("type", "physical"\)\.limit\(1\)/.test(route))
  check("  behind the same marketing owner check as before", /const c = await shopCaller\("marketing", \{ read: true \}\)/.test(route))
  check("  a failed read is null, never false", /if \(r\.error\) return null/.test(route) && /catch \{\s*return null/.test(route))

  console.log("\nWhat the list draws\n")
  for (const compact of [true, false]) {
    const where = compact ? "in All, one quiet row" : "alone, the house empty state"
    const ph = draw("physical", compact, true)
    check(`${where}: physical says it, why, and links Add a physical product`, /data-family-empty="physical"/.test(ph) && ph.includes("You aren&#x27;t selling physical products") && /href="\/app\/products\/new\?type=physical"/.test(ph) && /Add a physical product/.test(ph))
    check(`${where}: with Preview the emails anyway`, /data-family-peek="physical"/.test(ph) && /Preview the emails anyway/.test(ph))
    const cm = draw("communities", compact, false)
    check(`${where}: communities links Create a community, with no preview`, /data-family-empty="communities"/.test(cm) && /href="\/app\/community\/new"/.test(cm) && !/data-family-peek/.test(cm))
    check(`${where}: a 44px tap target on a phone for the action`, /h-11/.test(ph) && /min-h-11/.test(ph))
  }
  const panel = read("components/app/settings/customer-emails-panel.tsx")
  check("an unused family draws its empty state in place of its rows, Physical until previewed", /family !== "digital" && unused\.has\(family\) && !\(family === "physical" && peek\.has\(family\)\)/.test(panel))
  check("  the pills come from the plan: All, then each family offered, in use first", /\[\{ value: "all", label: tt\("All"\) \}, \.\.\.plan\.map\(/.test(panel))
  check("  a previewed family says it is a preview, with Hide", /data-family-preview=\{family\}/.test(panel) && /data-family-unpeek=\{family\}/.test(panel))
  check("  the language note only over physical rows actually shown", /shown === "physical" && \(!unused\.has\("physical"\) \|\| peek\.has\("physical"\)\)/.test(panel))
  check("the pills and the sections follow the plan, in use first", /const plan = familyPlan\(\{ physicalOn: physical, sells: data\?\.sells, communities: communities\.length \}\)/.test(panel) && /const families = shown === "all" \? plan\.map\(\(p\) => p\.family\) : \[shown\]/.test(panel))
  check("an empty state is never faded in: it is there at once", /<FamilySection key=\{family\} title=\{FAMILY_NAMES\[family\]\} bare=\{bare\}>\s*<FamilyNotUsed/.test(panel))
  check("a section that does fade in takes 150ms at most", /const VIEW_FADE_MS = 150/.test(panel))
  check("the Emails count on the page counts only families in use", /familyPlan\(\{ physicalOn: p\.physical, sells: c\?\.sells/.test(read("app/(storelib)/app/emails/emails-home.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
