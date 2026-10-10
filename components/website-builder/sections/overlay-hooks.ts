"use client"

/**
 * ===========================================================================
 *  WHAT A FLOATING SECTION NEEDS FROM THE PAGE
 * ===========================================================================
 * The Overlay group's sections (back to top, a popup) depend on things a
 * section's own script cannot do from its sandbox: the page's scroll, and
 * remembering a visitor. A section asks for them with attributes, and the
 * page does them:
 *
 *   data-storelib-back-to-top      shown (`data-shown`) once the page is
 *                                  scrolled past `data-after` pixels; a
 *                                  press goes to the top
 *   data-storelib-popup            opened (`data-open`) after `data-delay`
 *                                  seconds; `data-once="0"` opens it on
 *                                  every visit, otherwise once per visitor
 *   data-storelib-popup-close      closes it, as Escape does
 *   data-storelib-bottom-bar       a bar fixed to the bottom of the screen:
 *                                  its height is published on the page as
 *                                  --sl-bottom-bar-h (0 while it is hidden),
 *                                  so back to top and a popup sit above it
 *
 * In the builder the page is the canvas: back to top is always shown and a
 * popup is drawn open (its template writes `data-open` there), so both can
 * be designed where they are.
 */
import { useEffect } from "react"

export function useOverlayHooks(root: HTMLElement | null, opts: { sectionId: string; inCanvas: boolean; html: string }) {
  const { sectionId, inCanvas, html } = opts
  useEffect(() => {
    if (!root) return
    const undo: (() => void)[] = []
    const scroller: HTMLElement | Window = (inCanvas ? document.getElementById("wb-preview-root") : null) ?? window
    const top = () => (scroller === window ? window.scrollY : (scroller as HTMLElement).scrollTop)
    const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

    root.querySelectorAll<HTMLElement>("[data-storelib-back-to-top]").forEach((button) => {
      const after = Number(button.dataset.after ?? 400) || 0
      const update = () => button.toggleAttribute("data-shown", inCanvas || top() > after)
      update()
      scroller.addEventListener("scroll", update, { passive: true })
      const press = (e: Event) => {
        e.preventDefault()
        scroller.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" })
      }
      button.addEventListener("click", press)
      undo.push(() => {
        scroller.removeEventListener("scroll", update)
        button.removeEventListener("click", press)
      })
    })

    /* Measured once, by the bar itself, and read by everything that floats above it. */
    if (!inCanvas) root.querySelectorAll<HTMLElement>("[data-storelib-bottom-bar]").forEach((bar) => {
      const page = document.documentElement
      const publish = () => page.style.setProperty("--sl-bottom-bar-h", `${bar.offsetHeight}px`)
      publish()
      const watch = typeof ResizeObserver === "function" ? new ResizeObserver(publish) : null
      watch?.observe(bar)
      window.addEventListener("resize", publish)
      undo.push(() => {
        watch?.disconnect()
        window.removeEventListener("resize", publish)
        page.style.removeProperty("--sl-bottom-bar-h")
      })
    })

    root.querySelectorAll<HTMLElement>("[data-storelib-popup]").forEach((popup) => {
      const key = `storelib:popup:${sectionId}`
      const once = popup.dataset.once !== "0"
      const close = (e?: Event) => {
        e?.preventDefault()
        /* In the builder a press on the close button selects the popup; it stays open to be edited. */
        if (inCanvas) return
        popup.removeAttribute("data-open")
        if (!inCanvas && once) {
          try { localStorage.setItem(key, "1") } catch { /* private mode: it may open again next visit */ }
        }
      }
      popup.querySelectorAll<HTMLElement>("[data-storelib-popup-close]").forEach((el) => {
        el.addEventListener("click", close)
        undo.push(() => el.removeEventListener("click", close))
      })
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && popup.hasAttribute("data-open")) close() }
      document.addEventListener("keydown", onKey)
      undo.push(() => document.removeEventListener("keydown", onKey))
      if (inCanvas) {
        popup.setAttribute("data-open", "")
        return
      }
      let seen = false
      try { seen = once && localStorage.getItem(key) === "1" } catch { seen = false }
      if (seen) return
      const delay = Math.max(0, Math.min(120, Number(popup.dataset.delay ?? 5) || 0)) * 1000
      const timer = window.setTimeout(() => popup.setAttribute("data-open", ""), delay)
      undo.push(() => window.clearTimeout(timer))
    })

    return () => undo.forEach((f) => f())
  }, [root, sectionId, inCanvas, html])
}
