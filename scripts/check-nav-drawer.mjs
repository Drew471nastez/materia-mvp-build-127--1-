/**
 * ===========================================================================
 *  THE MOBILE MENU OPENS WHERE YOU ARE, AND THE PAGE UNDER IT STOPS
 * ===========================================================================
 * Three reports about the website builder's mobile nav, one cause each.
 *
 * IT OPENS AT THE TOP. In the editor the drawer is portalled into
 * `#wb-preview-root`, which is `position: relative` and `overflow-y: auto`.
 * An absolutely positioned child of a scroller is laid out against its
 * CONTENT box, so `top: 0` is the top of the whole page rather than the top
 * of what is on screen. The BROKEN case below is exactly that markup, kept
 * so the numbers here read against something: at 900px it lands at -900px.
 *
 * THE PAGE KEEPS SCROLLING UNDERNEATH. `overflow: hidden` on the body is not
 * a scroll lock on iOS, and in the editor there was no lock at all.
 *
 * IT IS HALF HEIGHT. Tapping the hamburger in the editor also selects the
 * header, so the inspector sheet opens on the same tap, publishes its peek
 * and the canvas subtracts it as padding. The canvas changes height and the
 * window never resizes, so a drawer measured once is left at the wrong size
 * for as long as it is open.
 *
 * ── WHY THIS DRIVES A REAL PAGE ──────────────────────────────────────────
 * The first version of this file used `--dump-dom --virtual-time-budget`,
 * like the probes around it. Timers run under virtual time but FRAMES DO
 * NOT: a requestAnimationFrame scheduled in that harness never fired, and
 * ResizeObserver notifications are delivered in the rendering steps, so the
 * third bug was unmeasurable there and the probe reported it fixed while it
 * was not. This one attaches over CDP to a real headless page instead.
 *
 *   pnpm build && node scripts/check-nav-drawer.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { appCss } from "./probe-css.mjs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
/* The build's stylesheet, or globals.css compiled on the spot (probe-css.mjs). */
const css = await appCss(root)

