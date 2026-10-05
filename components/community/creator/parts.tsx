"use client"

/**
 * ===========================================================================
 *  THE PIECES EVERY COMMUNITY SECTION IN /app SHARES
 * ===========================================================================
 * Drawn in the /app language the Orders, Products and Memberships screens
 * already speak (app/app/orders/order-parts): the same card, the same near
 * black action, the same fields and switches. Nothing here is a library
 * default; a library is only used for what it does (the dialog, the sheet,
 * the menu), and is dressed to match.
 */
import * as React from "react"
import Link from "next/link"
import { ChevronsUpDown, ImagePlus, Loader2, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonPrimary as appPrimary, buttonSecondary as appSecondary, card, RowMenuButton } from "@/app/app/orders/order-parts"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { PickSheet, type PickOption } from "@/app/app/products/pick-sheet"
import { SAVED_CHECK_MS, SaveButton, barButton, type SavePhase } from "@/app/app/products/new/editor-buttons"

/* The app's buttons, 40px tall on a phone so a thumb finds them; 32px on a computer as everywhere in /app. */
export const buttonPrimary = cn(appPrimary, "max-sm:h-10 max-sm:px-3.5")
export const buttonSecondary = cn(appSecondary, "max-sm:h-10 max-sm:px-3.5")
export { card }

/** The width every section's content keeps, the same as the bar above it. */
export const SECTION_WIDTH = "max-w-[1080px]"

/** A text field, as the memberships settings draw one: 16px on a phone so iOS does not zoom. */
export const field =
  "block w-full min-w-0 rounded-lg border border-[#e1e3e7] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#a2a7b0] hover:border-[#d2d5da] focus:border-[#1a1a2e]/50 focus:shadow-[0_0_0_3px_rgba(26,26,46,0.07)] disabled:bg-[#f7f7f8] disabled:text-[#6b7280] sm:text-[14px]"

export const selectField = cn(
  field,
  "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8 sm:h-10",
)

export const label = "mb-1.5 block text-[13px] font-medium text-[#4b5563]"

/** A request from a screen: JSON in, JSON out, and a plain sentence when the connection drops. */
export async function send<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; field?: string } }> {
  try {
    const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T & { error?: string; field?: string } }
  } catch {
    return { ok: false, status: 0, data: { error: "The connection dropped. Nothing was saved. Try again." } as T & { error?: string } }
  }
}

/** What an error code from a route means to the person who pressed the button. */
export function errorText(error: string | undefined, fallback = "That did not save. Try again."): string {
  switch (error) {
    case "forbidden":
      return "Your role in this community cannot do that."
    case "not_found":
      return "That is not there any more. Refresh the page."
    case "archived":
      return "This community is archived. Bring it back to change it."
    case "communities_off":
      return "Communities are switched off on Storelib right now."
    case "sign_in":
      return "Sign in again to continue."
    case "not_allowed":
      return "Your role in this community cannot do that."
    case "not_set_up":
      return "Tickets need the database update (run-now part 105)."
    case "full":
      return "That event is full. Raise the capacity first."
    case "no_payment":
      return "There is no payment on that ticket to give back."
    case "refund_failed":
      return "Stripe refused the refund. Try again, or check the payment in Stripe."
    case undefined:
    case "":
      return fallback
    default:
      return /^[a-z_]+$/.test(error) ? fallback : error
  }
}

/** Whether the screen is a phone's (under 640px), read after the first paint. */
export function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])
  return phone
}

/* ── A pill toast, as the memberships screen shows one ─────────────────── */

const ToastContext = React.createContext<(text: string) => void>(() => {})

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [text, setText] = React.useState<string | null>(null)
  const timer = React.useRef(0)
  const show = React.useCallback((t: string) => {
    setText(t)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setText(null), 3200)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--app-nav-room,0px)+1rem)] z-50 flex justify-center px-4 md:bottom-6">
        {text ? <p className="pointer-events-auto rounded-full bg-[#1a1a2e] px-4 py-2 text-[13.5px] font-medium text-white shadow-lg">{text}</p> : null}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => React.useContext(ToastContext)

