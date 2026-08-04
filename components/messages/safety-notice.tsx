"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, X } from "lucide-react"

/**
 * The one thing a marketplace has to say before two strangers start talking.
 *
 * Every platform where money changes hands between people who have never met
 * carries this, in the conversation rather than in a help page, because the
 * moment it matters is the moment somebody is being asked for their IBAN or
 * their phone number "so we can arrange it outside the app". Depop, Vinted and
 * eBay all put it at the top of the thread; it is the cheapest fraud control
 * there is, and the only one that works before anything has gone wrong.
 *
 * Three deliberate choices about how it behaves:
 *
 * It is DISMISSIBLE AND STAYS DISMISSED. A banner that returns on every visit
 * is furniture people learn to scroll past — which is worse than not having
 * one, because it trains the exact habit it exists to interrupt. Once per
 * device, and it is gone.
 *
 * It renders NOTHING until the stored answer has been read. Rendering it and
 * then removing it a frame later is a flash of a warning at the top of every
 * conversation, which is both ugly and, on a screen this carefully sequenced,
 * the most visible thing on it.
 *
 * And it is short. A paragraph of safety copy is a paragraph nobody reads; two
 * lines that name the actual behaviour — do not take it off Storelib, do not
 * hand over personal details — is what somebody takes in while reaching for the
 * keyboard.
 */

const KEY = "storelib_chat_safety_dismissed_v1"

export function SafetyNotice() {
  /** null while unknown — see above. */
  const [show, setShow] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== "1")
    } catch {
      // Private mode, or storage disabled. Showing it is the safe failure:
      // a notice seen twice is better than a warning nobody ever gets.
      setShow(true)
    }
  }, [])

  if (!show) return null

  return (
    <div className="px-1 pb-3 pt-1">
      <div className="relative flex items-start gap-2.5 rounded-2xl border border-[#7c3aed]/15 bg-[#7c3aed]/[0.055] px-3.5 py-3 pr-9">
        <ShieldCheck className="mt-[1px] h-[18px] w-[18px] shrink-0 text-[#7c3aed]" strokeWidth={2.2} />
        <p className="text-[13px] leading-[1.45] text-neutral-600">
          <span className="font-semibold text-neutral-800">Ai grijă.</span>{" "}
          Plătește și discută doar prin Storelib. Nu trimite date personale, IBAN, cod
          de card sau poze cu actele — nimeni de la Storelib nu ți le cere niciodată.
        </p>
        <button
          type="button"
          aria-label="Închide"
          onClick={() => {
            setShow(false)
            try {
              localStorage.setItem(KEY, "1")
            } catch {
              /* it will be shown again, which is the harmless direction */
            }
          }}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors active:bg-black/[0.06]"
        >
          <X className="h-[15px] w-[15px]" />
        </button>
      </div>
    </div>
  )
}