const out = mkdtempSync(join(tmpdir(), "storelib-drawer-"))
const stubs = join(root, ".drawer-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)

/* The canvas, copied from app/(storelib)/website-builder/editor/[installId]/page.tsx. */
const CANVAS_CLASS = "relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden border-0 rounded-none w-full h-full"

const SCROLL_TO = 900
const VIEW_W = 390
const VIEW_H = 640
/* What the inspector sheet takes off the canvas when it opens on the tap. */
const SHEET = 260

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-nav-drawer.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8"><style>${css}</style>` +
  `<style>body{margin:0}</style></head><body>` +
  `<div id="canvas-frame" style="width:${VIEW_W}px;height:${VIEW_H}px;position:relative;overflow:hidden;box-sizing:border-box">` +
  `<div id="wb-preview-root" class="${CANVAS_CLASS}" style="touch-action:pan-y;overscroll-behavior:contain">` +
  `<div id="scoped" style="flex:0 0 auto"></div><div style="height:2400px;flex:0 0 auto"></div>` +
  `<div id="old-way" style="position:absolute;left:0;top:0;bottom:0;width:10px"></div>` +
  `</div></div>` +
  `<div id="live"></div><div style="height:2400px"></div>` +
  `<script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

/*
  The page script, run through Runtime.evaluate rather than embedded, so a
  syntax error in it is an exception this file reports instead of a probe
  that quietly did not run.
*/
const SCRIPT = `(async () => {
  const SCROLL_TO = ${SCROLL_TO}
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } }
  /* The slide is a transform on a transition. The claim here is about WHERE
     the drawer sits, not how long it took, so the transition is cut before
     reading and the transform is at its target. */
  const settle = (el) => { el.style.transition = "none"; void el.offsetHeight }

  const r = { frames: 0 }
  requestAnimationFrame(() => { r.frames++ })
  await wait(400)

  const scroller = document.getElementById("wb-preview-root")
  const frame = document.getElementById("canvas-frame")
  const inPreview = (sel) => document.querySelector("#wb-preview-root " + sel)

  /* ---- the old geometry, for contrast ---- */
  scroller.scrollTop = ${SCROLL_TO}
  await wait(60)
  r.brokenTop = rect(document.getElementById("old-way")).top
  r.view = rect(scroller)

  /* ---- scoped: the editor canvas ---- */
  const openScoped = document.querySelector('#scoped button[aria-label="Open menu"]')
  r.foundScopedButton = !!openScoped
  if (openScoped) {
    openScoped.click()
    await wait(600)
    const d = inPreview('[role="dialog"][aria-label="Menu"]')
    r.foundScopedDrawer = !!d
    if (d) { settle(d); r.scopedDrawer = rect(d) }
    const cs = getComputedStyle(scroller)
    r.scopedLock = { overflowY: cs.overflowY, touchAction: cs.touchAction }
    r.scopedScrollTopWhileOpen = scroller.scrollTop

    /* The inspector sheet opening on the same tap, and settling back. */
    frame.style.paddingBottom = "${SHEET}px"
    await wait(300)
    r.shrunk = { drawer: rect(d), canvas: rect(scroller) }
    frame.style.paddingBottom = "0px"
    await wait(300)
    r.grown = { drawer: rect(d), canvas: rect(scroller) }

    /* ---- the three controls reported as dead, inside the editor ----
       The canvas intercepts clicks: it cancels a link's default, and
       navigates only when the link is inside the header or footer subtree.
       A portalled drawer is not inside either, which is the thing under
       test, so the stub carries the same rule the editor does. */
    r.editorNav = []
    const canvasIntercept = (e) => {
      const el = e.target
      const anchor = el && el.closest ? el.closest("a[href]") : null
      const inNav = !!(anchor && anchor.closest && anchor.closest("[data-chrome]"))
      /* The same exemption the canvas makes: the canvas leaves a link inside
         the open menu to the menu, which closes itself and then changes the
         page, and the header's search panel says the same thing about its
         results with data-self-nav. Swallowing either here would reproduce
         the bug rather than test for it: this runs in the capture phase, so
         stopping the event means the overlay's own handler never runs. */
      const ownsItsExit = !!(anchor && anchor.closest && anchor.closest('[role="dialog"], [data-self-nav]'))
      const href = anchor ? (anchor.getAttribute("href") || "").trim() : ""
      const internal = href.startsWith("/") && !href.startsWith("//")
      if (anchor) e.preventDefault()
      if (inNav && internal && !ownsItsExit) { e.stopPropagation(); r.editorNav.push(href) }
    }
    scroller.addEventListener("click", canvasIntercept, true)

    /* The first link in the menu's own nav, whatever the fallback nav names
       this week: it was Home/Shop/About/Contact, and since the shop moved to
       SHOP_PATH it is Home and Shop at /products. Selecting by structure
       rather than by address keeps this a test of "a nav link navigates"
       and not of which addresses the theme ships. The search row and the
       call to action are outside <nav>, so neither is picked up here. */
    const navLink = Array.from(document.querySelectorAll('#wb-preview-root [role="dialog"][aria-label="Menu"] nav a[href^="/"]'))
      .find((a) => a.getAttribute("href") !== "/")
    r.foundNavLink = !!navLink

    /*
      ── TAPPING HOME CLOSES THE MENU, THEN GOES HOME ─────────────────────
      Both halves, and the order of them, because the order is the report:
      the canvas used to change the page on the spot and leave the drawer
      standing open over the page it had just opened.

      window.__nav is what the mount records when the header calls
      onEditorNavigate, so this reads what the editor would actually have
      been told rather than what a stub decided to intercept.
    */
    const panelNode = inPreview('[role="dialog"][aria-label="Menu"]')
    const openRight = Math.round(panelNode.getBoundingClientRect().right)
    window.__nav = []
    if (navLink) {
      r.navHref = navLink.getAttribute("href")
      navLink.click()
      /* Well inside the close, and well before it ends. */
      await wait(90)
      r.navMidCloseRight = Math.round(panelNode.getBoundingClientRect().right)
      r.navMidCloseCount = window.__nav.length
      /* Past the close, plus room for the frame the timer lands on. */
      await wait(400)
      r.navClosedRight = Math.round(panelNode.getBoundingClientRect().right)
    }
    r.navOpenRight = openRight
    r.navTold = window.__nav.map((n) => n.href)
    r.navToldAsNav = window.__nav.every((n) => n.fromNav === true)
    r.navWentSomewhere = r.navTold.length > 0
    r.navWentWhereItSaid = r.navTold[0] === r.navHref

    /* Reopened, because the link it was just given closed it. */
    const reopenForSearch = document.querySelector('#scoped button[aria-label="Open menu"]')
    if (reopenForSearch) { reopenForSearch.click(); await wait(600) }
    /* Or the row below is behind a panel with pointer-events none, and the
       answer about it is an answer about nothing. */
    const panelNow = inPreview('[role="dialog"][aria-label="Menu"]')
    r.reopened = !!panelNow && getComputedStyle(panelNow).pointerEvents !== "none"
    const searchRow = inPreview('[role="dialog"][aria-label="Menu"] a[href="/search"]')
    r.foundSearchRow = !!searchRow
    window.__nav = []
    if (searchRow) { searchRow.click(); await wait(600) }
    /*
      THE ROW DOES WHAT THE ICON BESIDE IT DOES. A header set to open search
      in itself, which is the default, opens the field here too rather than
      leaving for the search page: the drawer slides out and the field is
      behind it. So "it worked" is the field being open, or a navigation to
      /search when the header is set to go there. Either one, never neither,
      which is what the row used to do.
    */
    const fieldNow = inPreview('form[action="/search"]')
    r.searchOpenedTheField = !!fieldNow && getComputedStyle(fieldNow).pointerEvents !== "none"
    r.searchWentSomewhere = r.searchOpenedTheField || window.__nav.some((n) => n.href === "/search")
    /* A closed drawer leaves the page (useDrawerPresence), or is off screen while it goes. */
    const menuNow = inPreview('[role="dialog"][aria-label="Menu"]')
    r.searchClosedTheDrawer = !menuNow || Math.round(menuNow.getBoundingClientRect().right) <= 0

    scroller.removeEventListener("click", canvasIntercept, true)

    /*
      Put the canvas back where the rest of this phase expects it. The field
      takes the caret when it opens, and a browser scrolls a focused control
      into view, so the act of checking that row moved the scroller. That is
      correct behaviour and not what the checks below are about: they are
      about the drawer's own lock giving back the position it took.
    */
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await wait(300)
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
    scroller.scrollTop = SCROLL_TO
    await wait(60)
    r.scrollPutBack = scroller.scrollTop

    /* Leave it open, and hand node the point to tap. The canvas also
       cancels the default of every mousedown while the inspector is on, so
       that is installed too: a tap is a real sequence and a handler that
       runs anywhere in it can stop the one after it. */
    const reopen = document.querySelector('#scoped button[aria-label="Open menu"]')
    if (reopen) { reopen.click(); await wait(500) }
    document.addEventListener("mousedown", (e) => e.preventDefault(), true)

    /* In the editor a tap that gets past the backdrop reaches the section
       wrapper, which selects the section and opens its settings panel.
       Dismissing a menu is not that, so the tap has to stop at the backdrop.
       Counted on the canvas, which is the portal's DOM parent and therefore
       the first thing the event reaches on its way up; a listener on the
       header's own node would never see a portalled event at all and would
       report zero whatever the code did. */
    window.__gotPast = 0
    scroller.addEventListener("click", () => { window.__gotPast++ })
    scroller.addEventListener("pointerdown", () => { window.__gotPast++ })

    const backdrop = Array.from(scroller.querySelectorAll("div[aria-hidden]")).find((el) => {
      const cs = getComputedStyle(el)
      /* The backdrop's z-index is DRAWER_BACKDROP_Z in drawer-frame.ts,
         raised over the cookie banner's 9999 so the menu's bottom rows can
         be tapped. Read from the computed style, so this stays a
         measurement of what is on screen rather than a copy of the source. */
      return Number(cs.zIndex) >= 10000 && cs.pointerEvents === "auto" && !el.matches('[role="dialog"]')
    })
    r.foundBackdrop = !!backdrop
    if (backdrop) {
      const b = backdrop.getBoundingClientRect()
      const panel = inPreview('[role="dialog"][aria-label="Menu"]').getBoundingClientRect()
      /* Beside the panel, not over it: that is where "click away" is. */
      r.tapAt = { x: Math.round(panel.right + (b.right - panel.right) / 2), y: Math.round(b.top + b.height / 2) }
    }
  }

  return JSON.stringify(r)
})()`

/* Everything after the real tap: did it close, and does the canvas come
   back. Run as its own evaluate because the tap happens in between. */
const AFTER_TAP = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } }
  const settle = (el) => { el.style.transition = "none"; void el.offsetHeight }
  const r = {}
  const scroller = document.getElementById("wb-preview-root")
  const inPreview = (sel) => document.querySelector("#wb-preview-root " + sel)

  await wait(600)
  const d = inPreview('[role="dialog"][aria-label="Menu"]')
  r.backdropClosedIt = d ? d.getAttribute("aria-hidden") === "true" : true

  r.gotPast = window.__gotPast ?? 0

  const close = inPreview('button[aria-label="Close menu"]')
  if (close) close.click()
  await wait(600)
  const cs2 = getComputedStyle(scroller)
  r.scopedAfter = { overflowY: cs2.overflowY, touchAction: cs2.touchAction, scrollTop: scroller.scrollTop }

  return JSON.stringify(r)
})()`

