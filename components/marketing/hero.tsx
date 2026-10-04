"use client"

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { optimizedImageUrl } from "@/lib/images/optimized-url"

const TYPING_PHRASES = [
  "Start monetizing your passion...",
  "Build link in bio pages...",
  "Sell digital products...",
  "Share your passion...",
  "Build your online store...",
]
const TYPING_MS = 70
const DELETING_MS = 35
const TYPED_PAUSE_MS = 2000

/**
 * THE TYPED HEADLINE, WITHOUT REACT.
 *
 * It was a `useState` per character, so every 35 to 70ms the whole hero
 * rendered again (five cards, their styles and srcsets) to change one letter,
 * forever, including with the hero scrolled away and the tab in the
 * background. Now the letters go straight into a text node, and the typing
 * stops while nobody can see it.
 */
function TypingHeadline() {
  const textRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    const node = document.createTextNode("")
    el.replaceChildren(node)
    let phrase = 0
    let length = 0
    let deleting = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let onScreen = true

    const step = () => {
      timer = null
      const current = TYPING_PHRASES[phrase]
      let wait = TYPING_MS
      if (!deleting) {
        if (length < current.length) {
          length++
          wait = length === current.length ? TYPED_PAUSE_MS : TYPING_MS
          if (length === current.length) deleting = true
        }
      } else if (length > 0) {
        length--
        wait = DELETING_MS
        if (length === 0) {
          phrase = (phrase + 1) % TYPING_PHRASES.length
          deleting = false
          wait = TYPING_MS
        }
      }
      node.data = TYPING_PHRASES[phrase].slice(0, length)
      schedule(wait)
    }
    const schedule = (wait: number) => {
      if (timer || !onScreen || document.visibilityState === "hidden") return
      timer = setTimeout(step, wait)
    }
    const pause = () => { if (timer) { clearTimeout(timer); timer = null } }
    const sync = () => {
      if (onScreen && document.visibilityState !== "hidden") schedule(TYPING_MS)
      else pause()
    }
    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync() })
      : null
    io?.observe(el)
    document.addEventListener("visibilitychange", sync)
    schedule(TYPING_MS)
    return () => {
      pause()
      io?.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])
  return <span ref={textRef} />
}

const PARTNER_LOGOS = [
  "https://cdn.sanity.io/images/599r6htc/regionalized/a9bfb23cca986ee16b0547274bcd7461ffd373aa-67x18.svg?q=75&fit=max&auto=format",
  "https://cdn.sanity.io/images/599r6htc/regionalized/bbfcc0e04437442a9637cc58efde849dfadb313c-76x48.svg?q=75&fit=max&auto=format",
  "https://cdn.sanity.io/images/599r6htc/regionalized/01d4ea19e824b3596f8f6c701d3b8319e49631b0-146x18.svg?q=75&fit=max&auto=format",
  "https://storelib.com/media/platform%20images/popj.svg",
  "https://storelib.com/media/platform%20images/eyJidWNrZXQiOiJwYXJ0bmVycGFnZS5wcm9kIiwia2V5IjoibWVkaWEvY29udGFjdF9pbWFnZXMvOWQ0MDVmYmMtNGJkMS00NzEz.svg",
]

/**
 * ===========================================================================
 *  THE COLLAGE BEHIND THE HEADLINE, AT THE SIZE IT IS DRAWN
 * ===========================================================================
 * THE OLD URLS WERE NOT RESIZING ANYTHING. They carried
 * `?width=280&height=350&resize=cover&quality=55` on
 * `/storage/v1/object/public/…` — and the OBJECT endpoint serves the stored
 * file and ignores every one of those parameters. Supabase's resizer is a
 * different path (`/render/image/…`), which this project deliberately does
 * not use: it is metered, the allowance is already spent, and
 * tests/no-image-transforms fails the build over it.
 *
 * So five full-size WebPs were downloaded on every visit to the front page,
 * into cards about 260px wide, and the query string made it look handled.
 * That is the lag behind the typing headline.
 *
 * `/_next/image` is the same optimizer every other image on the platform
 * goes through: resized and re-encoded to AVIF at the edge, cached for a
 * year (minimumCacheTTL), nothing metered. `optimizedImageUrl` doubles the
 * display width for retina and snaps to a width Next will actually serve —
 * anything else is a 400 rather than a picture.
 *
 * Quality 75, not the 88 a creator's own cover gets: this is decoration at
 * 260px behind a white card, and it is the first thing on the site.
 */
