"use client"

import { useId, useState } from "react"

/** Same /signup endpoint and email prefill used by existing auth screens.
 * GET also works before hydration; no account or marketing consent is created here. */
export function HeroCta() {
  const id = useId()
  const [invalid, setInvalid] = useState(false)
  return (
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
  )
}
