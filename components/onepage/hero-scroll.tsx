"use client"

/**
 * ===========================================================================
 *  THE HERO AS THE PAGE SCROLLS, AND THE BAR THAT TAKES ITS PLACE (round AR)
 * ===========================================================================
 * The owner: with the header set to the full picture or video (not the
 * circle), scrolling should darken the picture gradually while the page's
 * content slides up over it, "very subtle, like Linktree's"; once the
 * profile area has gone, a slim bar fades in at the top with the creator's
 * picture or logo and name, in the page's own colours, and hides again as
 * the profile comes back.
 *
 *   THE PICTURE   app/globals.css [data-hero-scroll]: a CSS scroll timeline
 *                 on the hero's own box (view-timeline), so the compositor
 *                 draws it with the scroll and no script runs per frame.
 *                 The picture is held back (translate and scale) and a dark
 *                 layer over it fades in; the name over it fades out. Only
 *                 transform and opacity change. A browser without scroll
 *                 timelines gets the dark layer and the name's fade on the
 *                 same curve (lib/onepage/feel heroScroll) from a passive
 *                 scroll listener, one write per frame, only while the hero
 *                 is on screen; never the picture's own move, which a script
 *                 can only draw a frame behind the scroll (round AS).
 *   THE BAR       round AS, on every header layout, not only the Hero:
 *                 it forms over the profile's name as the name slides up
 *                 under it (lib/onepage/feel barMorph), driven by the page's
 *                 own scroll, so it runs backwards exactly as it ran
 *                 forwards and nothing jumps at the top. The creator's
 *                 picture, name and verified badge settle into it. On a
 *                 computer it floats inside the card, its corners concentric
 *                 with the card's, instead of a strip cut off at its sides.
 *   THE CORNERS   the Share and Subscribe buttons (useCornerButtonsShown)
 *                 change only after real travel one way, from one shared
 *                 listener, so the page itself never renders on a scroll.
 *
 * Drawn by the live page and the editor's preview frame alike (both are
 * components/onepage/public-onepage), on a phone and a computer.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"
import { BAR_PHONE_PX, CORNER_START, barMorph, cornerNext, heroScroll, type CornerState } from "@/lib/onepage/feel"
import { LIVE_DESKTOP_QUERY } from "@/lib/onepage/live-layout"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import { fontStack } from "@/lib/onepage/fonts"

/** The bar's height below the safe area, on a phone (lib/onepage/feel). */
export const TOP_BAR_PX = BAR_PHONE_PX

function visibleHero(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-hero-scroll]"))
  return all.find((el) => el.getClientRects().length > 0) ?? null
}

function scrollTimelines(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()")
  } catch {
    return false
  }
}

/*
  The CSS timeline follows the hero's nearest scroll container. Where a box between the hero and the page clips
  its overflow (overflow hidden or auto, which makes it a scroll container that never scrolls), the timeline would
  stand still: then the script draws it instead.
*/
function pageScrollsHero(hero: HTMLElement): boolean {
  for (let n = hero.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n)
    const boxes = (v: string) => v !== "visible" && v !== "clip"
    if (boxes(cs.overflowY) || boxes(cs.overflowX)) return false
  }
  return true
}

/**
 * The picture's scroll for a browser without scroll timelines. Nothing runs
 * where the CSS does it; elsewhere a passive listener writes the curve once a
 * frame, only while the hero is on screen.
 */
