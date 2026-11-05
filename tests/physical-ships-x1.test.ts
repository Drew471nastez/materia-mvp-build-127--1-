/**
 * A THING THAT SHIPS ALWAYS ASKS WHERE TO (round X1)
 *
 * "Customers can reach payment without entering a shipping address." The
 * checkout asks for an address when a line requires shipping, and a line
 * read `requires_shipping` from the product row, which defaulted to false
 * until part 161. A physical product created while physical commerce was
 * off in /admin (its shipping card does not save then), or duplicated from
 * the Products list, took that default and sold with no address at all.
 *
 *   ROWS     part 168 turns those rows back to shipped, once
 *   CREATE   the editor and Duplicate write requires_shipping for a physical
 *            product themselves, never the column's default
 *   STATE    an address in a country whose post needs the state or province
 *            is refused without it, on the server
 *   BUYER    a product the seller set as not shipped says so at checkout
 *   VIEW     View in the Products list opens a physical product on the
 *            store's website, as the editor's View on your store does
 *
 *   npx tsx tests/physical-ships-x1.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"
import { readAddress } from "@/lib/physical/address"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const base = { name: "Jane Smith", line1: "1 Main St", city: "Austin", postalCode: "78701", phone: "" }

console.log("\nSTATE\n")
{
  const us = readAddress({ ...base, country: "US" })
  check("a US address with no state is refused, on the state", us.ok === false && us.field === "region", us)
  const usOk = readAddress({ ...base, country: "US", region: "TX" })
  check("  and taken with one", usOk.ok === true, usOk)
  const ca = readAddress({ ...base, country: "CA", postalCode: "M5V 2T6" })
  check("  Canada asks for the province", ca.ok === false && ca.field === "region" && /province/.test(ca.error), ca)
  const gb = readAddress({ ...base, country: "GB", city: "London", postalCode: "SW1A 1AA" })
  check("  the UK, which writes none, is taken without one", gb.ok === true, gb)
  const de = readAddress({ ...base, country: "DE", city: "Berlin", postalCode: "10115" })
  check("  so is Germany", de.ok === true, de)
  const page = code("app/(storelib)/checkout/site/site-checkout.tsx")
  check("the website's checkout asks for it before Pay too", /addressFormat\(address\.country\)\.region\?\.required\) && !address\.region\.trim\(\)\) return missing\("region"/.test(page))
}

console.log("\nROWS\n")
{
  const part = raw("supabase/sql/run-now/168_physical_products_ship_once.sql")
  const lines = part.trim().split("\n")
  check("part 168: a summary, one statement per line, the reload last", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
  check("  only physical products that say not shipped, and only once", /NOT EXISTS \(SELECT 1 FROM public\.storelib_applied_parts WHERE part = '168'\)/.test(part) && /WHERE type = 'physical' AND requires_shipping = false/.test(part))
  check("  the readable copy is the part, byte for byte", raw("supabase/migrations/20270113_physical_products_ship_once.sql") === part)
  check("  listed, and checked after", /168_physical_products_ship_once\.sql/.test(raw("supabase/sql/run-now/README.md")) && /as p168_physical_ship_once/.test(raw("supabase/sql/run-now/99_check_after.sql")))
}

console.log("\nCREATE\n")
{
  const editor = code("app/(storelib)/app/products/new/product-editor.tsx")
  check("a new physical product is written as shipped by the editor itself", /\.insert\(productType === "physical" \? \{ \.\.\.productData, requires_shipping: true \} : productData\)/.test(editor))
  const list = code("app/(storelib)/app/products/products-client.tsx")
  check("Duplicate of a physical product ships too", /\.\.\.\(product\.type === "physical" \? \{ requires_shipping: true \} : \{\}\)/.test(list))
}

console.log("\nNEVER WITHOUT AN ADDRESS\n")
{
  /* The owner: "prevent this from ever happening again". Not a column's value: a physical line always ships or is picked up. */
  const pricing = code("lib/physical/checkout-pricing-server.ts")
  check("a physical line is priced as shipped, whatever its row says", /type: "physical",[\s\S]{0,200}requiresShipping: true,/.test(pricing) && !/requiresShipping: v\.requires_shipping/.test(pricing))
  const catalog = code("lib/physical/catalog-server.ts")
  check("  every save writes it back to true, and the editor reads true", /requires_shipping: true,/.test(catalog) && !/body\.requiresShipping/.test(catalog) && !/requiresShipping: p\.requires_shipping/.test(catalog))
  check("  the editor has no switch to turn it off; pickup is how to hand over", !/This product is shipped/.test(code("components/physical/product-cards.tsx")) && /turn on local pickup in Settings › Shipping/.test(code("components/physical/product-cards.tsx")))
  check("  the storefront always quotes its delivery", !/requires_shipping === false/.test(code("lib/physical/storefront-facts.ts")) && !/requires_shipping === false/.test(code("app/api/physical/storefront/product/route.ts")))
}

console.log("\nVIEW\n")
{
  const list = code("app/(storelib)/app/products/products-client.tsx")
  check("View for a physical product is the live route, the website first", /product\.type === "physical" \? `\/api\/app\/products\/\$\{encodeURIComponent\(product\.id\)\}\/live`/.test(list))
  check("  in the table and in the row's menu", /const url = viewUrl\(product, username\)/.test(list) && /href: url, target: "_blank"/.test(list) /* Round 40: View is in the row's menu alone, on a phone and in the table. */)
  check("  and in the app, with the whole address for the phone's browser", /openExternal\(url\.startsWith\("\/"\) \? `\$\{getCanonicalSiteUrl\(\)\}\$\{url\}` : url\)/.test(list))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