/*
  THE PUBLISHED SITE IS MEASURED ON A DESKTOP.

  The editor canvas above runs under phone emulation, where Chromium draws
  overlay scrollbars of no width — so "the document's scrollbar is gone
  while the drawer is open" cannot be told from "there never was one". A
  published site is opened in its own target at desktop metrics, where a
  classic scrollbar has a width, and the scrollbar checks mean something.
  The header search field's width cap is a desktop matter too.
*/
const LIVE = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } }
  const settle = (el) => { el.style.transition = "none"; void el.offsetHeight }
  const r = {}
  const scroller = document.getElementById("wb-preview-root")
  await wait(400)

  /* ---- live: a published site ---- */
  window.scrollTo(0, ${SCROLL_TO})
  await wait(60)
  const openLive = document.querySelector('#live button[aria-label="Open menu"]')
  r.foundLiveButton = !!openLive
  const barWidth = () => window.innerWidth - document.documentElement.clientWidth
  r.barBefore = barWidth()
  if (openLive) {
    openLive.click()
    await wait(600)
    r.barWhileOpen = barWidth()
    r.bodyPad = document.body.style.paddingRight
    const all = Array.from(document.querySelectorAll('[role="dialog"][aria-label="Menu"]'))
    const d = all.find((el) => !scroller.contains(el))
    r.foundLiveDrawer = !!d
    if (d) { settle(d); r.liveDrawer = rect(d); r.innerH = window.innerHeight }
    const b = getComputedStyle(document.body)
    r.liveLock = { position: b.position, top: document.body.style.top, overflow: b.overflow }

    const close = d ? d.querySelector('button[aria-label="Close menu"]') : null
    if (close) close.click()
    await wait(600)
    r.liveAfter = { position: getComputedStyle(document.body).position, scrollY: Math.round(window.scrollY) }
    r.barAfter = barWidth()
  }
  /* ---- the cart drawer, which is the one in the report ----
     The menu above and the cart share a frame, but only the menu was ever
     opened here: the probe mounted the header with no cart, so the bag
     opened nothing and the cart's own scroll lock went unmeasured. */
  const cartBtn = document.getElementById("live").querySelector('button[aria-label^="Cart"]')
  r.foundCartButton = !!cartBtn
  if (cartBtn) {
    r.barBeforeCart = barWidth()
    cartBtn.click()
    await wait(600)
    const cartPanel = Array.from(document.querySelectorAll('[role="dialog"][aria-label="Cart"]'))
      .find((el) => !scroller.contains(el))
    r.foundCartPanel = !!cartPanel
    if (cartPanel) {
      settle(cartPanel)
      r.cartRect = rect(cartPanel)
      r.cartRight = Math.round(window.innerWidth - rect(cartPanel).left - rect(cartPanel).w)
    }
    r.barWhileCartOpen = barWidth()
    r.bodyPadCart = document.body.style.paddingRight
    r.rootOverflowCart = document.documentElement.style.overflow
    const closeCart = cartPanel ? cartPanel.querySelector('button[aria-label="Close cart"]') : null
    if (closeCart) closeCart.click()
    await wait(600)
    r.barAfterCart = barWidth()
  }

  /* ---- search, opened in the header ---- */
  const liveHeader = document.getElementById("live")
  const searchBtn = liveHeader.querySelector('button[aria-label="Search"]')
  r.searchIsAButton = !!searchBtn
  if (searchBtn) {
    const row = liveHeader.querySelector("header, section, div")
    searchBtn.click()
    await wait(500)
    const panel = liveHeader.querySelector('form[action="/search"]')
    r.foundSearchPanel = !!panel
    if (panel) {
      const shell = panel.closest("div[aria-hidden]")
      const cs = getComputedStyle(shell)
      r.searchPanel = {
        opacity: Number(cs.opacity).toFixed(2),
        pointerEvents: cs.pointerEvents,
        hasTransition: /opacity/.test(cs.transitionProperty),
        rect: rect(shell),
        rowRect: rect(shell.parentElement),
      }
      const row = panel.parentElement
      r.searchRow = { w: rect(row).w, viewport: window.innerWidth }
      const field = panel.querySelector('input[name="q"]')
      const fieldRect = field ? field.getBoundingClientRect() : null
      const shellRect = shell.getBoundingClientRect()
      r.searchField = {
        exists: !!field,
        height: fieldRect ? Math.round(fieldRect.height) : 0,
        gapAbove: fieldRect ? Math.round(fieldRect.top - shellRect.top) : -1,
        gapBelow: fieldRect ? Math.round(shellRect.bottom - fieldRect.bottom) : -1,
        focused: document.activeElement === field,
        fontSize: field ? Number(getComputedStyle(field).fontSize.replace("px", "")) : 0,
        method: panel.getAttribute("method"),
      }
      /* Pressing past it closes it. A real press, on the page behind the
         panel, because this listens for a pointer going down rather than a
         click and a synthetic click would not produce one. */
      const away = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(window.innerHeight - 40))
      r.pressedAwayOn = away ? away.tagName.toLowerCase() : "(nothing)"
      if (away) {
        away.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }))
        await wait(400)
      }
      r.awayClosedSearch = Number(getComputedStyle(shell).opacity) < 0.05

      /* Reopen, then check escape still works. */
      searchBtn.click()
      await wait(500)
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      await wait(400)
      r.escapeClosedSearch = Number(getComputedStyle(shell).opacity) < 0.05

      /*
        ── THE SUGGESTIONS, WHICH HANG BELOW THE HEADER ──────────────────
        They were a child of the header's own row, and that row clips itself
        so the field can never make the header taller. A list placed at the
        row's bottom edge is entirely outside that clip, so every pixel of
        it was cut and all that reached the screen was the top hairline of a
        card. Reported from a phone; it was doing it on every screen.

        The request is answered here rather than left to the network: the
        claim is about where the list lands and whether anything is covering
        or cutting it, not about what the shop contains.
      */
      const realFetch = window.fetch
      window.fetch = async () => new Response(JSON.stringify({
        items: [
          { id: "1", title: "Tech planner", price: "$29", image: "", url: "/products/tech-planner" },
          { id: "2", title: "Technical notes", price: "$19", image: "", url: "/products/technical-notes" },
          { id: "3", title: "Technique pack", price: "$9", image: "", url: "/products/technique-pack" },
        ],
        total: 12,
      }), { headers: { "Content-Type": "application/json" } })

      searchBtn.click()
      await wait(500)
      const typeIn = liveHeader.querySelector('input[name="q"]')
      r.foundFieldToTypeIn = !!typeIn
      if (typeIn) {
        /* A controlled input takes a value through its own setter, or React
           never hears about it. */
        const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
        setValue.call(typeIn, "tech")
        typeIn.dispatchEvent(new Event("input", { bubbles: true }))
        await wait(700)

        const viewAll = liveHeader.querySelector('a[href^="/search?q="]')
        const card = viewAll ? viewAll.closest("div[aria-hidden]") : null
        r.foundHits = !!card
        if (card) {
          const cs2 = getComputedStyle(card)
          const box = card.getBoundingClientRect()
          const headerBox = shell.getBoundingClientRect()
          r.hits = {
            opacity: Number(cs2.opacity).toFixed(2),
            pointerEvents: cs2.pointerEvents,
            h: Math.round(box.height),
            top: Math.round(box.top),
            headerBottom: Math.round(headerBox.bottom),
            rows: card.querySelectorAll("li").length,
          }
          /*
            THE CHECK THAT CATCHES A CLIP. A box can have a height, a place
            and full opacity and still have had every pixel of it cut by an
            ancestor: the rectangle is what layout thinks, not what is on
            screen. So the page is asked what is actually AT three points
            down the middle of the card. A clipped card answers with
            whatever is behind it.
          */
          const cx = Math.round(box.left + box.width / 2)
          let onScreen = 0
          const probes = [0.2, 0.5, 0.8].map((f) => Math.round(box.top + box.height * f))
          for (const cy of probes) {
            const at = document.elementFromPoint(cx, cy)
            if (at && card.contains(at)) onScreen++
          }
          r.hits.visiblePoints = onScreen
          r.hits.probedAt = probes
          /* And it is under the field rather than across the whole header. */
          const fieldBox = typeIn.getBoundingClientRect()
          r.hits.alignedLeft = Math.abs(Math.round(box.left - fieldBox.left)) <= 2
          r.hits.noWiderThanField = Math.round(box.width) <= Math.round(fieldBox.width) + 2
        }
      }
      window.fetch = realFetch
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      await wait(300)
    }
  }

  return JSON.stringify(r)
})()`

function reachabilityFlags() {
  const flags = []
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (proxy) flags.push(`--proxy-server=${proxy}`)
  return flags
}

const proc = spawn(CHROMIUM, [
  "--headless=new", "--remote-debugging-port=0", "--no-sandbox", "--disable-gpu",
  /* NOT --hide-scrollbars: one check below is about whether the document's
     scrollbar is drawn beside an open drawer, which only means something on
     a browser that draws one. */
  "--force-device-scale-factor=1", ...reachabilityFlags(), "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] })
let endpoint = ""
proc.stderr.on("data", (b) => { const m = String(b).match(/ws:\/\/[^\s]+/); if (m && !endpoint) endpoint = m[0] })
for (let i = 0; i < 100 && !endpoint; i++) await sleep(100)
if (!endpoint) { proc.kill("SIGKILL"); fail("Chromium never printed a debugging endpoint.") }

const ws = new WebSocket(endpoint)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("could not attach")) })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
const send = (method, params, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    /* `== null` covers both: a browser-level call passes nothing, and the
       close calls pass null. Sending `sessionId: null` is rejected outright. */
    ws.send(JSON.stringify(sessionId == null ? { id: n, method, params } : { id: n, method, params, sessionId }))
  })

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const call = (method, params) => send(method, params, sessionId)
await call("Page.enable", {})
await call("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: true })
await call("Page.navigate", { url: `file://${file}` })
await sleep(1200)
const evaluated = await call("Runtime.evaluate", { expression: SCRIPT, awaitPromise: true, returnByValue: true })
if (evaluated.exceptionDetails) {
  ws.close(); proc.kill("SIGKILL")
  fail(`The probe threw: ${evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text}`)
}
if (typeof evaluated.result?.value !== "string") {
  ws.close(); proc.kill("SIGKILL")
  fail("Nothing reported. The probe did not run.")
}
const first = JSON.parse(evaluated.result.value)