function useHeroFallback(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let hero: HTMLElement | null = null
    let frame = 0
    let near = true
    let on = false
    let tries = 0
    let timer = 0
    const write = () => {
      frame = 0
      hero = hero?.isConnected ? hero : visibleHero()
      if (!hero) return
      const r = hero.getBoundingClientRect()
      const s = heroScroll(-r.top, r.height)
      const scrim = hero.querySelector<HTMLElement>("[data-hero-scrim]")
      const title = hero.querySelector<HTMLElement>("[data-hero-title]")
      /*
        Round AS: no held back picture here, only the dark layer and the name. A transform written from a script
        lands a frame after the page has moved (an iPhone scrolls on its own thread), so the picture shook against
        the scroll, worst on the way back to the top: the owner's "stutter". Opacity a frame late cannot be seen.
      */
      if (scrim) scrim.style.opacity = String(s.dim)
      /* The same curve as op-hero-title (app/globals.css): whole until 62% of the way out, gone by 92%, while the bar forms over it. */
      if (title) title.style.opacity = String(Math.round(Math.min(1, Math.max(0, 1 - (-r.top / r.height - 0.62) / 0.3)) * 1000) / 1000)
    }
    const onScroll = () => {
      if (near && !frame) frame = requestAnimationFrame(write)
    }
    let io: IntersectionObserver | null = null
    /* The header may draw a moment after the page (the layout is picked on the client): looked for a few times. */
    const attach = () => {
      hero = visibleHero()
      if (!hero) {
        if (tries++ < 20) timer = window.setTimeout(attach, 100)
        return
      }
      /* The compositor draws it (app/globals.css): nothing to do here. */
      if (scrollTimelines() && pageScrollsHero(hero)) return
      on = true
      if (typeof IntersectionObserver === "function") {
        io = new IntersectionObserver((e) => {
          near = e.some((x) => x.isIntersecting)
          /* Left the screen: drawn once more at its end, so a fast fling never leaves it halfway. */
          if (!near) write()
        })
        io.observe(hero)
      }
      write()
      window.addEventListener("scroll", onScroll, { passive: true })
    }
    attach()
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      io?.disconnect()
      if (on) window.removeEventListener("scroll", onScroll)
    }
  }, [enabled])
}

/* ── The Share and Subscribe buttons: shown or not, for the whole page, from one listener ── */

let corner: CornerState = CORNER_START
const cornerListeners = new Set<() => void>()
let cornerFrame = 0

function readCorner() {
  cornerFrame = 0
  /* Held between the top and the page's end: a pull past either is not a direction (Safari's rubber band). */
  const end = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  const next = cornerNext(corner, Math.min(Math.max(0, window.scrollY), end))
  const changed = next.shown !== corner.shown
  corner = next
  if (changed) cornerListeners.forEach((l) => l())
}

function onCornerScroll() {
  if (!cornerFrame) cornerFrame = requestAnimationFrame(readCorner)
}

function subscribeCorner(listener: () => void) {
  if (cornerListeners.size === 0) {
    corner = cornerNext(CORNER_START, window.scrollY)
    window.addEventListener("scroll", onCornerScroll, { passive: true })
  }
  cornerListeners.add(listener)
  return () => {
    cornerListeners.delete(listener)
    if (cornerListeners.size > 0) return
    window.removeEventListener("scroll", onCornerScroll)
    cancelAnimationFrame(cornerFrame)
    cornerFrame = 0
  }
}

/**
 * Whether the corner buttons show: near the top, or once the page has
 * travelled up far enough; hidden once it has travelled down. Only the
 * buttons read it, so a scroll never renders the page (it used to, the whole
 * page, every time the direction turned).
 */
export function useCornerButtonsShown(): boolean {
  return useSyncExternalStore(subscribeCorner, () => corner.shown, () => true)
}

/* ── The bar ── */

function visibleOf(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => el.getClientRects().length > 0) ?? null
}

/** What the bar forms over: the name (or the logo), else the picture, else the header itself. */
function barAnchor(): HTMLElement | null {
  return visibleOf("[data-op-bar-anchor]") ?? visibleOf("[data-page-avatar]") ?? visibleOf("[data-op-header], [data-hero-header]")
}