/* ── Layout ─────────────────────────────────────────────────────────────── */

/** A card with a heading, the way the settings screens group things. */
export function Section({ title, hint, action, children, className, id }: { title?: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn(card, "px-4 py-4 sm:px-5 sm:py-5", className)}>
      {title || action ? (
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{title}</h2> : null}
            {hint ? <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">{hint}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div className={title || action ? "mt-3.5" : undefined}>{children}</div>
    </section>
  )
}

/* ── Lists: one white card whose first row is its toolbar ────────────────── */

export interface FilterTab<T extends string> {
  value: T
  label: string
  count?: number
  /** The count in amber: something is waiting (requests, open reports). */
  attention?: boolean
}

/**
 * The views of a list, as the memberships screen draws its member filters:
 * a word and a count, the one on filled grey, no borders. 40px tall on a
 * phone, 32px from 768px. They scroll sideways when they do not fit.
 */
export function FilterTabs<T extends string>({ tabs, value, onChange, label: name, className }: { tabs: FilterTab<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  const strip = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const s = strip.current
    const el = s?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!s || !el) return
    const left = el.offsetLeft - s.offsetLeft
    if (left < s.scrollLeft || left + el.offsetWidth > s.scrollLeft + s.clientWidth) s.scrollTo({ left: Math.max(0, left - 16) })
  }, [value])
  return (
    <div ref={strip} role="tablist" aria-label={name} data-filter-tabs="" className={cn("flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-hide", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          data-filter={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-100 md:h-8 md:rounded-lg md:px-2.5 md:text-[13px]",
            value === t.value ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
          )}
        >
          {t.label}
          {typeof t.count === "number" ? <span className={cn("tabular-nums", t.attention && t.count > 0 ? "text-[#b45309]" : "text-[#9ca3af]")}>{t.count.toLocaleString("en-US")}</span> : null}
        </button>
      ))}
    </div>
  )
}

/**
 * A list in one card, the way Products and a membership's Members draw
 * theirs: the card's first row holds the views on the left and the list's
 * actions on the right, a second optional row the search and filters, then
 * the rows. Nothing floats above the card, so a section is one box.
 */
export function ListCard({ head, actions, toolbar, children, className, busy, ...rest }: { head?: React.ReactNode; actions?: React.ReactNode; toolbar?: React.ReactNode; children: React.ReactNode; className?: string; busy?: boolean } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest} aria-busy={busy || undefined} className={cn(card, "overflow-hidden", className)}>
      {head || actions ? (
        <div data-list-head="" className="flex min-h-[52px] items-center gap-2 border-b border-[#eef0f2] py-1.5 pl-1.5 pr-2 md:min-h-12 md:pl-2 md:pr-3">
          <div className="min-w-0 flex-1">{head}</div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      {toolbar ? (
        <div data-toolbar="" className="flex min-h-12 items-center gap-1 border-b border-[#eef0f2] pl-1 pr-1.5 md:min-h-11 md:pl-2 md:pr-3">
          {toolbar}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** A short line of quiet words in a list card's head, where a list has no views (Spaces, Classroom). */
export function ListNote({ children }: { children: React.ReactNode }) {
  return <p className="truncate px-2 text-[13px] text-[#6b7280]">{children}</p>
}

/** The products search: no box of its own, a magnifier, and the rest of the row. 16px on a phone so iOS does not zoom. */
export function SearchField({ value, onChange, placeholder, label: name }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <label data-search="" className="flex h-11 min-w-0 flex-1 cursor-text items-center gap-2 pl-2 md:h-9">
      <Search aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
      <input
        type="search"
        enterKeyHint="search"
        aria-label={name}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 80))}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] md:text-[13.5px] [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-[#9ca3af] hover:text-[#4b5563] md:h-8 md:w-8">
          <X aria-hidden className="h-4 w-4" />
        </button>
      ) : null}
    </label>
  )
}

