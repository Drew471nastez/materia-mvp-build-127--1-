"use client"

/**
 * CONTACT SUPPORT, IN THE HELP CENTER. What it is about first (a grid of
 * reasons), then the rest opens under it: who to reply to, a link if there is
 * one, and the message. While the message is written, the articles that
 * might already answer it are offered beside it. Sent to the team by
 * app/api/help/contact; nothing leaves the page until Send.
 */
import * as React from "react"
import { ArrowUpRight, Check, Loader2 } from "lucide-react"
import { CONTACT_REASONS, MESSAGE_MAX, MESSAGE_MIN, SUPPORT_INBOX, contactProblems, type ContactInput } from "@/lib/help/contact"
import { searchHelp, type HelpResult } from "@/lib/help/search"
import { helpArticlePath } from "@/lib/help/articles"
import { helpHref, mainSiteUrl } from "@/lib/help/paths"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { cn } from "@/lib/utils"

type Field = "reason" | "email" | "message" | "link"

const FIELD =
  "w-full rounded-xl border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:text-[14.5px]"
const WRONG = "border-[#d92d20] focus:border-[#d92d20] focus:shadow-[0_0_0_3px_rgba(217,45,32,0.1)]"
const LABEL = "mb-1.5 block text-[13px] font-medium text-[#374151]"

