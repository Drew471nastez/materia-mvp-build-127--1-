"use client"

/**
 * ===========================================================================
 *  BACK ON THE WEBSITE, HAVING PAID
 * ===========================================================================
 * Checkout sends a buyer back to the creator's website after paying, with
 * `?checkout=paid` on the address (lib/checkout/return-url.ts). Landing on
 * the same page they left with nothing said would read as "did it work?", so
 * the page says it did, once, and where the receipt went.
 *
 * The flag comes off the address at once, so a reload or a shared link does
 * not say it again. Nothing is stored and nothing is read but the address:
 * the receipt's own link is a credential and never travels to the site.
 *
 * Plain inline styles on purpose: this sits on a creator's theme, whatever
 * its stylesheet, and must look the same over any of them. Motion is
 * opacity and transform only, and none under reduced motion.
 */
import { useEffect, useState } from "react"

const SHOWN_FOR_MS = 12_000

export function CheckoutReturnNotice() {
  const [shown, setShown] = useState(false)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    let url: URL
    try {
      url = new URL(window.location.href)
    } catch {
      return
    }
    if (url.searchParams.get("checkout") !== "paid") return
    url.searchParams.delete("checkout")
    try {
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    } catch {
      /* the notice still shows; the flag stays in the address */
    }
    setShown(true)
    const enter = window.requestAnimationFrame(() => setEntered(true))
    const leave = window.setTimeout(() => setShown(false), SHOWN_FOR_MS)
    return () => {
      window.cancelAnimationFrame(enter)
      window.clearTimeout(leave)
    }
  }, [])

  if (!shown) return null
  return (
    <div
      role="status"
      aria-live="polite"
      data-checkout-return=""
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        zIndex: 2147483000,
        width: "min(420px, calc(100% - 32px))",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 8px 12px 16px",
        borderRadius: 12,
        background: "#1a1a2e",
        color: "#ffffff",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
        fontFamily: "var(--theme-font-body, inherit)",
        transform: `translate(-50%, ${entered ? "0" : "8px"})`,
        opacity: entered ? 1 : 0,
        transition: "opacity 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>Payment complete</p>
        <p style={{ margin: "2px 0 0", fontSize: 14, lineHeight: 1.45, color: "rgba(255, 255, 255, 0.78)" }}>Your receipt is on its way to your email.</p>
      </div>
      <button
        type="button"
        onClick={() => setShown(false)}
        style={{
          flexShrink: 0,
          minWidth: 44,
          minHeight: 44,
          padding: "0 12px",
          border: 0,
          borderRadius: 8,
          background: "transparent",
          color: "#ffffff",
          font: "inherit",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Close
      </button>
      <style>{"@media (prefers-reduced-motion: reduce) { [data-checkout-return] { transition: none !important; } }"}</style>
    </div>
  )
}
