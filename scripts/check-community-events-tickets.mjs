/**
 * ===========================================================================
 *  ROUND 14 PAID EVENTS ON THE CREATOR'S SIDE, MEASURED (worker A)
 * ===========================================================================
 * The real components (scripts/render-community-events-tickets.tsx) in a
 * stand-in for the /app shell, at 1440x900 and on a 390x844 phone:
 *
 *   FITS        nothing scrolls sideways, on the page or in the pane
 *   TAPS        on a phone every button, link, field and tab is 40px or more
 *   LIST        a paid event's row says what it took, a free one says
 *               nothing about money, and its menu offers Tickets
 *   CARD        the Tickets part of the editor: Free and Paid, and with
 *               Paid the price, the sales time, the window and the policy,
 *               with the community's policy named as the fallback
 *   REFUSES     a price under 0.50 is refused under the price field, inline
 *   PAYOUTS     with payouts off, Paid cannot be pressed and one line says
 *               where to set them up
 *   UPDATE      without run-now part 105 the whole part is one quiet line
 *   CANCEL      cancelling an event people hold tickets for asks about the
 *               money and names the total
 *   PANEL       four figures, the holders with how each got in, Refund and
 *               Mark attended, and Show more
 *   INVITE      the Invite free sheet finds members and says what happened
 *   MONEY       the Analytics screen's ticket figures
 *
 *   PROBE_CSS=source node scripts/check-community-events-tickets.mjs
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
const stubs = join(root, ".community-events-tickets-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-events-tickets-")), "shots")
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
  writeFileSync(
    join(stubs, "image.jsx"),
    `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`,
  )
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-events-tickets.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      "next/navigation": "./.community-events-tickets-probe/navigation.js",
      "next/link": "./.community-events-tickets-probe/link.jsx",
      "next/image": "./.community-events-tickets-probe/image.jsx",
    },
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
  const CASES = (process.env.CASES || "list,editor,editor-free,no-payouts,no-update,cancel,panel,invite,analytics").split(",")
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
      await sleep(500)
      expect(errors.length === 0, "renders without an error", errors)

      /* The editor cases press Paid and type a price, the way a creator does. */
      if (c === "editor") {
        await p.click('[data-ticket-choice="paid"]')
        await sleep(200)
        await p.type("#ev-price", "25")
        await p.type("#ev-refund-window", "48")
        await sleep(150)
      }
      if (c === "editor-free" || c === "no-update" || c === "no-payouts") {
        /* The Tickets part is at the foot of the editor: show it in the picture. */
        await p.evaluate(() => {
          for (const el of document.querySelectorAll("div")) if (el.scrollHeight > el.clientHeight + 20 && el.closest("[role=dialog],[data-sheet-root]")) el.scrollTop = el.scrollHeight
        })
        await sleep(200)
      }
      if (c === "cancel") {
        await p.click('[data-event-row] button[aria-label^="Actions for"]').catch(() => {})
        await sleep(phone ? 650 : 250)
        const items = await p.$$('[role="menuitem"], [data-sheet-root] button')
        for (const item of items) {
          const text = await item.evaluate((el) => el.textContent?.trim())
          if (text === "Cancel event") {
            await item.click()
            break
          }
        }
        await sleep(phone ? 650 : 300)
      }
      if (c === "invite") {
        await p.click("[data-invite-free]")
        await sleep(phone ? 650 : 300)
        await p.type("#invite-find", "ioa")
        await sleep(500)
      }

      const fits = await p.evaluate(() => {
        const panes = [...document.querySelectorAll(".orders-pane, .app-content-scroll, [data-sheet-root]")]
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

      if (c === "list") {
        const rows = await p.$$eval("[data-event-row]", (els) =>
          els.map((el) => ({
            title: el.querySelector("p span")?.textContent?.trim() ?? "",
            money: el.querySelector("[data-event-money]")?.textContent?.trim() ?? null,
          })),
        )
        expect(rows.length === 3, "LIST: a row per upcoming event", rows.length)
        expect(/^11 tickets · \$275/.test(rows[0].money ?? ""), "LIST: the paid event says what it took", rows[0].money)
        expect(rows[1].money === null, "LIST: a free event says nothing about money", rows[1].money)
        expect(/nobody refunded yet/.test(rows[2].money ?? ""), "LIST: a cancelled event that kept the money says so", rows[2].money)
        await p.click('[data-event-row] button[aria-label^="Actions for"]').catch(() => {})
        await sleep(phone ? 650 : 250)
        const items = await p.evaluate(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet-root] button, [data-sheet-root] a')].map((e) => e.textContent.trim()).filter(Boolean))
        expect(items.includes("Tickets"), "LIST: a paid event's menu offers Tickets", items)
        await p.screenshot({ path: join(shots, `${label}-list-menu.png`) })
      }

      if (c === "editor") {
        const card = await p.evaluate(() => {
          const el = document.querySelector("[data-tickets-card]")
          if (!el) return null
          const r = el.getBoundingClientRect()
          const field = (id) => {
            const f = document.getElementById(id)
            if (!f) return null
            const fr = f.getBoundingClientRect()
            return { w: Math.round(fr.width), h: Math.round(fr.height), left: Math.round(fr.left) }
          }
          return {
            mode: document.querySelector("[data-ticket-mode]")?.getAttribute("data-ticket-mode"),
            width: Math.round(r.width),
            price: field("ev-price"),
            closeDate: field("ev-close-date"),
            closeTime: field("ev-close-time"),
            window: field("ev-refund-window"),
            policy: field("ev-refund-policy"),
            fallback: [...document.querySelectorAll("[data-tickets-card] p")].map((x) => x.textContent).join(" "),
            heading: document.querySelector("[data-tickets-card] h3")?.textContent,
          }
        })
        expect(card && card.mode === "paid" && card.heading === "Tickets", "CARD: pressing Paid opens the money fields under a Tickets heading", card?.mode)
        expect(Boolean(card?.price && card?.closeDate && card?.closeTime && card?.window && card?.policy), "CARD: price, sales close, refund window and this event's policy", card)
        expect((card?.price?.h ?? 0) >= (phone ? 44 : 40), "CARD: the price field is a comfortable height", card?.price)
        expect(/We give money back up to a week before/.test(card?.fallback ?? ""), "CARD: the community's policy is named as the fallback")
        expect(/2 days before it starts/.test(card?.fallback ?? ""), "CARD: a 48 hour window is said as two days")
        const rows = await p.evaluate(() => {
          const ids = ["ev-close-date", "ev-close-time", "ev-refund-window"].map((i) => document.getElementById(i).getBoundingClientRect())
          return { tops: ids.map((r) => Math.round(r.top)), overlap: ids.some((a, i) => ids.slice(i + 1).some((b) => a.right > b.left + 1 && a.left < b.right - 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1)) }
        })
        expect(!rows.overlap, "CARD: the three fields never overlap", rows)
        const unit = await p.evaluate(() => document.getElementById("ev-refund-window")?.parentElement?.textContent?.trim() ?? "")
        expect(/hours before/.test(unit), "CARD: the refund window says what the number is", unit)
        await p.screenshot({ path: join(shots, `${label}-editor-paid.png`) })
        /* A price under half a unit is refused under the field, with no alert. */
        await p.evaluate(() => {
          const f = document.getElementById("ev-price")
          f.value = ""
          f.dispatchEvent(new Event("input", { bubbles: true }))
        })
        await p.type("#ev-price", "0.40")
        await p.type("#ev-title", "Workshop")
        await p.click("[data-event-save]")
        await sleep(250)
        const refused = await p.evaluate(() => {
          const notice = [...document.querySelectorAll("[data-event-editor] p, [data-event-editor] div")].map((e) => e.textContent).find((t) => t && /at least 0.50/.test(t))
          const field = document.getElementById("ev-price")
          return { notice: Boolean(notice), invalid: field?.getAttribute("aria-invalid"), wrote: (window.__calls ?? []).filter((c) => c[0] === "POST").length }
        })
        expect(refused.notice && refused.invalid === "true" && refused.wrote === 0, "REFUSES: under 0.50 is said inline, under the field, and nothing is sent", refused)
        await p.screenshot({ path: join(shots, `${label}-editor-refused.png`) })
      }

      if (c === "editor-free") {
        const free = await p.evaluate(() => ({
          mode: document.querySelector("[data-ticket-mode]")?.getAttribute("data-ticket-mode"),
          price: Boolean(document.getElementById("ev-price")),
          words: document.querySelector("[data-tickets-card]")?.textContent ?? "",
        }))
        expect(free.mode === "free" && !free.price, "CARD: a free event shows no money fields at all", free.mode)
        expect(/Free for everyone who can see it/.test(free.words), "CARD: and says so in one line")
      }

      if (c === "no-payouts") {
        const off = await p.evaluate(() => {
          const paid = document.querySelector('[data-ticket-choice="paid"]')
          const note = document.querySelector("[data-payouts-off]")
          return { disabled: paid?.disabled === true, note: note?.textContent?.trim() ?? null, link: note?.querySelector("a")?.getAttribute("href") ?? null }
        })
        expect(off.disabled, "PAYOUTS: Paid cannot be pressed", off)
        expect(/Payouts are not set up/.test(off.note ?? "") && off.link === "/app/settings?tab=payments", "PAYOUTS: one line and a link to set them up", off)
        await p.screenshot({ path: join(shots, `${label}-no-payouts.png`) })
      }

      if (c === "no-update") {
        const one = await p.evaluate(() => {
          const el = document.querySelector("[data-tickets-missing]")
          return { text: el?.textContent?.trim() ?? null, choices: document.querySelectorAll("[data-ticket-choice]").length, price: Boolean(document.getElementById("ev-price")) }
        })
        expect(/run-now part 105/.test(one.text ?? "") && one.choices === 0 && !one.price, "UPDATE: one quiet staff line instead of the whole part", one)
        await p.screenshot({ path: join(shots, `${label}-no-update.png`) })
      }

      if (c === "cancel") {
        const ask = await p.evaluate(() => {
          const box = document.querySelector("[data-cancel-refund]")
          return { shown: Boolean(box), text: box?.textContent?.trim() ?? null, toggle: Boolean(document.getElementById("cancel-refund-all")), button: document.querySelector("[data-cancel-confirm]")?.textContent?.trim() ?? null }
        })
        expect(ask.shown && ask.toggle, "CANCEL: it asks whether everybody should have their money back", ask)
        expect(/12 people hold tickets/.test(ask.text ?? "") && /\$275/.test(ask.text ?? ""), "CANCEL: and names how many and how much", ask.text)
        expect(ask.button === "Cancel and refund", "CANCEL: the button says what it will do", ask.button)
        await p.screenshot({ path: join(shots, `${label}-cancel.png`) })
      }

      if (c === "panel") {
        const figures = await p.$$eval("[data-ticket-figure]", (els) => els.map((e) => ({ label: e.getAttribute("data-ticket-figure"), value: e.querySelector("p:nth-child(2)")?.textContent?.trim() })))
        expect(figures.map((f) => f.label).join() === "Sold,Taken,Refunded,Seats left", "PANEL: four figures", figures.map((f) => f.label))
        expect(figures[1].value === "$275" && figures[3].value === "8", "PANEL: the money and the seats are what the rows say", figures)
        const rows = await p.$$eval("[data-ticket-row]", (els) =>
          els.map((e) => ({
            words: e.querySelector("p:nth-child(2)")?.textContent?.trim() ?? e.textContent.trim(),
            refund: Boolean(e.querySelector("[data-ticket-refund]")),
            attended: e.querySelector("[data-ticket-attended]")?.getAttribute("data-ticket-attended") ?? null,
          })),
        )
        expect(rows.length === 4, "PANEL: a row per holder", rows.length)
        expect(rows.filter((r) => r.refund).length === 2 && !rows[1].refund && !rows[2].refund, "PANEL: Refund only on a paid ticket with money on it, never on a free or refunded one", rows.map((r) => r.refund))
        expect(rows[1].attended === "yes" && rows[0].attended === "no", "PANEL: who came is marked", rows.map((r) => r.attended))
        const more = await p.evaluate(() => Boolean(document.querySelector("[data-tickets-more]")))
        expect(more, "PANEL: Show more, because the holders come a page at a time")
        const grid = await p.evaluate(() => {
          const cells = [...document.querySelectorAll("[data-ticket-figure]")].map((e) => Math.round(e.getBoundingClientRect().left))
          return [...new Set(cells)].length
        })
        expect(grid === (phone ? 2 : 4), `PANEL: the figures sit ${phone ? "two across on a phone" : "four across at 1440"}`, grid)
        await p.screenshot({ path: join(shots, `${label}-panel.png`) })
      }

      if (c === "invite") {
        const sheet = await p.evaluate(() => {
          const picks = [...document.querySelectorAll("[data-invite-pick]")].map((e) => ({ name: e.querySelector("span span")?.textContent?.trim(), off: e.disabled === true }))
          return { open: Boolean(document.querySelector("[data-invite-free-sheet]")), picks, emails: Boolean(document.getElementById("invite-emails")) }
        })
        expect(sheet.open && sheet.emails, "INVITE: the sheet takes members or an email address", sheet.open)
        expect(sheet.picks.length === 2 && sheet.picks[1].off === true, "INVITE: somebody who already holds a ticket is said, not hidden", sheet.picks)
        await p.screenshot({ path: join(shots, `${label}-invite.png`) })
        await p.click("[data-invite-pick]")
        await p.click("[data-invite-send]")
        await sleep(300)
        const done = await p.evaluate(() => document.querySelector("[data-invite-done]")?.textContent?.trim() ?? null)
        expect(/2 tickets given free/.test(done ?? "") && /not a member yet/.test(done ?? ""), "INVITE: what happened is said plainly, never silence", done)
        await p.screenshot({ path: join(shots, `${label}-invite-done.png`) })
      }

      if (c === "analytics") {
        const figures = await p.$$eval("[data-event-figure]", (els) => els.map((e) => ({ label: e.getAttribute("data-event-figure"), value: e.querySelector("p:nth-child(2)")?.textContent?.trim() })))
        expect(figures.map((f) => f.label).join() === "Tickets sold,Ticket revenue,Refunded,Kept", "MONEY: the ticket figures in Analytics", figures.map((f) => f.label))
        expect(figures[1].value === "$850" && figures[3].value === "$800", "MONEY: gross and what is left", figures)
        await p.screenshot({ path: join(shots, `${label}-analytics.png`) })
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
