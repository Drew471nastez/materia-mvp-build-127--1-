"use client"

/**
 * ===========================================================================
 *  THE PART OF THE SCREEN THAT CAN BE SEEN, FOLLOWED (round 15)
 * ===========================================================================
 * One hook for the two comment boxes that sit on the keyboard: the opened
 * post's page (post-fullscreen.tsx, its box is this) and the post page's dock
 * (comments.tsx dockComposer, its foot is this box's foot). The numbers are
 * post-motion.ts postBox: the visual viewport where the platform reports the
 * keyboard, the iPhone's own keyboard in the iOS app where WKWebView does
 * not, the published floor otherwise. Applied before the first frame and
 * again on every viewport move, keyboard report, focus and blur; written to
 * the element by `apply`, never through React.
 */
import { useLayoutEffect } from "react"
import { KEYBOARD_CHANGE_EVENT } from "@/lib/ui/keyboard-safe-sheet"
import { iosKeyboardFor, postBox, type PostBox } from "./post-motion"

const TEXT_INPUT = /^(text|search|url|tel|email|password|number)$/
export function takesKeyboard(el: Element | null): boolean {
  const h = el as HTMLElement | null
  if (!h) return false
  if (h.isContentEditable || h.tagName === "TEXTAREA") return true
  return h.tagName === "INPUT" && TEXT_INPUT.test(((h as HTMLInputElement).type || "text").toLowerCase())
}

/** The iOS app (not Android's): the one place the keyboard's height has to come from the table. */
export function iosApp(): boolean {
  if (typeof document === "undefined" || !document.documentElement.classList.contains("capacitor")) return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

/** The fixed box's height: a fixed element's own, which is what fixed elements are laid out against (innerHeight is not, on iOS). */
function layoutHeight(probe: HTMLElement | null): number {
  return probe?.offsetHeight || window.innerHeight
}

/**
 * Follow the visible box while `active`. `scope` holds the fields that count
 * as typing here (a field elsewhere on the page does not move this box);
 * `probe` is any fixed element as tall as the screen (inset-0), or null.
 */
export function useVisibleBox(active: boolean, scope: () => Element | null, probe: () => HTMLElement | null, apply: (box: PostBox, typing: boolean, layoutH: number) => void): void {
  useLayoutEffect(() => {
    if (!active) return
    const app = iosApp()
    let last = ""
    const run = () => {
      const vv = window.visualViewport
      const layoutH = layoutHeight(probe())
      const where = scope()
      const typing = takesKeyboard(document.activeElement) && !!where?.contains(document.activeElement)
      const published = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb-inset")) || 0
      const box = postBox({
        layoutH,
        innerH: window.innerHeight,
        vvTop: Math.round(vv?.offsetTop ?? 0),
        vvH: Math.round(vv?.height ?? window.innerHeight),
        typing,
        publishedInset: published,
        appKeyboard: app && typing ? iosKeyboardFor(window.innerWidth, layoutH) : null,
      })
      const key = `${box.top}|${box.height}|${box.aboveTabs}|${typing}|${layoutH}`
      if (key === last) return
      last = key
      apply(box, typing, layoutH)
    }
    run()
    let raf = 0
    const soon = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(run)
    }
    /* The keyboard going down is reported late on iOS: looked at again as it goes. */
    const timers: number[] = []
    const onFocusOut = () => {
      soon()
      timers.push(window.setTimeout(run, 80), window.setTimeout(run, 260))
    }
    const vv = window.visualViewport
    vv?.addEventListener("resize", run)
    vv?.addEventListener("scroll", run)
    window.addEventListener("resize", run)
    window.addEventListener(KEYBOARD_CHANGE_EVENT, run)
    document.addEventListener("focusin", soon)
    document.addEventListener("focusout", onFocusOut)
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach((t) => window.clearTimeout(t))
      vv?.removeEventListener("resize", run)
      vv?.removeEventListener("scroll", run)
      window.removeEventListener("resize", run)
      window.removeEventListener(KEYBOARD_CHANGE_EVENT, run)
      document.removeEventListener("focusin", soon)
      document.removeEventListener("focusout", onFocusOut)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