/** A thin upright line between two parts of a toolbar. */
export function ToolbarDivider() {
  return <span aria-hidden className="h-6 w-px shrink-0 bg-[#e5e7eb] md:h-5" />
}

/**
 * A filter as Products picks its view: the choice as a word with an up and
 * down chevron, opening a sheet on a phone and the app's dropdown from 768px
 * (app/app/products/pick-sheet).
 */
export function PickButton({ name, title, options, value, onPick, align = "start" }: { name: string; title: string; options: readonly PickOption[]; value: string; onPick: (v: string) => void; align?: "start" | "end" }) {
  const current = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? ""
  return (
    <PickSheet
      name={name}
      title={title}
      options={options}
      value={value}
      onPick={onPick}
      align={align}
      trigger={
        <button
          type="button"
          data-pick={name}
          aria-label={`${title}: ${current}. Change`}
          className="flex h-11 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[14px] font-medium text-[#1a1a2e] outline-none transition-colors duration-100 active:bg-[#f1f2f4] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] md:h-8 md:px-2 md:text-[13px] md:hover:bg-[#f4f4f6] md:data-open:bg-[#ececef]"
        >
          <span>{current}</span>
          <ChevronsUpDown aria-hidden className="h-4 w-4 text-[#6b7280] md:h-[15px] md:w-[15px]" />
        </button>
      }
    />
  )
}

/** The short line when a list has nothing in it, and the one thing to do about it. */
export function Empty({ title, detail, children }: { title: string; detail?: string; children?: React.ReactNode }) {
  return (
    <div data-empty="" className="px-6 py-10 text-center">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      {detail ? <p className="mx-auto mt-1 max-w-sm text-[13.5px] leading-relaxed text-[#6b7280]">{detail}</p> : null}
      {children ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  )
}

/** A message in a band above a form: an error in red, anything else in amber. */
export function Notice({ tone = "error", children }: { tone?: "error" | "warn" | "info"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-2.5 text-[13.5px] leading-snug",
        tone === "error" ? "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]" : tone === "warn" ? "border-[#fde68a] bg-[#fffbeb] text-[#92400e]" : "border-[#e5e7eb] bg-[#f7f7f8] text-[#4b5563]",
      )}
    >
      {children}
    </p>
  )
}

/* ── Controls ───────────────────────────────────────────────────────────── */

/** The /app switch, with its label beside it and a 44px press area on a phone. */
export function Toggle({ checked, onChange, title, hint, disabled, id }: { checked: boolean; onChange: (next: boolean) => void; title: string; hint?: string; disabled?: boolean; id?: string }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 rounded-lg py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-[#1a1a2e]">{title}</span>
        {hint ? <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6b7280]">{hint}</span> : null}
      </span>
      <span aria-hidden className={switchTrack(checked)}>
        <span className={switchKnob(checked)} />
      </span>
    </button>
  )
}

