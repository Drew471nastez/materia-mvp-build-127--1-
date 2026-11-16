"use client"

/**
 * ===========================================================================
 *  HOW IT WORKS: THE DASHBOARD, TIPS AND YOUR OWN DOMAIN (home, section 8)
 * ===========================================================================
 * LANDING ROUND 12, THE OWNER: the pictures in this section did not look like
 * the rest of the page. "Smooth, clean, non AI looking", full width, sitting
 * straight on the section with no grey box or panel around each one. So:
 *
 *   business   Storelib's own /app dashboard, drawn as it really is
 *              (components/app/dashboard-client, sidebar, sidebar-desktop-nav,
 *              metric-tab): the dark header, the rail, the greeting, the four
 *              figures and the revenue chart. A full row of its own. Seen for
 *              the first time, the figures roll up from nothing and the line
 *              draws itself; then, while it is on screen, visitors come in
 *              and now and then an order, and each figure ticks to its new
 *              value. Every number follows from the others: conversion is
 *              orders over visitors, revenue is the orders at their prices.
 *   tips       Ruben's creator page: a visitor picks $5 in the tip block,
 *              pays on the checkout sheet, and the block says thank you, in
 *              the words the real block uses (components/onepage/tip-block).
 *   domain     a store's front page as four photographs and its line, with
 *              a big address field over it: www.fernlyn.com types itself in,
 *              ".com" in blue, and a green check comes in once it is done.
 *
 * One shop runs through the dashboard and the tips: Ruben Linde's Linde
 * Woodshop, a woodworker who films his builds (made up), selling section 3's
 * two products. The domain picture is another creator's store, Fernlyn,
 * botanical oils and candles (made up; Unsplash photographs, cropped 4:3).
 *
 * THE GROUND. Behind the heading a field of faint dots flows by itself and,
 * where a mouse is, lights violet around it and parts (HowField, a small
 * canvas). It covers the head of the section only, is drawn at no more than
 * 1.5 device pixels a CSS pixel, and runs only while on screen.
 *
 * WHAT MOVES. Transform and opacity only. The dashboard's figures are
 * odometers: each digit a column of numerals moved by a transform, so a
 * figure changing never lays anything out. The loops (.cmh-a) run only while
 * their card is near the screen and the tab is visible (data-commerce-live);
 * what plays once waits for a third of the card to be on screen (data-seen,
 * .cmh-o). The dashboard's ticker reads the same attribute, so it stops off
 * screen too. Reduced motion: every picture's finished frame, still.
 *
 * A PICTURE TAKES NO POINTER: no links, no buttons, nothing to tab to; the
 * pictures stay aria-hidden, so a swipe over them is only ever a page scroll.
 *
 * TRUE TO THE PRODUCT. The dashboard's labels and layout are the app's own.
 * Tips are the OnePage tip block: three amounts and Other, "Tip $5", paid
 * through checkout, "Thank you for the $5 tip." (lib/onepage/tips). A domain
 * a creator owns serves their website (lib/custom-domains/hostname
 * DOMAIN_PURPOSES); connecting one is on Grow (lib/sites/plan customDomain,
 * the "growth" plan); Storelib reads the DNS and waits for the certificate
 * itself (app/api/domains/verify).
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react"
import type { SectionStyle } from "./lazy-section"
import type { DomainPurpose } from "@/lib/custom-domains/hostname"
import { STORELIB_LOGO } from "@/lib/brand/logo"

const HOW = "/home/how"

/** Landing round 12 (the owner: a better heading). What the three pictures below are, in their order. */
export const HOW_HEADING = { lead: "See every sale as it happens.", rest: "Add tips and your own domain." } as const

/** The shop the dashboard and the tips belong to (made up). */
export const HOW_SHOP = {
  creator: "Ruben Linde",
  first: "Ruben",
  name: "Linde Woodshop",
  handle: "rubenlinde",
  avatar: `${HOW}/linde-avatar.webp`,
  /** The cover of his creator page: a photograph from a workshop (Unsplash). */
  cover: `${HOW}/linde-turning.webp`,
} as const

/** The pictures, in the page's order: the dashboard on a row of its own, then tips and the domain side by side. */
export const HOW_CARDS = [
  { key: "business", wide: true, title: "Understand your business", line: "Visitors, revenue, orders and conversion, as they come in." },
  { key: "tips", wide: false, title: "Take tips", line: "Visitors pick an amount on your page and pay through checkout." },
  { key: "domain", wide: false, title: "Use your own domain", line: "On Grow, point a domain you own at your site. HTTPS is set up for you." },
] as const

/**
 * Each card runs its loops only while that card is near the screen and the
 * tab is visible (data-commerce-live), and plays what happens once the first
 * time a third of its picture is on screen (data-seen). Both are attributes
 * on the card that the CSS (and the dashboard's ticker) read.
 */
function useCardsLive(grid: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = grid.current
    if (!root) return
    const cards = [...root.querySelectorAll<HTMLElement>(".cmh-card")]
    const near = new Set<Element>()
    const apply = () => {
      for (const t of cards) t.toggleAttribute("data-commerce-live", near.has(t) && !document.hidden)
    }
    if (typeof IntersectionObserver !== "function") {
      for (const t of cards) {
        near.add(t)
        t.setAttribute("data-seen", "")
      }
      apply()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) near.add(e.target)
          else near.delete(e.target)
        }
        apply()
      },
      { rootMargin: "120px 0px" },
    )
    const once = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          ;(e.target.closest(".cmh-card") ?? e.target).setAttribute("data-seen", "")
          once.unobserve(e.target)
        }
      },
      { threshold: 0.35 },
    )
    for (const t of cards) {
      io.observe(t)
      once.observe(t.querySelector(".cmh-stage") ?? t)
    }
    document.addEventListener("visibilitychange", apply)
    return () => {
      io.disconnect()
      once.disconnect()
      document.removeEventListener("visibilitychange", apply)
    }
  }, [grid])
}

/* ── the dot field behind the heading ── */
/** Distance between dots, the largest device pixel ratio drawn, and how the dots look on white. */
export const HOW_FIELD = { gap: 20, maxDpr: 1.5, ink: "24,24,27", rest: 0.15, lit: "124,58,237", litAlpha: 0.6, radius: 170, part: 5 } as const
const LEVELS = 20

/**
 * A field of faint dots on the white ground, one canvas. An even grid; a
 * slow wave of two long sines bent into each other shades it, so bands of
 * dots drift across like a current; a soft violet light wanders through it
 * on its own and, while a mouse is over the section, glides after the mouse
 * (a dt-timed lerp, no jump), the dots under it parting a little. The fade
 * toward the cards and the sides is each dot's own brightness, worked out
 * on resize, so there is no mask to composite. It runs only on screen in a
 * visible tab, at up to 60 frames a second with a mouse and 30 without one.
 * Reduced motion: one still frame.
 */
