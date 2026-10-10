/**
 * ===========================================================================
 *  THE COMMENT BOX ON THE KEYBOARD: ONE TABLE, PER ENVIRONMENT (round 17)
 * ===========================================================================
 * The owner, after rounds 15 and 16: "it's still the same thing: the empty
 * space in between the keyboard" (images/76.jpg, the iOS app).
 *
 * THE SAME MECHANISM AS THE SHEETS THAT ALREADY WORK. Rounds 11 and 12 put
 * every bottom sheet on the keyboard the same way (lib/ui/keyboard-safe-
 * sheet.ts sheetOverKeyboard, components/ui/bottom-sheet.tsx): the sheet's
 * box stays down to the foot of the screen, painting its own white there,
 * and only its CONTENT is lifted, by the keyboard's room below the visible
 * part (`--kb-inset`, published by components/viewport-vars.tsx). An error
 * in the number is then a strip of the sheet's own white, never a window
 * onto the page. The opened post is now that: its page reaches the foot of
 * the screen and beyond, always, and the room at its foot (`--post-foot`)
 * is what lifts the comment box. Round 16 shortened the page itself to end
 * at the keyboard and tried to cover the gap with a white block drawn as
 * the box's shadow; that block sat inside the post's scroller, which clips
 * (overflow: auto), so it ended exactly where the page ended and covered
 * nothing below it (measured: scripts/check-communities-post17.mjs
 * PART=keyboard).
 *
 * NEVER TWICE. iOS moves the page itself to show a focused field near the
 * foot (it pans the visual viewport, reported as visualViewport.offsetTop).
 * If the box is ALSO lifted by the whole keyboard's height, it ends the pan
 * above the keys: the gap. So the room is always measured from the visible
 * part, which already has the pan in it, or, where only the keyboard's
 * height is known, the pan is taken off it; and in the app the box is put
 * on the keyboard before iOS decides whether to pan (on focus, at once),
 * so there is nothing left for iOS to pan for.
 *
 *   ENVIRONMENT                  WHO MOVES WHAT              THE ROOM UNDER THE BOX
 *   iPhone Safari (and any       iOS pans the page; the      layout - (vv.offsetTop + vv.height),
 *   iOS browser)                 visual viewport says so,    the pan already in it. Never a
 *                                height and pan both         keyboard height on top.
 *   the iOS app, no keyboard     the web view is not         the visual viewport's, as Safari,
 *   plugin (the build the        resized; this WKWebView     when it reports one. When it reports
 *   owner has today)             may or may not report       nothing: the iPhone's keyboard for
 *                                the keyboard               this screen (the table, else the
 *                                                            published floor) less any pan it did
 *                                                            report, applied ON FOCUS, before iOS
 *                                                            pans, so iOS has no reason to pan
 *   the iOS app with the         the plugin says the         its height exactly, less any pan;
 *   plugin (the next build)      keyboard's height before    and the web view's own scroll is held
 *                                it moves                    (setScroll isDisabled) while the box
 *                                                            is typed in, so iOS does not pan too
 *   Android (Chrome and the      the platform shrinks the    layout - (vv.offsetTop + vv.height):
 *   app)                         visible part, or the web    0 when the web view itself shrank.
 *                                view itself                 Never the plugin's height (the web
 *                                                            view already made room)
 *   a computer                   no keyboard to make room    the tab bar's room, as with no keyboard
 *
 * With no keyboard the room is the tab bar's (the bar is over the post).
 *
 * Pure: no DOM, no React. tests/communities-post17.test.ts holds the table.
 */
import { keyboardInsetFrom } from "@/lib/ui/keyboard-safe-sheet"

export type KeyboardEnv = "ios-safari" | "ios-app" | "ios-app-plugin" | "android" | "computer"

