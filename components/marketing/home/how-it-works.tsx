"use client"

/**
 * ===========================================================================
 *  HOW IT WORKS: THREE PICTURE CARDS IN ONE ROW (home, section 8, round 9)
 * ===========================================================================
 * Landing round 9, the owner: the products card repeated "Sell anything you
 * make" and the course card repeated the section that shows what you can
 * build, so both are gone. What stays is what no other section says: tips,
 * the numbers, and your own domain. The structure is a heading, then three
 * picture cards in one row, narrow, wide, narrow, each with a caption title
 * and one short line under it, and thin concentric ring lines inside every
 * picture, on white.
 *
 *   tips       "more smooth and clean, and more colorful, those things are
 *              too grey": a lilac ground, a violet button, tips arriving
 *              with coloured faces, hearts in five colours rising when a
 *              tip is sent. It plays by itself and can be pressed: an
 *              amount, then Send.
 *   business   the wide middle card: Sales for the last 30 days with its
 *              line drawing in, Top products (the Cine Tones LUT Pack and
 *              the black Midnight Studio Tee of section 3, with section 3's
 *              own numbers) and Orders by country. A mouse over the chart
 *              reads any day.
 *   domain     round 10, "more simple and clean, similar to 'Ready for
 *              Google and AI search'": one address on a white band, his
 *              name still and its ending gliding up a step at a time
 *              (storelib.com first, then domains of his own), the endings
 *              above and below fading through a still mask. CSS only.
 *
 * HEIGHT (round 10, a MacBook Air at about 1440x800): on a computer the
 * pictures stop at half the screen's height, so the heading and the row fit
 * one screen.
 *
 * One shop throughout: Ruben Linde's Linde Woodshop, a woodworker who films
 * his builds (made up). It sells section 3's two products.
 *
 * THE GROUND. Behind the heading a field of faint dots flows by itself and,
 * where a mouse is, lights violet around it and parts (HowField, a small
 * canvas: the closing call's idea, drawn for a white ground). It covers the
 * head of the section only, is drawn at no more than 1.5 device pixels a
 * CSS pixel, and runs only while it is on screen and the tab is visible.
 *
 * WHAT MOVES. Transform and opacity only, in fixed-size boxes, so nothing
 * lays out while anything plays. The loops (.cmh-a) run only while their
 * card is near the screen and the tab is visible (data-commerce-live); the
 * chart draws in once, the first time a third of its card is on screen
 * (data-seen, .cmh-o). The cards themselves never hide: a fast scroll finds
 * the grounds, rings and captions already there, never a blank box. Reduced
 * motion shows each picture's finished frame, still.
 *
 * A PICTURE TAKES NO POINTER, except three parts of it: the tip card's
 * amounts and its Send (a press), and the chart (a mouse). No links, no
 * buttons, nothing to tab to: the pictures stay aria-hidden.
 *
 * TRUE TO THE PRODUCT. Tips are a thank you button a creator turns on.
 * Analytics has Sales over time, Top products and Orders by country
 * (app/(storelib)/app/analytics); the numbers here are section 3's (386 LUT
 * packs at $29, 214 tees at $32), split over thirty days and three
 * countries so every figure adds up. A website's own address on Storelib is
 * <name>.storelib.com; a domain a creator owns serves their website, their
 * creator page or one community (lib/custom-domains/hostname
 * DOMAIN_PURPOSES); connecting one is on Pro (lib/sites/plan customDomain);
 * Storelib reads the DNS and waits for the certificate itself
 * (app/api/domains/verify).
 */
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react"
import type { SectionStyle } from "./lazy-section"
import type { DomainPurpose } from "@/lib/custom-domains/hostname"
import { commerceUsd } from "./commerce-kit"

const HOW = "/home/how"

/** Landing round 9 (the owner: a new heading, the products card is gone): what the three cards below are. */
export const HOW_HEADING = { lead: "Take tips. See what sells.", rest: "All on your own domain." } as const

/** The shop every picture in this section belongs to (made up). */
export const HOW_SHOP = {
  creator: "Ruben Linde",
  first: "Ruben",
  name: "Linde Woodshop",
  avatar: `${HOW}/linde-avatar.webp`,
} as const

/**
 * The digital product: Cine Tones, the LUT pack section 3 sells, on the same
 * cover: black, the graded desert road still across its top, "LUT Pack"
 * small, "Cine Tones" big and heavy. The still is section 3's file; the
 * cover is drawn in this file.
 */
export const HOW_LUTS = {
  name: "Cine Tones LUT Pack",
  tag: "LUT Pack",
  words: ["Cine", "Tones"],
  still: "/home/everything/lut-still.webp",
  priceCents: 2900,
} as const

/** The shop's two products, best seller first, with what section 3 says each has sold. */
export const HOW_PRODUCTS = [
  { id: "luts", name: HOW_LUTS.name, priceCents: HOW_LUTS.priceCents, sold: 386 },
  { id: "tee", name: "Midnight Studio Tee", img: "/home/everything/tee.webp", priceCents: 3200, sold: 214 },
] as const

/** Thirty days of orders, [LUT packs, tees] a day, ending on the last day drawn. They add up to HOW_PRODUCTS' sold. */
export const HOW_DAYS: readonly (readonly [number, number])[] = [
  [7, 4], [8, 4], [9, 5], [11, 6], [12, 6], [12, 6], [11, 5], [10, 5], [10, 5], [11, 6],
  [12, 8], [13, 8], [14, 9], [14, 9], [13, 8], [12, 6], [11, 6], [12, 7], [13, 7], [14, 8],
  [15, 9], [15, 8], [14, 8], [13, 7], [13, 7], [14, 8], [15, 9], [17, 9], [19, 10], [22, 11],
]
/** What each day sold, in cents. */
export const HOW_DAY_CENTS = HOW_DAYS.map(([l, t]) => l * HOW_PRODUCTS[0].priceCents + t * HOW_PRODUCTS[1].priceCents)
/** The thirty days' sales, in cents: section 3's $11,194 and $6,848. */
export const HOW_SALES_CENTS = HOW_DAY_CENTS.reduce((a, b) => a + b, 0)
/** How far the period is up on the one before it (an example). */
export const HOW_SALES_UP = "18%"
/** The days' names: 16 October to 14 November. */
const DAY_NAMES = HOW_DAYS.map((_, i) => (i < 16 ? `Oct ${16 + i}` : `Nov ${i - 15}`))

/** Where the period's 600 orders came from. */
export const HOW_COUNTRIES = [
  { code: "US", name: "United States", orders: 330 },
  { code: "GB", name: "United Kingdom", orders: 148 },
  { code: "DE", name: "Germany", orders: 122 },
] as const

