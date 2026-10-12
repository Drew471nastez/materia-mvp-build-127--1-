/**
 * The website's product page held at the edge, and the editor reading a
 * page ahead of the click.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolveEditorHref } from "../lib/website-builder/editor-navigation"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe website's product page")
const route = read("app/(site)/w/[username]/products/[slug]/page.tsx")
check("is held for a minute, like the site's other pages", /export const revalidate = 60/.test(route) && /export function generateStaticParams\(\)/.test(route))
check("and is no longer drawn per visit", !/export const dynamic = "force-dynamic"/.test(route) && !/export const fetchCache/.test(route))
const renderer = read("components/website-builder/theme/render-product.tsx")
check("its product is read without the visitor's cookies", !/@\/lib\/supabase\/server/.test(renderer) && /const supabase = createAdminClient\(\)/.test(renderer))
check("still only a published product", /\.eq\("slug", slug\)\.eq\("status", "published"\)/.test(renderer) && /p\.status === "published"/.test(renderer))
const revalidate = read("app/api/revalidate/route.ts")
const site = read("lib/website-builder/published-site.ts")
check("a save purges the page at every name the site answers to", /await revalidatePublishedProduct\(owned\.creator_id, slug\)/.test(revalidate) && /revalidatePath\(`\/w\/\$\{name\}\/products\/\$\{slug\}`\)/.test(site))
check("the preview and storelib.com's product page stay per visit", /export const dynamic = "force-dynamic"/.test(read("app/(site)/w/[username]/preview/[token]/products/[slug]/page.tsx")) && /export const dynamic = "force-dynamic"/.test(read("app/products/[slug]/page.tsx")))

console.log("\nThe editor reads a page before the click")
const switcher = read("components/website-builder/page-switcher.tsx")
check("a page row says it is about to be chosen", /onPointerEnter=\{active \|\| !onIntent/.test(switcher) && /onPointerDown=\{active \|\| !onIntent/.test(switcher) && /onFocus=\{active \|\| !onIntent/.test(switcher))
check("the menu passes it through", /onIntent=\{onIntent\}/.test(switcher))
const editor = read("app/website-builder/editor/[installId]/page.tsx")
check("both page lists read ahead", (editor.match(/onIntent=\{\(key\) => prefetchPageSections\(key as PageKey\)\}/g) ?? []).length === 2)
check("a link in the canvas does too, by the click's own rule", /onPointerOverCapture=\{[\s\S]{0,700}resolveEditorHref\(href,[\s\S]{0,400}if \(decision\.kind === "page"\) prefetchPageSections/.test(editor))
const ctx = { currentPage: "home", inspectorEnabled: true, fromNav: false, shopPath: "/products", customPageKeys: [] }
check("a section's link with the inspector on is not a page to read", resolveEditorHref("/about", ctx).kind === "ignore")
check("a header link is", resolveEditorHref("/about", { ...ctx, fromNav: true }).kind === "page")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
