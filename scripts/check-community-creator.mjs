/**
 * ===========================================================================
 *  THE CREATOR'S COMMUNITY SCREENS, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-creator.tsx) in a stand-in
 * for the /app shell, at 1440x900 and on a 390x844 phone:
 *
 *   FITS       nothing scrolls sideways, on the page or in the pane
 *   TAPS       on a phone every button, link, field and tab is 40px or more
 *   STICKY     the bar with the name and the section tabs stays at the top
 *              while the section scrolls under it
 *   HEADER     the name and the actions beside it never overlap
 *   TABS       on a phone the section tabs scroll sideways and the one you
 *              are on is in view
 *   OVERVIEW   the next steps that are not done, the figures in a grid
 *   CREATE     the five fields, who can join, the price only for paid, and
 *              Create in reach on a phone
 *   MEMBERS    one card: the views with counts and Invite in its first
 *              row, the search and filters in the second, a page of rows (a
 *              table on a computer, a list on a phone), Show more
 *   SETTINGS   the tab row, the save bar appearing on a change, the tiers
 *   GALLERY    the tiles in order, an arrow moves one, the X removes one,
 *              and either brings the Save bar; the add tile while there is
 *              room
 *   NESTED     no card inside a card: no bordered, rounded white box sits
 *              inside another (fields, buttons and the dashed add tile
 *              aside)
 *   MODERATE   the reports with Remove and Dismiss on the row, the author's
 *              mute, suspend, remove and ban in its menu, Mute asking how
 *              long; the restricted people each with the button that undoes
 *              it; the rules editable, Add a rule bringing the Save bar
 *
 *   PROBE_CSS=source node scripts/check-community-creator.mjs
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
const stubs = join(root, ".community-creator-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-")), "shots")
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
    entryPoints: [join(root, "scripts/render-community-creator.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-creator-probe/navigation.js", "next/link": "./.community-creator-probe/link.jsx" },
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
  const CASES = (process.env.CASES || "list,create,create-paid,overview,members,members-pending,settings,settings-access,settings-features,feed,events,spaces,classroom,moderation,moderation-restricted,moderation-rules,analytics").split(",")
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
      await sleep(400)
      expect(errors.length === 0, "renders without an error", errors)

      if (c === "create-paid") {
        await p.click('[data-choice="paid"]')
        await sleep(150)
      }

      const fits = await p.evaluate(() => {
        const pane = document.querySelector(".orders-pane")
        return { doc: document.scrollingElement.scrollWidth - innerWidth, pane: pane ? pane.scrollWidth - pane.clientWidth : 0 }
      })
      expect(fits.doc <= 0 && fits.pane <= 0, "FITS: nothing scrolls sideways", fits)

      if (phone) {
        const small = await p.evaluate(() => {
          const out = []
          for (const el of document.querySelectorAll("main button, main a[href], main input, main select, main textarea, main [role=tab]")) {
            const r = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || el.closest("[hidden],[aria-hidden=true]")) continue
            if (el.matches("input[type=file]")) continue
            if (el.closest("p") && el.tagName === "A") continue
            if (r.height < 40 || (r.width < 40 && el.tagName !== "TEXTAREA")) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
          }
          return out
        })
        expect(small.length === 0, "TAPS: every control is 40px or more on a phone", small.slice(0, 8))
      }

      const hasBar = await p.$("[data-orders-bar]")
      if (hasBar) {
        const header = await p.evaluate(() => {
          const h1 = document.querySelector("[data-orders-bar] h1")?.getBoundingClientRect()
          const buttons = [...document.querySelectorAll("[data-orders-bar] h1 ~ *, [data-orders-bar] h1")].map((x) => x.getBoundingClientRect())
          const actions = [...document.querySelectorAll("[data-orders-bar] a, [data-orders-bar] button")].filter((b) => !b.closest("nav") && b.getBoundingClientRect().width > 0).map((b) => b.getBoundingClientRect())
          const overlap = h1 ? actions.some((a) => a.left < h1.right - 1 && a.right > h1.left + 1 && a.top < h1.bottom && a.bottom > h1.top) : false
          return { overlap, h1: h1 ? Math.round(h1.width) : 0, n: buttons.length }
        })
        expect(!header.overlap && header.h1 > 40, "HEADER: the name and the actions do not overlap", header)
        const pane = await p.$(".orders-pane")
        const before = await p.evaluate(() => Math.round(document.querySelector("[data-orders-bar]").getBoundingClientRect().top))
        const scrolled = await p.evaluate(() => {
          const pane = document.querySelector(".orders-pane")
          pane.scrollTop = 500
          return pane.scrollTop
        })
        await sleep(120)
        const after = await p.evaluate(() => ({ top: Math.round(document.querySelector("[data-orders-bar]").getBoundingClientRect().top), scrolledFlag: document.querySelector("[data-orders-bar]").dataset.scrolled }))
        if (scrolled > 0) expect(after.top === before, "STICKY: the bar stays put while the pane scrolls", { before, after, scrolled })
        await p.evaluate(() => (document.querySelector(".orders-pane").scrollTop = 0))
        void pane
      }

      const tabs = await p.$("[data-section-tabs]")
      if (tabs) {
        const t = await p.evaluate(() => {
          const s = document.querySelector("[data-section-tabs]")
          const a = s.querySelector('[aria-current="page"]')
          const sr = s.getBoundingClientRect()
          const ar = a?.getBoundingClientRect()
          const kids = [...s.children].map((k) => k.getBoundingClientRect())
          const overlap = kids.some((k, i) => i > 0 && k.left < kids[i - 1].right - 0.5)
          return { scrolls: s.scrollWidth > s.clientWidth, activeInView: ar ? ar.left >= sr.left - 1 && ar.right <= sr.right + 1 : false, overlap, n: kids.length, active: a?.textContent }
        })
        expect(t.activeInView && !t.overlap, "TABS: the section you are on is in view, no tab over another", t)
        if (phone) expect(t.scrolls, "TABS: on a phone they scroll sideways", t)
      }

      if (c === "overview") {
        const o = await p.evaluate(() => ({ steps: [...document.querySelectorAll("[data-step]")].map((s) => s.dataset.step), figures: document.querySelectorAll("[data-figure]").length, cols: getComputedStyle(document.querySelector("[data-figures]")).gridTemplateColumns.split(" ").length }))
        expect(o.steps.join(",") === "publish,invite,welcome,course,customize,rules", "OVERVIEW: only the steps not done yet, in order", o.steps)
        expect(o.figures === 7 && o.cols === (phone ? 2 : 4), "OVERVIEW: seven figures in a grid", o)
      }
      if (c === "create" || c === "create-paid") {
        const f = await p.evaluate(() => ({
          name: !!document.querySelector("#c-name"),
          focused: document.activeElement?.id,
          price: !!document.querySelector("[data-paid-fields]"),
          choices: document.querySelectorAll("[data-choice]").length,
          submit: (() => {
            const r = document.querySelector("[data-create-submit]").getBoundingClientRect()
            return { bottom: Math.round(r.bottom), h: Math.round(r.height) }
          })(),
        }))
        expect(f.name && f.choices === 3, "CREATE: the name and three ways to join", f)
        expect(f.price === (c === "create-paid"), "CREATE: the price only for a paid community", f.price)
        expect(f.submit.bottom <= vp.height, "CREATE: Create is on screen without scrolling", f.submit)
        if (c === "create") expect(f.focused === "c-name", "CREATE: the name field has the cursor", f.focused)
      }
      if (c === "members") {
        const m = await p.evaluate(() => {
          const cardEl = document.querySelector("[data-members-table]")
          return {
            rows: [...document.querySelectorAll("[data-member-row]")].filter((r) => r.getBoundingClientRect().height > 0).length,
            more: !!document.querySelector("[data-load-more]"),
            views: cardEl?.querySelectorAll("[data-list-head] [data-filter]").length ?? 0,
            inviteInCard: !!cardEl?.querySelector("[data-list-head] [data-invite-open]"),
            searchInCard: !!cardEl?.querySelector("[data-toolbar] [data-search]") && !!cardEl?.querySelector("[data-toolbar] [data-pick=role]"),
            invites: document.querySelectorAll("[data-invites] li").length,
          }
        })
        expect(m.rows === 12 && m.more, "MEMBERS: a page of rows and Show more", m)
        expect(m.views >= 5 && m.inviteInCard && m.searchInCard, "MEMBERS: the views, Invite, the search and the filters are rows of the one card", m)
      }
      if (c === "settings") {
        await p.focus("#g-tagline")
        await p.keyboard.type(" Every day.")
        await sleep(120)
        const bar = await p.evaluate(() => {
          const b = document.querySelector("[data-save-bar]")
          if (!b) return null
          const r = b.getBoundingClientRect()
          return { bottom: Math.round(r.bottom), top: Math.round(r.top) }
        })
        expect(bar !== null && bar.bottom <= vp.height, "SETTINGS: a change brings the save bar, on screen", bar)
      }
      if (c === "settings-access") {
        const a = await p.evaluate(() => ({ tiers: document.querySelectorAll("[data-tier]").length }))
        expect(a.tiers === 2, "SETTINGS: both tiers with their prices", a)
      }

      /* NESTED: a bordered, rounded, filled box inside another one is a card inside a card. */
      const nested = await p.evaluate(() => {
        const boxy = (el) => {
          if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "IMG", "LABEL", "SPAN"].includes(el.tagName)) return false
          const st = getComputedStyle(el)
          if (st.borderTopStyle !== "solid" || parseFloat(st.borderTopWidth) < 1 || parseFloat(st.borderTopLeftRadius) < 10) return false
          const bg = st.backgroundColor
          return bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent"
        }
        const out = []
        for (const el of document.querySelectorAll(".orders-pane *")) {
          if (!boxy(el) || el.getBoundingClientRect().height === 0 || el.closest("[role=dialog]")) continue
          let a = el.parentElement
          while (a && !a.classList.contains("orders-pane")) {
            if (boxy(a)) {
              out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
              break
            }
            a = a.parentElement
          }
        }
        return out
      })
      expect(nested.length === 0, "NESTED: no card inside a card", nested.slice(0, 4))

      if (c === "settings") {
        const g0 = await p.evaluate(() => ({ items: [...document.querySelectorAll("[data-gallery-item]")].map((x) => x.dataset.galleryItem), add: !!document.querySelector("[data-gallery-add]"), bar: !!document.querySelector("[data-save-bar]") }))
        expect(g0.items.length === 5 && g0.add, "GALLERY: five tiles and the add tile", g0)
        /* Discard the tagline edit first so the bar only comes back for the gallery. */
        await p.evaluate(() => [...document.querySelectorAll("[data-save-bar] button")].find((b) => b.textContent.trim() === "Discard")?.click())
        await sleep(100)
        /* A computer: the arrow on the tile. A phone: the tile's one menu button, then the sheet's row. */
        const pickInSheet = async (index, word) => {
          const menus = await p.$$("[data-tile-menu]")
          await menus[index].click()
          await sleep(500)
          const row = await p.evaluateHandle((w) => [...document.querySelectorAll('[role="dialog"] button, [role="menuitem"]')].find((x) => x.textContent.trim() === w), word)
          if (row.asElement()) await row.asElement().click()
          await sleep(900)
        }
        if (phone) await pickInSheet(1, "Move later")
        else await p.evaluate(() => document.querySelector('[aria-label="Move 2 later"]').click())
        await sleep(120)
        const g1 = await p.evaluate(() => ({ items: [...document.querySelectorAll("[data-gallery-item]")].map((x) => x.dataset.galleryItem), bar: !!document.querySelector("[data-save-bar]") }))
        expect(g1.items.join(",") === "image,image,video,image,image" && g1.bar, "GALLERY: moving the video one later reorders it and brings the Save bar", g1)
        if (phone) await pickInSheet(0, "Remove")
        else await p.evaluate(() => document.querySelector('[aria-label="Remove picture 1"]').click())
        await sleep(120)
        const g2 = await p.evaluate(() => document.querySelectorAll("[data-gallery-item]").length)
        expect(g2 === 4, "GALLERY: Remove takes a tile out", g2)
        if (phone) {
          const t = await p.evaluate(() => {
            const b = document.querySelector("[data-tile-menu]").getBoundingClientRect()
            const arrows = document.querySelector('[aria-label="Move 1 later"]').getBoundingClientRect()
            return { w: Math.round(b.width), h: Math.round(b.height), arrowsHidden: arrows.width === 0 }
          })
          expect(t.w >= 40 && t.h >= 40 && t.arrowsHidden, "GALLERY: on a phone each tile has one 40px menu button and no arrows over the picture", t)
        }
        await p.evaluate(() => {
          const pane = document.querySelector(".orders-pane")
          const g = document.querySelector("#gallery")
          pane.scrollTop += g.getBoundingClientRect().top - document.querySelector("[data-orders-bar]").getBoundingClientRect().bottom - 12
        })
        await sleep(100)
        await p.screenshot({ path: join(shots, `${label}-${c}-gallery.png`) })
        await p.evaluate(() => (document.querySelector(".orders-pane").scrollTop = 0))
      }
      if (c === "moderation") {
        const r = await p.evaluate(() => ({ rows: document.querySelectorAll("[data-report]").length, remove: document.querySelectorAll("[data-report-remove]").length, views: document.querySelectorAll("[data-list-head] [data-filter]").length }))
        expect(r.rows === 3 && r.remove === 2 && r.views === 5, "MODERATE: three reports, Remove on the two that are up, five views", r)
        /* Round 12: a post the safety rules held waits with Approve and Keep hidden, its note in plain words (lib/communities/server/safety.ts). */
        const held = await p.evaluate(() => {
          const row = [...document.querySelectorAll("[data-report]")].find((x) => x.querySelector("[data-report-approve]"))
          const buttons = row ? [...row.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean) : []
          const tap = row ? [...row.querySelectorAll("[data-report-approve], [data-report-keep]")].map((b) => Math.round(b.getBoundingClientRect().height)) : []
          return { found: !!row, badge: row?.textContent.includes("Held for review") ?? false, note: row?.querySelector("[data-report-system]")?.textContent.trim() ?? "", buttons, tap, overflow: document.documentElement.scrollWidth - window.innerWidth }
        })
        expect(held.found && held.badge && held.buttons.includes("Approve") && held.buttons.includes("Keep hidden") && !held.buttons.includes("Dismiss") && /^A link that imitates a known brand \(paypal\)$/.test(held.note) && held.overflow <= 0 && held.tap.every((h) => h >= (phone ? 40 : 32)), "MODERATE: a held post has Approve and Keep hidden, the rule's note unquoted", held)
        await p.click('[data-report] [aria-label="Report actions"]')
        await sleep(450)
        const items = await p.evaluate(() => [...document.querySelectorAll('[role="menuitem"], [role="dialog"] button, [role="dialog"] a')].map((x) => x.textContent.trim()).filter(Boolean))
        expect(["Mute", "Suspend", "Remove from the community", "Ban"].every((x) => items.includes(x)) && items.includes("Open the post"), "MODERATE: the report's menu has the author's mute, suspend, remove and ban", items)
        await p.screenshot({ path: join(shots, `${label}-${c}-menu.png`) })
        const muteItem = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [role="dialog"] button')].find((x) => x.textContent.trim() === "Mute"))
        if (muteItem.asElement()) await muteItem.asElement().click()
        await sleep(phone ? 900 : 450)
        const mute = await p.evaluate(() => ({ dialog: !!document.querySelector("[data-mute-confirm]"), choices: document.querySelectorAll('[role="radiogroup"][aria-label="How long"] [role="radio"]').length }))
        expect(mute.dialog && mute.choices === 4, "MODERATE: Mute asks how long", mute)
        await p.screenshot({ path: join(shots, `${label}-${c}-mute.png`) })
        await p.keyboard.press("Escape")
        await sleep(300)
      }
      if (c === "moderation-restricted") {
        const r = await p.evaluate(() => [...document.querySelectorAll("[data-restricted-row]")].map((x) => `${x.dataset.restrictedRow}:${[...x.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean).join("|")}`))
        expect(r.join(",") === "muted:Unmute,paused:Bring back,banned:Unban", "MODERATE: each restricted person with the button that undoes it", r)
      }
      if (c === "moderation-rules") {
        const before = await p.evaluate(() => ({ rules: document.querySelectorAll("[data-rule]").length, bar: !!document.querySelector("[data-save-bar]") }))
        await p.click("[data-rule-add]")
        await sleep(120)
        const after = await p.evaluate(() => ({ rules: document.querySelectorAll("[data-rule]").length, bar: !!document.querySelector("[data-save-bar]") }))
        expect(before.rules === 2 && !before.bar && after.rules === 3 && after.bar, "MODERATE: two rules, Add a rule makes a third and brings the Save bar", { before, after })
        const slow = await p.evaluate(() => {
          const row = document.querySelector("[data-slow-mode]")
          const select = row?.querySelector("select")
          return { row: !!row, value: select?.value ?? null, options: select ? [...select.options].map((o) => o.value).join() : "", height: select ? Math.round(select.getBoundingClientRect().height) : 0, overflow: document.documentElement.scrollWidth - window.innerWidth }
        })
        expect(slow.row && slow.value === "300" && slow.options === "0,30,60,300,900,3600" && slow.height >= 40 && slow.overflow <= 0, "MODERATE: slow mode sits above the rules with its six choices", slow)
        await p.evaluate(() => [...document.querySelectorAll("[data-save-bar] button")].find((b) => b.textContent.trim() === "Discard")?.click())
        await sleep(100)
      }
      if (c === "settings-features") {
        const f = await p.evaluate(() => document.querySelectorAll('[data-features] [role="switch"]').length)
        expect(f >= 5, "SETTINGS: the sections and the welcome as switches", f)
      }
      const tabsText = await p.evaluate(() => [...document.querySelectorAll("[data-section-tabs] a")].map((a) => a.textContent.replace(/\d+/g, "").trim()))
      if (tabsText.length) expect(!tabsText.includes("Gamification"), "TABS: Gamification lives in Settings, not in the row", tabsText)

      await p.screenshot({ path: join(shots, `${label}-${c}.png`), fullPage: false })
      if (c === "members" || c === "overview" || c === "settings-access" || c === "settings" || c === "moderation-rules") {
        const h = await p.evaluate(() => document.querySelector(".orders-pane")?.scrollHeight ?? 0)
        if (h > vp.height) {
          await p.evaluate(() => (document.querySelector(".orders-pane").scrollTop = 600))
          await sleep(100)
          await p.screenshot({ path: join(shots, `${label}-${c}-scrolled.png`) })
        }
      }
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
