"use client"

/**
 * ===========================================================================
 *  CONTACT, THEN THE ADDRESS
 * ===========================================================================
 * A creator page had the seller's address printed on it in full. That is one
 * line for a buyer and a free afternoon for anybody harvesting addresses, and
 * it makes a page about someone's work lead with their inbox.
 *
 * So the page offers to put you in touch, and the address appears when you
 * ask for it — which is the same number of taps as selecting and copying it
 * was, and one fewer than opening a mail client to find out what it is.
 *
 * WHAT THIS DOES. The address is in neither the rendered page nor the
 * page's data. The page hands this button the creator's handle, and only
 * when the server decided this viewer may have the address; pressing it
 * asks /api/creator-contact, which asks the same question again, rate
 * limited, and answers with the address (lib/commerce/contact-email.ts).
 * It used to be in the payload, because the server sent it to draw this
 * button, and a scraper reading the HTML of storelib.com/<name> found it.
 *
 * ONE CONTROL, TWO PLACES: the About block and the header's meta line. The
 * header is the only one a page is guaranteed to have — About is a section a
 * creator may never add — and two different affordances for the same thing
 * on one page is how a page starts to look assembled rather than designed.
 */

import { useState } from "react"
import { Check, Copy, Mail } from "lucide-react"

import { cn } from "@/lib/utils"

/** Where the button asks for the address; the route's own rule decides (app/api/creator-contact). */
export function contactAddressUrl(handle: string): string {
  return `/api/creator-contact?handle=${encodeURIComponent(handle)}`
}

export function ContactReveal({
  handle,
  className,
  iconClassName,
  /** The address is wider than the word; a tight row says so. */
  maxWidthClassName = "max-w-[220px]",
}: {
  /** The creator's handle: the address itself is fetched when the button is pressed. */
  handle: string
  className?: string
  iconClassName?: string
  maxWidthClassName?: string
}) {
  /* Empty until the button is pressed and the route answers: the address is not in the page before that. */
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "asking" | "failed">("idle")
  const [copied, setCopied] = useState(false)

  if (!handle) return null

  if (!email) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
        <button
          type="button"
          aria-expanded={false}
          aria-busy={state === "asking" || undefined}
          disabled={state === "asking"}
          onClick={(e) => {
            /* In the builder the canvas catches clicks to select a section;
               revealing is this button's own business either way. */
            e.stopPropagation()
            setState("asking")
            void (async () => {
              try {
                const res = await fetch(contactAddressUrl(handle), { credentials: "same-origin", cache: "no-store" })
                const data = (await res.json().catch(() => ({}))) as { email?: unknown }
                if (res.ok && typeof data.email === "string" && data.email) {
                  setEmail(data.email)
                  setState("idle")
                  return
                }
              } catch {
                /* Offline or refused: said below, and the button stays to try again. */
              }
              setState("failed")
            })()
          }}
          className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline disabled:opacity-60"
          style={{ color: "inherit" }}
        >
          <Mail aria-hidden className={cn("h-4 w-4 opacity-70", iconClassName)} />
          Contact
        </button>
        {state === "failed" ? (
          <span role="status" className="text-[13px] opacity-70">
            The address did not load. Try again.
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Mail aria-hidden className={cn("h-4 w-4 opacity-70", iconClassName)} />
      <a
        href={`mailto:${email}`}
        className={cn("truncate underline-offset-4 hover:underline", maxWidthClassName)}
        style={{ color: "inherit" }}
      >
        {email}
      </a>
      <button
        type="button"
        aria-label={copied ? "Address copied" : "Copy the address"}
        onClick={(e) => {
          e.stopPropagation()
          void (async () => {
            try {
              await navigator.clipboard.writeText(email)
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            } catch {
              /* A browser that refuses the clipboard is not worth a dialog:
                 the address is on screen and can be selected. */
            }
          })()
        }}
        className="rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
      >
        {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
      </button>
    </span>
  )
}
