/**
 * ===========================================================================
 *  THE MEMBERSHIP SCREENS, MEASURED
 * ===========================================================================
 * The real components (scripts/render-memberships.tsx) with fixtures, at a
 * 390x844 phone and a 1280x900 computer, each one photographed:
 *
 *   LIST       every membership from every creator, the failed payment
 *              first, "3 new" on the one with unread posts, ended ones
 *              under their own heading, rows a thumb can hit (56px+)
 *   MEMBER     the feed with two unread dots; each goes out after the post
 *              has been on screen a moment, and the read is sent once to
 *              /api/memberships/<id>/read; the side (what members get,
 *              included, creator, billing) beside the feed on a computer
 *              and under it on a phone; Manage opens the action menu
 *              (a dropdown on a computer, the bottom sheet on a phone)
 *   PAST DUE   the red banner with Update card and Pay now
 *   ENDED      titles only, no text, pictures or files; Join again
 *   CREATOR    the composer (Post off until something is written), the
 *              posts as members see them with how many were emailed;
 *              Members as a table on a computer, rows on a phone; Settings
 *              with its action bar in reach at the foot of the screen
 *   CHECKOUT   monthly and yearly, the trial's "$0.00" due today, the
 *              renewal terms said in words, the app's card fields
 *
 * and everywhere: nothing scrolls sideways, no error on the page.
 *
 *   PROBE_CSS=source node scripts/check-memberships.mjs
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"
import { sweepScreens } from "./sweep-measure.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".memberships-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-memberships-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  /* The checkout as the app draws it: its own card fields, so the probe needs no Stripe.js. */
  writeFileSync(join(stubs, "platform-utils.js"), `export const isNativeApp = () => true
export const isCapacitor = () => false
export const isIOS = () => false
export const isAndroid = () => false
export const getPlatform = () => "web"
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-memberships.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": '"pk_test_probe"' },
    alias: { "@": ".", "next/navigation": "./.memberships-probe/navigation.js", "next/link": "./.memberships-probe/link.jsx", "next/image": "./.memberships-probe/image.jsx" },
    plugins: [
      {
        name: "platform-stub",
        setup(b) {
          b.onResolve({ filter: /lib\/platform-utils$/ }, () => ({ path: join(stubs, "platform-utils.js") }))
        },
      },
    ],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

  const VIEWPORTS = [
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop-1280", { width: 1280, height: 900, deviceScaleFactor: 1 }],
  ]

  async function open(screen, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    const calls = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith("https://storelib.com/__memberships_probe")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("https://storelib.com/api/")) {
        calls.push({ url: url.replace("https://storelib.com", ""), body: r.postData() || null })
        const body = url.includes("/read") ? { read: 1 } : url.includes("/posts?") ? { posts: [], hasOlder: false } : {}
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`https://storelib.com/__memberships_probe?screen=${screen}`, { waitUntil: "load" })
    await sleep(350)
    return { p, errors, calls }
  }

  const noSideScroll = (p) => p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }))
  const shot = (p, name) => p.screenshot({ path: join(shots, `${name}.png`), fullPage: true })

  for (const [label, vp] of VIEWPORTS.filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)

    /* ── LIST ─────────────────────────────────────────────────────── */
    {
      const { p, errors } = await open("list", vp)
      const rows = await p.evaluate(() =>
        [...document.querySelectorAll("[data-membership-row]")].map((a) => ({ id: a.getAttribute("data-membership-row"), h: Math.round(a.getBoundingClientRect().height), unread: a.querySelector("[data-unread-count]")?.textContent || null })),
      )
      expect(rows.length === 5, "LIST: every membership, running and ended", rows.length)
      expect(rows[0]?.id === "m1", "LIST: the failed payment first", rows[0]?.id)
      expect(rows.find((r) => r.id === "m2")?.unread === "3 new", "LIST: unread posts counted on the row", rows.find((r) => r.id === "m2")?.unread)
      expect(rows.every((r) => r.h >= 56), "LIST: every row at least 56px tall", rows.map((r) => r.h))
      const ended = await p.evaluate(() => !!document.getElementById("memberships-ended"))
      expect(ended, "LIST: ended ones under their own heading")
      const s = await noSideScroll(p)
      expect(s.scroll <= s.width, "LIST: nothing scrolls sideways", s)
      expect(errors.length === 0, "LIST: no page errors", errors)
      await shot(p, `list-${label}`)
      await p.close()
    }
    {
      const { p } = await open("list-empty", vp)
      expect(await p.evaluate(() => !!document.querySelector("[data-memberships-empty]")), "LIST: an empty library says what will be here")
      await shot(p, `list-empty-${label}`)
      await p.close()
    }

    /* ── MEMBER ───────────────────────────────────────────────────── */
    {
      const { p, errors, calls } = await open("member", vp)
      const before = await p.evaluate(() => document.querySelectorAll("[data-post][data-unread]").length)
      expect(before === 2, "MEMBER: two unread posts carry their dot", before)
      await shot(p, `member-${label}`)
      /* The first post is on screen from the start; scroll the second into view and wait past the 1.2s read time. */
      await p.evaluate(() => document.querySelector('[data-post="p2"]').scrollIntoView({ block: "center" }))
      await sleep(2600)
      const after = await p.evaluate(() => document.querySelectorAll("[data-post][data-unread]").length)
      const reads = calls.filter((c) => c.url === "/api/memberships/m2/read")
      const sent = reads.flatMap((c) => JSON.parse(c.body || "{}").postIds || [])
      expect(after === 0, "MEMBER: the dots go out once the posts have been seen", after)
      expect(sent.includes("p1") && sent.includes("p2") && new Set(sent).size === sent.length, "MEMBER: each read is sent once", sent)
      const layout = await p.evaluate(() => {
        const feed = document.querySelector("#member-feed").closest("section").getBoundingClientRect()
        const side = document.querySelector('aside[aria-label="About this membership"]').getBoundingClientRect()
        return { feedX: Math.round(feed.left), sideX: Math.round(side.left), feedBottom: Math.round(feed.bottom + scrollY), sideTop: Math.round(side.top + scrollY), feedW: Math.round(feed.width) }
      })
      if (phone) expect(layout.sideTop >= layout.feedBottom, "MEMBER: on a phone the side follows the feed", layout)
      else expect(layout.sideX > layout.feedX + 400 && layout.feedW >= 560, "MEMBER: on a computer the side is beside a feed wide enough to read", layout)
      await p.evaluate(() => scrollTo(0, 0))
      await p.click("[data-manage]")
      await p.waitForFunction(() => !!document.querySelector('[role="dialog"] button, [role="menuitem"]'), { timeout: 3000 }).catch(() => null)
      await sleep(phone ? 500 : 200)
      const menu = await p.evaluate(() => {
        const texts = [...document.querySelectorAll('[role="menuitem"], [role="dialog"] button, [role="dialog"] a')].map((e) => e.textContent.trim())
        return texts.filter(Boolean)
      })
      expect(menu.includes("Cancel membership") && menu.some((t) => t.includes("card")), "MEMBER: Manage offers cancel and the card", menu)
      await shot(p, `member-manage-${label}`)
      const s = await noSideScroll(p)
      expect(s.scroll <= s.width, "MEMBER: nothing scrolls sideways", s)
      expect(errors.length === 0, "MEMBER: no page errors", errors)
      await p.close()
    }
    {
      const { p, errors } = await open("past-due", vp)
      const banner = await p.evaluate(() => {
        const b = document.querySelector('[data-banner="bad"]')
        return b ? { text: b.textContent, buttons: [...b.querySelectorAll("button")].map((x) => x.textContent) } : null
      })
      expect(!!banner && banner.buttons.includes("Update card") && banner.buttons.includes("Pay now") && /by Oct 3, 2026/.test(banner.text), "PAST DUE: the banner says the date and offers Update card and Pay now", banner)
      expect(errors.length === 0, "PAST DUE: no page errors", errors)
      await shot(p, `past-due-${label}`)
      await p.close()
    }
    {
      const { p } = await open("ended", vp)
      const locked = await p.evaluate(() => ({
        text: [...document.querySelectorAll("[data-post]")].every((a) => a.textContent.includes("For members.")),
        pictures: document.querySelectorAll("[data-post] img").length,
        files: document.querySelectorAll('[data-post] a[href*="/api/memberships/files"]').length,
        join: [...document.querySelectorAll("a")].some((a) => a.textContent === "Join again"),
      }))
      expect(locked.text && locked.pictures === 0 && locked.files === 0, "ENDED: titles only, no pictures or files", locked)
      expect(locked.join, "ENDED: Join again")
      await shot(p, `ended-${label}`)
      await p.close()
    }

    /* ── CREATOR ──────────────────────────────────────────────────── */
    {
      const { p, errors } = await open("creator", vp)
      const empty = await p.evaluate(() => document.querySelector("[data-post-button]").disabled)
      await p.type("#post-body", "New lesson is up")
      const typed = await p.evaluate(() => document.querySelector("[data-post-button]").disabled)
      expect(empty && !typed, "CREATOR: Post is off until something is written", { empty, typed })
      const emailed = await p.evaluate(() => document.body.textContent.includes("Emailed to 128 members"))
      expect(emailed, "CREATOR: each post says how many it was emailed to")
      const s = await noSideScroll(p)
      expect(s.scroll <= s.width, "CREATOR: nothing scrolls sideways", s)
      expect(errors.length === 0, "CREATOR: no page errors", errors)
      await shot(p, `creator-updates-${label}`)
      await p.close()
    }
    {
      const { p } = await open("members", vp)
      const shape = await p.evaluate(() => {
        const table = document.querySelector("table")
        return { table: !!table && getComputedStyle(table).display !== "none", rows: document.querySelectorAll('section[aria-label="Members"] li').length }
      })
      if (phone) expect(!shape.table && shape.rows === 5, "MEMBERS: rows on a phone", shape)
      else expect(shape.table, "MEMBERS: a table on a computer", shape)
      await p.click('[role="tab"]:nth-child(4)')
      await sleep(100)
      const failed = await p.evaluate(() => [...document.querySelectorAll('section[aria-label="Members"] li, section[aria-label="Members"] tbody tr')].filter((e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0).length)
      expect(failed === 1, "MEMBERS: the Payment failed view shows the one", failed)
      const s = await noSideScroll(p)
      expect(s.scroll <= s.width, "MEMBERS: nothing scrolls sideways", s)
      await shot(p, `creator-members-${label}`)
      await p.close()
    }
    {
      const { p, errors } = await open("settings", vp)
      const bar = await p.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "Save" || x.textContent === "Take off sale")
        const r = b.closest(".sticky").getBoundingClientRect()
        return { bottom: Math.round(r.bottom), vh: innerHeight }
      })
      expect(bar.bottom <= bar.vh && bar.bottom >= bar.vh - 140, "SETTINGS: the actions stay in reach at the foot of the screen", bar)
      const s = await noSideScroll(p)
      expect(s.scroll <= s.width, "SETTINGS: nothing scrolls sideways", s)
      expect(errors.length === 0, "SETTINGS: no page errors", errors)
      await shot(p, `creator-settings-${label}`)
      await p.close()
    }

    /* ── CHECKOUT ─────────────────────────────────────────────────── */
    {
      const { p, errors } = await open("checkout", vp)
      await sleep(200)
      const first = await p.evaluate(() => ({ due: document.querySelector("[data-due-today]")?.textContent, total: document.querySelector("[data-total]")?.textContent, terms: document.querySelector("[data-renewal-terms]")?.textContent || "" }))
      expect(first.due === "$0" && /\$9\/month/.test(first.total), "CHECKOUT: a trial is $0 today, then $9 a month", first)
      expect(/Nothing is charged today/.test(first.terms) && /until you cancel/.test(first.terms), "CHECKOUT: the renewal is said in words", first.terms)
      await p.click('[data-interval="year"]')
      await sleep(100)
      const year = await p.evaluate(() => document.querySelector("[data-total]")?.textContent)
      expect(/\$90\/year/.test(year), "CHECKOUT: yearly switches the price", year)
      const s = await noSideScroll(p)
      expect(s.scroll <= s.width, "CHECKOUT: nothing scrolls sideways", s)
      const fonts = await p.evaluate(() => [...document.querySelectorAll("input")].filter((i) => i.type !== "checkbox" && i.offsetParent).map((i) => parseFloat(getComputedStyle(i).fontSize)))
      if (phone) expect(fonts.every((f) => f >= 16), "CHECKOUT: fields are 16px on a phone, so iOS does not zoom", fonts)
      expect(errors.length === 0, "CHECKOUT: no page errors", errors)
      await shot(p, `checkout-${label}`)
      await p.close()
    }
  }

  /* SWEEP: the buyer's screens and the creator's at six widths (scripts/sweep-measure.mjs). */
  console.log("\nsweep at six widths")
  {
    const problems = await sweepScreens(["list", "list-empty", "member", "past-due", "ended", "creator", "members"], async (screen, vp) => {
      const { p, errors } = await open(screen, vp)
      p.errors = errors
      return p
    }, { shots })
    expect(problems.length === 0, "every memberships screen reads clean at every width", problems)
  }

  await browser.close()
  console.log(`\npictures in ${shots}`)
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
