"use client"

/**
 * ===========================================================================
 *  EMAILS › CUSTOMER EMAILS › COMMUNITIES
 * ===========================================================================
 * A community's emails to its members, managed here with the store's other
 * emails (they used to be a Member emails panel in each community's
 * settings, which now opens this: app/app/community/[id]/settings/page.tsx).
 * The same data and the same routes as before, so nothing saved moved:
 *
 *   Members, Event tickets,              the community's own subject, heading,
 *   Paid membership                      opening line and button, with the
 *                                        values each email can name
 *                                        (lib/emails/community-words.ts;
 *                                        community_email_templates, PUT
 *                                        .../emails/templates). The facts of
 *                                        a ticket or a payment stay as they are.
 *   Email your members                   the owner's own email, one a day
 *                                        (community_broadcasts, POST .../emails)
 *
 * Send test draws the email being typed and sends it to the owner's own
 * inbox (POST .../emails/test); Reset to default deletes the row.
 *
 * Every preview is the email a member gets, drawn on the server by the
 * template that sends it with the community's own name and its owner's
 * (POST /api/app/community/<id>/emails/preview, lib/communities/server/
 * email-templates.ts renderCommunityEmail). Community emails are in English,
 * as every email bought or joined on Storelib is (lib/emails/buyer-channel.ts).
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatDateTime } from "@/lib/i18n/format"
import { BTN_GHOST, BTN_PRIMARY, FIELD, Field, Notice, SaveButton, TextInput, api } from "@/components/physical/ui"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { COMMUNITY_EMAILS, GROUP_NAMES, type CustomerEmail } from "@/lib/emails/customer-list"
import { COMMUNITY_DEFAULT_WORDS, COMMUNITY_WORD_LIMITS, communityValuesFor, isCommunityWordKind, unknownCommunityValues } from "@/lib/emails/community-words"
import type { Sent } from "@/lib/emails/activity-server"
import { EmailRow, PHONE_SHEET_HEIGHT, PaneSwitch, PreviewFrame, SlidingPanes, sentLine } from "./email-parts"

export interface CommunityRef {
  id: string
  name: string
  slug: string
}

type Words = { subject: string; heading: string; intro: string; button: string; preheader: string; footer: string }
type WordField = keyof Words
type Broadcast = { id: string; subject: string; status: "sending" | "sent" | "failed"; sentCount: number; createdAt: string; sentAt: string | null; authorName: string | null }
type Loaded = { emails: { ready: boolean; audience: number; nextAt: string | null; recent: Broadcast[] }; words: { ready: boolean; words: Partial<Record<string, Partial<Words>>> } }

const EMPTY: Words = { subject: "", heading: "", intro: "", button: "", preheader: "", footer: "" }
const LIMITS = COMMUNITY_WORD_LIMITS
const WORD_FIELDS: WordField[] = ["subject", "preheader", "heading", "intro", "button", "footer"]
const SUBJECT_MAX = 120
const MESSAGE_MAX = 4000
const PHONE_SAFE = "text-[16px] sm:text-[14px]"

/** Saved words with every field there (a row from before the button reads as no button). */
const full = (w: Partial<Words> | undefined): Words => ({ subject: w?.subject ?? "", heading: w?.heading ?? "", intro: w?.intro ?? "", button: w?.button ?? "", preheader: w?.preheader ?? "", footer: w?.footer ?? "" })
const edited = (w: Partial<Words> | undefined) => !!w && (!!w.subject || !!w.heading || !!w.intro || !!w.button || !!w.preheader || !!w.footer)

/* What each community's list read, kept for the page's life: switching families or tabs and back draws it at once, read again behind it (round 28). */
const loadedKept = new Map<string, Loaded>()
const keepLoaded = (id: string, l: Loaded | null) => {
  if (l) loadedKept.set(id, l)
  return l
}

