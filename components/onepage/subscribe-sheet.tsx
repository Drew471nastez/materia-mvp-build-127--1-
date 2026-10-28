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
 *
 * ROUND 41, the owner: "use the creator's avatar dynamically in the modal;
 * the subscribed state very smooth and clean", and it must not hide the
 * page's scrollbar (./onepage-dialog useStillPage). The creator's photo (or
 * their video's still) heads it. The form and the subscribed state are laid
 * in the same place, one over the other, so the card is the taller one's
 * height from the start and never changes size: subscribing fades the form
 * out and the done state in, a check settles onto the photo, and the words
 * change under it. Opacity, translate and scale only.
 */
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import { Check } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import { PosterVideo } from "./poster-video"
import { OnePageDialog, SheetClose } from "./onepage-dialog"

export function OnePageSubscribeSheet({
  open,
  onClose,
  dark,
  sellerName,
  sellerId,
  onepageId,
  avatarUrl = null,
  avatarVideoUrl = null,
}: {
  open: boolean
  onClose: () => void
  dark: boolean
  sellerName: string
  sellerId: string | null
  onepageId: string
  /** The creator's photo, and their video if the page shows one. */
  avatarUrl?: string | null
  avatarVideoUrl?: string | null
}) {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const field = useRef<HTMLInputElement>(null)
  const doneButton = useRef<HTMLButtonElement>(null)

  /* Subscribed: the focus moves with the eye, to Done, once the form has faded. */
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => doneButton.current?.focus({ preventScroll: true }), 320)
    return () => window.clearTimeout(t)
  }, [done])

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not go through. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)"
  const pane = (on: boolean): React.CSSProperties => ({
    gridArea: "1 / 1",
    opacity: on ? 1 : 0,
    translate: on ? "0 0" : done ? "0 -6px" : "0 6px",
    transition: `opacity 260ms ${ease} ${on ? "90ms" : "0ms"}, translate 320ms ${ease} ${on ? "90ms" : "0ms"}`,
    visibility: on ? "visible" : "hidden",
    pointerEvents: on ? "auto" : "none",
  })

  return (
    <OnePageDialog open={open} onClose={onClose} dark={dark} label={`Subscribe to ${sellerName}`} width={400}>
      <div className="relative px-5 pb-6 pt-1 sm:px-6 sm:pt-6" data-onepage-subscribe-sheet="" data-subscribed={done ? "" : undefined}>
        <div className="absolute right-4 top-1 sm:right-5 sm:top-5">
          <SheetClose onClose={onClose} />
        </div>

        {/* The creator, with a check that settles onto the photo once they are subscribed. */}
        <div className="relative mx-auto mt-3 h-16 w-16 sm:mt-1" data-subscribe-avatar="">
          <div className="relative h-16 w-16 overflow-hidden rounded-full shadow-[0_0_0_1px_var(--sheet-rule)]">
            {avatarVideoUrl ? (
              <PosterVideo src={avatarVideoUrl} fallback={onePageImageSrc(avatarUrl, 128)} alt={sellerName} />
            ) : (
              <AppAvatar src={onePageImageSrc(avatarUrl, 128)} name={sellerName} alt={sellerName} size={64} tone={dark ? "dark" : "light"} kind="mark" sizedByClass className="flex h-16 w-16 text-[22px] font-semibold" />
            )}
          </div>
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-[#16a34a] text-white shadow-[0_0_0_3px_var(--sheet-bg)]"
            style={{ opacity: done ? 1 : 0, scale: done ? "1" : "0.4", transition: `opacity 200ms ${ease} 120ms, scale 380ms cubic-bezier(0.34, 1.56, 0.64, 1) 120ms` }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        </div>

        {/* Both states in one place: the card is the taller one's height from the start, so it never resizes. */}
        <div className="mt-4 grid text-center">
          <div style={pane(!done)} aria-hidden={done || undefined}>
            <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[var(--sheet-ink)]">Subscribe to {sellerName}</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--sheet-muted)]">Get emails from {sellerName}. Unsubscribe any time.</p>
            <form onSubmit={submit} className="mt-5 text-left">
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
                disabled={busy || done}
                tabIndex={done ? -1 : undefined}
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
                disabled={busy || done || !email.trim()}
                tabIndex={done ? -1 : undefined}
                className="mt-3 h-12 w-full rounded-2xl bg-[var(--sheet-ink)] text-[15px] font-semibold text-[var(--sheet-on-ink)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Subscribing" : "Subscribe"}
              </button>
            </form>
          </div>
          <div style={pane(done)} aria-hidden={!done || undefined} role="status" className="flex flex-col">
            <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[var(--sheet-ink)]">You&apos;re subscribed</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--sheet-muted)]">
              {done ? `The next email from ${sellerName} goes to ${email.trim()}.` : "\u00a0"}
            </p>
            <button
              ref={doneButton}
              type="button"
              onClick={onClose}
              tabIndex={done ? undefined : -1}
              className="mt-auto h-12 w-full rounded-2xl bg-[var(--sheet-field)] text-[15px] font-medium text-[var(--sheet-ink)] transition-opacity hover:opacity-80"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </OnePageDialog>
  )
}
