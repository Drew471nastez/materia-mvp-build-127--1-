"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, X } from "lucide-react"

/**
 * The one thing a marketplace has to say before two strangers start talking.
 *
 * Every platform where money moves between people who have never met carries
 * this, in the conversation rather than in a help page, because the moment it
 * matters is the moment somebody is being asked for their IBAN "so we can
 * arrange it outside the app". It is the cheapest fraud control there is and
 * the only one that works before anything has gone wrong.
 *
 * ---------------------------------------------------------------------------
 * Why it is a chip and not a card
 * ---------------------------------------------------------------------------
 * The first version was a full-width panel with an icon column and three lines
 * of copy, and it was wrong in a way worth naming: the biggest, boldest thing
 * on the screen was a warning nobody had asked for, sitting on top of the
 * conversation somebody had actually come to read. Safety copy that shouts is
 * safety copy that gets dismissed unread, which leaves you with the liability
 * and none of the protection.
 *
 * A quiet centred chip is what the apps this is measured against use, for the
 * same reason. It is legible, it is one line, and it does not pretend to be
 * more important than the exchange it sits above.
 *
 * It is STICKY, so scrolling back through a long history does not lose it — the
 * conversation moves under it and it stays at the top of the reading area,
 * which is the one place it is any use. And it is dismissible, permanently: a
 * banner that returns on every visit trains the exact habit it exists to
 * interrupt.
 *
 * It renders nothing until the stored answer has been read, because rendering
 * it and removing it a frame later is a flash of a warning at the top of every
 * conversation.
 */

const KEY = "storelib_chat_safety_dismissed_v1"

export function SafetyNotice() {
  /** null while unknown — see above. */
  const [show, setShow] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== "1")
    } catch {
      // Private mode, or storage disabled. Showing it is the safe failure: a
      // notice seen twice beats a warning nobody ever gets.
      setShow(true)
    }
  }, [])

  if (!show) return null

  return (
    <div className="sticky top-0 z-10 flex justify-center pb-2.5">
      <span className="flex max-w-full items-center gap-1.5 rounded-full border border-black/[0.05] bg-white/85 py-1 pl-2.5 pr-1 shadow-[0_1px_3px_rgba(15,15,15,0.05)] backdrop-blur-md">
        <ShieldCheck className="h-[13px] w-[13px] shrink-0 text-[#7c3aed]" strokeWidth={2.4} />
        {/* ONE LINE, and the length was measured rather than guessed. At 11.5px
            in a 390px column this chip has about 300px of room for text before
            it wraps, and a wrapped pill is 41px tall with the shield stranded
            beside two lines — which is the panel this replaced, in a smaller
            font. Rendered five candidates in Chromium: 62 chars wraps, 53 fits
            at 84% of the width, 48 fits at 78%. This one, and it keeps both
            halves of the warning: do not hand over bank details, and pay
            through us. `whitespace-nowrap` so a longer translation is caught in
            review rather than quietly wrapping in production. */}
        <span className="whitespace-nowrap text-[11.5px] leading-[1.35] text-neutral-500">
          Nu da date bancare. Plătește doar prin Storelib.
        </span>
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
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors active:bg-black/[0.06]"
        >
          <X className="h-[12px] w-[12px]" strokeWidth={2.4} />
        </button>
      </span>
    </div>
  )
}
