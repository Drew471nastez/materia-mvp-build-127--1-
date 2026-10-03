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
import { ImagePlus, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonPrimary, buttonSecondary, card, RowMenuButton } from "@/app/app/orders/order-parts"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { DirectUploader } from "@/lib/storage/chunked-upload"

export { buttonPrimary, buttonSecondary, card }

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
            "inline-flex h-9 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[8px] px-3 text-[13.5px] font-medium transition-colors duration-100 sm:h-8",
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
export function ChoiceCards<T extends string>({ value, onChange, options, label: name, columns = 3 }: { value: T; onChange: (v: T) => void; options: { value: T; title: string; detail: string }[]; label: string; columns?: 2 | 3 }) {
  return (
    <div role="radiogroup" aria-label={name} className={cn("grid gap-2", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
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
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className={cn(buttonSecondary, "h-9 sm:h-8")}>
          {busy ? "Uploading" : value ? "Change" : shape === "square" ? "Upload logo" : "Upload cover"}
        </button>
        {value ? (
          <button type="button" onClick={() => onChange(null)} className="inline-flex min-h-8 items-center gap-1 px-0.5 text-[12.5px] font-medium text-[#6b7280] hover:text-[#1a1a2e]">
            <X aria-hidden className="h-3.5 w-3.5" />
            Remove
          </button>
        ) : (
          <span className="px-0.5 text-[12px] text-[#9ca3af]">{shape === "square" ? "Square, 400px or more" : "Wide, 1500 by 500 works well"}</span>
        )}
      </div>
    </div>
  )
}

/* ── Menus and dialogs ──────────────────────────────────────────────────── */

/** A row's three dots: a dropdown on a computer, a bottom sheet on a phone. */
export function RowMenu({ items, label: name }: { items: ActionMenuItem[]; label: string }) {
  if (items.length === 0) return null
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
