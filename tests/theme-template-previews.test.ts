/**
 * The templates' live previews (scripts/build-template-previews.ts): each
 * template's website prerendered to public/theme-previews/<slug>/, framed by
 * the marketplace's Preview (theme-preview.tsx).
 *
 *   whole        every template in CODE_TEMPLATES has its home page, and from
 *                it a product, a collection, the collections, about, contact,
 *                FAQ, cart, search, the blog and a post
 *   linked       every address a page, a stylesheet or a script names under
 *                /theme-previews/ is a file there; none is left pointing at
 *                the engine's own addresses or the image optimizer
 *   inert        no form posts anywhere or names an address; each page's
 *                first script is the preview shim; no analytics or prefetch
 *   unbranded    no file says "Shopify" or links to its hosts
 *   private      only rendered output: no liquid, no theme package files
 *   served       next.config.mjs sends the sandbox, the CORS header and the
 *                year long caching; the proxy leaves the folder alone; the
 *                frame is sandboxed with scripts only
 *   small        the whole folder and each template stay within a budget
 *
 *   npx tsx tests/theme-template-previews.test.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { builtinListings, CODE_TEMPLATES, TEMPLATE_PREVIEW_ROOT, templatePreviewPath } from "../lib/themes/marketplace-shared"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 700)}` : ""}`) }
}

const OUT = join("public", TEMPLATE_PREVIEW_ROOT.slice(1))
const walk = (dir: string, prefix = ""): string[] =>
  existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), `${prefix}${n}/`) : [`${prefix}${n}`])) : []
const read = (p: string) => readFileSync(p, "utf8")
const TEXT = /\.(html|css|js|json|svg)$/

const MB = 1048576
/* Changed on purpose (templates round 21): 25 templates now, each still within its own 10 MB. */
/* Changed on purpose (templates round 23): 30 and more templates, and each picture also as the smaller copies its srcset asks for (scripts/build-template-previews.ts sizedPicture, about 7 MB in all), so a phone downloads a card's file, not a 1600 pixel one. */
const BUDGET_TOTAL = 220 * MB
const BUDGET_TEMPLATE = 10 * MB

