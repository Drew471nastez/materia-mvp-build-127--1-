"use client"

/**
 * ===========================================================================
 *  THE PIECES EVERY PHYSICAL COMMERCE SCREEN IS BUILT FROM
 * ===========================================================================
 * Storelib's own look, nothing new: white cards with the hairline border
 * and soft shadow, Inter, #1a1a2e ink, grey secondary text, near black
 * primary buttons, the quiet grey focus ring the product editor uses.
 * Inputs are 44px on a phone and 40px from 640px so a thumb hits them.
 */

import * as React from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { TONE_CLASS, type Tone } from "@/lib/physical/status"
import { HowItWorks } from "@/components/app/settings/how-it-works"
import { createPortal } from "react-dom"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import type { ExplainerId } from "@/lib/settings/explainers"

export const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
export const CARD_PAD = "px-4 py-4 sm:px-6 sm:py-5"
export const CARD_TITLE = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"
export const PAGE_TITLE = "text-[24px] font-bold leading-8 text-[#1a1a2e] sm:text-[28px] sm:leading-9"
export const MUTED = "text-[13px] leading-5 text-[#6b7280] sm:text-[14px]"
export const FIELD =
  "h-11 w-full min-w-0 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[15px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)] disabled:bg-[#f8f9fa] disabled:text-[#9ca3af] sm:h-10 sm:text-[14px]"
export const BTN_PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(16,24,40,0.12)] outline-none transition-colors hover:bg-[#2a2a44] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 disabled:pointer-events-none disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
export const BTN_SECONDARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-4 text-[14px] font-medium text-[#1a1a2e] shadow-[inset_0_-1px_0_rgba(0,0,0,0.04)] outline-none transition-colors hover:bg-[#f7f7f8] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40 disabled:pointer-events-none disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
export const BTN_GHOST =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium text-[#4b5563] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40 disabled:pointer-events-none disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
export const BTN_DANGER =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#fecaca] bg-white px-4 text-[14px] font-medium text-[#b42318] outline-none transition-colors hover:bg-[#fef2f2] disabled:pointer-events-none disabled:opacity-50"

/** `help` puts a "How it works" under the card's line, opening that explanation (lib/settings/explainers.ts). */
export function Card({ title, description, action, help, children, className, id }: { title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; help?: ExplainerId; children?: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn(CARD, CARD_PAD, "scroll-mt-4", className)}>
      {title || action ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className={CARD_TITLE}>{title}</h2> : null}
            {description ? <p className={cn(MUTED, "mt-0.5")}>{description}</p> : null}
            {help ? <HowItWorks id={help} className="-ml-2 mt-1" /> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Field({ label, hint, error, children, className, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-[#374151] sm:text-[13.5px]">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12.5px] text-[#b42318]">{error}</p> : hint ? <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{hint}</p> : null}
    </div>
  )
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} {...props} className={cn(FIELD, className)} />
})

/** Dollars as typed, kept as text; cents read out with centsOf. */
export function MoneyInput({ value, onChange, placeholder = "0.00", className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void }) {
  return (
    <div className={cn("relative", className)}>
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#9ca3af]">
        $
      </span>
      <input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))}
        className={cn(FIELD, "pl-6 tabular-nums")}
      />
    </div>
  )
}

export function centsOf(typed: string | null | undefined): number | null {
  if (!typed || !typed.trim()) return null
  const n = Math.round(Number.parseFloat(typed) * 100)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function dollarsOf(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2)
}

export function money(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

export function NumberInput({ value, onChange, className, allowNegative = false, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void; allowNegative?: boolean }) {
  return (
    <input
      {...props}
      type="text"
      inputMode={allowNegative ? "text" : "numeric"}
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(allowNegative ? /[^0-9-]/g : /[^0-9]/g, "").replace(/(?!^)-/g, ""))}
      className={cn(FIELD, "tabular-nums", className)}
    />
  )
}

export function DecimalInput({ value, onChange, className, suffix, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void; suffix?: React.ReactNode }) {
  return (
    <div className="relative">
      <input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))}
        className={cn(FIELD, "tabular-nums", suffix ? "pr-12" : "", className)}
      />
      {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#9ca3af]">{suffix}</span> : null}
    </div>
  )
}