export function CommunityEmails({ community, sent, days, bare }: { community: CommunityRef; sent: Record<string, Sent> | null; days: number; bare: boolean }) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(() => loadedKept.get(community.id) ?? null)
  const [failed, setFailed] = React.useState(false)
  const [open, setOpen] = React.useState<CustomerEmail | null>(null)
  const [composing, setComposing] = React.useState(false)
  React.useEffect(() => {
    let live = true
    setLoaded(loadedKept.get(community.id) ?? null)
    setFailed(false)
    void api<Loaded>(`/api/app/community/${community.id}/emails`).then((r) => {
      if (!live) return
      if (r.ok) {
        loadedKept.set(community.id, r.data)
        setLoaded(r.data)
      } else if (!loadedKept.has(community.id)) setFailed(true)
    })
    return () => {
      live = false
    }
  }, [community.id])

  const words = loaded?.words.words ?? {}
  const last = loaded?.emails.recent[0]
  const groups = (["members", "tickets", "plans"] as const).map((g) => ({ g, rows: COMMUNITY_EMAILS.filter((e) => e.group === g) }))
  return (
    <div data-community-emails={community.id}>
      {groups.map(({ g, rows }) => (
        <section key={g} aria-labelledby={`community-emails-${g}`} data-email-group={g}>
          <h4 id={`community-emails-${g}`} className={cn("text-[12.5px] font-medium text-[#6b7280]", bare ? "px-4 pb-1.5 pt-3 sm:px-5" : "mb-1.5 mt-3")}>
            {GROUP_NAMES[g]}
          </h4>
          <ul className={cn("divide-y divide-[#f1f2f4]", bare ? "border-y border-[#f1f2f4]" : "overflow-hidden rounded-xl border border-[#eceef1]")}>
            {rows.map((e) => {
              const broadcast = e.community === "broadcast"
              const line = broadcast && last ? `${tt("Last sent {when}", { when: formatDateTime(last.createdAt, { month: "short", day: "numeric" }) })} · ${last.status === "sending" ? tt("Sending") : last.status === "failed" ? tt("Not sent") : tt("{n, plural, one {# member} other {# members}}", { n: last.sentCount })}` : sentLine(sent ? (sent[e.id] ?? { sent: 0, lastAt: null }) : null, days)
              return <EmailRow key={e.id} email={e} bare={bare} edited={!!e.community && edited(words[e.community])} sent={line} onOpen={() => (broadcast ? setComposing(true) : setOpen(e))} />
            })}
          </ul>
        </section>
      ))}
      {loaded && !loaded.words.ready ? <Notice tone="amber" className={cn("mt-3", bare && "mx-4")}>{tt("Saving your own words needs run-now part 217 in Supabase first.")}</Notice> : null}
      {failed ? <Notice className={cn("mt-3", bare && "mx-4")}>{tt("Could not load your member emails. Refresh the page to try again.")}</Notice> : null}
      <CommunityEmailSheet
        community={community}
        email={open}
        saved={open?.community && words[open.community] ? full(words[open.community]) : undefined}
        onSaved={(kind, w) => setLoaded((l) => keepLoaded(community.id, l ? { ...l, words: { ...l.words, words: { ...l.words.words, [kind]: w } } } : l))}
        onClose={() => setOpen(null)}
      />
      <BroadcastSheet
        community={community}
        open={composing}
        loaded={loaded}
        onSent={(b, nextAt) => setLoaded((l) => keepLoaded(community.id, l ? { ...l, emails: { ...l.emails, nextAt, recent: [b, ...l.emails.recent].slice(0, 5) } } : l))}
        onClose={() => setComposing(false)}
      />
    </div>
  )
}

