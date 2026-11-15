/**
 * Round BA: a product page draws the product once. The owner: "in the product pages there are duplicated product
 * sections, there are two". A site the AI built kept Storelib's built-in product section (from the theme's product
 * page, or a bank site poured in) under a product section of its own.
 *
 *   1. withMainProduct on a free site: the site's own product section wins, the built-in one steps aside; a theme
 *      site keeps both (its creator placed them); a page with none still gets the built-in one.
 *   2. drawsTheProduct still knows the creator's own product sections.
 *   3. The agent's finish gate refuses a product page that draws the product twice (site.product_twice).
 *   4. The live product page passes ownWins for a free site.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/product-page-once-ba.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { withMainProduct } from "@/lib/website-builder/product-page"
import { drawsTheProduct } from "@/lib/website-builder/storelib-runtime"
import { completenessIssues } from "@/lib/ai-builder/agent/site-plan"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`) }
}
const sec = (type: string, extra: Partial<SectionInstance> = {}) => ({ id: `${type}-1`, type, name: type, settings: {}, blocks: [], ...extra }) as SectionInstance
const sources = { "sections/ai_shop_product.storelib": `<template><h1>{{ product.title }}</h1><button data-storelib-add-to-cart="{{ product.id }}">Add</button></template><schema>{"name":"Product","settings":[],"presets":[{"name":"Product"}]}</schema>` }
const own = (t: string) => drawsTheProduct(t, sources)

console.log("\n1. withMainProduct")
const both = [sec("header"), sec("product"), sec("ai_shop_product"), sec("footer")]
check("a free site: the built-in product section steps aside for the site's own", withMainProduct(both, own, { ownWins: true }).map((s) => s.type).join() === "header,ai_shop_product,footer")
check("a theme site: both stay, as its creator placed them", withMainProduct(both, own).map((s) => s.type).join() === "header,product,ai_shop_product,footer")
check("a free site with no product section of its own still gets the built-in one", withMainProduct([sec("header"), sec("footer")], own, { ownWins: true }).some((s) => s.type === "product"))
check("a hidden own section does not push the built-in one out", withMainProduct([sec("product"), sec("ai_shop_product", { hidden: true })], own, { ownWins: true }).some((s) => s.type === "product"))

console.log("\n2. drawsTheProduct")
check("the site's own product section draws the product; a grid does not", own("ai_shop_product") && !drawsTheProduct("product_grid", {}))

console.log("\n3. The agent's finish gate")
const caps = { products: [{ id: "p1", title: "Kit", kind: "digital", price: "€10", url: "/products/kit", checkout_url: "", available: true, variants: [] }] } as never
const issues = (productPage: SectionInstance[]) => completenessIssues({ pages: [{ key: "home", sections: [sec("ai_shop_hero")] }, { key: "product", sections: productPage }], sources, settings: {}, caps, mode: "blank", plan: null }).map((i) => i.code)
check("a product page that draws the product twice is refused", issues([sec("product"), sec("ai_shop_product")]).includes("site.product_twice"), issues([sec("product"), sec("ai_shop_product")]))
check("its own product section alone passes that check", !issues([sec("ai_shop_product")]).includes("site.product_twice"))
check("a hidden built-in one is not counted", !issues([sec("product", { hidden: true }), sec("ai_shop_product")]).includes("site.product_twice"))

console.log("\n4. The live product page")
const src = readFileSync(join(process.cwd(), "components/website-builder/theme/render-product.tsx"), "utf8")
check("render-product passes ownWins for a free site", /withMainProduct\([\s\S]{0,200}\{ ownWins: isFreeSite\(/.test(src))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
