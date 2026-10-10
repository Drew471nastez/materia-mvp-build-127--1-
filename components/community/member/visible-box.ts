"use client"

/**
 * ===========================================================================
 *  THE COMMENT BOX ON THE KEYBOARD, FOLLOWED (rounds 15, 16 and 17)
 * ===========================================================================
 * One hook for the two comment boxes that sit on the keyboard: the opened
 * post's (post-fullscreen.tsx) and the post page's dock (comments.tsx
 * dockComposer). It reads the facts, picks the row of the decision table
 * (keyboard-plan.ts) and hands the plan to `apply`, which writes it to the
 * element, never through React.
 *
 * ROUND 17. Round 16 placed the PAGE (shortened to the keyboard) and read
 * the box's place one frame after a focus. In the iOS app that frame was
 * too late: iOS reads where the focused field is as it brings the keyboard
 * up, found the box under where the keys would be, and panned the page up
 * by the difference, on top of the box already being lifted by the table's
 * keyboard height (the gap in 76.jpg). Now, in the app, the plan is applied
 * IN the focus (focusin, synchronously, and laid out at once), so the box
 * is already on the keys when iOS looks and there is nothing to pan for.
 * And the page is never shortened: only the room at its foot changes
 * (keyboard-plan.ts says why).
 */
import { useLayoutEffect } from "react"
import { KEYBOARD_CHANGE_EVENT } from "@/lib/ui/keyboard-safe-sheet"
import { iosKeyboardFor } from "./post-motion"
import { keyboardEnv, keyboardPlan, type KeyboardEnv, type KeyboardFacts, type KeyboardPlan } from "./keyboard-plan"
import { holdNativeScroll, nativeKeyboardAvailable, nativeKeyboardHeight, watchNativeKeyboard } from "./native-keyboard"

/** What a plan was worked out from, for the readout (post-fullscreen.tsx). */
export interface BoxFacts extends KeyboardFacts {
  env: KeyboardEnv
  scrollY: number
}

const TEXT_INPUT = /^(text|search|url|tel|email|password|number)$/
export function takesKeyboard(el: Element | null): boolean {
  const h = el as HTMLElement | null
  if (!h) return false
  if (h.isContentEditable || h.tagName === "TEXTAREA") return true
  return h.tagName === "INPUT" && TEXT_INPUT.test(((h as HTMLInputElement).type || "text").toLowerCase())
}

/** The iOS app (not Android's). */
export function iosApp(): boolean {
  if (typeof document === "undefined" || !document.documentElement.classList.contains("capacitor")) return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

/** This phone's row of the table. */
export function currentKeyboardEnv(): KeyboardEnv {
  if (typeof window === "undefined") return "computer"
  return keyboardEnv({
    ua: navigator.userAgent,
    capacitor: document.documentElement.classList.contains("capacitor"),
    plugin: nativeKeyboardAvailable(),
    coarse: !!window.matchMedia?.("(hover: none) and (pointer: coarse)").matches,
  })
}

/** The fixed box's height: a fixed element's own, which is what fixed elements are laid out against (innerHeight is not, on iOS). */
function layoutHeight(probe: HTMLElement | null): number {
  return probe?.offsetHeight || window.innerHeight
}

/**
 * Follow the keyboard while `active`. `scope` holds the fields that count as typing here (a field elsewhere on the page
 * does not move this box); `probe` is any fixed element as tall as the screen (inset-0), or null.
 */
export function useKeyboardPlan(active: boolean, scope: () => Element | null, probe: () => HTMLElement | null, apply: (plan: KeyboardPlan, facts: BoxFacts) => void): void {
  useLayoutEffect(() => {
    if (!active) return
    const env = currentKeyboardEnv()
    let last = ""
    let held = false
    const run = (focusTarget?: Element | null) => {
      const vv = window.visualViewport
      const layoutH = layoutHeight(probe())
      const where = scope()
      const focused = focusTarget ?? document.activeElement
      const typing = takesKeyboard(focused) && !!where?.contains(focused)
      const published = parseFloat(document.documentElement.style.getPropertyValue("--kb-inset")) || 0
      const facts: BoxFacts = {
        env,
        layoutH,
        innerH: window.innerHeight,
        vvTop: Math.round(vv?.offsetTop ?? 0),
        vvH: Math.round(vv?.height ?? window.innerHeight),
        typing,
        native: typing ? nativeKeyboardHeight() : 0,
        table: typing && (env === "ios-app" || env === "ios-app-plugin") ? iosKeyboardFor(window.innerWidth, layoutH) : null,
        published,
        scrollY: Math.round(window.scrollY),
      }
      const plan = keyboardPlan(env, facts)
      /* The plugin's build: the web view's own scroll held for as long as the box is typed in, so iOS does not pan too. */
      const hold = plan.holdScroll && typing
      if (hold !== held) {
        held = hold
        holdNativeScroll(hold)
      }
      const key = `${plan.top}|${plan.foot}|${plan.source}|${typing}|${layoutH}|${facts.vvH}|${facts.vvTop}|${facts.scrollY}`
      if (key === last) return
      last = key
      apply(plan, facts)
    }
    run()
    let raf = 0
    const soon = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => run())
    }
    /*
      IN THE FOCUS ITSELF. Where the table decides (the iOS app), the box goes onto the keys now, before iOS reads where the
      field is to decide on a pan. Elsewhere the visible part will say where the keyboard is, a frame later as before.
    */
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Element | null
      if (takesKeyboard(t) && scope()?.contains(t)) {
        run(t)
        /* Laid out now, so the field's place iOS reads is the new one. */
        void (scope() as HTMLElement | null)?.offsetHeight
      }
      soon()
    }
    /* The keyboard going down is reported late on iOS: looked at again as it goes. */
    const timers: number[] = []
    const onFocusOut = () => {
      soon()
      timers.push(
        window.setTimeout(() => run(), 80),
        window.setTimeout(() => run(), 260),
      )
    }
    const vv = window.visualViewport
    const onViewport = () => run()
    vv?.addEventListener("resize", onViewport)
    vv?.addEventListener("scroll", onViewport)
    window.addEventListener("resize", onViewport)
    window.addEventListener(KEYBOARD_CHANGE_EVENT, onViewport)
    document.addEventListener("focusin", onFocusIn, true)
    document.addEventListener("focusout", onFocusOut, true)
    /* The plugin says the keyboard's height before it moves: the box goes with it. */
    const offNative = watchNativeKeyboard(onViewport)
    return () => {
      offNative()
      if (held) holdNativeScroll(false)
      cancelAnimationFrame(raf)
      timers.forEach((t) => window.clearTimeout(t))
      vv?.removeEventListener("resize", onViewport)
      vv?.removeEventListener("scroll", onViewport)
      window.removeEventListener("resize", onViewport)
      window.removeEventListener(KEYBOARD_CHANGE_EVENT, onViewport)
      document.removeEventListener("focusin", onFocusIn, true)
      document.removeEventListener("focusout", onFocusOut, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