export function HeroTopBar({
  enabled,
  heroEffect = false,
  name,
  avatarUrl,
  avatarRadius = "9999px",
  logoUrl,
  badge,
  background,
  ink,
  fontFamily,
}: {
  /** The page draws a header with a picture or a name: the bar takes its place once it has scrolled away. */
  enabled: boolean
  /** A full picture or video hero is drawn (lib/onepage/feel heroScrollEffect): its picture follows the scroll too. */
  heroEffect?: boolean
  name: string
  avatarUrl: string | null
  /** The picture's corner, as the header draws it (lib/onepage/header-style avatarRadius), at the bar's size. */
  avatarRadius?: string
  /** The title drawn as a logo: the bar shows the logo in place of the picture and the name. */
  logoUrl?: string | null
  /** The verified badge, as the header draws it beside the name. */
  badge?: ReactNode
  /** The page's ground (lib/onepage/page-frame pageCanvasColour) and its title colour; the title's font family, as the theme names it. */
  background: string
  ink: string
  fontFamily?: string
}) {
  const [shown, setShown] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLButtonElement>(null)
  useHeroFallback(heroEffect)

  useEffect(() => {
    if (!enabled) return
    const bar = barRef.current
    const inner = innerRef.current
    if (!bar || !inner) return
    let anchor: HTMLElement | null = null
    let frame = 0
    let last = -1
    let on = false
    let barBottom = 0
    /* The bar is fixed: its foot is measured once, and again when the window changes (a phone turned, a computer's window resized). */
    const measure = () => {
      barBottom = bar.getBoundingClientRect().bottom
    }
    const write = () => {
      frame = 0
      if (!anchor?.isConnected || anchor.getClientRects().length === 0) anchor = barAnchor()
      if (!anchor) return
      const p = barMorph(anchor.getBoundingClientRect().bottom, barBottom)
      if (p !== last) {
        last = p
        bar.style.opacity = String(p)
        /* The picture and the name rise the last 10px into place and the picture grows to its size: transform and opacity only. */
        inner.style.transform = `translate3d(0, ${Math.round((1 - p) * 100) / 10}px, 0) scale(${Math.round((0.94 + p * 0.06) * 1000) / 1000})`
      }
      const now = p >= 0.6
      if (now !== on) {
        on = now
        setShown(now)
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(write)
    }
    const onResize = () => {
      measure()
      onScroll()
    }
    /* The header may draw a moment after the page (the layout is picked on the client): looked for again on the next frames. */
    let tries = 0
    let timer = 0
    const attach = () => {
      anchor = barAnchor()
      if (!anchor && tries++ < 20) {
        timer = window.setTimeout(attach, 100)
        return
      }
      measure()
      write()
    }
    attach()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize, { passive: true })
    const mq = window.matchMedia(LIVE_DESKTOP_QUERY)
    mq.addEventListener("change", onResize)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      mq.removeEventListener("change", onResize)
    }
  }, [enabled])

  if (!enabled) return null
  const logo = logoUrl ? onePageImageSrc(logoUrl, 320) : null
  const face = avatarUrl ? onePageImageSrc(avatarUrl, 96) : null
  const style: CSSProperties = {
    backgroundColor: background,
    color: ink,
    fontFamily: fontFamily ? fontStack(fontFamily) : undefined,
    /* Drawn from the scroll (above); nothing at first, so a page opened halfway down forms it on its first frame. */
    opacity: 0,
    pointerEvents: shown ? "auto" : "none",
    ["--op-bar-ink" as string]: ink,
  }
  return (
    <div
      ref={barRef}
      aria-hidden={!shown}
      data-op-topbar={shown ? "shown" : "hidden"}
      /*
        A phone: the full width, under the status bar, 60px, the corner buttons at its ends.
        A computer: inside the card (550px, components/onepage/public-onepage), 12px in from its edges,
        its corner the card's 40px less those 12, so the two curves run side by side.
      */
      className="op-topbar fixed inset-x-0 top-0 z-[19] pt-[env(safe-area-inset-top)] transition-opacity duration-[120ms] ease-linear will-change-[opacity] motion-reduce:transition-none md:inset-x-[max(28px,calc(50%_-_263px))] md:top-3 md:rounded-[28px] md:pt-0"
      style={style}
    >
      <button
        ref={innerRef}
        type="button"
        tabIndex={shown ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
        className="mx-auto flex max-w-[calc(100%-120px)] origin-center items-center justify-center gap-2.5 px-1 outline-none transition-transform duration-[120ms] ease-out will-change-transform focus-visible:underline motion-reduce:transition-none md:max-w-[calc(100%-32px)]"
        style={{ height: `var(--op-bar-h, ${BAR_PHONE_PX}px)`, transform: "translate3d(0, 10px, 0) scale(0.94)" }}
        data-op-topbar-button=""
      >
        {logo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logo} alt={name} className="max-h-7 w-auto max-w-[180px] object-contain" />
        ) : (
          <>
            {face ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={face} alt="" data-op-topbar-face="" className="h-8 w-8 shrink-0 object-cover" style={{ borderRadius: avatarRadius }} onError={(e) => { const img = e.currentTarget; if (avatarUrl && img.dataset.raw === undefined) { img.dataset.raw = ""; img.src = avatarUrl } else img.style.display = "none" }} />
            ) : null}
            <span className="inline-flex min-w-0 items-center">
              <span className="min-w-0 truncate text-[15px] font-semibold" data-op-topbar-name="">{name}</span>
              {badge ? <span className="flex shrink-0 items-center" data-op-topbar-badge="">{badge}</span> : null}
            </span>
          </>
        )}
      </button>
    </div>
  )
}
