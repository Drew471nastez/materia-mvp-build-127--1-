"use client"

/**
 * A NEW STORELIB ACCOUNT, AND WHERE ITS VISIT CAME FROM
 *
 * Called once, from components/auth/arrival-note, when the end of a sign in
 * (app/auth/continue, app/auth/callback) has said the account is new: every
 * way in (a password, Google, Apple, the email code) ends there. It sends
 * Storelib's own touches (lib/attribution/browser platformTouches) to
 * /api/auth/signup-attribution, which checks them and writes them once.
 * Sent even with no touches: a new account with no known source is a
 * sign up too, and the figures need it in their total.
 */

import { platformTouches } from "./browser"

let sent = false

export function recordSignupTouches(): void {
  if (sent || typeof window === "undefined") return
  sent = true
  try {
    void fetch("/api/auth/signup-attribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ touches: platformTouches() }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    /* never in the way of the page */
  }
}
