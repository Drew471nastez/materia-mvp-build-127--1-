"use client"

/**
 * ===========================================================================
 *  CONTACTS › FORMS (round 51; Emails › Leads › Forms before)
 * ===========================================================================
 * Every form the creator has, wherever it was made (a OnePage Form block, a
 * chat button's questions, a website or Creator Page section, or here), as
 * one list: its title, what kind of form it is (lib/forms/kind), whether it
 * is live, how many responses it has, and which pages use it, all worked
 * out on the server in a fixed number of reads (app/api/forms?overview=1).
 * With the creator's own forms, the website ones: the contact form inbox
 * (the old Emails › Messages, site_contact_messages) and any form from the
 * older website builder (site_forms).
 *
 * A form opens on four tabs: Edit (the builder, components/forms/
 * forms-manager FormEditor), Responses, Insights and Settings (publication,
 * notifications, integrations, privacy, the follow up email). The address
 * says what is open, so a link or a reload lands in the same place:
 *
 *   ?form=<id>&view=edit|responses|insights|settings
 *   &response=<id>    with view=responses, that response open (the
 *                     creator's new response email and bell link here)
 *   ?message=<id>     one message from the contact form inbox
 *   ?inbox=1          the inbox
 *   ?siteform=<id>    a form from the older website builder
 *
 * The Contacts page draws this inside its own page and tabs
 * (app/(storelib)/app/contacts/forms); `framed` adds a page container of its
 * own for a page that has none.
 *
 * WHEN FORMS ARE NOT SET UP (SQL parts 372 and 375 not run) the card says so
 * in one sentence; nothing is retried and New form is not offered. The
 * website inbox is still listed.
 */
import * as React from "react"
import { Plus } from "lucide-react"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { ShimmerRows } from "@/components/ui/shimmer"
import { FilterPills } from "@/components/app/filter-pills"
import { SegmentedPills } from "@/components/app/segmented-pills"
import { FormEditor, usageWords, type SavedForm } from "@/components/forms/forms-manager"
import { confirmForm } from "@/components/forms/form-confirm"
import { formsRequest } from "@/lib/forms/client"
import { formPath } from "@/lib/forms/actions"
import { TEMPLATE_CHOICES } from "@/lib/forms/templates"
import type { FormKind, FormUsage } from "@/lib/forms/kind"
import type { SiteFormRow } from "@/lib/forms/overview-server"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatNumber } from "@/lib/i18n/format"
import { RowMenuButton, StatusBadge, buttonAccent, buttonSecondary, card } from "../../orders/order-parts"
import { MessagePage } from "../message-detail"
import type { MessageRow } from "../emails-home"
import { InsightsPanel, MessagesInbox, ResponsesPanel, SiteFormPanel, contactOpenHref, when } from "./form-panels"
import { routeOf, type FormView, type FormsRoute } from "./forms-route"

/** The starting points, named for the creator's language (the ids are lib/forms/templates'). */
export function templateLabel(id: string): string {
  const words: Record<string, string> = {
    contact: tt("Contact"),
    lead: tt("Lead magnet"),
    coaching: tt("Coaching application"),
    service: tt("Service inquiry"),
    appointment: tt("Appointment booking"),
    waitlist: tt("Waitlist"),
    feedback: tt("Feedback"),
    registration: tt("Registration"),
    fitness: tt("Quiz with results"),
  }
  return words[id] ?? TEMPLATE_CHOICES.find((t) => t.id === id)?.label ?? id
}

export function kindWord(kind: FormKind): string {
  switch (kind) {
    case "quiz":
      return tt("Quiz")
    case "survey":
      return tt("Survey")
    case "application":
      return tt("Application")
    case "lead":
      return tt("Lead capture")
    case "booking":
      return tt("Bookings")
    case "website":
      return tt("Website form")
    default:
      return tt("Form")
  }
}

export type { FormView, FormsRoute } from "./forms-route"