/** A few choices side by side, one picked: the segmented control the coupons screen uses. */
export function Segmented<T extends string>({ value, onChange, options, label: name, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={name} className={cn("inline-flex rounded-[10px] bg-[#eef0f2] p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-10 flex-[1_0_auto] items-center justify-center whitespace-nowrap rounded-[8px] px-3 text-[13.5px] font-medium transition-colors duration-100 sm:h-8",
            value === o.value ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_0.5px_rgba(16,24,40,0.06)]" : "text-[#4b5563] hover:text-[#1a1a2e]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Choices with a line under each, one picked: who can join, what a space is for. */
export function ChoiceCards<T extends string>({ value, onChange, options, label: name, columns = 3, rows }: { value: T; onChange: (v: T) => void; options: { value: T; title: string; detail: string }[]; label: string; columns?: 2 | 3; rows?: boolean }) {
  /* Inside a card: radio rows with a hairline between them, no box round each one (no card inside a card). */
  if (rows)
    return (
      <div role="radiogroup" aria-label={name} className="-my-1 divide-y divide-[#f1f2f4]">
        {options.map((o) => {
          const on = value === o.value
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} data-choice={o.value} onClick={() => onChange(o.value)} className="flex min-h-[52px] w-full cursor-pointer items-start gap-3 py-2.5 text-left">
              <span aria-hidden className={cn("mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors", on ? "border-[#1a1a2e]" : "border-[#b5b5bd]")}>
                {on ? <span className="h-2 w-2 rounded-full bg-[#1a1a2e]" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-[#1a1a2e]">{o.title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6b7280]">{o.detail}</span>
              </span>
            </button>
          )
        })}
      </div>
    )
  return (
    <div role="radiogroup" aria-label={name} className={cn("grid grid-cols-1 gap-2", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-choice={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-[64px] cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-[border-color,box-shadow,background-color] duration-100",
              on ? "border-[#1a1a2e] bg-white shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e1e3e7] bg-white hover:border-[#c9ccd2]",
            )}
          >
            <span aria-hidden className={cn("mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-[#1a1a2e]" : "border-[#b5b5bd]")}>
              {on ? <span className="h-2 w-2 rounded-full bg-[#1a1a2e]" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-[#1a1a2e]">{o.title}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6b7280]">{o.detail}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** A price in dollars with a $ inside the field. */
export function PriceInput({ id, value, onChange, placeholder, invalid }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">$</span>
      <input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))} placeholder={placeholder} aria-invalid={invalid || undefined} className={cn(field, "h-11 pl-7 tabular-nums sm:h-10", invalid && "border-[#dc2626]")} />
    </div>
  )
}

/* ── Pictures ───────────────────────────────────────────────────────────── */

/**
 * A logo or a cover, uploaded through the same pipeline as a product's
 * pictures (lib/storage/chunked-upload: checked, stripped, stored in the
 * public picture bucket).
 */
export function PicturePick({ value, onChange, shape, name, onError }: { value: string | null; onChange: (url: string | null) => void; shape: "square" | "wide"; name: string; onError?: (message: string) => void }) {
  const input = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    const uploader = new DirectUploader({ file, folder: "product-images" })
    try {
      const result = await uploader.start()
      if (result.publicUrl) onChange(result.publicUrl)
    } catch (e) {
      onError?.((e as { message?: string })?.message || "The picture did not upload.")
    } finally {
      uploader.destroy()
      setBusy(false)
    }
  }
  const box = shape === "square" ? "h-16 w-16 rounded-2xl" : "h-16 w-full max-w-[208px] rounded-xl sm:w-[208px]"
  return (
    <div className="flex min-w-0 items-center gap-3" data-picture={shape}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={value ? `Change the ${name}` : `Add a ${name}`}
        className={cn("relative grid shrink-0 cursor-pointer place-items-center overflow-hidden border text-[#9ca3af] transition-colors", box, value ? "border-transparent" : "border-dashed border-[#d9dce1] bg-[#fafafb] hover:border-[#b9bdc4] hover:text-[#6b7280]")}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : busy ? (
          <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
        ) : (
          <ImagePlus aria-hidden className="h-5 w-5" />
        )}
        {value && busy ? (
          <span className="absolute inset-0 grid place-items-center bg-white/70">
            <Loader2 aria-hidden className="h-5 w-5 animate-spin text-[#1a1a2e]" />
          </span>
        ) : null}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = "" }} />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className={cn(buttonSecondary, "h-10 sm:h-8")}>
          {busy ? "Uploading" : value ? "Change" : shape === "square" ? "Upload logo" : "Upload cover"}
        </button>
        {value ? (
          <button type="button" onClick={() => onChange(null)} className="inline-flex min-h-10 items-center gap-1 px-0.5 text-[12.5px] sm:min-h-8 font-medium text-[#6b7280] hover:text-[#1a1a2e]">
            <X aria-hidden className="h-3.5 w-3.5" />
            Remove
          </button>
        ) : (
          <span className="px-0.5 text-[12px] text-[#9ca3af]">{shape === "square" ? "Square, 400px or more" : "Wide, about 3 to 1"}</span>
        )}
      </div>
    </div>
  )
}

/* ── Menus and dialogs ──────────────────────────────────────────────────── */

/** A row's three dots: a dropdown on a computer, a bottom sheet on a phone. */
export function RowMenu({ items, label: name, keepSpace }: { items: ActionMenuItem[]; label: string; keepSpace?: boolean }) {
  /* A row with nothing in its menu keeps the menu's place, so the buttons beside it line up with the other rows'. */
  if (items.length === 0) return keepSpace ? <span aria-hidden className="inline-block h-8 w-8 shrink-0 max-sm:h-10 max-sm:w-10" /> : null
  return <ResponsiveActionMenu align="end" title={name} items={items} trigger={<RowMenuButton label={name} className="max-sm:h-10 max-sm:w-10" />} />
}

/** A dialog on a computer, a sheet on a phone, with a title and the actions at its foot. */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const phone = usePhone()
  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={title} className={cn("gap-0 p-0 sm:rounded-2xl", wide ? "sm:max-w-[620px]" : "sm:max-w-[480px]")}>
      <div className="flex max-h-[min(80vh,760px)] min-h-0 flex-col">
        <div className="px-5 pb-1 pt-5">
          <SheetDialogTitle className="text-[17px] font-semibold text-[#1a1a2e]">{title}</SheetDialogTitle>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-[#f1f2f4] px-5 py-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
      </div>
    </SheetDialog>
  )
}

