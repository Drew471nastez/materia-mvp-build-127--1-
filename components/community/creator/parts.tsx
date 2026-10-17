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
import { Check, ChevronDown, ChevronsUpDown, ImagePlus, Loader2, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { card, RowMenuButton, StatusBadge } from "@/app/app/orders/order-parts"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { PickSheet, type PickOption } from "@/app/app/products/pick-sheet"
import { SAVED_CHECK_MS, SaveButton, barButton, type SavePhase } from "@/app/app/products/new/editor-buttons"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

/*
  The app's buttons, 40px tall on a phone so a thumb finds them; 32px on a computer as everywhere in /app. Round 31 ("nothing
  has depth"): the depth the product editor and the Website page press with (components/ui/depth-button), a line of light on
  top and a shade along the foot, flat while pressed.
*/
export const buttonPrimary = cn(primaryDepth, "h-8 gap-1.5 rounded-lg px-3 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50", "max-sm:h-10 max-sm:px-3.5")
export const buttonSecondary = cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px]", "max-sm:h-10 max-sm:px-3.5")
export { card }

/**
 * The width every section's content keeps, the same as the bar above it. Round 32 ("too shrunk on a computer"): the
 * /app page container, as Settings, Products and the product editor keep it (1200px with its gutters), not 1080px.
 */
export const SECTION_WIDTH = "max-w-[1200px]"

/** A text field, as the memberships settings draw one: 16px on a phone so iOS does not zoom. */
export const field =
  "block w-full min-w-0 rounded-lg border border-[#e1e3e7] bg-white px-3 text-[16px] text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.04)] outline-none transition-[border-color,box-shadow] placeholder:text-[#a2a7b0] hover:border-[#d2d5da] focus:border-[#1a1a2e]/50 focus:shadow-[0_0_0_3px_rgba(26,26,46,0.07)] disabled:bg-[#f7f7f8] disabled:text-[#6b7280] disabled:shadow-none sm:text-[14px]"

export const selectField = cn(
  field,
  "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8 sm:h-10",
)

export const label = "mb-1.5 block text-[13px] font-medium text-[#4b5563]"

/* ── Where a community stands, as a badge (round 33) ────────────────────── */

export type CommunityState = "published" | "draft" | "archived" | "deleting" | "suspended"

/**
 * The state of a community from its facts: suspended by Storelib first, then on its way to being deleted (round 26:
 * scheduling a deletion archives it, and the badge says what is really happening), then archived, then published or a
 * draft.
 */
export function communityState(c: { status: string; archived?: boolean; suspended?: boolean; deleting?: unknown }): CommunityState {
  if (c.suspended || c.status === "suspended") return "suspended"
  if (c.deleting) return "deleting"
  if (c.archived || c.status === "archived") return "archived"
  return c.status === "published" ? "published" : "draft"
}

export const COMMUNITY_STATE_WORD: Record<CommunityState, string> = {
  get published() {
    return tt("Published")
  },
  get draft() {
    return tt("Draft")
  },
  get archived() {
    return tt("Archived")
  },
  get deleting() {
    return tt("Deleting")
  },
  get suspended() {
    return tt("Suspended")
  },
}

const STATE_TONE = { published: "success", draft: "neutral", archived: "neutral", deleting: "critical", suspended: "critical" } as const
const STATE_DOT: Record<CommunityState, string | null> = { published: "bg-[#22a06b]", draft: "bg-[#e0a100]", archived: "bg-[#9ca3af]", deleting: null, suspended: null }

/**
 * "The • Published text looks wrong" (round 33). The state is the badge /app gives a status everywhere (app/app/orders
 * order-parts StatusBadge), with the product editor's dot inside it for Published and Draft (product-editor.tsx
 * statusBadge): green, amber, grey for archived, the critical tone's ring for suspended.
 */
export function CommunityStatusBadge({ state, className }: { state: CommunityState; className?: string }) {
  const dot = STATE_DOT[state]
  return (
    <StatusBadge tone={STATE_TONE[state]} className={cn("shrink-0", className)}>
      {dot ? <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} /> : null}
      <span data-community-state={state}>{COMMUNITY_STATE_WORD[state]}</span>
    </StatusBadge>
  )
}

