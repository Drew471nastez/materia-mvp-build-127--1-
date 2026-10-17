"use client"

/**
 * SETTINGS › MEMBER EMAILS (round AG).
 *
 *   Email your members   a subject and a message, sent to every active member
 *                        who keeps community emails on. One a day per
 *                        community; a preview first, then "Send to N members"
 *                        with one confirm (lib/communities/server/broadcasts.ts).
 *   Your emails          the six emails the community sends by itself, each
 *                        with the owner's own subject, heading and opening line
 *                        if they want, previewed live as members get it
 *                        (lib/communities/server/email-templates.ts).
 *
 * The composer draws at once; who it reaches, the last emails and the saved
 * words arrive from GET /api/app/community/<id>/emails a moment later.
 */
import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatDateTime } from "@/lib/i18n/format"
import { Dialog, EditorCard, Notice, buttonPrimary, buttonSecondary, errorText, field, label, send, useToast } from "./parts"
import type { CommunityHead } from "./view-types"

type Kind = "welcome" | "join_approved" | "invite" | "announcement" | "event_reminder" | "course_available"
type Words = { subject: string; heading: string; intro: string }
type Sent = { id: string; subject: string; status: "sending" | "sent" | "failed"; sentCount: number; createdAt: string; sentAt: string | null; authorName: string | null }
type Loaded = { emails: { ready: boolean; audience: number; nextAt: string | null; recent: Sent[] }; words: { ready: boolean; words: Partial<Record<Kind, Words>> } }

const KINDS: { kind: Kind; name: () => string; when: () => string }[] = [
  { kind: "welcome", name: () => tt("Welcome"), when: () => tt("When someone joins") },
  { kind: "join_approved", name: () => tt("Request approved"), when: () => tt("When you approve a request to join") },
  { kind: "invite", name: () => tt("Invite"), when: () => tt("When you invite someone by email") },
  { kind: "announcement", name: () => tt("Announcement"), when: () => tt("When you post an announcement") },
  { kind: "event_reminder", name: () => tt("Event reminder"), when: () => tt("Before an event someone is going to") },
  { kind: "course_available", name: () => tt("New course"), when: () => tt("When a course opens in the classroom") },
]

const SUBJECT_MAX = 120
const MESSAGE_MAX = 4000
const EMPTY: Words = { subject: "", heading: "", intro: "" }

export function MemberEmailsPanel({ head }: { head: CommunityHead }) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [failed, setFailed] = React.useState(false)
  const load = React.useCallback(async () => {
    const res = await send<Loaded>(`/api/app/community/${head.id}/emails`, "GET")
    if (res.ok) setLoaded(res.data)
    else setFailed(true)
  }, [head.id])
  React.useEffect(() => {
    void load()
  }, [load])
  return (
    <div className="space-y-4" data-member-emails="">
      <Broadcast head={head} loaded={loaded} onSent={(b, nextAt) => setLoaded((l) => (l ? { ...l, emails: { ...l.emails, nextAt, recent: [b, ...l.emails.recent].slice(0, 5) } } : l))} />
      <Templates head={head} loaded={loaded} onSaved={(kind, w) => setLoaded((l) => (l ? { ...l, words: { ...l.words, words: { ...l.words.words, [kind]: w } } } : l))} />
      {failed ? <Notice>{tt("Could not load your member emails. Refresh the page to try again.")}</Notice> : null}
    </div>
  )
}

/* ── Email your members ────────────────────────────────────────────────── */