function HowField({ host }: { host: RefObject<HTMLElement | null> }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    const section = host.current
    const ctx = canvas?.getContext("2d", { alpha: true })
    if (!box || !canvas || !ctx || !section) return
    const mm = typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : null
    const reduced = !!mm?.("(prefers-reduced-motion: reduce)").matches
    const fine = !!mm?.("(hover: hover) and (pointer: fine)").matches
    const F = HOW_FIELD
    let w = 0
    let h = 0
    let dpr = 1
    /* x, y, brightness, wave a, wave b: five numbers a dot. */
    let dots = new Float32Array(0)
    let boxLeft = 0
    let boxTop = 0
    let aimX = 0
    let aimY = 0
    let hasAim = false
    let lightX = 0
    let lightY = 0
    let strength = 0
    let started = false
    const ink: number[][] = Array.from({ length: LEVELS }, () => [])
    const lit: number[][] = Array.from({ length: LEVELS }, () => [])

    /* The field's place on the page (not on the screen), so a scroll never moves it. */
    const place = () => {
      const r = box.getBoundingClientRect()
      boxLeft = r.left + window.scrollX
      boxTop = r.top + window.scrollY
    }
    const draw = (t: number, dt: number) => {
      let tx: number
      let ty: number
      let goal: number
      if (hasAim) {
        tx = aimX - boxLeft
        ty = aimY - boxTop
        goal = 1
      } else {
        tx = w * (0.5 + 0.34 * Math.sin(t * 0.00013))
        ty = h * (0.36 + 0.2 * Math.sin(t * 0.000097 + 1.3))
        goal = 0.55
      }
      const k = 1 - Math.pow(1 - 0.08, dt / 16.67)
      if (!started) {
        lightX = tx
        lightY = ty
        started = true
      } else {
        lightX += (tx - lightX) * k
        lightY += (ty - lightY) * k
      }
      strength += (goal - strength) * k * 0.6
      for (let l = 0; l < LEVELS; l++) {
        ink[l].length = 0
        lit[l].length = 0
      }
      const r2 = F.radius * F.radius
      for (let i = 0; i < dots.length; i += 5) {
        const flow = 0.5 + 0.5 * Math.sin(dots[i + 3] - t * 0.0004 + 1.7 * Math.sin(dots[i + 4] + t * 0.00017))
        let x = dots[i] + (flow - 0.5) * 1.2
        let y = dots[i + 1] + (flow - 0.5) * 1.8
        const fade = dots[i + 2]
        const a = fade * (0.3 + 0.7 * flow * flow)
        let glow = 0
        const dx = x - lightX
        const dy = y - lightY
        const d2 = dx * dx + dy * dy
        if (d2 < r2 && strength > 0.01) {
          const d = Math.sqrt(d2) || 1
          const f = (1 - d / F.radius) * (1 - d / F.radius) * strength
          glow = f * fade
          x += (dx / d) * F.part * f
          y += (dy / d) * F.part * f
        }
        const level = Math.round(a * (1 - glow) * (LEVELS - 1))
        if (level > 0) ink[level].push(x, y)
        const g = Math.round(glow * (LEVELS - 1))
        if (g > 0) lit[g].push(x, y)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      for (let pass = 0; pass < 2; pass++) {
        const set = pass ? lit : ink
        const rgb = pass ? F.lit : F.ink
        const top = pass ? F.litAlpha : F.rest
        const rad = pass ? 1.15 : 0.9
        for (let l = 1; l < LEVELS; l++) {
          const b = set[l]
          if (!b.length) continue
          ctx.fillStyle = `rgba(${rgb},${((l / (LEVELS - 1)) * top).toFixed(3)})`
          ctx.beginPath()
          for (let j = 0; j < b.length; j += 2) {
            ctx.moveTo(b[j] + rad, b[j + 1])
            ctx.arc(b[j], b[j + 1], rad, 0, 6.2832)
          }
          ctx.fill()
        }
      }
    }
    const resize = () => {
      const nw = box.clientWidth
      const nh = box.clientHeight
      if (!nw || !nh || (nw === w && nh === h)) return
      w = nw
      h = nh
      dpr = Math.min(F.maxDpr, window.devicePixelRatio || 1)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const cols = Math.floor(w / F.gap) + 1
      const rows = Math.floor(h / F.gap) + 1
      const ox = (w - (cols - 1) * F.gap) / 2
      const oy = (h - (rows - 1) * F.gap) / 2
      dots = new Float32Array(cols * rows * 5)
      let n = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = ox + c * F.gap
          const y = oy + r * F.gap
          /* Full for the top half, gone by the bottom; soft at the sides and the very top. */
          const down = Math.min(1, Math.max(0, (1 - y / h) / 0.5))
          const side = Math.min(1, Math.min(x, w - x) / Math.min(160, w * 0.16))
          const up = Math.min(1, y / 40 + 0.35)
          dots[n++] = x
          dots[n++] = y
          dots[n++] = down * down * (0.4 + 0.6 * side) * up
          dots[n++] = x * 0.0052 + y * 0.0033
          dots[n++] = y * 0.0041 - x * 0.0017
        }
      }
      place()
      draw(performance.now(), 16.67)
      box.setAttribute("data-drawn", "")
    }

    let raf = 0
    let last = 0
    let near = false
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      /* 60 a second while a mouse is in the section (a 120Hz screen draws every other frame), 30 otherwise. */
      if (last && t - last < (hasAim ? 12 : 30)) return
      const dt = last ? Math.min(64, t - last) : 16.67
      last = t
      draw(t, dt)
    }
    const run = () => {
      const go = near && document.visibilityState !== "hidden" && !reduced
      if (go && !raf) {
        last = 0
        raf = requestAnimationFrame(frame)
      } else if (!go && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      aimX = e.clientX + window.scrollX
      aimY = e.clientY + window.scrollY
      hasAim = true
    }
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      place()
      onMove(e)
    }
    const onLeave = () => {
      hasAim = false
    }

    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null
    ro?.observe(box)
    resize()
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([e]) => {
            near = e.isIntersecting
            if (near) place()
            run()
          })
        : null
    if (io) io.observe(box)
    else {
      near = true
      run()
    }
    document.addEventListener("visibilitychange", run)
    if (fine && !reduced) {
      section.addEventListener("pointerenter", onEnter)
      section.addEventListener("pointermove", onMove, { passive: true })
      section.addEventListener("pointerleave", onLeave)
    }
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      io?.disconnect()
      document.removeEventListener("visibilitychange", run)
      section.removeEventListener("pointerenter", onEnter)
      section.removeEventListener("pointermove", onMove)
      section.removeEventListener("pointerleave", onLeave)
    }
  }, [host])
  return (
    <div ref={boxRef} className="cmh-field" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}