/**
 * Ruben's own domain (made up), serving his website (lib/custom-domains
 * DOMAIN_PURPOSES: a domain serves one thing, here the website), and the
 * address the website has on Storelib before he connects it. Landing round
 * 10: "lindewood", short enough for one line on a narrow card.
 */
export const HOW_DOMAIN = {
  name: "lindewood",
  host: "lindewood.com",
  before: "lindewood.storelib.com",
  purpose: "website" satisfies DomainPurpose,
} as const

/** The endings the domain card's reel glides through: his Storelib address first, then domains of his own. Each makes a host Storelib accepts. */
export const HOW_ENDINGS = [".storelib.com", ".com", ".co.uk", ".studio"] as const

/** The three cards, in the row's order: narrow, wide, narrow. A title and one short line each. */
export const HOW_CARDS = [
  { key: "tips", wide: false, title: "Take tips", line: "A thank you button for people who want to support your work." },
  { key: "business", wide: true, title: "Understand your business", line: "Sales, top products and where your orders come from." },
  { key: "domain", wide: false, title: "Use your own domain", line: "On Pro, point a domain you own at your site. HTTPS is set up for you." },
] as const

/* ── the chart's two lines, worked out once ── */
const CH_W = 300
const CH_H = 100
const CH_TOP = 10
const CH_BOTTOM = 90
const chMin = Math.min(...HOW_DAY_CENTS)
const chMax = Math.max(...HOW_DAY_CENTS)
/** A day's height in the chart's box, 0 (top) to 100. */
const chY = (cents: number) => +(CH_BOTTOM - ((cents - chMin) / (chMax - chMin)) * (CH_BOTTOM - CH_TOP)).toFixed(2)
const chX = (i: number) => +((i / (HOW_DAYS.length - 1)) * CH_W).toFixed(2)
/** A smooth line through the points (a Catmull-Rom spline as cubic Béziers, eased so it never overshoots a day). */
function smooth(ys: readonly number[]): string {
  const p = ys.map((y, i) => [chX(i), y] as const)
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)]
    const b = p[i]
    const c = p[i + 1]
    const e = p[Math.min(p.length - 1, i + 2)]
    const k = 0.18
    d += `C${(b[0] + (c[0] - a[0]) * k).toFixed(2)},${(b[1] + (c[1] - a[1]) * k).toFixed(2)} ${(c[0] - (e[0] - b[0]) * k).toFixed(2)},${(c[1] - (e[1] - b[1]) * k).toFixed(2)} ${c[0]},${c[1]}`
  }
  return d
}
const CH_YS = HOW_DAY_CENTS.map(chY)
const CH_LINE = smooth(CH_YS)
/** The period before, a little lower and out of step: a quiet dashed line behind. */
const CH_PREV = smooth(
  HOW_DAY_CENTS.map((_, i, all) => {
    const near = [-2, -1, 0, 1, 2].map((k) => all[Math.max(0, Math.min(all.length - 1, i + k))])
    const mean = near.reduce((x, y) => x + y, 0) / near.length
    return chY(Math.max(chMin * 0.9, mean * (0.8 + 0.07 * Math.sin(i * 0.9 + 1))))
  }),
)

/**
 * Each card runs its loops only while that card is near the screen and the
 * tab is visible (data-commerce-live), and plays what happens once the first
 * time a third of its picture is on screen (data-seen). Both are attributes
 * on the card that the CSS reads; nothing here is React state.
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

/*
  THE TIP CARD CAN BE PRESSED. It plays by itself; a press on an amount or on
  Send takes it over (data-user stops the loop's parts, data-pick and
  data-sent place them, with transitions), and five seconds after the last
  press it goes back to playing. One click listener on the picture; nothing
  is measured and nothing is React state.
*/
function useTipPress(grid: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const tip = grid.current?.querySelector<HTMLElement>(".cmh-tip")
    if (!tip) return
    const amount = tip.querySelector<HTMLElement>(".cmh-toast-amt")
    const first = amount?.textContent ?? ""
    let back = 0
    const release = () => {
      tip.removeAttribute("data-user")
      tip.removeAttribute("data-sent")
      tip.removeAttribute("data-pick")
      if (amount) amount.textContent = first
    }
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-amt],[data-send]") : null
      if (!el) return
      window.clearTimeout(back)
      if (!tip.hasAttribute("data-user")) {
        tip.setAttribute("data-user", "")
        tip.setAttribute("data-pick", "1")
      }
      if (el.dataset.amt != null) {
        tip.setAttribute("data-pick", el.dataset.amt)
        tip.removeAttribute("data-sent")
      } else if (!tip.hasAttribute("data-sent")) {
        if (amount) amount.textContent = TIP_AMOUNTS[Number(tip.getAttribute("data-pick")) || 0]
        tip.setAttribute("data-sent", "")
      }
      back = window.setTimeout(release, tip.hasAttribute("data-sent") ? 3600 : 5000)
    }
    tip.addEventListener("click", onClick)
    return () => {
      window.clearTimeout(back)
      tip.removeEventListener("click", onClick)
    }
  }, [grid])
}

