"use client"

import { useCallback, useEffect, useState } from "react"

import type { LatLng } from "@/lib/geo"

/**
 * Ask the browser where the user is — once, and only when they ask for it.
 *
 * ---------------------------------------------------------------------------
 * NEVER PROMPTED AUTOMATICALLY, and that is a deliberate product decision.
 * ---------------------------------------------------------------------------
 * A location prompt that appears the moment a page loads is the most-refused
 * dialog on the web, and a refusal is PERMANENT for that origin — the browser
 * will not ask again, and the user cannot easily undo it. Spending that single
 * chance on a page the buyer has not yet understood costs the feature forever.
 *
 * So the prompt is bound to a button that says what it is for. `prime()` is
 * called from a click; nothing here runs on mount except a permission QUERY,
 * which never prompts.
 *
 * ---------------------------------------------------------------------------
 * iOS, and why this can look broken there
 * ---------------------------------------------------------------------------
 * Inside the native shell the page runs in a WKWebView, and WKWebView refuses
 * geolocation unless the app's Info.plist declares
 * `NSLocationWhenInUseUsageDescription`. That key is NOT currently present, so
 * on the iOS app this resolves to "unavailable" and the UI simply falls back to
 * searching by town — which is why every caller must treat location as an
 * enhancement and never as a requirement.
 *
 * Adding one string to Info.plist switches it on; nothing in this file changes.
 */

export type GeoState =
  /** Not asked yet. */
  | { status: "idle" }
  /** Waiting on the device. */
  | { status: "locating" }
  | { status: "ready"; coords: LatLng }
  /** The user said no. Do not ask again — the browser will not allow it anyway. */
  | { status: "denied" }
  /** No geolocation here at all: insecure origin, or iOS without the plist key. */
  | { status: "unavailable" }
  | { status: "error"; message: string }

/** Are we inside the Capacitor shell rather than a browser? */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform() === true
}

/** Long enough for a cold GPS fix, short enough not to look hung. */
const TIMEOUT_MS = 10_000
/** A minute-old fix is fine for "which locker is nearest". */
const MAX_AGE_MS = 60_000

/**
 * OUR OWN deadline, because the API's is not one.
 *
 * `PositionOptions.timeout` only bounds how long the device may spend ACQUIRING
 * a fix once permission exists. It does not bound the permission step, and — as
 * observed on the iOS app — a WKWebView with no `NSLocationWhenInUseUsageDescription`
 * in Info.plist drops the request entirely: no success callback, no error
 * callback, nothing, forever. The button sat on "Se caută…" until the page was
 * reloaded.
 *
 * So a timer runs alongside the request and settles the state if neither
 * callback has arrived. Slightly longer than TIMEOUT_MS so a genuine slow fix
 * still gets to report its own, more specific, error first.
 */
const WATCHDOG_MS = 13_000

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" })

  // Permissions API only READS the current state; it never prompts. Knowing up
  // front that permission was already granted lets the UI offer "lockers near
  // me" without implying a dialog, and knowing it was denied lets it not offer
  // at all rather than dangling a button that cannot work.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ status: "unavailable" })
      return
    }
    let alive = true
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((res) => {
        if (!alive) return
        if (res.state === "denied") setState({ status: "denied" })
      })
      .catch(() => {
        // Safari has historically not supported querying this. Not knowing is
        // fine: the button stays available and the prompt decides.
      })
    return () => {
      alive = false
    }
  }, [])

  const prime = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ status: "unavailable" })
      return
    }
    setState({ status: "locating" })

    // Whichever of the three outcomes lands first wins, and the other two are
    // ignored. Without this, a late callback arriving after the watchdog would
    // flip the UI back out of the state it had just settled into.
    let settled = false
    const settle = (next: GeoState) => {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      setState(next)
    }

    const watchdog = setTimeout(() => {
      settle({
        status: "error",
        message: isNativeApp()
          ? "Locația nu răspunde. Aplicația trebuie actualizată din App Store."
          : "Locația nu răspunde.",
      })
    }, WATCHDOG_MS)

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => settle({ status: "ready", coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
        (err) => {
          // PERMISSION_DENIED = 1. Distinguished from a timeout or a device with
          // no fix, because only one of those is worth offering a retry for.
          if (err.code === err.PERMISSION_DENIED) settle({ status: "denied" })
          else if (err.code === err.POSITION_UNAVAILABLE) settle({ status: "unavailable" })
          else settle({ status: "error", message: "Nu am putut afla locația." })
        },
        { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
      )
    } catch {
      // Some WebViews throw synchronously rather than calling the error
      // callback. Without this the watchdog would be the only thing that ever
      // ended the spinner, thirteen seconds later.
      settle({ status: "unavailable" })
    }
  }, [])

  return { state, prime }
}
