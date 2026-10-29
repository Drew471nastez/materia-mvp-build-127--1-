"use client"

/**
 * The parts Emails › Customer emails is drawn with, shared by the store's
 * emails (components/app/settings/customer-emails-panel.tsx) and a
 * community's (./community-emails.tsx), so a row, the phone's Preview and
 * Edit switch and the preview frame are the same in both.
 *
 * THE PREVIEW IS DRAWN IN PLACE. The email is written into its sandboxed
 * frame's document (PreviewFrame), so a key typed in an editor never blanks
 * the frame or throws the preview back to its top, as a new srcDoc did, and
 * nothing in it runs.
 */
import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import type { Sent } from "@/lib/emails/activity-server"

/** The phone sheet's one height, kept whichever pane is showing, so a switch never moves its top edge. */
export const PHONE_SHEET_HEIGHT = "calc(var(--vv-h, 100dvh) * 0.9)"

/** "12 sent in 30 days · last Oct 20", or that none went. Null while it is not known. */
export function sentLine(s: Sent | undefined | null, days: number): string | null {
  if (!s) return null
  if (s.sent === 0) return tt("None sent in {days} days", { days })
  const when = s.lastAt ? new Date(s.lastAt).toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric" })) : null
  const count = tt("{n} sent in {days} days", { n: s.sent.toLocaleString(appLocale()), days })
  return when ? `${count} · ${tt("last {when}", { when })}` : count
}

/** A language's own name in the dashboard's language: "French", "Français" for a French dashboard. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([appLocale(), "en"], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}

export interface RowEmail {
  id: string
  name: string
  sentWhen: string
}

/** One email: its name, when it goes, what it sent; the whole row opens it, a switch at the end where it has one. */
export function EmailRow({ email, bare, edited, sent, note, control, onOpen, onIntent }: { email: RowEmail; bare: boolean; edited: boolean; sent: string | null; note?: string | null; control?: React.ReactNode; onOpen: () => void; /** A pointer arriving, a finger landing, a focus: what the row opens can be read ahead. */ onIntent?: () => void }) {
  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={onOpen}
        onPointerEnter={onIntent}
        onPointerDown={onIntent}
        onFocus={onIntent}
        className={cn("flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-3 text-left outline-none transition-colors duration-100 hover:bg-[#fafafa] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] [-webkit-tap-highlight-color:transparent]", bare ? "pl-4 sm:pl-5" : "pl-3.5", control ? "pr-2" : bare ? "pr-4 sm:pr-5" : "pr-3.5")}
        data-customer-email={email.id}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
            {email.name}
            {edited ? (
              <span className="text-[12px] font-normal text-[#6b7280]" data-email-edited="">
                · {tt("Edited")}
              </span>
            ) : null}
          </span>
          <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{email.sentWhen}</span>
          {note ? (
            <span className="block text-[12.5px] leading-[18px] text-[#4b5563]" data-email-note="">
              {note}
            </span>
          ) : null}
          {sent ? (
            <span className="mt-0.5 block text-[12px] tabular-nums leading-4 text-[#9ca3af] md:hidden" data-email-sent="">
              {sent}
            </span>
          ) : null}
        </span>
        {sent ? (
          <span className="hidden shrink-0 text-right text-[12.5px] tabular-nums text-[#6b7280] md:block" data-email-sent-wide="">
            {sent}
          </span>
        ) : null}
        {control ? null : <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />}
      </button>
      {control ? <span className={cn("flex h-11 shrink-0 items-center", bare ? "pr-4 sm:pr-5" : "pr-3.5")}>{control}</span> : null}
    </li>
  )
}

/** Preview and Edit, with the chosen one's white thumb sliding under the words rather than jumping. */
export function PaneSwitch({ tab, onTab }: { tab: "preview" | "edit"; onTab: (t: "preview" | "edit") => void }) {
  return (
    <div role="tablist" aria-label={tt("Preview or edit")} className="relative mx-4 mt-3 flex shrink-0 rounded-xl bg-[#f1f2f4] p-1" data-email-switch="">
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_1px_1px_rgba(16,24,40,0.04)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        style={{ transform: tab === "edit" ? "translate3d(100%,0,0)" : "translate3d(0,0,0)" }}
      />
      {(["preview", "edit"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => onTab(t)}
          className={cn("relative z-[1] h-8 flex-1 rounded-lg px-3 text-[13px] font-medium transition-colors duration-200 [-webkit-tap-highlight-color:transparent]", tab === t ? "text-[#1a1a2e]" : "text-[#6b7280]")}
          data-email-tab={t}
        >
          {t === "preview" ? tt("Preview") : tt("Edit")}
        </button>
      ))}
    </div>
  )
}

/** Links in the preview go nowhere: it is a picture of the email, not a way out of the editor. */
const PREVIEW_STYLE = "<style>a{pointer-events:none;cursor:default}html,body{overflow:hidden}</style>"

