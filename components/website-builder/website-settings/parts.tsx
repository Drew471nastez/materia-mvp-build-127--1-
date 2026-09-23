"use client"

/**
 * The pieces every Website Settings page is built from, drawn once so the
 * nine pages read as one place.
 *
 * The shape is a settings page's, not a form's: a card per subject, a row
 * per fact with its label on the left and its value or control on the
 * right, and a thin rule between rows. On a phone the label goes above.
 * Dark, because this page stands over the builder and the builder is dark.
 */

import * as React from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

export function PageTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <h1 className="text-[24px] font-semibold tracking-[-0.01em] md:text-[28px]">{children}</h1>
      {aside}
    </div>
  )
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 max-w-[600px] text-[14.5px] leading-relaxed text-white/55">{children}</p>
}

export function Card({ title, children, className, footer }: { title?: string; children: React.ReactNode; className?: string; footer?: React.ReactNode }) {
  return (
    <section className={cn("mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]", className)}>
      {title && <h2 className="border-b border-white/[0.07] px-5 py-3.5 text-[14px] font-semibold text-white/90 md:px-6">{title}</h2>}
      <div className="divide-y divide-white/[0.07]">{children}</div>
      {footer && <div className="border-t border-white/[0.07] px-5 py-3 text-[13px] text-white/45 md:px-6">{footer}</div>}
    </section>
  )
}

/**
 * One fact or one control. `stack` puts the control under its label at every
 * width, for the controls that need the room: a text area, an image.
 */
export function Row({
  label,
  hint,
  children,
  stack = false,
  htmlFor,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  children?: React.ReactNode
  stack?: boolean
  htmlFor?: string
}) {
  const Label = htmlFor ? "label" : "div"
  return (
    <div className={cn("flex flex-col gap-2.5 px-5 py-4 md:px-6", !stack && "md:flex-row md:items-center md:justify-between md:gap-6")}>
      <div className={cn("min-w-0", !stack && "md:flex-1")}>
        <Label {...(htmlFor ? { htmlFor } : {})} className="block text-[14.5px] font-medium text-white">
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-[13px] leading-snug text-white/45">{hint}</p>}
      </div>
      {children !== undefined && <div className={cn("min-w-0", !stack && "md:shrink-0")}>{children}</div>}
    </div>
  )
}

export const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-white/12 bg-[#171717] px-3.5 text-[14.5px] text-white outline-none transition-colors duration-150 placeholder:text-white/30 focus:border-white/35 md:w-[320px]"

export const buttonClass =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3.5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-white/[0.12] disabled:cursor-default disabled:opacity-50"

export const primaryButtonClass =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 text-[14px] font-semibold text-[#0f0f0f] transition-opacity duration-150 hover:opacity-90 disabled:cursor-default disabled:opacity-50"

type Tone = "live" | "neutral" | "attention" | "critical"

const TONE: Record<Tone, string> = {
  live: "bg-emerald-400/12 text-emerald-300",
  neutral: "bg-white/[0.08] text-white/70",
  attention: "bg-amber-400/12 text-amber-200",
  critical: "bg-red-500/15 text-red-300",
}

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12.5px] font-medium", TONE[tone])}>
      {tone === "live" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />}
      {children}
    </span>
  )
}

/** A switch. A real checkbox underneath, so a keyboard and a screen reader get one for free. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <label className="relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center">
      <input type="checkbox" className="peer sr-only" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="absolute inset-0 rounded-full bg-white/15 transition-colors duration-150 peer-checked:bg-emerald-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white/60" />
      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-transform duration-150 peer-checked:translate-x-4" />
    </label>
  )
}

/** The site's address with copy and open, the same everywhere it appears. */
export function AddressValue({ url, display }: { url: string; display: string }) {
  const [copied, setCopied] = React.useState(false)
  if (!url) return <span className="text-[14.5px] text-white/45">No address yet</span>
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate text-[14.5px] text-white/85">{display}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1400)
          })
        }}
        className="rounded-md p-1.5 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        aria-label={copied ? "Address copied" : "Copy address"}
      >
        {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md p-1.5 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Open the website"
      >
        <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
      </a>
    </span>
  )
}

/** A character count that turns amber past the length search engines show. */
export function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={cn("text-[12px] tabular-nums", value.length > max ? "text-amber-300" : "text-white/35")}>
      {value.length}/{max}
    </span>
  )
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[14px] text-red-300">{children}</p>
}

/** Settings stored with the draft say so once, under their card. */
export const GOES_LIVE = "Saved with your draft. Visitors see it after you publish."
