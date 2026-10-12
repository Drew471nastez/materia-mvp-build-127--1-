"use client"

/**
 * The numbered steps both ways of connecting are drawn with: a number in a
 * ring, a thin line down to the next one, the step's name, and whatever the
 * step needs under it. A step that is done turns its number into a tick, so
 * the list says how far along you are without a sentence saying it.
 */
import * as React from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export function Steps({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ol className={cn("relative", className)}>{children}</ol>
}

export function Step({
  n,
  title,
  done = false,
  muted = false,
  aside,
  children,
}: {
  n: number
  title: React.ReactNode
  done?: boolean
  /** Waiting on an earlier step: drawn quieter, still readable. */
  muted?: boolean
  aside?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <li className="group/step relative flex gap-4 pb-8 last:pb-0">
      <span aria-hidden className="absolute bottom-1 left-[13px] top-9 w-px bg-white/10 group-last/step:hidden" />
      <span
        className={cn(
          "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums transition-colors duration-200",
          done ? "bg-emerald-400 text-[#0f0f0f]" : "border border-white/20 bg-[#141414] text-white/85",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
        <span className="sr-only">{done ? tt(", done") : ""}</span>
      </span>
      <div className={cn("min-w-0 flex-1 pt-[3px] transition-opacity duration-200", muted && "opacity-55")}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-[15px] font-medium text-white">{title}</p>
          {aside}
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  )
}

/** A key on the keyboard. */
export function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.07] px-2.5 font-sans text-[13px] font-medium text-white shadow-[inset_0_-2px_0_rgba(255,255,255,0.06),0_1px_0_rgba(0,0,0,0.4)]">
      {children}
    </kbd>
  )
}

/**
 * A command with its own Copy button. `disabled` draws it but will not copy
 * it: a line with a stand-in where the token goes is a trap if it can be
 * pasted.
 */
export function CommandBlock({ label, value, disabled = false }: { label?: string; value: string; disabled?: boolean }) {
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    if (disabled) return
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }
  return (
    <div className="min-w-0">
      {label && <p className="mb-1.5 text-[13px] text-white/50">{label}</p>}
      <div className={cn("flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-black/40", disabled && "opacity-60")}>
        {/* Wrapped, not scrolled sideways: on a phone a one line command
            showed its first forty characters and hid the token. Copy takes
            the exact text either way. */}
        <pre className="min-w-0 flex-1 whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-relaxed text-white/90 [overflow-wrap:anywhere]">
          {value}
        </pre>
        <button
          type="button"
          onClick={copy}
          disabled={disabled}
          aria-label={copied ? tt("Copied") : label ? `Copy: ${label}` : tt("Copy")}
          className="flex w-12 shrink-0 items-center justify-center gap-1.5 border-l border-white/10 text-[13px] font-medium text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:hover:bg-transparent sm:w-[84px]"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-300 sm:h-3.5 sm:w-3.5" strokeWidth={2.5} /> : <Copy className="h-4 w-4 sm:h-3.5 sm:w-3.5" strokeWidth={1.75} />}
          <span className="hidden sm:inline">{copied ? tt("Copied") : tt("Copy")}</span>
        </button>
      </div>
    </div>
  )
}

/** A few words of code inside a sentence. */
export function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[13px] text-white/90">{children}</code>
}
