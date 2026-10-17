/**
 * ===========================================================================
 *  STORELIB REVIEWS WIDGETS: THE LITTLE SCRIPT THEY CAN DO WITHOUT
 * ===========================================================================
 * Everything a widget shows works without this (./render.ts): a carousel is
 * a row that scrolls and snaps, by swipe, trackpad, scrollbar or the arrow
 * keys once it has focus. This adds its Previous and Next buttons (hidden
 * until it runs, `data-slw-ready`) and, when the widget is set to, moves it
 * on by itself: never for somebody who asked for less motion, and never
 * while a pointer is over it, it has focus, or the tab is in the background.
 *
 * SELF CONTAINED ON PURPOSE. No imports and no closures over the module, so
 * an imported theme can carry it as an inline script
 * (`reviewWidgetScript()`), and the Storelib theme's section and the gallery
 * call the same function. Idempotent: a carousel already set up is skipped.
 * Returns what undoes it.
 */
export function enhanceReviewWidgets(root: ParentNode): () => void {
  const undo: (() => void)[] = []
  const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  root.querySelectorAll<HTMLElement>("[data-slw-carousel]").forEach((car) => {
    if (car.hasAttribute("data-slw-ready")) return
    const track = car.querySelector<HTMLElement>(".slw-track")
    const prev = car.querySelector<HTMLButtonElement>("[data-slw-prev]")
    const next = car.querySelector<HTMLButtonElement>("[data-slw-next]")
    if (!track || !prev || !next) return
    car.setAttribute("data-slw-ready", "")
    const step = () => {
      const first = track.firstElementChild as HTMLElement | null
      const gap = parseFloat(getComputedStyle(track).columnGap || "0") || 0
      return first ? first.getBoundingClientRect().width + gap : track.clientWidth
    }
    const atEnd = () => track.scrollLeft + track.clientWidth >= track.scrollWidth - 4
    const sync = () => {
      prev.disabled = track.scrollLeft <= 4
      next.disabled = atEnd()
    }
    const go = (dir: number) => track.scrollBy({ left: dir * step(), behavior: calm ? "auto" : "smooth" })
    const onPrev = () => go(-1)
    const onNext = () => go(1)
    prev.addEventListener("click", onPrev)
    next.addEventListener("click", onNext)
    track.addEventListener("scroll", sync, { passive: true })
    sync()
    let timer: ReturnType<typeof setInterval> | null = null
    let held = false
    const seconds = Number(car.getAttribute("data-autoplay")) || 0
    const tick = () => {
      if (held || (typeof document !== "undefined" && document.hidden)) return
      if (atEnd()) track.scrollTo({ left: 0, behavior: calm ? "auto" : "smooth" })
      else go(1)
    }
    const hold = () => { held = true }
    const free = () => { held = false }
    if (seconds > 0 && !calm) {
      timer = setInterval(tick, Math.max(3, Math.min(15, seconds)) * 1000)
      car.addEventListener("pointerenter", hold)
      car.addEventListener("pointerleave", free)
      car.addEventListener("focusin", hold)
      car.addEventListener("focusout", free)
      car.addEventListener("touchstart", hold, { passive: true })
    }
    undo.push(() => {
      prev.removeEventListener("click", onPrev)
      next.removeEventListener("click", onNext)
      track.removeEventListener("scroll", sync)
      car.removeEventListener("pointerenter", hold)
      car.removeEventListener("pointerleave", free)
      car.removeEventListener("focusin", hold)
      car.removeEventListener("focusout", free)
      car.removeEventListener("touchstart", hold)
      if (timer) clearInterval(timer)
      car.removeAttribute("data-slw-ready")
    })
  })
  return () => undo.forEach((f) => f())
}

/**
 * The same, as a script an imported theme's page runs once where the widget
 * is: it sets up the widget it sits in.
 */
export function reviewWidgetScript(): string {
  /* `__name`: a bundler that keeps function names (esbuild's keepNames) wraps them in a helper the inline copy would not have. */
  return `<script>(function(){var __name=function(f){return f};var s=document.currentScript;var r=s&&s.parentElement;if(!r)return;try{(${enhanceReviewWidgets.toString()})(r)}catch(e){}})()</script>`
}