/** The email a member gets, drawn by the server a moment after the typing stops. */
function useServerPreview(communityId: string, body: Record<string, unknown> | null) {
  const [mail, setMail] = React.useState<{ subject: string; html: string; fromName?: string | null } | null>(null)
  const key = body ? JSON.stringify(body) : ""
  React.useEffect(() => {
    if (!key) return
    let live = true
    const t = window.setTimeout(() => {
      void api<{ subject: string; html: string; fromName?: string | null }>(`/api/app/community/${communityId}/emails/preview`, { method: "POST", body: JSON.parse(key) }).then((r) => {
        if (live && r.ok) setMail({ subject: r.data.subject, html: r.data.html, fromName: r.data.fromName ?? null })
      })
    }, 280)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [communityId, key])
  return mail
}

/** One community email: its words, the values they can name, its preview as a member gets it, and a test to the owner's inbox. */
function CommunityEmailSheet({ community, email: asked, saved, onSaved, onClose }: { community: CommunityRef; email: CustomerEmail | null; saved: Words | undefined; onSaved: (kind: string, w: Words) => void; onClose: () => void }) {
  const phone = usePhoneWidth()
  /* The last email stays in the sheet while it slides away, as the store's editor keeps it. */
  const kept = React.useRef<CustomerEmail | null>(asked)
  if (asked) kept.current = asked
  const email = asked ?? kept.current
  const kind = email?.community ?? ""
  const editable = !!email?.editable && isCommunityWordKind(kind)
  const hints = isCommunityWordKind(kind) ? COMMUNITY_DEFAULT_WORDS[kind] : EMPTY
  const values = communityValuesFor(kind)
  const [draft, setDraft] = React.useState<Words>(saved ?? EMPTY)
  const [tab, setTab] = React.useState<"preview" | "edit">("preview")
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [test, setTest] = React.useState<{ state: "sending" } | { state: "sent"; to: string } | { state: "failed"; error: string } | null>(null)
  const last = React.useRef<{ field: WordField; el: HTMLInputElement | HTMLTextAreaElement } | null>(null)
  const caret = React.useRef<{ el: HTMLInputElement | HTMLTextAreaElement; at: number } | null>(null)
  React.useEffect(() => {
    if (!asked) return
    setDraft(saved ?? EMPTY)
    setTab("preview")
    setState("idle")
    setError(null)
    setTest(null)
    last.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked?.id])
  /* After a value goes in, the cursor stands right after it, in the field it went into. */
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
  /* A value the email cannot fill in is named before anything is saved, as the store's editor does. */
  const unknown = editable ? WORD_FIELDS.flatMap((f) => unknownCommunityValues(kind, draft[f]))[0] ?? null : null
  const mail = useServerPreview(community.id, asked && kind ? (editable && !unknown ? { kind, ...draft } : { kind }) : null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? EMPTY)

  const insert = (key: string) => {
    const token = `{{${key}}}`
    const at = last.current
    const field: WordField = at?.field ?? "intro"
    const value = draft[field]
    const el = at?.el
    const from = el && typeof el.selectionStart === "number" ? el.selectionStart : value.length
    const to = el && typeof el.selectionEnd === "number" ? el.selectionEnd : value.length
    const next = `${value.slice(0, from)}${token}${value.slice(to)}`.slice(0, LIMITS[field])
    if (el) caret.current = { el, at: Math.min(next.length, from + token.length) }
    setDraft((d) => ({ ...d, [field]: next }))
  }
  const remember = (field: WordField) => (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    last.current = { field, el: e.currentTarget }
  }

  /* The email as it is on screen, words being typed included, to the owner's own inbox. */
  const sendTest = async () => {
    if (!kind || test?.state === "sending") return
    setTest({ state: "sending" })
    const r = await api<{ sentTo: string }>(`/api/app/community/${community.id}/emails/test`, { method: "POST", body: { kind, ...(editable && !unknown ? draft : {}) } })
    setTest(r.ok ? { state: "sent", to: r.data.sentTo } : { state: "failed", error: r.error })
  }

  const save = async (next: Words) => {
    setState("saving")
    setError(null)
    const r = await api(`/api/app/community/${community.id}/emails/templates`, { method: "PUT", body: { kind, ...next } })
    if (!r.ok) {
      setState("idle")
      return setError(r.error)
    }
    setDraft(next)
    setState("saved")
    onSaved(kind, next)
  }
  const close = () => {
    if (editable && dirty && !window.confirm(tt("Leave without saving your changes to this email?"))) return
    onClose()
  }
  const set = (k: WordField) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((v) => ({ ...v, [k]: e.target.value }))

  const fields = editable ? (
    <div className="space-y-3.5" data-community-email-editor={kind}>
      <Field label={tt("Subject")} htmlFor="community-email-subject">
        {/* Emptied, the standard words go out: they show here as the hint. */}
        <TextInput id="community-email-subject" value={draft.subject} maxLength={LIMITS.subject} onChange={set("subject")} onFocus={remember("subject")} onSelect={remember("subject")} placeholder={hints.subject} autoComplete="off" className={PHONE_SAFE} data-email-field="subject" />
      </Field>
      <Field label={tt("Preview text")} htmlFor="community-email-preheader" hint={tt("Shown after the subject in most inboxes. Empty, the email's first line is shown.")}>
        <TextInput id="community-email-preheader" value={draft.preheader} maxLength={LIMITS.preheader} onChange={set("preheader")} onFocus={remember("preheader")} onSelect={remember("preheader")} placeholder={tt("The email's first line")} autoComplete="off" className={PHONE_SAFE} data-email-field="preheader" />
      </Field>
      <Field label={tt("Heading")} htmlFor="community-email-heading">
        <TextInput id="community-email-heading" value={draft.heading} maxLength={LIMITS.heading} onChange={set("heading")} onFocus={remember("heading")} onSelect={remember("heading")} placeholder={hints.heading} autoComplete="off" className={PHONE_SAFE} data-email-field="heading" />
      </Field>
      <Field label={tt("Opening line")} htmlFor="community-email-intro">
        <textarea id="community-email-intro" value={draft.intro} maxLength={LIMITS.intro} rows={4} onChange={set("intro")} onFocus={remember("intro")} onSelect={remember("intro")} placeholder={tt("No opening line")} className={cn(FIELD, PHONE_SAFE, "h-auto min-h-[104px] resize-y py-2.5 leading-[21px] sm:h-auto")} data-email-field="intro" />
      </Field>
      <Field label={tt("Button")} htmlFor="community-email-button">
        <TextInput id="community-email-button" value={draft.button} maxLength={LIMITS.button} onChange={set("button")} onFocus={remember("button")} onSelect={remember("button")} placeholder={hints.button} autoComplete="off" className={PHONE_SAFE} data-email-field="button" />
      </Field>
      <Field label={tt("Footer note")} htmlFor="community-email-footer" hint={tt("A line of your own at the foot of the email. The links and the note on why it came stay.")}>
        <textarea id="community-email-footer" value={draft.footer} maxLength={LIMITS.footer} rows={2} onChange={set("footer")} onFocus={remember("footer")} onSelect={remember("footer")} placeholder={tt("No footer note")} className={cn(FIELD, PHONE_SAFE, "h-auto min-h-[64px] resize-y py-2.5 leading-[21px] sm:h-auto")} data-email-field="footer" />
      </Field>
      <div>
        <p className="text-[12.5px] text-[#6b7280]">{tt("Values fill in for each member. Tap one to add it where you're typing.")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <button
              key={v.key}
              type="button"
              /* The field keeps the focus and the cursor, so the value goes where the person was typing. */
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(v.key)}
              className="h-8 rounded-full bg-[#f1f2f4] px-3 text-[12.5px] font-medium text-[#374151] transition-colors hover:bg-[#e8e9ec] active:bg-[#e2e4e8] [-webkit-tap-highlight-color:transparent]"
              data-placeholder={v.key}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {unknown ? <Notice>{tt("{value} isn't one of this email's values.", { value: `{{${unknown}}}` })}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("The facts, the link and the note on why it came stay as they are.")}</p>
    </div>
  ) : null

  const preview = (active: boolean) => (
    <div className="space-y-2.5" data-email-preview={email?.id}>
      {mail ? (
        <p className="text-[13px] text-[#6b7280]" data-email-subject="">
          <span className="font-medium text-[#374151]">{tt("Subject:")}</span> {mail.subject}
        </p>
      ) : null}
      <PreviewFrame title={tt("{value} preview", { value: email?.name ?? tt("Email") })} html={mail?.html ?? ""} paused={!active} />
      <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("As a member of {name} gets it, from {from}, in English.", { name: community.name, from: mail?.fromName || community.name })}</p>
    </div>
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

  return (
    <SheetDialog
      open={!!asked}
      onClose={close}
      phone={phone}
      label={email?.name ?? tt("Email")}
      sheet={{ height: PHONE_SHEET_HEIGHT, maxHeight: PHONE_SHEET_HEIGHT }}
      onOpenAutoFocus={(e) => e.preventDefault()}
      className="flex max-h-[min(92dvh,880px)] w-[calc(100vw-48px)] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_24px_56px_-12px_rgba(16,24,40,0.28)] outline-none focus:outline-none focus-visible:outline-none sm:max-w-[1040px]"
    >
      <div className={cn("flex min-h-0 flex-1 flex-col", phone && "h-full")} data-email-sheet={email?.id}>
        <div className="flex shrink-0 items-center gap-3 border-b border-[#f1f2f4] px-4 py-3 pr-12 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <SheetDialogTitle className="text-[16px] font-semibold leading-6 text-[#1a1a2e]">{email?.name ?? tt("Email")}</SheetDialogTitle>
            <p className="truncate text-[12.5px] text-[#6b7280]">{`${community.name} · ${email?.sentWhen ?? ""}`}</p>
          </div>
        </div>
        {phone ? (
          <>
            {editable ? <PaneSwitch tab={tab} onTab={setTab} /> : null}
            <SlidingPanes tab={editable ? tab : "preview"} preview={preview(tab === "preview" || !editable)} edit={fields} />
          </>
        ) : (
          <div className={cn("min-h-0 flex-1 overflow-y-auto lg:grid lg:overflow-hidden", editable && "lg:grid-cols-[360px_minmax(0,1fr)]")}>
            {editable ? <div className="border-b border-[#f1f2f4] px-5 py-5 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">{fields}</div> : null}
            <div className="bg-[#f8f9fa] px-5 py-5 lg:min-h-0 lg:overflow-y-auto">{preview(true)}</div>
          </div>
        )}
        {testNote ? <div className="flex shrink-0 bg-white px-4 pt-2 sm:hidden">{testNote}</div> : null}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#f1f2f4] bg-white px-4 py-3 sm:px-5" data-email-footer="">
          <div className="flex min-w-0 items-center gap-1">
            {editable ? (
              <button type="button" className={BTN_GHOST} disabled={state === "saving" || (!edited(saved) && !edited(draft))} onClick={() => void save(EMPTY)} data-email-reset="">
                {tt("Reset to default")}
              </button>
            ) : null}
            <button type="button" className={BTN_GHOST} disabled={!kind || test?.state === "sending"} onClick={() => void sendTest()} data-email-test="">
              {test?.state === "sending" ? tt("Sending") : tt("Send test")}
            </button>
            {testNote ? <span className="hidden min-w-0 sm:inline">{testNote}</span> : null}
          </div>
          {editable ? <SaveButton state={state === "saved" && !dirty ? "saved" : state === "saving" ? "saving" : "idle"} disabled={!dirty || !!unknown} onClick={() => void save(draft)} data-email-save="" /> : null}
        </div>
      </div>
    </SheetDialog>
  )
}

/** Email your members: a subject and a message, its preview as members get it, and one confirm before it goes. */
function BroadcastSheet({ community, open, loaded, onSent, onClose }: { community: CommunityRef; open: boolean; loaded: Loaded | null; onSent: (b: Broadcast, nextAt: string) => void; onClose: () => void }) {
  const phone = usePhoneWidth()
  const [subject, setSubject] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  React.useEffect(() => {
    if (open) {
      setConfirming(false)
      setError(null)
      setDone(false)
    }
  }, [open])
  const ready = subject.trim().length >= 3 && message.trim().length >= 10
  const audience = loaded?.emails.audience ?? null
  const nextAt = loaded?.emails.nextAt ?? null
  const waiting = !!nextAt && Date.parse(nextAt) > Date.now()
  const notSetUp = loaded ? !loaded.emails.ready : false
  const mail = useServerPreview(community.id, open && ready ? { kind: "broadcast", subject, message } : null)

  const sendNow = async () => {
    setBusy(true)
    setError(null)
    const r = await api<{ broadcast: Broadcast; nextAt: string }>(`/api/app/community/${community.id}/emails`, { method: "POST", body: { subject, message } })
    setBusy(false)
    setConfirming(false)
    if (!r.ok) return setError(r.error || tt("Could not send that. Try again."))
    onSent(r.data.broadcast, r.data.nextAt)
    setSubject("")
    setMessage("")
    setDone(true)
  }
  const close = () => {
    if ((subject.trim() || message.trim()) && !done && !window.confirm(tt("Leave without saving your changes to this email?"))) return
    onClose()
  }

  return (
    <SheetDialog
      open={open}
      onClose={close}
      phone={phone}
      label={tt("Email your members")}
      sheet={{ height: PHONE_SHEET_HEIGHT, maxHeight: PHONE_SHEET_HEIGHT }}
      onOpenAutoFocus={(e) => e.preventDefault()}
      className="flex max-h-[min(92dvh,880px)] w-[calc(100vw-48px)] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_24px_56px_-12px_rgba(16,24,40,0.28)] outline-none focus:outline-none focus-visible:outline-none sm:max-w-[1040px]"
    >
      <div className={cn("flex min-h-0 flex-1 flex-col", phone && "h-full")} data-broadcast-sheet="">
        <div className="shrink-0 border-b border-[#f1f2f4] px-4 py-3 pr-12 sm:px-5 sm:py-4">
          <SheetDialogTitle className="text-[16px] font-semibold leading-6 text-[#1a1a2e]">{tt("Email your members")}</SheetDialogTitle>
          <p className="truncate text-[12.5px] text-[#6b7280]">
            {audience == null ? tt("Goes to every member who gets emails from this community.") : tt("{n, plural, =0 {No members get emails from this community yet.} one {Goes to # member who gets emails from this community.} other {Goes to # members who get emails from this community.}}", { n: audience })}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:overflow-hidden">
          <div className="space-y-3.5 border-b border-[#f1f2f4] px-4 py-4 sm:px-5 sm:py-5 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r" data-broadcast="">
            <Field label={tt("Subject")} htmlFor="broadcast-subject">
              <TextInput id="broadcast-subject" value={subject} maxLength={SUBJECT_MAX} onChange={(e) => setSubject(e.target.value)} placeholder={tt("New lessons are up")} autoComplete="off" className={PHONE_SAFE} />
            </Field>
            <Field label={tt("Message")} htmlFor="broadcast-message">
              <textarea id="broadcast-message" value={message} maxLength={MESSAGE_MAX} rows={8} onChange={(e) => setMessage(e.target.value)} placeholder={tt("Write to your members like you would in a post. A blank line starts a new paragraph.")} className={cn(FIELD, PHONE_SAFE, "h-auto min-h-[160px] resize-y py-2.5 leading-[21px] sm:h-auto")} />
            </Field>
            <p className="text-right text-[12px] tabular-nums text-[#9ca3af]">{`${message.length.toLocaleString()} / ${MESSAGE_MAX.toLocaleString()}`}</p>
            {notSetUp ? <Notice tone="amber">{tt("Emailing members needs run-now part 217 in Supabase first.")}</Notice> : null}
            {error ? <Notice>{error}</Notice> : null}
            {done ? (
              <p className="text-[13px] text-[#1a1a2e]" aria-live="polite" data-broadcast-done="">
                {tt("Sending to your members")}
              </p>
            ) : null}
            {loaded?.emails.recent.length ? (
              <div className="border-t border-[#f1f2f4] pt-3" data-broadcast-recent="">
                <p className="mb-1.5 text-[12.5px] font-medium text-[#6b7280]">{tt("Sent before")}</p>
                <ul className="divide-y divide-[#f4f5f6]">
                  {loaded.emails.recent.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate text-[13.5px] text-[#1a1a2e]">{b.subject}</span>
                      <span className="shrink-0 text-[12.5px] tabular-nums text-[#6b7280]">
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
          <div className="bg-[#f8f9fa] px-4 py-4 sm:px-5 sm:py-5 lg:min-h-0 lg:overflow-y-auto">
            {mail ? (
              <div className="space-y-2.5">
                <p className="text-[13px] text-[#6b7280]">
                  <span className="font-medium text-[#374151]">{tt("Subject:")}</span> {mail.subject}
                </p>
                <PreviewFrame title={tt("Email preview")} html={mail.html} />
              </div>
            ) : (
              <p className="text-[13px] text-[#6b7280]">{tt("Write a subject and a few words to see it as your members get it.")}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-[#f1f2f4] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5" data-email-footer="">
          <p className="text-[12.5px] leading-[18px] text-[#6b7280]" data-broadcast-next="">
            {confirming
              ? `${audience == null ? tt("It goes to every member who gets emails from this community.") : tt("{n, plural, one {It goes to # member now.} other {It goes to # members now.}}", { n: audience })} ${tt("You can send the next one in 24 hours.")}`
              : waiting
                ? tt("Your community sends one email a day. The next one can go {when}.", { when: formatDateTime(nextAt!) })
                : tt("One email a day per community, so your members keep reading them.")}
          </p>
          <div className="flex shrink-0 justify-end gap-2">
            {confirming ? (
              <>
                <button type="button" className={BTN_GHOST} onClick={() => setConfirming(false)}>
                  {tt("Cancel")}
                </button>
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void sendNow()} data-broadcast-confirm="">
                  {busy ? tt("Sending") : tt("Send now")}
                </button>
              </>
            ) : (
              <button type="button" className={BTN_PRIMARY} disabled={!ready || waiting || busy || notSetUp || audience === 0} onClick={() => setConfirming(true)} data-broadcast-send="">
                {tt("Send to members")}
              </button>
            )}
          </div>
        </div>
      </div>
    </SheetDialog>
  )
}
