"use client"

/**
 * SETTINGS › CUSTOMER EMAILS: every email a buyer gets from the store
 * (lib/emails/customer-catalog.ts), grouped like Shopify's Customer
 * notifications, each with when it goes. The ones about shipping, pickup
 * and returns show while physical commerce is on.
 *
 * OPENS AT ONCE. The preview is drawn here, in the browser, by the very
 * template that sends the email, from the store's name, logo and contact
 * that Settings already fetched (/api/store/emails, prefetched with the
 * other tabs). Nothing is asked of the server when a row is pressed, so
 * the sheet opens with the email already in it.
 *
 * EDITABLE, LIKE SHOPIFY'S NOTIFICATION EDITOR WITHOUT THE CODE: the
 * subject, the heading, the opening text and the button's label, with
 * placeholders for the buyer's name, the order number, the store and the
 * items, and the preview following every key. Saved per store
 * (store_settings.customer_emails) and used by the senders; Reset puts the
 * default words back. What is typed is plain text, escaped when drawn
 * (lib/emails/customer-custom.ts), so nothing here can put HTML in an email.
 *
 * A dialog on a computer, Storelib's bottom sheet on a phone
 * (components/ui/sheet-dialog.tsx), with Preview and Edit as two tabs there.
 */
import * as React from "react"
import { ChevronRight, Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_GHOST, BTN_PRIMARY, Card, FIELD, Field, Notice, TextInput, api, peekGet } from "@/components/physical/ui"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { GROUP_NAMES, previewCustomerEmail, visibleCustomerEmails, type CustomerEmail, type CustomerEmailGroup } from "@/lib/emails/customer-catalog"
import { COPY_FIELDS, COPY_LIMITS, DEFAULT_COPY, PLACEHOLDERS, readCopy, type CopyField, type CustomerEmailsCopy, type EmailCopy } from "@/lib/emails/customer-custom"

const GROUP_ORDER: CustomerEmailGroup[] = ["orders", "shipping", "pickup", "returns", "marketing"]
const PATH = "/api/store/emails"

interface Shop {
  name: string
  supportEmail: string | null
  storeUrl: string | null
  logoUrl: string | null
  phone: string | null
  currency: string
}
interface Loaded {
  shop: Shop
  copy: CustomerEmailsCopy
  ready: boolean
}

const FALLBACK_SHOP: Shop = { name: "Your store", supportEmail: null, storeUrl: null, logoUrl: null, phone: null, currency: "USD" }

