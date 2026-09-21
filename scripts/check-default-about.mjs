/**
 * ===========================================================================
 *  AN ABOUT BLOCK WITH NOTHING TYPED IN IT IS NOT EMPTY
 * ===========================================================================
 * A creator page only carried an About block if the creator's saved config
 * had an `about` section, which only happens once they have been into the
 * store builder. So a creator who uploaded a product and never opened it got
 * a page with no About, no divider and no payment methods, against a page
 * that had all three. Reported with the two side by side.
 *
 * The argument for leaving it out is that there is nothing in it. That is
 * the claim this measures, by rendering the real section with nothing but
 * the defaults and counting what comes out: the seller's name, how long they
 * have been here, what they have sold, and which cards they take. All four
 * are true of somebody who has never opened a builder, and they are what a
 * stranger deciding whether to buy actually looks for.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-about-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-default-about.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8">
<style>${css}</style><style>body{margin:0;background:#fff}</style>
</head><body><div id="root"></div>
<script src="probe.js"></script>
<script>
setTimeout(function () {
  var root = document.getElementById("root")
  var text = root.textContent || ""
  var result = {
    rendered: root.children.length > 0,
    /* The words on it, so a heading that silently lost its name is caught. */
    heading: /About Sunshinedayzz/.test(text),
    sales: /SALES/i.test(text),
    joined: /JOINED/i.test(text),
    products: /PRODUCTS/i.test(text),
    paymentHeading: /Accepted payment methods/.test(text),
    returns: /Returns & exchanges|Returns &amp; exchanges/.test(text),
    /* The card marks themselves, which are inline SVG. */
    paymentIcons: root.querySelectorAll("svg").length,
    /* A rule the width of the block, which is what separates the stats from
       the payment row on the reference page. */
    dividers: Array.prototype.filter.call(root.querySelectorAll("div"), function (d) {
      return Math.round(d.getBoundingClientRect().height) === 1 && d.getBoundingClientRect().width > 200
    }).length,
    height: Math.round(root.getBoundingClientRect().height),
  }
  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify(result); document.body.append(pre)
}, 900)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=1280,900", "--virtual-time-budget=10000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const found = [...dom.matchAll(/<pre id="result">([\s\S]*?)<\/pre>/g)]
if (!found.length) fail("The About block never reported.")
const r = JSON.parse(found[found.length - 1][1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))

console.log(`\nThe About block, with nothing in it but the defaults\n`)
console.log(`  heading "About Sunshinedayzz"   ${r.heading}`)
console.log(`  SALES / JOINED / PRODUCTS       ${r.sales} / ${r.joined} / ${r.products}`)
console.log(`  "Accepted payment methods"      ${r.paymentHeading}, ${r.paymentIcons} card marks`)
console.log(`  the returns line                ${r.returns}`)
console.log(`  full-width rules                ${r.dividers}`)
console.log(`  and it is ${r.height}px tall\n`)

const problems = []
if (!r.rendered) problems.push("it rendered nothing at all")
if (!r.heading) problems.push("no heading with the seller's name")
if (!r.sales || !r.joined || !r.products) problems.push("the stats row is not complete")
if (!r.paymentHeading) problems.push("no payment methods heading")
if (r.paymentIcons < 6) problems.push(`only ${r.paymentIcons} card marks, wanted the six the defaults list`)
if (r.dividers < 1) problems.push("no rule between the stats and the payment row")
if (r.height < 200) problems.push(`it is only ${r.height}px tall, which is not a block`)

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("Nothing typed in, and still the four things a stranger looks for.\n")