const IMG_BASE = "https://storelib.com/media/platform%20images/collage%20imags"
const IMG_NAMES = [
  "Monetize%20(5)%20(2).webp",
  "Monetize%20(6)%20(1).webp",
  "Monetize%20(7)%20(1).webp",
  "Monetize%20(21).webp",
  "Monetize%20(9).webp",
]
const IMG_ORIGINALS = IMG_NAMES.map((n) => `${IMG_BASE}/${n}`)
/** Side cards on a phone, ~130px drawn. */
const IMAGES_SM = IMG_ORIGINALS.map((src) => optimizedImageUrl(src, 160, 75))
/** The centre card on a desktop, ~280px drawn. */
const IMAGES_LG = IMG_ORIGINALS.map((src) => optimizedImageUrl(src, 320, 75))
// Default src uses the small variant
const IMAGES = IMAGES_SM

interface CardDef {
  left: number
  top: number
  width: number
  height: number
  zIndex: number
  opacity?: number
  scale?: number
}

// Card aspect ratio = 4:5 (1080×1350). Cards slightly overlapping. Depth scale restored.
// Positions derived by working outward from center (canvas center = 550).
// tx = left + width*(1−scale)/2  →  rendered_left/right verified below.
//
// Desktop — rendered edges (~2px overlap between cards):
const DESKTOP_CARDS: CardDef[] = [
  { left: -18,  top: 50, width: 200, height: 250, zIndex: 1, opacity: 0.82, scale: 0.95 },
  { left: 172,  top: 25, width: 240, height: 300, zIndex: 2, opacity: 0.92, scale: 0.98 },
  { left: 407,  top: 0,  width: 280, height: 350, zIndex: 3, opacity: 1,    scale: 1    },
  { left: 682,  top: 25, width: 240, height: 300, zIndex: 2, opacity: 0.92, scale: 0.98 },
  { left: 912,  top: 50, width: 200, height: 250, zIndex: 1, opacity: 0.82, scale: 0.95 },
]

// Mobile — rendered edges (~2px overlap between cards):
const MOBILE_CARDS: CardDef[] = [
  { left: 38,   top: 50, width: 180, height: 225, zIndex: 1, opacity: 0,    scale: 0.95 },
  { left: 205,  top: 25, width: 220, height: 275, zIndex: 2, opacity: 0.85, scale: 0.98 },
  { left: 415,  top: 0,  width: 260, height: 325, zIndex: 3, opacity: 1,    scale: 1    },
  { left: 665,  top: 25, width: 220, height: 275, zIndex: 2, opacity: 0.85, scale: 0.98 },
  { left: 872,  top: 50, width: 180, height: 225, zIndex: 1, opacity: 0,    scale: 0.95 },
]

const CANVAS_W = 1100
const CANVAS_H = 375
const AUTOPLAY_INTERVAL = 3800
const CARD_TRANSITION_MS = 1500
/**
 * The box every card is drawn in: the centre card's size. A card's size in the
 * collage is a `scale` of this box, never a width, so a rotation moves and
 * scales five layers the compositor already has and lays nothing out. It
 * animated width and height before, which was a layout and a re-raster of
 * five images on every frame of every rotation. The ratio is the cards' own
 * 4:5 in both sets, so a scale is exactly the old width and height.
 */
const DESKTOP_BASE = 280
const MOBILE_BASE = 260
/** Below this the phone set is used: the same edge as the `sm` breakpoint. */
const MOBILE_QUERY = "(max-width: 639px)"