export function CustomerEmailsPanel() {
  const physical = usePhysicalCommerceEnabled()
  const emails = visibleCustomerEmails(physical)
  /* Drawn at once from what Settings fetched while the person was on another tab (prefetchGet). */
  const [data, setData] = React.useState<Loaded | null>(() => peekGet<Loaded>(PATH))
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<CustomerEmail | null>(null)

  React.useEffect(() => {
    void api<Loaded>(PATH).then((r) => (r.ok ? setData(r.data) : setError(r.error)))
  }, [])

  return (
    <div className="space-y-4 sm:space-y-6" data-customer-emails="">
      <Card title="Customer emails" description="What your buyers get from you, and when. Open one to see it and change its words. Each goes out with your store's name, and a reply comes to your contact email.">
        <div className="space-y-5">
          {GROUP_ORDER.map((g) => {
            const list = emails.filter((e) => e.group === g)
            if (list.length === 0) return null
            return (
              <section key={g} aria-labelledby={`emails-${g}`}>
                <h3 id={`emails-${g}`} className="mb-2 text-[13px] font-semibold text-[#6b7280]">
                  {GROUP_NAMES[g]}
                </h3>
                <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]">
                  {list.map((e) => {
                    const edited = !!data?.copy[e.id]
                    return (
                      <li key={e.id}>
                        <button type="button" onClick={() => setOpen(e)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#fafafa]" data-customer-email={e.id}>
                          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
                            <Mail className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
                              {e.name}
                              {edited ? <span className="text-[12px] font-normal text-[#6b7280]" data-email-edited="">· Edited</span> : null}
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
        </div>
        {error && !data ? <Notice className="mt-3">{error}</Notice> : null}
      </Card>
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
const LABELS: Record<CopyField, string> = { subject: "Subject", heading: "Heading", body: "Text", button: "Button" }

function draftOf(id: string | undefined, saved: EmailCopy | undefined): Draft {
  const def = id ? DEFAULT_COPY[id] : undefined
  return { subject: saved?.subject ?? def?.subject ?? "", heading: saved?.heading ?? def?.heading ?? "", body: saved?.body ?? def?.body ?? "", button: saved?.button ?? def?.button ?? "" }
}
const sameDraft = (a: Draft, b: Draft) => COPY_FIELDS.every((f) => a[f] === b[f])

function EmailSheet({ email, shop, saved, ready, onSaved, onClose }: { email: CustomerEmail | null; shop: Shop; saved: EmailCopy | undefined; ready: boolean; onSaved: (copy: CustomerEmailsCopy) => void; onClose: () => void }) {
  const phone = usePhoneWidth()
  const id = email?.id
  const editable = !!id && !!DEFAULT_COPY[id]
  const start = React.useMemo(() => draftOf(id, saved), [id, saved])
  const [draft, setDraft] = React.useState<Draft>(start)
  const [tab, setTab] = React.useState<"preview" | "edit">("preview")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedNote, setSavedNote] = React.useState(false)
  const last = React.useRef<{ field: CopyField; el: HTMLInputElement | HTMLTextAreaElement } | null>(null)

  /* A new email, or its saved words changed: start again from them. */
  React.useEffect(() => {
    setDraft(start)
    setError(null)
    setSavedNote(false)
  }, [start])
  React.useEffect(() => {
    if (id) setTab("preview")
  }, [id])

  /* The preview follows the typing a beat behind, so a long email never holds a key up. */
  const shown = React.useDeferredValue(draft)
  const checked = React.useMemo(() => (id && editable ? readCopy(id, shown) : null), [id, editable, shown])
  const mail = React.useMemo(() => (id ? previewCustomerEmail(id, shop, checked?.ok ? checked.copy : saved) : null), [id, shop, checked, saved])
  const dirty = !sameDraft(draft, start)
  const isDefault = !saved

  const close = () => {
    if (dirty && !window.confirm("Leave without saving your changes to this email?")) return
    onClose()
  }

  const save = async (copy: Draft | null) => {
    if (!id) return
    setBusy(true)
    const r = await api<{ copy: CustomerEmailsCopy }>(PATH, { method: "PUT", body: { id, copy } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setSavedNote(true)
    onSaved(r.data.copy)
  }

  const insert = (key: string) => {
    const token = `{{${key}}}`
    const at = last.current
    const field: CopyField = at?.field ?? "body"
    setDraft((d) => {
      const value = d[field]
      const el = at?.el
      const from = el && typeof el.selectionStart === "number" ? el.selectionStart : value.length
      const to = el && typeof el.selectionEnd === "number" ? el.selectionEnd : value.length
      return { ...d, [field]: `${value.slice(0, from)}${token}${value.slice(to)}`.slice(0, COPY_LIMITS[field]) }
    })
  }

  const fields = editable ? (
    <div className="space-y-3.5" data-email-editor={id}>
      {!ready ? <Notice tone="amber">Saving changes needs the database update (SQL part 129). You can try words out here meanwhile.</Notice> : null}
      {COPY_FIELDS.map((f) => (
        <Field key={f} label={LABELS[f]} htmlFor={`email-${f}`}>
          {f === "body" ? (
            <textarea
              id={`email-${f}`}
              value={draft.body}
              maxLength={COPY_LIMITS.body}
              rows={6}
              onFocus={(e) => (last.current = { field: f, el: e.currentTarget })}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              className={cn(FIELD, "h-auto min-h-[132px] resize-y py-2.5 leading-[21px] sm:h-auto")}
              placeholder="No opening text"
            />
          ) : (
            <TextInput
              id={`email-${f}`}
              value={draft[f]}
              maxLength={COPY_LIMITS[f]}
              onFocus={(e) => (last.current = { field: f, el: e.currentTarget })}
              onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
            />
          )}
        </Field>
      ))}
      <div>
        <p className="text-[12.5px] text-[#6b7280]">Placeholders fill in for each order. Tap one to add it where you&apos;re typing.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(p.key)}
              className="h-8 rounded-full bg-[#f1f2f4] px-3 text-[12.5px] font-medium text-[#374151] transition-colors hover:bg-[#e8e9ec]"
              data-placeholder={p.key}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {checked && checked.ok === false ? <Notice>{checked.error}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      <p className="text-[12.5px] leading-[18px] text-[#6b7280]">The items, totals, tracking and links stay as they are, filled in from each order.</p>
    </div>
  ) : null

  const preview = (
    <div className="space-y-2.5" data-email-preview={id}>
      {mail ? (
        <p className="text-[13px] text-[#6b7280]" data-email-subject="">
          <span className="font-medium text-[#374151]">Subject:</span> {mail.subject}
        </p>
      ) : null}
      <PreviewFrame title={`${email?.name ?? "Email"} preview`} html={mail?.html ?? ""} />
      <p className="text-[12.5px] leading-[18px] text-[#6b7280]">A sample order with your store&apos;s name. The real email has the buyer&apos;s own items, address and order.</p>
    </div>
  )

  const footer = editable ? (
    <div className={cn("flex items-center justify-between gap-2 border-t border-[#f1f2f4] px-4 py-3 sm:px-5", phone && "pb-[calc(env(safe-area-inset-bottom,0px)+12px)]")}>
      <button type="button" className={BTN_GHOST} disabled={busy || (isDefault && sameDraft(draft, draftOf(id, undefined)))} onClick={() => (isDefault ? setDraft(draftOf(id, undefined)) : void save(null))} data-email-reset="">
        Reset to default
      </button>
      <div className="flex items-center gap-3">
        {savedNote && !dirty ? <span className="text-[13px] text-[#6b7280]" aria-live="polite">Saved</span> : null}
        <button type="button" className={BTN_PRIMARY} disabled={!dirty || busy || !ready || (checked !== null && checked.ok === false)} onClick={() => void save(draft)} data-email-save="">
          {busy ? "Saving" : "Save"}
        </button>
      </div>
    </div>
  ) : null

  return (
    <SheetDialog
      open={!!email}
      onClose={close}
      phone={phone}
      label={email?.name ?? "Email"}
      className="flex max-h-[min(92dvh,880px)] w-[calc(100vw-48px)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[1040px]"
    >
      <div className={cn("flex min-h-0 flex-1 flex-col", phone && "h-full")} data-email-sheet={id}>
        <div className="flex items-center gap-3 border-b border-[#f1f2f4] px-4 py-3 pr-12 sm:px-5">
          <div className="min-w-0">
            <SheetDialogTitle className="text-[16px] font-semibold leading-6 text-[#1a1a2e]">{email?.name ?? "Email"}</SheetDialogTitle>
            <p className="truncate text-[12.5px] text-[#6b7280]">{email?.sentWhen}</p>
          </div>
        </div>
        {phone && editable ? (
          <div role="tablist" aria-label="Preview or edit" className="mx-4 mt-3 inline-flex gap-1 rounded-xl bg-[#f1f2f4] p-1">
            {(["preview", "edit"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn("h-8 flex-1 rounded-lg px-3 text-[13px] font-medium transition-colors", tab === t ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280]")}
              >
                {t === "preview" ? "Preview" : "Edit"}
              </button>
            ))}
          </div>
        ) : null}
        {phone ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{tab === "edit" && editable ? fields : preview}</div>
        ) : (
          <div className={cn("min-h-0 flex-1 overflow-y-auto lg:grid lg:overflow-hidden", editable && "lg:grid-cols-[340px_minmax(0,1fr)]")}>
            {editable ? <div className="border-b border-[#f1f2f4] px-5 py-4 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">{fields}</div> : null}
            <div className="bg-[#fafbfb] px-5 py-4 lg:min-h-0 lg:overflow-y-auto">{preview}</div>
          </div>
        )}
        {footer}
      </div>
    </SheetDialog>
  )
}

/**
 * The email in a sandboxed frame, no scripts. Its height follows the email
 * once drawn, so the sheet scrolls rather than the frame.
 */
function PreviewFrame({ title, html }: { title: string; html: string }) {
  const [height, setHeight] = React.useState(560)
  return (
    <div className="overflow-hidden rounded-xl border border-[#eceef1] bg-[#f8f9fa]">
      <iframe
        title={title}
        srcDoc={html}
        sandbox="allow-same-origin"
        className="block w-full"
        style={{ height }}
        onLoad={(e) => {
          try {
            const doc = (e.currentTarget as HTMLIFrameElement).contentDocument
            if (doc?.body) setHeight(Math.min(2000, Math.max(360, doc.documentElement.scrollHeight)))
          } catch {
            /* A frame that can't be measured keeps its height and scrolls. */
          }
        }}
      />
    </div>
  )
}