/** A request from a screen: JSON in, JSON out, and a plain sentence when the connection drops. */
export async function send<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; field?: string } }> {
  try {
    const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T & { error?: string; field?: string } }
  } catch {
    return { ok: false, status: 0, data: { error: tt("The connection dropped. Nothing was saved. Try again.") } as T & { error?: string } }
  }
}

/** What an error code from a route means to the person who pressed the button. */
export function errorText(error: string | undefined, fallback = "That did not save. Try again."): string {
  switch (error) {
    case "forbidden":
      return tt("Your role in this community cannot do that.")
    case "not_found":
      return tt("That is not there any more. Refresh the page.")
    case "archived":
      return tt("This community is archived. Bring it back to change it.")
    case "communities_off":
      return tt("Communities are switched off on Storelib right now.")
    case "sign_in":
      return tt("Sign in again to continue.")
    case "not_allowed":
      return tt("Your role in this community cannot do that.")
    case "not_set_up":
      return tt("Tickets need the database update (run-now part 105).")
    case "full":
      return tt("That event is full. Raise the capacity first.")
    case "no_payment":
      return tt("There is no payment on that ticket to give back.")
    case "refund_failed":
      return tt("Stripe refused the refund. Try again, or check the payment in Stripe.")
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
    /* Round 33: the editor card's padding, heading and line (EditorCard below), so a panel's cards in Settings read as one set. */
    <section id={id} className={cn(card, "app-card-x py-4 sm:py-6", className)}>
      {title || action ? (
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className={EDITOR_CARD_TITLE}>{title}</h2> : null}
            {hint ? <p className={EDITOR_CARD_HINT}>{hint}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div className={title || action ? "mt-4" : undefined}>{children}</div>
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
          {typeof t.count === "number" ? <span className={cn("tabular-nums", t.attention && t.count > 0 ? "text-[#b45309]" : "text-[#9ca3af]")}>{t.count.toLocaleString(appLocale())}</span> : null}
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
        <button type="button" aria-label={tt("Clear search")} onClick={() => onChange("")} className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-[#9ca3af] hover:text-[#4b5563] md:h-8 md:w-8">
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
          aria-label={tt("{title}: {current}. Change", { title, current })}
          className="flex h-11 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[14px] font-medium text-[#1a1a2e] outline-none transition-colors duration-100 active:bg-[#f1f2f4] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] md:h-8 md:px-2 md:text-[13px] md:hover:bg-[#f4f4f6] md:data-open:bg-[#ececef]"
        >
          <span>{current}</span>
          <ChevronsUpDown aria-hidden className="h-4 w-4 text-[#6b7280] md:h-[15px] md:w-[15px]" />
        </button>
      }
    />
  )
}

/**
 * The short line when a list has nothing in it, and the one thing to do about it (round 27: every list's empty state is
 * this one, with the section's glyph in a soft disc above it when it has one, and its next step as a button).
 */
export function Empty({ title, detail, children, icon: Icon }: { title: string; detail?: string; children?: React.ReactNode; icon?: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }> }) {
  return (
    <div data-empty="" className="px-6 py-12 text-center">
      {Icon ? (
        <span aria-hidden className="mx-auto mb-3.5 grid h-11 w-11 place-items-center rounded-full bg-[#f3f4f6] text-[#6b7280]" data-empty-icon="">
          <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </span>
      ) : null}
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      {detail ? <p className="mx-auto mt-1 max-w-sm text-[13.5px] leading-relaxed text-[#6b7280]">{detail}</p> : null}
      {children ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  )
}

/** A list still on its way: the app's own spinner where the rows will be, never the word alone. */
export function ListLoading() {
  return (
    <div data-list-loading="" aria-busy="true" className="grid place-items-center px-6 py-12">
      <Loader2 aria-hidden className="h-5 w-5 animate-spin text-[#9ca3af] motion-reduce:animate-none" />
      <span className="sr-only">{tt("Loading")}</span>
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

/**
 * A PICK-ONE FIELD, THE APP'S OWN (round 31: no browser select left in these
 * screens). It looks like the fields round it, the choice and a chevron, and
 * opens the Products page's pick list (app/app/products/pick-sheet): the
 * app's dropdown under it from 768px, the shared bottom sheet on a phone, a
 * check on the one chosen, the keyboard's arrows and Enter.
 */
export function SelectField<T extends string>({
  id,
  value,
  options,
  onChange,
  title,
  name,
  disabled,
  className,
}: {
  id?: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
  /** Heads the sheet and names the list. */
  title: string
  /** data-select, for the probes. */
  name: string
  disabled?: boolean
  className?: string
}) {
  const current = options.find((o) => o.value === value)?.label ?? ""
  return (
    <PickSheet
      name={name}
      title={title}
      options={options}
      value={value}
      onPick={(v) => onChange(v as T)}
      trigger={
        <button
          type="button"
          id={id}
          disabled={disabled}
          data-select={name}
          aria-label={tt("{title}: {current}. Change", { title, current })}
          className={cn(
            "flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-[#e1e3e7] bg-white pl-3 pr-2.5 text-left text-[16px] text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.04)] outline-none transition-[border-color,box-shadow,background-color] duration-100 hover:border-[#d2d5da] focus-visible:border-[#1a1a2e]/50 focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.07)] disabled:cursor-not-allowed disabled:bg-[#f7f7f8] disabled:text-[#6b7280] data-open:border-[#1a1a2e]/50 data-open:shadow-[0_0_0_3px_rgba(26,26,46,0.07)] sm:h-10 sm:text-[14px] [-webkit-tap-highlight-color:transparent]",
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{current}</span>
          <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
        </button>
      }
    />
  )
}

/** A box to tick, drawn here: a soft square, near black with a white check when on, the row its press area. */
export function CheckRow({ checked, onChange, title, hint, disabled }: { checked: boolean; onChange: (next: boolean) => void; title: string; hint?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-check-row=""
      className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-1.5 text-left outline-none transition-colors duration-100 hover:bg-[#f7f7f8] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.25)] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 [-webkit-tap-highlight-color:transparent]"
    >
      <span
        aria-hidden
        className={cn(
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-[background-color,border-color,box-shadow] duration-100",
          checked ? "border-[#1a1a2e] bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]" : "border-[#c9ccd2] bg-white shadow-[inset_0_1px_1px_rgba(16,24,40,0.06)]",
        )}
      >
        {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] text-[#1a1a2e]">{title}</span>
        {hint ? <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6b7280]">{hint}</span> : null}
      </span>
    </button>
  )
}

/** Take a row out: a quiet cross in a square that greys under the pointer, as the media tiles and the product chips do. */
export function RemoveButton({ label: name, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      onClick={onClick}
      data-remove=""
      className={cn("grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg text-[#9ca3af] outline-none transition-colors duration-100 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] active:bg-[#e8e9ec] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.25)] sm:h-8 sm:w-8", className)}
    >
      <X aria-hidden className="h-4 w-4" />
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
/** The largest picture PicturePick takes before resizing it here (a phone's 40MB photo goes up as a few hundred KB). */
const PICTURE_MAX_BYTES = 25 * 1024 * 1024
const PICTURE_TYPES = /^image\/(jpeg|png|webp|heic|heif)$/i

/*
  ROUND 27, THE OWNER: "image upload improvements". A logo or a cover now:
    shows at once, from the file itself, while it goes up (no grey box with a spinner), with how far it is as a ring;
    takes a picture dropped on it, not only one picked;
    is made the size it is shown at before it leaves the device (lib/communities member media-compress: no HDR, no
    location in the file, the long edge capped), so a phone's large photo goes up in a moment;
    says what went wrong under itself, in words, when nobody else is listening for it.
*/
/**
 * ONE PICTURE ON ITS WAY UP, for the logo, the cover and anything else that
 * takes one picture: checked, drawn at once from the file, made the size it
 * is shown at, sent, with how far it is. PicturePick and the cover
 * (./gallery-editor.tsx CoverField) both use it.
 */
export function usePictureUpload({ maxEdge, onDone, onError }: { maxEdge: number; onDone: (url: string) => void; onError: (message: string) => void }) {
  const [busy, setBusy] = React.useState(false)
  const [percent, setPercent] = React.useState(0)
  const [local, setLocal] = React.useState<string | null>(null)
  React.useEffect(() => () => {
    if (local) URL.revokeObjectURL(local)
  }, [local])
  const upload = async (picked: File | undefined) => {
    if (!picked || busy) return
    if (!PICTURE_TYPES.test(picked.type)) return onError(tt("That file is not a picture. Use a JPG, PNG or WebP."))
    if (picked.size > PICTURE_MAX_BYTES) return onError(tt("That picture is over 25MB. Pick a smaller one."))
    setBusy(true)
    setPercent(0)
    setLocal(URL.createObjectURL(picked))
    let file = picked
    try {
      const { compressPostPicture } = await import("@/components/community/member/media-compress")
      file = await compressPostPicture(picked, { maxEdge, quality: 0.86 })
    } catch {
      /* A picture the browser cannot redraw goes up as it is. */
    }
    const uploader = new DirectUploader({ file, folder: "product-images", onProgress: (p) => setPercent(Math.round(p)) })
    try {
      const result = await uploader.start()
      if (result.publicUrl) onDone(result.publicUrl)
    } catch (e) {
      onError((e as { message?: string })?.message || tt("The picture did not upload."))
      setLocal(null)
    } finally {
      uploader.destroy()
      setBusy(false)
    }
  }
  return { busy, percent, local, upload }
}

/** How far an upload is, as a ring over the picture. */
export function UploadRing({ percent }: { percent: number }) {
  const ring = 2 * Math.PI * 10
  return (
    <span className="absolute inset-0 grid place-items-center bg-black/35" data-picture-progress={percent}>
      <svg viewBox="0 0 24 24" className="h-7 w-7 -rotate-90" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" />
        <circle cx="12" cy="12" r="10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - Math.max(0.06, percent / 100))} className="transition-[stroke-dashoffset] duration-200" />
      </svg>
    </span>
  )
}

export function PicturePick({ value, onChange, shape, name, onError }: { value: string | null; onChange: (url: string | null) => void; shape: "square" | "wide"; name: string; onError?: (message: string) => void }) {
  const input = React.useRef<HTMLInputElement>(null)
  const [over, setOver] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const fail = (message: string) => {
    if (onError) onError(message)
    else setError(message)
  }
  const { busy, percent, local, upload: start } = usePictureUpload({ maxEdge: shape === "square" ? 800 : 2000, onDone: (url) => onChange(url), onError: fail })
  const upload = (picked: File | undefined) => {
    setError(null)
    void start(picked)
  }
  const box = shape === "square" ? "h-16 w-16 rounded-2xl" : "h-16 w-full max-w-[208px] rounded-xl sm:w-[208px]"
  const shown = busy ? local : value
  return (
    <div className="min-w-0" data-picture={shape}>
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            upload(e.dataTransfer.files?.[0])
          }}
          disabled={busy}
          aria-label={value ? tt("Change the {name}", { name }) : tt("Add a {name}", { name })}
          data-picture-drop={over ? "over" : undefined}
          className={cn(
            "relative grid shrink-0 cursor-pointer place-items-center overflow-hidden border text-[#9ca3af] transition-[border-color,background-color,box-shadow] duration-150",
            box,
            over ? "border-[#1a1a2e] bg-[#f1f2f4] shadow-[0_0_0_3px_rgba(26,26,46,0.08)]" : shown ? "border-transparent shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.06)]" : "border-dashed border-[#d9dce1] bg-[#fafafb] hover:border-[#b9bdc4] hover:text-[#6b7280]",
          )}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={busy ? shown : optimizedImageUrl(shown, shape === "square" ? 160 : 640)} alt="" className="absolute inset-0 h-full w-full object-cover" decoding="async" />
          ) : (
            <ImagePlus aria-hidden className="h-5 w-5" />
          )}
          {busy ? <UploadRing percent={percent} /> : null}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = "" }} />
        <div className="flex min-w-0 flex-col items-start gap-1">
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => input.current?.click()} disabled={busy} className={cn(buttonSecondary, "h-10 sm:h-8")} data-picture-change="">
              {busy ? tt("Uploading {percent}%", { percent }) : value ? tt("Change") : shape === "square" ? tt("Upload logo") : tt("Upload cover")}
            </button>
            {value && !busy ? <RemoveButton label={tt("Remove the {name}", { name })} onClick={() => onChange(null)} /> : null}
          </span>
          {!value || busy ? <span className="px-0.5 text-[12px] text-[#9ca3af]">{shape === "square" ? tt("Square, 400px or more. Or drop it here.") : tt("Wide, about 3 to 1. Or drop it here.")}</span> : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[12.5px] text-[#b42318]" data-picture-error="">
          {error}
        </p>
      ) : null}
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
            {tt("Cancel")}
          </button>
          <button type="button" disabled={busy} onClick={() => onConfirm(text)} className={cn(danger ? "inline-flex h-10 items-center justify-center rounded-lg bg-[#b42318] px-4 text-[13px] font-medium text-white hover:bg-[#9a1d14] disabled:opacity-50 sm:h-9" : cn(buttonPrimary, "h-10 px-4 sm:h-9"))}>
            {busy ? tt("Working") : action}
          </button>
        </>
      }
    >
      {detail ? <p className="text-[14px] leading-relaxed text-[#4b5563]">{detail}</p> : null}
      {reason ? (
        <div className="mt-3">
          <label htmlFor="confirm-reason" className={label}>
            {tt("Reason (kept in the audit log)")}
          </label>
          <input id="confirm-reason" value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} className={cn(field, "h-11 sm:h-10")} placeholder={tt("Optional")} />
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
  return new Intl.DateTimeFormat(appLocale(), zoned({ month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })).format(t)
}

/* ── The product editor's cards and save foot (round 13) ────────────────── */

/**
 * The card and heading of the product editor (app/app/products/new
 * product-editor.tsx CARD and CARD_TITLE), so New community and the
 * Settings forms read as the same editor as New product.
 */
export const EDITOR_CARD = "scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:space-y-5 sm:py-6"
export const EDITOR_CARD_TITLE = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"

/*
  THE SAVE BARS UP AT ONCE, one above the other: a settings panel can hold two forms (the rules and the refund policy), and
  two bars in one place would be one bar over another. Only a bar that is up and on screen (not in a hidden panel or a
  hidden section) takes a place.
*/
let footOrder: string[] = []
const footListeners = new Set<() => void>()
function setFootUp(id: string, up: boolean) {
  const has = footOrder.includes(id)
  if (up === has) return
  footOrder = up ? [...footOrder, id] : footOrder.filter((x) => x !== id)
  footListeners.forEach((f) => f())
}
const subscribeFoot = (f: () => void) => {
  footListeners.add(f)
  return () => {
    footListeners.delete(f)
  }
}
/** How far a bar stands above the one under it: its 52px and a 12px gap. */
export const FOOT_STEP_PX = 64
/** The bar's own height. */
export const FOOT_BAR_PX = 52
/** The room a page keeps under its last card for each bar that is up: a bar's place, and 24px more so the card clears it. */
export const FOOT_ROOM_PX = FOOT_STEP_PX + 24

/**
 * How many save bars are up on screen now (round 33). The page under them keeps that much more room at its foot
 * (FOOT_ROOM_PX each), so the last card is never under a bar: community-shell.tsx sets it on the section's body.
 */
export function useFootsUp(): number {
  return React.useSyncExternalStore(subscribeFoot, () => footOrder.length, () => 0)
}

/**
 * THE SAVE BAR OF A FORM (round 31). "The floating No changes / Cancel / Save
 * bar is not placed well": it sat in the page's flow, so on a phone it rode
 * over the middle of the form. It is now the /app Settings save bar
 * (components/app/settings-form-new.tsx): a white card fixed to the screen,
 * the change on the left and Cancel and Save on the right, just above the
 * navigation pill on a phone (clear of the home indicator through
 * --app-nav-top) and 16px off the bottom of the content area on a computer.
 * It rises in only while there is something to save, says Saved with the
 * editor's check for a moment after a save, and goes. Cancel throws the
 * changes away (nothing is saved yet, so nothing needs asking).
 *
 * ROUND 33, THE OWNER: the editor's foot ("Draft ... Back Save") "looks bad
 * and gets cut off": a strip in the page's flow, sticky to the foot of the
 * pane, under the phone's pill and clipped by the screen's edge. One bar now,
 * this one, for a settings form and for an editor page alike:
 *
 *   FIXED     to the screen, over the content area only (clear of the rail),
 *             above the pill and the home indicator on a phone, 16px off the
 *             bottom (or the inset, if larger) on a computer; never in the
 *             page's flow, so nothing the page does can clip it
 *   ROOM      the page keeps FOOT_ROOM_PX more at its foot for each bar that
 *             is up (useFootsUp; the community shell does it), so the last
 *             card scrolls clear of it
 *   EDITOR    with `status` the bar is always there: the page's state as a
 *             badge (Draft, Published) while nothing has changed, Unsaved
 *             changes once something has, and `onLeave` (Back) beside Save;
 *             Cancel takes Back's place while there is something to throw away
 *   COMPACT   52px, 560px wide at most, the words truncated before a button
 *             ever wraps
 */
export function EditorFoot({
  dirty,
  busy,
  error,
  onSave,
  onCancel,
  busyText,
  status,
  onLeave,
  leaveLabel,
}: {
  dirty: boolean
  busy: boolean
  error: string | null
  onSave: () => void
  onCancel: () => void
  /** What the bar says while something other than the save is working (an upload). */
  busyText?: string
  /** Kept for callers from before round 31: a bar with nothing to save is not shown, so it says nothing. */
  idleText?: string
  /** An editor page's state (round 33): the bar stays up and says it while nothing has changed. */
  status?: { word: string; tone: "success" | "neutral" | "attention" }
  /** An editor page's way out, beside Save while nothing has changed (Back to programs). */
  onLeave?: () => void
  /** Back's word, "Back" when not given. */
  leaveLabel?: string
}) {
  const [phase, setPhase] = React.useState<SavePhase>("idle")
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
  }, [busy, error, dirty])
  React.useEffect(() => {
    if (phase !== "saved") return
    const t = window.setTimeout(() => setPhase("idle"), SAVED_CHECK_MS)
    return () => window.clearTimeout(t)
  }, [phase])
  const editor = !!status
  const up = editor || dirty || busy || !!busyText || !!error || phase !== "idle"
  const state = error ? "error" : busyText ? "busy" : dirty ? "dirty" : phase === "saved" ? "saved" : "idle"
  const words = error ?? (busyText || (dirty ? tt("Unsaved changes") : phase === "saved" || !status ? tt("Saved") : status.word))
  /* An editor with nothing to throw away offers its way out instead of a Cancel that would do nothing. */
  const leaving = editor && !!onLeave && !dirty && !busy

  const id = React.useId()
  const ref = React.useRef<HTMLDivElement>(null)
  /* On screen is read after every render: a panel hidden or shown again re-renders the form inside it. */
  const upRef = React.useRef(up)
  upRef.current = up
  React.useLayoutEffect(() => {
    setFootUp(id, up && !!ref.current && ref.current.getClientRects().length > 0)
  })
  /*
    A section the shell hides keeps its form mounted and does not draw it again (community-shell.tsx), so a render alone
    would leave its bar counted while another section is shown: its room and its place in the stack. The box going to
    nothing (display: none above it) and coming back is what says it (round 33).
  */
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setFootUp(id, upRef.current && el.getClientRects().length > 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [id])
  React.useEffect(() => () => setFootUp(id, false), [id])
  const order = React.useSyncExternalStore(subscribeFoot, () => footOrder, () => footOrder)
  const slot = Math.max(0, order.indexOf(id))

  return (
    <div
      ref={ref}
      data-editor-foot=""
      data-state={state}
      data-foot={up ? "up" : "down"}
      data-app-foot={up ? "up" : "down"}
      aria-hidden={!up || undefined}
      data-foot-kind={editor ? "editor" : "form"}
      style={slot ? { translate: `0 -${slot * FOOT_STEP_PX}px` } : undefined}
      className="pointer-events-none fixed inset-x-0 bottom-[max(calc(var(--app-nav-top,0px)+10px),calc(env(safe-area-inset-bottom)+10px))] z-40 flex justify-center px-3 md:bottom-[max(16px,env(safe-area-inset-bottom))] md:left-[var(--app-rail-w,240px)] md:px-6"
    >
      <div
        role="region"
        aria-label={editor ? tt("Save") : tt("Unsaved changes")}
        data-foot-bar=""
        className={cn(
          "flex h-[52px] w-full min-w-0 max-w-[560px] items-center gap-2 rounded-[14px] border border-[#e5e7eb]/80 bg-white pl-3.5 pr-1.5 shadow-[0_10px_30px_-16px_rgba(17,24,39,0.30),0_2px_6px_-2px_rgba(17,24,39,0.08)] transition-[translate,opacity] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[translate,opacity] motion-reduce:transition-none",
          up ? "pointer-events-auto translate-y-0 opacity-100 duration-[320ms]" : "translate-y-4 opacity-0 duration-[220ms]",
        )}
      >
        <p role="status" className="flex min-w-0 flex-1 items-center gap-2 text-[14px] leading-5" data-foot-words="">
          {editor && !dirty && !error && !busyText && phase !== "saved" ? (
            <StatusBadge tone={status.tone} className="max-w-full">
              <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status.tone === "success" ? "bg-[#22a06b]" : status.tone === "attention" ? "bg-[#e0a100]" : "bg-[#9ca3af]")} />
              <span className="truncate">{status.word}</span>
            </StatusBadge>
          ) : (
            <>
              <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", error ? "bg-[#d92d20]" : dirty || busyText ? "bg-[#e8a400]" : "bg-[#22a06b]")} />
              <span className={cn("truncate", error ? "text-[#b42318]" : dirty ? "font-medium text-[#1a1a2e]" : "text-[#4b5563]")}>{words}</span>
            </>
          )}
        </p>
        {leaving ? (
          <button type="button" onClick={onLeave} className={cn(barButton, "shrink-0")} data-foot-leave="">
            {leaveLabel ?? tt("Back")}
          </button>
        ) : (
          <button type="button" onClick={onCancel} disabled={!dirty || busy} tabIndex={up ? 0 : -1} className={cn(barButton, "shrink-0 disabled:cursor-default disabled:opacity-50")} data-foot-cancel="">
            {tt("Cancel")}
          </button>
        )}
        <SaveButton phase={phase} disabled={!dirty || !!busyText} saved={phase === "saved"} onSave={onSave} />
      </div>
    </div>
  )
}

/** The quiet line under a card's heading: /app Settings' (components/physical/ui MUTED), 13px on a phone and 14px wider. */
export const EDITOR_CARD_HINT = "mt-0.5 text-[13px] leading-5 text-[#6b7280] sm:text-[14px]"

/**
 * A card of the product editor and of /app Settings: its heading, a quiet line under it, then the fields.
 *
 * Round 32: `action` puts a button at the heading's right on a computer and under the line on a phone (Add tier,
 * Publish, Archive), so a card whose whole job is one button is the heading and the button, and the line beside it
 * keeps the card's width rather than a column of its own. With no title and no action the card is its fields.
 */
export function EditorCard({ title, hint, action, children, id, className }: { title?: string; hint?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={cn(EDITOR_CARD, className)} data-editor-card={id ?? ""}>
      {title || action ? (
        <div className={action ? "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6" : undefined} data-editor-card-head="">
          <div className="min-w-0">
            {title ? <h2 className={EDITOR_CARD_TITLE}>{title}</h2> : null}
            {hint ? <p className={EDITOR_CARD_HINT}>{hint}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
