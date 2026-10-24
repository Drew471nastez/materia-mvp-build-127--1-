"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import { HERO_SLIDES, HERO_SLIDE_RATIO, type HeroImage } from "@/lib/marketing/hero-media"
import { AUTOPLAY_MS, DRAG_THRESHOLD_PX, GLIDE_MS, MOMENTUM_MS, STEP_NEAR, slidePose, wrap } from "@/lib/marketing/hero-slider"

/**
 * The slider of Storelib screens under the hero's heading: the centre one large
 * and flat, its neighbours smaller and turned toward it, cut by the panel.
 *
 * ONE NUMBER DRIVES IT. `pos` is the index of the slide in the centre, as a
 * fraction while it moves. Every slide's transform is a function of its
 * distance from `pos`, written straight onto the node in a frame callback, so
 * a drag, a snap and the autoplay are the same code and React renders the
 * slider once. Only transform and opacity change; each slide is its own layer.
 *
 * The distance across is in units of the slide's width (`--hc-w`, set in CSS
 * per breakpoint), so the server's HTML is already in place at every width
 * and nothing is measured to draw a frame. A drag measures the width once,
 * when it starts.
 *
 * It stops while nobody can see it (scrolled away, tab hidden), while a mouse
 * is over it, while a finger or pointer holds it, and does not autoplay under
 * reduced motion.
 */

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export function HeroCarousel({ slides = HERO_SLIDES }: { slides?: HeroImage[] }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const n = slides.length

  useEffect(() => {
    const root = rootRef.current
    if (!root || n === 0) return
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")

    let pos = 0
    let raf: number | null = null
    let tween: { from: number; to: number; start: number; ms: number; ease: (t: number) => number } | null = null
    let autoplay: ReturnType<typeof setTimeout> | null = null
    let onScreen = true
    let hovering = false
    let drag: { id: number; x0: number; pos0: number; stepPx: number; moved: boolean; samples: { x: number; t: number }[] } | null = null
    let suppressClick = false
    const lastZ: number[] = []

    const paint = () => {
      for (let i = 0; i < n; i++) {
        const el = slideRefs.current[i]
        if (!el) continue
        const p = slidePose(wrap(i - pos, n))
        el.style.transform = p.transform
        el.style.opacity = String(p.opacity)
        if (lastZ[i] !== p.zIndex) { el.style.zIndex = String(p.zIndex); lastZ[i] = p.zIndex }
      }
    }
    const centre = () => ((Math.round(pos) % n) + n) % n
    const markCentre = () => {
      const c = centre()
      for (let i = 0; i < n; i++) slideRefs.current[i]?.toggleAttribute("data-centre", i === c)
    }

    const frame = (now: number) => {
      raf = null
      if (tween) {
        const t = tween.ms <= 0 ? 1 : Math.min(1, (now - tween.start) / tween.ms)
        pos = tween.from + (tween.to - tween.from) * tween.ease(t)
        if (t >= 1) {
          pos = tween.to
          tween = null
          root.removeAttribute("data-moving")
          markCentre()
          scheduleAutoplay()
        }
      }
      paint()
      if (tween) raf = requestAnimationFrame(frame)
    }
    const requestFrame = () => { if (raf === null) raf = requestAnimationFrame(frame) }

    const glideTo = (to: number, ms: number, ease = easeInOut) => {
      clearAutoplay()
      tween = { from: pos, to, start: performance.now(), ms: reduced?.matches ? 0 : ms, ease }
      root.setAttribute("data-moving", "")
      requestFrame()
    }

    const active = () => onScreen && document.visibilityState !== "hidden" && !hovering && !drag && !reduced?.matches
    const clearAutoplay = () => { if (autoplay) { clearTimeout(autoplay); autoplay = null } }
    const scheduleAutoplay = () => {
      clearAutoplay()
      if (!active() || tween) return
      autoplay = setTimeout(() => {
        autoplay = null
        if (active()) glideTo(Math.round(pos) + 1, GLIDE_MS)
      }, AUTOPLAY_MS)
    }
    const sync = () => {
      root.toggleAttribute("data-paused", !(onScreen && document.visibilityState !== "hidden"))
      if (active()) { if (!autoplay && !tween) scheduleAutoplay() }
      else clearAutoplay()
    }

    /* ── Pointer and touch ─────────────────────────────────────────── */
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      const first = slideRefs.current[0]
      const stepPx = (first?.offsetWidth || root.offsetWidth * 0.5) * STEP_NEAR
      tween = null
      clearAutoplay()
      drag = { id: e.pointerId, x0: e.clientX, pos0: pos, stepPx, moved: false, samples: [{ x: e.clientX, t: e.timeStamp }] }
      suppressClick = false
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x0
      if (!drag.moved && Math.abs(dx) > DRAG_THRESHOLD_PX) {
        drag.moved = true
        try { root.setPointerCapture(e.pointerId) } catch { /* already released */ }
        root.setAttribute("data-dragging", "")
        root.setAttribute("data-moving", "")
      }
      if (!drag.moved) return
      pos = drag.pos0 - dx / drag.stepPx
      drag.samples.push({ x: e.clientX, t: e.timeStamp })
      if (drag.samples.length > 6) drag.samples.shift()
      requestFrame()
    }
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const d = drag
      drag = null
      root.removeAttribute("data-dragging")
      if (!d.moved) {
        /* A tap that stopped a glide finishes it rather than leaving a slide half way. */
        if (pos !== Math.round(pos)) glideTo(Math.round(pos), 360, easeOut)
        else scheduleAutoplay()
        return
      }
      suppressClick = true
      const s = d.samples
      const a = s[0]
      const b = s[s.length - 1]
      const dt = Math.max(1, b.t - a.t)
      /* Speed in slides per ms; a pointer that stopped before letting go has none. */
      const recent = e.timeStamp - b.t < 80
      const v = recent ? -((b.x - a.x) / dt) / d.stepPx : 0
      let target = Math.round(pos + v * MOMENTUM_MS)
      target = Math.max(Math.round(pos) - 2, Math.min(Math.round(pos) + 2, target))
      const dist = Math.abs(target - pos)
      glideTo(target, Math.min(900, 320 + dist * 260), easeOut)
    }
    const onClick = (e: MouseEvent) => {
      if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; return }
      const slide = (e.target as HTMLElement).closest<HTMLElement>("[data-hero-slide]")
      if (!slide) return
      const i = Number(slide.dataset.heroSlide)
      const d = wrap(i - pos, n)
      if (Math.abs(d) > 0.5) {
        e.preventDefault()
        glideTo(pos + d, GLIDE_MS)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
      e.preventDefault()
      glideTo(Math.round(pos) + (e.key === "ArrowRight" ? 1 : -1), GLIDE_MS)
    }
    const onEnter = (e: PointerEvent) => { if (e.pointerType === "mouse") { hovering = true; sync() } }
    const onLeave = (e: PointerEvent) => { if (e.pointerType === "mouse") { hovering = false; sync() } }

    root.addEventListener("pointerdown", onDown)
    root.addEventListener("pointermove", onMove)
    root.addEventListener("pointerup", onUp)
    root.addEventListener("pointercancel", onUp)
    root.addEventListener("click", onClick, true)
    root.addEventListener("keydown", onKey)
    root.addEventListener("pointerenter", onEnter)
    root.addEventListener("pointerleave", onLeave)
    const noDrag = (e: Event) => e.preventDefault()
    root.addEventListener("dragstart", noDrag)

    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync() })
      : null
    io?.observe(root)
    document.addEventListener("visibilitychange", sync)
    reduced?.addEventListener?.("change", sync)
    markCentre()
    sync()

    return () => {
      clearAutoplay()
      if (raf !== null) cancelAnimationFrame(raf)
      io?.disconnect()
      document.removeEventListener("visibilitychange", sync)
      reduced?.removeEventListener?.("change", sync)
      root.removeEventListener("pointerdown", onDown)
      root.removeEventListener("pointermove", onMove)
      root.removeEventListener("pointerup", onUp)
      root.removeEventListener("pointercancel", onUp)
      root.removeEventListener("click", onClick, true)
      root.removeEventListener("keydown", onKey)
      root.removeEventListener("pointerenter", onEnter)
      root.removeEventListener("pointerleave", onLeave)
      root.removeEventListener("dragstart", noDrag)
    }
  }, [n])

  return (
    <div
      ref={rootRef}
      data-hero-carousel=""
      role="region"
      aria-roledescription="carousel"
      aria-label="Storelib screens"
      tabIndex={0}
      className="hero-stage relative w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset"
      style={{ ["--hc-ratio" as string]: HERO_SLIDE_RATIO }}
    >
      {slides.map((slide, i) => {
        const p = slidePose(wrap(i, n))
        const body = slide.src ? (
          <Image
            src={slide.src}
            alt={slide.alt}
            fill
            sizes="(max-width: 639px) 78vw, (max-width: 1023px) 56vw, 680px"
            priority={i === 0}
            loading={i === 0 ? undefined : "lazy"}
            draggable={false}
            className="object-cover object-top"
          />
        ) : (
          <SlidePlaceholder label={slide.alt} />
        )
        return (
          <div
            key={i}
            ref={(el) => { slideRefs.current[i] = el }}
            data-hero-slide={i}
            data-centre={i === 0 ? "" : undefined}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}`}
            className="hero-slide"
            style={{ transform: p.transform, opacity: p.opacity, zIndex: p.zIndex }}
          >
            {slide.href ? (
              <a href={slide.href} draggable={false} className="block size-full">{body}</a>
            ) : body}
          </div>
        )
      })}
    </div>
  )
}

/** A storefront's outline in two greys until the real screenshot is in the config. */
function SlidePlaceholder({ label }: { label: string }) {
  return (
    <div role="img" aria-label={label} className="hero-shimmer relative size-full bg-[#eceef1]">
      <div className="absolute inset-x-0 top-0 h-[9%] border-b border-black/[0.06] bg-[#f6f7f9]" />
      <div className="absolute left-[5%] top-[16%] h-[76%] w-[44%] rounded-[6px] bg-[#dfe2e7]" />
      <div className="absolute left-[54%] top-[18%] h-[6%] w-[34%] rounded-[4px] bg-[#dfe2e7]" />
      <div className="absolute left-[54%] top-[29%] h-[4%] w-[22%] rounded-[4px] bg-[#e4e6ea]" />
      <div className="absolute left-[54%] top-[40%] h-[3%] w-[38%] rounded-[4px] bg-[#e4e6ea]" />
      <div className="absolute left-[54%] top-[46%] h-[3%] w-[32%] rounded-[4px] bg-[#e4e6ea]" />
      <div className="absolute left-[54%] top-[76%] h-[8%] w-[40%] rounded-[6px] bg-[#d6d9df]" />
    </div>
  )
}
