"use client"

import { useState } from "react"

/**
 * Copies a code sample as written. The only client code in a docs page's
 * body. 40px tall, so a thumb finds it on a phone.
 */
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        } catch {
          /* A browser that refuses the clipboard leaves the text selectable. */
        }
      }}
      className="flex h-10 min-w-16 shrink-0 items-center justify-center rounded-lg px-3 text-[12px] font-medium text-[#9ca3af] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/60"
      aria-label={done ? "Copied" : "Copy code"}
    >
      <span aria-live="polite">{done ? "Copied" : "Copy"}</span>
    </button>
  )
}
