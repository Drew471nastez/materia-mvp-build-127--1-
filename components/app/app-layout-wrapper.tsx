"use client"

import { Suspense, useEffect } from "react"
import { NavigationLoadingBar } from "./navigation-loading-bar"
import { AppStage } from "./app-stage"
import { LanguageProvider } from "@/lib/i18n"
import { PurchaseSyncProvider } from "@/components/checkout/purchase-sync-provider"
import { DocumentScrollGuard } from "@/components/app/document-scroll-guard"
import { keyboardInsetOrFloor, writeRootLater } from "@/lib/ui/keyboard-safe-sheet"
import AppColdStart from "@/app/app/cold-start"
import { revealAppFromDark } from "@/lib/appearance/client"
import { revealIntoApp } from "@/lib/navigation/into-app-still"

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {

  // Register for push notifications once the authenticated app shell mounts
  // useEffect(() => {
  //   import("@/lib/push/client").then(({ initPushNotifications }) => {
  //     initPushNotifications().catch(() => {})
  //   })
  // }, [])

  // Hide html-level scrollbar on /app pages
  useEffect(() => {
    document.documentElement.classList.add("app-layout")
    /* The shell is on the screen now: the canvas the head script painted for the document's first frames goes (app/globals.css html.app-arriving),
       and the veil a dashboard opened after a dark page starts under fades off it (lib/appearance/site-appearance APP_FROM_DARK_BOOT, round 30),
       and so does the copy of the buyer page a client move came from (lib/navigation/into-app-still.ts, round 31). */
    const frame = requestAnimationFrame(() => {
      document.documentElement.classList.remove("app-arriving")
      revealAppFromDark()
      revealIntoApp()
    })
    return () => {
      cancelAnimationFrame(frame)
      document.documentElement.classList.remove("app-layout")
    }
  }, [])

  // The scroll position on a navigation (the top for a new page, where you
  // were for back and forward) is set by <AppStage>, before the new page is
  // painted. It used to be reset here in an effect, which runs after the
  // paint: one frame of the new page at the old page's scroll, then a jump.

  // Set --sat/--sab CSS custom properties for safe-area insets in Capacitor.
  // The CSS rule `html.capacitor { --sat: env(...) }` handles this declaratively,
  // but some WebView versions need the values set imperatively as well.
  // Re-apply on orientationchange because some iOS versions reset inline styles
  // during the rotation animation, causing --sat to revert to its CSS value
  // briefly — which may differ from the post-rotation safe-area inset.
  useEffect(() => {
    const isNative =
      typeof window !== "undefined" &&
      !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isNative) return
    const root = document.documentElement
    function applyInsets() {
      root.style.setProperty("--sat", "env(safe-area-inset-top)")
      root.style.setProperty("--sab", "env(safe-area-inset-bottom)")
    }
    applyInsets()
    window.addEventListener("orientationchange", applyInsets, { passive: true })
    return () => {
      window.removeEventListener("orientationchange", applyInsets)
      root.style.removeProperty("--sat")
      root.style.removeProperty("--sab")
    }
  }, [])

  // Track software keyboard height via VisualViewport API.
  // When the keyboard opens on iOS/Android (Capacitor or mobile browser):
  //   - vv.height shrinks by the keyboard height
  //   - vv.offsetTop may increase as iOS shifts the viewport up to reveal the focused input
  // We set --keyboard-inset-height so CSS can shrink the scroll container,
  // and call window.scrollTo(0,0) to counteract any iOS upward viewport shift
  // that would push content under the fixed app header.
  //
  // Device ROTATION also fires vv.resize. During the rotation transition on iOS,
  // window.innerHeight and vv.height can be out-of-sync for one or two frames,
  // producing a spurious non-zero keyboard height. We distinguish rotation from
  // keyboard by tracking window.innerWidth: keyboard events never change the
  // width, rotation always does. On rotation we reset kbHeight to 0 immediately
  // and skip the window.scrollTo call (which can cause a jarring viewport jump
  // during the rotation animation and leave a black bar above the header).
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return

    const vv = window.visualViewport
    const root = document.documentElement
    let lastInnerWidth = window.innerWidth
    let rotationCooldown = false

    function onViewportChange() {
      const currentWidth = window.innerWidth
      const isOrientationChange = currentWidth !== lastInnerWidth
      lastInnerWidth = currentWidth

      if (isOrientationChange) {
        // Orientation change — keyboard is not open, reset keyboard inset to 0.
        // Do NOT call window.scrollTo here: it can create a visible viewport
        // shift during the iOS rotation animation, showing a black gap above
        // the fixed header.
        root.style.setProperty("--keyboard-inset-height", "0px")
        // Set a cooldown to ignore subsequent viewport events during the
        // rotation animation. iOS fires multiple vv.resize events while the
        // dimensions settle; without a cooldown the code below mis-detects
        // the temporary dimension mismatch as a keyboard and calls scrollTo,
        // which creates the black bar above the header.
        rotationCooldown = true
        setTimeout(() => {
          rotationCooldown = false
          // After rotation settles, reset any lingering visual-viewport offset
          // that iOS may have left behind. On /app pages html has overflow:hidden
          // (via .app-layout), which makes window.scrollTo a no-op at the CSS
          // level. We temporarily override with an inline style so the WKWebView
          // UIScrollView can reset to (0,0), then remove the inline style before
          // the next paint — the override is invisible because there is no
          // out-of-bounds content to show during that single frame.
          // Retry up to 8 more times (100 ms apart) in case the first attempt
          // doesn't fully reset the WKWebView UIScrollView content offset —
          // some iOS versions require multiple frames to honour scrollTo(0,0).
          // Starting at 500 ms (down from 800 ms) gives the retries up to
          // 500+800=1300 ms to complete, well inside the RotationGuard overlay
          // window (1600 ms) so no black bar is ever visible on hide.
          let retries = 8
          function tryResetOffset() {
            if (vv.offsetTop <= 0 && window.pageYOffset <= 0) return
            root.style.overflow = 'auto'
            window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
            // Belt-and-suspenders: also directly zero the element scroll offsets
            // which some WKWebView versions respond to when scrollTo is ignored.
            document.documentElement.scrollTop = 0
            document.body.scrollTop = 0
            requestAnimationFrame(() => {
              root.style.removeProperty('overflow')
              if (retries-- > 0 && (vv.offsetTop > 0 || window.pageYOffset > 0)) {
                setTimeout(tryResetOffset, 100)
              }
            })
          }
          tryResetOffset()
        }, 500)
        return
      }

      // Still within the rotation transition — ignore spurious events.
      if (rotationCooldown) return

      // Keyboard appearance / disappearance (width unchanged).
      // Keyboard height = total window height minus visible-viewport height minus any scroll offset
      const kbHeight = keyboardInsetOrFloor(Math.max(0, window.innerHeight - vv.offsetTop - vv.height))
      /* Round 27: with the other keyboard numbers on <html>, in one write a frame (keyboard-safe-sheet.ts writeRootLater). */
      writeRootLater({ vars: { "--keyboard-inset-height": `${kbHeight}px` } })

      // iOS WKWebView scrolls the visual viewport up when the keyboard opens so
      // the focused input stays in view. On /app pages html has overflow:hidden,
      // so document scroll is locked — but the visual-viewport offset can still
      // change, pushing content behind the fixed app header. Reset it.
      if (vv.offsetTop > 0) {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
      }
    }

    vv.addEventListener("resize", onViewportChange)
    vv.addEventListener("scroll", onViewportChange)

    return () => {
      vv.removeEventListener("resize", onViewportChange)
      vv.removeEventListener("scroll", onViewportChange)
      root.style.removeProperty("--keyboard-inset-height")
    }
  }, [])

  /*
    THE SHELL'S FRAME UNTIL THE LANGUAGE IS KNOWN. LanguageProvider draws none
    of /app until a client effect has run, so the server's HTML for every
    /app page was empty: a page that arrived as a document showed white until
    its script had loaded and run. It shows the shell's own frame and the
    slow page's spinner now, in the slow page's place (app/app/cold-start,
    the native cold start's frame), so a navigation the router hands to the
    browser (a new deployment, a failed fetch) goes from the spinner to the
    same spinner, never to a blank page.
  */
  return (
    <LanguageProvider fallback={<AppColdStart />}>
      <Suspense fallback={null}>
        <NavigationLoadingBar />
        {/* How a page arrives: the landing, the scroll, and the spinner for a slow page. */}
        <AppStage />
      </Suspense>
      <PurchaseSyncProvider />
      {/* The document is never scrolled on /app; see the file. */}
      <DocumentScrollGuard />
      {children}
    </LanguageProvider>
  )
}
