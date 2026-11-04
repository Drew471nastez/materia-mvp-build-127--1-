"use client"

import * as React from "react"

import { cx } from "@/app/admin/_console/ui"

/**
 * The blog admin's own pieces, on the console's surface
 * (app/admin/_console/ui.tsx): the bar every blog page shares, a settings
 * section, a field, a switch. Nothing here has a colour of its own.
 */

/** A select or input that sits in a row with others: the field's look without its full width. */
export const inline =
  "h-10 min-w-0 rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-2.5 text-[13px] text-[#ededf0] outline-none focus:border-[#8b5cf6]/70 sm:h-9"

export const field =
  "w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[13px] text-[#ededf0] outline-none placeholder:text-[#5c5c66] focus:border-[#8b5cf6]/70 disabled:opacity-60"

const PLACES = [
  { href: "/admin/blog", label: "Posts" },
  { href: "/admin/blog/library", label: "Library" },
  { href: "/admin/blog/dashboard", label: "Traffic" },
  { href: "/admin/blog/seo", label: "Search" },
]

/** The bar on every blog admin page: back to the console, the blog's places, and the page's own actions on the right. */
export function BlogBar({ current, children, title }: { current?: string; children?: React.ReactNode; title?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0b0b0f]/95 backdrop-blur-[6px]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <a href="/admin" className="shrink-0 text-[13px] font-semibold text-[#ededf0] max-sm:hidden" aria-label="Storelib admin">
          Admin
        </a>
        <span aria-hidden className="text-[#3a3a44] max-sm:hidden">
          /
        </span>
        {title ?? (
          <nav aria-label="Blog" className="-mx-1 flex min-w-0 gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PLACES.map((p) => (
              <a
                key={p.href}
                href={p.href}
                aria-current={current === p.href ? "page" : undefined}
                className={cx(
                  "flex h-8 shrink-0 items-center rounded-[7px] px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70",
                  current === p.href ? "bg-white/[0.07] font-medium text-[#ededf0]" : "text-[#9b9ba6] hover:text-[#ededf0]",
                )}
              >
                {p.label}
              </a>
            ))}
          </nav>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </header>
  )
}

export function Section({ title, children, aside, id }: { title: string; children: React.ReactNode; aside?: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="border-b border-white/[0.08] px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.06em] text-[#9b9ba6]">{title}</h2>
        {aside}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Field({ label, hint, warn, children, count }: { label: string; hint?: React.ReactNode; warn?: React.ReactNode; count?: { n: number; max: number }; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-[#9b9ba6]">{label}</span>
        {count ? <span className={cx("text-[11px] tabular-nums", count.n > count.max ? "text-[#d4a72c]" : "text-[#6b6b76]")}>{count.n}/{count.max}</span> : null}
      </span>
      {children}
      {warn ? <span className="mt-1 block text-[12px] leading-4 text-[#d4a72c]">{warn}</span> : hint ? <span className="mt-1 block text-[12px] leading-4 text-[#6b6b76]">{hint}</span> : null}
    </label>
  )
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[13px] text-[#ededf0]">{label}</span>
        {hint ? <span className="block text-[12px] leading-4 text-[#6b6b76]">{hint}</span> : null}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-5 w-9 rounded-full bg-white/[0.12] transition-colors peer-checked:bg-[#8b5cf6] peer-focus-visible:ring-2 peer-focus-visible:ring-[#8b5cf6]/70" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[#ededf0] transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  )
}

/** A post's state as a dot and a word, as the console says every status. */
export function PostStatusDot({ status, label }: { status: "draft" | "scheduled" | "published"; label?: string }) {
  const colour = status === "published" ? "#3fb950" : status === "scheduled" ? "#d4a72c" : "#6b6b76"
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-[#c9c9d1]">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colour }} />
      <span className="truncate">{label ?? (status === "published" ? "Published" : status === "scheduled" ? "Scheduled" : "Draft")}</span>
    </span>
  )
}

export function Needs345({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[8px] border border-white/[0.08] px-3 py-2 text-[12px] leading-4 text-[#9b9ba6]">{children}</p>
}

const pad = (n: number) => String(n).padStart(2, "0")

/** An ISO time as the value a datetime-local input takes, in the browser's own zone. */
export function toLocalInput(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatWhen(iso: string | null | undefined, withTime = true): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) })
}

export function formatAgo(iso: string | null | undefined): string {
  if (!iso) return ""
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`
  return formatWhen(iso, false)
}