type ListedForm = SavedForm & { kind?: FormKind; responses?: number; usages?: FormUsage[] }
type Filter = "all" | "forms" | "quizzes" | "leads" | "website"

function filterOf(kind: FormKind | undefined): Exclude<Filter, "all"> {
  if (kind === "quiz") return "quizzes"
  if (kind === "lead") return "leads"
  if (kind === "website") return "website"
  return "forms"
}

export function FormsList({ framed = false }: { framed?: boolean } = {}) {
  const [forms, setForms] = React.useState<ListedForm[]>([])
  const [siteForms, setSiteForms] = React.useState<SiteFormRow[]>([])
  const [inbox, setInbox] = React.useState<{ available: boolean; rows: MessageRow[] } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [missing, setMissing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [filter, setFilter] = React.useState<Filter>("all")
  const [route, setRoute] = React.useState<FormsRoute>({ form: null, view: "edit", response: null, message: null, inbox: false, siteform: null })

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    const [r, m] = await Promise.all([
      formsRequest<{ forms: ListedForm[]; siteForms?: SiteFormRow[]; missing?: boolean }>("/api/forms?overview=1", { fallback: tt("Forms could not be loaded. Try again.") }),
      fetch("/api/email/area?part=messages", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<{ available?: boolean; rows?: MessageRow[] }>) : null))
        .catch(() => null),
    ])
    setLoading(false)
    setMissing(r.missing)
    setInbox(m ? { available: m.available !== false, rows: m.rows ?? [] } : { available: false, rows: [] })
    setSiteForms(r.data?.siteForms ?? [])
    if (r.error) return setError(r.error)
    setForms(r.data?.forms ?? [])
  }, [])

  React.useEffect(() => {
    void load()
    setRoute(routeOf(window.location.search))
    const back = () => setRoute(routeOf(window.location.search))
    window.addEventListener("popstate", back)
    return () => window.removeEventListener("popstate", back)
  }, [load])

  /** Open something: the address says it, so Back and a reload agree with the page. */
  const go = (next: Partial<FormsRoute>, push = true) => {
    const r: FormsRoute = { form: null, view: "edit", response: null, message: null, inbox: false, siteform: null, ...next }
    setRoute(r)
    const url = new URL(window.location.href)
    for (const k of ["form", "view", "response", "message", "inbox", "siteform"]) url.searchParams.delete(k)
    if (r.form) {
      url.searchParams.set("form", r.form)
      if (r.view !== "edit") url.searchParams.set("view", r.view)
      if (r.view === "responses" && r.response) url.searchParams.set("response", r.response)
    }
    if (r.message) url.searchParams.set("message", r.message)
    if (r.inbox) url.searchParams.set("inbox", "1")
    if (r.siteform) url.searchParams.set("siteform", r.siteform)
    if (push) window.history.pushState(window.history.state, "", url)
    else window.history.replaceState(window.history.state, "", url)
  }
  const home = () => go({})

  const create = async (template: string) => {
    setBusy(true)
    setError(null)
    const r = await formsRequest<{ form: SavedForm }>("/api/forms", { method: "POST", body: JSON.stringify({ template }), fallback: tt("The form could not be created. Try again.") })
    setBusy(false)
    if (r.missing) return setMissing(true)
    if (r.error || !r.data) return setError(r.error)
    setForms((all) => [{ ...r.data!.form, responses: 0, usages: [] }, ...all])
    go({ form: r.data.form.id })
  }

  const archive = async (form: SavedForm) => {
    /* Round AN: asked in Storelib's own confirm (components/forms/form-confirm), never the browser's. */
    const yes = await confirmForm({
      title: tt("Archive “{title}”?", { title: form.title || tt("Untitled form") }),
      body: tt("It stops taking answers on every page. Its responses are kept."),
      confirm: tt("Archive"),
      cancel: tt("Cancel"),
    })
    if (yes !== true) return
    const r = await formsRequest(`/api/forms/${form.id}`, { method: "DELETE", fallback: tt("The form was not archived. Try again.") })
    if (r.error) return setError(r.error)
    setForms((all) => all.filter((f) => f.id !== form.id))
  }

  /* ── The website inbox: read, reply, delete (app/api/email/messages/[id]) ── */
  const writeRows = (fn: (rows: MessageRow[]) => MessageRow[]) => setInbox((prev) => (prev ? { ...prev, rows: fn(prev.rows) } : prev))
  const markRead = async (m: MessageRow, read: boolean) => {
    const at = read ? new Date().toISOString() : null
    writeRows((rows) => rows.map((r) => (r.id === m.id ? { ...r, read_at: at } : r)))
    await fetch(`/api/email/messages/${encodeURIComponent(m.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read }) }).catch(() => null)
  }
  const reply = async (m: MessageRow, text: string): Promise<string | null> => {
    const temp = `pending-${Date.now()}`
    const at = new Date().toISOString()
    writeRows((rows) => rows.map((r) => (r.id === m.id ? { ...r, read_at: r.read_at ?? at, replies: [...(r.replies ?? []), { id: temp, message: text, created_at: at, pending: true }] } : r)))
    const res = await fetch(`/api/email/messages/${encodeURIComponent(m.id)}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null)
    const out = res ? ((await res.json().catch(() => ({}))) as { reply?: { id: string; message: string; created_at: string }; error?: string }) : { error: tt("You seem to be offline. Try again.") }
    if (!res?.ok || !out.reply) {
      writeRows((rows) => rows.map((r) => (r.id === m.id ? { ...r, replies: (r.replies ?? []).filter((x) => x.id !== temp) } : r)))
      return out.error || tt("The reply was not sent. Try again.")
    }
    writeRows((rows) => rows.map((r) => (r.id === m.id ? { ...r, replies: (r.replies ?? []).map((x) => (x.id === temp ? out.reply! : x)) } : r)))
    return null
  }
  const removeMessage = async (id: string) => {
    const yes = await confirmForm({ title: tt("Delete this message?"), body: tt("The email you got about it stays in your inbox."), confirm: tt("Delete"), cancel: tt("Cancel") })
    if (yes !== true) return
    const res = await fetch(`/api/email/messages/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null)
    if (!res?.ok) return setError(tt("The message was not deleted. Try again."))
    writeRows((rows) => rows.filter((r) => r.id !== id))
    go({ inbox: true }, false)
  }

  /* Opening a new message reads it. */
  const openedMessage = route.message ? ((inbox?.rows ?? []).find((r) => r.id === route.message) ?? null) : null
  React.useEffect(() => {
    if (openedMessage && !openedMessage.read_at) void markRead(openedMessage, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedMessage?.id])

  const wrap = (body: React.ReactNode) => (framed ? <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">{body}</div> : <>{body}</>)

  if (route.message) {
    return (
      <div data-forms-message={route.message}>
        <MessagePage
          message={openedMessage}
          gone={!!inbox && !loading && !openedMessage}
          onBack={() => go({ inbox: true })}
          onCopy={(email) => void navigator.clipboard?.writeText(email)}
          onToggleRead={(m) => void markRead(m, !m.read_at)}
          onReply={reply}
          onDelete={(id) => void removeMessage(id)}
          onOpenContact={(m) => {
            if (m.subscriber_id) window.location.href = contactOpenHref("subscriber", m.subscriber_id)
          }}
        />
      </div>
    )
  }
  if (route.inbox) return wrap(<MessagesInbox rows={inbox?.rows ?? []} onOpen={(m) => go({ message: m.id })} onBack={home} />)
  if (route.siteform) return wrap(<SiteFormPanel id={route.siteform} onBack={home} />)

  const selected = route.form ? forms.find((f) => f.id === route.form) || null : null
  if (selected) {
    const tabs = (
      <SegmentedPills<FormView>
        label={tt("Form")}
        value={route.view}
        onChange={(view) => go({ form: selected.id, view }, false)}
        options={[
          { value: "edit", label: tt("Edit") },
          { value: "responses", label: tt("Responses") },
          { value: "insights", label: tt("Insights") },
          { value: "settings", label: tt("Settings") },
        ]}
      />
    )
    const editorView = route.view === "edit" || route.view === "settings" ? route.view : "panel"
    return (
      <FormEditor
        key={selected.id}
        form={selected}
        framed={framed}
        view={editorView}
        nav={<div className="pt-1" data-form-tabs="">{tabs}</div>}
        usages={selected.usages}
        panel={route.view === "responses" ? <ResponsesPanel formId={selected.id} focus={route.response} quiz={(selected.published || selected.draft)?.mode === "quiz"} /> : route.view === "insights" ? <InsightsPanel formId={selected.id} /> : null}
        onBack={home}
        onSaved={(f) => setForms((all) => all.map((x) => (x.id === f.id ? { ...x, ...f } : x)))}
      />
    )
  }
  if (route.form && loading)
    return wrap(
      <section className={card}>
        <ShimmerRows rows={4} header={false} cols={["40%", "14%", "12%"]} label={tt("Loading")} />
      </section>,
    )

  const newMenu: ActionMenuItem[] = TEMPLATE_CHOICES.map((t) => ({ label: templateLabel(t.id), onClick: () => void create(t.id) }))
  const menuFor = (f: ListedForm): ActionMenuItem[] => [
    { label: tt("Edit"), onClick: () => go({ form: f.id }) },
    { label: tt("Responses"), onClick: () => go({ form: f.id, view: "responses" }) },
    { label: tt("Insights"), onClick: () => go({ form: f.id, view: "insights" }) },
    { label: tt("Settings"), onClick: () => go({ form: f.id, view: "settings" }) },
    ...(f.status === "published" ? [{ label: tt("Open public form"), href: formPath(f.id), target: "_blank" as const }] : []),
    { label: tt("Archive"), variant: "destructive" as const, separatorBefore: true, onClick: () => void archive(f) },
  ]

  const unread = (inbox?.rows ?? []).filter((m) => !m.read_at).length
  const showInbox = Boolean(inbox?.available)
  const websiteCount = siteForms.length + (showInbox ? 1 : 0)
  const counts: Record<Exclude<Filter, "all">, number> = { forms: 0, quizzes: 0, leads: 0, website: websiteCount }
  for (const f of forms) counts[filterOf(f.kind)]++
  const pills: { value: Filter; label: string; count?: number }[] = [
    { value: "all", label: tt("All") },
    ...(counts.forms ? [{ value: "forms" as const, label: tt("Forms"), count: counts.forms }] : []),
    ...(counts.quizzes ? [{ value: "quizzes" as const, label: tt("Quizzes"), count: counts.quizzes }] : []),
    ...(counts.leads ? [{ value: "leads" as const, label: tt("Lead capture"), count: counts.leads }] : []),
    ...(counts.website ? [{ value: "website" as const, label: tt("Website"), count: counts.website }] : []),
  ]
  const shown = filter === "all" ? forms : forms.filter((f) => filterOf(f.kind) === filter)
  const showWebsite = filter === "all" || filter === "website"
  const nothing = !forms.length && !websiteCount
  const usedOn = (u: FormUsage[] | undefined) => (u && u.length ? u.map(usageWords).join(" · ") : tt("Not placed on a page yet"))
  const row = "flex items-center gap-1 transition-colors duration-75 hover:bg-[#fafbfb]"
  const rowButton = "flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left"
  const responses = (n: number) => tt("{n, plural, one {# response} other {# responses}}", { n })

  return wrap(
    <div data-forms-list="">
      <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-3">
        {pills.length > 2 ? <FilterPills<Filter> label={tt("Show")} options={pills} value={filter} onChange={setFilter} /> : <span />}
        {missing ? null : (
          <ResponsiveActionMenu
            title={tt("Start from")}
            align="end"
            trigger={
              <button type="button" className={buttonAccent} disabled={busy} data-new-form="">
                <Plus className="h-4 w-4" />
                {tt("New form")}
              </button>
            }
            items={newMenu}
          />
        )}
      </div>

      <section aria-label={tt("Forms")} className={cn(card, "mt-3 overflow-hidden")}>
        {loading && !forms.length ? (
          <ShimmerRows rows={4} header={false} cols={["40%", "14%", "12%"]} label={tt("Loading")} />
        ) : (
          <>
            {missing ? (
              <div className="flex flex-col items-center px-6 py-12 text-center" data-forms-missing="">
                <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Forms are not switched on yet")}</p>
                <p className="mt-1 max-w-[420px] text-[13px] text-[#6b7280]">{tt("They need the Forms database update (SQL parts 372 and 375 in Admin › SQL updates). Everything else keeps working.")}</p>
              </div>
            ) : error && !forms.length ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Forms did not load")}</p>
                <p className="mt-1 max-w-[360px] text-[13px] text-[#6b7280]">{error}</p>
                <button type="button" className={cn(buttonSecondary, "mt-4")} onClick={() => void load()}>
                  {tt("Try again")}
                </button>
              </div>
            ) : nothing ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("No forms yet")}</p>
                <p className="mt-1 max-w-[380px] text-[13px] text-[#6b7280]">{tt("Contact forms, applications, quizzes and bookings. One form works on your OnePage, your website and your creator page.")}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {TEMPLATE_CHOICES.slice(0, 4).map((t) => (
                    <button key={t.id} type="button" className={buttonSecondary} disabled={busy} onClick={() => void create(t.id)}>
                      {templateLabel(t.id)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <ul className="divide-y divide-[#f1f2f4]">
              {shown.map((f) => (
                <li key={f.id} className={row} data-form-row={f.id}>
                  <button type="button" className={rowButton} onClick={() => go({ form: f.id })}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{f.title || tt("Untitled form")}</span>
                      <span className="block truncate text-[13px] text-[#6b7280]">
                        {kindWord(f.kind ?? "form")} · {responses(f.responses ?? 0)} · <span data-form-usage="">{usedOn(f.usages)}</span>
                      </span>
                    </span>
                    <StatusBadge tone={f.status === "published" ? "success" : "neutral"}>{f.status === "published" ? tt("Published") : tt("Draft")}</StatusBadge>
                  </button>
                  <div className="shrink-0 pr-2">
                    <ResponsiveActionMenu title={f.title || tt("Form")} align="end" trigger={<RowMenuButton label={tt("Actions for {title}", { title: f.title || tt("Untitled form") })} />} items={menuFor(f)} />
                  </div>
                </li>
              ))}
              {showWebsite && showInbox ? (
                <li className={row} data-form-row="inbox">
                  <button type="button" className={cn(rowButton, "pr-4")} onClick={() => go({ inbox: true })}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{tt("Website contact form")}</span>
                      <span className="block truncate text-[13px] text-[#6b7280]">
                        {kindWord("website")} · {tt("{n, plural, one {# message} other {# messages}}", { n: inbox?.rows.length ?? 0 })} · {tt("Your websites")}
                      </span>
                    </span>
                    {unread ? <StatusBadge tone="attention">{tt("{n} new", { n: formatNumber(unread) })}</StatusBadge> : <StatusBadge tone="success">{tt("Published")}</StatusBadge>}
                  </button>
                </li>
              ) : null}
              {showWebsite
                ? siteForms.map((f) => (
                    <li key={f.id} className={row} data-site-form-row={f.id}>
                      <button type="button" className={cn(rowButton, "pr-4")} onClick={() => go({ siteform: f.id })}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{f.name || tt("Untitled form")}</span>
                          <span className="block truncate text-[13px] text-[#6b7280]">
                            {kindWord("website")} · {responses(f.responses)} · {f.site_name ? tt("Website: {name}", { name: f.site_name }) : tt("Website")} · {when(f.created_at)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))
                : null}
            </ul>
          </>
        )}
      </section>
      {error && forms.length ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-[#b42318]">
          {error}
        </p>
      ) : null}
    </div>,
  )
}