interface Pose { transform: string; opacity: number; zIndex: number }

function poseOf(from: CardDef, to: CardDef, t: number, base: number): Pose {
  const width = lerp(from.width, to.width, t)
  const height = lerp(from.height, to.height, t)
  const scale = lerp(from.scale ?? 1, to.scale ?? 1, t)
  const tx = lerp(from.left, to.left, t) + width * (1 - scale) / 2
  const ty = lerp(from.top, to.top, t) + height * (1 - scale) / 2
  const k = (width * scale) / base
  return {
    transform: `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) scale(${k.toFixed(4)})`,
    opacity: lerp(from.opacity ?? 1, to.opacity ?? 1, t),
    zIndex: Math.round(lerp(from.zIndex, to.zIndex, t)),
  }
}

/** A card at rest, for both sets at once, as CSS variables: right on the server's first paint. */
function restVars(slot: number): React.CSSProperties {
  const d = poseOf(DESKTOP_CARDS[slot], DESKTOP_CARDS[slot], 1, DESKTOP_BASE)
  const m = poseOf(MOBILE_CARDS[slot], MOBILE_CARDS[slot], 1, MOBILE_BASE)
  return {
    ["--hc-t" as string]: d.transform,
    ["--hc-o" as string]: d.opacity,
    ["--hc-z" as string]: d.zIndex,
    ["--hc-tm" as string]: m.transform,
    ["--hc-om" as string]: m.opacity,
    ["--hc-zm" as string]: m.zIndex,
  }
}

