"use client"

/**
 * ===========================================================================
 *  THE CARD FORM INSIDE THE IOS AND ANDROID APPS
 * ===========================================================================
 * The apps are Capacitor shells around storelib.com, and in their WebView
 * Stripe.js navigates the whole app away from the checkout (its Link
 * prewarm and its fraud-signal iframe both do). So the app keeps the path it
 * already had: plain fields, sent straight to Stripe's own API with the
 * publishable key (never to Storelib's server), and the payment confirmed by
 * the server. See handleNativePay in checkout-client.tsx.
 *
 * Only the look is new. The autocomplete names are the standard ones, so the
 * phone's saved card and its scan-a-card offer still appear in the keyboard.
 */

import * as React from "react"
import { Field, TextInput } from "./ui"

export interface NativeCard {
  number: string
  expiry: string
  cvc: string
  name: string
}

export const EMPTY_CARD: NativeCard = { number: "", expiry: "", cvc: "", name: "" }

export function nativeCardComplete(c: NativeCard): boolean {
  const digits = c.number.replace(/\D/g, "")
  return digits.length >= 13 && digits.length <= 19 && /^\d{2}\/\d{2}$/.test(c.expiry) && /^\d{3,4}$/.test(c.cvc)
}

export function NativeCardFields({ value, onChange }: { value: NativeCard; onChange: (next: NativeCard) => void }) {
  return (
    <div className="space-y-3 rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] p-4">
      <Field id="native-card-number" label="Card number">
        <TextInput
          id="native-card-number"
          type="tel"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 1234 1234 1234"
          value={value.number}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 19)
            onChange({ ...value, number: digits.replace(/(\d{4})(?=\d)/g, "$1 ") })
          }}
          className="tracking-[0.04em] tabular-nums"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="native-card-expiry" label="Expiration date">
          <TextInput
            id="native-card-expiry"
            type="tel"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM / YY"
            value={value.expiry}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "").slice(0, 4)
              onChange({ ...value, expiry: raw.length <= 2 ? raw : `${raw.slice(0, 2)}/${raw.slice(2)}` })
            }}
            maxLength={5}
            className="tabular-nums"
          />
        </Field>
        <Field id="native-card-cvc" label="Security code">
          <TextInput
            id="native-card-cvc"
            type="tel"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="CVC"
            value={value.cvc}
            onChange={(e) => onChange({ ...value, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            maxLength={4}
            className="tabular-nums"
          />
        </Field>
      </div>
      <Field id="native-card-name" label="Name on card">
        <TextInput
          id="native-card-name"
          autoComplete="cc-name"
          placeholder="Full name on card"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value.slice(0, 80) })}
        />
      </Field>
    </div>
  )
}
