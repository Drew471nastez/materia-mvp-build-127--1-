/**
 * Round R6: one favicon, set in Website settings or in an imported theme's own settings.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/favicon-sync.test.ts
 */
import { readFileSync } from "node:fs"
import { faviconFollows, faviconOf } from "@/lib/website-builder/favicon-sync"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}

const imported = { compat: { kind: "shopify", theme: "Posturex" }, shopify: { favicon: "", colors: 1 } }
const url = "https://storelib.com/media/store-builder-images/u/logos/1.png"

console.log("\nWebsite settings to the theme")
const a = faviconFollows(imported, "favicon_url", url)
check("a favicon set in Website settings is the imported theme's favicon too, its other settings kept", JSON.stringify(a) === JSON.stringify({ shopify: { favicon: url, colors: 1 } }), a)
check("  and removed there, it is removed from the theme", JSON.stringify(faviconFollows({ ...imported, shopify: { favicon: url } }, "favicon_url", "")) === JSON.stringify({ shopify: { favicon: "" } }))
check("a site built on Storelib's own themes has one place already: nothing follows", faviconFollows({ favicon_url: "" }, "favicon_url", url) === null)

console.log("\nThe theme to Website settings")
const b = faviconFollows(imported, "shopify", { favicon: url, colors: 1 })
check("a favicon set in the theme's Logos & Favicon is the site's favicon too", JSON.stringify(b) === JSON.stringify({ favicon_url: url }), b)
check("another theme setting changed leaves the favicon alone", faviconFollows({ ...imported, shopify: { favicon: url } }, "shopify", { favicon: url, colors: 2 }) === null)
check("a Shopify-only address (shopify://) is not copied to the site", faviconFollows(imported, "shopify", { favicon: "shopify://shop_images/f.png" }) === null)
check("cleared in the theme, cleared on the site", JSON.stringify(faviconFollows({ ...imported, favicon_url: url, shopify: { favicon: url } }, "shopify", { favicon: "" })) === JSON.stringify({ favicon_url: "" }))

console.log("\nReading it")
check("the site's own first", faviconOf({ ...imported, favicon_url: url, shopify: { favicon: "https://x.test/other.png" } }) === url)
check("the imported theme's when the site has none", faviconOf({ ...imported, shopify: { favicon: url } }) === url)
check("nothing a browser cannot fetch", faviconOf({ ...imported, shopify: { favicon: "shopify://shop_images/f.png" } }) === "")

console.log("\nWired in")
const editor = readFileSync("app/website-builder/editor/[installId]/page.tsx", "utf8")
check("every settings write in the editor carries the other value in the same draft change", /const follows = faviconFollows\(settingsRef\.current as Record<string, unknown>, key, value\)/.test(editor) && /\.\.\.faviconFollows\(prev as Record<string, unknown>, key, value\)/.test(editor))
check("Website settings shows the one value", /faviconOf\(ctx\.settings as Record<string, unknown>\)/.test(readFileSync("components/website-builder/website-settings/general.tsx", "utf8")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
