"use client"

import { useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { isNativeApp } from "@/lib/native-bridge"
import { CLOSE_EVENT } from "@/components/app/sidebar-mobile-nav"
import { NATIVE_BACK_EVENT, nativeBackTarget } from "@/lib/ui/native-back"

/**
 * NativeBackHandler
 *
 * Listens for Android hardware back button presses via the Capacitor App plugin
 * and implements smart navigation:
 *
 *  • If browser history has entries  → go back (same as tapping < on a browser)
 *  • If on a root route (/app, /app/products, etc.) with no history
 *    → show a "tap again to exit" toast, then exit the app on second tap
 *
 * The "root routes" list covers the main tab bar destinations — pages the user
 * reaches by tapping a sidebar item rather than drilling in.
 *
 * This component renders nothing. Mount it once inside the app layout.
 */

const ROOT_ROUTES = [
  "/app",
  "/app/products",
  "/app/analytics",
  "/app/orders",
  "/app/coupons",
  "/app/reviews",
  "/app/onepage",
  "/app/emails",
  "/app/payouts",
  "/app/settings",
  "/library",
]

function isRootRoute(pathname: string): boolean {
  return ROOT_ROUTES.some(r => pathname === r || pathname === r + "/")
}

export function NativeBackHandler() {
  const router = useRouter()
  const pathname = usePathname()
  const lastBackPressRef = useRef<number>(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastElementRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isNativeApp()) return

    let listenerHandle: { remove: () => void } | null = null

    const setupListener = async () => {
      try {
        const { App } = await import("@capacitor/app")

        listenerHandle = await App.addListener("backButton", ({ canGoBack }) => {
          const now = Date.now()

          /*
            THE THING ON TOP GOES FIRST.

            With the phone's menu open over the page, "tap again to exit the
            app" is the wrong answer to a back press by some distance. The
            menu answers to one attribute and one event — see
            components/app/sidebar-mobile-nav — so this closes it without
            either file importing the other.
          */
          const menu = document.querySelector('[data-mobile-menu="open"]')
          if (menu) {
            menu.dispatchEvent(new CustomEvent(CLOSE_EVENT))
            return
          }

          /*
            A PANEL OPENED INSIDE THE PAGE GOES BACK BEFORE THE PAGE DOES. The
            OnePage editor's Design panels have no history entry of their own,
            and the editor is a root route, so back offered to leave the app
            from inside Theme. The page marks what answers back (lib/ui/native-back)
            and does what its own back button does.
          */
          const inner = nativeBackTarget()
          if (inner) {
            inner.dispatchEvent(new CustomEvent(NATIVE_BACK_EVENT))
            return
          }

          const isRoot = isRootRoute(window.location.pathname)

          if (!isRoot && canGoBack) {
            // Standard back navigation within the app
            window.history.back()
            return
          }

          if (!isRoot && !canGoBack) {
            // No history but not on a root — go to /app as home
            router.replace("/app")
            return
          }

          // On a root route — double-tap to exit
          const timeSinceLast = now - lastBackPressRef.current
          if (timeSinceLast < 2000) {
            // Second tap within 2 s → exit the app
            clearExitToast()
            App.exitApp()
            return
          }

          // First tap → show "tap again to exit" toast
          lastBackPressRef.current = now
          showExitToast()
          // Auto-dismiss after 2 s
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
          toastTimerRef.current = setTimeout(() => {
            clearExitToast()
            lastBackPressRef.current = 0
          }, 2000)
        })
      } catch {
        // @capacitor/app not available or not in native context — ignore
      }
    }

    setupListener()

    return () => {
      listenerHandle?.remove()
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      clearExitToast()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// ── Exit toast helpers (pure DOM — no React re-render needed) ──────────────

function showExitToast() {
  clearExitToast()
  const el = document.createElement("div")
  el.id = "storelib-exit-toast"
  el.textContent = "Tap back again to exit"
  Object.assign(el.style, {
    position: "fixed",
    /* 16px over the nav pill's top, which app/globals.css keeps for every phone width. */
    bottom: "calc(var(--app-nav-top) + 16px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.82)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "500",
    padding: "10px 20px",
    borderRadius: "999px",
    zIndex: "99999",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    animation: "storelib-toast-in 0.18s ease-out",
  })
  // Inject keyframes once
  if (!document.getElementById("storelib-toast-style")) {
    const style = document.createElement("style")
    style.id = "storelib-toast-style"
    style.textContent = `@keyframes storelib-toast-in { from { opacity:0; transform:translateX(-50%) translateY(8px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }`
    document.head.appendChild(style)
  }
  document.body.appendChild(el)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).__storelibExitToast = el
}

function clearExitToast() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = (window as any).__storelibExitToast as HTMLElement | undefined
  if (el?.parentNode) el.parentNode.removeChild(el)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).__storelibExitToast = null
  const existing = document.getElementById("storelib-exit-toast")
  if (existing?.parentNode) existing.parentNode.removeChild(existing)
}