/** Asks before something that cannot be taken back, with the reason field when one helps. */
export function Confirm({
  open,
  onClose,
  title,
  detail,
  action,
  danger,
  busy,
  onConfirm,
  reason,
}: {
  open: boolean
  onClose: () => void
  title: string
  detail?: string
  action: string
  danger?: boolean
  busy?: boolean
  onConfirm: (reason: string) => void
  reason?: boolean
}) {
  const [text, setText] = React.useState("")
  React.useEffect(() => {
    if (open) setText("")
  }, [open])
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => onConfirm(text)} className={cn(danger ? "inline-flex h-10 items-center justify-center rounded-lg bg-[#b42318] px-4 text-[13px] font-medium text-white hover:bg-[#9a1d14] disabled:opacity-50 sm:h-9" : cn(buttonPrimary, "h-10 px-4 sm:h-9"))}>
            {busy ? "Working" : action}
          </button>
        </>
      }
    >
      {detail ? <p className="text-[14px] leading-relaxed text-[#4b5563]">{detail}</p> : null}
      {reason ? (
        <div className="mt-3">
          <label htmlFor="confirm-reason" className={label}>
            Reason (kept in the audit log)
          </label>
          <input id="confirm-reason" value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} className={cn(field, "h-11 sm:h-10")} placeholder="Optional" />
        </div>
      ) : null}
    </Dialog>
  )
}

/** A link that looks like the secondary button. */
export function LinkButton({ href, children, className, external }: { href: string; children: React.ReactNode; className?: string; external?: boolean }) {
  if (external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cn(buttonSecondary, className)}>
        {children}
      </a>
    )
  return (
    <Link href={href} className={cn(buttonSecondary, className)}>
      {children}
    </Link>
  )
}

/** "Mar 4" or "Mar 4, 2025", from a timestamp, in the viewer's zone. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  const sameYear = new Date(t).getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(t)
}

/* ── The product editor's cards and save foot (round 13) ────────────────── */