/** The email's head and body, for the frame's own <html> to take: what is inside <html>, or the whole as a body. */
function innerOf(html: string): string {
  const open = html.match(/<html[^>]*>/i)
  if (!open || open.index === undefined) return `<head>${PREVIEW_STYLE}</head><body>${html}</body>`
  const inner = html.slice(open.index + open[0].length).replace(/<\/html>[\s\S]*$/i, "")
  return /<\/head>/i.test(inner) ? inner.replace(/<\/head>/i, `${PREVIEW_STYLE}</head>`) : `<head>${PREVIEW_STYLE}</head>${inner}`
}

/**
 * The email in a sandboxed frame, no scripts, drawn into the frame's own
 * document in place (its <html> given the email's head and body): a new
 * email or a key typed replaces what is drawn without loading anything, so
 * the frame never flashes blank, never fires a load, and the preview keeps
 * its place. Its height follows the email (and its pictures as they load),
 * so the column scrolls rather than the frame. A frame that is not on
 * screen (the Preview pane while Edit is showing) is brought up to date when
 * it comes back.
 */
/* The height each email's frame last measured, so it opens at that height the next time and the column does not jump when it is measured. */
const heightsKept = new Map<string, number>()

export function PreviewFrame({ title, html, paused = false, heightKey, onDrawn }: { title: string; html: string; paused?: boolean; /** Which email this is: its last measured height is where the frame opens. */ heightKey?: string; /** Told once the email is in the frame's document, for the time from a click to a preview. */ onDrawn?: () => void }) {
  const ref = React.useRef<HTMLIFrameElement>(null)
  const drawn = React.useRef<string | null>(null)
  const [height, setHeight] = React.useState(() => (heightKey ? heightsKept.get(heightKey) : undefined) ?? 640)
  const keyRef = React.useRef(heightKey)
  keyRef.current = heightKey
  const drawnRef = React.useRef(onDrawn)
  drawnRef.current = onDrawn

  const measure = React.useCallback(() => {
    const doc = ref.current?.contentDocument
    if (!doc?.documentElement) return
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0)
    if (h <= 0) return
    const next = Math.min(8000, Math.max(320, Math.ceil(h)))
    if (keyRef.current) heightsKept.set(keyRef.current, next)
    setHeight(next)
  }, [])

  /* Another email in the same frame: its own last height at once, before it is measured. */
  React.useLayoutEffect(() => {
    const h = heightKey ? heightsKept.get(heightKey) : undefined
    if (h) setHeight(h)
  }, [heightKey])

  const draw = React.useCallback(
    (force = false) => {
      const doc = ref.current?.contentDocument
      if (!doc?.documentElement || (!force && drawn.current === html)) return
      drawn.current = html
      doc.documentElement.innerHTML = innerOf(html)
      measure()
      if (html) drawnRef.current?.()
      doc.querySelectorAll("img").forEach((img) => {
        if (!img.complete) img.addEventListener("load", measure, { once: true })
      })
    },
    [html, measure],
  )

  /* Drawn before the frame is painted, typing and opening alike: an editor opens with its email in it, and its fade starts after. */
  React.useLayoutEffect(() => {
    if (!paused) draw()
  }, [draw, paused])

  return (
    <div className="overflow-hidden rounded-xl border border-[#eceef1] bg-[#f8f9fa]">
      <iframe
        ref={ref}
        title={title}
        sandbox="allow-same-origin"
        scrolling="no"
        className="block w-full"
        style={{ height }}
        /* A browser that swaps the frame's first blank page when it loads (Firefox) gets the email again, once. */
        onLoad={() => {
          if (!paused && drawn.current !== null) draw(true)
        }}
        data-email-frame=""
      />
    </div>
  )
}

/**
 * A phone's Preview and Edit, side by side and both kept, the pair sliding a
 * pane's width (by transform alone) so each keeps its own scroll and nothing
 * else on the sheet moves. The pane not showing is inert.
 */
export function SlidingPanes({ tab, preview, edit }: { tab: "preview" | "edit"; preview: React.ReactNode; edit: React.ReactNode }) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden" data-email-panes={tab}>
      <div className="flex h-full w-[200%] transition-[transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none" style={{ transform: tab === "edit" ? "translate3d(-50%,0,0)" : "translate3d(0,0,0)" }}>
        <div className="h-full w-1/2 overflow-y-auto overscroll-contain px-4 py-4" inert={tab === "edit" ? true : undefined} data-email-pane="preview">
          {preview}
        </div>
        <div className="h-full w-1/2 overflow-y-auto overscroll-contain px-4 py-4" inert={tab !== "edit" ? true : undefined} data-email-pane="edit">
          {edit}
        </div>
      </div>
    </div>
  )
}
