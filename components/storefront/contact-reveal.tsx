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
 * WHAT THIS DOES AND DOES NOT DO. The address is not in the rendered page
 * until somebody presses the button, so a scraper reading the DOM of a
 * creator page does not come away with it. It IS still in the page's data,
 * because the server sent it to draw this button — a determined harvester
 * reading the payload will find it. Saying otherwise would be a comfortable
 * lie. Keeping it out of the payload entirely means fetching it on the click
 * from an endpoint that can rate-limit, which is a bigger change than the
 * one being made here.
 *
 * ONE CONTROL, TWO PLACES: the About block and the header's meta line. The
 * header is the only one a page is guaranteed to have — About is a section a
 * creator may never add — and two different affordances for the same thing
 * on one page is how a page starts to look assembled rather than designed.
 */

import { useState } from "react"
import { Check, Copy, Mail } from "lucide-react"

import { cn } from "@/lib/utils"

export function ContactReveal({
  email,
  className,
  iconClassName,
  /** The address is wider than the word; a tight row says so. */
  maxWidthClassName = "max-w-[220px]",
}: {
  email: string
  className?: string
  iconClassName?: string
  maxWidthClassName?: string
}) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!email) return null

  if (!shown) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={(e) => {
          /* In the builder the canvas catches clicks to select a section;
             revealing is this button's own business either way. */
          e.stopPropagation()
          setShown(true)
        }}
        className={cn("inline-flex items-center gap-1.5 underline-offset-4 hover:underline", className)}
        style={{ color: "inherit" }}
      >
        <Mail aria-hidden className={cn("h-4 w-4 opacity-70", iconClassName)} />
        Contact
      </button>
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
