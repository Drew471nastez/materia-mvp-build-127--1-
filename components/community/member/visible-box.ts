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
import { RESIZED_MIN_PX, keyboardEnv, keyboardPlan, webViewResized, type KeyboardEnv, type KeyboardFacts, type KeyboardPlan } from "./keyboard-plan"
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

/*
  ROUND R8: THE FIXED BOX WITH NO KEYBOARD, AND WHETHER THE WEB VIEW SHRINKS FOR ONE (keyboard-plan.ts). Started from the
  window as this module loads (no keyboard is up while a page loads), raised by every reading with no field typed in, per
  width (a rotation starts again). A field typed in with the box shorter than that by more than any toolbar is a web view
  that resized itself, remembered for the rest of the visit.
*/
let fullBox = typeof window === "undefined" ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight }
let resizedOnce = false
export function noteFixedBox(layoutH: number): { fullH: number; resizes: boolean } {
  const w = window.innerWidth
  const keys = takesKeyboard(document.activeElement)
  if (w !== fullBox.w) fullBox = { w, h: layoutH }
  else if (!keys) fullBox.h = Math.max(fullBox.h, layoutH)
  if (keys && fullBox.h - layoutH > RESIZED_MIN_PX) resizedOnce = true
  return { fullH: fullBox.h, resizes: resizedOnce }
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
      const box = noteFixedBox(layoutH)
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
        fullH: box.fullH,
        resizes: box.resizes,
        gone: typing && keyboardGone(),
        scrollY: Math.round(window.scrollY),
      }
      const plan = keyboardPlan(env, facts)
      /* The plugin's build: the web view's own scroll held for as long as the box is typed in, so iOS does not pan too. */
      const hold = plan.holdScroll && typing
      if (hold !== held) {
        held = hold
        holdNativeScroll(hold)
      }
      const key = `${plan.top}|${plan.foot}|${plan.source}|${typing}|${layoutH}|${facts.vvH}|${facts.vvTop}|${facts.scrollY}|${box.fullH}|${box.resizes}|${facts.gone}`
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
    const timers: number[] = []
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Element | null
      if (takesKeyboard(t) && scope()?.contains(t)) {
        run(t)
        /* Laid out now, so the field's place iOS reads is the new one. */
        void (scope() as HTMLElement | null)?.offsetHeight
        /* ROUND R8: and again once the keyboard has finished rising (a web view resized, or a pan, can land after its last event). */
        timers.push(
          window.setTimeout(() => run(), 320),
          window.setTimeout(() => run(), 700),
        )
      }
      soon()
    }
    /* The keyboard going down is reported late on iOS: looked at again as it goes. */
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

/**
 * THE KEYBOARD'S HEIGHT FOR A SHEET THAT MAKES ITS OWN ROOM (the composer, on the website builder's sheet, round 17). The
 * decision table's number where the platform says nothing: in the iOS app, the plugin's height when this build has it, else
 * the iPhone's keyboard for this screen (post-motion.ts iosKeyboardFor); null everywhere else (Safari and Android report the
 * keyboard themselves, and the sheet reads that) and whenever `within` has no field being typed in.
 */
export function appKeyboardRoom(within: Element | null): number | null {
  if (typeof window === "undefined") return null
  const env = currentKeyboardEnv()
  if (env !== "ios-app" && env !== "ios-app-plugin") return null
  const probe = document.querySelector<HTMLElement>("[data-viewport-probe]")
  const layoutH = layoutHeight(probe)
  const box = noteFixedBox(layoutH)
  const active = document.activeElement
  if (!takesKeyboard(active) || !within?.contains(active)) return null
  /* ROUND R8: a web view that shrank for the keyboard has made the room already; a number here would make it twice. */
  if (box.resizes || webViewResized({ layoutH, fullH: box.fullH })) return null
  const native = nativeKeyboardHeight()
  if (env === "ios-app-plugin" && native > 0) return native
  return iosKeyboardFor(window.innerWidth, layoutH)
}

