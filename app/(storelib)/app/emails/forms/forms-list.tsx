"use client"

/**
 * ===========================================================================
 *  EMAILS › LEADS › FORMS
 * ===========================================================================
 * Every form the creator made, wherever it was made (a OnePage Form block, a
 * chat button's questions, or here), as one list in the /app look: the
 * title and New form in the bar, then one card with a row per form, its
 * kind, whether it is live and when it was last changed, and its actions in
 * the menu that is a dropdown on a computer and a sheet on a phone. A row
 * opens the form's builder (components/forms/forms-manager FormEditor).
 *
 * WHEN FORMS ARE NOT SET UP (SQL parts 372 and 375 not run) the card says so
 * in one sentence; nothing is retried and New form is not offered.
 */
import * as React from "react"
import { ArrowLeft, Plus } from "lucide-react"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { ShimmerRows } from "@/components/ui/shimmer"
import { FormEditor, type SavedForm } from "@/components/forms/forms-manager"
import { formsRequest } from "@/lib/forms/client"
import { formPath } from "@/lib/forms/actions"
import { TEMPLATE_CHOICES } from "@/lib/forms/templates"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import { RowMenuButton, StatusBadge, buttonAccent, buttonSecondary, card, iconButton } from "../../orders/order-parts"

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

const kindOf = (f: SavedForm) => (f.draft?.booking ? tt("Bookings") : f.draft?.mode === "quiz" ? tt("Quiz") : tt("Form"))
const edited = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }))
}

export function FormsList() {
  const [forms, setForms] = React.useState<SavedForm[]>([])
  const [loading, setLoading] = React.useState(true)
  const [missing, setMissing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [openId, setOpenId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await formsRequest<{ forms: SavedForm[] }>("/api/forms", { fallback: tt("Forms could not be loaded. Try again.") })
    setLoading(false)
    setMissing(r.missing)
    if (r.error) return setError(r.error)
    setForms(r.data?.forms ?? [])
  }, [])

  React.useEffect(() => {
    void load()
    const id = new URLSearchParams(window.location.search).get("form")
    if (id) setOpenId(id)
  }, [load])

  const open = (id: string | null) => {
    setOpenId(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("form", id)
    else url.searchParams.delete("form")
    window.history.replaceState(window.history.state, "", url)
  }

  const create = async (template: string) => {
    setBusy(true)
    setError(null)
    const r = await formsRequest<{ form: SavedForm }>("/api/forms", { method: "POST", body: JSON.stringify({ template }), fallback: tt("The form could not be created. Try again.") })
    setBusy(false)
    if (r.missing) return setMissing(true)
    if (r.error || !r.data) return setError(r.error)
    setForms((all) => [r.data!.form, ...all])
    open(r.data.form.id)
  }

  const archive = async (form: SavedForm) => {
    if (!window.confirm(tt("Archive “{title}”? It stops taking answers on every page. Its leads stay in Leads.", { title: form.title || tt("Untitled form") }))) return
    const r = await formsRequest(`/api/forms/${form.id}`, { method: "DELETE", fallback: tt("The form was not archived. Try again.") })
    if (r.error) return setError(r.error)
    setForms((all) => all.filter((f) => f.id !== form.id))
  }

  const selected = forms.find((f) => f.id === openId) || null
  if (selected) return <FormEditor key={selected.id} form={selected} onBack={() => open(null)} onSaved={(f) => setForms((all) => all.map((x) => (x.id === f.id ? { ...x, ...f } : x)))} />

  const newMenu: ActionMenuItem[] = TEMPLATE_CHOICES.map((t) => ({ label: templateLabel(t.id), onClick: () => void create(t.id) }))
  const menuFor = (f: SavedForm): ActionMenuItem[] => [
    { label: tt("Edit"), onClick: () => open(f.id) },
    { label: tt("View leads"), href: `/app/emails?tab=leads&form=${f.id}` },
    ...(f.status === "published" ? [{ label: tt("Open public form"), href: formPath(f.id), target: "_blank" as const }] : []),
    { label: tt("Archive"), variant: "destructive" as const, separatorBefore: true, onClick: () => void archive(f) },
  ]

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8" data-forms-list="">
      <header className="flex min-h-[48px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <a href="/app/emails?tab=leads" className={cn(iconButton, "-ml-1.5 h-9 w-9")} aria-label={tt("Back to leads")}>
            <ArrowLeft className="h-[18px] w-[18px]" />
          </a>
          <h1 className="truncate text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Forms")}</h1>
        </div>
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
      </header>

      <section aria-label={tt("Forms")} className={cn(card, "mt-4 overflow-hidden")}>
        {loading && !forms.length ? (
          <ShimmerRows rows={4} header={false} cols={["40%", "14%", "12%"]} label={tt("Loading")} />
        ) : missing ? (
          <div className="flex flex-col items-center px-6 py-14 text-center" data-forms-missing="">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Forms are not switched on yet")}</p>
            <p className="mt-1 max-w-[420px] text-[13px] text-[#6b7280]">{tt("They need the Forms database update (SQL parts 372 and 375 in Admin › SQL updates). Everything else keeps working.")}</p>
          </div>
        ) : error && !forms.length ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Forms did not load")}</p>
            <p className="mt-1 max-w-[360px] text-[13px] text-[#6b7280]">{error}</p>
            <button type="button" className={cn(buttonSecondary, "mt-4")} onClick={() => void load()}>
              {tt("Try again")}
            </button>
          </div>
        ) : !forms.length ? (
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
        ) : (
          <ul className="divide-y divide-[#f1f2f4]">
            {forms.map((f) => (
              <li key={f.id} className="flex items-center gap-1 transition-colors duration-75 hover:bg-[#fafbfb]" data-form-row={f.id}>
                <button type="button" className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left" onClick={() => open(f.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{f.title || tt("Untitled form")}</span>
                    <span className="block truncate text-[13px] text-[#6b7280]">
                      {kindOf(f)} · {tt("Edited {when}", { when: edited(f.updated_at) })}
                    </span>
                  </span>
                  <StatusBadge tone={f.status === "published" ? "success" : "neutral"}>{f.status === "published" ? tt("Published") : tt("Draft")}</StatusBadge>
                </button>
                <div className="shrink-0 pr-2">
                  <ResponsiveActionMenu title={f.title || tt("Form")} align="end" trigger={<RowMenuButton label={tt("Actions for {title}", { title: f.title || tt("Untitled form") })} />} items={menuFor(f)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {error && forms.length ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-[#b42318]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
