"use client"

/**
 * SETTINGS › CUSTOMER EMAILS, AND EMAILS › CUSTOMER EMAILS: every email a
 * buyer gets from the store (lib/emails/customer-catalog.ts), grouped like
 * Shopify's Customer notifications, each with when it goes: a download's
 * receipt under Digital products, an order that ships under Orders,
 * Payments, Shipping, Local pickup and Returns, which show while physical
 * commerce is on. The same list, the same editor and the same saved words in
 * both places: Settings draws it in a card, the Emails page inside its own
 * table card (`bare`).
 *
 * OPENS AT ONCE. The preview is drawn here, in the browser, by the very
 * template that sends the email, from the store's name, logo and contact
 * that Settings already fetched (/api/store/emails, prefetched with the
 * other tabs). Nothing is asked of the server when a row is pressed, so
 * the editor opens with the email already in it.
 *
 * EDITABLE, LIKE SHOPIFY'S NOTIFICATION EDITOR WITHOUT THE CODE: the
 * subject, the heading, the opening text and the button's label, with
 * placeholders for the buyer's name, the order number, the store and the
 * items, put in where the cursor is. Saved per store
 * (store_settings.customer_emails) and used by the senders; Reset puts the
 * default words back. What is typed is plain text, escaped when drawn
 * (lib/emails/customer-custom.ts), so nothing here can put HTML in an email.
 *
 * THE PREVIEW FOLLOWS THE TYPING WITHOUT RELOADING. The email is written
 * into its frame's document in place (PreviewFrame), so a key never blanks
 * the frame or throws the preview back to its top, as a new srcDoc did.
 *
 * A dialog on a computer; on a phone the shared bottom sheet
 * (components/ui/sheet-dialog.tsx) at a fixed height, with Preview and Edit
 * as two panes side by side that slide, both kept, so switching moves
 * nothing else and each keeps its own scroll. The sheet sits on the
 * keyboard (aboveKeyboard), so the field being typed in and the Save bar
 * stay above it, and fields are 16px there so iOS does not zoom the page.
 */
import * as React from "react"
import { ChevronRight, Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_GHOST, BTN_PRIMARY, Card, FIELD, Field, Notice, TextInput, api, peekGet } from "@/components/physical/ui"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { GROUP_NAMES, GROUP_ORDER, previewCustomerEmail, visibleCustomerEmails, type CustomerEmail } from "@/lib/emails/customer-catalog"
import { COPY_FIELDS, COPY_LIMITS, DEFAULT_COPY, PLACEHOLDERS, readCopy, type CopyField, type CustomerEmailsCopy, type EmailCopy } from "@/lib/emails/customer-custom"
import { tt } from "@/lib/i18n/text"

export const CUSTOMER_EMAILS_PATH = "/api/store/emails"

export interface CustomerEmailsShop {
  name: string
  supportEmail: string | null
  storeUrl: string | null
  logoUrl: string | null
  phone: string | null
  currency: string
  /** The store's accent, for the button in each preview (lib/emails/layout.ts uses it when it reads on white). */
  accent?: string | null
}
export interface CustomerEmailsData {
  shop: CustomerEmailsShop
  copy: CustomerEmailsCopy
  ready: boolean
}

const FALLBACK_SHOP: CustomerEmailsShop = { name: "Your store", supportEmail: null, storeUrl: null, logoUrl: null, phone: null, currency: "USD" }

/** The phone sheet's one height, kept whichever pane is showing, so a switch never moves its top edge. */
const PHONE_SHEET_HEIGHT = "calc(var(--vv-h, 100dvh) * 0.9)"