/*
  A MOUSE OVER THE CHART READS A DAY. The chart's place is read once as the
  mouse comes in; each move writes three transforms and, when the day under
  the mouse changes, two words. No frame loop, no React state. Touch does
  nothing here, so a swipe over the chart is only ever a page scroll.
*/
function useChartRead(grid: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const chart = grid.current?.querySelector<HTMLElement>(".cmh-ch")
    if (!chart || typeof window.matchMedia !== "function" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    const guide = chart.querySelector<HTMLElement>(".cmh-ch-guide")
    const dot = chart.querySelector<HTMLElement>(".cmh-ch-dot")
    const tip = chart.querySelector<HTMLElement>(".cmh-ch-tip")
    const day = chart.querySelector<HTMLElement>(".cmh-ch-tip-d")
    const sum = chart.querySelector<HTMLElement>(".cmh-ch-tip-v")
    if (!guide || !dot || !tip || !day || !sum) return
    let left = 0
    let width = 1
    let height = 1
    let at = -1
    const place = () => {
      const r = chart.getBoundingClientRect()
      left = r.left
      width = r.width || 1
      height = r.height || 1
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const last = HOW_DAYS.length - 1
      const i = Math.max(0, Math.min(last, Math.round(((e.clientX - left) / width) * last)))
      if (i === at) return
      at = i
      const x = (i / last) * width
      guide.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`
      dot.style.transform = `translate3d(${x.toFixed(1)}px,${((CH_YS[i] / CH_H) * height).toFixed(1)}px,0)`
      tip.style.transform = `translate3d(${Math.max(34, Math.min(width - 34, x)).toFixed(1)}px,0,0)`
      day.textContent = DAY_NAMES[i]
      sum.textContent = commerceUsd(HOW_DAY_CENTS[i], false)
    }
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      place()
      at = -1
      onMove(e)
      chart.setAttribute("data-read", "")
    }
    const onLeave = () => chart.removeAttribute("data-read")
    chart.addEventListener("pointerenter", onEnter)
    chart.addEventListener("pointermove", onMove, { passive: true })
    chart.addEventListener("pointerleave", onLeave)
    return () => {
      chart.removeEventListener("pointerenter", onEnter)
      chart.removeEventListener("pointermove", onMove)
      chart.removeEventListener("pointerleave", onLeave)
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
 * on resize, so there is no mask to composite. A frame is two sines a dot
 * and at most forty fills. It runs only on screen in a visible tab, at up to
 * 60 frames a second with a mouse and 30 without one (the flow moves under
 * a pixel a frame); its place is read on resize and as the mouse comes in,
 * never in the loop. Reduced motion: one still frame.
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
  useTipPress(grid)
  useChartRead(grid)
  const pictures: Record<(typeof HOW_CARDS)[number]["key"], { ground: Ground; scene: ReactNode }> = {
    tips: { ground: "lilac", scene: <TipScene /> },
    business: { ground: "paper", scene: <BusinessScene /> },
    domain: { ground: "peach", scene: <DomainScene /> },
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
              <div className="cmh-stage" data-ground={pictures[c.key].ground} aria-hidden="true">
                <Rings card={c.key} />
                {pictures[c.key].scene}
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

/** One ground a card: lilac for the tips, a near white for the numbers, a warm peach for the domain. Flat colour, no glow, no glass. */
type Ground = "lilac" | "paper" | "peach"

/*
  The ring lines of a picture: thin circles around one centre (the two narrow
  cards' centres sit under their outer bottom corners, mirrored; the wide
  card's in its middle), drawn once as an SVG that never changes, and a few
  small dots that ride the rings (each a zero-size arm turning around the
  centre with the dot at its end, so the layer that turns is the size of the
  dot's path, not of the ring).
*/
const RING_AT = { tips: [8, 108], business: [50, 54], domain: [92, 108] } as const
const RING_R = [70, 130, 190, 250, 310, 370, 430, 490, 550, 610, 670] as const
const RING_DOTS: Record<keyof typeof RING_AT, readonly { r: number; from: number; secs: number; color: string }[]> = {
  tips: [
    { r: 250, from: -62, secs: 46, color: "#ff5c7c" },
    { r: 370, from: -38, secs: 64, color: "#ffb224" },
    { r: 430, from: -74, secs: 80, color: "#3ea6ff" },
    { r: 490, from: -50, secs: 96, color: "#8b5cf6" },
  ],
  business: [
    { r: 250, from: 200, secs: 70, color: "#8b5cf6" },
    { r: 310, from: 20, secs: 90, color: "#18181b" },
    { r: 370, from: 110, secs: 110, color: "#8b5cf6" },
  ],
  domain: [
    { r: 250, from: -128, secs: 52, color: "#8b5cf6" },
    { r: 370, from: -146, secs: 72, color: "#ff8a3d" },
    { r: 490, from: -118, secs: 92, color: "#18181b" },
  ],
}

function Rings({ card }: { card: keyof typeof RING_AT }) {
  const [cx, cy] = RING_AT[card]
  return (
    <span className="cmh-rings">
      <svg width="100%" height="100%" fill="none">
        {RING_R.map((r) => (
          <circle key={r} cx={`${cx}%`} cy={`${cy}%`} r={r} />
        ))}
      </svg>
      <span className="cmh-orbit" style={{ left: `${cx}%`, top: `${cy}%` }}>
        {RING_DOTS[card].map((d) => (
          <i key={d.r} className="cmh-a cmh-arm" style={{ "--from": `${d.from}deg`, animationDuration: `${d.secs}s` } as CSSProperties}>
            <b style={{ transform: `translate3d(${d.r}px,0,0)`, background: d.color }} />
          </i>
        ))}
      </span>
    </span>
  )
}

const Check = ({ size = 12 }: { size?: number | string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

const Heart = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M12 20.6s-7.6-4.5-7.6-10.1A4.4 4.4 0 0 1 12 7.9a4.4 4.4 0 0 1 7.6 2.6c0 5.6-7.6 10.1-7.6 10.1z" />
  </svg>
)

/** The LUT pack's cover, section 3's: a black square, the graded still across its top fading into the black, "LUT Pack" small, the name big. Sized in its own width. */
function LutCover({ className = "" }: { className?: string }) {
  return (
    <span className={`cmh-lut ${className}`}>
      <img src={HOW_LUTS.still} alt="" width={720} height={405} loading="lazy" decoding="async" />
      <span className="cmh-lut-tag">{HOW_LUTS.tag}</span>
      <span className="cmh-lut-name">
        {HOW_LUTS.words.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </span>
    </span>
  )
}

/* ── 1. tips ── */
/** The amounts on the tip card. The loop picks the second. */
export const TIP_AMOUNTS = ["$3", "$5", "$10"] as const
/** The hearts a sent tip lets go: where each starts and drifts to (em), how big, how late, and its colour. */
const HEARTS = [
  { x: -5.2, dx: -1.1, s: 1.05, d: 0, c: "#ff5c7c" },
  { x: -2.9, dx: 0.8, s: 0.8, d: 0.16, c: "#ffb224" },
  { x: -0.9, dx: -0.6, s: 1.25, d: 0.05, c: "#8b5cf6" },
  { x: 1.3, dx: 0.9, s: 0.9, d: 0.24, c: "#3ea6ff" },
  { x: 3.2, dx: -0.7, s: 1.1, d: 0.1, c: "#ff7ac0" },
  { x: 5.1, dx: 1, s: 0.75, d: 0.3, c: "#ff8a3d" },
] as const

/* A tip card: an amount chosen, sent, hearts rising, and the tip arriving above it. */
function TipScene() {
  return (
    <div className="cmh-sc cmh-tip">
      <div className="cmh-tip-in">
        <div className="cmh-toasts">
          <span className="cmh-a cmh-toast" data-k="0">
            <i style={{ background: "#ffb224" }}>M</i>
            <span>
              <b>Marco</b> tipped $10
            </span>
            <em style={{ color: "#ff5c7c" }}>
              <Heart />
            </em>
          </span>
          <span className="cmh-a cmh-toast" data-k="1">
            <i style={{ background: "#3ea6ff" }}>P</i>
            <span>
              <b>Priya</b> tipped <span className="cmh-toast-amt">{TIP_AMOUNTS[1]}</span>
            </span>
            <em style={{ color: "#8b5cf6" }}>
              <Heart />
            </em>
          </span>
        </div>
        <div className="cmh-tip-card">
          <div className="cmh-tip-who">
            <img src={HOW_SHOP.avatar} alt="" loading="lazy" decoding="async" width={160} height={160} />
            <span>
              <b>Support {HOW_SHOP.first}</b>
              <small>Thanks for the free build videos</small>
            </span>
          </div>
          <div className="cmh-amts">
            <span className="cmh-a cmh-amt-hl" />
            {TIP_AMOUNTS.map((a, i) => (
              <span key={a} className="cmh-amt" data-amt={i}>
                {a}
              </span>
            ))}
          </div>
          <div className="cmh-a cmh-tip-btn" data-send="">
            <span className="cmh-stack">
              {TIP_AMOUNTS.map((a, i) => (
                <span key={a} className="cmh-a cmh-tb" data-k={i}>
                  Send {a} tip
                </span>
              ))}
              <span className="cmh-a cmh-tb-ok">
                <Check size="1em" /> Thank you
              </span>
            </span>
          </div>
          <span className="cmh-hearts">
            {HEARTS.map((h, i) => (
              <i
                key={i}
                className="cmh-a cmh-heart"
                style={{ left: `calc(50% + ${h.x}em)`, color: h.c, fontSize: `${h.s}em`, animationDelay: `${h.d}s`, "--dx": `${h.dx}em` } as CSSProperties}
              >
                <Heart />
              </i>
            ))}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── 2. the numbers ── */
const FLAGS: Record<(typeof HOW_COUNTRIES)[number]["code"], ReactNode> = {
  US: (
    <>
      <path fill="#fff" d="M0 0h24v16H0z" />
      <path stroke="#d0303f" strokeWidth="1.78" d="M0 .9h24M0 4.45h24M0 8h24M0 11.55h24M0 15.1h24" />
      <path fill="#33407e" d="M0 0h10.5v8.9H0z" />
    </>
  ),
  GB: (
    <>
      <path fill="#26346e" d="M0 0h24v16H0z" />
      <path stroke="#fff" strokeWidth="3.2" d="m0 0 24 16M24 0 0 16" />
      <path stroke="#cf2f3c" strokeWidth="1.3" d="m0 0 24 16M24 0 0 16" />
      <path stroke="#fff" strokeWidth="5.4" d="M12 0v16M0 8h24" />
      <path stroke="#cf2f3c" strokeWidth="3.2" d="M12 0v16M0 8h24" />
    </>
  ),
  DE: (
    <>
      <path fill="#1c1c1e" d="M0 0h24v5.4H0z" />
      <path fill="#d6303a" d="M0 5.3h24v5.4H0z" />
      <path fill="#f6c63a" d="M0 10.6h24V16H0z" />
    </>
  ),
}

/* Sales for thirty days with the line drawing in, the two best sellers, and where the orders came from. */
function BusinessScene() {
  const last = CH_YS[CH_YS.length - 1]
  return (
    <div className="cmh-sc cmh-biz">
      <div className="cmh-biz-in">
        <div className="cmh-tile cmh-sales">
          <div className="cmh-sales-top">
            <span>Sales</span>
            <small>Last 30 days</small>
          </div>
          <div className="cmh-sales-sum">
            <b>{commerceUsd(HOW_SALES_CENTS, true)}</b>
            <span>
              <svg viewBox="0 0 10 10" width=".62em" height=".62em" fill="currentColor">
                <path d="M5 1.2 9.4 8.6H.6z" />
              </svg>
              {HOW_SALES_UP}
            </span>
          </div>
          <div className="cmh-ch">
            <svg className="cmh-ch-back" viewBox={`0 0 ${CH_W} ${CH_H}`} preserveAspectRatio="none" fill="none">
              <path className="cmh-ch-grid" d={`M0 ${CH_TOP}H${CH_W}M0 50H${CH_W}M0 ${CH_BOTTOM}H${CH_W}`} />
              <path className="cmh-ch-prev" d={CH_PREV} />
            </svg>
            <span className="cmh-o cmh-ch-rev">
              <span className="cmh-o cmh-ch-rev-in">
                <svg viewBox={`0 0 ${CH_W} ${CH_H}`} preserveAspectRatio="none" fill="none">
                  <path className="cmh-ch-line" d={CH_LINE} />
                </svg>
              </span>
            </span>
            <span className="cmh-ch-end" style={{ top: `${last}%` }}>
              <i className="cmh-a cmh-ch-halo" />
              <i className="cmh-o cmh-ch-pt" />
            </span>
            <i className="cmh-ch-guide" />
            <i className="cmh-ch-dot" />
            <span className="cmh-ch-tip">
              <span>
                <span className="cmh-ch-tip-d">{DAY_NAMES[DAY_NAMES.length - 1]}</span>
                <b className="cmh-ch-tip-v">{commerceUsd(HOW_DAY_CENTS[HOW_DAY_CENTS.length - 1], false)}</b>
              </span>
            </span>
          </div>
          <div className="cmh-sales-days">
            <span>{DAY_NAMES[0]}</span>
            <span>{DAY_NAMES[DAY_NAMES.length - 1]}</span>
          </div>
        </div>
        <div className="cmh-biz-side">
          <div className="cmh-tile cmh-top">
            <b className="cmh-tile-t">Top products</b>
            <div className="cmh-top-rows">
              {HOW_PRODUCTS.map((p, i) => (
                <span key={p.id} className="cmh-o cmh-top-row" style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
                  <span className="cmh-top-pic" data-kind={p.id}>
                    {p.id === "luts" ? <LutCover /> : <img src={p.img} alt="" width={480} height={480} loading="lazy" decoding="async" />}
                  </span>
                  <span className="cmh-top-w">
                    <b>{p.name}</b>
                    <small>
                      {commerceUsd(p.priceCents * p.sold, false)} · {p.sold} sold
                    </small>
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="cmh-tile cmh-geo">
            <b className="cmh-tile-t">Orders by country</b>
            <div className="cmh-geo-rows">
              {HOW_COUNTRIES.map((c, i) => (
                <span key={c.code} className="cmh-o cmh-geo-row" style={{ animationDelay: `${0.5 + i * 0.1}s` }}>
                  <svg className="cmh-flag" viewBox="0 0 24 16" fill="none">
                    {FLAGS[c.code]}
                  </svg>
                  <span className="cmh-geo-n">{c.name}</span>
                  <span className="cmh-geo-c">{c.code}</span>
                  <b>{c.orders}</b>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/*
  3. Landing round 10, the owner: "I don't like the 'Use your own domain'
  visual. Something more simple and clean, similar to 'Ready for Google and
  AI search'." So the card is that card's idea on this section's light
  ground: one address on a white band in the middle, his name standing still
  and its ending gliding up a step at a time, his Storelib address first and
  then domains he could own. The endings above and below fade out through a
  mask that never moves; a soft light turns slowly behind. One transform on
  the reel, one on the light, both paused off screen. No website, no ticks.
*/
/** The reel's rows: two before the first ending and two after the last, so a neighbour always shows above and below and the loop ends where it began. */
const REEL = [...HOW_ENDINGS.slice(-2), ...HOW_ENDINGS, ...HOW_ENDINGS.slice(0, 3)]
function DomainScene() {
  return (
    <div className="cmh-sc cmh-dm">
      <span className="cmh-a cmh-dm-light" />
      <div className="cmh-dm-band">
        <span className="cmh-dm-lock">
          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10.5" width="14" height="10" rx="2.4" />
            <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
          </svg>
        </span>
        <span className="cmh-dm-name">{HOW_DOMAIN.name}</span>
        <span className="cmh-dm-ends">
          <span className="cmh-dm-win">
            <span className="cmh-a cmh-dm-reel">
              {REEL.map((e, i) => (
                <span key={i} className="cmh-dm-end" data-storelib={e === HOW_ENDINGS[0] ? "" : undefined}>
                  {e}
                </span>
              ))}
            </span>
          </span>
        </span>
      </div>
    </div>
  )
}

const EASE = "cubic-bezier(.22,1,.36,1)"
const SOFT = "cubic-bezier(.32,.72,0,1)"
const HOW_CSS = `
/* Its own box, like section 3: no data-story-section, whose global rule would hold the content to 1400px and the older gutter. The same --home-pad top and bottom. A stacking context, so the dot field sits behind the words and never behind the page. */
.cmh{position:relative;isolation:isolate;background:#fff;color:#18181b;padding-block:var(--home-pad,clamp(48px,5.6vw,80px))}
/* The page's shared box (globals.css .home-wrap), restated with the same values so the section holds its edges on its own. */
.cmh-in{box-sizing:border-box;width:100%;max-width:var(--home-max,2020px);margin-inline:auto;padding-inline:var(--home-edge,clamp(20px,5.15vw,84px))}
/* The dots behind the heading: the head of the section only, gone by the middle of the cards (the fade is each dot's own brightness). */
.cmh-field{position:absolute;z-index:-1;left:0;right:0;top:0;height:min(100%,clamp(420px,46vw,640px));overflow:clip;pointer-events:none}
.cmh-field canvas{display:block;width:100%;height:100%;opacity:0;transition:opacity .9s ease-out}
.cmh-field[data-drawn] canvas{opacity:1}
/* Section 3's heading: two tones, the lead dark and the rest grey; it starts --home-head-inset in from the cards' edge. */
.cmh-h{margin:0 0 clamp(32px,4.4vw,60px);padding-left:var(--home-head-inset,14px);font-size:clamp(34px,4.6vw,64px);font-weight:500;line-height:1.05;letter-spacing:-.045em;color:#18181b;text-wrap:balance}
.cmh-h-mute{display:block;color:#8e8c96}
@media(max-width:767px){.cmh-h{padding-left:var(--home-head-inset,0px)}}
/* One column on a phone. From 640px the wide card leads on a row of its own with the two narrow cards under it. From 1100px the row of the reference: narrow, wide, narrow, the wide card twice a narrow one. */
.cmh-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:40px}
@media(min-width:640px) and (max-width:1099px){
  .cmh-grid{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(16px,2vw,28px);row-gap:44px}
  .cmh-wide{grid-column:1/-1;order:-1}
}
@media(min-width:1100px){.cmh-grid{grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr);column-gap:clamp(16px,1.5vw,28px)}}
.cmh-card{min-width:0}
.cmh-stage{position:relative;pointer-events:none;user-select:none;-webkit-user-select:none;height:430px;border-radius:17px;background:#f4f4f6;overflow:hidden;contain:paint;isolation:isolate;container-type:inline-size;font-family:inherit}
.cmh-wide .cmh-stage{height:440px}
@media(min-width:640px){.cmh-stage,.cmh-wide .cmh-stage{height:420px;border-radius:19px}}
/* Landing round 10, the owner (a MacBook Air, about 1440x800): the heading and the row fit one screen. The pictures stop at half the screen's height, never under 360px. */
@media(min-width:1100px){.cmh-stage,.cmh-wide .cmh-stage{height:max(360px,min(clamp(400px,32vw,560px),50svh))}}
/* The grounds (landing round 9, "too grey"): flat colour, one a card. Still, no glow, no glass. */
.cmh-stage[data-ground=lilac]{background:#ebe4ff;--ring:rgba(109,72,214,.2)}
.cmh-stage[data-ground=paper]{background:#f4f4f7;--ring:rgba(24,24,27,.085)}
.cmh-stage[data-ground=peach]{background:#ffe8d4;--ring:rgba(190,96,28,.2)}
/* The caption: a title and one short line under it. */
.cmh-cap-t{margin:22px 0 0;font-size:18px;font-weight:500;line-height:1.3;letter-spacing:-.015em;color:#18181b}
.cmh-cap{margin:6px 0 0;max-width:40ch;font-size:15px;line-height:1.5;color:#7c7a84;text-wrap:pretty}
@media(min-width:768px){.cmh-cap-t{font-size:19px}.cmh-cap{font-size:15.5px}}

/* Every loop is one of these, so going live restyles only the moving parts (a class, never * or a tag, in the rule keyed on data-commerce-live). */
.cmh-a{animation-duration:8s;animation-timing-function:${EASE};animation-iteration-count:infinite;animation-fill-mode:both;animation-play-state:paused!important}
[data-commerce-live] .cmh-a{animation-play-state:running!important}
/* What plays once, the first time its card is seen. */
.cmh-o{animation-duration:.7s;animation-timing-function:${EASE};animation-fill-mode:both;animation-play-state:paused}
[data-seen] .cmh-o{animation-play-state:running}
/* Stacked layers share one grid cell: the box is the size of the largest, before and after they swap. */
.cmh-stack{display:grid}
.cmh-stack>.cmh-a{grid-area:1/1}
/* A picture is drawn in em: its font size follows its card's width, so one drawing fits a narrow card at 1100px and a wide one at 1920. */
.cmh-sc{position:absolute;inset:0;font-size:clamp(10.5px,4.6cqw,16px);line-height:1.3;color:#18181b}
.cmh-biz{font-size:clamp(10px,2.3cqw,18px)}

/* ── ring lines, and the dots that ride them ── */
.cmh-rings{position:absolute;inset:0;pointer-events:none}
.cmh-rings svg{position:absolute;inset:0;display:block;overflow:visible}
.cmh-rings circle{stroke:var(--ring);stroke-width:1}
.cmh-orbit{position:absolute;width:0;height:0}
.cmh-arm{position:absolute;left:0;top:0;width:0;height:0;animation-name:cmh-turn;animation-timing-function:linear}
.cmh-arm b{position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%}
@keyframes cmh-turn{from{transform:rotate(var(--from))}to{transform:rotate(calc(var(--from) + 360deg))}}

/* ── the LUT pack's cover: section 3's (everything-in-one-place .ev-lut), sized in its own width ── */
.cmh-lut{position:relative;display:block;aspect-ratio:1;overflow:hidden;background:#0a0a0b;color:#fff;container-type:inline-size}
.cmh-lut img{position:absolute;left:0;top:0;display:block;width:100%;height:64%;object-fit:cover;object-position:50% 60%}
.cmh-lut::before{content:"";z-index:1;position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(rgba(10,10,11,.5),rgba(10,10,11,0))}
.cmh-lut::after{content:"";position:absolute;left:0;right:0;top:26%;height:39%;background:linear-gradient(rgba(10,10,11,0),rgba(10,10,11,.55) 50%,#0a0a0b)}
.cmh-lut-tag{z-index:1;position:absolute;left:7cqw;top:7cqw;font-size:max(4.6cqw,3px);font-weight:600;line-height:1;letter-spacing:.18em;text-transform:uppercase}
.cmh-lut-name{z-index:1;position:absolute;left:6.4cqw;bottom:6.4cqw;display:flex;flex-direction:column;font-size:21cqw;font-weight:800;line-height:.84;letter-spacing:-.05em;text-transform:uppercase}

/* ── tips ── */
.cmh-tip{display:grid;place-items:center}
.cmh-tip-in{width:17.5em}
.cmh-toasts{position:relative;height:6.5em}
.cmh-toast{position:absolute;left:1.1em;right:1.1em;top:3.2em;display:flex;align-items:center;gap:.6em;height:2.7em;padding:0 .8em 0 .45em;box-sizing:border-box;border-radius:1.35em;background:#fff;box-shadow:0 0 0 1px rgba(60,30,140,.06),0 .8em 1.4em -1em rgba(60,30,140,.5);font-size:.86em;white-space:nowrap}
.cmh-toast>i{flex:none;display:grid;place-items:center;width:1.95em;height:1.95em;border-radius:50%;color:#fff;font-size:.92em;font-style:normal;font-weight:700}
.cmh-toast>span{flex:1;min-width:0;color:#55525e}
.cmh-toast b{color:#18181b;font-weight:600}
.cmh-toast>em{flex:none;display:grid;font-size:1.05em;font-style:normal}
.cmh-toast[data-k="0"]{animation-name:cmh-toast0}
.cmh-toast[data-k="1"]{opacity:0;animation-name:cmh-toast1}
@keyframes cmh-toast0{0%{opacity:0;transform:translate3d(0,1.2em,0)}5%,33%{opacity:1;transform:translate3d(0,0,0) scale(1)}40%,91%{opacity:.6;transform:translate3d(0,-3.25em,0) scale(.93)}95%{opacity:0;transform:translate3d(0,-3.25em,0) scale(.93)}100%{opacity:0;transform:translate3d(0,1.2em,0)}}
@keyframes cmh-toast1{0%,33%{opacity:0;transform:translate3d(0,1.4em,0) scale(.96)}40%,91%{opacity:1;transform:translate3d(0,0,0) scale(1)}95%,100%{opacity:0;transform:translate3d(0,0,0) scale(1)}}
.cmh-tip-card{position:relative;padding:1.1em;border-radius:1.5em;background:#fff;box-shadow:0 0 0 1px rgba(60,30,140,.05),0 1.8em 3em -1.9em rgba(60,30,140,.55);box-sizing:border-box}
.cmh-tip-who{display:flex;gap:.75em;align-items:center}
.cmh-tip-who img{flex:none;width:2.8em;height:2.8em;border-radius:50%;object-fit:cover}
.cmh-tip-who>span{min-width:0}
.cmh-tip-who b{display:block;font-size:1em;font-weight:600;letter-spacing:-.01em}
.cmh-tip-who small{display:block;font-size:.78em;color:#7c7a84;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-amts{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:.5em;margin-top:1em}
.cmh-amt{position:relative;pointer-events:auto;height:2.7em;display:grid;place-items:center;border-radius:.8em;box-shadow:inset 0 0 0 1px #e6e3ee;font-size:.95em;font-weight:600;cursor:pointer}
.cmh-amt-hl{position:absolute;left:0;top:0;width:calc((100% - 1em) / 3);height:2.565em;border-radius:.8em;box-shadow:inset 0 0 0 2px #8b5cf6;background:#f3eeff;transform:translate3d(calc(100% + .5em),0,0);animation-name:cmh-hl;animation-timing-function:${SOFT}}
@keyframes cmh-hl{0%,9%{transform:translate3d(0,0,0)}15%,91%{transform:translate3d(calc(100% + .5em),0,0)}97%,100%{transform:translate3d(0,0,0)}}
.cmh-tip-btn{pointer-events:auto;margin-top:.6em;height:2.9em;display:grid;place-items:center;border-radius:.9em;background:#8b5cf6;color:#fff;font-size:.95em;font-weight:600;cursor:pointer;animation-name:cmh-tpress}
@keyframes cmh-tpress{0%,27%{transform:scale(1)}29.5%{transform:scale(.955)}33%,100%{transform:scale(1)}}
.cmh-tip-btn .cmh-stack{place-items:center}
.cmh-tb{opacity:0}
.cmh-tb[data-k="0"]{animation-name:cmh-t3}
.cmh-tb[data-k="1"]{animation-name:cmh-t5}
.cmh-tb-ok{display:inline-flex;align-items:center;gap:.45em;animation-name:cmh-tok}
@keyframes cmh-t3{0%,11%{opacity:1}13.5%,93%{opacity:0}95.5%,100%{opacity:1}}
@keyframes cmh-t5{0%,11%{opacity:0}13.5%,30%{opacity:1}32.5%,100%{opacity:0}}
@keyframes cmh-tok{0%,30%{opacity:0;transform:scale(.92)}33.5%,91%{opacity:1;transform:scale(1)}94%,100%{opacity:0;transform:scale(1)}}
/* The hearts: each starts at the button's top edge, rises and drifts aside as it fades. */
.cmh-hearts{position:absolute;left:0;right:0;bottom:3.4em;height:0;font-size:1.2em;pointer-events:none}
.cmh-heart{position:absolute;bottom:0;display:grid;margin-left:-.5em;opacity:0;animation-name:cmh-heart;animation-timing-function:linear}
@keyframes cmh-heart{0%,30%{opacity:0;transform:translate3d(0,0,0) scale(.4)}33%{opacity:1;transform:translate3d(calc(var(--dx) * .2),-1.6em,0) scale(1)}42%{opacity:1;transform:translate3d(calc(var(--dx) * .75),-5.4em,0) scale(1)}52%,100%{opacity:0;transform:translate3d(var(--dx),-8.6em,0) scale(.85)}}
@keyframes cmh-heart1{0%{opacity:0;transform:translate3d(0,0,0) scale(.4)}14%{opacity:1;transform:translate3d(calc(var(--dx) * .2),-1.6em,0) scale(1)}55%{opacity:1;transform:translate3d(calc(var(--dx) * .75),-5.4em,0) scale(1)}100%{opacity:0;transform:translate3d(var(--dx),-8.6em,0) scale(.85)}}
/* Pressed by a visitor: the loop's parts stop and take their places from data-pick and data-sent. */
.cmh-tip[data-user] .cmh-a{animation:none!important;transition:transform .42s ${SOFT},opacity .22s ease}
.cmh-tip[data-user] .cmh-amt-hl{transform:translate3d(0,0,0)}
.cmh-tip[data-user][data-pick="1"] .cmh-amt-hl{transform:translate3d(calc(100% + .5em),0,0)}
.cmh-tip[data-user][data-pick="2"] .cmh-amt-hl{transform:translate3d(calc(200% + 1em),0,0)}
.cmh-tip[data-user] .cmh-tb-ok{opacity:0}
.cmh-tip[data-user][data-pick="0"]:not([data-sent]) .cmh-tb[data-k="0"],.cmh-tip[data-user][data-pick="1"]:not([data-sent]) .cmh-tb[data-k="1"],.cmh-tip[data-user][data-pick="2"]:not([data-sent]) .cmh-tb[data-k="2"],.cmh-tip[data-user][data-sent] .cmh-tb-ok{opacity:1}
.cmh-tip[data-user] .cmh-toast[data-k="0"]{opacity:1;transform:translate3d(0,0,0)}
.cmh-tip[data-user][data-sent] .cmh-toast[data-k="0"]{opacity:.6;transform:translate3d(0,-3.25em,0) scale(.93)}
.cmh-tip[data-user] .cmh-toast[data-k="1"]{opacity:0;transform:translate3d(0,1.4em,0) scale(.96)}
.cmh-tip[data-user][data-sent] .cmh-toast[data-k="1"]{opacity:1;transform:translate3d(0,0,0) scale(1)}
.cmh-tip[data-user][data-sent] .cmh-heart{animation:cmh-heart1 1.5s linear both!important;transition:none}

/* ── the numbers ── */
.cmh-biz{display:grid;place-items:center}
.cmh-biz-in{display:grid;grid-template-columns:21.5em 14.5em;gap:.9em;height:23em}
.cmh-tile{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;border-radius:1.25em;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.05),0 1.6em 2.8em -2em rgba(24,24,27,.38);box-sizing:border-box;overflow:hidden}
.cmh-biz-side{display:grid;grid-template-rows:1fr 1fr;gap:.9em;min-height:0}
.cmh-sales{padding:1.25em 1.35em 1em}
.cmh-sales-top{display:flex;align-items:baseline;justify-content:space-between;font-size:.86em;font-weight:500}
.cmh-sales-top small{font-size:.9em;font-weight:400;color:#8b8b94}
.cmh-sales-sum{display:flex;align-items:baseline;gap:.7em;margin-top:.3em}
.cmh-sales-sum b{font-size:1.95em;font-weight:600;line-height:1.1;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.cmh-sales-sum span{display:inline-flex;align-items:center;gap:.3em;font-size:.86em;font-weight:600;color:#7c4ff0}
.cmh-ch{position:relative;pointer-events:auto;flex:1;min-height:0;margin-top:1em}
.cmh-ch svg{position:absolute;inset:0;display:block;width:100%;height:100%;overflow:visible}
.cmh-ch path{vector-effect:non-scaling-stroke}
.cmh-ch-grid{stroke:#efeff2;stroke-width:1}
.cmh-ch-prev{stroke:#cfcfd6;stroke-width:1.25;stroke-dasharray:3 4;stroke-linecap:round}
.cmh-ch-line{stroke:#8b5cf6;stroke-width:2.25;stroke-linecap:round;stroke-linejoin:round}
/* The line drawing in: a window sliding open to the right while what it shows slides the other way by as much, so the line stands still and is uncovered. Two transforms, the same timing. */
.cmh-ch-rev,.cmh-ch-rev-in{position:absolute;inset:-4px;display:block;animation-duration:1.5s;animation-timing-function:cubic-bezier(.45,.05,.2,1);animation-delay:.15s}
.cmh-ch-rev{overflow:hidden;animation-name:cmh-rev}
.cmh-ch-rev-in{inset:0;animation-name:cmh-rev-in}
.cmh-ch-rev-in svg{inset:4px;width:calc(100% - 8px);height:calc(100% - 8px)}
@keyframes cmh-rev{from{transform:translate3d(-100%,0,0)}to{transform:translate3d(0,0,0)}}
@keyframes cmh-rev-in{from{transform:translate3d(100%,0,0)}to{transform:translate3d(0,0,0)}}
.cmh-ch-end{position:absolute;left:100%;width:0;height:0}
.cmh-ch-pt,.cmh-ch-halo{position:absolute;left:-.34em;top:-.34em;width:.68em;height:.68em;border-radius:50%;background:#8b5cf6}
.cmh-ch-pt{box-shadow:0 0 0 2px #fff;animation-name:cmh-pt;animation-duration:.5s;animation-delay:1.5s}
.cmh-ch-halo{opacity:0;animation-name:cmh-halo;animation-duration:2.6s;animation-timing-function:ease-out;animation-delay:1.9s}
@keyframes cmh-pt{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}
@keyframes cmh-halo{0%{opacity:0;transform:scale(1)}12%{opacity:.34}70%,100%{opacity:0;transform:scale(3.4)}}
.cmh-card:not([data-seen]) .cmh-ch-halo{visibility:hidden}
/* A mouse reading a day: a hairline, a dot on the line and the day's sum under it, over the two dates. They sit at the chart's left edge and are moved by transform. */
.cmh-ch-guide,.cmh-ch-dot,.cmh-ch-tip{position:absolute;left:0;top:0;opacity:0;pointer-events:none;transition:opacity .18s ease}
.cmh-ch-guide{top:0;bottom:0;width:1px;margin-left:-.5px;background:#d9d9e0}
.cmh-ch-dot{width:.62em;height:.62em;margin:-.31em 0 0 -.31em;border-radius:50%;background:#fff;box-shadow:0 0 0 2px #18181b}
.cmh-ch-tip{top:auto;bottom:-1.75em;width:0;display:grid;justify-items:center}
.cmh-ch-tip>span{display:flex;gap:.5em;padding:.3em .6em;border-radius:.55em;background:#18181b;color:#fff;font-size:.74em;white-space:nowrap;font-variant-numeric:tabular-nums}
.cmh-ch-tip-d{color:#b9b8c2}
.cmh-ch-tip b{font-weight:600}
.cmh-ch[data-read] .cmh-ch-guide,.cmh-ch[data-read] .cmh-ch-dot,.cmh-ch[data-read] .cmh-ch-tip{opacity:1}
.cmh-sales-days{display:flex;justify-content:space-between;margin-top:.6em;font-size:.72em;color:#a1a1aa;font-variant-numeric:tabular-nums}
.cmh-top,.cmh-geo{padding:1em 1.1em;justify-content:center}
.cmh-tile-t{font-size:.86em;font-weight:500;letter-spacing:-.005em}
.cmh-top-rows{display:grid;gap:.6em;margin-top:.75em}
.cmh-top-row,.cmh-geo-row{display:flex;align-items:center;min-width:0;animation-name:cmh-row}
@keyframes cmh-row{from{opacity:0;transform:translate3d(0,.5em,0)}to{opacity:1;transform:translate3d(0,0,0)}}
.cmh-top-row{gap:.7em}
.cmh-top-pic{flex:none;display:block;width:2.6em;height:2.6em;border-radius:.55em;overflow:hidden;background:#e9e9ec}
.cmh-top-pic img{display:block;width:100%;height:100%;object-fit:cover}
.cmh-top-pic[data-kind=tee] img{transform:scale(1.5)}
.cmh-top-w{min-width:0;display:grid}
.cmh-top-w b{font-size:.8em;font-weight:600;letter-spacing:-.005em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-top-w small{font-size:.72em;color:#8b8b94;white-space:nowrap;font-variant-numeric:tabular-nums}
.cmh-geo-rows{display:grid;gap:.62em;margin-top:.8em}
.cmh-geo-row{gap:.6em;font-size:.8em}
.cmh-flag{flex:none;display:block;width:1.75em;height:1.17em;border-radius:.22em;overflow:hidden;box-shadow:0 0 0 1px rgba(24,24,27,.1)}
.cmh-geo-n{flex:1;min-width:0;color:#3f3f46;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-geo-c{display:none;flex:1;color:#3f3f46}
.cmh-geo-row b{font-weight:600;font-variant-numeric:tabular-nums}
/* A narrow card (a phone): the chart on top, the two small tiles side by side under it, pictures and flags without their names. */
@container (max-width:440px){
  .cmh-biz{font-size:clamp(11px,4.05cqw,15px)}
  .cmh-biz-in{grid-template-columns:22.4em;height:auto}
  .cmh-sales{height:14.6em}
  .cmh-biz-side{grid-template-rows:none;grid-template-columns:1fr 1fr}
  .cmh-top,.cmh-geo{height:9.2em;padding:.95em 1em}
  .cmh-top-rows{grid-template-columns:1fr 1fr;gap:.6em}
  .cmh-top-pic{width:100%;height:auto;aspect-ratio:1}
  .cmh-top-w,.cmh-geo-n{display:none}
  .cmh-geo-c{display:block}
  .cmh-geo-rows{gap:.5em}
}

/* ── your own domain (landing round 10): one address on a white band, its ending gliding up a step at a time ── */
.cmh-dm{display:grid;place-items:center;--dm-step:2.6em}
/* The soft light: two warm and white tints turning slowly around the middle, one transform on one layer. */
.cmh-dm-light{position:absolute;left:50%;top:50%;width:150cqw;aspect-ratio:1;margin:-75cqw 0 0 -75cqw;background:radial-gradient(26% 26% at 32% 36%,rgba(255,255,255,.5),rgba(255,255,255,0) 70%),radial-gradient(28% 28% at 68% 64%,rgba(255,170,110,.16),rgba(255,170,110,0) 70%);animation-name:cmh-spin;animation-duration:48s;animation-timing-function:linear}
@keyframes cmh-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.cmh-dm-band{position:relative;display:flex;align-items:center;width:15.6em;height:3.3em;margin-top:-1.2em;padding:0 .45em;box-sizing:border-box;border-radius:1.65em;background:#fff;box-shadow:0 0 0 1px rgba(120,60,10,.06),0 1.4em 2.4em -1.5em rgba(120,60,10,.5);font-size:1.12em;letter-spacing:-.015em;white-space:nowrap}
.cmh-dm-lock{flex:none;display:grid;place-items:center;width:2.4em;height:2.4em;margin-right:.6em;border-radius:50%;background:#8b5cf6;color:#fff;font-size:.86em}
.cmh-dm-name{font-weight:600;color:#18181b}
/* The endings' window: five steps tall around the band's middle line, faded above and below by a mask on the window, which never moves; only the reel inside it slides. */
.cmh-dm-ends{position:relative;align-self:stretch;flex:1;min-width:0}
.cmh-dm-win{position:absolute;left:0;right:0;top:50%;height:calc(var(--dm-step) * 5);margin-top:calc(var(--dm-step) * -2.5);-webkit-mask-image:linear-gradient(transparent,rgba(0,0,0,.2) 26%,#000 40%,#000 60%,rgba(0,0,0,.2) 74%,transparent);mask-image:linear-gradient(transparent,rgba(0,0,0,.2) 26%,#000 40%,#000 60%,rgba(0,0,0,.2) 74%,transparent)}
.cmh-dm-reel{position:absolute;left:0;right:0;top:0;display:block;animation-name:cmh-reel;animation-duration:10s;animation-timing-function:cubic-bezier(.65,0,.35,1)}
.cmh-dm-end{display:flex;align-items:center;height:var(--dm-step);font-weight:600;color:#18181b}
.cmh-dm-end[data-storelib]{font-weight:500;color:#a1a1aa}
@keyframes cmh-reel{0%,16%{transform:translate3d(0,0,0)}25%,41%{transform:translate3d(0,calc(var(--dm-step) * -1),0)}50%,66%{transform:translate3d(0,calc(var(--dm-step) * -2),0)}75%,91%{transform:translate3d(0,calc(var(--dm-step) * -3),0)}100%{transform:translate3d(0,calc(var(--dm-step) * -4),0)}}

@media (prefers-reduced-motion:reduce){
  .cmh-a{animation:none!important}
  .cmh-o{animation:none!important}
  .cmh-field canvas{transition:none}
  .cmh-toast[data-k="1"]{opacity:1}
  .cmh-toast[data-k="0"]{opacity:.6;transform:translate3d(0,-3.25em,0) scale(.93)}
  .cmh-tb[data-k="1"]{opacity:1}
  .cmh-tb-ok,.cmh-ch-halo{opacity:0}
  .cmh-dm-reel{transform:translate3d(0,calc(var(--dm-step) * -1),0)}
  .cmh-heart{display:none}
}
@media(scripting:none){.cmh-o{animation:none}}
`

/** This section's stylesheet, as it draws it: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const HOW_IT_WORKS_STYLES: readonly SectionStyle[] = [{ href: "w12-commerce-how", precedence: "default", css: HOW_CSS }]
