"use client"

/**
 * ===========================================================================
 *  COOKIE CHOICES AND A REPORT, IN A OnePage's OWN SHEETS (round AS)
 * ===========================================================================
 * Loaded with the legal text, once the page is idle
 * (./onepage-legal-links loadReader), so the page itself carries none of it.
 *
 *   CookieChoices  the Cookies tab of the legal sheet: each kind of cookie
 *                  with a switch that saves as it is pressed (lib/consent
 *                  writeConsent, the same record the site's banner keeps),
 *                  Reject all and Accept all at the same weight, and the
 *                  policy one press away. In the editor's preview nothing is
 *                  written: the creator is looking at their page, not
 *                  visiting it.
 *   ReportForm     what is wrong, an email to answer, and a few words. Sent
 *                  to the team with the page's address (app/api/help/contact,
 *                  reason "report"). Checked here before it is sent and again
 *                  there; the form and the thanks share one place, so the
 *                  sheet never changes height when it is sent.
 *
 * Every colour is a --sheet-* variable (./onepage-dialog sheetTokens): the
 * page's own light or dark, never a white Storelib card over a dark page.
 */
import type React from "react"
import { useEffect, useId, useRef, useState } from "react"
import { CATEGORY_TEXT, CONSENT_VERSION, OPTIONAL, everything, type Consent, type OptionalCategory } from "@/lib/consent/consent"
import { onConsentChange, readConsent, writeConsent } from "@/lib/consent/client"
import { MESSAGE_MAX, REPORT_KINDS, REPORT_REASON, reportMessage, reportProblems } from "@/lib/help/contact"
import { isOnePagePreview } from "@/lib/onepage/preview-notice"

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"
type Choices = Record<OptionalCategory, boolean>
const fromConsent = (c: Consent | null): Choices => ({ preferences: c?.preferences ?? false, analytics: c?.analytics ?? false, marketing: c?.marketing ?? false })

/** A switch whose thumb is placed with `left` and moved by the track less the thumb and both gaps (40 - 20 - 2 - 2). */
function Switch({ on, onChange, label, disabled }: { on: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      data-cookie-switch=""
      className="relative h-6 w-10 shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sheet-bg)] disabled:opacity-50"
      style={{ background: on ? "var(--sheet-ink)" : "var(--sheet-rule)" }}
    >
      <span
        aria-hidden
        className="absolute left-[2px] top-[2px] block h-5 w-5 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
        style={{ background: on ? "var(--sheet-on-ink)" : "#ffffff", translate: on ? "16px 0" : "0 0", transition: `translate 220ms ${EASE}, background-color 200ms ${EASE}` }}
      />
    </button>
  )
}