function main() {
  const files = walk(OUT)
  const texts = files.filter((f) => TEXT.test(f))
  const body = new Map(texts.map((f) => [f, read(join(OUT, f))]))

  console.log("\nEvery template, whole\n")
  check("there is a prerendered website at all", files.length > 0, OUT)
  for (const t of CODE_TEMPLATES) {
    const index = join(OUT, t.slug, "index.html")
    const listing = builtinListings().find((l) => l.slug === t.slug)!
    const html = existsSync(index) ? read(index) : ""
    const pages = files.filter((f) => f.startsWith(`${t.slug}/`) && f.endsWith(".html")).map((f) => f.slice(t.slug.length + 1))
    const need = ["index.html", "collections.html", "collections/all.html", "pages/about.html", "pages/contact.html", "pages/faqs.html", "cart.html", "search.html", "blogs/news.html"]
    const product = pages.find((p) => p.startsWith("products/"))
    const article = pages.find((p) => /^blogs\/news\/[^/]+\.html$/.test(p))
    check(`${t.name}: its home page, a product, a collection, about, contact, FAQ, cart, search, the blog and a post`, !!html && need.every((p) => pages.includes(p)) && !!product && !!article, need.filter((p) => !pages.includes(p)))
    check(`  the Preview frames it (templatePreviewPath)`, templatePreviewPath(listing) === `${TEMPLATE_PREVIEW_ROOT}/${t.slug}/index.html`)
    const linked = [...html.matchAll(/href="\/theme-previews\/([^"#?]+\.html)/g)].map((m) => m[1])
    check(`  its home page links to its own pages`, new Set(linked).size >= 3 && linked.every((l) => l.startsWith(`${t.slug}/`)), linked.slice(0, 6))
  }
  check("a listing that is not a code template has no prerendered website", templatePreviewPath({ codePackage: null }) === null && templatePreviewPath({ codePackage: "materia/nope" }) === null)

  console.log("\nLinked\n")
  const dead: string[] = []
  for (const [f, text] of body) {
    for (const m of text.matchAll(/\/theme-previews\/([A-Za-z0-9_./-]+)/g)) {
      const rel = m[1].replace(/[.,]+$/, "")
      if (!rel.includes(".") || rel.endsWith("/")) continue
      if (!existsSync(join(OUT, rel))) dead.push(`${f} -> ${rel}`)
    }
  }
  check("every file a page, a stylesheet or a script names is there", dead.length === 0, [...new Set(dead)].slice(0, 12))
  const engine = texts.filter((f) => /["'(\s]\/(?:__asset|__media|__product)\/|\/_next\/image\?url=/.test(body.get(f)!))
  check("nothing still asks the engine or the image optimizer", engine.length === 0, engine.slice(0, 8))
  const hosts = texts.filter((f) => /127\.0\.0\.1|preview\.invalid/.test(body.get(f)!) || (!f.endsWith(".js") && /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(body.get(f)!)))
  check("nothing names the build's host, and pages and stylesheets take their fonts from here", hosts.length === 0, hosts.slice(0, 8))

  console.log("\nInert\n")
  const html = texts.filter((f) => f.endsWith(".html"))
  const forms: string[] = []
  for (const f of html) {
    for (const m of body.get(f)!.matchAll(/<form\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) if (/\s(?:method|action|formaction|target)=/i.test(m[0]) || !/data-preview-form/.test(m[0])) forms.push(`${f}: ${m[0].slice(0, 120)}`)
    for (const m of body.get(f)!.matchAll(/\sformaction=/gi)) forms.push(`${f}: formaction at ${m.index}`)
  }
  check("no form posts, or names an address to go to", forms.length === 0, forms.slice(0, 6))
  const unshimmed = html.filter((f) => !/<head\b[^>]*><script data-template-preview>/.test(body.get(f)!))
  check("each page's first script is the preview shim", unshimmed.length === 0, unshimmed.slice(0, 6))
  const shim = /<script data-template-preview>([\s\S]*?)<\/script>/.exec(body.get(html[0]) ?? "")?.[1] ?? ""
  /* Changed on purpose (cards round 24): Add to cart goes into the preview's own cart (scripts/theme-templates/preview-cart.ts); a product the cart cannot hold still says it is a preview. */
  check("  it answers the store's requests itself, from the template's drawn cart", /W\.fetch=function/.test(shim) && /X\.open=function/.test(shim) && /cart\\\/add/.test(shim) && /This is a preview/.test(shim) && /cartReply\(p,o\)/.test(shim) && /var CART_DATA="\/theme-previews\/[^"]+\/a\/cart\.[0-9a-f]{12}\.json"/.test(shim))
  check("  no beacon, no new window, no submit, and it tells the marketplace when it has drawn", /sendBeacon=function\(\)\{return true\}/.test(shim) && /W\.open=function\(\)\{return null\}/.test(shim) && /FP\.submit=function\(\)\{\}/.test(shim) && /storelib:template-preview/.test(shim))
  /* Templates round 21: Add to cart, Buy now and Check out answer with a note by the button, and a link to another page is handed to the marketplace. */
  /* Changed on purpose (cards round 24): only Buy now and Check out, which would take an order, are stopped with the note; Add to cart is not among them. */
  check("  Buy now and Check out send nothing: a press is stopped first and a small note by the button says it is a preview", /W\.addEventListener\("click",function\(e\)\{var b=[^}]*if\(!buying\(b\)\)return;e\.preventDefault\(\);e\.stopImmediatePropagation\(\);showNote\(b\)\},true\)/.test(shim) && /Preview only: add this template to your library to sell from it\./.test(shim) && /if\(n==="checkout"\)return true;/.test(shim) && !/n==="add"/.test(shim))
  check("  the note is fixed (nothing on the page moves), says itself to screen readers and goes by itself", /position:fixed/.test(shim) && /role","status"/.test(shim) && /noteT=setTimeout\(hideNote,\d{4}\)/.test(shim) && /pointer-events:none/.test(shim))
  /* Changed on purpose (cards round 24): Enter in a product form's field adds to the preview's cart, as its button does. */
  check("  Enter in a product form's field submits it to the theme's script, which adds to the preview's cart", /if\(e\.key!=="Enter"[^}]*submit\(i\.form,/.test(shim) && !/if\(productForm\(i\.form\)\)\{showNote\(/.test(shim))
  check("  a link to another of its pages is handed to the marketplace once it says it takes them, and each page says when it has drawn", /storelib:template-preview-handoff/.test(shim) && /storelib:template-preview-go/.test(shim) && /storelib:template-preview-drawn/.test(shim) && /navigation\.addEventListener\("navigate"/.test(shim))
  const outward = html.filter((f) => /<a\b[^>]*href="(?:https?:|mailto:|tel:)/i.test(body.get(f)!) || /<a\b[^>]*\starget=/i.test(body.get(f)!))
  check("no link leaves the preview or opens a window", outward.length === 0, outward.slice(0, 6))
  const loose = html.filter((f) => /<a\b[^>]*href="\/(?!theme-previews\/)/i.test(body.get(f)!))
  check("every link to a page is the page's file; any other is inert", loose.length === 0, loose.slice(0, 6))
  const prefetch = html.filter((f) => /type=["']speculationrules|rel=["']?(?:prefetch|prerender|preconnect|dns-prefetch)|googletagmanager|gtag\(|fbq\(|clarity\.ms|analytics\.tiktok/i.test(body.get(f)!))
  check("no prefetch, no warmed connection, no analytics", prefetch.length === 0, prefetch.slice(0, 6))
  const framed = texts.filter((f) => /window\.self\s*!==\s*window\.top/.test(body.get(f)!))
  check("the theme does not take the frame for the website editor", framed.length === 0, framed.slice(0, 6))

  console.log("\nUnbranded and private\n")
  const vendor = texts.filter((f) => /Shopify|shopify\.com|cdn\.shopify/.test(body.get(f)!))
  check('no file says "Shopify" or names its hosts', vendor.length === 0, vendor.slice(0, 8))
  const named = files.filter((f) => /shopify/i.test(f))
  check("no file is named after it", named.length === 0, named.slice(0, 6))
  const source = files.filter((f) => /\.liquid$|settings_schema|settings_data|\.zip$/.test(f))
  const tags = texts.filter((f) => /\{%-?\s*(?:schema|render|section|if|for)\b/.test(body.get(f)!))
  check("only rendered output: no liquid, no theme settings, no package", source.length === 0 && tags.length === 0, [...source, ...tags].slice(0, 6))

  console.log("\nServed\n")
  const config = read("next.config.mjs")
  check("next.config.mjs: the folder is sandboxed, framed by storelib.com only, readable cross origin, never indexed", /source: '\/theme-previews\/:path\*'[\s\S]{0,400}Access-Control-Allow-Origin[\s\S]{0,200}sandbox allow-scripts; frame-ancestors 'self'[\s\S]{0,200}X-Robots-Tag/.test(config))
  check("  every file under a/ is kept a year", /source: '\/theme-previews\/:dir\/a\/:file\*'[\s\S]{0,120}max-age=31536000, immutable/.test(config))
  const unnamed = files.filter((f) => /\/a\//.test(`/${f}`) && !/(?:^|[./])s?[0-9a-f]{12}\.[a-z0-9]+$/.test(f))
  check("  and is named by its content", unnamed.length === 0, unnamed.slice(0, 6))
  check("the proxy leaves the folder to the CDN", /matcher: \["\/\(\(\?!_next\/static\|_next\/image\|media\/\|theme-previews\/\|/.test(read("proxy.ts")))
  check("no creator can take theme-previews as a handle", /"theme-previews",/.test(read("lib/routes/reserved-segments.ts")))
  const preview = read("app/(storelib)/app/website-builder/themes/theme-preview.tsx")
  check("the Preview frames it with scripts only and no referrer", /sandbox="allow-scripts"/.test(preview) && !/allow-same-origin|allow-forms|allow-popups|allow-top-navigation/.test(preview) && /referrerPolicy="no-referrer"/.test(preview) && /templatePreviewPath\(shown\)/.test(preview))
  /* Changed on purpose (templates round 21): each page has its own frame (no blank between two pages), so a message counts when it comes from one of the preview's frames. */
  check("  it shows the website once the website says it has drawn, and only its own frames' word counts", /el\.contentWindow === source/.test(preview) && /if \(key === null\) return/.test(preview) && /"storelib:template-preview"/.test(preview))
  check("  the next page is drawn in a frame behind the one on show and comes up only once it has drawn", /"storelib:template-preview-go"/.test(preview) && /"storelib:template-preview-drawn"/.test(preview) && /PAGE_WAIT_MS/.test(preview) && /data-preview-page=/.test(preview))
  check("whoever rebuilds the covers is told to rebuild these", /build-template-previews\.ts/.test(read("scripts/build-theme-template-covers.ts")))

  console.log("\nSmall\n")
  const size = (prefix: string) => files.filter((f) => f.startsWith(prefix)).reduce((n, f) => n + statSync(join(OUT, f)).size, 0)
  const total = size("")
  check(`the whole folder is within ${BUDGET_TOTAL / MB} MB`, total <= BUDGET_TOTAL, `${(total / MB).toFixed(1)} MB`)
  const big = CODE_TEMPLATES.map((t) => [t.slug, size(`${t.slug}/`)] as const).filter(([, n]) => n > BUDGET_TEMPLATE)
  check(`each template within ${BUDGET_TEMPLATE / MB} MB`, big.length === 0, big.map(([s, n]) => `${s} ${(n / MB).toFixed(1)} MB`))
  const stale = readdirSync(OUT).filter((d) => d !== "_base" && !CODE_TEMPLATES.some((t) => t.slug === d))
  check("no folder for a template that is gone", stale.length === 0, stale)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