/*
  ROUND 25: THE KEYBOARD THIS PHONE HAS ALREADY SHOWN. iPhone Safari (and an iOS web view that reports it) says how tall the
  keyboard is only once it is up, so a sheet with a field near its foot made its room a beat after the keys arrived, and iOS,
  finding the field under where the keys would be, panned the page to it first: the New post sheet bumping up on a second
  tap into "Write something...", the comment box riding up late. The height the visible part reported the last time a field
  had the keyboard, at this width, is kept for the rest of the visit, and a sheet makes that room in the focus itself the
  next time: the field is already above the keys when iOS looks, and the report that follows agrees with it.
*/
let seenKeys = { w: 0, k: 0 }
let watchingKeys = false
/*
  ROUND 27 (I7): THE KEYS WENT DOWN UNDER A FIELD THAT KEPT THE CARET. The owner: "when I write a post and I close the
  keyboard, it leaves the bar with the attachment icons, emoji icon, GIF up there, it freezes up there." The room above is
  for the moment between a focus and the platform's first word about the keys. It was handed out for as long as a field in
  the sheet had the focus, so when the keys went down and the field kept the caret (the keyboard's own hide, an iPad's key,
  the app's keyboardWillHide), the visible part grew back to the whole screen, which reads as "nothing reported", and the
  sheet took the remembered keyboard instead: the toolbar stayed where the keys had been (scripts/check-posts27-keys.mjs,
  "kept" and "plugin": the bar at 464 on an 844 screen with no keys under it). Now the platform's word that the keys have
  gone (the visible part growing back after it had reported them, or the plugin's hide) stands until the keys are asked for
  again: a new focus, a finger on the field that has the caret, or a report of the keys.
*/
let keysUp = false
let keysGone = false
/** The keys went down while a field kept the caret, and nothing has asked for them since. */
export function keyboardGone(): boolean {
  watchKeys()
  return keysGone
}
function watchKeys(): void {
  if (watchingKeys || typeof window === "undefined" || !window.visualViewport) return
  watchingKeys = true
  const vv = window.visualViewport
  const read = () => {
    if (!takesKeyboard(document.activeElement)) return
    const layoutH = layoutHeight(document.querySelector<HTMLElement>("[data-viewport-probe]"))
    const box = noteFixedBox(layoutH)
    /* A web view that shrank for the keyboard has made the room itself: nothing to remember. */
    if (box.resizes || webViewResized({ layoutH, fullH: box.fullH })) return
    const k = Math.round(layoutH - vv.height)
    if (k > RESIZED_MIN_PX && Math.abs(vv.scale - 1) < 0.01) {
      seenKeys = { w: window.innerWidth, k }
      keysUp = true
      keysGone = false
    } else if (keysUp && k <= RESIZED_MIN_PX) {
      keysUp = false
      keysGone = true
    }
  }
  vv.addEventListener("resize", read)
  const ask = () => {
    keysUp = false
    keysGone = false
    goneOn = null
  }
  /*
    A new focus asks for the keys. Not the field getting the focus back with the window (another app or tab, then this
    one): the keys do not come back with it, and the field is still the one they went down under.
  */
  let goneOn: Element | null = null
  document.addEventListener("focusin", (e) => {
    if (keysGone && e.target === goneOn) return
    ask()
  }, true)
  document.addEventListener("focusout", (e) => {
    if (keysGone && !document.hasFocus()) goneOn = e.target as Element
  }, true)
  /* A finger on the field that already has the caret brings the keys back with no focus event. */
  document.addEventListener("touchend", (e) => {
    const f = document.activeElement
    if (takesKeyboard(f) && e.target instanceof Node && f?.contains(e.target)) ask()
  }, true)
  /*
    The plugin says the keys are going before they move. A web view that reports nothing will never say it itself, so the
    sheets are told (a resize of the visible part, which every one of them listens to, as ViewportVars does for its floor);
    one that still shows the keys reports its own change once they are down.
  */
  watchNativeKeyboard(() => {
    if (nativeKeyboardHeight() > 0) return ask()
    if (!takesKeyboard(document.activeElement)) return
    keysUp = false
    keysGone = true
    const layoutH = layoutHeight(document.querySelector<HTMLElement>("[data-viewport-probe]"))
    if (layoutH - vv.height <= RESIZED_MIN_PX) vv.dispatchEvent(new Event("resize"))
  })
}

/** The keyboard last reported in this visit at this width, in CSS px, or 0. */
export function keyboardSeen(): number {
  watchKeys()
  return typeof window !== "undefined" && seenKeys.w === window.innerWidth ? seenKeys.k : 0
}

/**
 * THE ROOM A SHEET MAKES IN THE FOCUS (mobile-editor-sheet.tsx keyboardRoom), for the community's sheets: the opened post
 * and New post. On iOS only (Android's web view and Chrome make their own room before the field is revealed), and only while
 * a field inside `within` has the focus: the plugin's exact height in a build that has it; else the keyboard this visit has
 * already seen (keyboardSeen); else, in the app, the iPhone's keyboard for this screen (the table); else nothing, and the
 * sheet waits for the report. Never for a web view that resized itself for the keyboard (that room is made already).
 */
export function sheetKeyboardRoom(within: Element | null): number | null {
  if (typeof window === "undefined") return null
  watchKeys()
  const env = currentKeyboardEnv()
  if (env !== "ios-safari" && env !== "ios-app" && env !== "ios-app-plugin") return null
  const active = document.activeElement
  if (!takesKeyboard(active) || !within?.contains(active)) return null
  const layoutH = layoutHeight(document.querySelector<HTMLElement>("[data-viewport-probe]"))
  const box = noteFixedBox(layoutH)
  if (box.resizes || webViewResized({ layoutH, fullH: box.fullH })) return null
  /* Round 27: the platform said the keys went down and the field kept the caret: no room (keysGone above). */
  if (keysGone) return 0
  const native = nativeKeyboardHeight()
  if (env === "ios-app-plugin" && native > 0) return native
  const seen = keyboardSeen()
  if (seen > 0) return seen
  return env === "ios-safari" ? null : iosKeyboardFor(window.innerWidth, layoutH)
}