export function CookieChoices({ onPolicy }: { onPolicy: () => void }) {
  const preview = useRef(false)
  const [choices, setChoices] = useState<Choices>(() => fromConsent(typeof document === "undefined" ? null : readConsent()))
  const [saved, setSaved] = useState(0)

  useEffect(() => {
    preview.current = isOnePagePreview()
    /* The banner, or another tab, may decide while this is open. */
    return onConsentChange((c) => setChoices(fromConsent(c)))
  }, [])

  const keep = (next: Choices) => {
    setChoices(next)
    setSaved((n) => n + 1)
    if (preview.current) return
    writeConsent({ version: CONSENT_VERSION, ...next, at: Math.floor(Date.now() / 1000) })
  }
  const all = (on: boolean) => {
    const c = everything(on, Date.now())
    setChoices(fromConsent(c))
    setSaved((n) => n + 1)
    if (!preview.current) writeConsent(c)
  }

  return (
    <div className="px-5 pb-10 pt-2 sm:px-8" data-cookie-choices-panel="">
      <p className="text-[15px] leading-relaxed text-[var(--sheet-body)]">
        Choose what this page may store on your device. A switch saves as you press it, and you can come back here at any time.
      </p>
      <ul className="mt-5 divide-y divide-[var(--sheet-rule)] rounded-2xl bg-[var(--sheet-field)] px-4">
        <li className="flex items-start gap-4 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[var(--sheet-ink)]">{CATEGORY_TEXT.necessary.title}</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--sheet-muted)]">{CATEGORY_TEXT.necessary.body}</p>
          </div>
          <span className="mt-0.5 shrink-0 text-[12.5px] font-medium text-[var(--sheet-muted)]">Always on</span>
        </li>
        {OPTIONAL.map((c) => (
          <li key={c} className="flex items-start gap-4 py-4" data-cookie-category={c}>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-[var(--sheet-ink)]">{CATEGORY_TEXT[c].title}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--sheet-muted)]">{CATEGORY_TEXT[c].body}</p>
            </div>
            <Switch on={choices[c]} label={CATEGORY_TEXT[c].title} onChange={(v) => keep({ ...choices, [c]: v })} />
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => all(false)} className="h-11 rounded-2xl border border-[var(--sheet-rule)] text-[14px] font-semibold text-[var(--sheet-ink)] transition-opacity hover:opacity-80">
          Reject all
        </button>
        <button type="button" onClick={() => all(true)} className="h-11 rounded-2xl bg-[var(--sheet-ink)] text-[14px] font-semibold text-[var(--sheet-on-ink)] transition-opacity hover:opacity-90">
          Accept all
        </button>
      </div>
      {/* Said once a choice is kept; the line is always there, so nothing below it moves. */}
      <p aria-live="polite" className="mt-3 h-5 text-center text-[13px] text-[var(--sheet-muted)]" data-cookie-saved={saved ? "" : undefined}>
        <span key={saved} style={{ opacity: saved ? 1 : 0, transition: `opacity 200ms ${EASE}` }}>{saved ? "Saved on this device" : ""}</span>
      </p>
      <button type="button" onClick={onPolicy} className="mt-4 text-[14px] font-medium text-[var(--sheet-ink)] underline decoration-[var(--sheet-rule)] underline-offset-[3px] transition-colors hover:decoration-[var(--sheet-ink)]">
        Read the cookie policy
      </button>
    </div>
  )
}

type Field = "kind" | "email" | "details"

