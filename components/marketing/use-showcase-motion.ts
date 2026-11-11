"use client"

import { useEffect, type RefObject } from "react"

/** Mouse drag/inertia share native scrollLeft with touch and trackpads. No snap
 * points compete with the pointer, and no React state updates run per frame. */
export function useShowcaseMotion(
  ref: RefObject<HTMLDivElement | null>,
  count: number,
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = matchMedia("(prefers-reduced-motion: reduce)")
    let period = 0,
      step = 0,
      position = 0,
      frame = 0,
      lastFrame = 0,
      velocity = 0
    let visible = true,
      hovered = false,
      touching = false,
      paused = false,
      ownUntil = 0,
      resumeAt = 0
    let idle: ReturnType<typeof setTimeout> | undefined
    let drag: {
      id: number
      x: number
      left: number
      samples: { x: number; t: number }[]
    } | null = null
    const normalize = () => {
      if (!period || touching) return
      let shift = 0
      while (position < period) {
        position += period
        shift += period
      }
      while (position >= period * 2) {
        position -= period
        shift -= period
      }
      if (drag) drag.left += shift
      if (shift) {
        ownUntil = performance.now() + 60
        el.scrollLeft = position
      }
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
      velocity = 0
      lastFrame = 0
    }
    const measure = () => {
      stop()
      const old = period,
        first = el.querySelector<HTMLElement>("[data-showcase-slide]")
      step = first
        ? first.getBoundingClientRect().width +
          parseFloat(getComputedStyle(el).columnGap)
        : 0
      period = step * count
      position = old ? period + ((el.scrollLeft % old) / old) * period : period
      ownUntil = performance.now() + 60
      el.scrollLeft = position
      if (drag) {
        drag = null
        delete el.dataset.dragging
      }
    }
    const write = () => {
      normalize()
      ownUntil = performance.now() + 60
      el.scrollLeft = position
    }
    const tick = (now: number) => {
      frame = 0
      const dt = lastFrame ? Math.min(32, now - lastFrame) : 16
      lastFrame = now
      if (!drag) {
        const decay = Math.exp(-dt / 310)
        position += velocity * 310 * (1 - decay)
        velocity *= decay
      }
      write()
      if (!drag && Math.abs(velocity) > 0.018)
        frame = requestAnimationFrame(tick)
      else lastFrame = 0
    }
    const interact = () => {
      resumeAt = performance.now() + 8000
    }
    const end = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        touching = false
        interact()
        return
      }
      if (!drag || event.pointerId !== drag.id) return
      const d = drag
      drag = null
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
        write()
      }
      delete el.dataset.dragging
      if (el.hasPointerCapture(event.pointerId))
        el.releasePointerCapture(event.pointerId)
      const samples = d.samples,
        last = samples[samples.length - 1],
        first = samples.find((s) => s.t >= last.t - 85) || samples[0]
      velocity =
        event.type === "pointerup" &&
        !reduce.matches &&
        event.timeStamp - last.t < 100
          ? Math.max(
              -2.5,
              Math.min(
                2.5,
                -(last.x - first.x) / Math.max(16, last.t - first.t),
              ),
            )
          : 0
      lastFrame = 0
      if (Math.abs(velocity) > 0.018) frame = requestAnimationFrame(tick)
      else normalize()
      interact()
    }
    const down = (event: PointerEvent) => {
      interact()
      stop()
      if (event.pointerType !== "mouse") {
        touching = true
        return
      }
      if (event.button !== 0) return
      event.preventDefault()
      position = el.scrollLeft
      normalize()
      drag = {
        id: event.pointerId,
        x: event.clientX,
        left: position,
        samples: [{ x: event.clientX, t: event.timeStamp }],
      }
      el.dataset.dragging = "true"
      el.setPointerCapture(event.pointerId)
    }
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      if (!(event.buttons & 1)) {
        end(event)
        return
      }
      event.preventDefault()
      position = drag.left - (event.clientX - drag.x)
      drag.samples.push({ x: event.clientX, t: event.timeStamp })
      if (drag.samples.length > 12) drag.samples.shift()
      if (!frame) frame = requestAnimationFrame(tick)
    }
    const lost = () => {
      if (drag) {
        drag = null
        stop()
        delete el.dataset.dragging
      }
    }
    const scroll = () => {
      if (!drag && !frame && performance.now() > ownUntil)
        position = el.scrollLeft
      clearTimeout(idle)
      idle = setTimeout(() => {
        if (!drag && !frame && !touching) {
          position = el.scrollLeft
          normalize()
        }
      }, 180)
    }
    const wheel = () => {
      stop()
      interact()
      position = el.scrollLeft
    }
    const enter = (event: PointerEvent) => {
      if (event.pointerType === "mouse") hovered = true
    }
    const leave = () => {
      hovered = false
    }
    const key = (event: KeyboardEvent) => {
      interact()
      stop()
      if (event.key === " ") {
        event.preventDefault()
        paused = !paused
        el.dataset.autoplayPaused = String(paused)
      }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault()
        position = el.scrollLeft
        normalize()
        el.scrollTo({
          left: position + (event.key === "ArrowRight" ? step : -step),
          behavior: reduce.matches ? "auto" : "smooth",
        })
      }
    }
    const suspend = () => {
      lost()
      stop()
      touching = false
    }
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting
              if (!visible) suspend()
            },
            { threshold: 0.1 },
          )
        : null
    observer?.observe(el)
    const resize =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null
    resize?.observe(el)
    const timer = setInterval(() => {
      if (
        !visible ||
        hovered ||
        paused ||
        touching ||
        drag ||
        frame ||
        document.hidden ||
        reduce.matches ||
        el.matches(":focus-within") ||
        performance.now() < resumeAt
      )
        return
      position = el.scrollLeft
      normalize()
      el.scrollTo({ left: position + step, behavior: "smooth" })
    }, 4000)
    measure()
    el.addEventListener("pointerdown", down)
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", end)
    el.addEventListener("pointercancel", end)
    el.addEventListener("lostpointercapture", lost)
    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointerleave", leave)
    el.addEventListener("scroll", scroll, { passive: true })
    el.addEventListener("wheel", wheel, { passive: true })
    el.addEventListener("keydown", key)
    window.addEventListener("blur", suspend)
    document.addEventListener("visibilitychange", suspend)
    reduce.addEventListener("change", suspend)
    if (!resize) window.addEventListener("resize", measure)
    return () => {
      stop()
      clearTimeout(idle)
      clearInterval(timer)
      resize?.disconnect()
      observer?.disconnect()
      el.removeEventListener("pointerdown", down)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", end)
      el.removeEventListener("pointercancel", end)
      el.removeEventListener("lostpointercapture", lost)
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointerleave", leave)
      el.removeEventListener("scroll", scroll)
      el.removeEventListener("wheel", wheel)
      el.removeEventListener("keydown", key)
      window.removeEventListener("blur", suspend)
      document.removeEventListener("visibilitychange", suspend)
      reduce.removeEventListener("change", suspend)
      window.removeEventListener("resize", measure)
    }
  }, [ref, count])
}