export function HowItWorks() {
  const section = useRef<HTMLElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  useCardsLive(grid)
  const pictures: Record<(typeof HOW_CARDS)[number]["key"], ReactNode> = {
    business: <DashScene />,
    tips: <TipScene />,
    domain: <DomainScene />,
  }
  return (
    <section ref={section} className="cmh" data-how-section="" aria-labelledby="cmh-title">
      <style href="w12-commerce-how" precedence="default">
        {HOW_CSS}
      </style>
      <HowField host={section} />
      <div className="cmh-in home-wrap">
        <h2 id="cmh-title" className="cmh-h">
          {HOW_HEADING.lead} <span className="cmh-h-mute">{HOW_HEADING.rest}</span>
        </h2>
        <div ref={grid} className="cmh-grid">
          {HOW_CARDS.map((c) => (
            <article key={c.key} className={`cmh-card ${c.wide ? "cmh-wide" : "cmh-narrow"}`} data-card={c.key}>
              <div className="cmh-stage" data-picture={c.key} aria-hidden="true">
                {pictures[c.key]}
              </div>
              <h3 className="cmh-cap-t">{c.title}</h3>
              <p className="cmh-cap">{c.line}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. THE DASHBOARD (landing round 12): /app's home as it is drawn there.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Section 3's two products, at their prices: what an order on the dashboard is. */
export const HOW_PRODUCTS = [
  { id: "luts", name: "Cine Tones LUT Pack", priceCents: 2900 },
  { id: "tee", name: "Midnight Studio Tee", priceCents: 3200 },
] as const

/** The last seven days, Nov 10 to Nov 16 (today), as [LUT packs, tees] sold a day. */
export const HOW_WEEK: readonly (readonly [number, number])[] = [
  [3, 0], [1, 2], [4, 0], [1, 1], [2, 2], [3, 2], [2, 1],
]
export const HOW_WEEK_DAYS = ["Nov 10", "Nov 11", "Nov 12", "Nov 13", "Nov 14", "Nov 15", "Nov 16"] as const
/** What each day sold, in whole dollars (the chart's line). */
export const HOW_DAY_DOLLARS = HOW_WEEK.map(([l, t]) => (l * HOW_PRODUCTS[0].priceCents + t * HOW_PRODUCTS[1].priceCents) / 100)

/**
 * The dashboard's figures for the last 7 days, and the 7 days before them (example figures, made up).
 * Orders and revenue are the week above; conversion is orders over visitors
 * (the app's "Orders per visitor"), each change is against the week before.
 */
export const HOW_DASH = {
  visitors: 846,
  pageViews: 2140,
  orders: HOW_WEEK.reduce((a, [l, t]) => a + l + t, 0),
  revenue: HOW_DAY_DOLLARS.reduce((a, b) => a + b, 0),
  prev: { visitors: 742, orders: 20, revenue: 610 },
  allTime: { orders: 327, revenue: 9842 },
  live: 5,
} as const
export const howConversion = (orders: number, visitors: number) => (orders / visitors) * 100
/** A change against the period before, as the app rounds it. */
export const howChange = (now: number, before: number) => Math.round(((now - before) / before) * 100)

/**
 * What comes in while the dashboard is on screen, one step every
 * HOW_TICK_MS: the visitors who arrived, and on some steps an order of one
 * product. It stops after the last step, before any figure needs another
 * digit (visitors stay under 1,000, revenue under $1,000).
 */
export const HOW_TICKS: readonly { visitors: number; order?: "luts" | "tee" }[] = [
  { visitors: 2 }, { visitors: 1 }, { visitors: 1, order: "luts" }, { visitors: 2 }, { visitors: 1 }, { visitors: 2 },
  { visitors: 1, order: "tee" }, { visitors: 1 }, { visitors: 2 }, { visitors: 1 }, { visitors: 1, order: "luts" }, { visitors: 2 },
  { visitors: 1 }, { visitors: 2 }, { visitors: 1 }, { visitors: 1, order: "luts" }, { visitors: 2 }, { visitors: 1 },
  { visitors: 1 }, { visitors: 2, order: "tee" }, { visitors: 1 }, { visitors: 2 }, { visitors: 1 }, { visitors: 1, order: "luts" },
]
export const HOW_TICK_MS = 1900
/** The live count beside the period, step by step. */
const LIVE_STEPS = [5, 6, 6, 7, 6, 5, 4, 5, 6, 5, 4, 4]

/** The figures, as the dashboard writes them (dashboard-client: a whole amount without .00; conversion as Analytics writes a rate under 10%, one decimal). */
type DashFigures = { visitors: number; orders: number; revenue: number; live: number }
const fmtDash = (f: DashFigures) => ({
  visitors: String(f.visitors),
  revenue: `$${f.revenue}`,
  orders: String(f.orders),
  conversion: `${howConversion(f.orders, f.visitors).toFixed(1)}%`,
  live: String(f.live),
})
const DASH_START: DashFigures = { visitors: HOW_DASH.visitors, orders: HOW_DASH.orders, revenue: HOW_DASH.revenue, live: HOW_DASH.live }
export const HOW_DASH_TEXT = fmtDash(DASH_START)

/* The chart: the week's revenue as the dashboard draws it (morph-lines: a 2px violet line over a 15% to 0 fill, the end dot ringed in white). */
const CHART_TOP = 160
const CHART_TICKS = [0, 40, 80, 120, 160]
/** A smooth line through the points (monotone, so it never overshoots), in a 1000 x 100 box. */
function smoothPath(ys: readonly number[], top: number) {
  const n = ys.length
  const pts = ys.map((v, i) => [(i / (n - 1)) * 1000, 100 - (v / top) * 100] as const)
  const d = pts.map((_, i) => (i === 0 ? pts[1][1] - pts[0][1] : i === n - 1 ? pts[n - 1][1] - pts[n - 2][1] : (pts[i + 1][1] - pts[i - 1][1]) / 2))
  const dx = 1000 / (n - 1)
  /* Flatten the slope at a turn, so the line does not overshoot a peak. */
  for (let i = 1; i < n - 1; i++) {
    const a = pts[i][1] - pts[i - 1][1]
    const b = pts[i + 1][1] - pts[i][1]
    if (a * b <= 0) d[i] = 0
  }
  let p = `M${pts[0][0]} ${pts[0][1].toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    p += `C${(x0 + dx / 3).toFixed(1)} ${(y0 + d[i] / 3).toFixed(2)} ${(x1 - dx / 3).toFixed(1)} ${(y1 - d[i + 1] / 3).toFixed(2)} ${x1} ${y1.toFixed(2)}`
  }
  return p
}
const CHART_LINE = smoothPath(HOW_DAY_DOLLARS, CHART_TOP)
const CHART_AREA = `${CHART_LINE}L1000 100L0 100Z`
const CHART_END_Y = 100 - (HOW_DAY_DOLLARS[HOW_DAY_DOLLARS.length - 1] / CHART_TOP) * 100

/* The rail's icons: Solar's linear glyphs and the app's own (components/app/sidebar-desktop-nav), 24 unit box, 1.5 stroke. */
const ICON_PATHS: Record<string, string[]> = {
  products: [
    "M15.5777 3.38197L17.5777 4.43152C19.7294 5.56066 20.8052 6.12523 21.4026 7.13974C22 8.15425 22 9.41667 22 11.9415V12.0585C22 14.5833 22 15.8458 21.4026 16.8603C20.8052 17.8748 19.7294 18.4393 17.5777 19.5685L15.5777 20.618C13.8221 21.5393 12.9443 22 12 22C11.0557 22 10.1779 21.5393 8.42229 20.618L6.42229 19.5685C4.27063 18.4393 3.19479 17.8748 2.5974 16.8603C2 15.8458 2 14.5833 2 12.0585V11.9415C2 9.41667 2 8.15425 2.5974 7.13974C3.19479 6.12523 4.27063 5.56066 6.42229 4.43152L8.42229 3.38197C10.1779 2.46066 11.0557 2 12 2C12.9443 2 13.8221 2.46066 15.5777 3.38197Z",
    "M21 7.5L17 9.5M12 12L3 7.5M12 12V21.5M12 12C12 12 14.7426 10.6287 16.5 9.75C16.6953 9.65237 17 9.5 17 9.5M17 9.5V13M17 9.5L7.5 4.5",
  ],
  analytics: [
    "M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z",
    "M7 18V9M12 18V6M17 18V13",
  ],
  orders: [
    "M16.755 2H7.24502C6.08614 2 5.50671 2 5.03939 2.16261C4.15322 2.47096 3.45748 3.18719 3.15795 4.09946C3 4.58055 3 5.17705 3 6.37006V20.3742C3 21.2324 3.985 21.6878 4.6081 21.1176C4.97417 20.7826 5.52583 20.7826 5.8919 21.1176L6.375 21.5597C7.01659 22.1468 7.98341 22.1468 8.625 21.5597C9.26659 20.9726 10.2334 20.9726 10.875 21.5597C11.5166 22.1468 12.4834 22.1468 13.125 21.5597C13.7666 20.9726 14.7334 20.9726 15.375 21.5597C16.0166 22.1468 16.9834 22.1468 17.625 21.5597L18.1081 21.1176C18.4742 20.7826 19.0258 20.7826 19.3919 21.1176C20.015 21.6878 21 21.2324 21 20.3742V6.37006C21 5.17705 21 4.58055 20.842 4.09946C20.5425 3.18719 19.8468 2.47096 18.9606 2.16261C18.4933 2 17.9139 2 16.755 2Z",
    "M10.5 11L17 11M7 11H7.5M7 7.5H7.5M7 14.5H7.5M10.5 7.5H17M10.5 14.5H17",
  ],
  creator: [
    "M11 9a2 2 0 1 1-4 0a2 2 0 1 1 4 0Z",
    "M13 15C13 16.1046 13 17 9 17C5 17 5 16.1046 5 15C5 13.8954 6.79086 13 9 13C11.2091 13 13 13.8954 13 15Z",
    "M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12C22 15.7712 22 17.6569 20.8284 18.8284C19.6569 20 17.7712 20 14 20H10C6.22876 20 4.34315 20 3.17157 18.8284C2 17.6569 2 15.7712 2 12Z",
    "M19 12H15M19 9H14M19 15H16",
  ],
  website: [
    "M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z",
    "M2 9.5H22M9 21L9 10M12 6H12.0001M9 6H9.0001M6 6H6.0001",
  ],
  onepage: [
    "M4 10C4 6.22876 4 4.34315 5.17157 3.17157C6.34315 2 8.22876 2 12 2C15.7712 2 17.6569 2 18.8284 3.17157C20 4.34315 20 6.22876 20 10V14C20 17.7712 20 19.6569 18.8284 20.8284C17.6569 22 15.7712 22 12 22C8.22876 22 6.34315 22 5.17157 20.8284C4 19.6569 4 17.7712 4 14V10Z",
    "M9 7.75H15M9 11.75H15M9 15.75H15",
  ],
  contacts: [
    "M11 9a2 2 0 1 1-4 0a2 2 0 1 1 4 0Z",
    "M13 15C13 16.1046 13 17 9 17C5 17 5 16.1046 5 15C5 13.8954 6.79086 13 9 13C11.2091 13 13 13.8954 13 15Z",
    "M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12C22 15.7712 22 17.6569 20.8284 18.8284C19.6569 20 17.7712 20 14 20H10C6.22876 20 4.34315 20 3.17157 18.8284C2 17.6569 2 15.7712 2 12Z",
    "M19 12H15M19 9H14M19 15H16",
  ],
  emails: [
    "M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12C22 15.7712 22 17.6569 20.8284 18.8284C19.6569 20 17.7712 20 14 20H10C6.22876 20 4.34315 20 3.17157 18.8284C2 17.6569 2 15.7712 2 12Z",
    "M6 8L8.1589 9.79908C9.99553 11.3296 10.9139 12.0949 12 12.0949C13.0861 12.0949 14.0045 11.3296 15.8411 9.79908L18 8",
  ],
  integrations: [
    "M14.5 6.5H17.5M17.5 6.5H20.5M17.5 6.5V9.5M17.5 6.5V3.5",
    "M2.5 6.5C2.5 4.61438 2.5 3.67157 3.08579 3.08579C3.67157 2.5 4.61438 2.5 6.5 2.5C8.38562 2.5 9.32843 2.5 9.91421 3.08579C10.5 3.67157 10.5 4.61438 10.5 6.5C10.5 8.38562 10.5 9.32843 9.91421 9.91421C9.32843 10.5 8.38562 10.5 6.5 10.5C4.61438 10.5 3.67157 10.5 3.08579 9.91421C2.5 9.32843 2.5 8.38562 2.5 6.5Z",
    "M13.5 17.5C13.5 15.6144 13.5 14.6716 14.0858 14.0858C14.6716 13.5 15.6144 13.5 17.5 13.5C19.3856 13.5 20.3284 13.5 20.9142 14.0858C21.5 14.6716 21.5 15.6144 21.5 17.5C21.5 19.3856 21.5 20.3284 20.9142 20.9142C20.3284 21.5 19.3856 21.5 17.5 21.5C15.6144 21.5 14.6716 21.5 14.0858 20.9142C13.5 20.3284 13.5 19.3856 13.5 17.5Z",
    "M2.5 17.5C2.5 15.6144 2.5 14.6716 3.08579 14.0858C3.67157 13.5 4.61438 13.5 6.5 13.5C8.38562 13.5 9.32843 13.5 9.91421 14.0858C10.5 14.6716 10.5 15.6144 10.5 17.5C10.5 19.3856 10.5 20.3284 9.91421 20.9142C9.32843 21.5 8.38562 21.5 6.5 21.5C4.61438 21.5 3.67157 21.5 3.08579 20.9142C2.5 20.3284 2.5 19.3856 2.5 17.5Z",
  ],
  payouts: [
    "M9.4 8.6C6 10.4 2.75 13.5 2.75 17C2.75 20.6 5.2 22 9.3 22H14.7C18.8 22 21.25 20.6 21.25 17C21.25 13.5 18 10.4 14.6 8.6",
    "M8.4 8.6H15.6",
    "M10.1 8.6L8.1 4.6C7.6 3.6 8.5 2.6 9.5 2.9C10.3 3.2 11.1 3.4 12 3.4C12.9 3.4 13.7 3.2 14.5 2.9C15.5 2.6 16.4 3.6 15.9 4.6L13.9 8.6",
    "M12 18.57C13.05 18.57 13.9 17.86 13.9 16.98C13.9 16.11 13.05 15.4 12 15.4C10.95 15.4 10.1 14.69 10.1 13.82C10.1 12.94 10.95 12.23 12 12.23M12 18.57C10.95 18.57 10.1 17.86 10.1 16.98M12 18.57V19.2M12 11.6V12.23M12 12.23C13.05 12.23 13.9 12.94 13.9 13.82",
  ],
}
/** The house, filled with its door cut out: the row you are on (sidebar-desktop-nav HomeFillIcon). */
const HOME_FILL =
  "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8z"

/** The rail, in the app's order (components/app/sidebar mainNavItems; Integrations after Emails). */
export const HOW_RAIL = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Products" },
  { key: "analytics", label: "Analytics" },
  { key: "orders", label: "Orders" },
  { key: "creator", label: "Creator Page" },
  { key: "website", label: "Website" },
  { key: "onepage", label: "OnePage" },
  { key: "contacts", label: "Contacts" },
  { key: "emails", label: "Emails" },
  { key: "integrations", label: "Integrations" },
  { key: "payouts", label: "Payouts" },
] as const

function RailIcon({ k }: { k: string }) {
  if (k === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd">
        <path d={HOME_FILL} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[k].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

/** Lucide's line glyphs the app's header and tabs draw. */
const Lucide = ({ d, className }: { d: string[]; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {d.map((p, i) => (
      <path key={i} d={p} />
    ))}
  </svg>
)
const L_CHEVRON = ["m6 9 6 6 6-6"]
const L_SEARCH = ["M19 11a8 8 0 1 1-16 0a8 8 0 1 1 16 0Z", "m21 21-4.3-4.3"]
const L_BELL = ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"]
const L_GEAR = [
  "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
  "M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0Z",
]
const L_EXTERNAL = ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"]
const L_TREND = ["M22 7 13.5 15.5 8.5 10.5 2 17", "M16 7h6v6"]

/** Cells in an odometer's column: the numerals three times over, so a digit can always roll the way the number moves. */
const ODO_CELLS = 30
/**
 * A figure as an odometer: every digit a clipped window on a column of
 * numerals, the column moved by a transform. Drawn at its finished value;
 * the dashboard's ticker (useDashLive) rolls it from there. Anything that is
 * not a digit ($, the point, %) stands still.
 */
function Odo({ name, text }: { name: string; text: string }) {
  return (
    <span className="cmh-odo" data-odo={name}>
      {[...text].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="cmh-odo-d">
            <span className="cmh-odo-col" style={{ transform: `translate3d(0,${(-(10 + +ch) * 100) / ODO_CELLS}%,0)` }} data-pos={10 + +ch}>
              {Array.from({ length: ODO_CELLS }, (_, k) => (
                <span key={k}>{k % 10}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} className="cmh-odo-s">
            {ch}
          </span>
        ),
      )}
    </span>
  )
}

/**
 * The dashboard's motion. Before the card is first seen, every figure stands
 * at nothing (each column at its first 0, the figure faded); seen, the
 * columns roll forward to their values, the leftmost first. Then one step of
 * HOW_TICKS every HOW_TICK_MS while the card is live, each figure rolling to
 * its new value, until the steps run out. Reduced motion: the finished
 * figures, still, as drawn.
 */
function useDashLive(root: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = root.current
    const card = el?.closest<HTMLElement>(".cmh-card")
    if (!el || !card) return
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const cols = (name: string) => [...el.querySelectorAll<HTMLElement>(`[data-odo="${name}"] .cmh-odo-col`)]
    const place = (col: HTMLElement, pos: number, ms: number) => {
      col.style.transitionDuration = `${ms}ms`
      col.style.transform = `translate3d(0,${(-pos * 100) / ODO_CELLS}%,0)`
      col.dataset.pos = String(pos)
    }
    /* Nothing yet: every column on its first 0, at once. */
    for (const col of el.querySelectorAll<HTMLElement>(".cmh-odo-col")) place(col, 0, 0)
    el.setAttribute("data-empty", "")

    let figures = { ...DASH_START }
    /* A figure to its new text: each digit rolls the way the number went, by the shorter count of cells, never past the column. */
    const roll = (name: keyof ReturnType<typeof fmtDash>, text: string, up: boolean, ms: number) => {
      const digits = [...text].filter((c) => /\d/.test(c)).map(Number)
      cols(name).forEach((col, i) => {
        const pos = Number(col.dataset.pos ?? 0)
        const cur = pos % 10
        const d = digits[i]
        if (d === undefined || d === cur) return
        let to = pos - cur + d
        if (up && d < cur) to += 10
        if (!up && d > cur) to -= 10
        /* Back to the middle band first, unseen, when a roll would leave the column. */
        if (to >= ODO_CELLS || to < 0) {
          const home = 10 + cur
          place(col, home, 0)
          void col.offsetHeight
          to = home - cur + d + (up && d < cur ? 10 : !up && d > cur ? -10 : 0)
        }
        place(col, to, ms)
      })
    }

    let filled = false
    let step = 0
    const fill = () => {
      if (filled) return
      filled = true
      el.removeAttribute("data-empty")
      const text = fmtDash(figures)
      ;(Object.keys(text) as (keyof typeof text)[]).forEach((name, n) => {
        const list = cols(name)
        const digits = [...text[name]].filter((c) => /\d/.test(c)).map(Number)
        list.forEach((col, i) => {
          col.style.transitionDelay = `${120 + n * 90 + i * 60}ms`
          place(col, 10 + digits[i], 1500 + i * 120)
        })
      })
      window.setTimeout(() => {
        for (const col of el.querySelectorAll<HTMLElement>(".cmh-odo-col")) col.style.transitionDelay = ""
      }, 2600)
    }
    const tick = () => {
      if (!filled || step >= HOW_TICKS.length || !card.hasAttribute("data-commerce-live")) return
      const s = HOW_TICKS[step]
      const before = fmtDash(figures)
      const prevConv = howConversion(figures.orders, figures.visitors)
      figures = {
        visitors: figures.visitors + s.visitors,
        orders: figures.orders + (s.order ? 1 : 0),
        revenue: figures.revenue + (s.order ? HOW_PRODUCTS.find((p) => p.id === s.order)!.priceCents / 100 : 0),
        live: LIVE_STEPS[(step + 1) % LIVE_STEPS.length],
      }
      step++
      const after = fmtDash(figures)
      if (after.visitors !== before.visitors) roll("visitors", after.visitors, true, 700)
      if (after.orders !== before.orders) roll("orders", after.orders, true, 800)
      if (after.revenue !== before.revenue) roll("revenue", after.revenue, true, 900)
      if (after.conversion !== before.conversion) roll("conversion", after.conversion, howConversion(figures.orders, figures.visitors) > prevConv, 800)
      if (after.live !== before.live) roll("live", after.live, Number(after.live) > Number(before.live), 500)
    }

    /* Filled the first time the card is seen (useCardsLive's data-seen), whichever comes first: the attribute or this effect. */
    const mo = new MutationObserver(() => {
      if (card.hasAttribute("data-seen")) fill()
    })
    mo.observe(card, { attributes: true, attributeFilter: ["data-seen"] })
    if (card.hasAttribute("data-seen")) fill()
    const timer = window.setInterval(tick, HOW_TICK_MS)
    return () => {
      mo.disconnect()
      window.clearInterval(timer)
    }
  }, [root])
}

function DashScene() {
  const root = useRef<HTMLDivElement>(null)
  useDashLive(root)
  const t = HOW_DASH_TEXT
  const tabs = [
    { key: "visitors", label: "Visitors", odo: t.visitors, change: howChange(HOW_DASH.visitors, HOW_DASH.prev.visitors), foot: `${(HOW_DASH.pageViews / 1000).toFixed(1)}K page views` },
    { key: "revenue", label: "Revenue", odo: t.revenue, change: howChange(HOW_DASH.revenue, HOW_DASH.prev.revenue), foot: `$${HOW_DASH.allTime.revenue.toLocaleString("en-US")} all time`, on: true },
    { key: "orders", label: "Orders", odo: t.orders, change: howChange(HOW_DASH.orders, HOW_DASH.prev.orders), foot: `${HOW_DASH.allTime.orders} all time` },
    {
      key: "conversion",
      label: "Conversion Rate",
      odo: t.conversion,
      change: howChange(howConversion(HOW_DASH.orders, HOW_DASH.visitors), howConversion(HOW_DASH.prev.orders, HOW_DASH.prev.visitors)),
      foot: "Orders per visitor",
    },
  ]
  return (
    <div ref={root} className="cmh-db">
      {/* The header (components/app/sidebar): who you are, the search, the bell and settings, the logo. */}
      <div className="cmh-db-top">
        <span className="cmh-db-me">
          <img src={HOW_SHOP.avatar} alt="" width={160} height={160} loading="lazy" decoding="async" />
          <span>{HOW_SHOP.creator}</span>
          <Lucide d={L_CHEVRON} className="cmh-db-chev" />
        </span>
        <span className="cmh-db-search">
          <Lucide d={L_SEARCH} />
          <span>Search orders, customers, products</span>
          <kbd>⌘K</kbd>
        </span>
        <span className="cmh-db-tools">
          <Lucide d={L_BELL} />
          <Lucide d={L_GEAR} className="cmh-db-gear" />
          <i />
          <img src={STORELIB_LOGO} alt="" width={26} height={26} loading="lazy" decoding="async" />
          <b>Storelib</b>
        </span>
      </div>
      <div className="cmh-db-body">
        <span className="cmh-db-rail">
          {HOW_RAIL.map((r) => (
            <span key={r.key} className="cmh-db-row" data-on={r.key === "dashboard" ? "" : undefined}>
              <RailIcon k={r.key} />
              {r.label}
            </span>
          ))}
        </span>
        <span className="cmh-db-main">
          <span className="cmh-db-in">
            <span className="cmh-db-head">
              <span className="cmh-db-hl">
                <span className="cmh-db-hrow">
                  <b className="cmh-db-hi">Good morning, {HOW_SHOP.first}</b>
                  <span className="cmh-db-meta">
                    <span className="cmh-db-period">
                      Last 7 days
                      <Lucide d={L_CHEVRON} />
                    </span>
                    <span className="cmh-db-live">
                      <i />
                      <Odo name="live" text={t.live} /> live
                    </span>
                  </span>
                </span>
                <span className="cmh-db-sub">Here&apos;s what&apos;s happening with your store</span>
              </span>
              <span className="cmh-db-handle">
                @{HOW_SHOP.handle}
                <Lucide d={L_EXTERNAL} />
              </span>
            </span>
            <span className="cmh-db-card">
              <span className="cmh-db-tabs">
                {tabs.map((tab) => (
                  <span key={tab.key} className="cmh-db-tab" data-tab={tab.key} data-on={tab.on ? "" : undefined}>
                    <span className="cmh-db-tl">{tab.label}</span>
                    <span className="cmh-db-tv">
                      <b>
                        <Odo name={tab.key} text={tab.odo} />
                      </b>
                      <span className="cmh-db-up">
                        <Lucide d={L_TREND} />
                        {tab.change}%
                      </span>
                    </span>
                    <span className="cmh-db-tf">{tab.foot}</span>
                  </span>
                ))}
              </span>
              <span className="cmh-db-chart">
                <span className="cmh-db-plot">
                  {CHART_TICKS.map((v) => (
                    <span key={v} className="cmh-db-grid" style={{ bottom: `${(v / CHART_TOP) * 100}%` }}>
                      <small>${v}</small>
                    </span>
                  ))}
                  <span className="cmh-db-clip">
                    <span className="cmh-o cmh-db-wipe">
                      <span className="cmh-o cmh-db-unwipe">
                        <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="cmh-db-fill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.15} />
                              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <path d={CHART_AREA} fill="url(#cmh-db-fill)" />
                          <path d={CHART_LINE} fill="none" stroke="#8b5cf6" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        </svg>
                      </span>
                    </span>
                  </span>
                  <i className="cmh-o cmh-db-dot" style={{ top: `${CHART_END_Y.toFixed(2)}%` }} />
                </span>
                <span className="cmh-db-days">
                  {HOW_WEEK_DAYS.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </span>
              </span>
            </span>
          </span>
        </span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. TIPS (landing round 12): Ruben's creator page, a tip picked, paid and
   thanked for. One 10 second loop, every step a transform or an opacity:
   $3 is chosen, a tap lands on $5 and it is chosen, the button reads
   "Tip $5"; a tap on it, the checkout sheet rises over the page, a tap on
   Pay, the sheet goes down and the block says thank you; then it is as it
   was, changed only while hidden.
   ═══════════════════════════════════════════════════════════════════════════ */
/** The amounts on Ruben's tip block (the block's defaults, lib/onepage/tips TIP_DEFAULT_AMOUNTS) and the one picked. */
export const TIP_AMOUNTS = ["$3", "$5", "$10"] as const
export const HOW_TIP = { picked: "$5", from: "$3", title: "Leave a tip", subtitle: "Wood for the next build", thanks: "Thank you for the $5 tip." } as const
export const HOW_TIP_LOOP_S = 10

function TipScene() {
  return (
    <div className="cmh-sc cmh-tp">
      <div className="cmh-tp-page">
        <span className="cmh-tp-cover">
          <img src={HOW_SHOP.cover} alt="" width={640} height={420} loading="lazy" decoding="async" />
        </span>
        <span className="cmh-tp-who">
          <img src={HOW_SHOP.avatar} alt="" width={160} height={160} loading="lazy" decoding="async" />
          <b>{HOW_SHOP.creator}</b>
          <span>Furniture and lathe videos, every Sunday</span>
        </span>
        <span className="cmh-tp-block">
          <b className="cmh-tp-t">{HOW_TIP.title}</b>
          <span className="cmh-tp-s">{HOW_TIP.subtitle}</span>
          <span className="cmh-tp-swap">
            <span className="cmh-a cmh-tp-pick">
              <span className="cmh-tp-chips">
                {[...TIP_AMOUNTS, "Other"].map((a) => (
                  <span key={a} className="cmh-tp-chip" data-amount={a}>
                    <span>{a}</span>
                    {a === HOW_TIP.from || a === HOW_TIP.picked ? (
                      <i className={`cmh-a cmh-tp-on${a === HOW_TIP.picked ? " cmh-tp-on5" : " cmh-tp-on3"}`}>
                        <span>{a}</span>
                      </i>
                    ) : null}
                    {a === HOW_TIP.picked ? <i className="cmh-a cmh-tp-tap cmh-tp-tap1" /> : null}
                  </span>
                ))}
              </span>
              <span className="cmh-a cmh-tp-btn">
                <span className="cmh-a cmh-tp-l3">Tip {HOW_TIP.from}</span>
                <span className="cmh-a cmh-tp-l5">Tip {HOW_TIP.picked}</span>
                <i className="cmh-a cmh-tp-tap cmh-tp-tap2" />
              </span>
            </span>
            <span className="cmh-a cmh-tp-thx">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5 10 17.5 19 7.5" />
              </svg>
              {HOW_TIP.thanks}
            </span>
          </span>
        </span>
        {/* The checkout, over the page: dimmed behind, the sheet from the foot. */}
        <i className="cmh-a cmh-tp-scrim" />
        <span className="cmh-a cmh-tp-sheet">
          <i className="cmh-tp-grab" />
          <span className="cmh-tp-for">
            <img src={HOW_SHOP.avatar} alt="" width={160} height={160} loading="lazy" decoding="async" />
            Tip for {HOW_SHOP.creator}
          </span>
          <b className="cmh-tp-amt">$5.00</b>
          <span className="cmh-a cmh-tp-pay">
            Pay $5.00
            <i className="cmh-a cmh-tp-tap cmh-tp-tap3" />
          </span>
          <span className="cmh-tp-lock">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            Paid securely through Stripe
          </span>
        </span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. YOUR OWN DOMAIN (landing round 12, the owner's reference): a store's
   front page as four photographs and its line, and over it a big rounded
   address field. The address types itself in, a caret leading it, ".com" in
   blue; a green check comes in when it is done; it holds, fades, and the
   loop begins again. The caret's stops are measured once (useCaretStops),
   never in a frame.
   ═══════════════════════════════════════════════════════════════════════════ */
/** Fernlyn (made up): botanical oils and candles, and the domain it owns, serving its website (lib/custom-domains DOMAIN_PURPOSES). */
export const HOW_DOMAIN = {
  store: "Fernlyn",
  line: "Botanical oils and candles, poured by hand",
  host: "fernlyn.com",
  typed: "www.fernlyn.com",
  purpose: "website" satisfies DomainPurpose,
} as const
/** The front page's four photographs (Unsplash, cropped 4:3, 640x480): two scenes on the diagonal, two products on light grounds. */
export const HOW_DOMAIN_PHOTOS = [`${HOW}/fern-linen.webp`, `${HOW}/fern-oil.webp`, `${HOW}/fern-roller.webp`, `${HOW}/fern-table.webp`] as const
const DM_CHARS = [...HOW_DOMAIN.typed]
/** Where ".com" starts: the part drawn in blue. */
const DM_TLD_AT = HOW_DOMAIN.typed.lastIndexOf(".")
/** The loop, in seconds, and when each thing happens in it. */
export const DM_LOOP = 9
const DM_TYPE_START = 0.9
const DM_TYPE_EACH = 0.11
const DM_TYPED_AT = DM_TYPE_START + DM_CHARS.length * DM_TYPE_EACH
const DM_CHECK_AT = DM_TYPED_AT + 0.35
const DM_FADE_AT = 7.9

function useCaretStops(stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const field = stage.current?.querySelector<HTMLElement>(".cmh-dm-type")
    if (!field) return
    const chars = [...field.querySelectorAll<HTMLElement>(".cmh-dm-ch")]
    const measure = () => {
      const left = field.getBoundingClientRect().left
      chars.forEach((c, i) => {
        const r = c.getBoundingClientRect()
        if (r.width > 0) field.style.setProperty(`--x${i + 1}`, `${(r.right - left).toFixed(1)}px`)
      })
    }
    measure()
    if (typeof ResizeObserver !== "function") return
    const ro = new ResizeObserver(measure)
    ro.observe(field)
    return () => ro.disconnect()
  }, [stage])
}

function DomainScene() {
  const stage = useRef<HTMLDivElement>(null)
  useCaretStops(stage)
  return (
    <div ref={stage} className="cmh-sc cmh-dm">
      <div className="cmh-dm-shop">
        <span className="cmh-dm-grid">
          {HOW_DOMAIN_PHOTOS.map((src) => (
            <img key={src} src={src} alt="" width={640} height={480} loading="lazy" decoding="async" />
          ))}
        </span>
        <span className="cmh-dm-foot">{HOW_DOMAIN.line}</span>
      </div>
      <div className="cmh-dm-field">
        <span className="cmh-a cmh-dm-type">
          {DM_CHARS.map((ch, i) => (
            <span key={i} className={`cmh-a cmh-dm-ch${i >= DM_TLD_AT ? " cmh-dm-tld" : ""}`} data-i={i}>
              {ch}
            </span>
          ))}
          <i className="cmh-a cmh-dm-caret" />
        </span>
        <span className="cmh-a cmh-dm-check">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="24" cy="24" r="20" />
            <path d="m15.5 24.5 6 6 11-12" />
          </svg>
        </span>
      </div>
    </div>
  )
}

/* ── the stylesheet ── */
const EASE = "cubic-bezier(.22,1,.36,1)"
const pc = (s: number, loop: number) => `${+((s / loop) * 100).toFixed(3)}%`
const T = (s: number) => pc(s, HOW_TIP_LOOP_S)
const D = (s: number) => pc(s, DM_LOOP)
/** Each character of the address shows from its moment until the field fades. */
const DM_CHAR_KEYS = DM_CHARS.map((_, i) => {
  const at = DM_TYPE_START + i * DM_TYPE_EACH
  return `.cmh-dm-ch[data-i="${i}"]{animation-name:cmh-dc${i}}\n@keyframes cmh-dc${i}{0%,${D(at)}{opacity:0;transform:translate3d(0,.12em,0)}${D(at + 0.08)},100%{opacity:1;transform:translate3d(0,0,0)}}`
}).join("\n")
/** The caret: at the field's start, then after each character as it comes, then gone with the check. */
const DM_CARET_KEYS =
  `0%,${D(DM_TYPE_START)}{transform:translate3d(0,0,0)}` +
  DM_CHARS.map((_, i) => {
    const at = DM_TYPE_START + i * DM_TYPE_EACH
    return `${D(at + 0.001)},${D(at + DM_TYPE_EACH - 0.001)}{transform:translate3d(var(--x${i + 1},${((i + 1) * 0.58).toFixed(2)}em),0,0)}`
  }).join("") +
  `100%{transform:translate3d(var(--x${DM_CHARS.length},${(DM_CHARS.length * 0.58).toFixed(2)}em),0,0)}`

const HOW_CSS = `
/* Its own box: no data-story-section. The same --home-pad top and bottom. A stacking context, so the dot field sits behind the words and never behind the page. */
.cmh{position:relative;isolation:isolate;background:#fff;color:#18181b;padding-block:var(--home-pad,clamp(48px,5.6vw,80px))}
/* The page's shared box (globals.css .home-wrap), restated with the same values so the section holds its edges on its own. */
.cmh-in{box-sizing:border-box;width:100%;max-width:var(--home-max,2020px);margin-inline:auto;padding-inline:var(--home-edge,clamp(20px,5.15vw,84px))}
/* The dots behind the heading: the head of the section only, gone by the pictures (the fade is each dot's own brightness). */
.cmh-field{position:absolute;z-index:-1;left:0;right:0;top:0;height:min(100%,clamp(420px,46vw,640px));overflow:clip;pointer-events:none}
.cmh-field canvas{display:block;width:100%;height:100%;opacity:0;transition:opacity .9s ease-out}
.cmh-field[data-drawn] canvas{opacity:1}
/* Section 3's heading: two tones, the lead dark and the rest grey; it starts --home-head-inset in from the pictures' edge. */
.cmh-h{margin:0 0 clamp(32px,4.4vw,60px);padding-left:var(--home-head-inset,14px);font-size:clamp(34px,4.6vw,64px);font-weight:500;line-height:1.05;letter-spacing:-.045em;color:#18181b;text-wrap:balance}
.cmh-h-mute{display:block;color:#8e8c96}
@media(max-width:767px){.cmh-h{padding-left:var(--home-head-inset,0px)}}
/* Landing round 12: the pictures sit straight on the section, no grey box round them. One column on a phone; from 768px the dashboard has the whole width and tips and the domain share the row under it. */
.cmh-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:56px}
@media(min-width:768px){
  .cmh-grid{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(20px,2.4vw,40px);row-gap:clamp(56px,5vw,80px)}
  .cmh-wide{grid-column:1/-1}
}
.cmh-card{min-width:0}
.cmh-stage{position:relative;pointer-events:none;user-select:none;-webkit-user-select:none;container-type:inline-size;font-family:inherit}
.cmh-stage[data-picture=tips]{height:410px}
.cmh-stage[data-picture=domain]{height:300px}
@media(min-width:768px){.cmh-stage[data-picture=tips],.cmh-stage[data-picture=domain]{height:clamp(450px,36vw,600px)}}
/* The caption: a title and one short line under it. */
.cmh-cap-t{margin:22px 0 0;font-size:18px;font-weight:500;line-height:1.3;letter-spacing:-.015em;color:#18181b}
.cmh-cap{margin:6px 0 0;max-width:46ch;font-size:15px;line-height:1.5;color:#7c7a84;text-wrap:pretty}
@media(min-width:768px){.cmh-cap-t{font-size:19px}.cmh-cap{font-size:15.5px}}

/* Every loop is one of these, so going live restyles only the moving parts (a class, never * or a tag, in the rule keyed on data-commerce-live). */
.cmh-a{animation-duration:8s;animation-timing-function:${EASE};animation-iteration-count:infinite;animation-fill-mode:both;animation-play-state:paused!important}
[data-commerce-live] .cmh-a{animation-play-state:running!important}
/* What plays once, the first time its card is seen. */
.cmh-o{animation-duration:.7s;animation-timing-function:${EASE};animation-fill-mode:both;animation-play-state:paused}
[data-seen] .cmh-o{animation-play-state:running}
.cmh-sc{position:absolute;inset:0;line-height:1.3;color:#18181b}

/* ── 1. the dashboard: /app's home in its own sizes (dashboard-client, sidebar, metric-tab) ── */
.cmh-db{position:relative;display:block;overflow:hidden;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.08),0 30px 60px -36px rgba(24,24,27,.35);font-size:14px;line-height:1.35;color:#1a1a2e;transform:translateZ(0)}
.cmh-db img{display:block}
.cmh-db svg{display:block;flex:none}
.cmh-db-top{display:flex;align-items:center;gap:16px;height:58px;padding:0 20px;background:#131316;color:#fff}
.cmh-db-me{display:flex;align-items:center;gap:10px;flex:none;padding:6px 10px}
.cmh-db-me img{width:28px;height:28px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 1px rgba(255,255,255,.2)}
.cmh-db-me>span{font-size:13px;font-weight:500;color:rgba(255,255,255,.9)}
.cmh-db-chev{width:14px;height:14px;color:rgba(255,255,255,.5)}
.cmh-db-search{flex:1;display:flex;align-items:center;gap:10px;max-width:480px;height:36px;margin:0 auto;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.1);box-sizing:border-box;min-width:0}
.cmh-db-search svg{width:16px;height:16px;color:rgba(255,255,255,.5)}
.cmh-db-search span{flex:1;min-width:0;font-size:13px;color:rgba(255,255,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-db-search kbd{font:inherit;font-size:11px;padding:1px 6px;border-radius:4px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:rgba(255,255,255,.5)}
.cmh-db-tools{display:flex;align-items:center;gap:14px;flex:none;color:rgba(255,255,255,.75)}
.cmh-db-tools svg{width:19px;height:19px;stroke-width:1.5}
.cmh-db-tools>i{width:1px;height:20px;background:rgba(255,255,255,.15)}
.cmh-db-tools img{width:26px;height:26px;border-radius:7px;background:#895ffe;margin-right:-4px}
.cmh-db-tools b{font-size:15px;font-weight:600;color:#fff}
.cmh-db-body{display:flex;align-items:stretch}
/* The rail: 240px, its rows 38px, 15px type at 470, the row you are on #e8e8e8 at 575 (sidebar-desktop-nav ROW and its colours). */
.cmh-db-rail{flex:none;display:flex;flex-direction:column;gap:0;width:240px;box-sizing:border-box;padding:12px 7px 20px;border-right:1px solid rgba(229,229,229,.6)}
.cmh-db-row{display:flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:12px;font-size:15px;font-weight:470;letter-spacing:-.01em;color:#666;white-space:nowrap}
.cmh-db-row svg{width:20px;height:20px}
.cmh-db-row[data-on]{background:#e8e8e8;color:#202020;font-weight:575;box-shadow:0 1px 2px rgba(16,18,27,.07),inset 0 0 0 1px rgba(16,18,27,.045)}
.cmh-db-main{flex:1;min-width:0;display:block}
.cmh-db-in{display:block;max-width:1200px;margin:0 auto;padding:24px 32px 32px;box-sizing:border-box}
.cmh-db-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:32px}
.cmh-db-hl{display:block;min-width:0}
.cmh-db-hrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
.cmh-db-hi{font-size:26px;font-weight:600;letter-spacing:-.025em;color:#1a1a2e;white-space:nowrap}
.cmh-db-meta{display:flex;align-items:center;gap:10px}
.cmh-db-period{display:flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:12px;border:1px solid #e5e7eb;box-sizing:border-box;background:#fff;font-size:14px;font-weight:500;color:#1a1a2e;white-space:nowrap}
.cmh-db-period svg{width:14px;height:14px;color:#6b7280}
.cmh-db-live{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;background:#f3f4f6;font-size:13px;font-weight:500;color:#059669;white-space:nowrap}
.cmh-db-live>i{width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 6px rgba(16,185,129,.6)}
.cmh-db-sub{display:block;margin-top:4px;font-size:14px;color:#6b7280}
.cmh-db-handle{flex:none;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid #e5e7eb;font-size:13px;font-weight:500;color:#374151}
.cmh-db-handle svg{width:13px;height:13px;color:#9ca3af}
.cmh-db-card{display:block;background:#fff;border-radius:16px;border:1px solid rgba(229,231,235,.6);box-shadow:0 1px 3px rgba(0,0,0,.04);overflow:hidden}
.cmh-db-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
.cmh-db-tab{position:relative;display:block;min-width:0;padding:14px 16px;background:#fff}
.cmh-db-tab+.cmh-db-tab{border-left:1px solid rgba(229,231,235,.6)}
.cmh-db-tab[data-on]{background:#f9fafb}
.cmh-db-tab[data-on]::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.5px;background:#d1d5db}
.cmh-db-tl{display:block;font-size:13px;font-weight:500;color:#4b5563;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-db-tab[data-on] .cmh-db-tl{color:#1a1a2e}
.cmh-db-tv{display:flex;align-items:baseline;gap:6px;margin-top:2px;min-width:0}
.cmh-db-tv>b{font-size:22px;font-weight:700;letter-spacing:-.025em;color:#1a1a2e}
.cmh-db-up{display:inline-flex;align-items:center;gap:2px;font-size:11px;font-weight:500;color:#059669;transition:opacity .5s ease-out .9s}
.cmh-db-up svg{width:12px;height:12px}
.cmh-db-tf{display:block;font-size:11px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* The odometer: one numeral tall, each digit's column moved by a transform; tabular figures, so no digit changes the width. */
.cmh-odo{display:inline-flex;font-variant-numeric:tabular-nums;transition:opacity .5s ease-out}
.cmh-odo-d{position:relative;display:inline-block;height:1.2em;line-height:1.2em;overflow:hidden;vertical-align:bottom}
.cmh-odo-col{display:flex;flex-direction:column;transition-property:transform;transition-timing-function:cubic-bezier(.2,.8,.2,1)}
.cmh-odo-col>span{display:block;height:1.2em}
.cmh-odo-s{display:inline-block;height:1.2em;line-height:1.2em;vertical-align:bottom}
.cmh-db[data-empty] .cmh-odo{opacity:0}
.cmh-db[data-empty] .cmh-db-up{opacity:0;transition:none}
/* The chart (dashboard-client DashboardTrendChart): 200px, the plot from 10px down to 30px above the foot, dashed #f3f4f6 lines, 11px #9ca3af labels. */
.cmh-db-chart{display:block;position:relative;border-top:1px solid rgba(229,231,235,.6);padding:16px 16px 8px}
.cmh-db-plot{position:relative;display:block;height:160px;margin:10px 10px 0 44px}
.cmh-db-grid{position:absolute;left:0;right:0;height:0;border-top:1px dashed #f3f4f6}
.cmh-db-grid small{position:absolute;right:calc(100% + 8px);top:-7px;font-size:11px;line-height:14px;color:#9ca3af;font-variant-numeric:tabular-nums;white-space:nowrap}
.cmh-db-clip{position:absolute;inset:-4px 0;overflow:hidden}
.cmh-db-wipe,.cmh-db-unwipe{position:absolute;inset:0;display:block;animation-duration:1.6s;animation-delay:.35s;animation-timing-function:cubic-bezier(.45,0,.2,1)}
.cmh-db-wipe{animation-name:cmh-db-wipe}
.cmh-db-unwipe{animation-name:cmh-db-unwipe}
@keyframes cmh-db-wipe{from{transform:translate3d(-100%,0,0)}to{transform:translate3d(0,0,0)}}
@keyframes cmh-db-unwipe{from{transform:translate3d(100%,0,0)}to{transform:translate3d(0,0,0)}}
.cmh-db-clip svg{position:absolute;left:0;top:4px;width:100%;height:calc(100% - 8px);overflow:visible}
.cmh-db-dot{position:absolute;right:0;width:11px;height:11px;margin:-5.5px -5.5px 0 0;border-radius:50%;background:#8b5cf6;box-shadow:0 0 0 2px #fff;box-sizing:border-box;animation-name:cmh-db-dot;animation-delay:1.85s;animation-duration:.45s}
@keyframes cmh-db-dot{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
.cmh-db-days{display:flex;justify-content:space-between;margin:12px 0 0 28px;font-size:11px;color:#9ca3af;white-space:nowrap}
/* Narrower than a laptop's /app: the rail goes, as it does under 768px in the app, and the search gives way. */
@container (max-width:1020px){.cmh-db-rail{display:none}.cmh-db-in{padding:24px 24px 28px}}
@container (max-width:760px){.cmh-db-search{visibility:hidden}.cmh-db-tools{display:none}.cmh-db-handle{display:none}}
/* A phone: the app's phone header (who you are, the bell), the period and the live count on their own row, the four figures two by two. */
@container (max-width:600px){
  .cmh-db{border-radius:14px}
  .cmh-db-top{height:56px;padding:0 10px;justify-content:space-between}
  .cmh-db-search{display:none}
  .cmh-db-tools{display:flex}
  .cmh-db-tools .cmh-db-gear,.cmh-db-tools>i,.cmh-db-tools img,.cmh-db-tools b{display:none}
  .cmh-db-me{padding:4px}
  .cmh-db-in{padding:18px 16px 18px}
  .cmh-db-head{margin-bottom:18px}
  .cmh-db-hl{display:flex;flex-direction:column}
  .cmh-db-hrow{display:contents}
  .cmh-db-hi{font-size:22px}
  .cmh-db-sub{order:1}
  .cmh-db-meta{order:2;margin-top:14px}
  .cmh-db-period{height:36px;padding:0 12px;font-size:13px}
  .cmh-db-live{height:36px;box-sizing:border-box;border-radius:12px;padding:0 10px;font-size:12px}
  .cmh-db-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cmh-db-tab{padding:12px}
  .cmh-db-tab:nth-child(3){border-left:0}
  .cmh-db-tab:nth-child(n+3){border-top:1px solid rgba(229,231,235,.6)}
  .cmh-db-tl{font-size:12px}
  .cmh-db-tv>b{font-size:19px}
  .cmh-db-chart{padding:12px 8px 6px}
  .cmh-db-plot{height:118px;margin-left:40px}
  .cmh-db-days{margin-left:24px;font-size:10px}
  .cmh-db-days span:nth-child(even){visibility:hidden}
}

/* ── 2. tips: his creator page, a $5 tip picked, paid and thanked for ── */
.cmh-tp{font-size:clamp(11.5px,2.9cqw,18px)}
.cmh-tp-page{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;overflow:hidden;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.08),0 30px 60px -36px rgba(24,24,27,.35);transform:translateZ(0)}
.cmh-tp-cover{position:relative;display:block;flex:none;width:100%;height:34%;background:#2a211b}
.cmh-tp-cover img{display:block;width:100%;height:100%;object-fit:cover}
.cmh-tp-who{position:relative;display:flex;flex-direction:column;align-items:center;margin-top:-2.6em;text-align:center}
.cmh-tp-who img{display:block;width:5.2em;height:5.2em;border-radius:50%;object-fit:cover;background:#e7e5ee;box-shadow:0 0 0 .22em #fff}
.cmh-tp-who b{margin-top:.55em;font-size:1.25em;font-weight:600;letter-spacing:-.02em}
.cmh-tp-who span{margin-top:.2em;font-size:.86em;color:#71717a}
/* The tip block, the card variant of components/onepage/tip-block: title, a line, four amounts, the button. */
.cmh-tp-block{display:flex;flex-direction:column;width:min(88%,25em);margin-top:1.3em;padding:1.15em 1.2em 1.2em;box-sizing:border-box;border-radius:1.1em;background:#fff;box-shadow:0 0 0 1px #ececf0,0 .4em 1.2em -.6em rgba(24,24,27,.18)}
.cmh-tp-t{font-size:1.02em;font-weight:600;letter-spacing:-.01em}
.cmh-tp-s{margin-top:.15em;font-size:.84em;color:#71717a}
.cmh-tp-swap{display:grid;margin-top:.9em}
.cmh-tp-pick,.cmh-tp-thx{grid-area:1/1}
.cmh-tp-pick{display:flex;flex-direction:column;gap:.6em;animation-name:cmh-tp-pick}
.cmh-tp-chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.5em}
.cmh-tp-chip{position:relative;display:grid;place-items:center;height:2.5em;border-radius:.75em;background:#f4f4f5;font-size:.92em;font-weight:600;font-variant-numeric:tabular-nums;color:#27272a}
/* The chosen amount: a dark pill with the amount in white, over the chip, faded in and out. */
.cmh-tp-on{position:absolute;inset:0;display:grid;place-items:center;border-radius:inherit;background:#18181b;color:#fff;font-style:normal}
.cmh-tp-on3{animation-name:cmh-tp-on3}
.cmh-tp-on5{animation-name:cmh-tp-on5}
.cmh-tp-btn{position:relative;display:grid;place-items:center;height:2.9em;border-radius:.8em;background:#18181b;color:#fff;font-size:.95em;font-weight:600;animation-name:cmh-tp-press}
.cmh-tp-l3,.cmh-tp-l5{grid-area:1/1}
.cmh-tp-l3{animation-name:cmh-tp-l3}
.cmh-tp-l5{opacity:0;animation-name:cmh-tp-l5}
.cmh-tp-thx{display:flex;align-items:center;justify-content:center;gap:.5em;min-height:100%;font-size:.98em;font-weight:500;color:#18181b;opacity:0;animation-name:cmh-tp-thx}
.cmh-tp-thx svg{flex:none;width:1.5em;height:1.5em;padding:.25em;box-sizing:border-box;border-radius:50%;background:#dcfce7;color:#15803d}
/* A tap: a soft ring that opens and fades where the finger lands. */
.cmh-tp-tap{position:absolute;left:50%;top:50%;width:2.6em;height:2.6em;margin:-1.3em 0 0 -1.3em;border-radius:50%;background:rgba(24,24,27,.22);opacity:0;z-index:3}
.cmh-tp-btn .cmh-tp-tap,.cmh-tp-pay .cmh-tp-tap{background:rgba(255,255,255,.35)}
.cmh-tp-tap1{animation-name:cmh-tp-tap1}
.cmh-tp-tap2{animation-name:cmh-tp-tap2}
.cmh-tp-tap3{animation-name:cmh-tp-tap3}
.cmh-tp-scrim{position:absolute;inset:0;background:rgba(9,9,11,.32);opacity:0;animation-name:cmh-tp-scrim}
.cmh-tp-sheet{position:absolute;left:50%;bottom:0;display:flex;flex-direction:column;align-items:center;width:min(100%,27em);margin-left:max(-50%,-13.5em);padding:.7em 1.4em 1.4em;box-sizing:border-box;border-radius:1.4em 1.4em 0 0;background:#fff;box-shadow:0 -1em 3em -1.5em rgba(0,0,0,.35);transform:translate3d(0,105%,0);animation-name:cmh-tp-sheet}
.cmh-tp-grab{width:2.6em;height:.3em;border-radius:1em;background:#e4e4e7}
.cmh-tp-for{display:flex;align-items:center;gap:.5em;margin-top:1em;font-size:.9em;font-weight:500;color:#52525b}
.cmh-tp-for img{width:1.7em;height:1.7em;border-radius:50%;object-fit:cover}
.cmh-tp-amt{margin-top:.35em;font-size:2.3em;font-weight:700;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.cmh-tp-pay{position:relative;display:grid;place-items:center;width:100%;height:3em;margin-top:.8em;border-radius:.85em;background:#18181b;color:#fff;font-size:.95em;font-weight:600;animation-name:cmh-tp-paypress}
.cmh-tp-lock{display:flex;align-items:center;gap:.4em;margin-top:.75em;font-size:.78em;color:#71717a}
.cmh-tp-lock svg{width:1.1em;height:1.1em}
.cmh-tp-pick,.cmh-tp-on,.cmh-tp-btn,.cmh-tp-l3,.cmh-tp-l5,.cmh-tp-thx,.cmh-tp-tap,.cmh-tp-scrim,.cmh-tp-sheet,.cmh-tp-pay{animation-duration:${HOW_TIP_LOOP_S}s}
.cmh-tp-sheet{animation-timing-function:cubic-bezier(.32,.72,0,1)}
.cmh-tp-tap{animation-timing-function:ease-out}
@keyframes cmh-tp-on3{0%,${T(1.05)}{opacity:1}${T(1.3)},${T(8.75)}{opacity:0}${T(8.8)},100%{opacity:1}}
@keyframes cmh-tp-on5{0%,${T(1.05)}{opacity:0}${T(1.3)},${T(8.75)}{opacity:1}${T(8.8)},100%{opacity:0}}
@keyframes cmh-tp-l3{0%,${T(1.1)}{opacity:1}${T(1.35)},${T(8.75)}{opacity:0}${T(8.8)},100%{opacity:1}}
@keyframes cmh-tp-l5{0%,${T(1.1)}{opacity:0}${T(1.35)},${T(8.75)}{opacity:1}${T(8.8)},100%{opacity:0}}
@keyframes cmh-tp-tap1{0%,${T(0.95)}{opacity:0;transform:scale(.3)}${T(1.0)}{opacity:1;transform:scale(.45)}${T(1.5)},100%{opacity:0;transform:scale(1.5)}}
@keyframes cmh-tp-tap2{0%,${T(2.2)}{opacity:0;transform:scale(.3)}${T(2.25)}{opacity:1;transform:scale(.45)}${T(2.75)},100%{opacity:0;transform:scale(2.2)}}
@keyframes cmh-tp-tap3{0%,${T(4.05)}{opacity:0;transform:scale(.3)}${T(4.1)}{opacity:1;transform:scale(.45)}${T(4.6)},100%{opacity:0;transform:scale(2.2)}}
@keyframes cmh-tp-press{0%,${T(2.2)}{transform:scale(1)}${T(2.32)}{transform:scale(.97)}${T(2.6)},100%{transform:scale(1)}}
@keyframes cmh-tp-paypress{0%,${T(4.05)}{transform:scale(1)}${T(4.17)}{transform:scale(.97)}${T(4.45)},100%{transform:scale(1)}}
@keyframes cmh-tp-scrim{0%,${T(2.6)}{opacity:0}${T(3.0)},${T(4.6)}{opacity:1}${T(5.0)},100%{opacity:0}}
@keyframes cmh-tp-sheet{0%,${T(2.6)}{transform:translate3d(0,105%,0)}${T(3.15)},${T(4.55)}{transform:translate3d(0,0,0)}${T(5.1)},100%{transform:translate3d(0,105%,0)}}
@keyframes cmh-tp-pick{0%,${T(5.0)}{opacity:1}${T(5.25)},${T(8.7)}{opacity:0}${T(9.2)},100%{opacity:1}}
@keyframes cmh-tp-thx{0%,${T(5.2)}{opacity:0;transform:translate3d(0,.35em,0)}${T(5.6)},${T(8.2)}{opacity:1;transform:translate3d(0,0,0)}${T(8.6)},100%{opacity:0;transform:translate3d(0,0,0)}}

/* ── 3. your own domain: a store's front page, the address typed over it, a check ── */
.cmh-dm{display:grid;place-items:center;font-size:clamp(11px,2.7cqw,19px)}
.cmh-dm-shop{grid-area:1/1;display:flex;flex-direction:column;width:min(80%,28em);overflow:hidden;border-radius:.9em;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.07),0 2em 3.5em -2.2em rgba(24,24,27,.4);transform:translateZ(0)}
.cmh-dm-grid{display:grid;grid-template-columns:1fr 1fr}
.cmh-dm-grid img{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;background:#ece6df}
.cmh-dm-foot{display:block;padding:1.15em 1em;background:#f4ede7;color:#4b3f37;text-align:center;font-family:ui-serif,Georgia,"Times New Roman",serif;font-size:.86em;letter-spacing:.005em}
/* The address field: as wide as its address, wider than the page under it, at the seam of its photographs (lifted by the height of the page's line). */
.cmh-dm-field{grid-area:1/1;position:relative;display:flex;align-items:center;gap:.6em;max-width:96%;height:4.3em;margin-bottom:3.1em;padding:0 1em 0 1.5em;box-sizing:border-box;border-radius:999px;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.06),0 1.2em 2.6em -1em rgba(24,24,27,.32),0 .2em .5em rgba(24,24,27,.05)}
.cmh-dm-type{position:relative;min-width:0;display:flex;align-items:center;height:100%;font-size:2.5em;font-weight:400;letter-spacing:-.02em;color:#3f3f46;white-space:nowrap;animation-name:cmh-dm-type}
.cmh-dm-ch{display:inline-block;opacity:0}
.cmh-dm-tld{color:#2563eb}
.cmh-dm-caret{position:absolute;left:0;top:50%;width:2px;height:1.05em;margin:-.52em 0 0 1px;border-radius:1px;background:#2563eb}
.cmh-dm-check{flex:none;display:grid;width:2.8em;height:2.8em;color:#16a34a;opacity:0;animation-name:cmh-dm-check}
.cmh-dm-check svg{width:100%;height:100%}
.cmh-dm-type,.cmh-dm-ch,.cmh-dm-check{animation-duration:${DM_LOOP}s}
${DM_CHAR_KEYS}
@keyframes cmh-dm-caret{${DM_CARET_KEYS}}
@keyframes cmh-dm-check{0%,${D(DM_CHECK_AT)}{opacity:0;transform:scale(.55)}${D(DM_CHECK_AT + 0.35)},${D(DM_FADE_AT)}{opacity:1;transform:scale(1)}${D(DM_FADE_AT + 0.45)},100%{opacity:0;transform:scale(1)}}
/* The typed address and its caret fade together at the end, and the caret goes when the check comes. */
@keyframes cmh-dm-type{0%,${D(DM_FADE_AT)}{opacity:1}${D(DM_FADE_AT + 0.45)},${D(DM_LOOP - 0.15)}{opacity:0}100%{opacity:1}}
.cmh-dm-caret{animation-name:cmh-dm-caret,cmh-dm-blink;animation-duration:${DM_LOOP}s,${DM_LOOP}s;animation-timing-function:linear,step-end}
@keyframes cmh-dm-blink{0%{opacity:1}${D(0.45)}{opacity:0}${D(DM_TYPE_START - 0.05)}{opacity:1}${D(DM_CHECK_AT)},100%{opacity:0}}

@media (prefers-reduced-motion:reduce){
  .cmh-a{animation:none!important}
  .cmh-o{animation:none!important}
  .cmh-field canvas{transition:none}
  .cmh-tp-on5,.cmh-tp-l5,.cmh-tp-thx{opacity:1}
  .cmh-tp-on3,.cmh-tp-l3,.cmh-tp-pick{opacity:0}
  .cmh-dm-ch,.cmh-dm-check{opacity:1}
  .cmh-dm-caret{opacity:0}
}
@media(scripting:none){.cmh-o{animation:none}}
`

/** This section's stylesheet, as it draws it: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const HOW_IT_WORKS_STYLES: readonly SectionStyle[] = [{ href: "w12-commerce-how", precedence: "default", css: HOW_CSS }]

