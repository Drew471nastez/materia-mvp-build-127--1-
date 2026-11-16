"use client"

import { useId, useLayoutEffect, useState } from "react"
import {
  readAuthSnapshot,
  subscribeAuthSnapshot,
} from "@/lib/auth/auth-snapshot"

type Audience = "guest" | "buyer" | "creator"
/** Header-verified auth snapshot, never a new auth request. No-JS guest forms
 * retain existing /signup email prefill and seller intent. */
/** Runs inline in the hero before its first paint: who is here, from the snapshot, as html[data-sl-aud]. */
export const HERO_AUDIENCE_BOOT = `try{var s=JSON.parse(localStorage.getItem("_sl_auth_v1")||"null");document.documentElement.dataset.slAud=s&&s.signedIn===true?(s.isSeller?"creator":"buyer"):"guest"}catch(e){}`

export function HeroCta() {
  const id = useId()
  const [invalid, setInvalid] = useState(false)
  const [audience, setAudience] = useState<Audience>("guest")
  /*
   * Landing round 12 (the owner's recording: the hero's buttons popped). Signed in, the page was painted with the
   * guest's email box and swapped to Dashboard only once this script had loaded. The hero now says who is here
   * before its first paint (HERO_AUDIENCE_BOOT, an inline script reading the same snapshot) as
   * html[data-sl-aud], and the stylesheet shows the right buttons from that first frame. All of them are always in
   * the markup, so the server's HTML and React's agree; this keeps the mark right if the snapshot changes later.
   */
  useLayoutEffect(() => {
    const read = () => {
      const snapshot = readAuthSnapshot()
      const next: Audience = !snapshot?.signedIn ? "guest" : snapshot.isSeller ? "creator" : "buyer"
      document.documentElement.dataset.slAud = next
      setAudience(next)
    }
    read()
    return subscribeAuthSnapshot(read)
  }, [])
  return (
    <div className="cinematic-actions" data-audience={audience}>
      <form
        action="/signup"
        method="get"
        className="cinematic-signup"
        data-hero-signup=""
      >
        <input type="hidden" name="intent" value="sell" />
        <label htmlFor={id} className="cinematic-sr-only">
          Email address
        </label>
        <input
          id={id}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          enterKeyHint="go"
          maxLength={254}
          placeholder="Enter your email address"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onInvalid={() => setInvalid(true)}
          onInput={() => setInvalid(false)}
        />
        <button type="submit">Start for free</button>
        {invalid && (
          <p id={`${id}-error`} className="cinematic-error" role="alert">
            Enter a valid email address, or leave it empty to continue.
          </p>
        )}
      </form>
      <a
        className="cinematic-primary cinematic-desktop-signup"
        href="/signup?intent=sell"
      >
        Start for free
      </a>
      <a className="cinematic-primary cinematic-account" data-for="creator" href="/app">
        Dashboard
      </a>
      <a className="cinematic-primary cinematic-account" data-for="buyer" href="/account">
        Account
      </a>
      <form
        action="/explore"
        method="get"
        role="search"
        aria-label="Marketplace"
        className="cinematic-search"
      >
        <label htmlFor={`${id}-search`} className="cinematic-sr-only">
          Search marketplace
        </label>
        <input
          id={`${id}-search`}
          type="search"
          name="q"
          placeholder="Search marketplace"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" aria-label="Search marketplace">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
        </button>
      </form>
      <a href="/explore" className="cinematic-marketplace">
        Explore marketplace
      </a>
    </div>
  )
}
