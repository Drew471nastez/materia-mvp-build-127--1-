/**
 * The website's product page held at the edge.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe website's product page")
const route = read("app/(site)/w/[username]/products/[slug]/page.tsx")
check("is held for an hour, like the site's other pages (Changed on purpose (r54))", /export const revalidate = 3600/.test(route) && /export function generateStaticParams\(\)/.test(route))
check("and is no longer drawn per visit", !/export const dynamic = "force-dynamic"/.test(route) && !/export const fetchCache/.test(route))
const renderer = read("components/website-builder/theme/render-product.tsx")
check("its product is read without the visitor's cookies", !/@\/lib\/supabase\/server/.test(renderer) && /const supabase = createAdminClient\(\)/.test(renderer))
check("still only a published product", /\.eq\("slug", slug\)\.eq\("status", "published"\)/.test(renderer) && /p\.status === "published"/.test(renderer))
const revalidate = read("app/api/revalidate/route.ts")
const site = read("lib/website-builder/published-site.ts")
check("a save purges the page at every name the site answers to", /await revalidatePublishedProduct\(owned\.creator_id, slug\)/.test(revalidate) && /revalidatePath\(`\/w\/\$\{name\}\/products\/\$\{slug\}`\)/.test(site))
check("the preview and storelib.com's product page stay per visit", /export const dynamic = "force-dynamic"/.test(read("app/(site)/w/[username]/preview/[token]/products/[slug]/page.tsx")) && /export const dynamic = "force-dynamic"/.test(read("app/(storelib)/products/[slug]/page.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