export function ReportForm({ onClose, open }: { onClose: () => void; open: boolean }) {
  const id = useId()
  const [kind, setKind] = useState("")
  const [email, setEmail] = useState("")
  const [details, setDetails] = useState("")
  const [company, setCompany] = useState("")
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const doneButton = useRef<HTMLButtonElement>(null)
  const problems = tried ? reportProblems({ kind, email, details }) : {}

  /* Closed after it was sent: the next open is a fresh form. */
  useEffect(() => {
    if (open || !done) return
    const t = window.setTimeout(() => {
      setDone(false)
      setKind("")
      setDetails("")
      setTried(false)
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, done])
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => doneButton.current?.focus({ preventScroll: true }), 320)
    return () => window.clearTimeout(t)
  }, [done])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError("")
    const wrong = reportProblems({ kind, email, details })
    if (Object.keys(wrong).length) {
      const first = (["kind", "email", "details"] as Field[]).find((f) => wrong[f])
      document.getElementById(`${id}-${first}`)?.focus({ preventScroll: false })
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/help/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: REPORT_REASON.id, name: "", email: email.trim(), link: window.location.href.slice(0, 500), message: reportMessage(kind, details), company }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || "It did not send. Try again.")
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "It did not send. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const pane = (on: boolean): React.CSSProperties => ({
    gridArea: "1 / 1",
    opacity: on ? 1 : 0,
    translate: on ? "0 0" : done ? "0 -6px" : "0 6px",
    transition: `opacity 240ms ${EASE} ${on ? "80ms" : "0ms"}, translate 300ms ${EASE} ${on ? "80ms" : "0ms"}`,
    visibility: on ? "visible" : "hidden",
    pointerEvents: on ? "auto" : "none",
  })
  const field = "w-full rounded-2xl border bg-[var(--sheet-field)] px-4 text-[16px] text-[var(--sheet-ink)] outline-none transition-colors placeholder:text-[var(--sheet-muted)] focus:border-[var(--sheet-muted)]"
  const edge = (f: Field) => (problems[f] ? "border-[var(--sheet-error)]" : "border-transparent")
  const note = (f: Field) =>
    problems[f] ? (
      <p id={`${id}-${f}-note`} className="mt-1.5 text-[13px] text-[var(--sheet-error)]">
        {problems[f]}
      </p>
    ) : null

  return (
    <div className="grid px-5 pb-6 pt-1 sm:px-6" data-onepage-report="" data-sent={done ? "" : undefined}>
      <form onSubmit={submit} noValidate style={pane(!done)} aria-hidden={done || undefined}>
        <p className="text-[14px] leading-relaxed text-[var(--sheet-muted)]">Tell the Storelib team what is wrong with this page. Reports are read by people, and we may write back.</p>
        <fieldset className="mt-5">
          <legend className="text-[13.5px] font-medium text-[var(--sheet-ink)]">What is wrong</legend>
          <div id={`${id}-kind`} tabIndex={-1} role="radiogroup" aria-describedby={problems.kind ? `${id}-kind-note` : undefined} className="mt-2 flex flex-wrap gap-2 outline-none">
            {REPORT_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                tabIndex={done ? -1 : undefined}
                onClick={() => setKind(k.id)}
                data-report-kind={k.id}
                className="h-9 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors"
                style={kind === k.id ? { background: "var(--sheet-ink)", color: "var(--sheet-on-ink)", borderColor: "var(--sheet-ink)" } : { background: "transparent", color: "var(--sheet-ink)", borderColor: "var(--sheet-rule)" }}
              >
                {k.label}
              </button>
            ))}
          </div>
          {note("kind")}
        </fieldset>
        <label htmlFor={`${id}-email`} className="mt-5 block text-[13.5px] font-medium text-[var(--sheet-ink)]">
          Your email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={busy || done}
          tabIndex={done ? -1 : undefined}
          aria-invalid={problems.email ? true : undefined}
          aria-describedby={problems.email ? `${id}-email-note` : undefined}
          className={`mt-2 h-12 ${field} ${edge("email")}`}
        />
        {note("email")}
        <label htmlFor={`${id}-details`} className="mt-5 block text-[13.5px] font-medium text-[var(--sheet-ink)]">
          What happened
        </label>
        <textarea
          id={`${id}-details`}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          maxLength={MESSAGE_MAX - 40}
          placeholder="Where on the page, and what you saw"
          disabled={busy || done}
          tabIndex={done ? -1 : undefined}
          aria-invalid={problems.details ? true : undefined}
          aria-describedby={problems.details ? `${id}-details-note` : undefined}
          className={`mt-2 block min-h-[112px] resize-none py-3 leading-relaxed ${field} ${edge("details")}`}
        />
        {note("details")}
        {/* Nobody sees this field: anything typed in it is a bot, answered as if it went through. */}
        <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden value={company} onChange={(e) => setCompany(e.target.value)} className="absolute -left-[9999px] h-px w-px opacity-0" />
        {error ? (
          <p role="alert" className="mt-3 text-[13.5px] text-[var(--sheet-error)]">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy || done} tabIndex={done ? -1 : undefined} className="mt-5 h-12 w-full rounded-2xl bg-[var(--sheet-ink)] text-[15px] font-semibold text-[var(--sheet-on-ink)] transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? "Sending" : "Send report"}
        </button>
      </form>
      <div style={pane(done)} aria-hidden={!done || undefined} role="status" className="flex flex-col items-center justify-center text-center">
        <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-[var(--sheet-field)] text-[var(--sheet-ink)]" style={{ scale: done ? "1" : "0.6", transition: `scale 380ms cubic-bezier(0.34, 1.56, 0.64, 1) 120ms` }}>
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 10.5l3.5 3.5 7.5-8" />
          </svg>
        </span>
        <h3 className="mt-4 text-[19px] font-semibold tracking-[-0.01em] text-[var(--sheet-ink)]">Thanks, we have it</h3>
        <p className="mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-[var(--sheet-muted)]">{done ? `The team will look at this page and write to ${email.trim()} if they need more.` : " "}</p>
        <button ref={doneButton} type="button" onClick={onClose} tabIndex={done ? undefined : -1} className="mt-6 h-12 w-full rounded-2xl bg-[var(--sheet-field)] text-[15px] font-medium text-[var(--sheet-ink)] transition-opacity hover:opacity-80">
          Done
        </button>
      </div>
    </div>
  )
}
