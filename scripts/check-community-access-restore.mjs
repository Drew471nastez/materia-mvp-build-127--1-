/**
 * ===========================================================================
 *  ROUND 14: THE ACCESS CARD AND THE NOT ACTIVE VIEW, MEASURED (worker C)
 * ===========================================================================
 * The real components (scripts/render-community-access-restore.tsx) in a
 * stand-in for the /app shell, at 1440x900 and on a 390x844 phone:
 *
 *   FITS      nothing scrolls sideways, on the page or in the pane
 *   TAPS      on a phone every button, link, field and tab is 40px or more
 *   ACCESS    one card with two choices (who can get in, what it costs) and
 *             a line underneath saying what the pair means, with the price
 *             in it; on a private free community the same card says free
 *   MEMBERS   the Not active view: a row per person with what happened, who
 *             did it, when and why, and the undo on the row; the undo is
 *             missing where the person who acted outranks the viewer
 *
 *   PROBE_CSS=source node scripts/check-community-access-restore.mjs
 * Screenshots land in SHOTS_DIR (or a temp dir, printed at the end).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".community-access-restore-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-access-restore-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => window.__path || "/app/community"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`,
  )
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-access-restore.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-access-restore-probe/navigation.js", "next/link": "./.community-access-restore-probe/link.jsx" },
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
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const CASES = (process.env.CASES || "access,access-free,members,members-mod,members-active").split(",")
  for (const [label, vp] of [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ].filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))) {
    const phone = label.startsWith("phone")
    for (const c of CASES) {
      console.log(`\n${label} ${c}`)
      const p = await browser.newPage()
      await p.setViewport(vp)
      const errors = []
      p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      await p.goto(`file://${join(stubs, "index.html")}?case=${c}`, { waitUntil: "load" })
      await sleep(450)
      expect(errors.length === 0, "renders without an error", errors)

      const fits = await p.evaluate(() => {
        const panes = [...document.querySelectorAll(".orders-pane, .app-content-scroll")]
        return { doc: document.scrollingElement.scrollWidth - innerWidth, pane: Math.max(0, ...panes.map((x) => x.scrollWidth - x.clientWidth)) }
      })
      expect(fits.doc <= 0 && fits.pane <= 0, "FITS: nothing scrolls sideways", fits)

      if (phone) {
        const small = await p.evaluate(() => {
          const out = []
          for (const el of document.querySelectorAll("main button, main a[href], main input, main select, main textarea, main [role=tab], main [role=switch], main [role=radio]")) {
            const r = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || el.closest("[hidden],[aria-hidden=true],.sr-only")) continue
            if (el.matches("input[type=file]")) continue
            if (el.closest("p") && el.tagName === "A") continue
            const after = getComputedStyle(el, "::after")
            const grow = after.content !== "none" && after.position === "absolute" ? Math.max(0, -parseFloat(after.top || "0")) * 2 : 0
            const h = r.height + grow
            const w = r.width + grow
            if (h < 40 || (w < 40 && el.tagName !== "TEXTAREA")) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 30)}" ${Math.round(w)}x${Math.round(h)}`)
          }
          return out
        })
        expect(small.length === 0, "TAPS: every control is 40px or more on a phone", small.slice(0, 8))
      }

      await p.screenshot({ path: join(shots, `${label}-${c}.png`) })

      if (c === "access" || c === "access-free") {
        const card = await p.evaluate(() => {
          const groups = [...document.querySelectorAll('[data-access=""] [role=radiogroup]')].map((g) => ({
            label: g.getAttribute("aria-label"),
            options: [...g.querySelectorAll("[role=radio]")].map((r) => ({ value: r.getAttribute("data-choice"), on: r.getAttribute("aria-checked") === "true", title: r.querySelector("span + span > span")?.textContent?.trim() ?? r.textContent.trim().slice(0, 24) })),
          }))
          const summary = document.querySelector("[data-access-summary]")
          const section = summary?.closest("section, div[class*=rounded]")
          return { groups, summary: summary?.textContent?.trim() ?? null, oneCard: Boolean(section && section.contains(document.querySelector('[data-access=""] [role=radiogroup]'))) }
        })
        expect(card.groups.length === 2, "ACCESS: two choices, not one switch", card.groups.map((g) => g.label))
        expect(card.groups[0]?.label === "Who can get in" && card.groups[1]?.label === "What joining costs", "ACCESS: who can get in, then what it costs", card.groups.map((g) => g.label))
        const privacyOn = card.groups[0]?.options.find((o) => o.on)
        const pricingOn = card.groups[1]?.options.find((o) => o.on)
        expect(privacyOn?.value === "private", "ACCESS: the private community reads as private", privacyOn)
        expect(pricingOn?.value === (c === "access-free" ? "free" : "paid"), "ACCESS: and its price reads back", pricingOn)
        expect(card.groups[0]?.options.length === 3 && card.groups[1]?.options.length === 2, "ACCESS: three ways in, two prices", [card.groups[0]?.options.length, card.groups[1]?.options.length])
        if (c === "access") {
          expect(/Only people with your link can join, and it costs \$19\/month\./.test(card.summary ?? ""), "ACCESS: the line underneath says what the pair means, with the price", card.summary)
        } else {
          expect(/Only people with your link can join, and it is free\./.test(card.summary ?? ""), "ACCESS: a private free community says that instead", card.summary)
        }
        expect(card.oneCard, "ACCESS: both choices and the line are in one card", card.oneCard)
        /* The price control asks for a paid tier first when there is none to sell. */
        if (c === "access-free") {
          await p.click('[data-access=""] [role=radiogroup][aria-label="What joining costs"] [data-choice="paid"]')
          await sleep(250)
          const asked = await p.evaluate(() => ({ error: document.querySelector('[data-access=""] [role=alert]')?.textContent?.trim() ?? null, sent: (window.__sent || []).length }))
          expect(/Add a paid tier with a price first/.test(asked.error ?? ""), "ACCESS: no paid tier yet, so it asks for one instead of saving", asked)
          await p.screenshot({ path: join(shots, `${label}-access-needs-tier.png`) })
        }
      }

      if (c === "members") {
        const view = await p.evaluate(() => {
          const tabs = [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim().replace(/\s+/g, " "))
          const rows = [...document.querySelectorAll("[data-member-row]")]
          /* The table on a computer, the list on a phone: whichever is on screen. */
          const shown = rows.filter((r) => r.getBoundingClientRect().height > 0)
          return {
            tabs,
            rows: shown.length,
            lines: shown.map((r) => (r.querySelector("[title]")?.getAttribute("title") ?? r.textContent).replace(/\s+/g, " ").trim()),
            undos: shown.map((r) => r.querySelector("[data-undo]")?.textContent?.trim() ?? null),
          }
        })
        expect(view.tabs.some((t) => /^Not active/.test(t)), "MEMBERS: one view for everybody who is not active", view.tabs)
        expect(view.rows === 5, "MEMBERS: a row per person", view.rows)
        expect(/Banned by Ana Maker/.test(view.lines[0] ?? ""), "MEMBERS: the row says what happened and who did it", view.lines[0])
        expect(/posting the same link in every space/.test(view.lines[0] ?? ""), "MEMBERS: and the reason when there is one", view.lines[0])
        expect(/Removed by Bo Admin/.test(view.lines[1] ?? ""), "MEMBERS: a removal says the same", view.lines[1])
        expect(/^Removed$/.test((view.lines[4] ?? "").replace(/Juno Fields|juno|member15@example.com|\s*·\s*/g, "").trim()) || /Removed/.test(view.lines[4] ?? ""), "MEMBERS: with nobody on record it still says what happened", view.lines[4])
        const back = phone ? "Let back in" : "Let them back in"
        expect(view.undos[0] === "Unban" && view.undos[1] === back && view.undos[2] === "Bring back" && view.undos[3] === "Unmute", "MEMBERS: the undo on each row, named for what it undoes", view.undos)
        expect(view.undos[4] === back, "MEMBERS: a removal with no record of who may still be undone", view.undos[4])
        /* Pressing it asks first, in Storelib's words. The table and the list are both in the markup, so press the one on screen. */
        await p.evaluate(() => {
          const button = [...document.querySelectorAll("[data-member-row] [data-undo]")].find((b) => b.getBoundingClientRect().height > 0)
          button.click()
        })
        await sleep(phone ? 650 : 300)
        const confirm = await p.evaluate(() => {
          const text = document.body.textContent.replace(/\s+/g, " ")
          const m = /Unban Rae Jordan\?(.*?)(Cancel|Unban)/.exec(text)
          return { asked: /Unban Rae Jordan\?/.test(text), detail: m ? m[1].trim().slice(0, 200) : null }
        })
        expect(confirm.asked, "MEMBERS: the undo asks once, naming the person", confirm)
        expect(/points, level and posts/.test(confirm.detail ?? ""), "MEMBERS: and says what they get back", confirm.detail)
        await p.screenshot({ path: join(shots, `${label}-members-confirm.png`) })
      }

      if (c === "members-mod") {
        const view = await p.evaluate(() => {
          const rows = [...document.querySelectorAll("[data-member-row]")].filter((r) => r.getBoundingClientRect().height > 0)
          return { rows: rows.length, undos: rows.map((r) => r.querySelector("[data-undo]")?.textContent?.trim() ?? null), menus: rows.map((r) => Boolean(r.querySelector("[data-row-menu], button[aria-label^=Actions]"))) }
        })
        expect(view.rows === 5, "RANK: the same five rows for a moderator", view.rows)
        expect(view.undos[0] === null && view.undos[1] === null, "RANK: no undo of the owner's ban or the admin's removal", view.undos)
        expect(view.undos[3] === "Unmute", "RANK: another moderator's mute may be undone", view.undos[3])
        expect(view.undos[4] === (phone ? "Let back in" : "Let them back in"), "RANK: and a removal nobody is on record for", view.undos[4])
        await p.screenshot({ path: join(shots, `${label}-members-mod.png`) })
      }

      if (c === "members-active") {
        const view = await p.evaluate(() => {
          const rows = [...document.querySelectorAll("[data-member-row]")].filter((r) => r.getBoundingClientRect().height > 0)
          return { rows: rows.length, undos: rows.filter((r) => r.querySelector("[data-undo]")).length, heads: [...document.querySelectorAll("thead th")].map((t) => t.textContent.trim()) }
        })
        expect(view.rows === 4, "MEMBERS: the Active view is unchanged", view.rows)
        expect(view.undos === 0, "MEMBERS: and carries no undo", view.undos)
        if (!phone) expect(view.heads.includes("Role") && view.heads.includes("Joined"), "MEMBERS: with the columns it always had", view.heads)
      }
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
