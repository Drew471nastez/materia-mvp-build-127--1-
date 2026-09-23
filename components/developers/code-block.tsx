/**
 * A code sample. Highlighted on the server from tokens, so the page ships
 * coloured markup and no highlighter.
 */
import { highlight, type TokenKind } from "@/lib/developers/highlight"
import { CopyButton } from "./copy-button"

const COLOUR: Record<TokenKind, string> = {
  comment: "text-[#7c7f93] italic",
  string: "text-[#a7f3d0]",
  template: "text-[#c4b5fd]",
  tag: "text-[#93c5fd]",
  attr: "text-[#fde68a]",
  property: "text-[#fde68a]",
  number: "text-[#fdba74]",
  keyword: "text-[#c4b5fd]",
  punct: "text-[#9ca3af]",
}

const LABEL: Record<string, string> = {
  storelib: ".storelib", html: "HTML", css: "CSS", json: "JSON", js: "JavaScript", ts: "TypeScript", md: "Markdown", text: "",
}

export function CodeBlock({ code, lang, title }: { code: string; lang: string; title?: string }) {
  const tokens = highlight(code, lang)
  const label = title ?? LABEL[lang] ?? lang
  return (
    <figure className="group my-6 overflow-hidden rounded-xl bg-[#1a1a2e] ring-1 ring-black/5">
      <figcaption className="flex h-10 items-center justify-between border-b border-white/[0.08] pl-4 pr-2">
        <span className="truncate font-mono text-[12px] text-neutral-400">{label}</span>
        <CopyButton text={code} />
      </figcaption>
      <pre className="overflow-x-auto px-4 py-4 text-[13px] leading-[1.7] text-[#e6e6ef] [scrollbar-width:thin]">
        <code className="font-mono">
          {tokens.map((t, i) => (t.kind ? <span key={i} className={COLOUR[t.kind]}>{t.text}</span> : t.text))}
        </code>
      </pre>
    </figure>
  )
}
