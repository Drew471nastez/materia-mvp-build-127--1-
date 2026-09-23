"use client"

import { useState } from "react"

/** Copies a code sample as written. The only client code in a docs page's body. */
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
      className="rounded-md px-2 py-1 text-[12px] font-medium text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
      aria-label="Copy code"
    >
      {done ? "Copied" : "Copy"}
    </button>
  )
}