export function ContactForm({ initialReason }: { initialReason?: string }) {
  const physical = usePhysicalCommerceEnabled()
  const [form, setForm] = React.useState<ContactInput>({
    reason: CONTACT_REASONS.some((r) => r.id === initialReason) ? (initialReason as string) : "",
    name: "",
    email: "",
    link: "",
    message: "",
    company: "",
  })
  const [touched, setTouched] = React.useState<Partial<Record<Field, boolean>>>({})
  const [tried, setTried] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)
  const messageRef = React.useRef<HTMLTextAreaElement>(null)

  /* Signed in on storelib.com: the reply address and the name are filled in, and stay editable. */
  React.useEffect(() => {
    let live = true
    fetch(mainSiteUrl("/api/help/me"), { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { signedIn?: boolean; name?: string; email?: string | null } | null) => {
        if (!live || !me?.signedIn) return
        setForm((f) => ({ ...f, email: f.email || me.email || "", name: f.name || (me.name && me.name !== "Your account" ? me.name : "") }))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const set = <K extends keyof ContactInput>(k: K, v: ContactInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setError(null)
  }

  const problems = contactProblems(form) ?? {}
  const show = (f: Field) => (tried || touched[f]) && problems[f]
  const chosen = !!form.reason

  /* The articles that might already answer it, from what is written so far. */
  const [query, setQuery] = React.useState("")
  React.useEffect(() => {
    const t = window.setTimeout(() => setQuery(form.message.trim()), 280)
    return () => window.clearTimeout(t)
  }, [form.message])
  const suggestions: HelpResult[] = React.useMemo(() => {
    if (query.length < 12) return []
    return searchHelp(query, 3, { physical })
  }, [query, physical])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.keys(problems).length) {
      const first = (["reason", "email", "message", "link"] as Field[]).find((f) => problems[f])
      document.querySelector<HTMLElement>(`[data-contact-field="${first}"]`)?.focus()
      return
    }
    setSending(true)
    setError(null)
    try {
      const res = await fetch("/api/help/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || `It did not send. Try again, or write to ${SUPPORT_INBOX}.`)
      setSent(true)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="animate-in fade-in-0 zoom-in-[0.98] duration-300 rounded-2xl border border-[#e8eaed] bg-white px-6 py-10 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-18px_rgba(16,24,40,0.18)] sm:px-10" data-contact-sent="">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#1a1a2e] text-white shadow-[0_6px_16px_-6px_rgba(26,26,46,0.5)]">
          <Check className="h-6 w-6" strokeWidth={2.25} />
        </span>
        <h2 className="mt-5 text-[20px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">{form.name ? `Thanks, ${form.name.split(" ")[0]}. We got it.` : "Thanks. We got it."}</h2>
        <p className="mx-auto mt-2 max-w-[420px] text-[14.5px] leading-6 text-[#6b7280]">
          A real person on the team reads every message. We reply to <span className="font-medium text-[#1a1a2e]">{form.email}</span>, usually within a day.
        </p>
        <a href={helpHref("/help")} className="mt-6 inline-flex h-11 items-center rounded-xl border border-[#e3e5e8] bg-white px-4 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors hover:bg-[#f8f9fa]">
          Back to the Help Center
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-18px_rgba(16,24,40,0.18)] sm:p-7" data-contact-form="">
      {/* Bots fill every field; people never see this one. */}
      <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" value={form.company} onChange={(e) => set("company", e.target.value)} />

      <fieldset>
        <legend className="text-[15px] font-semibold text-[#1a1a2e]">What is it about?</legend>
        <div role="radiogroup" aria-label="What is it about?" className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {CONTACT_REASONS.map((r, i) => {
            const on = form.reason === r.id
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={on}
                data-contact-field={i === 0 ? "reason" : undefined}
                onClick={() => {
                  set("reason", r.id)
                  /* The rest opens under it; the cursor goes to the message once it has. */
                  if (!form.reason) window.setTimeout(() => messageRef.current?.focus({ preventScroll: true }), 320)
                }}
                className={cn(
                  "group relative flex min-h-[64px] flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left outline-none transition-[border-color,background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]",
                  on
                    ? "border-[#1a1a2e] bg-[#fafafb] shadow-[0_0_0_1px_#1a1a2e]"
                    : "border-[#e5e7eb] bg-white hover:border-[#c9cdd3] hover:bg-[#fafafb] active:bg-[#f5f6f7]",
                )}
              >
                <span className="pr-6 text-[14px] font-medium leading-5 text-[#1a1a2e]">{r.label}</span>
                <span className="mt-0.5 text-[12.5px] leading-[18px] text-[#6b7280]">{r.hint}</span>
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-3 top-3 grid h-4 w-4 place-items-center rounded-full transition-[background-color,opacity,translate,scale] duration-200",
                    on ? "scale-100 bg-[#1a1a2e] opacity-100" : "scale-75 opacity-0",
                  )}
                >
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                </span>
              </button>
            )
          })}
        </div>
        {show("reason") ? <p role="alert" className="mt-2 text-[13px] font-medium text-[#b42318]">{problems.reason}</p> : null}
      </fieldset>

      {/* The rest, opened once a reason is picked: grows in place, no jump. */}
      <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]", chosen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="min-h-0 overflow-hidden" {...(chosen ? {} : { inert: true })}>
          <div className="mt-6 grid gap-4 border-t border-[#f1f2f4] pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL}>Your name <span className="font-normal text-[#9ca3af]">(optional)</span></span>
                <input className={cn(FIELD, "h-11")} value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" maxLength={120} />
              </label>
              <label className="block">
                <span className={LABEL}>Email to reply to</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  data-contact-field="email"
                  className={cn(FIELD, "h-11", show("email") && WRONG)}
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  aria-invalid={!!show("email") || undefined}
                  placeholder="you@example.com"
                />
                {show("email") ? <span role="alert" className="mt-1.5 block text-[13px] font-medium text-[#b42318]">{problems.email}</span> : null}
              </label>
            </div>
            <label className="block">
              <span className={LABEL}>Store, product or order link <span className="font-normal text-[#9ca3af]">(optional)</span></span>
              <input
                className={cn(FIELD, "h-11", show("link") && WRONG)}
                data-contact-field="link"
                value={form.link}
                onChange={(e) => set("link", e.target.value)}
                placeholder="storelib.com/yourname or an order number"
                maxLength={500}
              />
            </label>
            <label className="block">
              <span className={LABEL}>How can we help?</span>
              <textarea
                ref={messageRef}
                data-contact-field="message"
                rows={6}
                className={cn(FIELD, "min-h-[150px] resize-y py-3 leading-6", show("message") && WRONG)}
                value={form.message}
                onChange={(e) => set("message", e.target.value.slice(0, MESSAGE_MAX))}
                onBlur={() => setTouched((t) => ({ ...t, message: true }))}
                aria-invalid={!!show("message") || undefined}
                placeholder="What happened, what you expected, and anything you already tried."
              />
              <span className="mt-1.5 flex items-start justify-between gap-3 text-[12.5px]">
                {show("message") ? <span role="alert" className="font-medium text-[#b42318]">{problems.message}</span> : <span className="text-[#9ca3af]">{form.message.trim().length < MESSAGE_MIN ? `At least ${MESSAGE_MIN} characters` : "Screenshots? Mention them and we will ask."}</span>}
                <span className="shrink-0 tabular-nums text-[#9ca3af]">{form.message.length}/{MESSAGE_MAX}</span>
              </span>
            </label>

            {/* Maybe it is already answered: offered, never in the way. */}
            <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]", suggestions.length ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
              <div className="min-h-0 overflow-hidden">
                <div className="rounded-xl border border-[#eef0f2] bg-[#fafafb] p-3" data-contact-suggestions="">
                  <p className="px-1 pb-1.5 text-[12.5px] font-medium text-[#6b7280]">These might already answer it</p>
                  <ul className="grid gap-0.5">
                    {suggestions.map((s) => (
                      <li key={helpArticlePath(s.article)}>
                        <a
                          href={helpHref(helpArticlePath(s.article))}
                          target="_blank"
                          rel="noopener"
                          className="group flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-[14px] text-[#1a1a2e] transition-colors hover:bg-white"
                        >
                          <span className="min-w-0 truncate">{s.article.title}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#9ca3af] transition-transform duration-150 group-hover:-translate-y-px group-hover:translate-x-px" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {error ? (
              <p role="alert" className="rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[13.5px] text-[#912018]">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12.5px] leading-5 text-[#9ca3af]">Sent to the Storelib team. We reply by email.</p>
              <button
                type="submit"
                disabled={sending}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-5 text-[14.5px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.12),inset_0_1px_0_rgba(255,255,255,0.08)] transition-[background-color,translate,scale] duration-150 hover:bg-[#2b2b42] active:scale-[0.98] disabled:opacity-70 sm:min-w-[150px]"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {sending ? "Sending" : "Send message"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