function Broadcast({ head, loaded, onSent }: { head: CommunityHead; loaded: Loaded | null; onSent: (b: Sent, nextAt: string) => void }) {
  const toast = useToast()
  const [subject, setSubject] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [confirm, setConfirm] = React.useState(false)
  const [preview, setPreview] = React.useState<string | null>(null)
  const audience = loaded?.emails.audience ?? null
  const nextAt = loaded?.emails.nextAt ?? null
  const waiting = !!nextAt && Date.parse(nextAt) > Date.now()
  const ready = subject.trim().length >= 3 && message.trim().length >= 10
  const notSetUp = loaded ? !loaded.emails.ready : false

  const showPreview = async () => {
    const res = await send<{ html: string }>(`/api/app/community/${head.id}/emails/preview`, "POST", { kind: "broadcast", subject, message })
    if (!res.ok) return toast(errorText(res.data.error, tt("Could not draw the preview. Try again.")))
    setPreview(res.data.html)
  }
  const sendNow = async () => {
    setBusy(true)
    setError(null)
    const res = await send<{ broadcast: Sent; nextAt: string }>(`/api/app/community/${head.id}/emails`, "POST", { subject, message })
    setBusy(false)
    setConfirm(false)
    if (!res.ok) return setError(errorText(res.data.error, tt("Could not send that. Try again.")))
    onSent(res.data.broadcast, res.data.nextAt)
    setSubject("")
    setMessage("")
    toast(tt("Sending to your members"))
  }

  return (
    <EditorCard
      title={tt("Email your members")}
      hint={audience == null ? tt("Goes to every member who gets emails from this community.") : tt("{n, plural, =0 {No members get emails from this community yet.} one {Goes to # member who gets emails from this community.} other {Goes to # members who get emails from this community.}}", { n: audience })}
    >
      <div className="mt-4 space-y-3" data-broadcast="">
        <div>
          <label htmlFor="broadcast-subject" className={label}>
            {tt("Subject")}
          </label>
          <input id="broadcast-subject" value={subject} maxLength={SUBJECT_MAX} onChange={(e) => setSubject(e.target.value)} className={cn(field, "h-11 sm:h-10")} placeholder={tt("New lessons are up")} />
        </div>
        <div>
          <label htmlFor="broadcast-message" className={label}>
            {tt("Message")}
          </label>
          <textarea id="broadcast-message" value={message} maxLength={MESSAGE_MAX} onChange={(e) => setMessage(e.target.value)} rows={7} className={cn(field, "min-h-[150px] resize-y py-2.5 leading-relaxed")} placeholder={tt("Write to your members like you would in a post. A blank line starts a new paragraph.")} />
          <p className="mt-1 text-right text-[12px] tabular-nums text-[#9ca3af]">{`${message.length.toLocaleString()} / ${MESSAGE_MAX.toLocaleString()}`}</p>
        </div>
        {error ? <Notice>{error}</Notice> : null}
        {notSetUp ? <Notice tone="warn">{tt("Emailing members needs run-now part 217 in Supabase first.")}</Notice> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-[#6b7280]" data-broadcast-next="">
            {waiting ? tt("Your community sends one email a day. The next one can go {when}.", { when: formatDateTime(nextAt!) }) : tt("One email a day per community, so your members keep reading them.")}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" disabled={!ready} onClick={() => void showPreview()} className={cn(buttonSecondary, "h-10 flex-1 px-4 sm:h-9 sm:flex-none")}>
              {tt("Preview")}
            </button>
            <button type="button" disabled={!ready || waiting || busy || notSetUp || audience === 0} onClick={() => setConfirm(true)} className={cn(buttonPrimary, "h-10 flex-1 px-4 sm:h-9 sm:flex-none")} data-broadcast-send="">
              {tt("Send to members")}
            </button>
          </div>
        </div>
        {loaded?.emails.recent.length ? (
          <div className="mt-2 border-t border-[#f1f2f4] pt-3" data-broadcast-recent="">
            <p className="mb-1.5 text-[12.5px] font-medium text-[#6b7280]">{tt("Sent before")}</p>
            <ul className="divide-y divide-[#f4f5f6]">
              {loaded.emails.recent.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-[13.5px] text-[#1a1a2e]">{b.subject}</span>
                  <span className="shrink-0 text-[12.5px] text-[#6b7280]">
                    {b.status === "sending" ? tt("Sending") : b.status === "failed" ? tt("Not sent") : tt("{n, plural, one {# member} other {# members}}", { n: b.sentCount })}
                    {" · "}
                    {formatDateTime(b.createdAt, { month: "short", day: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={tt("Send this email?")}
        footer={
          <>
            <button type="button" onClick={() => setConfirm(false)} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
              {tt("Cancel")}
            </button>
            <button type="button" disabled={busy} onClick={() => void sendNow()} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")}>
              {busy ? tt("Sending") : tt("Send now")}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-[#4b5563]">
          {audience == null ? tt("It goes to every member who gets emails from this community.") : tt("{n, plural, one {It goes to # member now.} other {It goes to # members now.}}", { n: audience })} {tt("You can send the next one in 24 hours.")}
        </p>
      </Dialog>

      <Dialog open={preview != null} onClose={() => setPreview(null)} title={tt("Preview")} wide>
        <EmailFrame html={preview ?? ""} />
      </Dialog>
    </EditorCard>
  )
}

/* ── Your emails ───────────────────────────────────────────────────────── */

function Templates({ head, loaded, onSaved }: { head: CommunityHead; loaded: Loaded | null; onSaved: (kind: Kind, w: Words) => void }) {
  const [open, setOpen] = React.useState<Kind | null>(null)
  const words = loaded?.words.words ?? {}
  return (
    <EditorCard title={tt("Your emails")} hint={tt("Put your own words on the emails your community sends. The button and the note on why it came stay the same.")}>
      <ul className="mt-3 divide-y divide-[#f1f2f4]" data-email-templates="">
        {KINDS.map((k) => {
          const w = words[k.kind]
          const edited = !!w && (!!w.subject || !!w.heading || !!w.intro)
          return (
            <li key={k.kind}>
              <button type="button" onClick={() => setOpen(k.kind)} className="flex w-full items-center gap-3 py-3 text-left [-webkit-tap-highlight-color:transparent]" data-email-template={k.kind}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-[#1a1a2e]">{k.name()}</span>
                  <span className="block text-[12.5px] text-[#6b7280]">{k.when()}</span>
                </span>
                {edited ? <span className="shrink-0 rounded-full bg-[#f1f2f4] px-2 py-0.5 text-[11.5px] font-medium text-[#4b5563]">{tt("Your words")}</span> : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
      {loaded && !loaded.words.ready ? (
        <div className="mt-3">
          <Notice tone="warn">{tt("Saving your own words needs run-now part 217 in Supabase first.")}</Notice>
        </div>
      ) : null}
      {open ? <TemplateEditor head={head} kind={open} initial={words[open] ?? EMPTY} onClose={() => setOpen(null)} onSaved={(w) => onSaved(open, w)} /> : null}
    </EditorCard>
  )
}

function TemplateEditor({ head, kind, initial, onClose, onSaved }: { head: CommunityHead; kind: Kind; initial: Words; onClose: () => void; onSaved: (w: Words) => void }) {
  const toast = useToast()
  const [w, setW] = React.useState<Words>(initial)
  const [html, setHtml] = React.useState<string>("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const info = KINDS.find((k) => k.kind === kind)!
  /* The preview follows the typing, a moment after it stops. */
  React.useEffect(() => {
    let live = true
    const t = window.setTimeout(async () => {
      const res = await send<{ html: string }>(`/api/app/community/${head.id}/emails/preview`, "POST", { kind, ...w })
      if (live && res.ok) setHtml(res.data.html)
    }, 350)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [head.id, kind, w])
  const save = async (next: Words) => {
    setBusy(true)
    setError(null)
    const res = await send(`/api/app/community/${head.id}/emails/templates`, "PUT", { kind, ...next })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error))
    onSaved(next)
    toast(tt("Saved"))
    onClose()
  }
  const set = (k: keyof Words) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setW((v) => ({ ...v, [k]: e.target.value }))
  return (
    <Dialog
      open
      onClose={onClose}
      title={info.name()}
      wide
      footer={
        <>
          <button type="button" disabled={busy} onClick={() => void save(EMPTY)} className={cn(buttonSecondary, "mr-auto h-10 px-4 sm:h-9")}>
            {tt("Use Storelib's words")}
          </button>
          <button type="button" disabled={busy} onClick={() => void save(w)} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")}>
            {busy ? tt("Saving") : tt("Save")}
          </button>
        </>
      }
    >
      <div className="space-y-3" data-template-editor={kind}>
        <p className="text-[13px] text-[#6b7280]">{tt("Leave a field empty to keep Storelib's words. {community} and {creator} become your community's name and yours.", { community: "{community}", creator: "{creator}" })}</p>
        <div>
          <label htmlFor="tpl-subject" className={label}>
            {tt("Subject")}
          </label>
          <input id="tpl-subject" value={w.subject} maxLength={120} onChange={set("subject")} className={cn(field, "h-11 sm:h-10")} />
        </div>
        <div>
          <label htmlFor="tpl-heading" className={label}>
            {tt("Heading")}
          </label>
          <input id="tpl-heading" value={w.heading} maxLength={120} onChange={set("heading")} className={cn(field, "h-11 sm:h-10")} />
        </div>
        <div>
          <label htmlFor="tpl-intro" className={label}>
            {tt("Opening line")}
          </label>
          <textarea id="tpl-intro" value={w.intro} maxLength={600} onChange={set("intro")} rows={3} className={cn(field, "resize-y py-2.5 leading-relaxed")} />
        </div>
        {error ? <Notice>{error}</Notice> : null}
        <EmailFrame html={html} />
      </div>
    </Dialog>
  )
}

/** The email in a sandboxed frame: no scripts, no links followed, its own styles kept to itself. */
function EmailFrame({ html }: { html: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#eceef1] bg-[#f8f9fa]">
      <iframe title={tt("Email preview")} sandbox="" srcDoc={html} className={cn("block h-[440px] w-full bg-white transition-opacity duration-150", html ? "opacity-100" : "opacity-0")} />
    </div>
  )
}
