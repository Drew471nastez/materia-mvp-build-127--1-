"use client"

import { useId, useLayoutEffect, useState } from "react"
import {
  readAuthSnapshot,
  subscribeAuthSnapshot,
} from "@/lib/auth/auth-snapshot"

type Audience = "guest" | "buyer" | "creator"
/** Header-verified auth snapshot, never a new auth request. No-JS guest forms
 * retain existing /signup email prefill and seller intent. */
export function HeroCta() {
  const id = useId()
  const [invalid, setInvalid] = useState(false)
  const [audience, setAudience] = useState<Audience>("guest")
  useLayoutEffect(() => {
    const read = () => {
      const snapshot = readAuthSnapshot()
      setAudience(
        !snapshot?.signedIn ? "guest" : snapshot.isSeller ? "creator" : "buyer",
      )
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
        hidden={audience !== "guest"}
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
        hidden={audience !== "guest"}
      >
        Start for free
      </a>
      {audience !== "guest" && (
        <a
          className="cinematic-primary cinematic-account"
          href={audience === "creator" ? "/app" : "/account"}
        >
          {audience === "creator" ? "Dashboard" : "Account"}
        </a>
      )}
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
