/**
 * ===========================================================================
 *  WHAT A VISITOR'S ONEPAGE DOWNLOADS (round 63)
 * ===========================================================================
 * A published OnePage shipped about 1,000 KB of script (gzip, measured on the
 * route's entry files of a production build), because the blocks it draws
 * lived in the same files as their editors (the Files library, the uploaders,
 * a database client, the product picker), the product block imported the
 * whole checkout window with its words in every language, and the platform
 * header rode along in the layout though a OnePage never draws it. Now the
 * editors are files of their own, the checkout and the header are fetched
 * where they are used, and the route's entry is about 600 KB.
 *
 * And the description under a product, which the server and the browser
 * turned into text two different ways (React error 418 on storelib.me).
 */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

let passed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failures.push(`${name}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
}
const read = (f: string) => readFileSync(f, "utf8")

/* Every file a module reaches by plain (static) imports; a dynamic import() is where the browser splits. */
function reached(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length) {
    const f = queue.shift()!
    if (seen.has(f)) continue
    seen.add(f)
    let src = ""
    try {
      src = read(f)
    } catch {
      continue
    }
    const specs = [...src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1])
    for (const spec of specs) {
      const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? join(dirname(f), spec) : null
      if (!base) continue
      const hit = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"].map((e) => base + e).find((p) => existsSync(p) && /\.(tsx?|js)$/.test(p))
      if (hit) queue.push(hit)
    }
  }
  return seen
}

console.log("\n1. The live page reaches no editor, no checkout window and no database client")
const live = reached("components/onepage/public-onepage.tsx")
const editorOnly = ["components/onepage/extra-blocks-editor.tsx", "components/onepage/creator-blocks-editor.tsx", "components/onepage/storelib-blocks-editor.tsx", "components/onepage/tabs/product-block-editor.tsx", "components/onepage/image-field.tsx", "components/files/files-library.tsx", "lib/supabase/client.ts", "components/checkout/instant-checkout.tsx", "components/checkout/checkout-window.tsx", "lib/markets/checkout-words.ts"]
for (const f of editorOnly) check(`not ${f}`, !live.has(f))
check("and still draws every block", ["components/onepage/extra-blocks.tsx", "components/onepage/creator-blocks.tsx", "components/onepage/storelib-blocks.tsx", "components/onepage/product-block.tsx", "components/onepage/product-sheet.tsx"].every((f) => live.has(f)))

console.log("\n2. Fetched where they are used")
const product = read("components/onepage/product-block.tsx")
check("the checkout window is a dynamic import", /const InstantCheckout = dynamic\(\(\) => import\("@\/components\/checkout\/instant-checkout"\)/.test(product) && !/^import \{[^}]*InstantCheckout[^}]*\} from "@\/components\/checkout\/instant-checkout"/m.test(product))
check("asked for when the block comes near the screen, with the product's facts", /void import\("@\/components\/checkout\/instant-checkout"\)\.catch\(\(\) => undefined\)\s*return readProductFacts\(productId\)/.test(product))
check("the facts are their own small file, still exported from the checkout", existsSync("components/checkout/product-facts.ts") && /export \{ loadProductFacts, type ProductFacts \} from "\.\/product-facts"/.test(read("components/checkout/instant-checkout.tsx")) && /from "@\/components\/checkout\/product-facts"/.test(read("components/onepage/product-sheet.tsx")))
const header = read("components/marketing/conditional-header.tsx")
check("the platform header is fetched where a header is drawn, still drawn by the server", /const PlatformHeaderClient = dynamic\(\(\) => import\("@\/components\/platform\/platform-header-client"\)/.test(header) && !/^import \{ PlatformHeaderClient \}/m.test(header) && !/ssr: false/.test(header.split("const PlatformHeaderClient = dynamic")[1].slice(0, 300)))
check("the editor imports the editors' halves", /from "@\/components\/onepage\/extra-blocks-editor"/.test(read("components/onepage/tabs/links-tab.tsx")) && /from "@\/components\/onepage\/extra-blocks-editor"/.test(read("components/onepage/add-block-picker.tsx")) && /from "@\/components\/onepage\/creator-blocks-editor"/.test(read("components/onepage/tabs/settings-tab.tsx")))

console.log("\n3. One plain text, on the server and in the browser")
const page = read("components/onepage/public-onepage.tsx")
const fn = page.slice(page.indexOf("const stripHtmlToPlainText = "), page.indexOf("const stripHtmlToPlainText = ") + 900)
check("no branch on window and no DOMParser: the same answer in both places", !/typeof window|DOMParser/.test(fn) && /\.replace\(\/<\[\^>\]\*>\/g, " "\)/.test(fn))
/* The function itself, run on the description that broke storelib.me/tired-mom-co. */
const body = fn.slice(fn.indexOf("=>") + 2)
const NAMED = page.slice(page.indexOf("const NAMED_ENTITIES"), page.indexOf("\n", page.indexOf("const NAMED_ENTITIES")))
const strip = new Function(`${NAMED.replace(/: Record<string, string>/, "")}; return (value) => ${body.slice(0, body.indexOf("\n}\n") + 2).replace(/\(m, name: string\)/, "(m, name)")}`)() as (v: string) => string
check("a line break is a space", strip("My Friendship Skills Workbook<br>30 Pages") === "My Friendship Skills Workbook 30 Pages", strip("My Friendship Skills Workbook<br>30 Pages"))
check("a paragraph is a space", strip("<p>One</p><p>Two</p>") === "One Two")
check("entities are read", strip("Tom &amp; Jerry&rsquo;s &#8212; &#x2022; done") === "Tom & Jerry’s — • done", strip("Tom &amp; Jerry&rsquo;s &#8212; &#x2022; done"))
check("nothing is nothing", strip("") === "" && strip("   ") === "")

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