export function CustomerEmailsPanel({ bare = false }: { bare?: boolean }) {
  const physical = usePhysicalCommerceEnabled()
  const emails = visibleCustomerEmails(physical)
  /* Drawn at once from what Settings (or Emails) fetched while the person was elsewhere (prefetchGet). */
  const [data, setData] = React.useState<CustomerEmailsData | null>(() => peekGet<CustomerEmailsData>(CUSTOMER_EMAILS_PATH))
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<CustomerEmail | null>(null)

  React.useEffect(() => {
    void api<CustomerEmailsData>(CUSTOMER_EMAILS_PATH).then((r) => (r.ok ? setData(r.data) : setError(r.error)))
  }, [])

  const list = (
    <div className={cn(bare ? "pb-1" : "space-y-5")}>
      {GROUP_ORDER.map((g) => {
        const rows = emails.filter((e) => e.group === g)
        if (rows.length === 0) return null
        return (
          <section key={g} aria-labelledby={`emails-${g}`}>
            <h3 id={`emails-${g}`} className={cn("text-[13px] font-semibold text-[#6b7280]", bare ? "px-4 pb-2 pt-4 sm:px-5" : "mb-2")}>
              {GROUP_NAMES[g]}
            </h3>
            {/* In Settings the rows are a list of their own in the card; on the Emails page the card is the table's, so the rows are its rows, not a box in a box. */}
            <ul className={cn("divide-y divide-[#f1f2f4]", bare ? "border-y border-[#f1f2f4]" : "overflow-hidden rounded-xl border border-[#eceef1]")}>
              {rows.map((e) => {
                const edited = !!data?.copy[e.id]
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(e)}
                      className={cn("flex w-full items-center gap-3 py-3 text-left transition-colors duration-100 hover:bg-[#fafafa] active:bg-[#f4f5f7] [-webkit-tap-highlight-color:transparent]", bare ? "px-4 sm:px-5" : "px-3.5")}
                      data-customer-email={e.id}
                    >
                      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
                        <Mail className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
                          {e.name}
                          {edited ? (
                            <span className="text-[12px] font-normal text-[#6b7280]" data-email-edited="">
                              · {tt("Edited")}
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{e.sentWhen}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {error && !data ? <Notice className="mt-3">{error}</Notice> : null}
    </div>
  )

  return (
    <div className={cn(!bare && "space-y-4 sm:space-y-6")} data-customer-emails="">
      {bare ? (
        list
      ) : (
        <Card title={tt("Customer emails")} description={tt("What your buyers get from you, and when. Open one to see it and change its words. Each goes out with your store's name, and a reply comes to your contact email.")}>
          {list}
        </Card>
      )}
      <EmailSheet
        email={open}
        shop={data?.shop ?? FALLBACK_SHOP}
        saved={open ? data?.copy[open.id] : undefined}
        ready={data?.ready !== false}
        onSaved={(copy) => setData((d) => (d ? { ...d, copy } : d))}
        onClose={() => setOpen(null)}
      />
    </div>
  )
}

type Draft = Required<EmailCopy>
const LABELS: Record<CopyField, string> = { get subject() { return tt("Subject") }, get heading() { return tt("Heading") }, get body() { return tt("Text") }, get button() { return tt("Button") } }

function draftOf(id: string | undefined, saved: EmailCopy | undefined): Draft {
  const def = id ? DEFAULT_COPY[id] : undefined
  return { subject: saved?.subject || def?.subject || "", heading: saved?.heading || def?.heading || "", body: saved?.body ?? def?.body ?? "", button: saved?.button || def?.button || "" }
}
const sameDraft = (a: Draft, b: Draft) => COPY_FIELDS.every((f) => a[f] === b[f])

/* A phone field is 16px, so iOS does not zoom the page into it; 14px from 640px, as every field in Settings. */
const PHONE_SAFE = "text-[16px] sm:text-[14px]"

export function EmailSheet({ email: asked, shop, saved: savedAsked, ready, onSaved, onClose }: { email: CustomerEmail | null; shop: CustomerEmailsShop; saved: EmailCopy | undefined; ready: boolean; onSaved: (copy: CustomerEmailsCopy) => void; onClose: () => void }) {
  const phone = usePhoneWidth()
  /*
    CLOSES THE WAY IT OPENED. The sheet slides away for a moment after it is
    closed; drawn with no email in that moment, it shrank to an empty
    "Email" box on its way out. The last email stays in it until it is gone.
  */
  const kept = React.useRef<CustomerEmail | null>(asked)
  if (asked) kept.current = asked
  const email = asked ?? kept.current
  const keptSaved = React.useRef<EmailCopy | undefined>(savedAsked)
  if (asked) keptSaved.current = savedAsked
  const saved = asked ? savedAsked : keptSaved.current
  const id = email?.id
  const editable = !!id && !!DEFAULT_COPY[id]
  const start = React.useMemo(() => draftOf(id, saved), [id, saved])
  const [draft, setDraft] = React.useState<Draft>(start)
  const [tab, setTab] = React.useState<"preview" | "edit">("preview")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedNote, setSavedNote] = React.useState(false)
  const [test, setTest] = React.useState<{ state: "sending" } | { state: "sent"; to: string } | { state: "failed"; error: string } | null>(null)
  const last = React.useRef<{ field: CopyField; el: HTMLInputElement | HTMLTextAreaElement } | null>(null)
  const caret = React.useRef<{ el: HTMLInputElement | HTMLTextAreaElement; at: number } | null>(null)

  /* A new email, or its saved words changed: start again from them. */
  React.useEffect(() => {
    setDraft(start)
    setError(null)
    setSavedNote(false)
  }, [start])
  React.useEffect(() => {
    if (id) {
      setTab("preview")
      last.current = null
      setTest(null)
    }
  }, [id])

  /* After a placeholder goes in, the cursor stands right after it, in the field it went into. */
  React.useLayoutEffect(() => {
    const c = caret.current
    if (!c) return
    caret.current = null
    try {
      c.el.focus({ preventScroll: true })
      c.el.setSelectionRange(c.at, c.at)
    } catch {
      /* A field that went away keeps nothing. */
    }
  }, [draft])

  /* The preview follows the typing a beat behind, so a long email never holds a key up. */
  const shown = React.useDeferredValue(draft)
  const checked = React.useMemo(() => (id && editable ? readCopy(id, shown) : null), [id, editable, shown])
  const mail = React.useMemo(() => (id ? previewCustomerEmail(id, shop, checked?.ok ? checked.copy : saved) : null), [id, shop, checked, saved])
  const dirty = !sameDraft(draft, start)
  const isDefault = !saved

  const close = () => {
    if (dirty && !window.confirm(tt("Leave without saving your changes to this email?"))) return
    onClose()
  }

  const save = async (copy: Draft | null) => {
    if (!id) return
    setBusy(true)
    const r = await api<{ copy: CustomerEmailsCopy }>(CUSTOMER_EMAILS_PATH, { method: "PUT", body: { id, copy } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setSavedNote(true)
    onSaved(r.data.copy)
  }

  /* The email as it is on screen, words being typed included, to the person's own inbox (app/api/store/emails/test). */
  const sendTest = async () => {
    if (!id || test?.state === "sending") return
    setTest({ state: "sending" })
    const r = await api<{ sentTo: string }>("/api/store/emails/test", { method: "POST", body: { id, ...(editable && checked?.ok ? { copy: draft } : {}) } })
    setTest(r.ok ? { state: "sent", to: r.data.sentTo } : { state: "failed", error: r.error })
  }

  const reset = () => {
    if (isDefault) {
      setDraft(draftOf(id, undefined))
      return
    }
    void save(null)
  }

  /* Where the cursor is in the field typed in last (the text when none was), replacing a selection. */
  const insert = (key: string) => {
    const token = `{{${key}}}`
    const at = last.current
    const field: CopyField = at?.field ?? "body"
    const value = draft[field]
    const el = at?.el
    const from = el && typeof el.selectionStart === "number" ? el.selectionStart : value.length
    const to = el && typeof el.selectionEnd === "number" ? el.selectionEnd : value.length
    const next = `${value.slice(0, from)}${token}${value.slice(to)}`.slice(0, COPY_LIMITS[field])
    if (el) caret.current = { el, at: Math.min(next.length, from + token.length) }
    setDraft((d) => ({ ...d, [field]: next }))
  }

  const remember = (field: CopyField) => (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    last.current = { field, el: e.currentTarget }
  }

  const fields = editable ? (
    <div className="space-y-3.5" data-email-editor={id}>
      {!ready ? <Notice tone="amber">{tt("Saving changes needs the database update (SQL part 129). You can try words out here meanwhile.")}</Notice> : null}
      {COPY_FIELDS.map((f) => (
        <Field key={f} label={LABELS[f]} htmlFor={`email-${f}`}>
          {f === "body" ? (
            <textarea
              id={`email-${f}`}
              value={draft.body}
              maxLength={COPY_LIMITS.body}
              rows={6}
              onFocus={remember(f)}
              onSelect={remember(f)}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              className={cn(FIELD, PHONE_SAFE, "h-auto min-h-[132px] resize-y py-2.5 leading-[21px] sm:h-auto")}
              placeholder={tt("No opening text")}
              data-email-field={f}
            />
          ) : (
            <TextInput
              id={`email-${f}`}
              value={draft[f]}
              maxLength={COPY_LIMITS[f]}
              autoComplete="off"
              onFocus={remember(f)}
              onSelect={remember(f)}
              onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
              /* Emptied, the default goes out: it shows here as the hint. */
              placeholder={id ? DEFAULT_COPY[id][f] : undefined}
              className={PHONE_SAFE}
              data-email-field={f}
            />
          )}
        </Field>
      ))}
      <div>
        <p className="text-[12.5px] text-[#6b7280]">{tt("Placeholders fill in for each order. Tap one to add it where you're typing.")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              /* The field keeps the focus and the cursor, so the placeholder goes where the person was typing. */
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(p.key)}
              className="h-8 rounded-full bg-[#f1f2f4] px-3 text-[12.5px] font-medium text-[#374151] transition-colors hover:bg-[#e8e9ec] active:bg-[#e2e4e8] [-webkit-tap-highlight-color:transparent]"
              data-placeholder={p.key}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {checked && checked.ok === false ? <Notice>{checked.error}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("The items, totals, tracking and links stay as they are, filled in from each order.")}</p>
      <button type="button" className={cn(BTN_GHOST, "-ml-3 sm:hidden")} disabled={busy || (isDefault && sameDraft(draft, draftOf(id, undefined)))} onClick={reset}>
        {tt("Reset to default")}
      </button>
    </div>
  ) : null

  const preview = (active: boolean) => (
    <div className="space-y-2.5" data-email-preview={id}>
      {mail ? (
        <p className="text-[13px] text-[#6b7280]" data-email-subject="">
          <span className="font-medium text-[#374151]">{tt("Subject:")}</span> {mail.subject}
        </p>
      ) : null}
      <PreviewFrame title={tt("{value} preview", { value: email?.name ?? tt("Email") })} html={mail?.html ?? ""} paused={!active} />
      <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("A sample order with your store's name. The real email has the buyer's own items, address and order.")}</p>
    </div>
  )

  const testButton = (
    <button type="button" className={BTN_GHOST} disabled={!id || test?.state === "sending"} onClick={() => void sendTest()} data-email-test="">
      {test?.state === "sending" ? tt("Sending") : tt("Send test")}
    </button>
  )
  const testNote =
    test?.state === "sent" ? (
      <span className="truncate text-[13px] text-[#6b7280]" aria-live="polite" data-email-test-note="">
        {tt("Sent to {to}", { to: test.to })}
      </span>
    ) : test?.state === "failed" ? (
      <span className="truncate text-[13px] text-[#b42318]" aria-live="polite" data-email-test-note="">
        {test.error}
      </span>
    ) : null

  const footer = (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#f1f2f4] bg-white px-4 py-3 sm:px-5" data-email-footer="">
      <div className="flex min-w-0 items-center gap-1">
        {editable ? (
          <button type="button" className={cn(BTN_GHOST, "hidden sm:inline-flex")} disabled={busy || (isDefault && sameDraft(draft, draftOf(id, undefined)))} onClick={reset} data-email-reset="">
            {tt("Reset to default")}
          </button>
        ) : null}
        {testButton}
        {testNote ? <span className="hidden min-w-0 sm:inline">{testNote}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {savedNote && !dirty ? (
          <span className="text-[13px] text-[#6b7280]" aria-live="polite">
            {tt("Saved")}
          </span>
        ) : null}
        {editable ? (
          <button type="button" className={BTN_PRIMARY} disabled={!dirty || busy || !ready || (checked !== null && checked.ok === false)} onClick={() => void save(draft)} data-email-save="">
            {busy ? tt("Saving") : tt("Save")}
          </button>
        ) : null}
      </div>
    </div>
  )
  /* On a phone the note goes on its own line above the bar, and Reset with the fields, so the bar keeps one row. */
  const phoneTestNote = testNote ? <div className="flex shrink-0 bg-white px-4 pt-2 sm:hidden">{testNote}</div> : null

  const header = (
    <div className="flex shrink-0 items-center gap-3 border-b border-[#f1f2f4] px-4 py-3 pr-12 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <SheetDialogTitle className="text-[16px] font-semibold leading-6 text-[#1a1a2e]">{email?.name ?? tt("Email")}</SheetDialogTitle>
        <p className="truncate text-[12.5px] text-[#6b7280]">{email?.sentWhen}</p>
      </div>
    </div>
  )

  return (
    <SheetDialog
      open={!!email}
      onClose={close}
      phone={phone}
      label={email?.name ?? tt("Email")}
      sheet={{ height: PHONE_SHEET_HEIGHT, maxHeight: PHONE_SHEET_HEIGHT }}
      /* Nothing is chosen for the person on open: a subject selected as the dialog came up was one key from being typed over. */
      onOpenAutoFocus={(e) => e.preventDefault()}
      className="flex max-h-[min(92dvh,880px)] w-[calc(100vw-48px)] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_24px_56px_-12px_rgba(16,24,40,0.28)] outline-none focus:outline-none focus-visible:outline-none sm:max-w-[1040px]"
    >
      <div className={cn("flex min-h-0 flex-1 flex-col", phone && "h-full")} data-email-sheet={id}>
        {header}
        {phone ? (
          <>
            {editable ? <PaneSwitch tab={tab} onTab={setTab} /> : null}
            <div className="relative min-h-0 flex-1 overflow-hidden" data-email-panes={tab}>
              <div
                className="flex h-full w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none"
                style={{ transform: tab === "edit" && editable ? "translate3d(-50%,0,0)" : "translate3d(0,0,0)" }}
              >
                <div className="h-full w-1/2 overflow-y-auto overscroll-contain px-4 py-4" inert={tab === "edit" && editable ? true : undefined} data-email-pane="preview">
                  {preview(tab === "preview" || !editable)}
                </div>
                <div className="h-full w-1/2 overflow-y-auto overscroll-contain px-4 py-4" inert={tab !== "edit" ? true : undefined} data-email-pane="edit">
                  {fields}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className={cn("min-h-0 flex-1 overflow-y-auto lg:grid lg:overflow-hidden", editable && "lg:grid-cols-[360px_minmax(0,1fr)]")}>
            {editable ? <div className="border-b border-[#f1f2f4] px-5 py-5 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">{fields}</div> : null}
            <div className="bg-[#f8f9fa] px-5 py-5 lg:min-h-0 lg:overflow-y-auto">{preview(true)}</div>
          </div>
        )}
        {phoneTestNote}
        {footer}
      </div>
    </SheetDialog>
  )
}

/** Preview and Edit, with the chosen one's white thumb sliding under the words rather than jumping. */
function PaneSwitch({ tab, onTab }: { tab: "preview" | "edit"; onTab: (t: "preview" | "edit") => void }) {
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
function PreviewFrame({ title, html, paused = false }: { title: string; html: string; paused?: boolean }) {
  const ref = React.useRef<HTMLIFrameElement>(null)
  const drawn = React.useRef<string | null>(null)
  const [height, setHeight] = React.useState(640)

  const measure = React.useCallback(() => {
    const doc = ref.current?.contentDocument
    if (!doc?.documentElement) return
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0)
    if (h > 0) setHeight(Math.min(8000, Math.max(320, Math.ceil(h))))
  }, [])

  const draw = React.useCallback(
    (force = false) => {
      const doc = ref.current?.contentDocument
      if (!doc?.documentElement || (!force && drawn.current === html)) return
      drawn.current = html
      doc.documentElement.innerHTML = innerOf(html)
      measure()
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