/*
  A REAL TAP, not `element.click()`.

  "Clicking away does nothing" is a thing that only happens to real input: a
  synthetic click() skips the press and release entirely, so it cannot see a
  handler earlier in the sequence cancelling what comes after it. These are
  dispatched through the browser's own input pipeline.
*/
if (first.tapAt) {
  const at = { x: first.tapAt.x, y: first.tapAt.y, button: "left", clickCount: 1 }
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, clickCount: 0 })
  await call("Input.dispatchMouseEvent", { type: "mousePressed", ...at })
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", ...at })
}

const evaluated2 = await call("Runtime.evaluate", { expression: AFTER_TAP, awaitPromise: true, returnByValue: true })
if (evaluated2.exceptionDetails) {
  ws.close(); proc.kill("SIGKILL")
  fail(`The probe threw after the tap: ${evaluated2.exceptionDetails.exception?.description || evaluated2.exceptionDetails.text}`)
}
if (typeof evaluated2.result?.value !== "string") { ws.close(); proc.kill("SIGKILL"); fail("Nothing reported after the tap.") }

/* The published site, at desktop metrics. See LIVE. */
const { targetId: t2 } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId: s2 } = await send("Target.attachToTarget", { targetId: t2, flatten: true })
const call2 = (method, params) => send(method, params, s2)
await call2("Page.enable", {})
await call2("Emulation.setDeviceMetricsOverride", { width: 980, height: 640, deviceScaleFactor: 1, mobile: false })
await call2("Page.navigate", { url: `file://${file}` })
await sleep(1200)
const evaluated3 = await call2("Runtime.evaluate", { expression: LIVE, awaitPromise: true, returnByValue: true })
ws.close()
proc.kill("SIGKILL")

