"use client"

/**
 * ===========================================================================
 *  SUBSCRIBE TO A CREATOR, FROM THE BELL ON THEIR OnePage
 * ===========================================================================
 * It was a 220px panel that grew out of the bell: frosted glass over
 * whatever the page was, a 12px title, a field and a button squeezed under
 * it, and a 2.5 second "Subscribed!" before it shrank away. On a phone it
 * sat in the corner under the visitor's thumb.
 *
 * Now it is ./onepage-dialog like Share: the app's sheet on a phone, sitting
 * on the keyboard while the field is in use; a centred card from 640px; one
 * solid surface in the page's light or dark. A real title, one line on what
 * they will get, the field and the button at full size, and a done state
 * that says where to look.
 *
 * The request is the same one the panel sent (/api/subscribe, source
 * "onepage"), with the same body.
 */
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import { pixelLead } from "@/lib/analytics/pixels"
import { OnePageDialog, SheetClose } from "./onepage-dialog"

export function OnePageSubscribeSheet({
  open,
  onClose,
  dark,
  sellerName,
  sellerId,
  onepageId,
}: {
  open: boolean
  onClose: () => void
  dark: boolean
  sellerName: string
  sellerId: string | null
  onepageId: string
}) {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const field = useRef<HTMLInputElement>(null)

  /* Opened: a fresh form, and on a desk the field is ready to type in. On a phone the keyboard waits for a tap. */
  useEffect(() => {
    if (!open) return
    setError("")
    if (window.matchMedia("(min-width: 640px)").matches) {
      const t = window.setTimeout(() => field.current?.focus({ preventScroll: true }), 120)
      return () => window.clearTimeout(t)
    }
  }, [open])

  /* After it has closed on a done state, the next open starts with the form again. */
  useEffect(() => {
    if (open || !done) return
    const t = window.setTimeout(() => {
      setDone(false)
      setEmail("")
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, done])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const address = email.toLowerCase().trim()
    if (!address) return
    if (!sellerId) {
      setError("Subscribing is not available on this page right now.")
      return
    }
    setError("")
    setBusy(true)
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, source: "onepage", source_id: onepageId, creator_id: sellerId, origin: pageOrigin() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "That did not go through. Try again.")
      setDone(true)
      /* Round 41: the store's pixels hear the signup (lib/analytics/pixels pixelLead). */
      pixelLead(window, { form: "subscribe" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not go through. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <OnePageDialog open={open} onClose={onClose} dark={dark} label={`Subscribe to ${sellerName}`} width={400}>
      <div className="px-5 pb-6 pt-1 sm:px-6 sm:pt-6" data-onepage-subscribe-sheet="">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pt-1">
            <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[var(--sheet-ink)]">
              {done ? "You're subscribed" : `Subscribe to ${sellerName}`}
            </h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--sheet-muted)]">
              {done ? `The next email from ${sellerName} goes to ${email.trim()}.` : `Get emails from ${sellerName}. Unsubscribe any time.`}
            </p>
          </div>
          <SheetClose onClose={onClose} />
        </div>

        {done ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 h-12 w-full rounded-2xl bg-[var(--sheet-field)] text-[15px] font-medium text-[var(--sheet-ink)] transition-opacity hover:opacity-80"
          >
            Done
          </button>
        ) : (
          <form onSubmit={submit} className="mt-6" noValidate={false}>
            <label htmlFor="onepage-subscribe-email" className="sr-only">
              Email address
            </label>
            <input
              ref={field}
              id="onepage-subscribe-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="go"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "onepage-subscribe-error" : undefined}
              className="h-12 w-full rounded-2xl border border-transparent bg-[var(--sheet-field)] px-4 text-[16px] text-[var(--sheet-ink)] outline-none transition-colors placeholder:text-[var(--sheet-muted)] focus:border-[var(--sheet-muted)] disabled:opacity-60"
            />
            {error ? (
              <p id="onepage-subscribe-error" role="alert" className="mt-2 text-[13.5px] text-[var(--sheet-error)]">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="mt-3 h-12 w-full rounded-2xl bg-[var(--sheet-ink)] text-[15px] font-semibold text-[var(--sheet-on-ink)] transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
            >
              {busy ? "Subscribing" : "Subscribe"}
            </button>
          </form>
        )}
      </div>
    </OnePageDialog>
  )
}
