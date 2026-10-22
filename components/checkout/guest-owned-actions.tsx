"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSitePaint } from "@/lib/appearance/site-paint-context"

interface GuestOwnedActionsProps {
  /** The order this browser's signed note names (lib/receipts/guest-access.ts). Never its receipt token. */
  orderId: string
  /** The address it was paid with, masked as the receipt masks it. */
  maskedEmail: string | null
  /** Somebody is signed in, with an account that does not own this yet. */
  signedIn: boolean
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  mutedColor?: string
}

/**
 * ===========================================================================
 *  OWNED, BOUGHT WITHOUT AN ACCOUNT
 * ===========================================================================
 * Under the Download button on a product page this browser bought as a
 * guest, in place of View in Library (there is no library to view):
 *
 *   Open receipt    the receipt, through /api/receipt/open, which checks the
 *                   browser's note again; the token stays out of this page.
 *   Save it         signed out: make an account (or sign in, which the sign
 *                   up form switches to for an address that has one); the
 *                   order joins it at /auth/continue once the address is
 *                   verified, when it is the address the order was paid with.
 *   Add to library  signed in with an account that does not own it: the same
 *                   claim as the receipt's button, proven by the note.
 */
export function GuestOwnedActions({ orderId, maskedEmail, signedIn, backgroundColor, textColor, borderColor, mutedColor }: GuestOwnedActionsProps) {
  const paint = useSitePaint()
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  /* Back to this product once the account is made and the address verified (lib/auth/continue.ts checks it). */
  const saveHref = `/signup?next=${encodeURIComponent(usePathname() || "/")}`

  const add = async () => {
    setAdding(true)
    setNote(null)
    try {
      const res = await fetch("/api/purchases/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })
      if (res.ok) {
        router.refresh()
        return
      }
      setNote(res.status === 409 ? "This order is already in another account." : "It was not added. Try again in a minute.")
    } catch {
      setNote("No connection. Try again.")
    } finally {
      setAdding(false)
    }
  }

  const button = "relative z-10 flex min-h-[44px] w-full items-center justify-center rounded-md border px-4 text-[14px] font-medium transition-colors"
  const style = {
    backgroundColor: paint(backgroundColor, "bg") || "transparent",
    color: paint(textColor, "ink") || "inherit",
    borderColor: paint(borderColor, "line") || "var(--border)",
  }
  const muted = { color: paint(mutedColor, "ink") || "var(--muted-foreground)" }

  return (
    <div data-guest-owned="" className="space-y-2">
      <a href={`/api/receipt/open?order=${encodeURIComponent(orderId)}`} data-open-receipt="" className={button} style={style}>
        Open receipt
      </a>
      {signedIn ? (
        <button type="button" onClick={add} disabled={adding} data-guest-add="" className={`${button} disabled:opacity-60`} style={style}>
          {adding ? "Adding" : "Add to library"}
        </button>
      ) : null}
      <p className="text-center text-[13px] leading-snug" style={muted} role={note ? "status" : undefined}>
        {note ??
          (signedIn ? (
            maskedEmail ? `Bought without an account, with ${maskedEmail}.` : "Bought without an account."
          ) : (
            <>
              {maskedEmail ? `Bought without an account, with ${maskedEmail}. ` : "Bought without an account. "}
              <a
                href={saveHref}
                data-guest-save=""
                className="font-medium underline underline-offset-2"
                style={{ color: paint(textColor, "ink") || "inherit" }}
              >
                Save it to your account
              </a>
            </>
          ))}
      </p>
    </div>
  )
}
