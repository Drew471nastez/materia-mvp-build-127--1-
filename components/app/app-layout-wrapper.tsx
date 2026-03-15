"use client"

import { Suspense, useEffect } from "react"
import { usePathname } from "next/navigation"
import { NavigationLoadingBar } from "./navigation-loading-bar"
import { LanguageProvider } from "@/lib/i18n"
import { PurchaseSyncProvider } from "@/components/checkout/purchase-sync-provider"

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Hide html-level scrollbar on /app pages
  useEffect(() => {
    document.documentElement.classList.add("app-layout")
    return () => {
      document.documentElement.classList.remove("app-layout")
    }
  }, [])

  // Reset the shared scroll container to the top on every navigation.
  // Without this, navigating from a scrolled page (e.g. dashboard) to a new
  // page (e.g. Upgrade to Pro) leaves the scroll position mid-way, making
  // elements appear to overlap under the fixed header.
  useEffect(() => {
    const scrollEl = document.querySelector(".app-content-scroll") as HTMLElement | null
    if (scrollEl) {
      scrollEl.scrollTop = 0
    }
  }, [pathname])

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
          // Retry up to 4 more times (100 ms apart) in case the first attempt
          // doesn't fully reset the WKWebView UIScrollView content offset —
          // some iOS versions require multiple frames to honour scrollTo(0,0).
          let retries = 4
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
        }, 800)
        return
      }

      // Still within the rotation transition — ignore spurious events.
      if (rotationCooldown) return

      // Keyboard appearance / disappearance (width unchanged).
      // Keyboard height = total window height minus visible-viewport height minus any scroll offset
      const kbHeight = Math.max(0, window.innerHeight - vv.offsetTop - vv.height)
      root.style.setProperty("--keyboard-inset-height", `${kbHeight}px`)

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

  return (
    <LanguageProvider>
      <Suspense fallback={null}>
        <NavigationLoadingBar />
      </Suspense>
      <PurchaseSyncProvider />
      {children}
    </LanguageProvider>
  )
}
