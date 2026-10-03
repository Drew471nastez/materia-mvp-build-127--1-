"use client"

/**
 * A member's words as they typed them: paragraphs and line breaks kept,
 * addresses made into links (opened in a new tab, marked as somebody else's),
 * @names set in ink. Never markup: the text is drawn as text.
 */
import { Fragment, useLayoutEffect, useRef, useState } from "react"

const TOKEN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|(^|[^a-z0-9_.@])(@[a-z0-9_][a-z0-9_.-]{0,38}[a-z0-9_]|@[a-z0-9_])/gi

export function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0
    if (m[1]) {
      if (start > last) out.push(text.slice(last, start))
      out.push(
        <a key={i++} href={m[1]} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-words font-medium text-[#1a1a2e] underline decoration-[#c9ccd3] underline-offset-2 hover:decoration-[#1a1a2e]">
          {m[1].replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
          {m[1].replace(/^https?:\/\/(www\.)?/, "").length > 60 ? "..." : ""}
        </a>,
      )
      last = start + m[0].length
    } else if (m[3]) {
      const at = start + m[2].length
      if (at > last) out.push(text.slice(last, at))
      out.push(
        <span key={i++} className="font-medium text-[#1a1a2e]">
          {m[3]}
        </span>,
      )
      last = at + m[3].length
    }
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function BodyText({ text, clamp = false, className = "" }: { text: string; clamp?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(!clamp)
  const [long, setLong] = useState(false)
  useLayoutEffect(() => {
    if (!clamp || open) return
    const el = ref.current
    if (el) setLong(el.scrollHeight > el.clientHeight + 4)
  }, [clamp, open, text])
  const paragraphs = text.split(/\n[ \t]*\n+/).filter((p) => p.trim())
  return (
    <div className={className}>
      <div ref={ref} className={`space-y-2.5 whitespace-pre-wrap break-words text-[15px] leading-[1.6] text-[#262633] ${!open ? "max-h-[11.2em] overflow-hidden" : ""}`}>
        {paragraphs.map((p, n) => (
          <p key={n}>
            {p.split("\n").map((line, j, all) => (
              <Fragment key={j}>
                {inline(line)}
                {j < all.length - 1 ? <br /> : null}
              </Fragment>
            ))}
          </p>
        ))}
      </div>
      {clamp && !open && long ? (
        <button type="button" onClick={() => setOpen(true)} className="-mb-2 inline-flex h-10 items-center text-[14px] font-medium text-[#6b7280] hover:text-[#1a1a2e]">
          See more
        </button>
      ) : null}
    </div>
  )
}
