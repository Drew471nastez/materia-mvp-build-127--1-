/**
 * ===========================================================================
 *  EACH PAGE'S OWN SEARCH RESULT, AND A DOMAIN ADDED IN PLACE
 * ===========================================================================
 * Website Settings › Pages & Navigation edits a page's title, description
 * and whether search engines see it; Domains adds a domain where it is
 * shown. Held here: what is stored, what the live page and the sitemap do
 * with it, and that replacing a connected domain is asked first.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PAGE_DESCRIPTION_MAX, PAGE_TITLE_MAX, hiddenPages, pageSeoOf, typedPageSeo, withPageSeo } from "@/lib/website-builder/page-seo"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWhat is stored")
{
  const one = withPageSeo({}, "about", { title: "About Astrid" })
  check("a page's title is stored under its key", JSON.stringify(one) === JSON.stringify({ about: { title: "About Astrid" } }), JSON.stringify(one))
  const two = withPageSeo({ page_seo: one }, "about", { hidden: true })
  check("a second field joins the first, it does not replace it", two.about?.title === "About Astrid" && two.about?.hidden === true, JSON.stringify(two))
  const other = withPageSeo({ page_seo: two }, "contact", { description: "Write to me" })
  check("and another page leaves this one as it was", other.about?.hidden === true && other.contact?.description === "Write to me")
  const cleared = withPageSeo({ page_seo: { about: { title: "About Astrid" } } }, "about", { title: "" })
  check("emptying the only field drops the page, so the value holds only what was chosen", !("about" in cleared), JSON.stringify(cleared))
  const shown = withPageSeo({ page_seo: { about: { hidden: true } } }, "about", { hidden: false })
  check("switching search back on drops the flag rather than storing false", !("about" in shown), JSON.stringify(shown))
  check("home is never stored here: its search result is the site's own", !("home" in withPageSeo({}, "home", { title: "x" })) && Object.keys(pageSeoOf({ page_seo: { home: { title: "x", hidden: true } } }, "home")).length === 0)
  const junk = withPageSeo({ page_seo: { about: "nonsense", shop: [1], faq: { hidden: "yes", title: 4 } } }, "contact", { title: "Hi" })
  check("a malformed value from anywhere is dropped on the next write", JSON.stringify(junk) === JSON.stringify({ contact: { title: "Hi" } }), JSON.stringify(junk))
  check("a long title is capped when stored", (withPageSeo({}, "about", { title: "a".repeat(500) }).about?.title ?? "").length === 120)
  check("and the limits shown are what a search result shows", PAGE_TITLE_MAX === 70 && PAGE_DESCRIPTION_MAX === 160)
}

console.log("\nWhat is read")
{
  const s = { page_seo: { about: { title: "  About\n\tAstrid  ", description: "   ", hidden: true } } }
  const seo = pageSeoOf(s, "about")
  check("whitespace and control characters are folded, and an empty field is nothing", seo.title === "About Astrid" && seo.description === undefined && seo.hidden === true, JSON.stringify(seo))
  check("a page with nothing set reads as nothing", Object.keys(pageSeoOf(s, "contact")).length === 0 && Object.keys(pageSeoOf(null, "about")).length === 0)
  check("only a real true hides a page", [...hiddenPages({ page_seo: { a: { hidden: true }, b: { hidden: "true" }, c: { hidden: 1 }, home: { hidden: true } } })].join() === "a")
  check("the inputs get what was typed, spaces included", typedPageSeo({ page_seo: { about: { title: "About " } } }, "about").title === "About ")
}

console.log("\nWhere it is used")
{
  const render = read("app/(site)/w/[username]/render-site.tsx")
  check("the live page's title and description come from the page first", /const own = pageSeoOf\(settings as Record<string, unknown>, pageKey\)/.test(render) && /own\.title \?\?/.test(render) && /own\.description \?\?/.test(render))
  check("and a hidden page says noindex", /own\.hidden \? \{ robots: \{ index: false, follow: true \} \}/.test(render))
  const data = read("lib/website-builder/site-seo-data.ts")
  check("the sitemap leaves out a hidden page", /hiddenPages\(site\.themeSettings/.test(data) && /filter\(\(k\) => !hidden\.has\(k\)\)/.test(data))
  const pages = read("components/website-builder/website-settings/pages.tsx")
  check("Pages & Navigation writes through the draft, like every other setting", /ctx\.onSettingChange\("page_seo", withPageSeo\(/.test(pages))
  check("and sends Home to SEO & Social, where its result is edited", /ctx\.go\("seo"\)/.test(pages))
}

console.log("\nA domain, added in place")
{
  const domains = read("components/website-builder/website-settings/domains.tsx")
  check("it is added with the same route the account page uses", /fetch\("\/api\/domains", \{\s*method: "POST"/.test(domains))
  check("replacing a connected domain is said, and asked, before anything is sent", /This replaces/.test(domains) && /if \(current && current\.domain !== clean && !confirming\)/.test(domains) && /For 30 days/.test(domains))
  check("a waiting domain shows the records to set and can be checked", /216\.150\.1\.1/.test(domains) && /cname\.vercel-dns\.com/.test(domains) && /\/api\/domains\/verify/.test(domains))
  const route = read("app/api/domains/route.ts")
  check("and the route is the signed-in creator's own", /auth\.getUser\(\)/.test(route) && /creator_id/.test(route))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
