"use client"

/**
 * ===========================================================================
 *  WHAT SOMEBODY SEES INSTEAD OF A BLANK PAGE
 * ===========================================================================
 * One screen, used by every error boundary in the app, because a person who
 * hits two different failures should not be learning two different layouts.
 *
 * It does three things the default did none of:
 *   - says what happened in words somebody can repeat to support;
 *   - offers the way out, which is usually just trying again;
 *   - reports itself, so the next occurrence is a line in the server log
 *     rather than a screenshot in a message.
 *
 * A STALE DEPLOY NEVER GETS THIS FAR. See lib/client-errors: if the throw was
 * the browser failing to fetch code that a deploy renamed, the page reloads
 * itself once and the person sees a flicker instead of an error.
 */

import { useEffect, useState } from "react"
import { buildReport, describeForUser, shouldReloadForStaleCode } from "@/lib/client-errors"

export function ErrorScreen({
  error,
  reset,
  /** Where "go back" should point. The dashboard inside /app, home outside. */
  home = "/",
  homeLabel = "Go to Storelib",
}: {
  error: Error & { digest?: string }
  reset?: () => void
  home?: string
  homeLabel?: string
}) {
  const [reloading, setReloading] = useState(false)
  const { title, detail, digest } = describeForUser(error)

  useEffect(() => {
    if (typeof window === "undefined") return

    /**
     * The self-healing case first, before anything is painted for the person
     * to read: a tab that predates a deploy is not broken, it is old.
     */
    let store: Storage | null = null
    try {
      store = window.sessionStorage
    } catch {
      store = null
    }
    /* The same address, loaded again: nothing in it is lost. On /checkout the
       form is already gone once a boundary shows this, and the buyer's name
       and email come back from the tab (app/checkout remembered()). */
    if (shouldReloadForStaleCode(error, store, window.location.pathname)) {
      setReloading(true)
      window.location.reload()
      return
    }

    /**
     * Then say so. `keepalive` because a boundary often renders while the
     * person is already navigating away, and a report that loses the race is
     * a crash nobody hears about. Failures here are swallowed on purpose:
     * an error screen that throws is the thing this file exists to prevent.
     */
    try {
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildReport(error, window.location.href)),
        keepalive: true,
      }).catch(() => {})
    } catch {
      /* nothing to do, and nothing worth breaking the screen over */
    }
  }, [error])

  if (reloading) {
    return (
      <div style={WRAP} aria-live="polite">
        <p style={{ ...DETAIL, textAlign: "center" }}>Updating Storelib…</p>
      </div>
    )
  }

  return (
    <div style={WRAP}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <h1 style={TITLE}>{title}</h1>
        <p style={DETAIL}>{detail}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
          {reset ? (
            <button type="button" onClick={reset} style={PRIMARY}>
              Try again
            </button>
          ) : null}
          <button type="button" onClick={() => window.location.reload()} style={reset ? SECONDARY : PRIMARY}>
            Reload the page
          </button>
          <a href={home} style={SECONDARY}>
            {homeLabel}
          </a>
        </div>
        {digest ? (
          <p style={{ ...DETAIL, marginTop: 20, fontSize: 12, color: "#9ca3af" }}>
            If you tell us about this, quote {digest}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * INLINE STYLES, NOT CLASSES, AND THAT IS THE POINT.
 *
 * This screen renders when something is already wrong, and one of the things
 * that can be wrong is the stylesheet: a CSS chunk that failed to load takes
 * the whole design system with it, and a Tailwind-classed error page then
 * renders as unstyled text on white. The one screen guaranteed to be legible
 * is the one that needs no stylesheet at all.
 */
const WRAP: React.CSSProperties = {
  minHeight: "100svh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "#f8f9fa",
  color: "#1a1a2e",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
}

const TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.25,
  fontWeight: 700,
  letterSpacing: "-0.01em",
}

const DETAIL: React.CSSProperties = {
  margin: "10px 0 0",
  fontSize: 15,
  lineHeight: 1.55,
  color: "#6b7280",
}

const BUTTON: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 44,
  padding: "0 18px",
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
  border: "1px solid transparent",
}

const PRIMARY: React.CSSProperties = { ...BUTTON, background: "#1a1a2e", color: "#ffffff" }
const SECONDARY: React.CSSProperties = { ...BUTTON, background: "#ffffff", color: "#1a1a2e", borderColor: "#e5e7eb" }