export function SelectInput({ value, onChange, children, className, ...props }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & { onChange: (v: string) => void }) {
  return (
    <div className={cn("relative", className)}>
      <select {...props} value={value} onChange={(e) => onChange(e.target.value)} className={cn(FIELD, "cursor-pointer appearance-none pr-9")}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
    </div>
  )
}

export function Toggle({ label, description, checked, onChange, disabled, id }: { label: React.ReactNode; description?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; id?: string }) {
  const auto = React.useId()
  const switchId = id ?? auto
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={switchId} className="min-w-0 cursor-pointer">
        <span className="block text-[14px] font-medium leading-5 text-[#1a1a2e]">{label}</span>
        {description ? <span className="mt-0.5 block text-[13px] leading-[18px] text-[#6b7280]">{description}</span> : null}
      </label>
      <Switch id={switchId} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5 shrink-0" />
    </div>
  )
}

export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-medium leading-4", TONE_CLASS[tone], className)}>{children}</span>
}

export function Notice({ tone = "red", children, className }: { tone?: "red" | "amber" | "green" | "gray"; children: React.ReactNode; className?: string }) {
  const tones = {
    red: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]",
    amber: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
    green: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
    gray: "border-[#e5e7eb] bg-[#f8f9fa] text-[#4b5563]",
  }
  return (
    <div role={tone === "red" ? "alert" : "status"} className={cn("rounded-xl border px-3.5 py-2.5 text-[13.5px] leading-5", tones[tone], className)}>
      {children}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      {children ? <p className="mt-1 max-w-[420px] text-[14px] leading-[21px] text-[#6b7280]">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/** Countries to ship to: search, tick, see what is chosen. */
export function CountryPicker({ value, onChange, taken }: { value: string[]; onChange: (v: string[]) => void; taken?: string[] }) {
  const [query, setQuery] = React.useState("")
  const chosen = new Set(value)
  const q = query.trim().toLowerCase()
  const list = COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q).slice(0, 300)
  return (
    <div className="space-y-2">
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <button key={c} type="button" onClick={() => onChange(value.filter((x) => x !== c))} className="inline-flex h-7 items-center gap-1 rounded-full bg-[#f1f2f4] pl-2.5 pr-1.5 text-[12.5px] font-medium text-[#374151] hover:bg-[#e8e9ec]">
              {countryName(c)}
              <X aria-hidden className="h-3 w-3" />
              <span className="sr-only">Remove</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search countries" className={cn(FIELD, "pl-9")} />
      </div>
      <ul className="max-h-[220px] overflow-y-auto rounded-lg border border-[#eceef1]">
        {list.map((c) => {
          const on = chosen.has(c.code)
          const elsewhere = !on && taken?.includes(c.code)
          return (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => onChange(on ? value.filter((x) => x !== c.code) : [...value, c.code])}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] text-[#1a1a2e] hover:bg-[#f7f7f8]"
              >
                <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db] bg-white")}>{on ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}</span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {elsewhere ? <span className="shrink-0 text-[12px] text-[#9ca3af]">In another zone</span> : null}
              </button>
            </li>
          )
        })}
        {list.length === 0 ? <li className="px-3 py-3 text-[13.5px] text-[#6b7280]">No country matches.</li> : null}
      </ul>
    </div>
  )
}

/** A JSON request to the physical API, answered as data or a sentence to show. */
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; data?: Record<string, unknown> }

/*
 * SETTINGS THAT ARE ALREADY THERE WHEN THE TAB OPENS. Settings fetches what
 * its tabs read while the person is still on the first one (prefetchGet), so
 * Taxes, Shipping or Channels draw at once from what came back (peekGet)
 * instead of an empty pane that fills a beat later. Only addresses that were
 * prefetched are kept; a write to one sends a fresh read after it, so a tab
 * opened again shows what was saved.
 */
const kept = new Map<string, { at: number; result: Promise<ApiResult<unknown>>; data?: unknown }>()
const KEEP_MS = 60_000

/*
 * KEPT PAST A MINUTE, READ AGAIN BEHIND IT (round R1). A kept answer used to
 * vanish after a minute: Settings left open on Profile for longer, then
 * Store details pressed, drew grey boxes and waited for the server again,
 * "some tabs take long to load". Now an answer older than a minute is still
 * what a panel draws first (peekGet), and the read that refreshes it runs
 * behind it; the panel's own api() call then brings the fresh one.
 */
