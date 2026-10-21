"use client"

/**
 * Community emails, edited here with the store's other emails. The same
 * six the community sends, and the same save as its settings
 * (PUT /api/app/community/<id>/emails/templates).
 */
import * as React from "react"
import { ChevronRight, Mail } from "lucide-react"
import { cn } from "@/lib/utils"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { Notice } from "@/components/physical/ui"
import { tt } from "@/lib/i18n/text"

type Kind = "welcome" | "join_approved" | "invite" | "announcement" | "event_reminder" | "course_available"
type Words = { subject: string; heading: string; intro: string }
interface CommunityMail {
  id: string
  name: string
  slug: string
}
interface Loaded {
  words: { ready: boolean; words: Partial<Record<Kind, Words>> }
}

const KINDS: { kind: Kind; name: string; when: string }[] = [
  { kind: "welcome", name: "Welcome", when: "When someone joins" },
  { kind: "join_approved", name: "Request approved", when: "When you approve a request to join" },
  { kind: "invite", name: "Invite", when: "When you invite someone by email" },
  { kind: "announcement", name: "Announcement", when: "When you post an announcement" },
  { kind: "event_reminder", name: "Event reminder", when: "Before an event someone is going to" },
  { kind: "course_available", name: "New course", when: "When a course opens in the classroom" },
]
const EMPTY: Words = { subject: "", heading: "", intro: "" }

async function call<T>(path: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    if (!res.ok) return { ok: false, error: data.error || tt("Could not save that. Try again.") }
    return { ok: true, data }
  } catch {
    return { ok: false, error: tt("Could not save that. Try again.") }
  }
}

export function CommunityMailList({ communities }: { communities: CommunityMail[] }) {
  const [picked, setPicked] = React.useState(communities[0]?.id ?? "")
  const community = communities.find((c) => c.id === picked) ?? communities[0]
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [open, setOpen] = React.useState<Kind | null>(null)
  React.useEffect(() => {
    if (!community) return
    let live = true
    setLoaded(null)
    void call<Loaded>(`/api/app/community/${community.id}/emails`, "GET").then((r) => {
      if (live && r.ok) setLoaded(r.data)
    })
    return () => {
      live = false
    }
  }, [community])
  if (!community) {
    return <p className="px-4 py-6 text-[14px] text-[#6b7280] sm:px-5">{tt("You don't have a community yet.")}</p>
  }
  const words = loaded?.words.words ?? {}
  return (
    <div data-community-emails="">
      {communities.length > 1 ? (
        <label className="flex items-center gap-2 px-4 pb-1 pt-3 sm:px-5">
          <span className="text-[13px] text-[#6b7280]">{tt("Community")}</span>
          <select
            value={community.id}
            onChange={(e) => setPicked(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[14px] text-[#1a1a2e] outline-none focus:border-[#9ca3af] sm:flex-none"
          >
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || tt("Community")}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <ul className="divide-y divide-[#f1f2f4] border-y border-[#f1f2f4]">
        {KINDS.map((k) => {
          const w = words[k.kind]
          const edited = !!w && (!!w.subject || !!w.heading || !!w.intro)
          return (
            <li key={k.kind}>
              <button
                type="button"
                onClick={() => setOpen(k.kind)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-100 hover:bg-[#fafafa] active:bg-[#f4f5f7] sm:px-5 [-webkit-tap-highlight-color:transparent]"
                data-community-email={k.kind}
              >
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
                  <Mail className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-[#1a1a2e]">
                    {tt(k.name)}
                    {edited ? <span className="font-normal text-[#6b7280]"> · {tt("Edited")}</span> : null}
                  </span>
                  <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{tt(k.when)}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
      {loaded && loaded.words.ready === false ? <Notice className="mx-4 mt-3">{tt("Saving your own words needs its database update first.")}</Notice> : null}
      {open ? (
        <TemplateEditor
          communityId={community.id}
          kind={open}
          initial={words[open] ?? EMPTY}
          onClose={() => setOpen(null)}
          onSaved={(next) => setLoaded((l) => (l ? { ...l, words: { ...l.words, words: { ...l.words.words, [open]: next } } } : l))}
        />
      ) : null}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{label}</span>
      <input value={value} maxLength={120} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none focus:border-[#9ca3af] sm:h-10 sm:text-[14px]" />
    </label>
  )
}

function TemplateEditor({
  communityId,
  kind,
  initial,
  onClose,
  onSaved,
}: {
  communityId: string
  kind: Kind
  initial: Words
  onClose: () => void
  onSaved: (w: Words) => void
}) {
  const phone = usePhoneWidth()
  const info = KINDS.find((k) => k.kind === kind)!
  const [w, setW] = React.useState(initial)
  const [html, setHtml] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    const t = window.setTimeout(() => {
      void call<{ html: string }>(`/api/app/community/${communityId}/emails/preview`, "POST", { kind, ...w }).then((r) => {
        if (live && r.ok) setHtml(r.data.html)
      })
    }, 280)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [communityId, kind, w])
  const save = async (next: Words) => {
    setBusy(true)
    setError(null)
    const res = await call(`/api/app/community/${communityId}/emails/templates`, "PUT", { kind, ...next })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onSaved(next)
    onClose()
  }
  return (
    <SheetDialog open onClose={onClose} phone={phone} label={tt(info.name)} sheet={{ height: "min(90dvh, 760px)" }}>
      <div className="border-b border-[#f1f2f4] px-4 py-3 sm:px-5">
        <SheetDialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">{tt(info.name)}</SheetDialogTitle>
        <p className="text-[12.5px] text-[#6b7280]">{tt(info.when)}</p>
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5" data-community-email-editor={kind}>
        <p className="text-[13px] leading-5 text-[#6b7280]">{tt("Leave a field empty to keep the standard words. {community} and {creator} become the names.")}</p>
        <Field label={tt("Subject")} value={w.subject} onChange={(v) => setW((s) => ({ ...s, subject: v }))} />
        <Field label={tt("Heading")} value={w.heading} onChange={(v) => setW((s) => ({ ...s, heading: v }))} />
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{tt("Opening line")}</span>
          <textarea value={w.intro} maxLength={600} onChange={(e) => setW((s) => ({ ...s, intro: e.target.value }))} rows={3} className="w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 text-[15px] leading-relaxed text-[#1a1a2e] outline-none focus:border-[#9ca3af] sm:text-[14px]" />
        </label>
        {error ? <Notice>{error}</Notice> : null}
        <div className="overflow-hidden rounded-xl border border-[#eceef1] bg-[#f8f9fa]">
          <iframe title={tt("Email preview")} sandbox="" srcDoc={html} className={cn("block h-[360px] w-full bg-white transition-opacity duration-150", html ? "opacity-100" : "opacity-0")} />
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button type="button" disabled={busy} onClick={() => void save(EMPTY)} className="h-10 rounded-lg px-3 text-[14px] font-medium text-[#4b5563] hover:bg-[#f4f5f7]">
            {tt("Use standard words")}
          </button>
          <button type="button" disabled={busy} onClick={() => void save(w)} className="h-10 rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-medium text-white disabled:opacity-50">
            {busy ? tt("Saving") : tt("Save")}
          </button>
        </div>
      </div>
    </SheetDialog>
  )
}