/** Which row of the table this is. */
export function keyboardEnv(f: { ua: string; capacitor: boolean; plugin: boolean; coarse: boolean }): KeyboardEnv {
  const ios = /iPhone|iPad|iPod/.test(f.ua) || (/Macintosh/.test(f.ua) && f.coarse)
  if (/Android/i.test(f.ua)) return "android"
  if (ios && f.capacitor) return f.plugin ? "ios-app-plugin" : "ios-app"
  if (ios) return "ios-safari"
  return f.coarse ? "android" : "computer"
}

export interface KeyboardFacts {
  /** The fixed box's height (read off a fixed element: what the page is laid out against). */
  layoutH: number
  innerH: number
  vvTop: number
  vvH: number
  /** A text field inside the post has the focus. */
  typing: boolean
  /** The plugin's keyboard height (keyboardWillShow), 0 when it has said nothing. */
  native: number
  /** The iPhone keyboard for this screen (post-motion.ts iosKeyboardFor), or null. */
  table: number | null
  /** What ViewportVars publishes as --kb-inset (its floor where the platform says nothing). */
  published: number
}

export interface KeyboardPlan {
  /** Where the post's page starts, in the fixed box (follows a pan, so its top stays on the screen). */
  top: number
  /** The room at the page's foot: "tabs" for the tab bar's, or pixels of keyboard. */
  foot: number | "tabs"
  source: "screen" | "visual" | "native" | "table" | "floor"
  /** Put it in place in the focus itself, before iOS decides whether to pan (the app, where nothing else is reported). */
  atFocus: boolean
  /** Hold the web view's own scroll while typing (the plugin's setScroll), so iOS does not pan as well. */
  holdScroll: boolean
}

/** The decision table, as code. */
export function keyboardPlan(env: KeyboardEnv, m: KeyboardFacts): KeyboardPlan {
  const top = Math.max(0, Math.round(m.vvTop))
  if (!m.typing || env === "computer") return { top, foot: "tabs", source: "screen", atFocus: false, holdScroll: false }
  const reported = keyboardInsetFrom({ layoutHeight: m.layoutH, innerHeight: m.innerH, vvTop: m.vvTop, vvHeight: m.vvH })
  if (env === "ios-app-plugin" && m.native > 0) return { top, foot: Math.max(0, Math.round(m.native - top)), source: "native", atFocus: true, holdScroll: true }
  if (env === "ios-app") {
    if (reported > 0) return { top, foot: reported, source: "visual", atFocus: false, holdScroll: false }
    const k = m.table ?? (m.published > 0 ? m.published : null)
    if (k) return { top, foot: Math.max(0, Math.round(k - top)), source: m.table ? "table" : "floor", atFocus: true, holdScroll: false }
    return { top, foot: 0, source: "visual", atFocus: true, holdScroll: false }
  }
  if (env === "ios-app-plugin") {
    /* The plugin has not spoken yet: as the app without it, until it does. */
    const k = m.table ?? (m.published > 0 ? m.published : null)
    if (reported > 0) return { top, foot: reported, source: "visual", atFocus: true, holdScroll: true }
    return { top, foot: k ? Math.max(0, Math.round(k - top)) : 0, source: m.table ? "table" : "floor", atFocus: true, holdScroll: true }
  }
  /* iPhone Safari and Android: the visible part says it all, the pan included. */
  return { top, foot: reported, source: "visual", atFocus: false, holdScroll: false }
}

/** The page's foot room as CSS. */
export function footCss(plan: KeyboardPlan): string {
  return plan.foot === "tabs" ? "var(--buyer-tabs-h, 0px)" : `${Math.round(plan.foot)}px`
}

/** Where the comment box's foot is on the SCREEN for a plan (the test's check against 76.jpg). */
export function boxFootOnScreen(plan: KeyboardPlan, m: { layoutH: number; vvTop: number; tabs: number }): number {
  const foot = plan.foot === "tabs" ? m.tabs : plan.foot
  /* The page ends at the fixed box's foot; the screen shows the fixed box from the pan down. */
  return m.layoutH - foot - Math.max(0, m.vvTop)
}