const rotateOrder = (order: number[], direction: 1 | -1) => {
  const next = [...order]
  if (direction === 1) {
    const first = next.shift()!
    next.push(first)
  } else {
    const last = next.pop()!
    next.unshift(last)
  }
  return next
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t
// Smooth ease-in-out quartic — gentle start AND gentle end for silky autoplay
const ease = (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2

export function Hero() {
  const [cardOrder, setCardOrder] = useState([0, 1, 2, 3, 4])
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  const [logosLoaded, setLogosLoaded] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const loadedLogosCount = useRef(0)

  const autoplayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const orderRef = useRef(cardOrder)
  const animatingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const activeRef = useRef(true)
  const loadedImageSetRef = useRef(new Set<number>())
  // Refs for imperative card DOM updates — bypasses React reconciler during animation
  const cardRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null, null])
  const sectionRef = useRef<HTMLElement>(null)

  const clearAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      clearTimeout(autoplayRef.current)
      autoplayRef.current = null
    }
  }, [])

  /** Hand every card back to its resting CSS variables. */
  const release = useCallback(() => {
    for (const el of cardRefs.current) {
      if (!el) continue
      el.style.transform = ""
      el.style.opacity = ""
      el.style.zIndex = ""
    }
  }, [])

  // Cancel any in-progress animation and let the cards rest where the order says.
  const cancelAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    animatingRef.current = false
    release()
  }, [release])

  const scheduleNextRef = useRef<() => void>(() => {})

  const startRotation = useCallback((direction: 1 | -1 = 1) => {
    if (animatingRef.current) return

    const from = orderRef.current
    const to = rotateOrder(from, direction)

    // Skip animation for prefers-reduced-motion or hidden tabs (instant swap)
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced || document.hidden) {
      orderRef.current = to
      setCardOrder(to)
      scheduleNextRef.current()
      return
    }

    const mobile = window.matchMedia(MOBILE_QUERY).matches
    const cards = mobile ? MOBILE_CARDS : DESKTOP_CARDS
    const base = mobile ? MOBILE_BASE : DESKTOP_BASE
    const lastZ = [-1, -1, -1, -1, -1]
    const start = performance.now()
    animatingRef.current = true
    for (const el of cardRefs.current) if (el) el.style.willChange = "transform, opacity"

    const tick = (now: number) => {
      const raw = Math.min(1, (now - start) / CARD_TRANSITION_MS)
      const t = ease(raw)

      // Transform and opacity only, straight onto the nodes: no React, no layout.
      for (let imageIdx = 0; imageIdx < 5; imageIdx++) {
        const el = cardRefs.current[imageIdx]
        if (!el) continue
        const p = poseOf(cards[from.indexOf(imageIdx)], cards[to.indexOf(imageIdx)], t, base)
        el.style.transform = p.transform
        el.style.opacity = String(p.opacity)
        if (p.zIndex !== lastZ[imageIdx]) {
          el.style.zIndex = String(p.zIndex)
          lastZ[imageIdx] = p.zIndex
        }
      }

      if (raw < 1) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      // Done: one React update registers the new order, and the cards go back
      // to their resting variables once it has committed (see the layout effect).
      orderRef.current = to
      setCardOrder(to)
      animatingRef.current = false
      rafRef.current = null
      scheduleNextRef.current()
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  /* The next rotation is booked when this one ends, never on a fixed clock, so
     rotations cannot queue up behind a slow frame. */
  scheduleNextRef.current = () => {
    clearAutoplay()
    if (!activeRef.current) return
    autoplayRef.current = setTimeout(() => {
      autoplayRef.current = null
      startRotation(1)
    }, AUTOPLAY_INTERVAL)
  }

  /* The new order has committed its variables: the inline motion can go. */
  useLayoutEffect(() => {
    if (animatingRef.current) return
    release()
    for (const el of cardRefs.current) if (el) el.style.willChange = ""
  }, [cardOrder, release])

  // Defer auth check — not needed for initial paint (CTA defaults to "Sign Up")
  useEffect(() => {
    const timer = setTimeout(() => {
      const supabase = createClient()

      const syncAuthState = async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        setIsAuthenticated(Boolean(user))
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("is_creator")
            .eq("id", user.id)
            .maybeSingle()
          setIsCreator(profile?.is_creator ?? false)
        }
      }

      syncAuthState()

      supabase.auth.onAuthStateChange((_event, session) => {
        setIsAuthenticated(Boolean(session?.user))
      })
    }, 100) // 100ms delay lets the main thread finish initial paint first

    return () => clearTimeout(timer)
  }, [])

  /**
   * NOTHING MOVES WHILE NOBODY IS LOOKING. Scrolled away or in a background
   * tab, the rotation stops booking itself and the section is marked paused,
   * which the stylesheet uses to pause the logo strip and the loading shimmer.
   */
  useEffect(() => {
    const el = sectionRef.current
    let onScreen = true
    const sync = () => {
      const active = onScreen && !document.hidden
      if (active === activeRef.current) return
      activeRef.current = active
      if (el) el.toggleAttribute("data-paused", !active)
      if (active) scheduleNextRef.current()
      else {
        clearAutoplay()
        if (document.hidden) cancelAnimation()
      }
    }
    const observer = el && typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync() }, { threshold: 0.1 })
      : null
    if (el) observer?.observe(el)
    document.addEventListener("visibilitychange", sync)
    scheduleNextRef.current()

    return () => {
      observer?.disconnect()
      document.removeEventListener("visibilitychange", sync)
      clearAutoplay()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [clearAutoplay, cancelAnimation])

  const markImageLoaded = useCallback((idx: number) => {
    if (loadedImageSetRef.current.has(idx)) return
    loadedImageSetRef.current.add(idx)
    setLoadedImages(new Set(loadedImageSetRef.current))
  }, [])

  /**
   * ONE DOWNLOAD PER CARD. There was a second loader here that fetched the
   * small file with `new Image()` while the <img> picked its own from the
   * srcset, which on a desktop is the large one: two files per card, and the
   * card was shown when the one it was NOT drawing had arrived. Now the <img>
   * says when it has loaded, including when it loaded before hydration and
   * `onLoad` has already been and gone.
   */
  const imgRef = useCallback((idx: number) => (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0) markImageLoaded(idx)
  }, [markImageLoaded])

  // Preload partner logos
  useEffect(() => {
    loadedLogosCount.current = 0
    const loadLogo = (src: string) => {
      return new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => {
          loadedLogosCount.current++
          if (loadedLogosCount.current === PARTNER_LOGOS.length) {
            setLogosLoaded(true)
          }
          resolve()
        }
        img.onerror = () => {
          loadedLogosCount.current++
          if (loadedLogosCount.current === PARTNER_LOGOS.length) {
            setLogosLoaded(true)
          }
          resolve()
        }
        img.src = src
      })
    }

    Promise.all(PARTNER_LOGOS.map(loadLogo))
  }, [])

  return (
    <section ref={sectionRef} className="hero-section flex flex-col items-center bg-white pt-7 sm:pt-10 pb-8 sm:pb-[67px] overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        .hero-collage-inner {
          transform: scale(0.96);
        }
        @media (min-width: 640px) {
          .hero-collage-inner { transform: scale(0.77); }
        }
        @media (min-width: 768px) {
          .hero-collage-inner { transform: scale(0.92); }
        }
        @media (min-width: 1024px) {
          .hero-collage-inner { transform: scale(1.09); }
        }
        @media (min-width: 1280px) {
          .hero-collage-inner { transform: scale(1.24); }
        }
        /* Desktop-only: scale down the entire hero section by 10% on larger
           screens. Uses CSS zoom so all child layout (widths, margins, font
           sizes) shrinks uniformly without requiring per-element overrides.
           Mobile/tablet remain untouched. */
        @media (min-width: 1024px) {
          .hero-section { zoom: 0.9; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-collage-inner, .collage-card {
            transition: none !important;
            animation: none !important;
          }
        }
        @keyframes logo-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .logo-marquee {
          animation: logo-scroll 30s linear infinite;
          backface-visibility: hidden;
        }
        /* A fixed box, placed and sized by transform alone. At rest the
           transform, opacity and layer come from the variables each card
           carries for both sets, so the server's HTML is already right on a
           phone and nothing jumps when the page hydrates. */
        .collage-card {
          position: absolute;
          left: 0;
          top: 0;
          width: ${DESKTOP_BASE}px;
          height: ${DESKTOP_BASE * 1.25}px;
          transform-origin: 0 0;
          transform: var(--hc-t);
          opacity: var(--hc-o);
          z-index: var(--hc-z);
          backface-visibility: hidden;
          contain: layout style paint;
        }
        @media ${MOBILE_QUERY} {
          .collage-card {
            width: ${MOBILE_BASE}px;
            height: ${MOBILE_BASE * 1.25}px;
            transform: var(--hc-tm);
            opacity: var(--hc-om);
            z-index: var(--hc-zm);
          }
        }
        @keyframes shimmer-gradient {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .collage-shimmer {
          background: linear-gradient(
            90deg,
            #e5e5e5 0%,
            #f0f0f0 25%,
            #e8e8e8 50%,
            #f0f0f0 75%,
            #e5e5e5 100%
          );
          background-size: 200% 100%;
          animation: shimmer-gradient 1.8s ease-in-out infinite;
        }
        .collage-shimmer-overlay {
          transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
        /* Loaded: the shimmer stops, and fades out standing still. It was
           left running under opacity 0, repainting for ever. */
        .collage-shimmer[data-done] { animation: none; }
        .hero-section[data-paused] .logo-marquee,
        .hero-section[data-paused] .collage-shimmer {
          animation-play-state: paused;
        }
      `}} />

      <div className="relative w-full mb-7 sm:mb-[42px] lg:mb-[95px] animate-scale-fade-in">
        <div className="relative w-full h-[330px] sm:h-[251px] md:h-[300px] lg:h-[360px] xl:h-[409px]">
          <div
            className="hero-collage-inner absolute left-1/2 -translate-x-1/2 origin-top select-none"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            {IMAGES.map((src, imageIdx) => {
              // During a rotation the tick writes transform and opacity onto the
              // node; at rest the card reads its slot from these variables.
              const loaded = loadedImages.has(imageIdx)
              return (
                <div
                  key={imageIdx}
                  ref={el => { cardRefs.current[imageIdx] = el }}
                  className="collage-card rounded-[14px] overflow-hidden shadow-sm shadow-black/10"
                  style={restVars(cardOrder.indexOf(imageIdx))}
                >
                  {/* Gradient shimmer overlay — sits on top of the image and
                      fades out smoothly once the image finishes loading */}
                  <div
                    className="collage-shimmer collage-shimmer-overlay absolute inset-0 z-10 rounded-[14px]"
                    data-done={loaded ? "" : undefined}
                    style={{ opacity: loaded ? 0 : 1, pointerEvents: "none" }}
                  />
                  <img
                    ref={imgRef(imageIdx)}
                    /*
                      The widths here must be the widths the optimizer
                      actually SERVES, not the ones asked for.
                      `optimizedImageUrl` doubles for retina and then snaps up
                      to a size in Next's list — so 160 CSS px becomes 320,
                      which snaps to 384, not to 320. A descriptor that claims
                      320 makes the browser choose between two files by a
                      number neither of them is. tests/product-media derives
                      both from the helper rather than trusting this comment.
                    */
                    srcSet={`${IMAGES_SM[imageIdx]} 384w, ${IMAGES_LG[imageIdx]} 640w`}
                    /*
                      The widest card, not the average one. These were 160px
                      and 280px, which is what the SIDE cards are; the centre
                      one is drawn 242px on a phone and 303px on a desktop, so
                      the browser was sizing it for a slot smaller than the one
                      it went into and the front card came out at 0.79 source
                      pixels per device pixel. Over-stating costs the side
                      cards one step up in the same srcset; under-stating costs
                      the card in the middle its sharpness.
                    */
                    sizes="(max-width: 640px) 245px, 305px"
                    src={src}
                    alt=""
                    width={DESKTOP_BASE}
                    height={DESKTOP_BASE * 1.25}
                    className="w-full h-full object-cover pointer-events-none transition-opacity duration-700 ease-out"
                    style={{ opacity: loaded ? 1 : 0 }}
                    draggable={false}
                    decoding="async"
                    /* The three a phone shows first load first; the centre one first of all. */
                    loading={imageIdx === 0 || imageIdx === 4 ? "lazy" : "eager"}
                    fetchPriority={imageIdx === 2 ? "high" : imageIdx === 0 || imageIdx === 4 ? "low" : "auto"}
                    onLoad={() => markImageLoaded(imageIdx)}
                    onError={() => markImageLoaded(imageIdx)}
                  />
                </div>
              )
            })}
          </div>

          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none -translate-y-[7%] sm:translate-y-0">
            <div className="relative bg-white rounded-[24px] sm:rounded-[28px] shadow-lg shadow-neutral-200/50 border border-neutral-100/80 px-5 sm:px-10 md:px-14 md:pt-14 md:pb-12 w-[82%] max-w-[480px] text-center pointer-events-auto scale-y-[0.99] sm:scale-y-100 origin-top pt-9 pb-9 sm:pt-12 sm:pb-10">
              <>
                <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 sm:-top-4">
                  <div className="flex items-center gap-2 bg-gray-100 text-gray-700 text-[10px] sm:text-[11px] font-medium px-3 sm:px-3.5 py-1.5 rounded-full whitespace-nowrap shadow-sm border border-gray-200/50">
                    <span className="w-4 h-4 sm:w-[18px] sm:h-[18px] rounded-full bg-gray-200 inline-flex items-center justify-center">
                      <svg viewBox="0 0 16 16" fill="none" className="w-[9px] h-[9px] sm:w-[10px] sm:h-[10px]">
                        <path d="M8.5 1L3 9.5h4.5L7 15l6-8.5H8.5L9 1h-.5z" fill="#7c3aed" stroke="#7c3aed" strokeWidth="0.5" strokeLinejoin="round" />
                      </svg>
                    </span>
                    All-in-one
                  </div>
                </div>
                <h1 className="text-[22px] sm:text-3xl md:text-[38px] md:leading-[1.2] font-bold text-neutral-900 leading-tight min-h-[2.5em] sm:min-h-[2.4em] flex items-center justify-center">
                  <span>
                    <TypingHeadline />
                    <span className="inline-block w-[3px] h-[0.85em] bg-violet-500 ml-0.5 animate-pulse align-middle rounded-full" />
                  </span>
                </h1>
              </>
            </div>
          </div>
        </div>
      </div>

      {/*
        THE SAME CORNER AS THE HEADER'S LOG IN BUTTON, NOT A PILL. The owner
        asked for these two to match the header's buttons, so they take the
        shared `rounded-action` token (app/globals.css) rather than a radius
        of their own. They stay where they were, above the line of copy.
      */}
      <div data-hero-actions="" className="flex flex-row items-center gap-2.5 sm:gap-3 mb-5 sm:mb-[32px] animate-fade-in-up delay-200">
        <Link
          href="/explore"
          className="inline-flex items-center px-6 sm:px-7 py-2.5 sm:py-3 rounded-action text-sm font-semibold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          Discover
        </Link>
        <Link
          href={isAuthenticated ? (isCreator ? "/app" : "/account/library") : "/signup"}
          className="inline-flex items-center gap-2 px-6 sm:px-7 py-2.5 sm:py-3 rounded-action text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
        >
          {isAuthenticated ? (isCreator ? "Dashboard" : "Library") : "Sign Up"}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </Link>
      </div>

      <p className="text-[16px] sm:text-[19.5px] text-neutral-600 text-center mb-[86px] sm:mb-[127px] max-w-[90%] sm:max-w-[590px] leading-relaxed px-4 mx-auto animate-fade-in-up delay-300">
        The #1 e-commerce platform for creators & entrepreneurs. Sell products, manage links & grow an audience.
      </p>

      <div className="relative w-full animate-fade-in delay-500">
        <div className="absolute left-0 top-0 bottom-0 w-20 sm:w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 sm:w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
        <div className="overflow-hidden">
          {!logosLoaded ? (
            <div className="flex items-center justify-center gap-6 sm:gap-8 md:gap-10 py-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-[20px] sm:h-5 md:h-6 w-[69px] sm:w-[80px] md:w-[100px] rounded bg-gray-200/60 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="logo-marquee flex items-center w-max">
              {[...PARTNER_LOGOS, ...PARTNER_LOGOS, ...PARTNER_LOGOS].map((src, i) => {
                const isStripe = src.includes("bbfcc0e04437442a9637cc58efde849dfadb313c")
                const isAnthropic = src.includes("a9bfb23cca986ee16b0547274bcd7461ffd373aa")
                const isAtlassian = src.includes("01d4ea19e824b3596f8f6c701d3b8319e49631b0")
                const isPopj = src.includes("popj.svg")
                const isNewLogo = src.includes("eyJidWNrZXQiOiJwYXJ0bmVycGFnZS5wcm9k")
                const heightClass = isStripe
                  ? "h-[41px] sm:h-[43px] md:h-[51px]"
                  : isAnthropic
                    ? "h-[21px] sm:h-[21px] md:h-[26px]"
                    : isAtlassian
                      ? "h-[17px] sm:h-[18px] md:h-[22px]"
                      : isPopj
                        ? "h-[35px] sm:h-[36px] md:h-[43px]"
                        : isNewLogo
                          ? "h-[25px] sm:h-[26px] md:h-[31px]"
                          : "h-[20px] sm:h-5 md:h-6"
                return (
                  <img
                    key={i}
                    src={src}
                    alt="Partner logo"
                    className={`w-auto mx-6 sm:mx-8 md:mx-10 opacity-95 grayscale select-none ${heightClass}`}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    width={100}
                    height={40}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
