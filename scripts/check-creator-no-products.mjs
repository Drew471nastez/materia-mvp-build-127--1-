/**
 * ===========================================================================
 *  A CREATOR PAGE WITH NO PRODUCTS, AND THE COMMUNITIES ROW, MEASURED
 * ===========================================================================
 * The real components (scripts/render-creator-no-products.tsx, composed as
 * app/(storelib)/(marketing)/u/[username]/page.tsx composes them) on three schemes
 * (Storelib's default, Sage, Astrid dark), as a visitor and as the owner,
 * at 1440x900 and 390x844:
 *
 *   NO HOLE          the Featured rail is gone (no empty band of its
 *                    spacing), no tab strip over an empty Home: the first
 *                    thing under the follow row is the owner's line, the
 *                    communities' heading, a section, or About, and it sits
 *                    close (no gap over 120px)
 *   COMMUNITIES      when Home has nothing, the communities stand on the
 *                    page under a "Communities" heading in the page's ink;
 *                    with a section in Home, Home and Communities are tabs
 *   NOTHING AT ALL   header, then About: no strip, no empty panel
 *   THE OWNER        "No products on your page yet" and "Add a product" to
 *                    /app/products/new, in the scheme's own colours (its
 *                    card a step off the page, the button in the buy
 *                    colour); visitors never see it
 *   EVERYWHERE       nothing scrolls sideways; on a phone the button is
 *                    40px tall
 *   /ACCOUNT ROWS    a plain member's row reads "by AndrewRullz" with no
 *                    "Members" (or any tier) beside it; an owner's says
 *                    Owner, a request says Request sent
 *
 *   PROBE_CSS=source node scripts/check-creator-no-products.mjs
 * Screenshots go to SHOTS_DIR (printed at the end).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".no-products-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-no-products-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const frames = (p, n = 2) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => location.pathname\nexport const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })\nexport const useSearchParams = () => new URLSearchParams("")\nexport const redirect = () => {}\nexport const notFound = () => {}\n`)
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"\nexport default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })\n`,
  )
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-creator-no-products.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.no-products-probe/navigation.js", "next/link": "./.no-products-probe/link.jsx", "next/image": "./.no-products-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(
    join(stubs, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const VIEWPORTS = [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]
  const open = async (vp, query) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.goto(`file://${join(stubs, "index.html")}?${query}`, { waitUntil: "load" })
    await frames(p, 3)
    return { p, errors }
  }

  const measure = (p) =>
    p.evaluate(() => {
      const r = (el) => (el ? el.getBoundingClientRect() : null)
      const cat = document.querySelector("[data-probe-catalogue]")
      /*
        Changed on purpose (round 38): no followers on a creator page, so the
        owner (who has no Follow) has no follow row at all. Then the header's
        last ink (the meta row, the owner's controls) is what the next thing
        must sit close under.
      */
      const follow = (() => {
        const row = document.querySelector("[data-storefront-follow]") || document.querySelector("[data-profile-social]")
        if (row) return r(row)
        const header = cat?.previousElementSibling
        const inks = [...(header?.querySelectorAll("h1, h2, p, a, button, img, svg") ?? [])].map(r).filter((b) => b.height > 0)
        return inks.length ? { bottom: Math.max(...inks.map((b) => b.bottom)) } : null
      })()
      const prompt = document.querySelector("[data-first-product]")
      const add = document.querySelector("[data-first-product-add]")
      const heading = document.querySelector("#storefront-communities-heading")
      const about = document.querySelector("[data-probe-about]")
      const aboutRule = about?.querySelector(".h-px")
      /* The first thing drawn under the follow row: the owner's line, a tab strip, a heading, a section, else About's rule. */
      const firstInk = (() => {
        const cands = [...(cat?.querySelectorAll("p, h2, h3, [role=tab], a, img") ?? [])].filter((el) => r(el).height > 0)
        /* The owner's card is itself what comes next: its own top edge, not the line inside it. */
        if (prompt?.firstElementChild) cands.push(prompt.firstElementChild)
        const tops = cands.map((el) => r(el).top)
        return tops.length ? Math.min(...tops) : r(aboutRule)?.top ?? null
      })()
      const cs = (el) => (el ? getComputedStyle(el) : null)
      const box = prompt?.firstElementChild
      return {
        doc: document.documentElement.scrollWidth,
        win: innerWidth,
        followBottom: follow ? Math.round(follow.bottom) : null,
        firstInk: firstInk === null ? null : Math.round(firstInk),
        tabs: [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()),
        heading: heading?.textContent?.trim() ?? null,
        headingColor: cs(heading)?.color ?? null,
        cards: document.querySelectorAll("[data-storefront-communities] a[href^='/community/']").length,
        emptyPanel: /No communities yet/.test(document.body.innerText),
        featured: /Featured/.test(cat?.innerText || ""),
        prompt: prompt
          ? {
              text: prompt.innerText.replace(/\s+/g, " ").trim(),
              bg: cs(box).backgroundColor,
              border: cs(box).borderTopColor,
              ink: cs(box.querySelector("p")).color,
              /* Round 10: a card standing in the empty place, not a banner across the page. */
              w: Math.round(r(box).width),
              colW: Math.round(r(prompt).width),
              left: Math.round(r(box).left - r(prompt).left),
              right: Math.round(r(prompt).right - r(box).right),
            }
          : null,
        add: add ? { href: add.getAttribute("href"), h: Math.round(r(add).height), bg: cs(add).backgroundColor, color: cs(add).color } : null,
        page: cs(document.querySelector("[data-storefront-root]")).backgroundColor,
        text: cs(document.querySelector("[data-storefront-root]")).color,
        aboutTop: aboutRule ? Math.round(r(aboutRule).top) : null,
        cardInk: (() => { const t = document.createElement("span"); t.style.color = "var(--card-foreground)"; document.querySelector("[data-storefront-root]").appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c })(),
      }
    })

  /* Each scheme's buy colour, which Follow and the owner's button are drawn in (lib/store-builder/storefront-chrome schemeAction). */
  const SCHEMES = { default: "rgb(37, 99, 235)", sage: "rgb(47, 93, 70)", astrid: "rgb(37, 99, 235)" }
  for (const [label, vp] of VIEWPORTS) {
    const phone = label.startsWith("phone")
    for (const scheme of Object.keys(SCHEMES)) {
      for (const view of ["visitor", "owner"]) {
        for (const content of scheme === "sage" ? ["communities", "text", "nothing"] : ["communities", "nothing"]) {
          const name = `${label}-${scheme}-${view}-${content}`
          console.log(`\n${name}`)
          const { p, errors } = await open(vp, `${scheme}&${view}&${content}`)
          await p.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
          const m = await measure(p)
          expect(m.doc <= m.win && errors.length === 0, "nothing sideways, no errors", { doc: m.doc, win: m.win, errors })
          expect(!m.featured, "no Featured rail or its empty band", m.featured)
          const gap = m.firstInk - m.followBottom
          expect(m.firstInk !== null && gap >= 0 && gap <= 120, "no hole: what comes next sits close under the follow row", { followBottom: m.followBottom, firstInk: m.firstInk, gap })
          if (content === "communities") {
            expect(m.tabs.length === 0 && m.heading === "Communities" && m.cards === 2 && !m.emptyPanel, "nothing in Home: no strip, the communities under a heading of their own", { tabs: m.tabs, heading: m.heading, cards: m.cards })
            expect(m.headingColor === m.text, "  the heading in the page's ink", { heading: m.headingColor, page: m.text })
          } else if (content === "text") {
            expect(m.tabs.join() === "Home,Communities" && m.heading === null, "a section in Home: Home and Communities are tabs, as before", m.tabs)
          } else {
            expect(m.tabs.length === 0 && m.cards === 0 && !m.emptyPanel && m.heading === null, "nothing at all: no strip, no empty panel, header then About", { tabs: m.tabs, cards: m.cards, empty: m.emptyPanel })
          }
          if (view === "owner") {
            expect(!!m.prompt && m.prompt.text === "No products on your page yet Only you see this. Publish one and it shows here. Add a product" && m.add?.href === "/app/products/new", "the owner's line, and Add a product to the new product page", { prompt: m.prompt?.text, add: m.add?.href })
            expect(m.prompt.bg !== "rgba(0, 0, 0, 0)" && m.prompt.bg !== m.page && m.prompt.ink === m.cardInk, "  a card a step off the page, in the scheme's card colours", { prompt: m.prompt, page: m.page, cardInk: m.cardInk })
            expect(m.prompt.w <= 420 && m.prompt.w < m.prompt.colW - 1 && Math.abs(m.prompt.left - m.prompt.right) <= 2, "  a card in the middle of the column, never a banner across it", m.prompt)
            expect(m.add.bg === SCHEMES[scheme], "  the button in the scheme's buy colour, as Follow is", m.add)
            if (phone) expect(m.add.h >= 40, "  40px to a thumb", m.add.h)
          } else {
            expect(!m.prompt, "a visitor never sees the owner's line", m.prompt)
          }
          await p.close()
        }
      }
    }
    console.log(`\n${label}: /account communities rows`)
    const { p, errors } = await open(vp, "rows")
    await p.screenshot({ path: join(shots, `${label}-account-rows.png`), fullPage: true })
    const rows = await p.evaluate(() => [...document.querySelectorAll("[data-community-row]")].map((li) => ({ slug: li.getAttribute("data-community-row"), by: li.querySelector("[data-community-creator]")?.innerText.replace(/\s+/g, " ").trim() })))
    expect(errors.length === 0, "no errors", errors)
    expect(rows.find((r) => r.slug === "salajanywood-club")?.by === "by AndrewRullz", "a plain member's row says only \"by AndrewRullz\": no Members", rows[0])
    expect(rows.find((r) => r.slug === "gold-room")?.by === "by AndrewRullz", "  nor any other tier's name", rows[1])
    expect(rows.find((r) => r.slug === "own-club")?.by === "by AndrewRullz · Owner" && rows.find((r) => r.slug === "asked-club")?.by === "by AndrewRullz · Request sent", "  a role and a request still say so", rows.slice(2))
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `${broken} failed` : "all passed")
process.exit(broken ? 1 : 0)