function keep(path: string): Promise<ApiResult<unknown>> {
  const previous = kept.get(path)
  const entry: { at: number; result: Promise<ApiResult<unknown>>; data?: unknown } = { at: Date.now(), result: Promise.resolve({ ok: false, error: "" }), data: previous?.data }
  entry.result = request<unknown>(path).then((r) => {
    if (r.ok) entry.data = r.data
    else if (kept.get(path) === entry) {
      /* A failed refresh keeps the last good answer to draw, marked stale so the next look asks again. */
      if (entry.data !== undefined) entry.at = 0
      else kept.delete(path)
    }
    return r
  })
  kept.set(path, entry)
  return entry.result
}

/** Fetch these now, quietly, for a tab that may open soon. */
export function prefetchGet(paths: string[]): void {
  for (const path of paths) {
    const e = kept.get(path)
    if (!e || Date.now() - e.at > KEEP_MS) void keep(path)
  }
}

/** Settles when every one of these has been read (fetched now if it wasn't kept), never with an error. An answer already kept, however old, counts as read. */
export function whenGets(paths: string[]): Promise<void> {
  const waiting = paths.filter((p) => kept.get(p)?.data === undefined)
  prefetchGet(paths)
  return Promise.all(waiting.map((p) => kept.get(p)?.result.catch(() => null) ?? Promise.resolve(null))).then(() => undefined)
}

/** Read this now even if a fresh answer is kept, and keep what comes back: for a panel whose list changes behind it (Activity). */
export function readFresh<T>(path: string): Promise<ApiResult<T>> {
  return keep(path) as Promise<ApiResult<T>>
}

/** What a prefetch already brought back for this address, for a panel's first draw: the last good answer, however old. */
export function peekGet<T>(path: string): T | null {
  const e = kept.get(path)
  return e && e.data !== undefined ? (e.data as T) : null
}

/** After a write, the kept reads it touches are read again: the same area (/api/store/taxes/...), and physical settings for any physical write. */
function refreshAfterWrite(path: string): void {
  const area = path.split("?")[0].split("/").slice(0, 4).join("/")
  for (const key of kept.keys()) {
    /* And any kept read the write sits under: DELETE /api/ai-memory/<id> reads /api/ai-memory again (its area is only three parts deep). */
    if (key.startsWith(area) || path.split("?")[0].startsWith(`${key.split("?")[0]}/`) || (path.startsWith("/api/physical/") && key.startsWith("/api/physical/settings"))) void keep(key)
  }
}

export async function api<T = Record<string, unknown>>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  const method = init?.method ?? (init?.body ? "POST" : "GET")
  if (method === "GET") {
    const e = kept.get(path)
    if (e && Date.now() - e.at <= KEEP_MS) return e.result as Promise<ApiResult<T>>
    /* A kept address read again keeps the cache fresh for the next panel that peeks. */
    if (e) return keep(path) as Promise<ApiResult<T>>
    return request<T>(path)
  }
  const r = await request<T>(path, init)
  if (r.ok && kept.size) refreshAfterWrite(path)
  return r
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "Something went wrong. Try again.", data }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, error: "The connection dropped. Try again." }
  }
}

/** A random key per action, so a double press is one change. */
export function actionKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

/** Below 640px, the breakpoint every Modal turns into the app's own bottom sheet at. */
const PHONE_QUERY = "(max-width: 639.98px)"
function subscribePhone(fn: () => void): () => void {
  const mq = window.matchMedia?.(PHONE_QUERY)
  mq?.addEventListener?.("change", fn)
  return () => mq?.removeEventListener?.("change", fn)
}
/** A phone, read from the screen and kept in step with it (false on the server). */
export function useModalPhone(): boolean {
  return React.useSyncExternalStore(subscribePhone, () => !!window.matchMedia?.(PHONE_QUERY).matches, () => false)
}

/**
 * A field typed into stays in sight. With the keyboard up the sheet's column
 * is shorter (BottomSheet aboveKeyboard), and a field near its foot would sit
 * under the keys; it is brought to the nearest edge of the scroll once the
 * keyboard has arrived, and again whenever what is visible changes size.
 */
