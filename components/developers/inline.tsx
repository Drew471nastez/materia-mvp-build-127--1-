/**
 * Inline markdown as React elements: `code`, **bold**, *emphasis* and
 * [text](href). Nothing is ever passed as HTML, so a code sample reading
 * `<script>` is five characters on the page and nothing else.
 */
import Link from "next/link"
import type { ReactNode } from "react"

import { MONO } from "./type"

const PATTERN = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g

export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(PATTERN)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const t = m[0]
    if (m[1]) {
      out.push(
        <code key={key++} className={`rounded-md bg-[#f1f2f4] px-1.5 py-0.5 text-[0.85em] text-[#1a1a2e] [overflow-wrap:break-word] ${MONO}`}>
          {t.slice(1, -1)}
        </code>,
      )
    } else if (m[2]) {
      out.push(<strong key={key++} className="font-semibold text-[#1a1a2e]"><Inline text={t.slice(2, -2)} /></strong>)
    } else if (m[3]) {
      out.push(<em key={key++}>{t.slice(1, -1)}</em>)
    } else if (m[4]) {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? []
      const cls = "font-medium text-[#1a1a2e] underline decoration-[#c4c7cf] underline-offset-4 transition-colors hover:decoration-[#1a1a2e]"
      /* Internal pages go through the router; a text file and the outside world do not. */
      out.push(
        href.startsWith("/") && !/\.txt$/.test(href) ? (
          <Link key={key++} href={href} className={cls}><Inline text={label} /></Link>
        ) : href.startsWith("#") || href.startsWith("/") ? (
          <a key={key++} href={href} className={cls}><Inline text={label} /></a>
        ) : (
          <a key={key++} href={href} className={cls} target="_blank" rel="noopener noreferrer"><Inline text={label} /></a>
        ),
      )
    }
    last = at + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}