if (evaluated3.exceptionDetails) {
  fail(`The probe threw on the published site: ${evaluated3.exceptionDetails.exception?.description || evaluated3.exceptionDetails.text}`)
}
if (typeof evaluated3.result?.value !== "string") fail("Nothing reported from the published site.")
const r = { ...first, ...JSON.parse(evaluated2.result.value), ...JSON.parse(evaluated3.result.value) }
if (process.env.DEBUG) console.log(JSON.stringify(r, null, 2))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${what}${got === undefined ? "" : `  — ${got}`}`)
  if (!ok) broken++
}

/* If this is zero the harness is not painting and every ResizeObserver
   result below is meaningless, which is how the first version of this file
   passed while the drawer was still half height. */
expect(r.frames > 0, "the page is running frames, so a resize can be observed at all", `${r.frames} frame(s)`)

console.log(`\nThe editor canvas, scrolled to ${SCROLL_TO}px\n`)
expect(r.brokenTop < -400, "an absolute top:0 bottom:0 child is off screen, which is the bug", `top ${r.brokenTop}px`)
expect(r.foundScopedButton && r.foundScopedDrawer, "the drawer mounted inside the canvas")
if (r.scopedDrawer) {
  expect(Math.abs(r.scopedDrawer.top - r.view.top) <= 1, "the drawer's top is the top of what you are looking at",
    `drawer ${r.scopedDrawer.top}px, canvas ${r.view.top}px`)
  expect(Math.abs(r.scopedDrawer.h - r.view.h) <= 1, "and it is exactly as tall as the canvas",
    `drawer ${r.scopedDrawer.h}px, canvas ${r.view.h}px`)
  expect(r.scopedDrawer.left === 0, "and it has slid all the way in", `left ${r.scopedDrawer.left}px`)
}
expect(r.shrunk && Math.abs(r.shrunk.drawer.h - r.shrunk.canvas.h) <= 1 && Math.abs(r.shrunk.drawer.top - r.shrunk.canvas.top) <= 1,
  "the inspector sheet squeezing the canvas takes the drawer with it",
  `drawer ${r.shrunk?.drawer.h}px at ${r.shrunk?.drawer.top}px, canvas ${r.shrunk?.canvas.h}px at ${r.shrunk?.canvas.top}px`)
expect(r.grown && Math.abs(r.grown.drawer.h - r.grown.canvas.h) <= 1,
  "and the canvas growing back does too",
  `drawer ${r.grown?.drawer.h}px, canvas ${r.grown?.canvas.h}px`)
expect(r.scopedLock?.overflowY === "hidden", "the canvas cannot scroll while it is open", `overflow-y ${r.scopedLock?.overflowY}`)
expect(r.scopedLock?.touchAction === "none", "and a finger on it does nothing", `touch-action ${r.scopedLock?.touchAction}`)
expect(r.scopedScrollTopWhileOpen === SCROLL_TO, "it did not jump on lock", `scrollTop ${r.scopedScrollTopWhileOpen}`)
expect(r.scopedAfter?.overflowY === "auto" && r.scopedAfter?.scrollTop === SCROLL_TO,
  "and it scrolls again, from where it was, once closed",
  `overflow-y ${r.scopedAfter?.overflowY}, scrollTop ${r.scopedAfter?.scrollTop}`)

console.log("\nAnd the controls inside it\n")
expect(r.foundNavLink === true, "the menu has the site's nav links in it")
expect(r.navWentSomewhere === true, "a nav link goes somewhere", r.navWentSomewhere ? "yes" : "the click was cancelled and nothing navigated")
expect(r.navWentWhereItSaid === true, "and it goes where the link said", `${r.navHref} → ${JSON.stringify(r.navTold)}`)
expect(r.navToldAsNav === true, "told as the site's navigation, so the inspector does not swallow it")
expect(r.navMidCloseRight < r.navOpenRight, "the menu is already sliding out a moment after the tap",
  `right ${r.navMidCloseRight}px, was ${r.navOpenRight}px`)
expect(r.navMidCloseCount === 0, "and the page has not changed under it yet",
  r.navMidCloseCount === 0 ? "nothing navigated during the close" : `${r.navMidCloseCount} navigation(s) fired mid-close`)
expect(r.navClosedRight <= 0, "the menu is gone by the time it lands", `right ${r.navClosedRight}px`)
expect(r.reopened === true, "the menu opens again after a link closed it",
  r.reopened ? "yes" : "it stayed closed, so the next tap is about nothing")
expect(r.foundSearchRow === true, "the menu has a search row")
expect(r.searchWentSomewhere === true, "and pressing it does something",
  r.searchOpenedTheField ? "it opened the field in the header" : r.searchWentSomewhere ? "it went to the search page" : "the click was cancelled and nothing happened")
expect(r.searchClosedTheDrawer === true, "and the menu goes away as it does", r.searchClosedTheDrawer ? "yes" : "the menu stayed open over it")
expect(r.scrollPutBack === SCROLL_TO, "the canvas was put back before the scroll checks below", `scrollTop ${r.scrollPutBack}`)
expect(r.foundBackdrop === true, "there is a backdrop to tap")
expect(r.backdropClosedIt === true, "and a real tap on it closes the menu", r.backdropClosedIt ? "yes" : "it stayed open")
expect(r.gotPast === 0, "and the tap stops there instead of reaching the canvas behind it", `${r.gotPast} event(s) got past`)

console.log(`\nA published site, on a desktop, scrolled to ${SCROLL_TO}px\n`)
expect(r.foundLiveButton && r.foundLiveDrawer, "the drawer mounted on the page")
if (r.liveDrawer) {
  expect(r.liveDrawer.top === 0, "the drawer starts at the top of the viewport", `top ${r.liveDrawer.top}px`)
  expect(Math.abs(r.liveDrawer.h - r.innerH) <= 1, "and fills it", `drawer ${r.liveDrawer.h}px, viewport ${r.innerH}px`)
  expect(r.liveDrawer.left === 0, "and it has slid all the way in", `left ${r.liveDrawer.left}px`)
}
expect(r.liveLock?.position === "fixed", "the page is pinned, not merely overflow hidden", `body position ${r.liveLock?.position}`)
expect(r.liveLock?.top === `-${SCROLL_TO}px`, "pinned at the offset it was read at", `body top ${r.liveLock?.top}`)
expect(r.liveAfter?.position !== "fixed" && r.liveAfter?.scrollY === SCROLL_TO,
  "and the scroll position comes back on close", `scrollY ${r.liveAfter?.scrollY}`)
expect(r.barBefore > 0, "this browser draws a scrollbar, so the next check means something", `${r.barBefore}px wide`)
expect(r.barWhileOpen === 0, "the document's scrollbar is gone while the drawer is open", `${r.barWhileOpen}px`)
expect(r.bodyPad === `${r.barBefore}px`, "and its width was given back as padding, so nothing shifted", `padding-right ${r.bodyPad}`)
expect(r.barAfter === r.barBefore, "and it is back once the drawer has gone", `${r.barAfter}px`)

console.log("\nThe cart drawer, on a desktop\n")
expect(r.foundCartButton === true, "the bag is there to press")
expect(r.foundCartPanel === true, "and it opens a cart")
expect(r.barBeforeCart > 0, "the page had a scrollbar to begin with", `${r.barBeforeCart}px`)
expect(r.barWhileCartOpen === 0, "which is gone while the cart is open", `${r.barWhileCartOpen}px`)
expect(r.rootOverflowCart === "hidden", "because the document itself is locked", `overflow ${r.rootOverflowCart || "(none)"}`)
expect(r.bodyPadCart === `${r.barBeforeCart}px`, "and its width was handed back, so nothing shifted", `padding-right ${r.bodyPadCart || "(none)"}`)
expect(r.cartRight === 0, "the cart is flush with the right edge, with no strip beside it", `${r.cartRight}px of gap`)
expect(r.barAfterCart === r.barBeforeCart, "and the scrollbar is back once it closes", `${r.barAfterCart}px`)

console.log("\nSearch, opened in the header\n")
expect(r.searchIsAButton === true, "the icon is a button, not a link to a page", r.searchIsAButton ? "yes" : "still an anchor")
expect(r.foundSearchPanel === true, "clicking it puts a real form in the header")
if (r.searchPanel) {
  expect(r.searchPanel.opacity === "1.00" && r.searchPanel.pointerEvents === "auto",
    "the panel is open and takes input", `opacity ${r.searchPanel.opacity}, pointer-events ${r.searchPanel.pointerEvents}`)
  expect(r.searchPanel.hasTransition === true, "and it faded rather than appeared")
  expect(Math.abs(r.searchPanel.rect.top - r.searchPanel.rowRect.top) <= 1 &&
    Math.abs(r.searchPanel.rect.h - r.searchPanel.rowRect.h) <= 1,
    "it is exactly the header row, so it cannot hang below it",
    `panel ${r.searchPanel.rect.h}px at ${r.searchPanel.rect.top}px, row ${r.searchPanel.rowRect.h}px at ${r.searchPanel.rowRect.top}px`)
}
if (r.searchField) {
  expect(r.searchField.exists && r.searchField.method === "get", "it submits to the search page by itself", `method ${r.searchField.method}`)
  expect(r.searchField.focused === true, "the field has the caret already", r.searchField.focused ? "yes" : "focus was left behind")
  expect(r.searchField.fontSize >= 16, "at a size iOS will not zoom the page for", `${r.searchField.fontSize}px`)
  expect(r.searchField.height >= 40, "and tall enough to read as a field rather than a slot", `${r.searchField.height}px`)
  expect(r.searchField.gapAbove >= 8 && r.searchField.gapBelow >= 8, "with room above and below it inside the header", `${r.searchField.gapAbove}px above, ${r.searchField.gapBelow}px below`)
}
expect(r.searchRow && r.searchRow.w <= 720, "and it stops at a reading width whatever the header does", `${r.searchRow?.w}px in a ${r.searchRow?.viewport}px viewport`)
expect(r.awayClosedSearch === true, "pressing past it closes it", r.awayClosedSearch ? `yes, pressed on <${r.pressedAwayOn}>` : "it stayed open")
expect(r.escapeClosedSearch === true, "and escape closes it", r.escapeClosedSearch ? "yes" : "it stayed open")

console.log("\nAnd what it suggests while you are still typing\n")
expect(r.foundFieldToTypeIn === true, "there is a field to type into")
expect(r.foundHits === true, "typing produces a list of suggestions", r.foundHits ? "yes" : "nothing was drawn at all")
if (r.hits) {
  console.log(`  the card: ${r.hits.h}px tall at y=${r.hits.top}, header ends at ${r.hits.headerBottom}, ${r.hits.rows} rows`)
  expect(Number(r.hits.opacity) > 0.9 && r.hits.pointerEvents === "auto",
    "it is on and takes input", `opacity ${r.hits.opacity}, pointer-events ${r.hits.pointerEvents}`)
  expect(r.hits.h > 60, "it has a real height rather than a hairline", `${r.hits.h}px`)
  expect(r.hits.top >= r.hits.headerBottom - 1, "it sits below the header rather than inside it",
    `card at ${r.hits.top}, header ends at ${r.hits.headerBottom}`)
  /* The one that was failing: a card with a height, a place and full
     opacity, every pixel of which had been cut by the row's own clip. */
  expect(r.hits.visiblePoints === 3, "and all of it is actually on screen, not clipped by the header",
    `${r.hits.visiblePoints} of 3 points down the middle reached the card`)
  expect(r.hits.alignedLeft === true, "it starts where the field starts")
  expect(r.hits.noWiderThanField === true, "and is no wider than the field, so it never runs under the X")
}

console.log("")
if (broken) fail(`${broken} check${broken === 1 ? "" : "s"} failed.`)
console.log("The mobile menu opens over what is on screen, follows it, and what is under it is frozen.\n")