function useFieldInView(box: React.RefObject<HTMLElement | null>, on: boolean) {
  React.useEffect(() => {
    const el = box.current
    if (!on || !el) return
    let t = 0
    const bring = () => {
      const f = document.activeElement as HTMLElement | null
      if (!f || !el.contains(f) || !/^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) return
      const a = el.getBoundingClientRect()
      const b = f.getBoundingClientRect()
      const pad = 16
      if (b.bottom > a.bottom - pad) el.scrollTop += b.bottom - a.bottom + pad
      else if (b.top < a.top + pad) el.scrollTop -= a.top + pad - b.top
    }
    const soon = () => {
      window.clearTimeout(t)
      t = window.setTimeout(bring, 280)
    }
    el.addEventListener("focusin", soon)
    window.visualViewport?.addEventListener("resize", soon)
    return () => {
      window.clearTimeout(t)
      el.removeEventListener("focusin", soon)
      window.visualViewport?.removeEventListener("resize", soon)
    }
  }, [box, on])
}

/**
 * A dialog from 640px and the app's own bottom sheet on a phone
 * (components/ui/bottom-sheet.tsx: it rises, follows the thumb, flicks
 * closed). Escape and the backdrop close it; the page behind does not
 * scroll; focus goes into it and back to what opened it.
 *
 * ON A PHONE IT SITS ON THE KEYBOARD. "Create channel is a modal where the
 * keyboard covers the inputs and you can't type." The sheet is
 * `aboveKeyboard`, its fields scroll inside it and the one being typed in is
 * kept in sight (useFieldInView), and the buttons stay at its foot, above
 * the keys.
 *
 * ON THE BODY, NOT INSIDE THE PAGE. Drawn where it was used, a modal inside
 * the phone's Settings page (a layer under the app's header and nav pill)
 * was under both. Both halves are portalled to the body.
 */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const phone = useModalPhone()
  if (phone) return <ModalSheet open={open} onClose={onClose} title={title} footer={footer} wide={wide}>{children}</ModalSheet>
  return <ModalDialog open={open} onClose={onClose} title={title} footer={footer} wide={wide}>{children}</ModalDialog>
}

function ModalSheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const body = React.useRef<HTMLDivElement>(null)
  useFieldInView(body, open)
  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      label={title}
      hideFrom={null}
      fill
      aboveKeyboard
      maxHeight={wide ? "calc(var(--vv-h, 100dvh) * 0.92)" : "calc(var(--vv-h, 100dvh) * 0.88)"}
      header={
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-2" data-modal-sheet-head="">
          <h2 className="text-[16px] font-semibold text-[#1a1a2e]">{title}</h2>
          <button type="button" data-close="" data-sheet-close="" aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-[#f3f4f6] text-[#6b7280] active:bg-[#e5e7eb]">
            <X className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        data-modal-sheet=""
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault()
        }}
      >
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2" data-modal-sheet-body="">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[#f1f2f4] bg-white px-4 pb-2 pt-3 [&_button]:min-h-11" data-modal-sheet-foot="">
            {footer}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  )
}

function ModalDialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const panel = React.useRef<HTMLDivElement>(null)
  const opener = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!open) return
    opener.current = document.activeElement as HTMLElement | null
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = "hidden"
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("input:not([data-no-autofocus]), select, textarea, button:not([data-close])")?.focus({ preventScroll: true }), 30)
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", key)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("keydown", key)
      html.style.overflow = before
      opener.current?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])
  if (!open || typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="presentation" data-modal-dialog="">
      <div className="absolute inset-0 bg-[rgba(17,24,39,0.36)] animate-in fade-in duration-150" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault()
        }}
        className={cn(
          "relative flex max-h-[min(92dvh,760px)] w-full flex-col rounded-t-2xl bg-white shadow-[0_24px_64px_-16px_rgba(17,24,39,0.28)] animate-in slide-in-from-bottom-4 duration-200 sm:mx-4 sm:rounded-2xl sm:slide-in-from-bottom-0 sm:zoom-in-95",
          wide ? "sm:max-w-[720px]" : "sm:max-w-[520px]",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#f1f2f4] px-4 py-3 sm:px-5">
          <h2 className="text-[16px] font-semibold text-[#1a1a2e]">{title}</h2>
          <button type="button" data-close="" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-[#f1f2f4] px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] sm:px-5 sm:pb-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