/**
 * The card and heading of the product editor (app/app/products/new
 * product-editor.tsx CARD and CARD_TITLE), so New community and the
 * Settings forms read as the same editor as New product.
 */
export const EDITOR_CARD = "scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:space-y-5 sm:py-6"
export const EDITOR_CARD_TITLE = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"

/**
 * THE SAVE FOOT OF A FORM: the product editor's foot bar (its state dot and
 * word on the left, Cancel and Save on the right, the editor's own
 * SaveButton with its spinner and check), as a card that stays at the
 * bottom of the screen while the form scrolls: above the navigation pill on
 * a phone, 12px off the bottom on a computer. It is always there, so the
 * way to save never appears and disappears under a finger; with nothing
 * changed it says so, Cancel and Save rest grey. Cancel throws the changes
 * away (nothing is saved yet, so nothing needs asking).
 */
export function EditorFoot({
  dirty,
  busy,
  error,
  onSave,
  onCancel,
  busyText,
  idleText = "No changes",
}: {
  dirty: boolean
  busy: boolean
  error: string | null
  onSave: () => void
  onCancel: () => void
  /** What the foot says while something other than the save is working (an upload). */
  busyText?: string
  idleText?: string
}) {
  const [phase, setPhase] = React.useState<SavePhase>("idle")
  const [savedOnce, setSavedOnce] = React.useState(false)
  const was = React.useRef(false)
  /* Saving while the request is out; Saved with the check for a moment when it came back clean. */
  React.useEffect(() => {
    if (busy) {
      was.current = true
      setPhase("saving")
      return
    }
    if (!was.current) return
    was.current = false
    if (error || dirty) return setPhase("idle")
    setPhase("saved")
    setSavedOnce(true)
  }, [busy, error, dirty])
  React.useEffect(() => {
    if (phase !== "saved") return
    const t = window.setTimeout(() => setPhase("idle"), SAVED_CHECK_MS)
    return () => window.clearTimeout(t)
  }, [phase])
  React.useEffect(() => {
    if (dirty) setSavedOnce(false)
  }, [dirty])
  const state = error ? "error" : busyText ? "busy" : dirty ? "dirty" : savedOnce ? "saved" : "idle"
  const words = error ?? (busyText || (dirty ? "Unsaved changes" : savedOnce ? "Saved" : idleText))
  return (
    <div className="sticky bottom-[calc(var(--app-nav-room,0px)+0.75rem)] z-20 mt-4 md:bottom-3" data-editor-foot="" data-state={state}>
      <div className={cn(card, "flex min-h-14 items-center gap-2 py-2 pl-4 pr-2.5 shadow-[0_10px_28px_-12px_rgba(17,24,39,0.24),0_1px_3px_rgba(0,0,0,0.05)] sm:pr-3")}>
        <p role="status" className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px] leading-5">
          <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", error ? "bg-[#d92d20]" : dirty ? "bg-[#8b5cf6]" : savedOnce ? "bg-[#22a06b]" : "bg-[#b6bac1]")} />
          <span className={cn("truncate", error ? "text-[#b42318]" : dirty ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{words}</span>
        </p>
        <button type="button" onClick={onCancel} disabled={!dirty || busy} className={cn(barButton, "disabled:cursor-default disabled:opacity-50")} data-foot-cancel="">
          Cancel
        </button>
        <SaveButton phase={phase} disabled={!dirty || !!busyText} saved={savedOnce} onSave={onSave} />
      </div>
    </div>
  )
}

/** A card of the product editor: its heading, a quiet line under it, then the fields. */
export function EditorCard({ title, hint, children, id, className }: { title: string; hint?: React.ReactNode; children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={cn(EDITOR_CARD, className)} data-editor-card={id ?? ""}>
      <div>
        <h2 className={EDITOR_CARD_TITLE}>{title}</h2>
        {hint ? <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}
